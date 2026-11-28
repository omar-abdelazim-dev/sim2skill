-- Nour top-up packs: extra messages for one calendar month (month = "YYYY-MM", UTC), bought through checkout.
CREATE TABLE nour_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  messages INTEGER NOT NULL,
  checkout_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX nour_topups_user ON nour_topups(user_id, month);
