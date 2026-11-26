// RAG evaluation: a small golden set per subject (with Arabic questions).
// Offline (default): keyword search only, no network. Reports recall@k.
// LIVE_EVAL=1 with GEMINI_API_KEY set: hybrid retrieval with real embeddings, plus Nour's answers,
// reporting the share of answers that name a retrieved source lab.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformHandler } from '../server/platform.mjs';
import { openDb } from '../server/db.mjs';
import { LabRetriever } from '../server/llm/retriever.mjs';
import { createNourChain } from '../server/llm/chains.mjs';
import { setModels } from '../server/llm/models.mjs';
import { embedPending } from '../server/llm/rag.mjs';

const live = process.env.LIVE_EVAL === '1' && !!process.env.GEMINI_API_KEY;
if (!live) { setModels({}); } // no chat model and no embeddings: FTS only

const GOLDEN = [
  { subject: 'physics', q: 'What is a milliamp?', lab: 'ohm' },
  { subject: 'physics', q: 'Why does an LED need a resistor?', lab: 'led' },
  { subject: 'physics', q: 'What is a time constant for a capacitor?', lab: 'rc' },
  { subject: 'physics', q: 'How do two resistors share current in parallel branches?', lab: 'parallel' },
  { subject: 'physics', q: 'لماذا يحتاج الـ LED إلى مقاومة؟', lab: 'led', lang: 'ar' },
  { subject: 'physics', q: 'ما هو ثابت الزمن للمكثف؟', lab: 'rc', lang: 'ar' },
  { subject: 'chemistry', q: 'How do I choose an indicator for a vinegar titration with sodium hydroxide?', lab: 'titration' },
  { subject: 'chemistry', q: 'How do I find the activation energy from rate constants at different temperatures?', lab: 'kinetics' },
  { subject: 'chemistry', q: 'Which plot is linear for a first order reaction?', lab: 'kinetics' },
  { subject: 'chemistry', q: 'كيف أختار الدليل في معايرة الخل؟', lab: 'titration', lang: 'ar' }
];
const K = 5;

const dir = await mkdtemp(join(tmpdir(), 's2s-rageval-'));
await createPlatformHandler(dir);
const db = openDb(dir);
if (live) await embedPending(db);
const retriever = new LabRetriever({ db, k: K });
const chain = live ? createNourChain(db) : null;

const rows = [];
for (const g of GOLDEN) {
  const docs = await retriever.invoke(g.q, { configurable: { viewerId: '' } });
  const hit = docs.some(d => d.metadata.lab_id === g.lab);
  let cited = null;
  if (chain) {
    const r = await chain.invoke({ kind: 'home', messages: [{ role: 'user', content: g.q }] }, { configurable: { viewer: null, viewerId: '' } });
    cited = r.sources.some(s => r.text.includes(s.title));
  }
  rows.push({ ...g, hit, cited });
}
const by = s => rows.filter(r => s === 'all' || r.subject === s || r.lang === s);
const pct = (n, d) => d ? Math.round(100 * n / d) + '%' : 'n/a';
console.log(`RAG eval (${live ? 'live: hybrid retrieval + Gemini' : 'offline: keyword search only'}), recall@${K}`);
for (const s of ['physics', 'chemistry', 'ar', 'all']) {
  const r = by(s);
  console.log(`  ${s.padEnd(10)} ${pct(r.filter(x => x.hit).length, r.length)} of ${r.length}${live ? `, answers citing a source: ${pct(r.filter(x => x.cited).length, r.length)}` : ''}`);
}
for (const r of rows.filter(x => !x.hit)) console.log('  miss:', r.q);
db.close();
await rm(dir, { recursive: true, force: true });
