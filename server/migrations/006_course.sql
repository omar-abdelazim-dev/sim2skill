-- Course material for the physics labs: chunks of the lab manual and textbook PDFs, one row per chunk with its page.
-- Not tied to a lab, so there is no access rule; Nour only reads it inside physics labs. Embeddings are optional (keyword search still works).
CREATE TABLE course_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  embedding BLOB
);
CREATE INDEX course_chunks_source ON course_chunks(source);
CREATE VIRTUAL TABLE course_fts USING fts5(text, source, content = 'course_chunks', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
CREATE TRIGGER course_chunks_ai AFTER INSERT ON course_chunks BEGIN
  INSERT INTO course_fts (rowid, text, source) VALUES (new.id, new.text, new.source);
END;
CREATE TRIGGER course_chunks_ad AFTER DELETE ON course_chunks BEGIN
  INSERT INTO course_fts (course_fts, rowid, text, source) VALUES ('delete', old.id, old.text, old.source);
END;
