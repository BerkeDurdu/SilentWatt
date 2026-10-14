import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { OBSERVED, SYNTHETIC, startApi } from './helpers';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-api-'));
process.env.SILENTWATT_STATE_FILE = path.join(dir, 'state.json');
process.env.SILENTWATT_REQUEST_LOG = 'off';

let api: Awaited<ReturnType<typeof startApi>>;
before(async () => { api = await startApi(); });
after(async () => {
  await api.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health answers without a session and carries nothing sensitive', async () => {
  const { status, json, res } = await api.call('/health');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(json).sort(), ['cases', 'fixture', 'run_id', 'status', 'uptime_s']);
  assert.equal(json.cases, 4);
  assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
});

test('the contract path /api/v1 serves the same API', async () => {
  const res = await fetch(api.base.replace(/\/api$/, '/api/v1') + '/health');
  assert.equal(res.status, 200);
});

test('a wrong password gets a generic answer; a mutation without the CSRF header is refused', async () => {
  const wrong = await api.call('/auth/login', { method: 'POST', body: { email: 'operator@silentwatt.demo', password: 'nope' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.json, { error: 'invalid_credentials' });
  const forged = await api.call('/auth/login', { method: 'POST', body: { email: 'x', password: 'y' }, csrf: false });
  assert.equal(forged.status, 403);
});

test('screens and actions a role does not have answer 404, like a path that does not exist', async () => {
  const technician = await api.signIn('emre@silentwatt.demo');
  assert.equal((await api.call('/cases', { cookie: technician })).status, 404);
  assert.equal((await api.call(`/cases/${OBSERVED}`, { cookie: technician })).status, 404);
  const manager = await api.signIn('yonetim@silentwatt.demo');
  assert.equal((await api.call(`/cases/${OBSERVED}/review`, { method: 'POST', cookie: manager })).status, 404);
  assert.equal((await api.call('/users', { cookie: manager })).status, 404);
});

test('synthetic cases are listed apart and nobody can act on them', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  const list = await api.call('/cases?status=all', { cookie: operator });
  assert.deepEqual(list.json.counts, { open: 1, closed: 0, synthetic: 3, all: 4 });
  const open = await api.call('/cases?status=open', { cookie: operator });
  assert.deepEqual(open.json.items.map((c: { id: string }) => c.id), [OBSERVED]);
  for (const action of ['review', 'dismiss']) {
    assert.equal((await api.call(`/cases/${SYNTHETIC}/${action}`, { method: 'POST', cookie: operator })).status, 409);
  }
  const assign = await api.call(`/cases/${SYNTHETIC}/assign`, { method: 'POST', cookie: operator, body: { technicianId: 'u-emre' } });
  assert.equal(assign.status, 409);
  const detail = await api.call(`/cases/${SYNTHETIC}`, { cookie: operator });
  assert.equal(detail.json.notice, null);
  assert.deepEqual(detail.json.actions, { review: false, assign: false, dismiss: false, result: false });
});

test('case detail follows the evidence rules: no kWh, no probability, human decision stated', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  for (const lang of ['tr', 'en']) {
    const res = await fetch(`${api.base}/cases/${OBSERVED}?lang=${lang}`, { headers: { cookie: operator } });
    const text = await res.text();
    assert.doesNotMatch(text, /kwh|\bkW\b|olasılı|probabilit/i);
    const detail = JSON.parse(text);
    assert.ok(detail.explanation.humanDecisionNote.length > 0);
    assert.equal(detail.daily.length, 31);
    // Null stays null: the hot days are not scored and carry no value.
    assert.ok(detail.daily.some((d: { scored: boolean; observed_unit_hours: number | null }) => !d.scored && d.observed_unit_hours === null));
  }
});

test('the workflow runs end to end and every step is saved', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  assert.equal((await api.call(`/cases/${OBSERVED}/review`, { method: 'POST', cookie: operator })).json.status, 'review');
  const assigned = await api.call(`/cases/${OBSERVED}/assign`, { method: 'POST', cookie: operator, body: { technicianId: 'u-emre' } });
  assert.equal(assigned.json.status, 'assigned');

  const technician = await api.signIn('emre@silentwatt.demo');
  const jobs = await api.call('/jobs', { cookie: technician });
  assert.deepEqual(jobs.json.jobs.map((j: { id: string }) => j.id), [OBSERVED]);
  const detail = await api.call(`/cases/${OBSERVED}`, { cookie: technician });
  const token = detail.json.notice.href.split('/').pop();

  const page = await api.call(`/public/request/${token}`);
  assert.equal(page.status, 200);
  assert.equal(page.json.excessShare, 0.18);
  const request = await api.call(`/public/request/${token}`, {
    method: 'POST', body: { name: 'Ayşe Demir', phone: '0532 118 44 07', email: '', address: 'Şirinyer Mah. Menderes Cd. No:118, Buca', slot: 'morning', note: '' },
  });
  assert.equal(request.status, 200);

  const result = await api.call(`/cases/${OBSERVED}/result`, { method: 'POST', cookie: technician, body: { result: 'verified', note: 'Termostat programı değişmişti.' } });
  assert.equal(result.json.status, 'verified');

  const saved = JSON.parse(fs.readFileSync(process.env.SILENTWATT_STATE_FILE!, 'utf8'));
  const savedCase = saved.state.cases.find((c: { id: string }) => c.id === OBSERVED);
  assert.equal(savedCase.status, 'verified');
  assert.deepEqual(savedCase.events.map((e: { type: string }) => e.type), ['created', 'review', 'assigned', 'opened', 'requested', 'verified']);
  assert.equal(saved.state.requests.length, 1);
  assert.deepEqual(saved.state.tokens, [[OBSERVED, token]]);
});

test('an unknown resident link answers 404', async () => {
  assert.equal((await api.call('/public/request/not-a-token')).status, 404);
});

test('the report export keeps synthetic workflow columns empty and starts with a BOM', async () => {
  const manager = await api.signIn('yonetim@silentwatt.demo');
  const res = await fetch(`${api.base}/reports/monthly.csv?lang=tr`, { headers: { cookie: manager } });
  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const lines = new TextDecoder().decode(bytes.slice(3)).split('\r\n');
  assert.equal(lines[0].split(';')[0], 'Grup');
  assert.ok(lines.some((line) => line.startsWith('Sentetik · tüketim sapması;2;;;;')));
});
