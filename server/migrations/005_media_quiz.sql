-- Uploaded images (profile pictures, lab thumbnails) and creator quizzes.
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX media_owner ON media(owner_id);

ALTER TABLE users ADD COLUMN avatar_id TEXT REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE labs ADD COLUMN thumbnail_id TEXT REFERENCES media(id) ON DELETE SET NULL;

-- JSON array of { q, choices: [..], answer: index, explain }. Answers never leave the server for students.
ALTER TABLE labs ADD COLUMN quiz TEXT;

CREATE TABLE quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  lab_version INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  answers TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX quiz_attempts_user_lab ON quiz_attempts(user_id, lab_id, created_at);
