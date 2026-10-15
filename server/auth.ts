import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Capability, Lang, ScreenKey } from '../shared/types';
import { config } from './config';
import { verifyPassword } from './password';
import { can, findUser, findUserByEmail, toMe, type User } from './store';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const COOKIE = 'sw_sid';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const IDLE = config.sessionIdleMinutes * 60 * 1000;
const ATTEMPT_WINDOW = 10 * 60 * 1000;
// Three counters, so neither guessing one account from many addresses nor trying many accounts from
// one address gets far: per address and account, per address, and per account.
const MAX_ATTEMPTS = 5;
const MAX_PER_IP = 20;
const MAX_PER_ACCOUNT = 10;

const sessions = new Map<string, { userId: string; expires: number; seen: number }>();
const attempts = new Map<string, { count: number; reset: number }>();
// Used so an unknown e-mail costs the same time as a wrong password.
const DUMMY = { salt: randomBytes(16).toString('hex'), hash: randomBytes(64).toString('hex') };

/** Drops entries whose time ran out, so long-running servers don't keep every old session and attempt. */
export function sweep(...maps: Map<string, { expires?: number; reset?: number }>[]) {
  const t = Date.now();
  for (const map of maps) {
    for (const [key, entry] of map) if ((entry.expires ?? entry.reset ?? 0) <= t) map.delete(key);
  }
}
setInterval(() => sweep(sessions, attempts), 10 * 60 * 1000).unref();

const live = (key: string, t: number) => {
  const entry = attempts.get(key);
  return entry && entry.reset > t ? entry : null;
};

function countFailure(key: string, t: number) {
  const entry = live(key, t) ?? { count: 0, reset: t + ATTEMPT_WINDOW };
  entry.count += 1;
  attempts.set(key, entry);
}

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Response language: the client's X-Lang header, or ?lang= for plain links such as downloads. */
export const langOf = (req: Request): Lang => ((req.get('X-Lang') ?? req.query.lang) === 'en' ? 'en' : 'tr');

/** Hides anything the user isn't allowed to know about: same answer as a path that doesn't exist. */
export function notFound(res: Response) {
  res.status(404).json({ error: 'not_found' });
}

/** Mutating requests must carry a custom header, which a cross-site form or image can't send. */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.get('X-Requested-With') === 'silentwatt') return next();
  res.status(403).json({ error: 'csrf' });
}

export function login(req: Request, res: Response) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const t = Date.now();
  const keys = { pair: `pair|${req.ip}|${email}`, ip: `ip|${req.ip}`, account: `account|${email}` };
  const limits: [string, number][] = [[keys.pair, MAX_ATTEMPTS], [keys.ip, MAX_PER_IP], [keys.account, MAX_PER_ACCOUNT]];
  if (limits.some(([key, max]) => (live(key, t)?.count ?? 0) >= max)) {
    res.status(429).json({ error: 'too_many_attempts' });
    return;
  }

  const user = findUserByEmail(email);
  const ok = user
    ? verifyPassword(password, user.salt, user.hash) && user.active
    : (verifyPassword(password, DUMMY.salt, DUMMY.hash), false);

  if (!user || !ok) {
    for (const key of Object.values(keys)) countFailure(key, t);
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  // The address keeps its count: a success on one account does not reset guessing at the others.
  attempts.delete(keys.pair);
  attempts.delete(keys.account);
  const sid = randomBytes(32).toString('base64url');
  sessions.set(sid, { userId: user.id, expires: t + SESSION_TTL, seen: t });
  res.cookie(COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: SESSION_TTL, path: '/' });
  res.json(toMe(user, langOf(req)));
}

export function logout(req: Request, res: Response) {
  const sid = readCookie(req, COOKIE);
  if (sid) sessions.delete(sid);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const sid = readCookie(req, COOKIE);
  const session = sid ? sessions.get(sid) : undefined;
  const t = Date.now();
  // Ends after 8 hours, or after the idle time without a request.
  const current = session && session.expires > t && t - session.seen < IDLE;
  const user = current ? findUser(session.userId) : undefined;
  if (!sid || !session || !user || !user.active) {
    if (sid) sessions.delete(sid);
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  session.seen = t;
  req.user = user;
  next();
}

export const requireScreen = (...keys: ScreenKey[]) => (req: Request, res: Response, next: NextFunction) => {
  if (keys.some((k) => req.user!.screens.includes(k))) return next();
  notFound(res);
};

export const requireCapability = (cap: Capability) => (req: Request, res: Response, next: NextFunction) => {
  if (can(req.user!, cap)) return next();
  notFound(res);
};

export function endSessionsFor(userId: string) {
  for (const [sid, s] of sessions) if (s.userId === userId) sessions.delete(sid);
}
