import { randomUUID } from 'node:crypto';
import { fail, nowIso, getPlan, makeCode, normalizeCode, sha256, nourUsed, nourExtra } from '../lib.mjs';
import { PLANS, TOPUP, CURRENCY, TRIAL_DAYS, priceFor, orgSemesterTotal, monthKey, limitsForJson } from '../../shared/plans.js';
import { activeProvider, PROVIDERS, signMock } from '../billing/providers.mjs';
import { withStatus } from '../router.mjs';

const DAY = 86400000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function register(r, { db, limit }) {
  const plansJson = () => Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { ...p, limits: limitsForJson(p.limits) }]));

  // Apply a verified provider event exactly once.
  function applyEvent(provider, event) {
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') fail(400, 'Malformed event.');
    return db.tx(() => {
      const seen = db.run('INSERT OR IGNORE INTO webhook_events (provider, event_id, received_at) VALUES (?, ?, ?)', provider, event.id, nowIso());
      if (!seen.changes) return { duplicate: true };
      const c = db.get('SELECT * FROM checkouts WHERE id = ? AND provider = ?', event.checkoutId, provider);
      if (!c || c.status !== 'pending') return { ignored: true };
      if (event.type === 'checkout.failed') { db.run(`UPDATE checkouts SET status = 'failed' WHERE id = ?`, c.id); return { failed: true }; }
      if (event.type !== 'checkout.paid') return { ignored: true };
      db.run(`UPDATE checkouts SET status = 'paid' WHERE id = ?`, c.id);
      if (c.plan === 'topup') {
        db.run('INSERT INTO nour_topups (id, user_id, month, messages, checkout_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          randomUUID(), c.user_id, monthKey(), TOPUP.messages, c.id, nowIso());
        return { paid: true, topup: TOPUP.messages };
      }
      // Extend from the end of any active subscription so paying early never loses days.
      const current = db.get(`SELECT MAX(ends_at) AS e FROM subscriptions WHERE user_id = ? AND status IN ('active', 'canceled') AND ends_at > ?`, c.user_id, nowIso()).e;
      const start = current ? new Date(current) : new Date();
      const ends = new Date(start.getTime() + PLANS[c.plan].periodDays[c.period] * DAY);
      db.run(`INSERT INTO subscriptions (id, user_id, plan, period, status, provider, provider_ref, started_at, ends_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
        randomUUID(), c.user_id, c.plan, c.period, provider, c.id, nowIso(), ends.toISOString());
      return { paid: true };
    });
  }

  r.get('billing/plans', () => {
    const p = activeProvider();
    return { plans: plansJson(), topup: TOPUP, currency: CURRENCY, trialDays: TRIAL_DAYS, provider: { id: p.id, checkout: !!p.checkout }, demo: process.env.DEMO_MODE === '1' };
  });

  r.get('billing/me', ctx => {
    const user = ctx.requireUser(), plan = getPlan(db, user);
    return {
      plan: { ...plan, limits: limitsForJson(plan.limits) },
      subscriptions: db.all('SELECT id, plan, period, status, provider, started_at AS startedAt, ends_at AS endsAt FROM subscriptions WHERE user_id = ? ORDER BY ends_at DESC', user.id),
      nour: { used: nourUsed(db, 'u:' + user.id), limit: plan.limits.nourPerMonth === Infinity ? null : plan.limits.nourPerMonth, extra: nourExtra(db, user), month: monthKey() }
    };
  });

  r.post('billing/checkout', ctx => {
    const user = ctx.requireUser(), provider = activeProvider();
    limit('checkout', user.id, 20, 3600000);
    if (!provider.checkout) fail(400, 'Online checkout is not available yet. Use an activation code or request an invoice.');
    const { plan, period } = ctx.body;
    const amount = (plan === 'pro' || plan === 'topup') ? priceFor(plan, period) : null;
    if (!amount) fail(400, 'Choose Individual monthly or yearly, or a top-up pack.');
    if (plan === 'topup' && getPlan(db, user).plan !== TOPUP.forPlan) fail(400, 'Top-up packs are for Individual subscribers.');
    const c = { id: randomUUID(), plan, period, amount };
    db.run(`INSERT INTO checkouts (id, user_id, plan, period, amount_cents, currency, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      c.id, user.id, plan, period, amount, CURRENCY, provider.id, nowIso());
    return withStatus(201, { checkoutId: c.id, amountCents: amount, currency: CURRENCY, ...provider.createCheckout(c) });
  });

  r.get('billing/checkout/:id', ctx => {
    const user = ctx.requireUser();
    const c = db.get('SELECT id, plan, period, amount_cents AS amountCents, currency, provider, status FROM checkouts WHERE id = ? AND user_id = ?', ctx.params.id, user.id);
    if (!c) fail(404, 'Checkout not found.');
    return c;
  });

  // Test payment page for the mock provider: builds the same signed event a real gateway would send.
  r.post('billing/mock/pay', ctx => {
    const user = ctx.requireUser();
    if (activeProvider().id !== 'mock') fail(404, 'Endpoint not found.');
    const c = db.get('SELECT * FROM checkouts WHERE id = ? AND user_id = ?', String(ctx.body.checkoutId || ''), user.id);
    if (!c) fail(404, 'Checkout not found.');
    const event = { id: 'evt_' + randomUUID(), type: ctx.body.outcome === 'fail' ? 'checkout.failed' : 'checkout.paid', checkoutId: c.id };
    const raw = JSON.stringify(event);
    const verified = PROVIDERS.mock.verifyWebhook(raw, { 'x-mock-signature': signMock(raw) });
    const result = applyEvent('mock', verified);
    const plan = getPlan(db, user);
    return { result, plan: { ...plan, limits: limitsForJson(plan.limits) } };
  });

  // Raw-body webhook route with signature verification and idempotency (mock provider only for now).
  r.post('billing/webhook/:provider', ctx => {
    const provider = PROVIDERS[ctx.params.provider];
    if (!provider || provider.disabled || !provider.verifyWebhook || activeProvider().id !== provider.id) fail(404, 'Endpoint not found.');
    let event;
    try { event = provider.verifyWebhook(ctx.raw, ctx.req.headers); } catch (e) { fail(400, e.message || 'Invalid webhook.'); }
    return applyEvent(provider.id, event);
  }, { raw: true, maxBody: 16000 });

  r.post('billing/cancel', ctx => {
    const user = ctx.requireUser();
    const n = db.run(`UPDATE subscriptions SET status = 'canceled' WHERE user_id = ? AND status = 'active'`, user.id).changes;
    if (!n) fail(400, 'You have no active subscription.');
    return { ok: true, message: 'Your subscription will not renew. Your Individual plan stays active until the end of the paid period.' };
  });

  r.post('billing/redeem', ctx => {
    const user = ctx.requireUser();
    limit('redeem', user.id, 10, 3600000, 'Too many attempts. Please wait an hour.');
    const code = normalizeCode(ctx.body.code);
    if (code.length < 8 || code.length > 32) fail(400, 'Enter the activation code you received.');
    return db.tx(() => {
      const row = db.get('SELECT * FROM redeem_codes WHERE code_hash = ? AND used_by IS NULL', sha256(code));
      if (!row) fail(400, 'This code is not valid or was already used.');
      db.run('UPDATE redeem_codes SET used_by = ?, used_at = ? WHERE code_hash = ?', user.id, nowIso(), row.code_hash);
      const now = new Date();
      db.run(`INSERT INTO subscriptions (id, user_id, plan, period, status, provider, provider_ref, started_at, ends_at) VALUES (?, ?, ?, 'code', 'active', 'manual', 'redeem-code', ?, ?)`,
        randomUUID(), user.id, row.plan, now.toISOString(), new Date(now.getTime() + row.days * DAY).toISOString());
      const plan = getPlan(db, user);
      return { plan: { ...plan, limits: limitsForJson(plan.limits) } };
    });
  });

  // ----- Organizations -----
  const orgFor = (ctx, admin = true) => {
    const user = ctx.requireUser();
    const m = db.get('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?', ctx.params.id, user.id);
    if (!m || (admin && m.role !== 'admin')) fail(403, 'Only organization admins can do that.');
    return db.get('SELECT * FROM orgs WHERE id = ?', ctx.params.id);
  };
  const seatsUsed = orgId => db.get('SELECT (SELECT COUNT(*) FROM org_members WHERE org_id = ?) + (SELECT COUNT(*) FROM org_invites WHERE org_id = ?) AS n', orgId, orgId).n;
  const newJoinCode = orgId => { const code = makeCode(12); db.run('UPDATE orgs SET join_hash = ? WHERE id = ?', sha256(code), orgId); return code; };

  r.post('orgs', ctx => {
    const user = ctx.requireUser();
    const name = typeof ctx.body.name === 'string' ? ctx.body.name.trim() : '';
    if (name.length < 2 || name.length > 120) fail(400, 'Enter your organization’s name (2–120 characters).');
    if (db.get('SELECT 1 FROM orgs WHERE owner_id = ?', user.id)) fail(409, 'You already manage an organization.');
    const id = randomUUID(), now = new Date();
    let joinCode;
    db.tx(() => {
      db.run(`INSERT INTO orgs (id, name, owner_id, seat_limit, status, ends_at, created_at) VALUES (?, ?, ?, ?, 'pilot', ?, ?)`,
        id, name, user.id, PLANS.org.pilot.seats, new Date(now.getTime() + PLANS.org.pilot.days * DAY).toISOString(), now.toISOString());
      db.run(`INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)`, id, user.id, now.toISOString());
      joinCode = newJoinCode(id);
    });
    return withStatus(201, { id, joinCode });
  });

  r.get('orgs/mine', ctx => {
    const user = ctx.requireUser();
    return db.all(`SELECT o.*, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ?`, user.id).map(o => {
      const base = { id: o.id, name: o.name, role: o.role, status: o.status, seatLimit: o.seat_limit, endsAt: o.ends_at, seatsUsed: seatsUsed(o.id) };
      if (o.role !== 'admin') return base;
      return {
        ...base,
        members: db.all(`SELECT u.id, u.name, u.email, m.role, m.created_at AS joinedAt FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at`, o.id),
        invites: db.all('SELECT email, created_at AS createdAt FROM org_invites WHERE org_id = ? ORDER BY created_at', o.id),
        seatPriceCents: PLANS.org.pricePerSeatSemester
      };
    });
  });

  r.get('orgs/:id/usage', ctx => {
    const o = orgFor(ctx);
    return db.all(`SELECT u.id, u.name,
        (SELECT COALESCE(SUM(count), 0) FROM entitlement_usage e WHERE e.subject = 'u:' || u.id AND e.feature = 'nour' AND e.day = ?) AS nourMonth,
        (SELECT COUNT(*) FROM labs l WHERE l.author_id = u.id) AS labs,
        (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id AND p.solved_at IS NOT NULL) AS solved
      FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY u.name`, monthKey(), o.id);
  });

  r.post('orgs/:id/invites', ctx => {
    const o = orgFor(ctx);
    const emails = Array.isArray(ctx.body.emails) ? [...new Set(ctx.body.emails.map(e => String(e).trim().toLowerCase()))] : [];
    if (!emails.length || emails.length > 200 || emails.some(e => !EMAIL.test(e) || e.length > 200)) fail(400, 'Paste up to 200 valid email addresses.');
    let added = 0, invited = 0;
    db.tx(() => {
      for (const email of emails) {
        if (seatsUsed(o.id) >= o.seat_limit) fail(400, `All ${o.seat_limit} seats are in use. Remove a member or request more seats.`);
        const u = db.get('SELECT id FROM users WHERE email = ?', email);
        if (u) added += db.run(`INSERT OR IGNORE INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)`, o.id, u.id, nowIso()).changes;
        else invited += db.run('INSERT OR IGNORE INTO org_invites (org_id, email, created_at) VALUES (?, ?, ?)', o.id, email, nowIso()).changes;
      }
    });
    return { added: Number(added), invited: Number(invited) };
  });

  r.delete('orgs/:id/invites/:email', ctx => {
    const o = orgFor(ctx);
    db.run('DELETE FROM org_invites WHERE org_id = ? AND email = ?', o.id, ctx.params.email.toLowerCase());
    return { ok: true };
  });

  r.post('orgs/:id/join-code', ctx => ({ joinCode: newJoinCode(orgFor(ctx).id) }));

  r.post('orgs/join', ctx => {
    const user = ctx.requireUser();
    limit('org-join', user.id, 10, 3600000);
    const o = db.get('SELECT * FROM orgs WHERE join_hash = ?', sha256(normalizeCode(ctx.body.code)));
    if (!o) fail(400, 'This organization code is not valid.');
    if (db.get('SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?', o.id, user.id)) return { id: o.id, name: o.name };
    if (seatsUsed(o.id) >= o.seat_limit) fail(400, 'This organization has no free seats. Ask its admin for more seats.');
    db.run(`INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)`, o.id, user.id, nowIso());
    return { id: o.id, name: o.name };
  });

  r.patch('orgs/:id/members/:userId', ctx => {
    const o = orgFor(ctx);
    if (!['admin', 'member'].includes(ctx.body.role)) fail(400, 'Role must be admin or member.');
    if (ctx.params.userId === o.owner_id && ctx.body.role !== 'admin') fail(400, 'The organization owner stays an admin.');
    if (!db.run('UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?', ctx.body.role, o.id, ctx.params.userId).changes) fail(404, 'Member not found.');
    return { ok: true };
  });

  r.delete('orgs/:id/members/:userId', ctx => {
    const o = orgFor(ctx);
    if (ctx.params.userId === o.owner_id) fail(400, 'The organization owner cannot be removed.');
    db.run('DELETE FROM org_members WHERE org_id = ? AND user_id = ?', o.id, ctx.params.userId);
    return { ok: true };
  });

  r.post('orgs/:id/invoice-request', ctx => {
    const o = orgFor(ctx);
    const seats = Number(ctx.body.seats), contact = typeof ctx.body.contact === 'string' ? ctx.body.contact.trim() : '';
    const notes = typeof ctx.body.notes === 'string' ? ctx.body.notes.trim().slice(0, 2000) : '';
    if (!Number.isInteger(seats) || seats < PLANS.org.minSeats || seats > 100000) fail(400, `Institution licences start at ${PLANS.org.minSeats} seats.`);
    if (contact.length < 3 || contact.length > 200) fail(400, 'Add a billing contact (name, email or phone).');
    db.run('INSERT INTO invoice_requests (id, user_id, org_id, seats, contact, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), ctx.user.id, o.id, seats, contact, notes, nowIso());
    return withStatus(201, { ok: true, quote: { seats, centsPerSeatSemester: PLANS.org.pricePerSeatSemester, totalCents: orgSemesterTotal(seats), currency: CURRENCY } });
  });
}
