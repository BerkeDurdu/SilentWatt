import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import type { FieldResult } from '../shared/types';
import { authenticate, csrfGuard, endSessionsFor, langOf, login, logout, notFound, requireCapability, requireScreen } from './auth';
import {
  assignCase, canViewCase, dataSources, dismissCase, getCase, jobsFor, listCases, listTechnicians, markOpened,
  notificationsFor, overview, recordResult, report, reportCsv, requestPage, reviewCase, submitRequest, team,
  toDetail, toMe, updateUser, usersData, type CaseRecord,
} from './store';
import { db, transaction } from './db';
import { getCircuitQualitySummary, ingestReadingsWindow, ingestWeatherObservations } from './qualityGates';
import { enrichTimeSeries } from './features';
import { getEvidencePackage, runDiagnosisForEvent } from './diagnosis';
import { evaluateDispatchEconomics, executeOperatorDecision, runTriage } from './decision';

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

/* resident-facing pages: no account, no session — the token in the SMS link is the only key */

const submitAttempts = new Map<string, { count: number; reset: number }>();
const SUBMIT_WINDOW = 60 * 60 * 1000;
const MAX_SUBMITS = 20;

api.get('/public/request/:token', (req, res) => {
  const page = requestPage(String(req.params.token), langOf(req));
  if (!page) return void notFound(res);
  res.json(page);
});

api.post('/public/request/:token', (req, res) => {
  const t = Date.now();
  const seen = submitAttempts.get(req.ip ?? '');
  const entry = seen && seen.reset > t ? seen : { count: 0, reset: t + SUBMIT_WINDOW };
  if (entry.count >= MAX_SUBMITS) return void res.status(429).json({ error: 'too_many_requests' });
  entry.count += 1;
  submitAttempts.set(req.ip ?? '', entry);

  const result = submitRequest(String(req.params.token), req.body ?? {}, langOf(req));
  if (!result.ok) {
    if (result.error === 'not_found') return void notFound(res);
    return void res.status(400).json({ error: result.error });
  }
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

/* ── M1 & M2: Veri Alım, Kalite Kapıları ve Öznitelikler ───── */

api.post('/v1/ingest/readings', (req, res) => {
  const readings = Array.isArray(req.body?.readings) ? req.body.readings : [];
  if (readings.length === 0) {
    return void res.status(400).json({ error: 'invalid_readings_array' });
  }
  const result = ingestReadingsWindow(readings, req.body?.options ?? {});
  res.json(result);
});

api.post('/v1/ingest/weather', (req, res) => {
  const observations = Array.isArray(req.body?.observations) ? req.body.observations : [];
  if (observations.length === 0) {
    return void res.status(400).json({ error: 'invalid_observations_array' });
  }
  const count = ingestWeatherObservations(observations);
  res.json({ ok: true, count });
});

api.get('/v1/circuits/:id/quality', (req, res) => {
  const summary = getCircuitQualitySummary(String(req.params.id));
  res.json(summary);
});

api.get('/v1/circuits/:id/features', (req, res) => {
  const circuitId = String(req.params.id);
  const rows = db.prepare(`
    SELECT r.ts, r.power_kw as powerKw, w.temp_c as tempC, w.rel_humidity as relHumidity, w.ghi
    FROM reading r
    LEFT JOIN weather_obs w ON r.ts = w.ts
    WHERE r.circuit_id = ?
    ORDER BY r.ts ASC
    LIMIT 200
  `).all(circuitId) as any[];

  const features = enrichTimeSeries(rows);
  res.json({ circuitId, count: features.length, features });
});

/* ── M5: Teşhis, İmza Kütüphanesi ve Kanıt Paketi ─────────── */

api.post('/v1/cases/:id/diagnose', (req, res) => {
  try {
    const report = runDiagnosisForEvent(String(req.params.id));
    res.json(report);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

api.get('/v1/cases/:id/evidence', (req, res) => {
  const pkg = getEvidencePackage(String(req.params.id), langOf(req));
  if (!pkg) return void notFound(res);
  res.json(pkg);
});

api.get('/v1/signatures', (req, res) => {
  const version = req.query.version ? String(req.query.version) : undefined;
  const rows = version
    ? db.prepare('SELECT * FROM signature_def WHERE version = ?').all(version)
    : db.prepare('SELECT * FROM signature_def').all();
  res.json(rows);
});

/* ── M6: Karar Akışı, Triyaj ve Deterministik Guardrail ───── */

api.post('/v1/cases/:id/triage', (req, res) => {
  try {
    const result = runTriage(String(req.params.id));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

api.get('/v1/cases/:id/economics', (req, res) => {
  try {
    const tariff = req.query.tariff ? Number(req.query.tariff) : undefined;
    const dispatchCost = req.query.dispatchCost ? Number(req.query.dispatchCost) : undefined;
    const horizonMonths = req.query.horizonMonths ? Number(req.query.horizonMonths) : undefined;
    const result = evaluateDispatchEconomics(String(req.params.id), { tariff, dispatchCost, horizonMonths });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

api.post('/v1/cases/:id/decision', requireCapability('case.assign'), (req, res) => {
  try {
    const decision = executeOperatorDecision(
      String(req.params.id),
      req.body ?? {},
      req.user!
    );
    res.json(decision);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

api.post('/v1/work-orders/:id/label', (req, res) => {
  const woId = String(req.params.id);
  const outcome = req.body?.outcome;
  if (!['confirmed', 'rejected', 'inconclusive'].includes(outcome)) {
    return void res.status(400).json({ error: 'invalid_outcome' });
  }
  const actualFault = req.body?.actualFault || null;
  const note = req.body?.note || null;
  const time = new Date().toISOString();

  const wo = db.prepare('SELECT * FROM work_order WHERE wo_id = ?').get(woId) as any;
  const eventId = wo?.event_id ?? woId;

  const labelId = `lbl-${Date.now()}`;
  transaction(() => {
    db.prepare(`
      INSERT INTO label (label_id, work_order_id, event_id, outcome, actual_fault, technician_note, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(labelId, woId, eventId, outcome, actualFault, note, time);

    if (wo) {
      db.prepare('UPDATE work_order SET status = ? WHERE wo_id = ?').run('closed', woId);
    }

    db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run(
      outcome === 'confirmed' ? 'verified' : outcome === 'rejected' ? 'dismissed' : 'closed',
      eventId
    );

    db.prepare('INSERT INTO case_events (case_id, type, at, note) VALUES (?, ?, ?, ?)').run(
      eventId,
      outcome === 'confirmed' ? 'verified' : outcome === 'rejected' ? 'dismissed' : 'other',
      time,
      note || `Saha sonucu: ${outcome}`
    );
  });

  res.json({ ok: true, labelId, outcome, closedAt: time });
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
