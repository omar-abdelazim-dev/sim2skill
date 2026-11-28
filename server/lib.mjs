// Shared server helpers: errors, secrets, rate limits, access control, entitlements, notifications.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { PLANS, TRIAL_DAYS, engineAllowed, monthKey } from '../shared/plans.js';

export function fail(status, message, extra) {
  throw Object.assign(Error(message), { status, extra, expose: true });
}
export const nowIso = () => new Date().toISOString();
export const sha256 = text => createHash('sha256').update(text).digest('hex');

// scrypt for every user-chosen or user-facing secret (passwords, access codes, join codes).
export function hashSecret(secret, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(secret, salt, 64).toString('hex') };
}
export function verifySecret(secret, salt, hash) {
  const calculated = scryptSync(String(secret), salt || 'no-salt', 64);
  const stored = Buffer.from(hash || '', 'hex');
  return stored.length === calculated.length && timingSafeEqual(calculated, stored);
}

// 8-character codes without look-alike characters (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(length = 8) {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
export const normalizeCode = c => String(c || '').trim().toUpperCase().replace(/[\s-]/g, '');

// Fixed-window rate limiter kept in memory. Key by user id when signed in, otherwise by IP.
export function createLimiter() {
  const windows = new Map();
  return function limit(name, key, max, windowMs, message = 'Too many requests. Please wait and try again.') {
    const id = name + ':' + key, now = Date.now();
    let w = windows.get(id);
    if (!w || w.until < now) { w = { count: 0, until: now + windowMs }; windows.set(id, w); }
    if (++w.count > max) fail(429, message);
    if (windows.size > 50000) for (const [k, v] of windows) if (v.until < now) windows.delete(k);
  };
}

// Lockout after repeated wrong codes, per user and lab.
export function createLockout(maxFailures = 5, lockMs = 15 * 60000) {
  const state = new Map();
  return {
    check(key) {
      const s = state.get(key);
      if (s?.lockedUntil > Date.now()) fail(429, 'Too many wrong codes. Try again in 15 minutes.');
    },
    failure(key) {
      const s = state.get(key) || { failures: 0 };
      s.failures++;
      if (s.failures >= maxFailures) { s.lockedUntil = Date.now() + lockMs; s.failures = 0; }
      state.set(key, s);
    },
    success(key) { state.delete(key); }
  };
}

// ---------- Access control ----------
// The one rule for "can this viewer see this lab": used in SQL (lists, search, RAG) and in code (single lab).
export const VISIBLE_SQL = `(l.taken_down = 0 AND l.status = 'published' AND (
  l.visibility = 'public'
  OR l.author_id = :viewer
  OR EXISTS (SELECT 1 FROM lab_grants g WHERE g.lab_id = l.id AND g.user_id = :viewer)))`;

export function labAccess(db, lab, user) {
  if (!lab) return 'none';
  if (user && lab.author_id === user.id) return 'owner';
  if (user?.is_admin) return 'admin';
  if (lab.taken_down || lab.status !== 'published') return 'none';
  if (lab.visibility === 'public') return 'public';
  if (user && db.get('SELECT 1 FROM lab_grants WHERE lab_id = ? AND user_id = ?', lab.id, user.id)) return 'granted';
  return 'locked';
}

// ---------- Entitlements ----------
const DAY = 86400000;
export function getPlan(db, user) {
  if (process.env.DEMO_MODE === '1') return { plan: 'demo', source: 'demo', limits: PLANS.org.limits, endsAt: null };
  if (!user) return { plan: 'free', source: 'anonymous', limits: PLANS.free.limits, endsAt: null };
  const now = nowIso();
  const org = db.get(`SELECT o.id, o.name, o.ends_at FROM org_members m JOIN orgs o ON o.id = m.org_id
                      WHERE m.user_id = ? AND o.status IN ('pilot', 'active') AND o.ends_at > ? ORDER BY o.ends_at DESC LIMIT 1`, user.id, now);
  if (org) return { plan: 'org', source: 'org', org: { id: org.id, name: org.name }, limits: PLANS.org.limits, endsAt: org.ends_at };
  const sub = db.get(`SELECT plan, period, ends_at, provider FROM subscriptions WHERE user_id = ? AND status IN ('active', 'canceled') AND ends_at > ?
                      ORDER BY ends_at DESC LIMIT 1`, user.id, now);
  if (sub) return { plan: sub.plan, source: 'subscription', period: sub.period, limits: PLANS[sub.plan].limits, endsAt: sub.ends_at };
  const trialEnds = new Date(Date.parse(user.created_at) + TRIAL_DAYS * DAY).toISOString();
  if (trialEnds > now) return { plan: 'pro', source: 'trial', limits: PLANS.pro.limits, endsAt: trialEnds };
  return { plan: 'free', source: 'free', limits: PLANS.free.limits, endsAt: null };
}

export function requireEntitlement(db, user, feature, detail = {}) {
  const { limits, plan } = getPlan(db, user);
  const upgrade = msg => fail(402, msg, { upgrade: true, plan });
  if (feature === 'createLab') {
    const visibility = detail.visibility || 'public';
    const key = visibility === 'private' ? 'privateLabs' : 'publicLabs';
    const count = db.get('SELECT COUNT(*) AS n FROM labs WHERE author_id = ? AND visibility = ? AND builtin = 0 AND id <> ?',
      user.id, visibility, detail.excludeId || '').n;
    if (count >= limits[key]) upgrade(visibility === 'private'
      ? 'Private labs are part of the Individual plan. Upgrade to create labs only people with your code can open.'
      : `The Free plan includes ${limits.publicLabs} public labs. Upgrade to Individual for unlimited labs.`);
  } else if (feature === 'engine') {
    if (!engineAllowed(limits, detail.engine)) upgrade('This chemistry simulation is part of the Individual plan. The Free plan includes titration.');
  } else if (feature === 'csvExport') {
    if (!limits.csvExport) upgrade('CSV export is part of the Individual plan.');
  }
  return limits;
}

// Monthly counters (Nour messages). subject is "u:<user id>" or "ip:<address>"; the bucket is "YYYY-MM".
// extra = top-up messages bought for this month.
export function nourExtra(db, user, month = monthKey()) {
  if (!user) return 0;
  return db.get('SELECT COALESCE(SUM(messages), 0) AS n FROM nour_topups WHERE user_id = ? AND month = ?', user.id, month).n;
}

export function nourUsed(db, subject, month = monthKey()) {
  return db.get('SELECT count FROM entitlement_usage WHERE subject = ? AND feature = ? AND day = ?', subject, 'nour', month)?.count || 0;
}

export function consumeMonthly(db, subject, feature, max, { canTopUp = false } = {}) {
  const month = monthKey();
  return db.tx(() => {
    const count = db.get('SELECT count FROM entitlement_usage WHERE subject = ? AND feature = ? AND day = ?', subject, feature, month)?.count || 0;
    if (count >= max) fail(429, canTopUp
      ? `You have used this month's ${max} messages for Nour. Buy a top-up pack on the Plans page for 100 more.`
      : `You have used this month's ${max} messages for Nour. Upgrade to Individual for more, or come back next month.`, { upgrade: true });
    db.run(`INSERT INTO entitlement_usage (subject, feature, day, count) VALUES (?, ?, ?, 1)
            ON CONFLICT (subject, feature, day) DO UPDATE SET count = count + 1`, subject, feature, month);
    return count + 1;
  });
}

// ---------- Notifications ----------
export function notify(db, userId, type, payload) {
  db.run('INSERT INTO notifications (user_id, type, payload, created_at) VALUES (?, ?, ?, ?)', userId, type, JSON.stringify(payload), nowIso());
}

// Fan out a new public lab to every follower who has not muted or blocked the author.
export function notifyFollowersOfLab(db, lab, author) {
  if (lab.visibility !== 'public') return 0;
  const followers = db.all(`SELECT f.follower_id AS id FROM follows f
    WHERE f.followee_id = ?
      AND NOT EXISTS (SELECT 1 FROM mutes m WHERE m.user_id = f.follower_id AND m.muted_id = f.followee_id)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = f.follower_id AND b.blocked_id = f.followee_id)
                                              OR (b.blocker_id = f.followee_id AND b.blocked_id = f.follower_id))`, author.id);
  db.tx(() => followers.forEach(f => notify(db, f.id, 'new_lab', { labId: lab.id, title: lab.title, authorId: author.id, authorName: author.name })));
  return followers.length;
}

// ---------- Validation ----------
export function text(data, key, min, max, label = key) {
  const v = data?.[key];
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) fail(400, `Please provide ${label} (${min}–${max} characters).`);
  return v.trim();
}
