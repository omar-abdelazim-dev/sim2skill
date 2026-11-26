// One way to ask Nour, wherever she appears.
// 1) Inside claude.ai: Claude, through the artifact's `sample` capability.
// 2) Local server with GEMINI_API_KEY set: POST /api/nour (Google Gemini).
// 3) Otherwise: null, and the caller uses its offline answers.
import { caps } from './claude.js';
import { OPEN_TAG, homePrompt, labPrompt } from '../shared/nourPrompt.js';
import { LIVE } from './labs.js';

let sampleOff = false, server = 'unknown'; // unknown | on | off
const listeners = new Set();
export const onNourMode = f => { listeners.add(f); return () => listeners.delete(f); };
const changed = () => listeners.forEach(f => f());

export function nourMode() {
  if (caps.sample && !sampleOff) return 'claude';
  if (server === 'on') return 'server';
  return server === 'unknown' ? 'checking' : 'offline';
}
// ask the local server once whether it has an AI key
export const nourReady = (async () => {
  try { const r = await fetch('/api/nour'); const j = await r.json().catch(() => ({})); server = r.ok && j.ai ? 'on' : 'off'; }
  catch (e) { server = 'off'; }
  changed();
})();

export function splitOpen(text) {
  const m = OPEN_TAG.exec(text || '');
  const open = m && LIVE.some(l => l.id === m[1]) ? m[1] : null;
  return { text: (text || '').replace(OPEN_TAG, '').trim(), open };
}

/** kind: 'home' | 'lab'; history: [{role:'user'|'nour', text}]; ctx: lab context for 'lab'. */
export async function askNour({ kind, history, ctx, labId, state, onText, signal }) {
  const msgs = history.filter(m => m.text).slice(-12);
  if (caps.sample && !sampleOff) {
    const system = kind === 'lab' ? labPrompt(ctx) : homePrompt(LIVE);
    const transcript = msgs.map(m => (m.role === 'user' ? 'Student: ' : 'Nour: ') + m.text).join('\n');
    try {
      const out = await caps.sample(`${system}\n\nConversation so far:\n${transcript}\n\nWrite Nour's next reply.`,
        { cache: false, modelTier: 'quick', signal, onText: onText ? ({ text }) => onText(text === 'Thinking...' ? '' : splitOpen(text).text) : undefined });
      return { ...splitOpen(out && out.text), via: 'claude' };
    } catch (err) {
      if (err && err.code === 'not_granted') { sampleOff = true; changed(); }
      else if (err && err.code === 'rate_limited') return { text: 'I am getting a lot of questions right now. Give me a moment and ask again.', via: 'claude' };
    }
  }
  if (server !== 'off') {
    try {
      const r = await fetch('/api/nour', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ kind, ctx: kind === 'lab' ? ctx : undefined, labId: kind === 'lab' ? labId : undefined, state: kind === 'lab' ? state : undefined, messages: msgs.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.slice(0, 2000) })) }) });
      if (r.ok) { const j = await r.json(); if (server !== 'on') { server = 'on'; changed(); } return { ...splitOpen(j.text), via: 'server' }; }
      if (r.status === 503 || r.status === 404) { server = 'off'; changed(); }
      else if (r.status === 429) return { text: 'I need a short break. Try again in a few minutes.', via: 'server' };
    } catch (e) { if (signal && signal.aborted) return null; }
  }
  return null;
}
