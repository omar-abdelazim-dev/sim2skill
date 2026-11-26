-- Phase 8: RAG index for Nour. Chunks carry the lab's access metadata; the retriever filters by it in SQL.
CREATE TABLE rag_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  lab_version INTEGER NOT NULL,
  visibility TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  level TEXT NOT NULL,
  lang TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding BLOB
);
CREATE INDEX rag_chunks_lab ON rag_chunks(lab_id);

-- External-content FTS5 index over rag_chunks.text and title.
CREATE VIRTUAL TABLE rag_fts USING fts5(text, title, content = 'rag_chunks', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
CREATE TRIGGER rag_chunks_ai AFTER INSERT ON rag_chunks BEGIN
  INSERT INTO rag_fts (rowid, text, title) VALUES (new.id, new.text, new.title);
END;
CREATE TRIGGER rag_chunks_ad AFTER DELETE ON rag_chunks BEGIN
  INSERT INTO rag_fts (rag_fts, rowid, text, title) VALUES ('delete', old.id, old.text, old.title);
END;

-- Key-value store behind the embedding cache (content hash -> Float32 vector).
CREATE TABLE embed_cache (
  key TEXT PRIMARY KEY,
  value BLOB NOT NULL,
  created_at TEXT NOT NULL
);
