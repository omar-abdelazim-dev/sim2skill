// RAG ingestion: chunk a published lab version's teaching text, embed it, and store it with access metadata.
// Embeddings happen only here (at publish time) and for questions; the cache avoids repeats.
import { createHash } from 'node:crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import CORE from '../../src/lab/core.js';
import { engineFor } from '../../shared/engines/index.js';
import { embeddings } from './models.mjs';

// About 300–800 tokens per chunk at roughly 4 characters per token, with a small overlap.
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 200 });
const arabic = /[؀-ۿ]/;

export async function labDocuments(lab) {
  const subject = engineFor(lab.engine).subject;
  const config = lab.config ? JSON.parse(lab.config) : undefined;
  let goal = '';
  try { goal = engineFor(lab.engine).goal(lab.template, config); } catch { goal = ''; }
  const sections = [
    ['description', lab.description], ['outcomes', lab.outcomes], ['instructions', lab.instructions], ['goal', goal],
    ...(lab.builtin && CORE.EXPERIMENTS[lab.template]?.asks ? [['faq', CORE.EXPERIMENTS[lab.template].asks.map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')]] : [])
  ].filter(([, t]) => t && t.trim().length > 5);
  const docs = [];
  for (const [section, text] of sections) {
    for (const chunk of await splitter.splitText(text)) {
      docs.push(new Document({
        pageContent: chunk,
        metadata: { lab_id: lab.id, lab_version: lab.version, visibility: lab.visibility, owner_id: lab.author_id, subject,
          level: 'university', lang: arabic.test(chunk) ? 'ar' : 'en', section, title: lab.title }
      }));
    }
  }
  return docs;
}

export async function indexLab(db, lab, { embed = true } = {}) {
  if (!lab || lab.status !== 'published' || lab.taken_down) return removeLabFromIndex(db, lab?.id);
  const docs = await labDocuments(lab);
  db.tx(() => {
    db.run('DELETE FROM rag_chunks WHERE lab_id = ?', lab.id); // superseded versions go away
    for (const d of docs) {
      const m = d.metadata;
      db.run(`INSERT INTO rag_chunks (lab_id, lab_version, visibility, owner_id, subject, level, lang, section, title, text, content_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, m.lab_id, m.lab_version, m.visibility, m.owner_id, m.subject, m.level, m.lang, m.section, m.title,
        d.pageContent, createHash('sha256').update(d.pageContent).digest('hex'));
    }
  });
  if (embed) await embedPending(db, lab.id);
  return docs.length;
}

// Fill missing vectors. Without a key, or if the provider fails, the index stays FTS-only.
export async function embedPending(db, labId) {
  const model = embeddings(db, 'document');
  if (!model) return 0;
  const rows = labId ? db.all('SELECT id, text FROM rag_chunks WHERE lab_id = ? AND embedding IS NULL', labId)
    : db.all('SELECT id, text FROM rag_chunks WHERE embedding IS NULL LIMIT 500');
  if (!rows.length) return 0;
  try {
    const vectors = await model.embedDocuments(rows.map(r => r.text));
    db.tx(() => rows.forEach((r, i) => db.run('UPDATE rag_chunks SET embedding = ? WHERE id = ?', Buffer.from(new Float32Array(vectors[i]).buffer), r.id)));
    return rows.length;
  } catch (e) {
    console.error('Embedding failed; Nour will use keyword search only:', e?.message);
    return 0;
  }
}

export function removeLabFromIndex(db, labId) {
  if (labId) db.run('DELETE FROM rag_chunks WHERE lab_id = ?', labId);
  return 0;
}

// Index every published lab that has no chunks yet (built-ins on a fresh database, imported labs).
export async function indexMissing(db) {
  const labs = db.all(`SELECT * FROM labs WHERE status = 'published' AND taken_down = 0 AND NOT EXISTS (SELECT 1 FROM rag_chunks c WHERE c.lab_id = labs.id)`);
  for (const l of labs) await indexLab(db, l, { embed: false });
  // Vectors are filled in the background so startup never waits on the network.
  embedPending(db).catch(() => {});
  return labs.length;
}
