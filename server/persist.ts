// A small JSON file for the console's own state. The evidence stays in the ML files; only what people
// do on top of it is kept here. Swap for PostgreSQL later behind the same two functions.
import fs from 'node:fs';
import path from 'node:path';

export const STATE_VERSION = 1;

export interface StateFile<T> {
  version: typeof STATE_VERSION;
  saved_at_utc: string;
  state: T;
}

/** Reads the state, or null when there is none yet. A file written by another version is refused. */
export function readState<T>(file: string | null): T | null {
  if (!file || !fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StateFile<T>;
  if (parsed.version !== STATE_VERSION) throw new Error(`State file ${file} has version ${parsed.version}, expected ${STATE_VERSION}`);
  return parsed.state;
}

/** Writes to a temporary file first, then renames: a crash never leaves half a file behind. */
export function writeState<T>(file: string | null, state: T) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body: StateFile<T> = { version: STATE_VERSION, saved_at_utc: new Date().toISOString(), state };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
