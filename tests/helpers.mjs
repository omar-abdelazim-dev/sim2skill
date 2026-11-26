// Disposable platform server for tests: a fresh temp data folder per call.
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformHandler } from '../server/platform.mjs';

export async function platform(dir) {
  const own = !dir;
  dir ||= await mkdtemp(join(tmpdir(), 's2s-test-'));
  const h = await createPlatformHandler(dir);
  const server = createServer((q, s) => h(q, s, () => { s.statusCode = 404; s.end(); }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  async function request(path, method = 'GET', data, cookie, headers = {}) {
    const r = await fetch(base + path, {
      method,
      headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: data !== undefined ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined
    });
    return { status: r.status, data: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0], header: r.headers.get('set-cookie') };
  }
  async function signup(name) {
    const r = await request('signup', 'POST', { name, email: name.toLowerCase().replace(/\s/g, '') + '@example.com', password: 'test-password-42' });
    return { ...r, id: r.data?.user?.id };
  }
  return {
    dir, base, request, signup,
    async close({ keep = false } = {}) {
      await new Promise(r => server.close(r));
      if (own && !keep) await rm(dir, { recursive: true, force: true });
    }
  };
}

export const draft = {
  template: 'led', title: 'Protect a tiny light',
  description: 'Investigate current limiting in an LED circuit.',
  outcomes: 'Understand how resistance controls current.',
  instructions: 'Predict what happens without resistance. Test the circuit, then change the resistor.'
};
