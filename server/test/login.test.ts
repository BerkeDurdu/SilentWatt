// Sign-in limits and session idle time. A file of its own: its failed logins would block the others.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startApi } from './helpers';

process.env.SILENTWATT_STATE_FILE = 'off';
process.env.SILENTWATT_REQUEST_LOG = 'off';
process.env.SILENTWATT_SESSION_IDLE_MINUTES = '0.005'; // 300 ms

let api: Awaited<ReturnType<typeof startApi>>;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

test('a session ends after its idle time', async () => {
  const cookie = await api.signIn('operator@silentwatt.demo');
  assert.equal((await api.call('/me', { cookie })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal((await api.call('/me', { cookie })).status, 401);
});

test('one account cannot be guessed at for long, whatever the address', async () => {
  for (let i = 0; i < 10; i++) await api.call('/auth/login', { method: 'POST', body: { email: 'deniz@silentwatt.demo', password: `guess-${i}` } });
  const right = await api.call('/auth/login', { method: 'POST', body: { email: 'deniz@silentwatt.demo', password: 'SilentWatt2026!' } });
  assert.equal(right.status, 429, 'the account waits out its window');
});

test('one address cannot try password after password across many accounts', async () => {
  for (let i = 0; i < 20; i++) await api.call('/auth/login', { method: 'POST', body: { email: `user${i}@example.test`, password: 'Winter2026!' } });
  const next = await api.call('/auth/login', { method: 'POST', body: { email: 'emre@silentwatt.demo', password: 'SilentWatt2026!' } });
  assert.equal(next.status, 429);
});

test('production with demo accounts but the public demo password refuses to start', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const env: NodeJS.ProcessEnv = { ...process.env, SILENTWATT_DEMO_ACCOUNTS: 'on', API_PORT: '0' };
  delete env.SILENTWATT_DEMO_PASSWORD;
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'server/index.ts', '--prod'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /SILENTWATT_DEMO_PASSWORD/);
});
