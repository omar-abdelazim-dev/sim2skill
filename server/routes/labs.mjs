import { randomUUID } from 'node:crypto';
import { fail, nowIso, hashSecret, verifySecret, makeCode, normalizeCode, labAccess, VISIBLE_SQL, requireEntitlement, notifyFollowersOfLab } from '../lib.mjs';
import { engineOfTemplate, engineFor } from '../../shared/engines/index.js';
import { publicUser } from './auth.mjs';
import { withStatus } from '../router.mjs';
import { indexLab, removeLabFromIndex } from '../llm/rag.mjs';

const BUILDER = { maxBody: 200000 };
const FIELDS = { title: [3, 100], description: [0, 700], outcomes: [0, 1500], instructions: [0, 6000] };

export function toLab(db, l, viewer) {
  const config = l.config ? JSON.parse(l.config) : null;
  let goal = '';
  try { goal = engineFor(l.engine).goal(l.template, config || undefined); } catch { goal = ''; }
  const author = db.get('SELECT id, name, bio FROM users WHERE id = ?', l.author_id);
  const own = viewer && viewer.id === l.author_id;
  const shown = own ? config : (engineFor(l.engine).publicConfig?.(config) ?? config);
  return {
    id: l.id, authorId: l.author_id, author: publicUser(author), engine: l.engine, template: l.template,
    subject: engineFor(l.engine).subject, title: l.title, description: l.description, outcomes: l.outcomes,
    instructions: l.instructions, config: shown, goal, status: l.status, visibility: l.visibility, builtin: !!l.builtin,
    version: l.version, createdAt: l.created_at, updatedAt: l.updated_at,
    ...(own ? { isOwner: true, takenDown: !!l.taken_down, takedownReason: l.takedown_reason || undefined } : {})
  };
}

function cleanLab(body) {
  const out = {};
  for (const [k, [min, max]] of Object.entries(FIELDS)) {
    const v = body[k];
    if (typeof v !== 'string' || v.trim().length > max || v.trim().length < min) fail(400, `Please provide ${k} (up to ${max} characters).`);
    out[k] = v.trim();
  }
  if (out.title.length < 3) fail(400, 'Give your lab a title of at least 3 characters.');
  const engine = engineOfTemplate(body.template);
  if (!engine) fail(400, 'Choose a supported simulation.');
  let config;
  try { config = engine.validateConfig(body.template, body.config ?? undefined); } catch (e) { fail(400, e.message); }
  const visibility = body.visibility === undefined ? 'public' : body.visibility;
  if (!['public', 'private'].includes(visibility)) fail(400, 'Visibility must be public or private.');
  return { ...out, engine: engine.id, template: body.template, config, visibility };
}

// Owner-chosen password (6–64 characters) or a generated 8-character code. Returned once, stored hashed.
function setAccessCode(db, labId, custom) {
  let code;
  if (custom !== undefined && custom !== null && custom !== '') {
    if (typeof custom !== 'string' || custom.trim().length < 6 || custom.length > 64) fail(400, 'A custom access code needs 6–64 characters.');
    code = custom.trim();
  } else code = makeCode(8);
  const { salt, hash } = hashSecret(normalizeCode(code));
  db.run(`INSERT INTO lab_access (lab_id, salt, hash, rotated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (lab_id) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, rotated_at = excluded.rotated_at`, labId, salt, hash, nowIso());
  return code;
}

export default function register(r, { db, limit, lockout }) {
  const getLab = id => db.get('SELECT * FROM labs WHERE id = ?', id);
  const owned = (ctx, id) => {
    const user = ctx.requireUser(), l = getLab(id);
    if (!l) fail(404, 'Lab not found.');
    if (l.author_id !== user.id) fail(403, 'This lab belongs to another creator.');
    return l;
  };
  // Returns the lab if the viewer may use it; otherwise 404 (hidden) or 403 with locked:true (private, code needed).
  const viewable = (ctx, id) => {
    const l = getLab(id), access = labAccess(db, l, ctx.user);
    if (access === 'none') fail(404, 'Lab not found.');
    if (access === 'locked') fail(403, 'This lab is private. Enter the access code from its creator.',
      { locked: true, lab: { id: l.id, author: publicUser(db.get('SELECT id, name, bio FROM users WHERE id = ?', l.author_id)) } });
    return l;
  };

  r.get('labs', ctx => {
    const q = (ctx.query.get('q') || '').trim().slice(0, 100).toLowerCase();
    const rows = db.all(`SELECT l.* FROM labs l JOIN users u ON u.id = l.author_id WHERE ${VISIBLE_SQL}
      AND (:q = '' OR instr(lower(l.title || ' ' || l.description || ' ' || u.name), :q) > 0)
      ORDER BY l.builtin DESC, COALESCE(l.first_published_at, l.created_at) DESC`, { viewer: ctx.user?.id || '', q });
    return rows.map(l => toLab(db, l, ctx.user));
  });

  r.get('labs/:id', ctx => toLab(db, viewable(ctx, ctx.params.id), ctx.user));

  r.get('me/labs', ctx => {
    const user = ctx.requireUser();
    return db.all('SELECT * FROM labs WHERE author_id = ? ORDER BY created_at DESC', user.id).map(l => ({
      ...toLab(db, l, user), hasAccessCode: !!db.get('SELECT 1 FROM lab_access WHERE lab_id = ?', l.id),
      grants: db.get('SELECT COUNT(*) AS n FROM lab_grants WHERE lab_id = ?', l.id).n
    }));
  });

  r.post('labs', ctx => {
    const user = ctx.requireUser(), lab = cleanLab(ctx.body);
    requireEntitlement(db, user, 'createLab', { visibility: lab.visibility });
    requireEntitlement(db, user, 'engine', { engine: lab.engine });
    const id = randomUUID();
    let accessCode;
    db.tx(() => {
      db.run(`INSERT INTO labs (id, author_id, engine, template, title, description, outcomes, instructions, config, status, visibility, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`, id, user.id, lab.engine, lab.template, lab.title, lab.description,
        lab.outcomes, lab.instructions, JSON.stringify(lab.config), lab.visibility, nowIso());
      if (lab.visibility === 'private') accessCode = setAccessCode(db, id, ctx.body.accessCode);
    });
    return withStatus(201, { ...toLab(db, getLab(id), user), ...(accessCode ? { accessCode } : {}) });
  }, BUILDER);

  r.put('labs/:id', ctx => {
    const l = owned(ctx, ctx.params.id);
    if (l.builtin) fail(403, 'Built-in labs cannot be edited.');
    if (l.status !== 'draft') fail(409, 'Unpublish your lab before editing.');
    const lab = cleanLab(ctx.body);
    if (lab.visibility !== l.visibility) requireEntitlement(db, ctx.user, 'createLab', { visibility: lab.visibility, excludeId: l.id });
    requireEntitlement(db, ctx.user, 'engine', { engine: lab.engine });
    let accessCode;
    db.tx(() => {
      db.run(`UPDATE labs SET engine = ?, template = ?, title = ?, description = ?, outcomes = ?, instructions = ?, config = ?, visibility = ?, updated_at = ? WHERE id = ?`,
        lab.engine, lab.template, lab.title, lab.description, lab.outcomes, lab.instructions, JSON.stringify(lab.config), lab.visibility, nowIso(), l.id);
      if (lab.visibility === 'private' && (ctx.body.accessCode || !db.get('SELECT 1 FROM lab_access WHERE lab_id = ?', l.id))) accessCode = setAccessCode(db, l.id, ctx.body.accessCode);
      if (lab.visibility === 'public') db.run('DELETE FROM lab_access WHERE lab_id = ?', l.id);
    });
    return { ...toLab(db, getLab(l.id), ctx.user), ...(accessCode ? { accessCode } : {}) };
  }, BUILDER);

  const publishAction = action => async ctx => {
    const l = owned(ctx, ctx.params.id);
    if (l.builtin) fail(403, 'Built-in labs cannot be changed.');
    if (action === 'unpublish') {
      db.run(`UPDATE labs SET status = 'draft', updated_at = ? WHERE id = ?`, nowIso(), l.id);
      removeLabFromIndex(db, l.id);
      return toLab(db, getLab(l.id), ctx.user);
    }
    if (l.taken_down) fail(403, 'This lab was taken down by a moderator and cannot be republished.');
    if ([l.description, l.outcomes, l.instructions].some(x => x.length < 10)) fail(400, 'Add a description, learning outcomes, and instructions (at least 10 characters each) before submitting.');
    const engine = engineFor(l.engine), config = l.config ? JSON.parse(l.config) : undefined;
    try { engine.checkPublishable(l.template, config); } catch (e) { fail(400, e.message); }
    const first = !l.first_published_at, version = l.version + 1, now = nowIso();
    db.tx(() => {
      db.run(`UPDATE labs SET status = 'published', version = ?, first_published_at = COALESCE(first_published_at, ?), updated_at = ? WHERE id = ?`, version, now, now, l.id);
      const fresh = getLab(l.id);
      db.run('INSERT INTO lab_versions (lab_id, version, snapshot, published_at) VALUES (?, ?, ?, ?)', l.id, version, JSON.stringify(toLab(db, fresh, null)), now);
    });
    const fresh = getLab(l.id);
    if (first) notifyFollowersOfLab(db, fresh, ctx.user);
    await indexLab(db, fresh).catch(e => console.error('RAG indexing failed:', e.message));
    return toLab(db, fresh, ctx.user);
  };
  r.post('labs/:id/submit', publishAction('submit'));
  r.post('labs/:id/unpublish', publishAction('unpublish'));

  // ----- Private labs -----
  r.post('labs/:id/access', ctx => {
    const user = ctx.requireUser(), id = ctx.params.id;
    limit('access-user', user.id, 20, 15 * 60000, 'Too many attempts. Please wait a few minutes.');
    limit('access-lab', id, 100, 15 * 60000, 'Too many attempts on this lab. Please wait a few minutes.');
    const l = getLab(id), access = labAccess(db, l, user);
    if (access === 'none') fail(404, 'Lab not found.');
    if (access !== 'locked') return toLab(db, l, user);
    const key = user.id + ':' + id;
    lockout.check(key);
    const row = db.get('SELECT salt, hash FROM lab_access WHERE lab_id = ?', id);
    if (typeof ctx.body.code !== 'string' || ctx.body.code.length > 64 || !row || !verifySecret(normalizeCode(ctx.body.code), row.salt, row.hash)) {
      lockout.failure(key);
      fail(403, 'That code is not right. Check it with the lab’s creator.', { locked: true });
    }
    lockout.success(key);
    db.run(`INSERT OR IGNORE INTO lab_grants (user_id, lab_id, source, created_at) VALUES (?, ?, 'code', ?)`, user.id, id, nowIso());
    return toLab(db, l, user);
  });

  r.post('labs/:id/access/rotate', ctx => {
    const l = owned(ctx, ctx.params.id);
    if (l.visibility !== 'private') fail(400, 'Only private labs have an access code.');
    const accessCode = setAccessCode(db, l.id, ctx.body.accessCode);
    if (ctx.body.revokeGrants === true) db.run(`DELETE FROM lab_grants WHERE lab_id = ? AND source = 'code'`, l.id);
    return { accessCode };
  });

  r.get('labs/:id/grants', ctx => {
    const l = owned(ctx, ctx.params.id);
    return db.all(`SELECT u.id, u.name, g.source, g.created_at AS createdAt FROM lab_grants g JOIN users u ON u.id = g.user_id WHERE g.lab_id = ? ORDER BY g.created_at`, l.id);
  });
  r.delete('labs/:id/grants', ctx => {
    const l = owned(ctx, ctx.params.id);
    return { revoked: Number(db.run('DELETE FROM lab_grants WHERE lab_id = ?', l.id).changes) };
  });
  r.delete('labs/:id/grants/:userId', ctx => {
    const l = owned(ctx, ctx.params.id);
    return { revoked: Number(db.run('DELETE FROM lab_grants WHERE lab_id = ? AND user_id = ?', l.id, ctx.params.userId).changes) };
  });

  // ----- Moderation -----
  r.post('labs/:id/report', ctx => {
    const user = ctx.requireUser();
    limit('report', user.id, 10, 3600000);
    const l = viewable(ctx, ctx.params.id);
    const reason = typeof ctx.body.reason === 'string' ? ctx.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) fail(400, 'Tell us what is wrong (5–500 characters).');
    if (db.get(`SELECT 1 FROM reports WHERE lab_id = ? AND reporter_id = ? AND status = 'open'`, l.id, user.id)) fail(409, 'You already reported this lab. A moderator will review it.');
    db.run('INSERT INTO reports (id, lab_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)', randomUUID(), l.id, user.id, reason, nowIso());
    return withStatus(201, { ok: true });
  });

  // ----- Server-side simulation for engines with hidden answers (chemistry) -----
  r.post('labs/:id/sim', ctx => {
    const user = ctx.requireUser();
    limit('sim', user.id, 600, 60000, 'Slow down a little: too many simulation steps.');
    const l = getLab(ctx.params.id), access = labAccess(db, l, user);
    if (access === 'none' || access === 'locked') fail(404, 'Lab not available.');
    requireEntitlement(db, user, 'engine', { engine: l.engine });
    const engine = engineFor(l.engine);
    if (!engine.simulate) fail(400, 'This lab runs in your browser.');
    const config = JSON.parse(l.config), b = ctx.body;
    if (l.engine === 'titration') {
      if (!Array.isArray(b.volumes) || !b.volumes.length || b.volumes.length > 300 || b.volumes.some(v => !Number.isFinite(v) || v < 0 || v > config.burette) || typeof b.rinsed !== 'boolean')
        fail(400, 'Send up to 300 burette volumes and whether the burette was rinsed.');
      return { points: engine.simulate(l.template, config, { volumes: b.volumes, rinsed: b.rinsed }) };
    }
    if (!Number.isInteger(b.temperature)) fail(400, 'Choose a temperature.');
    try { return { run: engine.simulate(l.template, config, { temperature: b.temperature }) }; } catch (e) { fail(400, e.message); }
  });

  // ----- Practice -----
  r.get('practice', ctx => {
    const user = ctx.requireUser();
    return db.all('SELECT * FROM progress WHERE user_id = ? ORDER BY started_at', user.id).map(p => ({
      userId: p.user_id, labId: p.lab_id, labVersion: p.lab_version, title: p.title, startedAt: p.started_at,
      attempts: p.attempts, last: p.last ? JSON.parse(p.last) : undefined, solvedAt: p.solved_at || undefined
    }));
  });

  r.post('practice', ctx => {
    const user = ctx.requireUser();
    if (typeof ctx.body.labId !== 'string') fail(400, 'Choose a lab.');
    const l = getLab(ctx.body.labId), access = labAccess(db, l, user);
    if (access === 'none' || access === 'locked') fail(404, 'Lab not available.');
    requireEntitlement(db, user, 'engine', { engine: l.engine });
    let evaluation = null;
    if (ctx.body.bench !== undefined) {
      const engine = engineFor(l.engine), config = l.config ? JSON.parse(l.config) : undefined;
      try { engine.validateBench(l.template, config, ctx.body.bench); } catch (e) { fail(400, e.message); }
      evaluation = engine.evaluate(l.template, config, ctx.body.bench);
    }
    const now = nowIso();
    db.tx(() => {
      db.run(`INSERT OR IGNORE INTO progress (user_id, lab_id, lab_version, title, started_at) VALUES (?, ?, ?, ?, ?)`, user.id, l.id, l.version, l.title, now);
      db.run('UPDATE progress SET title = ?, lab_version = ? WHERE user_id = ? AND lab_id = ?', l.title, l.version, user.id, l.id);
      if (evaluation) {
        db.run(`UPDATE progress SET attempts = attempts + 1, last = ?, solved_at = CASE WHEN ? THEN ? ELSE solved_at END WHERE user_id = ? AND lab_id = ?`,
          JSON.stringify({ bench: ctx.body.bench, diagnosis: evaluation.diagnosis, date: now }), evaluation.success ? 1 : 0, now, user.id, l.id);
      }
    });
    const p = db.get('SELECT * FROM progress WHERE user_id = ? AND lab_id = ?', user.id, l.id);
    return { userId: p.user_id, labId: p.lab_id, labVersion: p.lab_version, title: p.title, startedAt: p.started_at, attempts: p.attempts,
      last: p.last ? JSON.parse(p.last) : undefined, solvedAt: p.solved_at || undefined };
  });
}
