// Where the console's own state is kept. The evidence stays in the ML files; only what people do on top
// of it is stored here: case status, assignments, resident requests and links, user access.
//
// Two stores behind one interface:
// - PostgreSQL (SILENTWATT_DATABASE_URL): Huawei Cloud RDS for PostgreSQL, GaussDB or the compose `db` service
// - a JSON file (SILENTWATT_STATE_FILE): local development and single-machine demos
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const STATE_VERSION = 1;

export interface StateFile<T> {
  version: typeof STATE_VERSION;
  saved_at_utc: string;
  state: T;
}

export interface StateStore<T> {
  readonly kind: 'postgres' | 'file' | 'memory';
  load(): Promise<T | null>;
  /** Queues a write; the latest state wins and writes never overlap. */
  save(state: T): void;
  /** Resolves once every queued write has landed (shutdown, tests). */
  flush(): Promise<void>;
  close(): Promise<void>;
}

function checkVersion<T>(body: StateFile<T>, where: string): T {
  if (body.version !== STATE_VERSION) throw new Error(`State in ${where} has version ${body.version}, expected ${STATE_VERSION}`);
  return body.state;
}

const envelope = <T>(state: T): StateFile<T> => ({ version: STATE_VERSION, saved_at_utc: new Date().toISOString(), state });

/** Writes to a temporary file first, then renames: a crash never leaves half a file behind. */
function fileStore<T>(file: string): StateStore<T> {
  return {
    kind: 'file',
    async load() {
      if (!fs.existsSync(file)) return null;
      return checkVersion(JSON.parse(fs.readFileSync(file, 'utf8')) as StateFile<T>, file);
    },
    save(state) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      // The state holds residents' names, phones and addresses: readable by the server's own user only.
      fs.writeFileSync(tmp, JSON.stringify(envelope(state), null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, file);
    },
    flush: async () => {},
    close: async () => {},
  };
}

const memoryStore = <T>(): StateStore<T> => ({
  kind: 'memory', load: async () => null, save: () => {}, flush: async () => {}, close: async () => {},
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS console_state (
    id        text PRIMARY KEY,
    version   integer NOT NULL,
    saved_at  timestamptz NOT NULL,
    state     jsonb NOT NULL
  )`;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

/**
 * TLS for the database connection. Residents' data crosses this link, so a database on another host needs
 * TLS with its CA certificate (or an explicit sslmode in the URL). Only a database on the same machine or
 * the compose network may go without, or one that SILENTWATT_DATABASE_TLS=off names on purpose.
 */
export function databaseSsl(url: string, caFile: string | null, tls: 'on' | 'off'): pg.PoolConfig['ssl'] {
  if (caFile) return { ca: fs.readFileSync(caFile, 'utf8'), rejectUnauthorized: true };
  const parsed = new URL(url);
  if (LOCAL_HOSTS.has(parsed.hostname) || tls === 'off' || parsed.searchParams.has('sslmode')) return undefined;
  throw new Error(
    `The database ${parsed.hostname} is not on this machine: set SILENTWATT_DATABASE_CA to its CA certificate for TLS ` +
    '(Huawei Cloud RDS offers it for download), or SILENTWATT_DATABASE_TLS=off for a private network on purpose.',
  );
}

/** One row per console instance, written as a whole: a handful of users, a few hundred cases at most. */
function postgresStore<T>(url: string, caFile: string | null, tls: 'on' | 'off'): StateStore<T> {
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: databaseSsl(url, caFile, tls) });
  const ID = 'console';
  let ready: Promise<unknown> | null = null;
  const schema = () => (ready ??= pool.query(SCHEMA));
  let pending: T | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = async () => {
    if (pending === null) return;
    const body = envelope(pending);
    pending = null;
    await schema();
    await pool.query(
      `INSERT INTO console_state (id, version, saved_at, state) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, saved_at = EXCLUDED.saved_at, state = EXCLUDED.state`,
      [ID, body.version, body.saved_at_utc, JSON.stringify(body.state)],
    );
  };

  return {
    kind: 'postgres',
    async load() {
      await schema();
      const { rows } = await pool.query('SELECT version, saved_at, state FROM console_state WHERE id = $1', [ID]);
      if (rows.length === 0) return null;
      return checkVersion<T>({ version: rows[0].version, saved_at_utc: rows[0].saved_at, state: rows[0].state }, 'console_state');
    },
    save(state) {
      pending = state;
      // A failed write is logged and retried with the next change; the console keeps working meanwhile.
      writing = writing.then(write).catch((error: unknown) => console.error('state write failed:', error));
    },
    flush: () => writing,
    async close() {
      await writing;
      await pool.end();
    },
  };
}

export function createStateStore<T>(
  options: { databaseUrl: string | null; databaseCa: string | null; databaseTls: 'on' | 'off'; stateFile: string | null },
): StateStore<T> {
  if (options.databaseUrl) return postgresStore<T>(options.databaseUrl, options.databaseCa, options.databaseTls);
  if (options.stateFile) return fileStore<T>(options.stateFile);
  return memoryStore<T>();
}
