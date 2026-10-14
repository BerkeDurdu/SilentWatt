// Starts the API on a free port for one test file. Environment must be set before calling: the store
// reads its configuration and the evidence once, when it is first imported.
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const OBSERVED = 'SW-HVAC-90003-20180703-ACU';
export const SYNTHETIC = 'SW-SYN-HVAC-90001-20180707-ACU';
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'silentwatt' };

export async function startApi() {
  const { app } = await import('../app');
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  async function call(path: string, options: { method?: string; body?: unknown; cookie?: string; csrf?: boolean } = {}) {
    const headers: Record<string, string> = options.csrf === false ? { 'Content-Type': 'application/json' } : { ...HEADERS };
    if (options.cookie) headers.cookie = options.cookie;
    const res = await fetch(base + path, {
      method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const json = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
    return { status: res.status, json, res };
  }

  async function signIn(email: string, password = 'SilentWatt2026!') {
    const { status, res } = await call('/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(status, 200, `sign-in failed for ${email}`);
    return res.headers.get('set-cookie')!.split(';')[0];
  }

  return { base, call, signIn, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
