// Sim2Skill platform API. Exposed as Vite middleware (vite.config.js) and by server/start.mjs.
// The exported createPlatformHandler(directory) signature is stable; tests and both servers depend on it.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import CORE from '../src/lab/core.js';
import { BASE } from '../shared/labConfig.js';
import { openDb, importLegacyJson } from './db.mjs';
import { ENGINES } from '../shared/engines/index.js';
import { fail, nowIso, sha256, createLimiter, createLockout } from './lib.mjs';
import { createRouter, STATUS } from './router.mjs';
import authRoutes from './routes/auth.mjs';
import labRoutes from './routes/labs.mjs';
import socialRoutes from './routes/social.mjs';
import adminRoutes from './routes/admin.mjs';
import billingRoutes from './routes/billing.mjs';
import nourRoutes from './routes/nour.mjs';
import { indexMissing } from './llm/rag.mjs';

const ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'DEMO_MODE', 'PAYMENT_PROVIDER', 'ADMIN_EMAILS', 'COOKIE_SECURE', 'MOCK_WEBHOOK_SECRET'];

// Reads known settings from a git-ignored .env file in the project folder. Values already set in the shell win.
export async function loadEnvFile(file = resolve('.env')) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !ENV_KEYS.includes(m[1]) || process.env[m[1]]) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (v) process.env[m[1]] = v;
  }
}

const SESSION_MS = 7 * 86400000;
const CHEMISTRY_BUILTINS = [
  { id: 'titration', engine: 'titration', title: 'Acid–base titration: vinegar strength',
    description: 'Find the acetic acid concentration of a diluted vinegar sample by titration with standard sodium hydroxide.',
    outcomes: 'Choose an indicator from the equivalence pH. Read a burette endpoint precisely. Use stoichiometry and dilution to find an unknown concentration. Interpret a weak-acid titration curve, including the buffer region where pH = pKa.',
    instructions: '1. Rinse the burette with titrant before filling it.\n2. Choose an indicator.\n3. Add NaOH in large steps first, then in drops near the endpoint, swirling each time.\n4. Record the volume at the first permanent colour change.\n5. Calculate the original concentration, remembering the dilution, and submit it.',
    config: { analyte: 'acetic_acid', analyteConc: 0.85, analyteVolume: 25, dilution: 10, titrant: 'naoh', titrantConc: 0.1, endpoint: 1,
      indicators: ['methyl_orange', 'methyl_red', 'bromothymol_blue', 'phenolphthalein'], tolerance: 2, burette: 50 } },
  { id: 'kinetics', engine: 'kinetics', title: 'Reaction kinetics: crystal violet fading',
    description: 'Follow the fading of crystal violet in excess hydroxide at several temperatures to find the rate law and the activation energy.',
    outcomes: 'Identify a reaction order from integrated rate-law plots. Extract rate constants from slopes. Use an Arrhenius plot to find the activation energy, with temperatures in kelvin.',
    instructions: '1. Run the reaction at each temperature.\n2. Compare [A], ln[A] and 1/[A] against time and pick the straight one.\n3. Take k from the slope at each temperature.\n4. Plot ln k against 1/T (in kelvin) and find Ea from the slope.\n5. Submit the order and Ea in kJ/mol.',
    config: { reaction: 'crystal_violet', k25: 0.0025, EaKJ: 59, c0: 2.5e-5, temperatures: [15, 25, 35, 45], tolerance: 10 } }
];
const builtinInstructions = 'Choose your components, predict the result, and run the circuit. Use the measurements and Nour’s hints to meet the goal.';

function seed(db) {
  const now = nowIso();
  db.tx(() => {
    db.run(`INSERT OR IGNORE INTO users (id, name, bio, created_at) VALUES ('sim2skill', 'Sim2Skill team', 'Hands-on physics and chemistry experiments, built for curious minds.', ?)`, now);
    for (const [template, e] of Object.entries(BASE)) {
      if (db.get('SELECT 1 FROM labs WHERE id = ?', template)) continue;
      db.run(`INSERT INTO labs (id, author_id, engine, template, title, description, outcomes, instructions, status, visibility, builtin, version, first_published_at, created_at)
              VALUES (?, 'sim2skill', 'circuits', ?, ?, ?, ?, ?, 'published', 'public', 1, 1, ?, ?)`,
        template, template, e.title, e.intro, e.goal, builtinInstructions, now, now);
    }
    for (const lab of CHEMISTRY_BUILTINS) {
      if (db.get('SELECT 1 FROM labs WHERE id = ?', lab.id)) continue;
      const config = ENGINES[lab.engine].validateConfig(lab.id, lab.config);
      db.run(`INSERT INTO labs (id, author_id, engine, template, title, description, outcomes, instructions, config, status, visibility, builtin, version, first_published_at, created_at)
              VALUES (?, 'sim2skill', ?, ?, ?, ?, ?, ?, ?, 'published', 'public', 1, 1, ?, ?)`,
        lab.id, lab.engine, lab.id, lab.title, lab.description, lab.outcomes, lab.instructions, JSON.stringify(config), now, now);
    }
  });
}

export async function createPlatformHandler(directory = process.env.DATA_DIR || '.data') {
  await loadEnvFile();
  const dir = resolve(directory);
  await mkdir(dir, { recursive: true });
  const db = openDb(dir);
  seed(db);
  importLegacyJson(db, dir);
  db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  await indexMissing(db);

  const router = createRouter();
  const deps = { db, limit: createLimiter(), lockout: createLockout(), CORE };
  for (const register of [authRoutes, labRoutes, socialRoutes, adminRoutes, billingRoutes, nourRoutes]) register(router, deps);

  const adminEmails = () => (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  return async function handler(req, res, next) {
    const url = new URL(req.url, 'http://local');
    if (!url.pathname.startsWith('/api/')) return next?.();
    const reply = (status, value) => {
      if (res.headersSent) return;
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(value));
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail(403, 'Request origin does not match.');
      const segments = url.pathname.split('/').filter(Boolean).slice(1);
      const match = router.match(req.method, segments);
      if (!match) fail(404, 'Endpoint not found.');

      const token = /(?:^|;\s*)s2s_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
      const session = token && db.get('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', sha256(token));
      let user = session && session.expires_at > Date.now() ? db.get('SELECT * FROM users WHERE id = ?', session.user_id) : null;
      if (user && user.email && !user.is_admin && adminEmails().includes(user.email)) {
        db.run('UPDATE users SET is_admin = 1 WHERE id = ?', user.id); user.is_admin = 1;
      }

      const raw = await readBody(req, match.route.opts.maxBody || 24000);
      let body = {};
      if (!match.route.opts.raw && raw.length) { try { body = JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); } }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid JSON.');

      const ip = req.socket.remoteAddress || 'unknown';
      const ctx = {
        req, res, url, params: match.params, query: url.searchParams, body, raw, ip, user, token, reply,
        actor: () => (user ? 'u:' + user.id : 'ip:' + ip),
        requireUser() { if (!user) fail(401, 'Please sign in to continue.'); return user; },
        requireAdmin() { if (!user?.is_admin) fail(403, 'Administrators only.'); return user; },
        startSession(account) {
          const key = randomBytes(32).toString('hex');
          db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(key), account.id, Date.now() + SESSION_MS);
          const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
          res.setHeader('Set-Cookie', `s2s_session=${key}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
        },
        endSession() {
          if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
          res.setHeader('Set-Cookie', 's2s_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        }
      };
      const out = await match.route.handler(ctx);
      if (out !== undefined) out?.[STATUS] ? reply(out[STATUS], out.body) : reply(200, out);
    } catch (e) {
      if (!e.expose) console.error('Platform error:', e?.message || e);
      reply(e.expose ? e.status : 500, { error: e.expose ? e.message : 'Unable to save changes. Please try again.', ...(e.expose && e.extra ? e.extra : {}) });
    }
  };
}

async function readBody(req, max) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return '';
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > max) fail(413, 'Request is too large.');
  }
  return raw;
}
