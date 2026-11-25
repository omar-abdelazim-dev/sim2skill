// Nour's chat endpoint: off without a key, and when on, the server builds Nour's prompt itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformHandler } from '../server/platform.mjs';
import { splitOpen } from '../src/nour.js';

async function serve() {
  const handler = await createPlatformHandler(await mkdtemp(join(tmpdir(), 's2s-nour-')));
  const srv = createServer((q, r) => handler(q, r, () => { r.statusCode = 404; r.end(); }));
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${srv.address().port}/api/nour`, close: () => srv.close() };
}
const realFetch = globalThis.fetch;
const ask = (url, body) => realFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('without an API key Nour reports offline', async () => {
  delete process.env.GEMINI_API_KEY;
  const s = await serve();
  assert.deepEqual(await (await realFetch(s.url)).json(), { ai: false });
  assert.equal((await ask(s.url, { kind: 'lab', messages: [{ role: 'user', content: 'hi' }] })).status, 503);
  s.close();
});

test('with a key the server sends a lab prompt built from the bench state', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let sent = null;
  globalThis.fetch = async (u, o) => { if (String(u).startsWith('https://generativelanguage.googleapis.com/')) { sent = { url: String(u), key: o.headers['x-goog-api-key'], ...JSON.parse(o.body) }; return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: 'What does the meter read?' }] } }] }), { status: 200 }); } return realFetch(u, o); };
  try {
    const s = await serve();
    assert.deepEqual(await (await realFetch(s.url)).json(), { ai: true });
    const r = await ask(s.url, { kind: 'lab', ctx: { title: 'LED with a resistor', goal: 'Light the LED', state: { detected_mistake: 'led_reversed' } }, messages: [{ role: 'assistant', content: 'Welcome' }, { role: 'user', content: 'why is it dark?' }] });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).text, 'What does the meter read?');
    assert.match(sent.url, /models\/gemini-[a-z0-9.-]+:generateContent$/);
    assert.equal(sent.key, 'test-key');
    assert.match(sent.systemInstruction.parts[0].text, /LED with a resistor/);
    assert.match(sent.systemInstruction.parts[0].text, /led_reversed/);
    assert.equal(sent.contents[0].role, 'user');
    assert.equal(sent.contents.length, 1);
    assert.equal((await ask(s.url, { kind: 'anything', messages: [{ role: 'user', content: 'x' }] })).status, 400);
    s.close();
  } finally { globalThis.fetch = realFetch; delete process.env.GEMINI_API_KEY; }
});

test('an open-lab tag is removed from the text and only accepts live labs', () => {
  assert.deepEqual(splitOpen('Taking you there. [[open:led]]'), { text: 'Taking you there.', open: 'led' });
  assert.equal(splitOpen('Sure [[open:pendulum]]').open, null);
});

test('the server reads the Gemini key from a .env file without overriding the shell', async () => {
  const { loadEnvFile } = await import('../server/platform.mjs');
  const { writeFile, mkdtemp } = await import('node:fs/promises');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const f = join(await mkdtemp(join(tmpdir(), 'env-')), '.env');
  await writeFile(f, '# comment\r\nGEMINI_API_KEY="abc123"\nGEMINI_MODEL=gemini-3.8-flash\nOTHER=nope\n');
  delete process.env.GEMINI_API_KEY; process.env.GEMINI_MODEL = 'from-shell'; delete process.env.OTHER;
  await loadEnvFile(f);
  assert.equal(process.env.GEMINI_API_KEY, 'abc123');
  assert.equal(process.env.GEMINI_MODEL, 'from-shell');
  assert.equal(process.env.OTHER, undefined);
  delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL;
});
