// Nour: LangChain chain over Gemini with access-filtered RAG. The browser sends kind, labId, bench state and
// messages; lab title, goal and instructions are loaded from the database (ctx from the browser is ignored).
import { fail, getPlan, consumeDaily } from '../lib.mjs';
import { createNourChain } from '../llm/chains.mjs';
import { aiConfigured, mapAiError } from '../llm/models.mjs';

export function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 20) fail(400, 'Invalid conversation.');
  const merged = [];
  for (const m of messages) {
    if (!['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2000) fail(400, 'Invalid message.');
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content; else merged.push({ role: m.role, content: m.content });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  if (!merged.length || merged[merged.length - 1].role !== 'user') fail(400, 'The conversation must end with a question.');
  return merged;
}

export default function register(r, { db, limit }) {
  const chain = createNourChain(db);
  r.get('nour', () => ({ ai: aiConfigured() }));
  r.post('nour', async ctx => {
    if (!aiConfigured()) fail(503, 'Nour AI is not configured on this server.');
    limit('nour', ctx.actor(), 60, 600000, 'Too many questions. Please wait a few minutes.');
    if (!['home', 'lab'].includes(ctx.body.kind)) fail(400, 'Invalid conversation.');
    if (ctx.body.kind === 'lab' && typeof ctx.body.labId !== 'string') fail(400, 'Tell Nour which lab you are in.');
    const messages = validateMessages(ctx.body.messages);
    consumeDaily(db, ctx.actor(), 'nour', getPlan(db, ctx.user).limits.nourPerDay);
    try {
      return await chain.invoke({ kind: ctx.body.kind, labId: ctx.body.labId, state: ctx.body.state, messages },
        { configurable: { viewer: ctx.user, viewerId: ctx.user?.id || '' } });
    } catch (e) {
      if (e?.expose) throw e; // our own errors (404 lab, quota, etc.)
      const mapped = mapAiError(e);
      if (mapped.status !== 429) console.error('Nour AI error:', e?.status || '', String(e?.message || e).slice(0, 200));
      fail(mapped.status, mapped.message);
    }
  });
}
