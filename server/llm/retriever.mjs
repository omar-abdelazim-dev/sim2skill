// Hybrid retriever over SQLite: FTS5 keyword search plus brute-force cosine similarity on stored vectors,
// merged with reciprocal rank fusion. The access rule is applied INSIDE both SQL queries, before scoring,
// so a private chunk is unreachable for anyone who is not its owner and has no grant.
import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { embeddings } from './models.mjs';

const ACL = `c.lab_id IN (SELECT l.id FROM labs l WHERE l.taken_down = 0 AND l.status = 'published' AND l.version = c.lab_version AND (
  l.visibility = 'public' OR l.author_id = :viewer
  OR EXISTS (SELECT 1 FROM lab_grants g WHERE g.lab_id = l.id AND g.user_id = :viewer)))`;

// Turn free text into a safe FTS5 query: quoted terms joined with OR (no operators from users).
export function ftsQuery(text) {
  const terms = String(text).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || [];
  return [...new Set(terms)].slice(0, 24).map(t => `"${t}"`).join(' OR ');
}

export const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na * nb) || 1);
};

export class LabRetriever extends BaseRetriever {
  lc_namespace = ['sim2skill', 'retrievers'];
  constructor({ db, k = 6 }) { super({}); this.db = db; this.k = k; }

  // The current user arrives through the runnable config (`configurable.viewerId`), never through the prompt.
  async invoke(input, options = {}) {
    const query = typeof input === 'string' ? input : input?.query;
    return this.search(query, { viewerId: options?.configurable?.viewerId || '', labId: options?.configurable?.labId || null });
  }
  async _getRelevantDocuments(query) { return this.search(query, { viewerId: '' }); }

  async search(query, { viewerId = '', labId = null } = {}) {
    const db = this.db, params = { viewer: viewerId };
    const ranked = [];
    const fts = ftsQuery(query);
    if (fts) {
      ranked.push(db.all(`SELECT c.id FROM rag_fts JOIN rag_chunks c ON c.id = rag_fts.rowid
                          WHERE rag_fts MATCH :q AND ${ACL} ORDER BY bm25(rag_fts) LIMIT 20`, { ...params, q: fts }).map(r => r.id));
    }
    const model = embeddings(db, 'query');
    if (model) {
      try {
        const qv = await model.embedQuery(query);
        const rows = db.all(`SELECT c.id, c.embedding FROM rag_chunks c WHERE c.embedding IS NOT NULL AND ${ACL}`, params);
        ranked.push(rows.map(r => ({ id: r.id, s: cosine(qv, new Float32Array(new Uint8Array(r.embedding).buffer)) }))
          .sort((a, b) => b.s - a.s).slice(0, 20).map(r => r.id));
      } catch (e) { /* FTS-only fallback */ }
    }
    // Reciprocal rank fusion; chunks from the lab the student is in get a small boost.
    const score = new Map();
    for (const list of ranked) list.forEach((id, i) => score.set(id, (score.get(id) || 0) + 1 / (60 + i + 1)));
    if (!score.size) return [];
    const rows = db.all(`SELECT c.* FROM rag_chunks c WHERE c.id IN (${[...score.keys()].map(() => '?').join(',')})`, ...score.keys());
    return rows
      .map(r => ({ r, s: score.get(r.id) + (r.lab_id === labId ? 0.005 : 0) }))
      .sort((a, b) => b.s - a.s).slice(0, this.k)
      .map(({ r }) => new Document({ pageContent: r.text, metadata: { chunk_id: r.id, lab_id: r.lab_id, lab_version: r.lab_version, title: r.title, section: r.section, subject: r.subject, lang: r.lang } }));
  }
}
