// Everything the server reads from its environment, in one place. Documented in docs/architecture/api.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : ['1', 'on', 'true', 'yes'].includes(value.toLowerCase());

const prod = process.argv.includes('--prod');

function publishedRun(): string | null {
  const pointer = path.join(ROOT, 'artifacts/evidence/CURRENT');
  if (!fs.existsSync(pointer)) return null;
  const dir = path.resolve(path.dirname(pointer), fs.readFileSync(pointer, 'utf8').trim());
  return fs.existsSync(path.join(dir, 'index.json')) ? dir : null;
}

export const config = {
  root: ROOT,
  prod,
  // In development the Vite proxy expects 3001; a host-provided PORT only applies to the production server.
  port: Number(env.API_PORT ?? (prod ? env.PORT : undefined) ?? 3001),
  /**
   * Detector output to show: SILENTWATT_EVIDENCE_DIR, else the run named in artifacts/evidence/CURRENT
   * (written by `silentwatt-ml detect --set-current`; the readings stay on this machine), else the
   * committed synthetic fixtures.
   */
  evidenceDir: env.SILENTWATT_EVIDENCE_DIR || publishedRun() || path.join(ROOT, 'shared/fixtures/evidence'),
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
  /**
   * Language model behind the case assistant (server/explain/llm.ts). "ollama" is a local Ollama
   * (default in development), "openai" any OpenAI-compatible endpoint such as Huawei Cloud ModelArts
   * Studio (Qwen, DeepSeek), "off" keeps the template text only (default in production).
   */
  llm: (() => {
    const provider = (env.SILENTWATT_LLM_PROVIDER || (prod ? 'off' : 'ollama')).toLowerCase();
    return {
      provider: (['ollama', 'openai'].includes(provider) ? provider : 'off') as 'ollama' | 'openai' | 'off',
      baseUrl: (env.SILENTWATT_LLM_BASE_URL || (provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : '')).replace(/\/+$/, ''),
      model: env.SILENTWATT_LLM_MODEL || (provider === 'ollama' ? 'qwen2.5:7b' : ''),
      apiKey: env.SILENTWATT_LLM_API_KEY || null,
      /** A 7B model on a laptop CPU needs tens of seconds; a hosted model a few. */
      timeoutMs: Number(env.SILENTWATT_LLM_TIMEOUT_MS || 120_000),
    };
  })(),
};
