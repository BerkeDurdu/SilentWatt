import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Capability, Lang, ScreenKey } from '../shared/types';
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
const ATTEMPT_WINDOW = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const PROD = process.argv.includes('--prod');

const sessions = new Map<string, { userId: string; expires: number }>();
const attempts = new Map<string, { count: number; reset: number }>();
// Used so an unknown e-mail costs the same time as a wrong password.
const DUMMY = { salt: randomBytes(16).toString('hex'), hash: randomBytes(64).toString('hex') };

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
  const key = `${req.ip}|${email}`;
  const t = Date.now();

  const entry = attempts.get(key);
  if (entry && entry.reset > t && entry.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: 'too_many_attempts' });
    return;
  }

  const user = findUserByEmail(email);
  const ok = user
    ? verifyPassword(password, user.salt, user.hash) && user.active
    : (verifyPassword(password, DUMMY.salt, DUMMY.hash), false);

  if (!user || !ok) {
    const next = entry && entry.reset > t ? entry : { count: 0, reset: t + ATTEMPT_WINDOW };
    next.count += 1;
    attempts.set(key, next);
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  attempts.delete(key);
  const sid = randomBytes(32).toString('base64url');
  sessions.set(sid, { userId: user.id, expires: t + SESSION_TTL });
  res.cookie(COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSION_TTL, path: '/' });
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
  const user = session && session.expires > Date.now() ? findUser(session.userId) : undefined;
  if (!sid || !session || !user || !user.active) {
    if (sid) sessions.delete(sid);
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
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
