import { fail, nowIso, VISIBLE_SQL } from '../lib.mjs';
import { publicUser } from './auth.mjs';
import { toLab } from './labs.mjs';

export default function register(r, { db, limit }) {
  const target = (ctx, id) => {
    const me = ctx.requireUser();
    if (id === me.id) fail(400, 'You cannot do that to your own account.');
    const u = db.get('SELECT id, name, bio FROM users WHERE id = ? AND email IS NOT NULL', id);
    if (!u) fail(404, 'User not found.');
    return { me, u };
  };

  r.get('profiles/:id', ctx => {
    const u = db.get('SELECT id, name, bio FROM users WHERE id = ?', ctx.params.id);
    const viewer = ctx.user?.id || '';
    const hasPublic = u && db.get(`SELECT 1 FROM labs WHERE author_id = ? AND status = 'published' AND visibility = 'public' AND taken_down = 0`, u.id);
    if (!u || (!hasPublic && viewer !== u.id)) fail(404, 'Profile not found.');
    const labs = db.all(`SELECT l.* FROM labs l WHERE l.author_id = :author AND ${VISIBLE_SQL} ORDER BY l.first_published_at DESC`, { author: u.id, viewer });
    const count = sql => db.get(sql, u.id).n;
    return {
      user: publicUser(u), labs: labs.map(l => toLab(db, l, ctx.user)),
      followers: count('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?'),
      following: count('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?'),
      isFollowing: !!(viewer && db.get('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?', viewer, u.id)),
      isMuted: !!(viewer && db.get('SELECT 1 FROM mutes WHERE user_id = ? AND muted_id = ?', viewer, u.id)),
      isBlocked: !!(viewer && db.get('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', viewer, u.id))
    };
  });

  // Following needs no approval. A block (either way) prevents it.
  r.post('users/:id/follow', ctx => {
    const { me, u } = target(ctx, ctx.params.id);
    limit('follow', me.id, 120, 3600000);
    if (db.get('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', u.id, me.id, me.id, u.id))
      fail(403, 'You cannot follow this user.');
    db.run('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)', me.id, u.id, nowIso());
    return { following: true };
  });
  r.delete('users/:id/follow', ctx => {
    const { me, u } = target(ctx, ctx.params.id);
    db.run('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?', me.id, u.id);
    return { following: false };
  });
  r.post('users/:id/block', ctx => {
    const { me, u } = target(ctx, ctx.params.id);
    db.tx(() => {
      db.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, u.id, nowIso());
      db.run('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)', me.id, u.id, u.id, me.id);
    });
    return { blocked: true };
  });
  r.delete('users/:id/block', ctx => {
    const { me, u } = target(ctx, ctx.params.id);
    db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', me.id, u.id);
    return { blocked: false };
  });
  r.post('users/:id/mute', ctx => {
    const { me, u } = target(ctx, ctx.params.id);
    db.run('INSERT OR IGNORE INTO mutes (user_id, muted_id, created_at) VALUES (?, ?, ?)', me.id, u.id, nowIso());
    return { muted: true };
  });
  r.delete('users/:id/mute', ctx => {
    const { me, u } = target(ctx, ctx.params.id);
    db.run('DELETE FROM mutes WHERE user_id = ? AND muted_id = ?', me.id, u.id);
    return { muted: false };
  });

  r.get('me/following', ctx => {
    const me = ctx.requireUser();
    return db.all('SELECT u.id, u.name, u.bio FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC', me.id);
  });

  // Polled every 30 s by the bell in the nav.
  r.get('notifications', ctx => {
    const me = ctx.requireUser();
    const since = ctx.query.get('since');
    const rows = since && !Number.isNaN(Date.parse(since))
      ? db.all('SELECT * FROM notifications WHERE user_id = ? AND created_at > ? ORDER BY id DESC LIMIT 50', me.id, since)
      : db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', me.id);
    return {
      items: rows.map(n => ({ id: n.id, type: n.type, payload: JSON.parse(n.payload), read: !!n.read_at, createdAt: n.created_at })),
      unread: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', me.id).n
    };
  });
  r.post('notifications/read', ctx => {
    const me = ctx.requireUser(), now = nowIso();
    if (ctx.body.all === true) db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now, me.id);
    else {
      const ids = ctx.body.ids;
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(i => !Number.isInteger(i))) fail(400, 'Send the notification ids to mark as read.');
      db.tx(() => ids.forEach(i => db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now, i, me.id)));
    }
    return { unread: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', me.id).n };
  });
}
