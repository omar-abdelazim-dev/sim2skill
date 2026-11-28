import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { platform, draft } from './helpers.mjs';
import { signMock } from '../server/billing/providers.mjs';
import { setModels } from '../server/llm/models.mjs';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

// Ends the 14-day trial so the account is on the Free plan.
async function age(dir, userId) {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(join(dir, 'platform.db'));
  d.prepare('UPDATE users SET created_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', userId);
  d.close();
}

test('free plan limits: 2 public labs, no private labs, titration only, 20 Nour messages a month', async () => {
  setModels({ chat: RunnableLambda.from(() => new AIMessage('Hi')) });
  const p = await platform();
  try {
    const u = await p.signup('Free User');
    await age(p.dir, u.id);
    const me = (await p.request('billing/me', 'GET', undefined, u.cookie)).data;
    assert.equal(me.plan.plan, 'free');
    assert.equal((await p.request('labs', 'POST', draft, u.cookie)).status, 201);
    assert.equal((await p.request('labs', 'POST', { ...draft, title: 'Second lab' }, u.cookie)).status, 201);
    const third = await p.request('labs', 'POST', { ...draft, title: 'Third lab' }, u.cookie);
    assert.equal(third.status, 402);
    assert.equal(third.data.upgrade, true);
    assert.equal((await p.request('labs', 'POST', { ...draft, visibility: 'private' }, u.cookie)).status, 402);
    for (let i = 0; i < 20; i++) {
      const r = await p.request('nour', 'POST', { kind: 'home', messages: [{ role: 'user', content: 'hi ' + i }] }, u.cookie);
      assert.equal(r.status, 200);
    }
    assert.equal((await p.request('nour', 'POST', { kind: 'home', messages: [{ role: 'user', content: 'one more' }] }, u.cookie)).status, 429);

    process.env.DEMO_MODE = '1';
    assert.equal((await p.request('labs', 'POST', { ...draft, visibility: 'private' }, u.cookie)).status, 201, 'DEMO_MODE unlocks everything');
    delete process.env.DEMO_MODE;
  } finally {
    setModels(null); delete process.env.DEMO_MODE;
    await p.close();
  }
});

test('mock checkout: signed webhook, idempotent, upgrades to Pro', async () => {
  process.env.PAYMENT_PROVIDER = 'mock';
  const p = await platform();
  try {
    const u = await p.signup('Buyer');
    await age(p.dir, u.id);
    const plans = (await p.request('billing/plans')).data;
    assert.equal(plans.currency, 'EGP');
    assert.deepEqual(plans.plans.pro.prices, { month: 19900, year: 169000 });
    assert.equal(plans.plans.pro.limits.nourPerMonth, 100);
    assert.equal(plans.plans.org.pricePerSeatSemester, 75000);
    assert.equal(plans.plans.org.minSeats, 100);
    assert.equal(plans.topup.price, 14900);
    assert.equal(plans.plans.free.limits.publicLabs, 2);
    assert.equal(plans.plans.pro.limits.publicLabs, null, 'Infinity is sent as null');
    assert.equal(plans.provider.checkout, true);

    assert.equal((await p.request('billing/checkout', 'POST', { plan: 'pro', period: 'semester' }, u.cookie)).status, 400, 'no semester for Individual');
    assert.equal((await p.request('billing/checkout', 'POST', { plan: 'topup', period: 'pack' }, u.cookie)).status, 400, 'top-ups need the Individual plan');
    const c = await p.request('billing/checkout', 'POST', { plan: 'pro', period: 'month' }, u.cookie);
    assert.equal(c.status, 201);
    assert.equal(c.data.amountCents, 19900);
    assert.equal(c.data.currency, 'EGP');

    const event = JSON.stringify({ id: 'evt_test_1', type: 'checkout.paid', checkoutId: c.data.checkoutId });
    assert.equal((await p.request('billing/webhook/mock', 'POST', event, undefined, { 'x-mock-signature': 'sha256=bad' })).status, 400);
    const first = await p.request('billing/webhook/mock', 'POST', event, undefined, { 'x-mock-signature': signMock(event) });
    assert.equal(first.data.paid, true);
    const again = await p.request('billing/webhook/mock', 'POST', event, undefined, { 'x-mock-signature': signMock(event) });
    assert.equal(again.data.duplicate, true);
    const me = (await p.request('billing/me', 'GET', undefined, u.cookie)).data;
    assert.equal(me.plan.plan, 'pro');
    assert.equal(me.subscriptions.length, 1);
    assert.equal((await p.request('labs', 'POST', { ...draft, visibility: 'private' }, u.cookie)).status, 201);

    // The test payment page path produces the same result.
    const c2 = await p.request('billing/checkout', 'POST', { plan: 'pro', period: 'year' }, u.cookie);
    assert.equal((await p.request('billing/mock/pay', 'POST', { checkoutId: c2.data.checkoutId }, u.cookie)).data.result.paid, true);
    assert.equal((await p.request('billing/me', 'GET', undefined, u.cookie)).data.subscriptions.length, 2);

    // Top-up pack: 149 EGP adds 100 Nour messages for this month.
    const t = await p.request('billing/checkout', 'POST', { plan: 'topup', period: 'pack' }, u.cookie);
    assert.equal(t.data.amountCents, 14900);
    assert.equal((await p.request('billing/mock/pay', 'POST', { checkoutId: t.data.checkoutId }, u.cookie)).data.result.topup, 100);
    const after = (await p.request('billing/me', 'GET', undefined, u.cookie)).data;
    assert.equal(after.nour.limit, 100);
    assert.equal(after.nour.extra, 100);
    assert.equal(after.subscriptions.length, 2, 'a top-up is not a subscription');
  } finally { delete process.env.PAYMENT_PROVIDER; await p.close(); }
});

test('manual provider: checkout disabled, admin activation codes work once', async () => {
  process.env.ADMIN_EMAILS = 'boss@example.com';
  const p = await platform();
  try {
    const u = await p.signup('Learner'), boss = await p.signup('Boss');
    await age(p.dir, u.id);
    assert.equal((await p.request('billing/checkout', 'POST', { plan: 'pro', period: 'month' }, u.cookie)).status, 400);
    assert.equal((await p.request('admin/redeem-codes', 'POST', { count: 1, days: 30 }, u.cookie)).status, 403);
    const { codes } = (await p.request('admin/redeem-codes', 'POST', { count: 2, days: 30 }, boss.cookie)).data;
    assert.equal(codes.length, 2);
    assert.equal((await p.request('billing/redeem', 'POST', { code: codes[0] }, u.cookie)).data.plan.plan, 'pro');
    assert.equal((await p.request('billing/redeem', 'POST', { code: codes[0] }, boss.cookie)).status, 400, 'codes work once');
  } finally { delete process.env.ADMIN_EMAILS; await p.close(); }
});

test('organizations: pilot seats, invites by email and code, members get org limits', async () => {
  const p = await platform();
  try {
    const owner = await p.signup('Org Owner'), teacher = await p.signup('Teacher');
    await age(p.dir, teacher.id);
    const org = await p.request('orgs', 'POST', { name: 'Alamein University' }, owner.cookie);
    assert.equal(org.status, 201);
    const invite = await p.request('orgs/' + org.data.id + '/invites', 'POST', { emails: ['teacher@example.com', 'future@example.com'] }, owner.cookie);
    assert.deepEqual(invite.data, { added: 1, invited: 1 });
    assert.equal((await p.request('billing/me', 'GET', undefined, teacher.cookie)).data.plan.plan, 'org');
    assert.equal((await p.request('orgs/' + org.data.id + '/invites', 'POST', { emails: ['x@example.com'] }, teacher.cookie)).status, 403);
    const future = await p.signup('Future');
    assert.equal(future.data.user.plan.plan, 'org', 'pending invites are accepted on sign-up');
    const walkIn = await p.signup('Walk In');
    assert.equal((await p.request('orgs/join', 'POST', { code: org.data.joinCode }, walkIn.cookie)).status, 200);
    const mine = (await p.request('orgs/mine', 'GET', undefined, owner.cookie)).data[0];
    assert.equal(mine.seatsUsed, 4);
    assert.equal(mine.seatLimit, 25);
    assert.equal(mine.status, 'pilot');
    assert.equal((await p.request('orgs/' + org.data.id + '/usage', 'GET', undefined, owner.cookie)).data.length, 4);
    assert.equal((await p.request('orgs/' + org.data.id + '/invoice-request', 'POST', { seats: 50, contact: 'bursar@aiu.edu.eg' }, owner.cookie)).status, 400, '100-seat minimum');
    const quote = await p.request('orgs/' + org.data.id + '/invoice-request', 'POST', { seats: 250, contact: 'bursar@aiu.edu.eg' }, owner.cookie);
    assert.equal(quote.data.quote.centsPerSeatSemester, 75000);
    assert.equal(quote.data.quote.totalCents, 250 * 75000);
    assert.equal((await p.request('orgs/' + org.data.id + '/members/' + teacher.id, 'DELETE', {}, owner.cookie)).status, 200);
    assert.equal((await p.request('billing/me', 'GET', undefined, teacher.cookie)).data.plan.plan, 'free');
  } finally { await p.close(); }
});
