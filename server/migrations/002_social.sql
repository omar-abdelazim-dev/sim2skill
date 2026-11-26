-- Phases 1-3: moderation, private labs, follows and notifications.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL
);
CREATE INDEX reports_status ON reports(status, created_at);

-- Access codes are stored only as scrypt hashes.
CREATE TABLE lab_access (
  lab_id TEXT PRIMARY KEY REFERENCES labs(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  rotated_at TEXT NOT NULL
);

CREATE TABLE lab_grants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'code',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lab_id)
);
CREATE INDEX lab_grants_lab ON lab_grants(lab_id);

CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee ON follows(followee_id);

-- blocker_id stops blocked_id from following them.
CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- user_id no longer gets notifications about muted_id.
CREATE TABLE mutes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, muted_id)
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, created_at);
