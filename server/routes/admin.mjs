import { randomUUID } from 'node:crypto';
import { fail, nowIso, notify, makeCode, sha256 } from '../lib.mjs';
import { PLANS } from '../../shared/plans.js';
import { removeLabFromIndex } from '../llm/rag.mjs';

export default function register(r, { db }) {
  r.get('admin/reports', ctx => {
    ctx.requireAdmin();
    return db.all(`SELECT r.id, r.reason, r.status, r.created_at AS createdAt, l.id AS labId, l.title AS labTitle, l.taken_down AS takenDown,
                          a.name AS authorName, u.name AS reporterName
                   FROM reports r JOIN labs l ON l.id = r.lab_id JOIN users a ON a.id = l.author_id JOIN users u ON u.id = r.reporter_id
                   ORDER BY r.status = 'open' DESC, r.created_at DESC LIMIT 200`).map(x => ({ ...x, takenDown: !!x.takenDown }));
  });

  r.post('admin/labs/:id/takedown', ctx => {
    ctx.requireAdmin();
    const l = db.get('SELECT * FROM labs WHERE id = ?', ctx.params.id);
    if (!l) fail(404, 'Lab not found.');
    if (l.builtin) fail(400, 'Built-in labs cannot be taken down.');
    const reason = typeof ctx.body.reason === 'string' ? ctx.body.reason.trim().slice(0, 500) : '';
    if (reason.length < 5) fail(400, 'Give the creator a reason (at least 5 characters).');
    db.tx(() => {
      db.run('UPDATE labs SET taken_down = 1, takedown_reason = ?, updated_at = ? WHERE id = ?', reason, nowIso(), l.id);
      db.run(`UPDATE reports SET status = 'resolved' WHERE lab_id = ?`, l.id);
      notify(db, l.author_id, 'lab_taken_down', { labId: l.id, title: l.title, reason });
    });
    removeLabFromIndex(db, l.id);
    return { ok: true };
  });

  r.post('admin/labs/:id/restore', ctx => {
    ctx.requireAdmin();
    const changed = db.run('UPDATE labs SET taken_down = 0, takedown_reason = NULL WHERE id = ?', ctx.params.id).changes;
    if (!changed) fail(404, 'Lab not found.');
    return { ok: true };
  });

  r.post('admin/reports/:id/resolve', ctx => {
    ctx.requireAdmin();
    if (!db.run(`UPDATE reports SET status = 'resolved' WHERE id = ?`, ctx.params.id).changes) fail(404, 'Report not found.');
    return { ok: true };
  });

  // Manual payment provider: an admin grants a plan for a number of days.
  r.post('admin/users/:id/grant', ctx => {
    const admin = ctx.requireAdmin();
    const days = Number(ctx.body.days);
    if (ctx.body.plan !== 'pro' || !Number.isInteger(days) || days < 1 || days > 730) fail(400, 'Grant Pro for 1–730 days.');
    if (!db.get('SELECT 1 FROM users WHERE id = ?', ctx.params.id)) fail(404, 'User not found.');
    const now = new Date();
    db.run(`INSERT INTO subscriptions (id, user_id, plan, period, status, provider, provider_ref, started_at, ends_at) VALUES (?, ?, 'pro', 'custom', 'active', 'manual', ?, ?, ?)`,
      randomUUID(), ctx.params.id, 'granted-by:' + admin.id, now.toISOString(), new Date(now.getTime() + days * 86400000).toISOString());
    return { ok: true };
  });

  // Activation codes are shown once and stored as SHA-256 (they are long random values).
  r.post('admin/redeem-codes', ctx => {
    const admin = ctx.requireAdmin();
    const count = Number(ctx.body.count), days = Number(ctx.body.days);
    if (!Number.isInteger(count) || count < 1 || count > 200 || !Number.isInteger(days) || days < 1 || days > 730) fail(400, 'Create 1–200 codes for 1–730 days.');
    const codes = Array.from({ length: count }, () => makeCode(12));
    db.tx(() => codes.forEach(c => db.run(`INSERT INTO redeem_codes (code_hash, plan, days, created_by, created_at) VALUES (?, 'pro', ?, ?, ?)`, sha256(c), days, admin.id, nowIso())));
    return { codes, plan: PLANS.pro.name, days };
  });

  r.get('admin/invoice-requests', ctx => {
    ctx.requireAdmin();
    return db.all(`SELECT i.*, u.name AS userName, u.email AS userEmail FROM invoice_requests i JOIN users u ON u.id = i.user_id ORDER BY i.created_at DESC LIMIT 200`);
  });

  r.get('admin/users', ctx => {
    ctx.requireAdmin();
    const q = (ctx.query.get('q') || '').trim().toLowerCase().slice(0, 100);
    return db.all(`SELECT id, name, email, created_at AS createdAt FROM users WHERE email IS NOT NULL AND (? = '' OR instr(lower(name || ' ' || email), ?) > 0) ORDER BY created_at DESC LIMIT 50`, q, q);
  });
}
