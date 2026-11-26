// Embedding cache keyed by content hash, so unchanged text is never embedded twice.
// LangChain v1 moved CacheBackedEmbeddings into @langchain/classic, which would also pull in
// @langchain/openai; this is the same pattern built on @langchain/core's BaseStore and Embeddings.
import { createHash } from 'node:crypto';
import { BaseStore } from '@langchain/core/stores';
import { Embeddings } from '@langchain/core/embeddings';

// LangChain store interface over the embed_cache table (values are Float32 vectors).
export class SqliteEmbeddingStore extends BaseStore {
  lc_namespace = ['sim2skill', 'stores'];
  constructor(db) { super(); this.db = db; }
  async mget(keys) {
    return keys.map(k => {
      const row = this.db.get('SELECT value FROM embed_cache WHERE key = ?', k);
      return row ? Array.from(new Float32Array(new Uint8Array(row.value).buffer)) : undefined;
    });
  }
  async mset(pairs) {
    const now = new Date().toISOString();
    this.db.tx(() => pairs.forEach(([k, v]) => this.db.run('INSERT OR REPLACE INTO embed_cache (key, value, created_at) VALUES (?, ?, ?)', k, Buffer.from(new Float32Array(v).buffer), now)));
  }
  async mdelete(keys) { this.db.tx(() => keys.forEach(k => this.db.run('DELETE FROM embed_cache WHERE key = ?', k))); }
  async *yieldKeys(prefix = '') {
    for (const r of this.db.all('SELECT key FROM embed_cache WHERE key LIKE ?', prefix + '%')) yield r.key;
  }
}

export class CachedEmbeddings extends Embeddings {
  constructor(db, underlying, namespace) {
    super({});
    this.underlying = underlying;
    this.namespace = namespace;
    this.store = new SqliteEmbeddingStore(db);
  }
  key(text) { return createHash('sha256').update(this.namespace + '\u0000' + text).digest('hex'); }
  async embedDocuments(texts) {
    const keys = texts.map(t => this.key(t));
    const found = await this.store.mget(keys);
    const missing = found.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    if (missing.length) {
      // Batched: one request per 100 texts (the provider batches inside embedDocuments).
      const vectors = await this.underlying.embedDocuments(missing.map(i => texts[i]));
      await this.store.mset(missing.map((i, j) => [keys[i], vectors[j]]));
      missing.forEach((i, j) => { found[i] = vectors[j]; });
    }
    return found;
  }
  async embedQuery(text) {
    const [cached] = await this.store.mget([this.key(text)]);
    if (cached) return cached;
    const v = await this.underlying.embedQuery(text);
    await this.store.mset([[this.key(text), v]]);
    return v;
  }
}
