// What a stranger with a resident's link, a role with masked addresses or an admin can and cannot do.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { databaseSsl } from '../persist';
import { FRIDGE, OBSERVED, SOLAR, codeOf, startApi } from './helpers';

process.env.SILENTWATT_STATE_FILE = 'off';
process.env.SILENTWATT_REQUEST_LOG = 'off';

let api: Awaited<ReturnType<typeof startApi>>;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

/** Assigns a case to Emre and returns the link token and its code, as the technician sees them. */
async function assigned(caseId: string) {
  const operator = await api.signIn('operator@silentwatt.demo');
  if ((await api.call(`/cases/${caseId}`, { cookie: operator })).json.status !== 'assigned') {
    assert.equal((await api.call(`/cases/${caseId}/assign`, { method: 'POST', cookie: operator, body: { technicianId: 'u-emre' } })).status, 200);
  }
  const technician = await api.signIn('emre@silentwatt.demo');
  const detail = (await api.call(`/cases/${caseId}`, { cookie: technician })).json;
  return { token: detail.notice.href.split('/').pop() as string, code: codeOf(detail), operator, technician };
}

const REQUEST = { name: 'Ayşe Demir', phone: '0532 118 44 07', email: 'ayse.demir@ornek.com', address: 'Kazımdirik Mah. 372/4 Sk. No:9, Bornova', slot: 'morning', note: '' };

test('the bare link shows nothing about the resident or their home', async () => {
  const { token } = await assigned(OBSERVED);
  const gate = await api.call(`/public/request/${token}`);
  assert.equal(gate.status, 200);
  assert.deepEqual(gate.json, { verify: true });
});

test('a wrong code opens nothing, and five wrong codes lock the link', async () => {
  const { token, code } = await assigned(SOLAR);
  const wrong = code === '0000' ? '1111' : '0000';
  const first = await api.call(`/public/request/${token}/open`, { method: 'POST', body: { code: wrong } });
  assert.equal(first.status, 403);
  assert.equal(first.json.error, 'wrong_code');
  assert.equal(JSON.stringify(first.json).includes('Burak'), false);
  for (let i = 0; i < 4; i++) await api.call(`/public/request/${token}/open`, { method: 'POST', body: { code: wrong } });
  const locked = await api.call(`/public/request/${token}/open`, { method: 'POST', body: { code } });
  assert.equal(locked.status, 429, 'even the right code waits once the link is locked');
  assert.equal(locked.json.error, 'locked');
});

test('the right code opens the page; sending the form needs the code too, and only a few times', async () => {
  const { token, code } = await assigned(OBSERVED);
  const page = await api.call(`/public/request/${token}/open`, { method: 'POST', body: { code } });
  assert.equal(page.status, 200);
  assert.equal(page.json.customer.name, 'Hacer Yalçın', 'prefilled once the code matched');
  assert.equal((await api.call(`/public/request/${token}`, { method: 'POST', body: REQUEST })).status, 403, 'no code, no request');
  for (let i = 0; i < 5; i++) {
    assert.equal((await api.call(`/public/request/${token}`, { method: 'POST', body: { ...REQUEST, code } })).status, 200);
  }
  const sixth = await api.call(`/public/request/${token}`, { method: 'POST', body: { ...REQUEST, code } });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.json.error, 'too_many_updates');
});

test('roles with masked addresses see the request with a masked name and phone and no e-mail', async () => {
  const { operator, technician } = await assigned(OBSERVED);
  const seen = (await api.call(`/cases/${OBSERVED}`, { cookie: operator })).json.request;
  assert.equal(seen.name, 'A*** D***');
  assert.equal(seen.phone, '••• ••• •• 07');
  assert.equal(seen.email, null);
  assert.equal((await api.call(`/cases/${OBSERVED}`, { cookie: technician })).json.request.phone, '0532 118 44 07', 'the technician at the door sees it all');
  const manager = await api.signIn('yonetim@silentwatt.demo');
  const managed = (await api.call(`/cases/${OBSERVED}`, { cookie: manager })).json;
  assert.equal(managed.request.name, 'A*** D***');
  assert.equal(managed.notice, null);
});

test('a link closes with its case', async () => {
  const { token, code, technician } = await assigned(FRIDGE);
  assert.equal((await api.call(`/cases/${FRIDGE}/result`, { method: 'POST', cookie: technician, body: { result: 'verified', note: '' } })).status, 200);
  assert.equal((await api.call(`/public/request/${token}`)).status, 410);
  assert.equal((await api.call(`/public/request/${token}/open`, { method: 'POST', body: { code } })).status, 410);
});

test('an admin cannot give a full-address role the whole case queue', async () => {
  const admin = await api.signIn('admin@silentwatt.demo');
  const res = await api.call('/users/u-deniz', { method: 'PATCH', cookie: admin, body: { screens: ['jobs', 'queue'] } });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'screen_not_allowed');
});

test('every response carries a content security policy', async () => {
  const { res } = await api.call('/health');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'self'.*frame-ancestors 'none'/);
});

test('a database on another host needs TLS with its CA, unless turned off on purpose', () => {
  assert.equal(databaseSsl('postgres://u:p@db:5432/x', null, 'on'), undefined, 'the compose database on the same VM');
  assert.equal(databaseSsl('postgres://u:p@127.0.0.1/x', null, 'on'), undefined);
  assert.throws(() => databaseSsl('postgres://u:p@rds.example.com/x', null, 'on'), /SILENTWATT_DATABASE_CA/);
  assert.equal(databaseSsl('postgres://u:p@rds.example.com/x?sslmode=verify-full', null, 'on'), undefined, 'the URL names its own TLS');
  assert.equal(databaseSsl('postgres://u:p@rds.example.com/x', null, 'off'), undefined);
});
