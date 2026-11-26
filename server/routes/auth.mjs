import { randomUUID } from 'node:crypto';
import { fail, nowIso, hashSecret, verifySecret, getPlan } from '../lib.mjs';
import { limitsForJson } from '../../shared/plans.js';

export const publicUser = u => u && { id: u.id, name: u.name, bio: u.bio || '' };

export function selfUser(db, u) {
  if (!u) return null;
  const plan = getPlan(db, u);
  return { ...publicUser(u), email: u.email, isAdmin: !!u.is_admin,
    plan: { ...plan, limits: limitsForJson(plan.limits) } };
}

// Pending organization invites are accepted automatically when the invited email signs in.
function acceptInvites(db, user) {
  for (const inv of db.all('SELECT org_id FROM org_invites WHERE email = ?', user.email)) {
    db.tx(() => {
      const org = db.get('SELECT seat_limit FROM orgs WHERE id = ?', inv.org_id);
      const used = db.get('SELECT COUNT(*) AS n FROM org_members WHERE org_id = ?', inv.org_id).n;
      if (org && used < org.seat_limit) db.run(`INSERT OR IGNORE INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)`, inv.org_id, user.id, nowIso());
      db.run('DELETE FROM org_invites WHERE org_id = ? AND email = ?', inv.org_id, user.email);
    });
  }
}

export default function register(r, { db, limit }) {
  r.get('session', ({ user }) => ({ user: selfUser(db, user) }));

  for (const action of ['signup', 'login']) {
    r.post(action, ctx => {
      const { body } = ctx;
      limit('auth', ctx.ip, 30, 15 * 60000, 'Too many sign-in attempts. Please try again later.');
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || password.length < 8 || password.length > 200)
        fail(400, 'Enter a valid email and a password of 8–200 characters.');
      let account = db.get('SELECT * FROM users WHERE email = ?', email);
      if (action === 'signup') {
        if (account) fail(409, 'An account with this email already exists.');
        if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 80) fail(400, 'Enter your name (2–80 characters).');
        const { salt, hash } = hashSecret(password);
        const id = randomUUID();
        db.run('INSERT INTO users (id, email, name, bio, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, email, body.name.trim(), '', salt, hash, nowIso());
        account = db.get('SELECT * FROM users WHERE id = ?', id);
      } else {
        limit('login-email', email, 10, 15 * 60000, 'Too many sign-in attempts. Please try again later.');
        if (!verifySecret(password, account?.salt || 'invalid-user', account?.hash) || !account) fail(401, 'Email or password is incorrect.');
      }
      acceptInvites(db, account);
      ctx.startSession(account);
      return { user: selfUser(db, account) };
    });
  }

  r.post('logout', ctx => { ctx.endSession(); return { ok: true }; });

  r.patch('me', ctx => {
    const user = ctx.requireUser(), { body } = ctx;
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 80 || typeof body.bio !== 'string' || body.bio.length > 1000)
      fail(400, 'Enter a name (2–80 characters) and a bio up to 1000 characters.');
    db.run('UPDATE users SET name = ?, bio = ? WHERE id = ?', body.name.trim(), body.bio.trim(), user.id);
    return { user: selfUser(db, db.get('SELECT * FROM users WHERE id = ?', user.id)) };
  });
}
