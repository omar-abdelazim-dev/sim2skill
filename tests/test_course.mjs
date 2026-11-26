// Course-material RAG for the physics labs: PDF text, indexing, hybrid search, resumable embedding, origin tags,
// and the rule that only physics labs see the course. Fake models only: npm test never calls Gemini.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { SyntheticEmbeddings } from '@langchain/core/utils/testing';
import { setModels } from '../server/llm/models.mjs';
import { openDb } from '../server/db.mjs';
import { extractPdfPages, indexSource, embedCourse, removeSource, courseCount, CourseRetriever, splitOrigin } from '../server/llm/course.mjs';
import { platform } from './helpers.mjs';

// A tiny hand-made one-page PDF with a line of text.
function tinyPdf(text) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
const fresh = async () => openDb(await mkdtemp(join(tmpdir(), 's2s-course-')));
const pages = [
  { page: 23, text: 'METER BRIDGE. The meter bridge works on the principle of the Wheatstone bridge. Slide the jockey until the galvanometer shows zero deflection.' },
  { page: 27, text: 'Viscosity of a liquid by Stokes method: drop a steel ball through the liquid and time its fall between two marks.' }
];

test('text is read from a PDF page by page', async () => {
  const dir = await mkdtemp(join(tmpdir(), 's2s-pdf-')), file = join(dir, 'x.pdf');
  await writeFile(file, tinyPdf('Ohm law states V equals I times R'));
  const out = await extractPdfPages(file);
  assert.equal(out.length, 1);
  assert.equal(out[0].page, 1);
  assert.match(out[0].text, /Ohm law states V equals I times R/);
});

test('indexing is incremental and keyword search finds the right page', async () => {
  const db = await fresh();
  const a = await indexSource(db, 'Lab manual', pages);
  assert.equal(a.added, a.chunks); assert.ok(a.chunks >= 2);
  const again = await indexSource(db, 'Lab manual', pages);
  assert.equal(again.added, 0, 'unchanged chunks are not added twice');
  const hits = await new CourseRetriever({ db }).invoke('How does the meter bridge find a null point with the jockey?');
  assert.equal(hits[0].metadata.page, 23);
  assert.equal(hits[0].metadata.source, 'Lab manual');
  const edited = await indexSource(db, 'Lab manual', [pages[0]]);
  assert.ok(edited.removed >= 1, 'chunks that left the PDF are removed');
  assert.equal(removeSource(db, 'Lab manual') >= 1, true);
  assert.equal(courseCount(db), 0);
});

test('embedding resumes after a rate limit and stops cleanly on the daily quota', async () => {
  const db = await fresh();
  await indexSource(db, 'Lab manual', pages);
  const base = new SyntheticEmbeddings({ vectorSize: 16 });
  let n = 0; const waits = [];
  setModels({ embeddings: { embedDocuments: async t => { if (++n === 1) throw Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 }); return base.embedDocuments(t); }, embedQuery: t => base.embedQuery(t) } });
  try {
    const r = await embedCourse(db, { batch: 1, pauseMs: 0, waitMs: 5, sleep: ms => { waits.push(ms); return Promise.resolve(); } });
    assert.equal(r.remaining, 0);
    assert.ok(waits.includes(5), 'waited after the 429');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM course_chunks WHERE embedding IS NULL').n, 0);
    // vectors now join the keyword search
    assert.ok((await new CourseRetriever({ db }).invoke('stokes steel ball falling liquid')).some(d => d.metadata.page === 27));
    await indexSource(db, 'Textbook', [{ page: 1, text: 'Resistivity is a property of the material of a conductor, measured in ohm metres.' }]);
    setModels({ embeddings: { embedDocuments: async () => { throw new Error('Quota exceeded: GenerateRequestsPerDayPerProjectPerModel'); }, embedQuery: t => base.embedQuery(t) } });
    const q = await embedCourse(db, { pauseMs: 0, sleep: () => Promise.resolve() });
    assert.equal(q.reason, 'daily-quota');
    assert.ok(q.remaining >= 1);
  } finally { setModels(null); }
});

test('origin tags become a course badge, a general-knowledge badge or nothing', () => {
  const docs = [{ metadata: { source: 'Manual', page: 23 } }, { metadata: { source: 'Manual', page: 24 } }, { metadata: { source: 'Book', page: 5 } }];
  const c = splitOrigin('ORIGIN: COURSE 1,3\nThe meter bridge balances at the null point.', docs);
  assert.equal(c.text, 'The meter bridge balances at the null point.');
  assert.deepEqual(c.course, { origin: 'course', sources: [{ source: 'Manual', page: 23 }, { source: 'Book', page: 5 }] });
  assert.equal(splitOrigin('ORIGIN: COURSE\nText', docs).course.sources.length, 3, 'no numbers: the top passages');
  assert.deepEqual(splitOrigin('ORIGIN: COURSE 9\nText', docs).course.sources.length, 3, 'unknown numbers fall back too');
  assert.deepEqual(splitOrigin('**ORIGIN: GENERAL**\nNobel prizes are announced in October.', docs), { text: 'Nobel prizes are announced in October.', course: { origin: 'general', sources: [] } });
  assert.deepEqual(splitOrigin('ORIGIN: BENCH\nYour LED is reversed.', docs), { text: 'Your LED is reversed.', course: null });
  assert.deepEqual(splitOrigin('No tag at all.', docs), { text: 'No tag at all.', course: null });
});

test('Nour reads the course only inside physics labs', async () => {
  let seen = null, reply = 'ORIGIN: COURSE 1\nThe meter bridge uses the Wheatstone balance.';
  setModels({
    chat: RunnableLambda.from(prompt => { seen = prompt.toChatMessages(); return new AIMessage({ content: [{ type: 'text', text: reply }] }); }),
    embeddings: new SyntheticEmbeddings({ vectorSize: 16 })
  });
  const p = await platform();
  try {
    const u = await p.signup('Student'), msg = text => [{ role: 'user', content: text }];
    const ask = (labId, text) => p.request('nour', 'POST', { kind: 'lab', labId, messages: msg(text) }, u.cookie);

    let r = await ask('led', 'What is the principle of the meter bridge?');
    assert.equal(r.status, 200);
    assert.doesNotMatch(seen[0].content, /COURSE_MATERIAL/, 'nothing is indexed yet: the answer works as before');
    assert.equal(r.data.course, undefined);

    const db = openDb(p.dir);
    await indexSource(db, 'PHY212 Lab Manual', pages);
    r = await ask('led', 'What is the principle of the meter bridge?');
    assert.match(seen[0].content, /<<<COURSE_MATERIAL/);
    assert.match(seen[0].content, /PHY212 Lab Manual, page 23/);
    assert.match(seen[0].content, /ORIGIN: GENERAL/);
    assert.equal(r.data.text, 'The meter bridge uses the Wheatstone balance.');
    assert.equal(r.data.course.origin, 'course');
    assert.equal(r.data.course.sources[0].source, 'PHY212 Lab Manual');

    reply = 'ORIGIN: GENERAL\nThe 2020 prize went to Penrose, Genzel and Ghez.';
    r = await ask('ohm', 'Who won the Nobel prize in physics in 2020?');
    assert.deepEqual(r.data.course, { origin: 'general', sources: [] });

    reply = 'Chemistry answer with no tag.';
    r = await ask('titration', 'What is the principle of the meter bridge?');
    assert.equal(r.status, 200);
    assert.doesNotMatch(seen[0].content, /COURSE_MATERIAL/, 'chemistry labs never get the physics course');
    assert.equal(r.data.course, undefined);
    r = await p.request('nour', 'POST', { kind: 'home', messages: msg('meter bridge?') }, u.cookie);
    assert.doesNotMatch(seen[0].content, /COURSE_MATERIAL/, 'the home chat does not use it either');
  } finally { setModels(null); await p.close(); }
});
