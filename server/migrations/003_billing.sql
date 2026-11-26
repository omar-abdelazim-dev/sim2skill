-- Phase 9: subscriptions, organizations and entitlements. No card data is ever stored.
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'expired')),
  provider TEXT NOT NULL,
  provider_ref TEXT,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);
CREATE INDEX subscriptions_user ON subscriptions(user_id, ends_at);

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  seat_limit INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pilot', 'active', 'expired')),
  join_salt TEXT,
  join_hash TEXT,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user ON org_members(user_id);

CREATE TABLE org_invites (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, email)
);

CREATE TABLE entitlement_usage (
  subject TEXT NOT NULL,
  feature TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, feature, day)
);

CREATE TABLE redeem_codes (
  code_hash TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  days INTEGER NOT NULL,
  created_by TEXT,
  used_by TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE invoice_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  org_id TEXT,
  seats INTEGER NOT NULL,
  contact TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE checkouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  period TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  created_at TEXT NOT NULL
);

-- Idempotency: each provider event is applied at most once.
CREATE TABLE webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);
