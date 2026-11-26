-- Phase 0: core tables (users, sessions, labs, progress).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  salt TEXT,
  hash TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Only a SHA-256 of the session token is stored; the token itself lives in the cookie.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE labs (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id),
  engine TEXT NOT NULL DEFAULT 'circuits',
  template TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  outcomes TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  config TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  builtin INTEGER NOT NULL DEFAULT 0,
  taken_down INTEGER NOT NULL DEFAULT 0,
  takedown_reason TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  first_published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX labs_author ON labs(author_id);
CREATE INDEX labs_listing ON labs(status, visibility, taken_down);

-- A published lab is frozen as a version; attempts and RAG chunks point at a version.
CREATE TABLE lab_versions (
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (lab_id, version)
);

CREATE TABLE progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  lab_version INTEGER,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last TEXT,
  solved_at TEXT,
  PRIMARY KEY (user_id, lab_id)
);
