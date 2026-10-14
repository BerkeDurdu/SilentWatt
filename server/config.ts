// Everything the server reads from its environment, in one place. Documented in docs/architecture/api.md.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : ['1', 'on', 'true', 'yes'].includes(value.toLowerCase());

const prod = process.argv.includes('--prod');

export const config = {
  root: ROOT,
  prod,
  // In development the Vite proxy expects 3001; a host-provided PORT only applies to the production server.
  port: Number(env.API_PORT ?? (prod ? env.PORT : undefined) ?? 3001),
  /** Detector output to show; without it the committed synthetic fixtures are used. */
  evidenceDir: env.SILENTWATT_EVIDENCE_DIR || path.join(ROOT, 'shared/fixtures/evidence'),
  /** PostgreSQL for the workflow state (Huawei Cloud RDS for PostgreSQL / GaussDB, or the compose db). Wins over the file. */
  databaseUrl: env.SILENTWATT_DATABASE_URL || null,
  /** CA certificate of the database server, for TLS to a managed database. */
  databaseCa: env.SILENTWATT_DATABASE_CA || null,
  /** Without a database, workflow state survives restarts in this file; "off" keeps it in memory. */
  stateFile: env.SILENTWATT_STATE_FILE === 'off' ? null : env.SILENTWATT_STATE_FILE || path.join(ROOT, '.data/console-state.json'),
  /** Accounts with hashed passwords (see scripts/hash-password.ts). Required in production unless demo accounts are on. */
  usersFile: env.SILENTWATT_USERS_FILE || null,
  /** The shared-password demo accounts. On in development, off in production unless asked for. */
  demoAccounts: flag(env.SILENTWATT_DEMO_ACCOUNTS, !prod),
  /** Session cookies need HTTPS in production; turn off only for a plain-HTTP demo on a private network. */
  secureCookies: flag(env.SILENTWATT_COOKIE_SECURE, prod),
  /** Express "trust proxy": loopback by default, e.g. "uniquelocal" behind a reverse-proxy container. */
  trustProxy: env.SILENTWATT_TRUST_PROXY || 'loopback',
  /** One JSON line per request on stdout; "off" silences it (tests). */
  requestLog: flag(env.SILENTWATT_REQUEST_LOG, true),
};
