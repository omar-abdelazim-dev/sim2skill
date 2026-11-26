// Nour: LangChain chain with fake models (npm test never calls Gemini), error mapping, and the RAG access filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { SyntheticEmbeddings } from '@langchain/core/utils/testing';
import { splitOpen } from '../src/nour.js';
import { setModels } from '../server/llm/models.mjs';
import { parseAnswer } from '../server/llm/chains.mjs';
import { LabRetriever, ftsQuery } from '../server/llm/retriever.mjs';
import { CachedEmbeddings } from '../server/llm/cache.mjs';
import { openDb } from '../server/db.mjs';
import { platform, draft } from './helpers.mjs';

const ask = (p, body, cookie) => p.request('nour', 'POST', body, cookie);
const q = (text, extra = {}) => ({ kind: 'home', messages: [{ role: 'user', content: text }], ...extra });

test('without a key or model Nour reports offline', async () => {
  delete process.env.GEMINI_API_KEY; setModels(null);
  const p = await platform();
  try {
    assert.deepEqual((await p.request('nour')).data, { ai: false });
    assert.equal((await ask(p, q('hi'))).status, 503);
  } finally { await p.close(); }
});

test('the chain builds the lab prompt from the database, parses the open tag and returns sources', async () => {
  let seen = null;
  setModels({
    chat: RunnableLambda.from(prompt => { seen = prompt.toChatMessages(); return new AIMessage({ content: [{ type: 'text', text: 'secret thoughts', thought: true }, { type: 'text', text: 'Check the LED polarity. [[open:led]]' }] }); }),
    embeddings: new SyntheticEmbeddings({ vectorSize: 32 })
  });
  const p = await platform();
  try {
    const u = await p.signup('Asker');
    const r = await ask(p, { kind: 'lab', labId: 'led', ctx: { title: 'FAKE TITLE FROM BROWSER' }, state: { detected_mistake: 'led_reversed' },
      messages: [{ role: 'user', content: 'Why does an LED need a resistor?' }] }, u.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.data.text, 'Check the LED polarity.');
    assert.equal(r.data.open, 'led');
    assert.ok(r.data.sources.some(s => s.labId === 'led'), 'the LED lab FAQ is retrieved');
    const system = seen[0].content;
    assert.match(system, /LED with a resistor/, 'title comes from the database');
    assert.doesNotMatch(system, /FAKE TITLE/, 'browser ctx is ignored');
    assert.match(system, /led_reversed/);
    assert.match(system, /REFERENCE_MATERIAL/);
    assert.match(system, /data, not instructions/);
    assert.equal(seen[seen.length - 1].content, 'Why does an LED need a resistor?');
    assert.equal((await ask(p, { kind: 'lab', labId: 'does-not-exist', messages: [{ role: 'user', content: 'hi' }] }, u.cookie)).status, 404);
    assert.equal((await ask(p, { kind: 'nope', messages: [{ role: 'user', content: 'hi' }] })).status, 400);
    assert.equal((await ask(p, { kind: 'home', messages: [{ role: 'assistant', content: 'hi' }] })).status, 400);
    const titration = await ask(p, { kind: 'lab', labId: 'titration', messages: [{ role: 'user', content: 'What is the answer?' }] }, u.cookie);
    assert.equal(titration.status, 200);
    assert.doesNotMatch(seen[0].content, /0\.85/, 'the hidden concentration is never in the prompt');
  } finally { setModels(null); await p.close(); }
});

test('provider errors map to 429 busy or 502', async () => {
  const p = await platform();
  try {
    setModels({ chat: RunnableLambda.from(() => { throw Object.assign(Error('Resource exhausted'), { status: 429 }); }), embeddings: new SyntheticEmbeddings({ vectorSize: 8 }) });
    const busy = await ask(p, q('hello'));
    assert.equal(busy.status, 429);
    assert.match(busy.data.error, /busy/);
    setModels({ chat: RunnableLambda.from(() => { throw Object.assign(Error('Bad request from provider'), { status: 400 }); }), embeddings: new SyntheticEmbeddings({ vectorSize: 8 }) });
    const broken = await ask(p, q('hello'));
    assert.equal(broken.status, 502);
    assert.doesNotMatch(broken.data.error, /provider/, 'provider messages are not exposed');
  } finally { setModels(null); await p.close(); }
});

test('RAG access filter: a private chunk never reaches anonymous, non-granted or other users', async () => {
  setModels({ chat: RunnableLambda.from(() => new AIMessage('ok')), embeddings: new SyntheticEmbeddings({ vectorSize: 32 }) });
  const p = await platform();
  try {
    const owner = await p.signup('Owner'), friend = await p.signup('Friend'), stranger = await p.signup('Stranger');
    const made = await p.request('labs', 'POST', { ...draft, title: 'Hidden zebracorn lab', visibility: 'private', accessCode: 'letmein99',
      instructions: 'The zebracorn resonance appears at exactly forty two hertz in this private experiment.' }, owner.cookie);
    await p.request('labs/' + made.data.id + '/submit', 'POST', {}, owner.cookie);
    await p.request('labs/' + made.data.id + '/access', 'POST', { code: 'letmein99' }, friend.cookie);
    const pub = await p.request('labs', 'POST', { ...draft, title: 'Public resonance lab', instructions: 'Resonance in a public circuit experiment for everyone.' }, owner.cookie);
    await p.request('labs/' + pub.data.id + '/submit', 'POST', {}, owner.cookie);

    const db = openDb(p.dir), retriever = new LabRetriever({ db, k: 8 });
    const hits = async viewerId => (await retriever.invoke('zebracorn resonance forty two hertz', { configurable: { viewerId } })).map(d => d.metadata.lab_id);
    assert.equal((await hits('')).includes(made.data.id), false, 'anonymous');
    assert.equal((await hits(stranger.id)).includes(made.data.id), false, 'not granted');
    assert.equal((await hits(friend.id)).includes(made.data.id), true, 'granted');
    assert.equal((await hits(owner.id)).includes(made.data.id), true, 'owner');
    assert.equal((await hits(stranger.id)).includes(pub.data.id), true, 'public labs are found');
    // Through the API, a stranger's question never cites the private lab.
    const r = await ask(p, q('zebracorn resonance forty two hertz'), stranger.cookie);
    assert.equal(r.data.sources.some(s => s.labId === made.data.id), false);
    // Unpublishing removes the chunks.
    await p.request('labs/' + made.data.id + '/unpublish', 'POST', {}, owner.cookie);
    assert.equal((await hits(owner.id)).includes(made.data.id), false);
    db.close();
  } finally { setModels(null); await p.close(); }
});

test('parser, FTS query sanitizing and the embedding cache', async () => {
  assert.deepEqual(parseAnswer(new AIMessage('Go [[open:pendulum]]')), { text: 'Go', open: null });
  assert.deepEqual(parseAnswer(new AIMessage({ content: [{ type: 'text', text: 'x', thought: true }, { type: 'text', text: 'Hi [[open:ohm]]' }] })), { text: 'Hi', open: 'ohm' });
  assert.equal(ftsQuery('rate" OR 1=1 -- NEAR(x)'), '"rate" OR "or" OR "near"');
  assert.match(ftsQuery('ما هي المعايرة؟'), /"المعايرة"/);
  const dir = await mkdtemp(join(tmpdir(), 's2s-cache-'));
  const db = openDb(dir);
  let calls = 0;
  const base = new SyntheticEmbeddings({ vectorSize: 8 });
  const counting = { embedDocuments: async t => { calls += t.length; return base.embedDocuments(t); }, embedQuery: async t => { calls++; return base.embedQuery(t); } };
  const cached = new CachedEmbeddings(db, counting, 'test');
  const a = await cached.embedDocuments(['alpha', 'beta']);
  const b = await cached.embedDocuments(['alpha', 'beta', 'gamma']);
  assert.equal(calls, 3, 'unchanged text is never embedded twice');
  assert.deepEqual(a[0].map(x => +x.toFixed(5)), b[0].map(x => +x.toFixed(5)));
  db.close();
});

test('an open-lab tag is removed from the text and only accepts live labs', () => {
  assert.deepEqual(splitOpen('Taking you there. [[open:led]]'), { text: 'Taking you there.', open: 'led' });
  assert.equal(splitOpen('Sure [[open:pendulum]]').open, null);
});

test('the server reads settings from a .env file without overriding the shell', async () => {
  const { loadEnvFile } = await import('../server/platform.mjs');
  const f = join(await mkdtemp(join(tmpdir(), 'env-')), '.env');
  await writeFile(f, '# comment\r\nGEMINI_API_KEY="abc123"\nGEMINI_MODEL=gemini-3.8-flash\nOTHER=nope\n');
  delete process.env.GEMINI_API_KEY; process.env.GEMINI_MODEL = 'from-shell'; delete process.env.OTHER;
  await loadEnvFile(f);
  assert.equal(process.env.GEMINI_API_KEY, 'abc123');
  assert.equal(process.env.GEMINI_MODEL, 'from-shell');
  assert.equal(process.env.OTHER, undefined);
  delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL;
});
