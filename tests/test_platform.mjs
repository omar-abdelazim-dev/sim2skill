import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, defaultConfig } from '../shared/labConfig.js';
import { platform, draft } from './helpers.mjs';

const builtins = Object.keys(BASE).length + 2; // 7 circuits + titration + kinetics

test('any user creates labs; drafts stay private; sessions and data survive a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 's2s-platform-'));
  let p = await platform(dir);
  try {
    const { request, signup } = p;
    assert.equal((await request('labs')).data.length, builtins);
    const student = await signup('Student'), creator = await signup('Creator'), other = await signup('Other');
    assert.equal(student.status, 200);
    assert.match(student.header, /HttpOnly/);
    assert.match(student.header, /SameSite=Lax/);
    assert.equal(student.data.user.role, undefined, 'roles are gone');
    assert.equal(student.data.user.plan.source, 'trial', 'new accounts start a Pro trial');

    assert.equal((await request('labs', 'POST', draft)).status, 401);
    const created = await request('labs', 'POST', { ...draft, authorId: other.id, status: 'published' }, creator.cookie);
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.equal(created.data.status, 'draft');
    assert.equal(created.data.authorId, creator.id);
    assert.equal((await request('labs/' + id)).status, 404);
    assert.equal((await request('labs/' + id + '/submit', 'POST', {}, other.cookie)).status, 403);
    assert.equal((await request('labs/' + id, 'PUT', draft, student.cookie)).status, 403);
    assert.equal((await request('labs/' + id + '/submit', 'POST', {}, creator.cookie)).data.status, 'published');
    assert.equal((await request('labs')).data.length, builtins + 1);
    const profile = (await request('profiles/' + creator.id)).data;
    assert.equal(profile.labs.length, 1);
    assert.equal(profile.user.email, undefined);
    assert.equal(profile.user.hash, undefined);
    assert.equal((await request('labs/' + id, 'PUT', draft, creator.cookie)).status, 409);

    assert.equal((await request('practice', 'POST', { labId: id }, student.cookie)).status, 200);
    assert.equal((await request('practice', 'POST', { labId: id, bench: { V: 9, R: 'r470', D: 'led', reversed: false, burnt: false } }, student.cookie)).data.last.diagnosis, 'success');
    const progress = (await request('practice', 'GET', undefined, student.cookie)).data;
    assert.equal(progress.length, 1);
    assert.ok(progress[0].solvedAt);
    assert.equal(progress[0].labVersion, 1);
    assert.equal((await request('practice', 'GET', undefined, other.cookie)).data.length, 0);

    assert.equal((await request('me', 'PATCH', { name: 'Creator Updated', bio: 'Circuits and discovery.' }, creator.cookie)).status, 200);
    assert.equal((await request('labs/' + id)).data.author.name, 'Creator Updated');
    assert.equal((await request('labs/' + id + '/unpublish', 'POST', {}, creator.cookie)).status, 200);
    assert.equal((await request('labs/' + id)).status, 404);
    assert.equal((await request('profiles/' + creator.id)).status, 404, 'no public labs means no public profile');
    assert.equal((await request('profiles/' + creator.id, 'GET', undefined, creator.cookie)).status, 200, 'owners still see their own profile');
    assert.equal((await request('labs/' + id + '/submit', 'POST', {}, creator.cookie)).data.version, 2, 'republishing creates a new version');

    const invalid = await request('labs', 'POST', { ...draft, title: 'Incomplete', description: '', outcomes: '', instructions: '' }, creator.cookie);
    assert.equal((await request('labs/' + invalid.data.id + '/submit', 'POST', {}, creator.cookie)).status, 400);

    const config = defaultConfig('divider');
    config.target = 6; config.components = { R: ['r1k'], D: ['r2k'] }; config.starter = { R: 'r1k', D: null, reversed: false, pot: 1000 };
    const custom = await request('labs', 'POST', { ...draft, template: 'divider', title: 'Six volt sensor supply', config }, creator.cookie);
    assert.equal(custom.status, 201);
    assert.equal((await request('labs/' + custom.data.id + '/submit', 'POST', {}, creator.cookie)).status, 200);
    const published = (await request('labs/' + custom.data.id)).data;
    assert.equal(published.config.target, 6);
    assert.match(published.goal, /6 V/);
    assert.equal((await request('practice', 'POST', { labId: custom.data.id, bench: { V: 9, R: 'r100', D: 'r2k', pot: 1000, reversed: false, burnt: false } }, student.cookie)).status, 400);
    assert.equal((await request('practice', 'POST', { labId: custom.data.id, bench: { V: 9, R: 'r1k', D: 'r2k', pot: 1000, reversed: false, burnt: false } }, student.cookie)).data.last.diagnosis, 'success');
    const blocked = await request('labs', 'POST', { ...draft, template: 'divider', title: 'Impossible circuit', config: { ...config, target: 1 } }, creator.cookie);
    assert.equal((await request('labs/' + blocked.data.id + '/submit', 'POST', {}, creator.cookie)).status, 400);
    await request('labs/' + custom.data.id + '/unpublish', 'POST', {}, creator.cookie);

    const cross = await request('labs', 'POST', draft, creator.cookie, { Origin: 'https://another.example' });
    assert.equal(cross.status, 403);
    assert.equal((await request('labs/x/y/z')).status, 404);

    await p.close({ keep: true });
    p = await platform(dir);
    assert.equal((await p.request('labs')).data.length, builtins + 1);
    assert.equal((await p.request('session', 'GET', undefined, creator.cookie)).data.user.id, creator.id, 'sessions persist in SQLite');
    const login = await p.request('login', 'POST', { email: 'Student@example.com', password: 'test-password-42' });
    assert.equal(login.status, 200);
    assert.equal((await p.request('practice', 'GET', undefined, login.cookie)).data.length, 2);
    assert.equal((await p.request('login', 'POST', { email: 'Student@example.com', password: 'wrong-password' })).status, 401);
    await p.request('logout', 'POST', {}, login.cookie);
    assert.equal((await p.request('me/labs', 'GET', undefined, login.cookie)).status, 401);
  } finally {
    await p.close({ keep: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test('the old JSON store is imported into SQLite with password hashes intact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 's2s-legacy-'));
  const { scryptSync } = await import('node:crypto');
  const salt = 'abc123';
  await writeFile(join(dir, 'platform.json'), JSON.stringify({
    users: [{ id: 'sim2skill', name: 'Sim2Skill team', role: 'tutor' },
      { id: 'u1', email: 'old@example.com', name: 'Old Tutor', role: 'tutor', bio: 'Hi', salt, hash: scryptSync('old-password-1', salt, 64).toString('hex') }],
    labs: [{ id: 'lab1', authorId: 'u1', template: 'ohm', title: 'Old lab', description: 'Old description here', outcomes: 'Old outcomes here', instructions: 'Old instructions here', status: 'published', createdAt: '2026-01-01T00:00:00.000Z' }],
    progress: [{ userId: 'u1', labId: 'ohm', title: "Ohm's law", startedAt: '2026-01-02T00:00:00.000Z', attempts: 3, solvedAt: '2026-01-02T00:05:00.000Z' }]
  }));
  const p = await platform(dir);
  try {
    const login = await p.request('login', 'POST', { email: 'old@example.com', password: 'old-password-1' });
    assert.equal(login.status, 200);
    assert.equal((await p.request('labs/lab1')).data.title, 'Old lab');
    assert.equal((await p.request('practice', 'GET', undefined, login.cookie)).data[0].attempts, 3);
    assert.ok((await readdir(dir)).includes('platform.json.migrated'));
  } finally { await p.close(); await rm(dir, { recursive: true, force: true }); }
});

test('private labs: access matrix for owner, granted, other user and anonymous', async () => {
  const p = await platform();
  try {
    const { request, signup } = p;
    const owner = await signup('Owner'), friend = await signup('Friend'), stranger = await signup('Stranger');
    const made = await request('labs', 'POST', { ...draft, title: 'Secret circuit', visibility: 'private', accessCode: 'open sesame' }, owner.cookie);
    assert.equal(made.status, 201);
    assert.equal(made.data.accessCode, 'open sesame', 'the code is shown once, at creation');
    const id = made.data.id;
    assert.equal((await request('labs/' + id + '/submit', 'POST', {}, owner.cookie)).status, 200);

    const listed = async cookie => (await request('labs', 'GET', undefined, cookie)).data.some(l => l.id === id);
    assert.equal(await listed(), false);
    assert.equal(await listed(stranger.cookie), false);
    assert.equal(await listed(owner.cookie), true);
    const anon = await request('labs/' + id);
    assert.equal(anon.status, 403);
    assert.equal(anon.data.locked, true);
    assert.equal(anon.data.lab.title, undefined, 'a locked lab does not reveal its title');
    assert.equal((await request('labs/' + id, 'GET', undefined, owner.cookie)).status, 200);
    assert.equal((await request('practice', 'POST', { labId: id }, stranger.cookie)).status, 404);
    assert.equal((await request('profiles/' + owner.id)).status, 404, 'a profile with only private labs is not public');

    assert.equal((await request('labs/' + id + '/access', 'POST', { code: 'wrong' })).status, 401);
    assert.equal((await request('labs/' + id + '/access', 'POST', { code: 'wrong code' }, friend.cookie)).status, 403);
    const ok = await request('labs/' + id + '/access', 'POST', { code: 'OPEN SESAME' }, friend.cookie);
    assert.equal(ok.status, 200, 'codes are case and space insensitive');
    assert.equal(await listed(friend.cookie), true);
    assert.equal((await request('labs/' + id, 'GET', undefined, friend.cookie)).status, 200);
    assert.equal((await request('practice', 'POST', { labId: id }, friend.cookie)).status, 200);
    assert.equal((await request('labs/' + id, 'GET', undefined, stranger.cookie)).status, 403);

    // Lockout after repeated failures.
    for (let i = 0; i < 5; i++) await request('labs/' + id + '/access', 'POST', { code: 'nope-' + i }, stranger.cookie);
    assert.equal((await request('labs/' + id + '/access', 'POST', { code: 'open sesame' }, stranger.cookie)).status, 429);

    // Owner rotates the code and revokes grants.
    assert.equal((await request('labs/' + id + '/grants', 'GET', undefined, owner.cookie)).data.length, 1);
    assert.equal((await request('labs/' + id + '/grants', 'GET', undefined, friend.cookie)).status, 403);
    const rotated = await request('labs/' + id + '/access/rotate', 'POST', { revokeGrants: true }, owner.cookie);
    assert.match(rotated.data.accessCode, /^[A-Z2-9]{8}$/);
    assert.equal((await request('labs/' + id, 'GET', undefined, friend.cookie)).status, 403);
    assert.equal((await request('labs/' + id + '/access', 'POST', { code: 'open sesame' }, friend.cookie)).status, 403);
    assert.equal((await request('labs/' + id + '/access', 'POST', { code: rotated.data.accessCode.toLowerCase() }, friend.cookie)).status, 200);

    const mine = (await request('me/labs', 'GET', undefined, owner.cookie)).data.find(l => l.id === id);
    assert.equal(mine.hasAccessCode, true);
    assert.equal(JSON.stringify(mine).includes(rotated.data.accessCode), false, 'codes are never sent again');
  } finally { await p.close(); }
});

test('follows need no approval and new public labs notify followers', async () => {
  const p = await platform();
  try {
    const { request, signup } = p;
    const maker = await signup('Maker'), fan = await signup('Fan'), quiet = await signup('Quiet'), blocked = await signup('Blocked');
    assert.equal((await request('users/' + maker.id + '/follow', 'POST', {}, fan.cookie)).data.following, true);
    assert.equal((await request('users/' + maker.id + '/follow', 'POST', {}, quiet.cookie)).status, 200);
    assert.equal((await request('users/' + fan.id + '/follow', 'POST', {}, fan.cookie)).status, 400, 'no self-follow');
    await request('users/' + maker.id + '/mute', 'POST', {}, quiet.cookie);
    await request('users/' + blocked.id + '/block', 'POST', {}, maker.cookie);
    assert.equal((await request('users/' + maker.id + '/follow', 'POST', {}, blocked.cookie)).status, 403);

    const pub = await request('labs', 'POST', draft, maker.cookie);
    await request('labs/' + pub.data.id + '/submit', 'POST', {}, maker.cookie);
    const priv = await request('labs', 'POST', { ...draft, title: 'Hidden one', visibility: 'private' }, maker.cookie);
    await request('labs/' + priv.data.id + '/submit', 'POST', {}, maker.cookie);

    const fanNotes = (await request('notifications', 'GET', undefined, fan.cookie)).data;
    assert.equal(fanNotes.unread, 1);
    assert.equal(fanNotes.items[0].type, 'new_lab');
    assert.equal(fanNotes.items[0].payload.labId, pub.data.id);
    assert.equal(JSON.stringify(fanNotes).includes('Hidden one'), false, 'private labs notify nobody');
    assert.equal((await request('notifications', 'GET', undefined, quiet.cookie)).data.unread, 0, 'muted creators do not notify');
    const since = (await request('notifications?since=' + encodeURIComponent(new Date(Date.now() + 60000).toISOString()), 'GET', undefined, fan.cookie)).data;
    assert.equal(since.items.length, 0);
    assert.equal((await request('notifications/read', 'POST', { all: true }, fan.cookie)).data.unread, 0);

    const profile = (await request('profiles/' + maker.id, 'GET', undefined, fan.cookie)).data;
    assert.equal(profile.followers, 2);
    assert.equal(profile.isFollowing, true);
    assert.equal(profile.labs.length, 1);
    await request('users/' + maker.id + '/follow', 'DELETE', {}, fan.cookie);
    assert.equal((await request('profiles/' + maker.id, 'GET', undefined, fan.cookie)).data.isFollowing, false);
  } finally { await p.close(); }
});

test('moderation: any user reports, only admins take down', async () => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  const p = await platform();
  try {
    const { request, signup } = p;
    const maker = await signup('Maker'), reader = await signup('Reader'), admin = await signup('Admin');
    const lab = await request('labs', 'POST', draft, maker.cookie);
    await request('labs/' + lab.data.id + '/submit', 'POST', {}, maker.cookie);
    assert.equal((await request('labs/' + lab.data.id + '/report', 'POST', { reason: 'Wrong physics in step 2' }, reader.cookie)).status, 201);
    assert.equal((await request('labs/' + lab.data.id + '/report', 'POST', { reason: 'Again please' }, reader.cookie)).status, 409);
    assert.equal((await request('admin/reports', 'GET', undefined, reader.cookie)).status, 403);
    const reports = (await request('admin/reports', 'GET', undefined, admin.cookie)).data;
    assert.equal(reports.length, 1);
    assert.equal((await request('admin/labs/' + lab.data.id + '/takedown', 'POST', { reason: 'Unsafe instructions' }, admin.cookie)).status, 200);
    assert.equal((await request('labs/' + lab.data.id)).status, 404);
    assert.equal((await request('labs/' + lab.data.id + '/submit', 'POST', {}, maker.cookie)).status, 403);
    assert.equal((await request('notifications', 'GET', undefined, maker.cookie)).data.items[0].type, 'lab_taken_down');
    assert.equal((await request('admin/labs/ohm/takedown', 'POST', { reason: 'Testing builtins' }, admin.cookie)).status, 400);
  } finally { delete process.env.ADMIN_EMAILS; await p.close(); }
});
