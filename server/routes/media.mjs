// Uploaded images: profile pictures and lab thumbnails. Stored as BLOBs in SQLite, so backups stay one file.
// The browser resizes images before upload; the server checks the real file type from its first bytes.
import { randomUUID } from 'node:crypto';
import { fail, nowIso } from '../lib.mjs';
import { selfUser } from './auth.mjs';
import { toLab } from './labs.mjs';

export const MAX_IMAGE_BYTES = 900 * 1024;
const UPLOAD = { maxBody: Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096 };

// Accepts a data URL ("data:image/png;base64,...") and returns { mime, bytes } after checking the signature.
export function decodeImage(value) {
  const m = typeof value === 'string' && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m) fail(400, 'Upload a PNG, JPEG or WebP image.');
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) fail(400, 'The image is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) fail(413, 'Images must be smaller than 900 KB.');
  const sniffed =
    bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG' ? 'image/png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
        : bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp'
          : null;
  if (!sniffed) fail(400, 'That file is not a PNG, JPEG or WebP image.');
  return { mime: sniffed, bytes };
}

export default function register(r, { db, limit }) {
  const store = (owner, image) => {
    const { mime, bytes } = decodeImage(image);
    const id = randomUUID();
    db.run('INSERT INTO media (id, owner_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)', id, owner, mime, bytes, nowIso());
    return id;
  };
  const drop = id => { if (id) db.run('DELETE FROM media WHERE id = ?', id); };

  r.get('media/:id', ctx => {
    const m = db.get('SELECT mime, data FROM media WHERE id = ?', ctx.params.id);
    if (!m) fail(404, 'Image not found.');
    const { res } = ctx;
    res.statusCode = 200;
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // ids are never reused
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.end(Buffer.from(m.data));
  });

  r.put('me/avatar', ctx => {
    const me = ctx.requireUser();
    limit('upload', me.id, 40, 3600000, 'Too many uploads. Please wait a little.');
    const old = db.get('SELECT avatar_id FROM users WHERE id = ?', me.id).avatar_id;
    db.tx(() => {
      const id = store(me.id, ctx.body.image);
      db.run('UPDATE users SET avatar_id = ? WHERE id = ?', id, me.id);
      drop(old);
    });
    return { user: selfUser(db, db.get('SELECT * FROM users WHERE id = ?', me.id)) };
  }, UPLOAD);

  r.delete('me/avatar', ctx => {
    const me = ctx.requireUser();
    const old = db.get('SELECT avatar_id FROM users WHERE id = ?', me.id).avatar_id;
    db.tx(() => { db.run('UPDATE users SET avatar_id = NULL WHERE id = ?', me.id); drop(old); });
    return { user: selfUser(db, db.get('SELECT * FROM users WHERE id = ?', me.id)) };
  });

  // A thumbnail is cosmetic, so owners may change it on drafts and on published labs alike.
  const ownedLab = ctx => {
    const me = ctx.requireUser(), l = db.get('SELECT * FROM labs WHERE id = ?', ctx.params.id);
    if (!l) fail(404, 'Lab not found.');
    if (l.author_id !== me.id) fail(403, 'This lab belongs to another creator.');
    return { me, l };
  };

  r.put('labs/:id/thumbnail', ctx => {
    const { me, l } = ownedLab(ctx);
    limit('upload', me.id, 40, 3600000, 'Too many uploads. Please wait a little.');
    db.tx(() => {
      const id = store(me.id, ctx.body.image);
      db.run('UPDATE labs SET thumbnail_id = ? WHERE id = ?', id, l.id);
      drop(l.thumbnail_id);
    });
    return toLab(db, db.get('SELECT * FROM labs WHERE id = ?', l.id), me);
  }, UPLOAD);

  r.delete('labs/:id/thumbnail', ctx => {
    const { me, l } = ownedLab(ctx);
    db.tx(() => { db.run('UPDATE labs SET thumbnail_id = NULL WHERE id = ?', l.id); drop(l.thumbnail_id); });
    return toLab(db, db.get('SELECT * FROM labs WHERE id = ?', l.id), me);
  });
}
