// The PostgreSQL store against a real database. Runs when SILENTWATT_TEST_DATABASE_URL is set (CI has a
// postgres service); skipped otherwise. Locally:
//   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16-alpine
//   SILENTWATT_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres npm test
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { OBSERVED, startApi } from './helpers';

const url = process.env.SILENTWATT_TEST_DATABASE_URL;
const at = '2026-10-14T09:00:00.000Z';

let api: Awaited<ReturnType<typeof startApi>> | null = null;
let db: pg.Client | null = null;

before(async () => {
  if (!url) return;
  db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query('DROP TABLE IF EXISTS console_state');
  await db.query('CREATE TABLE console_state (id text PRIMARY KEY, version integer NOT NULL, saved_at timestamptz NOT NULL, state jsonb NOT NULL)');
  const state = {
    cases: [{ id: OBSERVED, status: 'review', techId: null, events: [{ type: 'created', at }, { type: 'review', at }] }],
    messages: [], requests: [], tokens: [], users: [],
  };
  await db.query('INSERT INTO console_state VALUES ($1, 1, $2, $3)', ['console', at, JSON.stringify(state)]);

  process.env.SILENTWATT_DATABASE_URL = url;
  process.env.SILENTWATT_STATE_FILE = 'off';
  process.env.SILENTWATT_REQUEST_LOG = 'off';
  api = await startApi();
});

after(async () => {
  if (api) await api.close();
  if (url) {
    const { stateStore } = await import('../store');
    await stateStore.close();
  }
  if (db) {
    await db.query('DROP TABLE IF EXISTS console_state');
    await db.end();
  }
});

test('state is restored from PostgreSQL and every change is written back', { skip: !url && 'SILENTWATT_TEST_DATABASE_URL not set' }, async () => {
  const operator = await api!.signIn('operator@silentwatt.demo');
  const restored = await api!.call(`/cases/${OBSERVED}`, { cookie: operator });
  assert.equal(restored.json.status, 'review');

  const assigned = await api!.call(`/cases/${OBSERVED}/assign`, { method: 'POST', cookie: operator, body: { technicianId: 'u-emre' } });
  assert.equal(assigned.json.status, 'assigned');

  const { stateStore } = await import('../store');
  assert.equal(stateStore.kind, 'postgres');
  await stateStore.flush();
  const { rows } = await db!.query('SELECT state FROM console_state WHERE id = $1', ['console']);
  const saved = rows[0].state.cases.find((c: { id: string }) => c.id === OBSERVED);
  assert.equal(saved.status, 'assigned');
  assert.equal(saved.techId, 'u-emre');
  assert.equal(rows[0].state.tokens.length, 1, 'the resident link is stored with the state');
});
