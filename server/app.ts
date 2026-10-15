// The API and, in production, the built console. server/index.ts starts it; tests import it directly.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import type { FieldResult } from '../shared/types';
import { authenticate, csrfGuard, endSessionsFor, langOf, login, logout, notFound, requireCapability, requireScreen, sweep } from './auth';
import { config } from './config';
import { askAssistant, assistantStatus } from './explain/llm';
import {
  assignCase, assistantInput, canViewCase, dataSources, dismissCase, evidenceInfo, explainByChange, getCase, isChangeKind, isSynthetic, jobsFor, listCases,
  listChanges, listTechnicians, markOpened,
  notificationsFor, openRequest, overview, recordResult, report, reportCsv, requestGate, reviewCase, submitRequest, team,
  toDetail, toMe, updateUser, usersData, type CaseRecord,
} from './store';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

// Every response carries a request id; with logging on, one JSON line per request (NFR-07).
// The resident's link token is the whole key to their page, so it never reaches the log.
app.use((req, res, next) => {
  const id = randomUUID();
  const start = process.hrtime.bigint();
  res.setHeader('X-Request-Id', id);
  if (config.requestLog) {
    res.on('finish', () => {
      console.log(JSON.stringify({
        t: new Date().toISOString(), request_id: id, run_id: evidenceInfo().run_id,
        method: req.method, path: req.originalUrl.split('?')[0].replace(/(\/public\/request\/)[^/]+/, '$1:token'),
        status: res.statusCode, ms: Number((process.hrtime.bigint() - start) / 1_000_000n), user: req.user?.id ?? null,
      }));
    });
  }
  next();
});
app.use(express.json({ limit: '20kb' }));
// The console loads its own scripts and styles, plus the Google Fonts stylesheet and font files.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const api = express.Router();

/** For monitoring: is the service up, and which evidence run is it serving. Nothing sensitive. */
api.get('/health', (_req, res) => {
  const { run_id, fixture, cases } = evidenceInfo();
  res.json({ status: 'ok', run_id, fixture, cases, uptime_s: Math.round(process.uptime()) });
});

api.use(csrfGuard);
api.post('/auth/login', login);
api.post('/auth/logout', logout);

/*
 * Resident-facing pages: no account, no session. The token in the SMS link finds the case, and the last
 * four digits of the subscriber number open it; the bare link answers only "give the code" or "expired".
 */

const publicAttempts = new Map<string, { count: number; reset: number }>();
const PUBLIC_WINDOW = 60 * 60 * 1000;
const MAX_PUBLIC = 30;
setInterval(() => sweep(publicAttempts), PUBLIC_WINDOW).unref();

/** Per address: opening and sending together, so many links cannot be tried from one place. */
function publicLimit(req: Request, res: Response) {
  const t = Date.now();
  const seen = publicAttempts.get(req.ip ?? '');
  const entry = seen && seen.reset > t ? seen : { count: 0, reset: t + PUBLIC_WINDOW };
  if (entry.count >= MAX_PUBLIC) {
    res.status(429).json({ error: 'too_many_requests' });
    return false;
  }
  entry.count += 1;
  publicAttempts.set(req.ip ?? '', entry);
  return true;
}

const PUBLIC_STATUS: Record<string, number> = { expired: 410, wrong_code: 403, locked: 429, too_many_updates: 429 };
function publicError(res: Response, error: string) {
  if (error === 'not_found') return notFound(res);
  res.status(PUBLIC_STATUS[error] ?? 400).json({ error });
}

api.get('/public/request/:token', (req, res) => {
  const gate = requestGate(String(req.params.token));
  if (!gate) return void notFound(res);
  if (gate === 'expired') return void publicError(res, 'expired');
  res.json({ verify: true });
});

api.post('/public/request/:token/open', (req, res) => {
  if (!publicLimit(req, res)) return;
  const result = openRequest(String(req.params.token), req.body?.code, langOf(req));
  if (!result.ok) return void publicError(res, result.error);
  res.json(result.page);
});

api.post('/public/request/:token', (req, res) => {
  if (!publicLimit(req, res)) return;
  const result = submitRequest(String(req.params.token), req.body ?? {}, langOf(req));
  if (!result.ok) return void publicError(res, result.error);
  res.json(result.receipt);
});

// Everything below needs a signed-in user.
api.use(authenticate);

api.get('/me', (req, res) => {
  res.json(toMe(req.user!, langOf(req)));
});

api.get('/notifications', (req, res) => {
  res.json(notificationsFor(req.user!, langOf(req)));
});

/* cases */

/** Loads a case the user may see, or answers 404 — the same answer for "missing" and "not yours". */
function visibleCase(req: Request, res: Response): CaseRecord | null {
  const c = getCase(String(req.params.id));
  if (!c || !canViewCase(req.user!, c)) {
    notFound(res);
    return null;
  }
  return c;
}

const conflict = (res: Response) => res.status(409).json({ error: 'invalid_state' });
// Synthetic cases are labelled experiments; nobody reviews, assigns or closes them.
const isTriage = (c: CaseRecord) => !isSynthetic(c) && (c.status === 'new' || c.status === 'review');

api.get('/cases', requireScreen('queue'), (req, res) => {
  res.json(listCases(req.user!, String(req.query.status ?? 'open'), String(req.query.family ?? ''), langOf(req)));
});

api.get('/cases/:id', (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  markOpened(c, req.user!);
  res.json(toDetail(c, req.user!, langOf(req)));
});

/* case assistant: a language model writes from the case facts; its text passes the evidence guard */

const askAttempts = new Map<string, { count: number; reset: number }>();
const ASK_WINDOW = 10 * 60 * 1000;
const MAX_ASKS = 40;
setInterval(() => sweep(askAttempts), ASK_WINDOW).unref();

api.get('/assistant', requireScreen('queue', 'jobs'), async (_req, res) => {
  res.json(await assistantStatus());
});

api.post('/cases/:id/assistant', requireScreen('queue', 'jobs'), async (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  const raw = req.body?.question;
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return void res.status(400).json({ error: 'invalid_question' });
  const question = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 300) : null;
  if (question) {
    const t = Date.now();
    const seen = askAttempts.get(req.user!.id);
    const entry = seen && seen.reset > t ? seen : { count: 0, reset: t + ASK_WINDOW };
    if (entry.count >= MAX_ASKS) return void res.status(429).json({ error: 'too_many_requests' });
    entry.count += 1;
    askAttempts.set(req.user!.id, entry);
  }
  res.json(await askAssistant(assistantInput(c, langOf(req), question)));
});

api.post('/cases/:id/review', requireCapability('case.assign'), (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  if (c.status !== 'new' || isSynthetic(c)) return void conflict(res);
  reviewCase(c);
  res.json(toDetail(c, req.user!, langOf(req)));
});

api.post('/cases/:id/assign', requireCapability('case.assign'), (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  if (!isTriage(c)) return void conflict(res);
  if (!assignCase(c, String(req.body?.technicianId ?? ''))) {
    res.status(400).json({ error: 'invalid_technician' });
    return;
  }
  res.json(toDetail(c, req.user!, langOf(req)));
});

api.post('/cases/:id/dismiss', requireCapability('case.dismiss'), (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  if (!isTriage(c)) return void conflict(res);
  dismissCase(c);
  res.json(toDetail(c, req.user!, langOf(req)));
});

/** A reported change (new device, repair, usage) explains the deviation; the case closes and ML re-learns. */
api.post('/cases/:id/explain', requireCapability('case.assign'), (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  if (isSynthetic(c) || !['new', 'review', 'assigned'].includes(c.status)) return void conflict(res);
  if (!isChangeKind(req.body?.kind)) {
    res.status(400).json({ error: 'invalid_change' });
    return;
  }
  const localDate = typeof req.body?.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.localDate) ? req.body.localDate : null;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  explainByChange(c, req.body.kind, localDate, note);
  res.json(toDetail(c, req.user!, langOf(req)));
});

const RESULTS: FieldResult[] = ['verified', 'other', 'dismissed'];

api.post('/cases/:id/result', requireCapability('case.result'), (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  if (c.techId !== req.user!.id) return void notFound(res);
  if (c.status !== 'assigned') return void conflict(res);
  const result = req.body?.result as FieldResult;
  if (!RESULTS.includes(result)) {
    res.status(400).json({ error: 'invalid_result' });
    return;
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  recordResult(c, result, note);
  res.json(toDetail(c, req.user!, langOf(req)));
});

api.get('/technicians', requireCapability('case.assign'), (_req, res) => {
  res.json(listTechnicians());
});

/* screens */

api.get('/overview', requireScreen('overview'), (req, res) => {
  res.json(overview(langOf(req)));
});

api.get('/jobs', requireScreen('jobs'), (req, res) => {
  res.json(jobsFor(req.user!, langOf(req)));
});

api.get('/team', requireScreen('team'), (req, res) => {
  res.json(team(req.user!, langOf(req)));
});

api.get('/reports/monthly', requireScreen('reports'), (req, res) => {
  res.json(report(req.user!, langOf(req)));
});

api.get('/reports/monthly.csv', requireScreen('reports'), requireCapability('report.export'), (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${langOf(req) === 'tr' ? 'silentwatt-rapor' : 'silentwatt-report'}.csv"`);
  res.send(reportCsv(req.user!, langOf(req)));
});

api.get('/data-sources', requireScreen('data'), (req, res) => {
  res.json(dataSources(langOf(req)));
});

/** Console → ML: every reported change, for the next detector run to re-learn those references. */
api.get('/changes', requireScreen('data'), (_req, res) => {
  res.json({ schema_version: 'silentwatt.changes/0.1', changes: listChanges() });
});

api.get('/users', requireScreen('users'), (req, res) => {
  res.json(usersData(req.user!, langOf(req)));
});

api.patch('/users/:id', requireScreen('users'), requireCapability('users.manage'), (req, res) => {
  const result = updateUser(req.user!, String(req.params.id), req.body ?? {}, langOf(req));
  if (!result.ok) {
    if (result.error === 'not_found') return void notFound(res);
    res.status(400).json({ error: result.error });
    return;
  }
  if (result.deactivated) endSessionsFor(result.user.id);
  res.json(result.user);
});

api.use((_req, res) => notFound(res));
// /api/v1 is the contract path (PRD §12.1); /api stays for the console and old links.
app.use('/api/v1', api);
app.use('/api', api);

if (config.prod) {
  const dist = path.join(config.root, 'dist');
  if (!fs.existsSync(dist)) throw new Error('dist/ bulunamadı. Önce "npm run build" çalıştırın.');
  app.use(express.static(dist, { index: false }));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
