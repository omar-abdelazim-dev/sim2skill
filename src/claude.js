// Claude features offered by the artifact viewer. Each is null when this view cannot run it,
// so every caller keeps a working fallback.
export const caps = { sample: null, tts: null, ready: false };
const listeners = new Set();
export const onCaps = f => { listeners.add(f); return () => listeners.delete(f); };

export const capsReady = (async () => {
  try {
    const use = typeof window !== 'undefined' && window.claude && window.claude.use;
    if (use) {
      const [s, t] = await Promise.all([
        window.claude.use('sample').catch(() => null),
        window.claude.use('tts').catch(() => null)
      ]);
      caps.sample = s; caps.tts = t;
    }
  } catch (e) { /* not available here */ }
  caps.ready = true;
  listeners.forEach(f => f());
})();
