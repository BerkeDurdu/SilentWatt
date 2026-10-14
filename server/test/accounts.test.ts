// Accounts: production refuses to start without real accounts; a users file replaces the demo accounts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { hashPassword } from '../password';
import { startApi } from './helpers';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-accounts-'));
const usersFile = path.join(dir, 'users.json');
const PASSWORD = 'a long test password';
fs.writeFileSync(usersFile, JSON.stringify([{ id: 'u-op', name: 'Test Operatör', email: 'Op@Example.test', role: 'operator', ...hashPassword(PASSWORD) }]));
process.env.SILENTWATT_USERS_FILE = usersFile;
process.env.SILENTWATT_DEMO_ACCOUNTS = 'off';
process.env.SILENTWATT_STATE_FILE = 'off';
process.env.SILENTWATT_REQUEST_LOG = 'off';

let api: Awaited<ReturnType<typeof startApi>>;
before(async () => { api = await startApi(); });
after(async () => {
  await api.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('with demo accounts off, the shared demo password opens nothing', async () => {
  const demo = await api.call('/auth/login', { method: 'POST', body: { email: 'operator@silentwatt.demo', password: 'SilentWatt2026!' } });
  assert.equal(demo.status, 401);
});

test('an account from the users file signs in; its e-mail is matched case-insensitively', async () => {
  const cookie = await api.signIn('op@example.test', PASSWORD);
  const me = await api.call('/me', { cookie });
  assert.equal(me.json.name, 'Test Operatör');
  assert.equal(me.json.roleLabel, 'Operatör');
});

test('production without any account refuses to start and says how to fix it', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const env: NodeJS.ProcessEnv = { ...process.env, SILENTWATT_STATE_FILE: 'off', SILENTWATT_REQUEST_LOG: 'off', API_PORT: '0' };
  delete env.SILENTWATT_USERS_FILE;
  delete env.SILENTWATT_DEMO_ACCOUNTS;
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'server/index.ts', '--prod'], { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /SILENTWATT_USERS_FILE/);
});
