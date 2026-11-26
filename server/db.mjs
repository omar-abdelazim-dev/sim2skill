// SQLite storage on Node's built-in node:sqlite (Node 22.13+). Chosen over better-sqlite3 because it needs
// no native build or prebuilt download, so `npm install` works on Windows behind TLS-inspecting networks,
// and it ships with FTS5 (used by the RAG retriever). See docs/architecture.md.
import './quiet-sqlite.mjs';
const { DatabaseSync } = await import('node:sqlite'); // loaded after the warning filter
import { readFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const clean = row => (row ? { ...row } : row);

export function openDb(dir) {
  const raw = new DatabaseSync(join(dir, 'platform.db'));
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const cache = new Map();
  const stmt = sql => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  let depth = 0;
  const db = {
    raw,
    get: (sql, ...params) => clean(stmt(sql).get(...params)),
    all: (sql, ...params) => stmt(sql).all(...params).map(clean),
    run: (sql, ...params) => stmt(sql).run(...params),
    exec: sql => raw.exec(sql),
    // Nested calls join the outer transaction.
    tx(fn) {
      if (depth) return fn();
      depth++;
      raw.exec('BEGIN IMMEDIATE');
      try { const out = fn(); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
      finally { depth--; }
    },
    close: () => raw.close()
  };
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.all('SELECT name FROM schema_migrations').map(r => r.name));
  for (const name of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    db.tx(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', name, new Date().toISOString());
    });
  }
}

// One-time import of the JSON store used before v2. Password hashes are kept as they are.
export function importLegacyJson(db, dir) {
  const file = join(dir, 'platform.json');
  if (!existsSync(file)) return false;
  const old = JSON.parse(readFileSync(file, 'utf8'));
  const now = new Date().toISOString();
  db.tx(() => {
    for (const u of old.users || []) {
      db.run('INSERT OR IGNORE INTO users (id, email, name, bio, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        u.id, u.email ?? null, u.name, u.bio || '', u.salt ?? null, u.hash ?? null, u.createdAt || now);
    }
    for (const l of old.labs || []) {
      db.run(`INSERT OR IGNORE INTO labs (id, author_id, template, title, description, outcomes, instructions, config, status, builtin, version, first_published_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        l.id, l.authorId, l.template, l.title, l.description || '', l.outcomes || '', l.instructions || '',
        l.config ? JSON.stringify(l.config) : null, l.status === 'published' ? 'published' : 'draft',
        l.authorId === 'sim2skill' ? 1 : 0, l.status === 'published' ? 1 : 0,
        l.status === 'published' ? (l.updatedAt || l.createdAt || now) : null, l.createdAt || now, l.updatedAt || null);
    }
    for (const p of old.progress || []) {
      if (!db.get('SELECT 1 FROM users WHERE id = ?', p.userId) || !db.get('SELECT 1 FROM labs WHERE id = ?', p.labId)) continue;
      db.run(`INSERT OR IGNORE INTO progress (user_id, lab_id, title, started_at, attempts, last, solved_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        p.userId, p.labId, p.title || '', p.startedAt || now, p.attempts || 0, p.last ? JSON.stringify(p.last) : null, p.solvedAt || null);
    }
  });
  renameSync(file, join(dir, 'platform.json.migrated'));
  return true;
}
