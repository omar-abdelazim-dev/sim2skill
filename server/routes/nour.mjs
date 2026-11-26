// Nour's AI answers. Replaced by the LangChain chain in Phase 8.
import { fail, getPlan, consumeDaily } from '../lib.mjs';
import { homePrompt, labPrompt } from '../../shared/nourPrompt.js';
import { LIVE } from '../../src/labs.js';

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
  r.get('nour', () => ({ ai: !!process.env.GEMINI_API_KEY }));
  r.post('nour', async ctx => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) fail(503, 'Nour AI is not configured on this server.');
    limit('nour', ctx.actor(), 60, 600000, 'Too many questions. Please wait a few minutes.');
    if (!['home', 'lab'].includes(ctx.body.kind)) fail(400, 'Invalid conversation.');
    const merged = validateMessages(ctx.body.messages);
    consumeDaily(db, ctx.actor(), 'nour', getPlan(db, ctx.user).limits.nourPerDay);
    const system = ctx.body.kind === 'lab' ? labPrompt(ctx.body.ctx && typeof ctx.body.ctx === 'object' ? ctx.body.ctx : {}) : homePrompt(LIVE);
    const model = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').replace(/[^a-z0-9.\-]/gi, '');
    const payload = { systemInstruction: { parts: [{ text: system }] }, contents: merged.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: 1024, temperature: 0.6 } };
    let res;
    try { res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(payload) }); }
    catch { fail(502, 'Nour could not reach the AI service.'); }
    if (res.status === 429) fail(429, 'The AI is busy right now. Please wait a moment and ask again.');
    if (!res.ok) { console.error('Nour AI error', res.status); fail(502, 'Nour could not reach the AI service.'); }
    const j = await res.json();
    const text = (j.candidates?.[0]?.content?.parts || []).filter(x => typeof x.text === 'string' && !x.thought).map(x => x.text).join('').trim();
    if (!text) fail(502, 'Nour could not answer that one. Try asking another way.');
    return { text };
  });
}
