// A restart keeps what people did: case status, assignment, the resident's link and user access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { OBSERVED, SYNTHETIC, startApi } from './helpers';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-restore-'));
const file = path.join(dir, 'state.json');
const at = '2026-10-14T09:00:00.000Z';
fs.writeFileSync(file, JSON.stringify({
  version: 1,
  saved_at_utc: at,
  state: {
    cases: [
      { id: OBSERVED, status: 'assigned', techId: 'u-deniz', events: [{ type: 'created', at }, { type: 'assigned', at, techId: 'u-deniz' }] },
      // A synthetic case never takes a workflow state, even from a hand-edited file.
      { id: SYNTHETIC, status: 'dismissed', techId: null, events: [{ type: 'created', at }, { type: 'dismissed', at }] },
      { id: 'SW-HVAC-0001-20180701-ACU', status: 'review', techId: null, events: [] },
    ],
    messages: [{ id: 'm-1', techId: 'u-deniz', caseId: OBSERVED, at }],
    requests: [],
    tokens: [[OBSERVED, 'saved-token-123']],
    users: [{ id: 'u-emre', role: 'technician', screens: ['jobs'], active: false }],
  },
}));
process.env.SILENTWATT_STATE_FILE = file;
process.env.SILENTWATT_REQUEST_LOG = 'off';

let api: Awaited<ReturnType<typeof startApi>>;
before(async () => { api = await startApi(); });
after(async () => {
  await api.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('saved case state and the resident link come back after a restart', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  const detail = await api.call(`/cases/${OBSERVED}`, { cookie: operator });
  assert.equal(detail.json.status, 'assigned');
  assert.equal(detail.json.technicianName, 'Deniz Tunç');
  assert.equal((await api.call('/public/request/saved-token-123')).status, 200);

  const synthetic = await api.call(`/cases/${SYNTHETIC}`, { cookie: operator });
  assert.equal(synthetic.json.status, 'new');
});

test('a case that is no longer in the evidence is dropped, and user access is restored', async () => {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(saved.state.cases.map((c: { id: string }) => c.id).sort(), [
    'SW-HVAC-90003-20180703-ACU', 'SW-SYN-HVAC-90001-20180707-ACU', 'SW-SYN-HVAC-90002-20180722-CHR', 'SW-SYN-HVAC-90004-20180724-DQ',
  ]);
  const login = await api.call('/auth/login', { method: 'POST', body: { email: 'emre@silentwatt.demo', password: 'SilentWatt2026!' } });
  assert.equal(login.status, 401, 'a deactivated user stays deactivated');
});
