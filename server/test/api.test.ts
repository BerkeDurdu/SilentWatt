import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { FRIDGE, OBSERVED, SOLAR, SYNTHETIC, startApi } from './helpers';

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
  assert.equal(json.cases, 8);
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
  assert.deepEqual(list.json.counts, { open: 3, closed: 0, synthetic: 5, all: 8 });
  const open = await api.call('/cases?status=open', { cookie: operator });
  assert.deepEqual(open.json.items.map((c: { id: string }) => c.id).sort(), [OBSERVED, FRIDGE, SOLAR].sort());
  for (const action of ['review', 'dismiss']) {
    assert.equal((await api.call(`/cases/${SYNTHETIC}/${action}`, { method: 'POST', cookie: operator })).status, 409);
  }
  const assign = await api.call(`/cases/${SYNTHETIC}/assign`, { method: 'POST', cookie: operator, body: { technicianId: 'u-emre' } });
  assert.equal(assign.status, 409);
  const detail = await api.call(`/cases/${SYNTHETIC}`, { cookie: operator });
  assert.equal(detail.json.notice, null);
  assert.deepEqual(detail.json.actions, { review: false, assign: false, dismiss: false, result: false, explain: false });
  const explain = await api.call(`/cases/${SYNTHETIC}/explain`, { method: 'POST', cookie: operator, body: { kind: 'new_device' } });
  assert.equal(explain.status, 409);
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
  // Every observed device case may notify its resident; this one keeps the link the resident used.
  assert.ok(saved.state.tokens.some(([id, t]: [string, string]) => id === OBSERVED && t === token));
  assert.equal(saved.state.tokens.length, 3);
});

test('with the assistant off, the template summary is shown and no model is named', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  assert.deepEqual((await api.call('/assistant', { cookie: operator })).json, { enabled: false, model: null, location: null, reachable: false });
  const answer = await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: operator, body: {} });
  assert.equal(answer.json.provider, 'template');
  assert.equal(answer.json.fallback, 'disabled');
  assert.match(answer.json.text, /^Hane 90003, klima devresi \(air1\)/);
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
  assert.ok(lines.some((line) => line.startsWith('Doğrulama senaryosu · Klima · tüketim sapması;2;;;;')));
  assert.ok(lines.some((line) => line.startsWith('Gözlenen · Güneş paneli · üretim açığı;1;1;0;0;')));
});

test('cases filter by device family, and each family speaks its own language', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  const all = await api.call('/cases?status=all', { cookie: operator });
  assert.deepEqual(all.json.families.map((f: { key: string; count: number }) => [f.key, f.count]), [['hvac', 4], ['refrigeration', 2], ['solar', 2]]);
  const fridges = await api.call('/cases?status=all&family=refrigeration', { cookie: operator });
  assert.deepEqual(fridges.json.items.map((c: { family: string }) => c.family), ['refrigeration', 'refrigeration']);

  const solar = await api.call(`/cases/${SOLAR}`, { cookie: operator });
  assert.equal(solar.json.kind, 'production_shortfall');
  assert.equal(solar.json.title, 'Güneş paneli: üretim açığı');
  assert.equal(solar.json.run.circuit, 'solar');
  assert.match(solar.json.explanation.summary, /üretim model referansının %18 altında/);
  assert.match(solar.json.notice.text, /Güneş panelinizde 5 gün boyunca model referansının %18 altında üretim ölçtük/);
  assert.equal(solar.json.explanation.recommendation.firstCheck, 'Panellerde gölge ve kirliliği, invertör uyarılarını kontrol edin');
});

test('a reported change explains a case: it closes, and the change is exported for the detector', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  const bad = await api.call(`/cases/${FRIDGE}/explain`, { method: 'POST', cookie: operator, body: { kind: 'magic' } });
  assert.equal(bad.status, 400);
  const explained = await api.call(`/cases/${FRIDGE}/explain`, {
    method: 'POST', cookie: operator, body: { kind: 'new_device', localDate: '2018-07-08', note: 'Yeni buzdolabı alınmış' },
  });
  assert.equal(explained.status, 200);
  assert.equal(explained.json.status, 'explained');
  assert.equal(explained.json.changes[0].kindLabel, 'Yeni cihaz takıldı');
  assert.equal(explained.json.changeReported, true);

  const exported = await api.call('/changes', { cookie: operator });
  assert.equal(exported.json.schema_version, 'silentwatt.changes/0.1');
  const notice = exported.json.changes.find((n: { case_id: string }) => n.case_id === FRIDGE);
  assert.deepEqual(
    { household: notice.household_id, family: notice.family, circuit: notice.circuit, kind: notice.kind, day: notice.local_date, source: notice.source },
    { household: 90005, family: 'refrigeration', circuit: 'refrigerator1', kind: 'new_device', day: '2018-07-08', source: 'operator' },
  );
  const manager = await api.signIn('yonetim@silentwatt.demo');
  assert.equal((await api.call('/changes', { cookie: manager })).status, 404, 'the export needs the data screen');
});

test('a resident can say a new device explains the gap; it is recorded but the operator still decides', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  assert.equal((await api.call(`/cases/${SOLAR}/assign`, { method: 'POST', cookie: operator, body: { technicianId: 'u-deniz' } })).status, 200);
  const technician = await api.signIn('deniz@silentwatt.demo');
  const token = (await api.call(`/cases/${SOLAR}`, { cookie: technician })).json.notice.href.split('/').pop();
  const page = await api.call(`/public/request/${token}`);
  assert.ok(page.json.changeOptions.some((o: { value: string }) => o.value === 'new_device'));
  const body = { name: 'Burak Şen', phone: '0538 905 13 62', email: '', address: 'Ataşehir Mah. 8028 Sk. No:3, Çiğli', slot: 'any', note: '' };
  assert.equal((await api.call(`/public/request/${token}`, { method: 'POST', body: { ...body, change: 'sideways' } })).status, 400);
  const receipt = await api.call(`/public/request/${token}`, { method: 'POST', body: { ...body, change: 'repair' } });
  assert.equal(receipt.json.changeLabel, 'Onarım veya bakım yapıldı');

  const detail = await api.call(`/cases/${SOLAR}`, { cookie: operator });
  assert.equal(detail.json.status, 'assigned', 'a resident report does not close the case');
  assert.equal(detail.json.request.changeLabel, 'Onarım veya bakım yapıldı');
  assert.equal(detail.json.changes[0].sourceLabel, 'Müşteri bildirdi');
  const notes = await api.call('/notifications', { cookie: operator });
  assert.ok(notes.json.some((n: { text: string }) => n.text.startsWith('Müşteri değişiklik bildirdi')));
});
