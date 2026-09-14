import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import type { FieldResult } from '../shared/types';
import { authenticate, csrfGuard, endSessionsFor, langOf, login, logout, notFound, requireCapability, requireScreen } from './auth';
import {
  assignCase, canViewCase, dataSources, dismissCase, getCase, jobsFor, listCases, listTechnicians, markOpened,
  notificationsFor, overview, recordResult, report, reportCsv, reviewCase, team, toDetail, toMe, updateUser, usersData,
  type CaseRecord,
} from './store';

const PROD = process.argv.includes('--prod');
// In development the Vite proxy expects 3001; a host-provided PORT only applies to the production server.
const PORT = Number(process.env.API_PORT ?? (PROD ? process.env.PORT : undefined) ?? 3001);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '20kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const api = express.Router();
api.use(csrfGuard);
api.post('/auth/login', login);
api.post('/auth/logout', logout);

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
const isTriage = (c: CaseRecord) => c.status === 'new' || c.status === 'review';

api.get('/cases', requireScreen('queue'), (req, res) => {
  res.json(listCases(req.user!, String(req.query.status ?? 'open'), langOf(req)));
});

api.get('/cases/:id', (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  markOpened(c, req.user!);
  res.json(toDetail(c, req.user!, langOf(req)));
});

api.post('/cases/:id/review', requireCapability('case.assign'), (req, res) => {
  const c = visibleCase(req, res);
  if (!c) return;
  if (c.status !== 'new') return void conflict(res);
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
  res.setHeader('Content-Disposition', `attachment; filename="${langOf(req) === 'tr' ? 'silentwatt-rapor-h27-h38' : 'silentwatt-report-w27-w38'}.csv"`);
  res.send(reportCsv(req.user!, langOf(req)));
});

api.get('/data-sources', requireScreen('data'), (req, res) => {
  res.json(dataSources(langOf(req)));
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
app.use('/api', api);

if (PROD) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  if (!fs.existsSync(dist)) throw new Error('dist/ bulunamadı. Önce "npm run build" çalıştırın.');
  app.use(express.static(dist, { index: false }));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`SilentWatt API → http://localhost:${PORT}${PROD ? ' (production)' : ''}`);
});
