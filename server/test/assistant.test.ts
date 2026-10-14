// The case assistant against a fake OpenAI-compatible model: the guard, the retry, the fallback, and
// what the model is (not) sent.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { FRIDGE, OBSERVED, startApi } from './helpers';

const replies: string[] = [];
const seen: { auth: string | undefined; body: { model: string; messages: { role: string; content: string }[] } }[] = [];
const fake = http.createServer((req, res) => {
  if (req.url === '/v1/models') return void res.end(JSON.stringify({ data: [{ id: 'fake-qwen' }] }));
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    seen.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: replies.shift() ?? '' } }] }));
  });
});

let api: Awaited<ReturnType<typeof startApi>>;
before(async () => {
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  process.env.SILENTWATT_LLM_PROVIDER = 'openai';
  process.env.SILENTWATT_LLM_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
  process.env.SILENTWATT_LLM_MODEL = 'fake-qwen';
  process.env.SILENTWATT_LLM_API_KEY = 'test-key';
  process.env.SILENTWATT_STATE_FILE = 'off';
  process.env.SILENTWATT_REQUEST_LOG = 'off';
  api = await startApi();
});
after(async () => {
  await api.close();
  fake.close();
});

test('the assistant reports which model it uses and that it answers', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  const status = await api.call('/assistant', { cookie: operator });
  assert.deepEqual(status.json, { enabled: true, model: 'fake-qwen', location: 'cloud', reachable: true });
});

test('a summary that passes the guard is shown, then served from the cache', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  replies.push('Klima devresi 3 gün boyunca model referansının %18 üzerinde çalıştı. İlk olarak termostat ayarı kontrol edilmeli.');
  const first = await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: operator, body: {} });
  assert.equal(first.json.provider, 'llm');
  assert.deepEqual(first.json.guard, { passed: true, violations: [], attempts: 1 });
  assert.equal(first.json.humanDecisionNote, 'Bu bir inceleme önerisidir; kararı ekip verir.');
  assert.equal(seen.at(-1)!.auth, 'Bearer test-key');

  const calls = seen.length;
  const again = await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: operator, body: {} });
  assert.equal(again.json.cached, true);
  assert.equal(seen.length, calls, 'a cached summary does not call the model');
});

test('a text that breaks the rules gets one retry with the violations, then falls back to the template', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  replies.push('Faturası yaklaşık 120 TL artar.', 'Kanıt, model referansının %18 üzerinde bir sapma gösteriyor; tutar hesaplanmaz.');
  const retried = await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: operator, body: { question: 'Fatura ne kadar artar?' } });
  assert.equal(retried.json.provider, 'llm');
  assert.equal(retried.json.guard.attempts, 2);
  const retry = seen.at(-1)!.body.messages.at(-1)!;
  assert.match(retry.content, /number_not_in_evidence: 120/);
  assert.match(retry.content, /forbidden_wording/);

  replies.push('Arıza olasılığı yüksektir.', 'Muhtemelen arıza var, 1000 saatlik bir sorun.');
  const failed = await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: operator, body: { question: 'Arıza var mı?' } });
  assert.equal(failed.json.provider, 'template');
  assert.equal(failed.json.fallback, 'guard');
  assert.match(failed.json.text, /^Yapay zekâ yanıtı gösterilemiyor; vaka özeti şablondan: Hane 90003/);
  assert.ok(failed.json.guard.violations.includes('hedging'));

  replies.push('第一 sapma var.', '');
  const foreign = await api.call(`/cases/${FRIDGE}/assistant`, { method: 'POST', cookie: operator, body: { question: 'Ne oldu?' } });
  assert.deepEqual(foreign.json.guard.violations, ['empty']);
  assert.equal(foreign.json.provider, 'template');
});

test('the model is sent case facts only: no name, address or phone of the resident', async () => {
  const operator = await api.signIn('operator@silentwatt.demo');
  for (const message of seen.flatMap((s) => s.body.messages)) {
    assert.doesNotMatch(message.content, /Mah\.|Sk\.|Cd\.|\b05\d\d\b|Ayşe|Burak/);
  }
  const user = seen[0].body.messages.find((m) => m.role === 'user')!.content;
  assert.match(user, /Bildirilen değişiklik: yok/);
  // A question is a string of at most 300 characters; anything else is refused before the model.
  const bad = await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: operator, body: { question: { x: 1 } } });
  assert.equal(bad.status, 400);
});

test('only people who can see the case can ask about it', async () => {
  const technician = await api.signIn('emre@silentwatt.demo');
  assert.equal((await api.call(`/cases/${OBSERVED}/assistant`, { method: 'POST', cookie: technician, body: {} })).status, 404);
  // Reading is enough to ask: the assistant changes nothing in the case.
  const manager = await api.signIn('yonetim@silentwatt.demo');
  assert.equal((await api.call('/assistant', { cookie: manager })).status, 200);
});
