// Decision Flow & Deterministic Guardrails (PRD v0.9 M6: FR-401, FR-402, FR-403, FR-404, FR-405, FR-406)
// Explicit finite state machine, early-exit triaging, and economic dispatch verification.
import { db, transaction } from './db';
import type { CaseStatus } from '../shared/types';

export type TriageVerdict = 'valid' | 'false_positive' | 'data_fault' | 'systemic';

export interface TriageResult {
  eventId: string;
  verdict: TriageVerdict;
  peerSyncRate: number; // fraction of peer households showing similar anomaly
  earlyExit: boolean;
  reason: string;
  evidence: Record<string, any>;
  nextStatus: CaseStatus;
}

export interface EconomicEvaluation {
  eventId: string;
  lossKwhMonth: number;
  annualizedLossKwh: number;
  tariffPerKwh: number;
  dispatchCost: number;
  topConfidence: number;
  expectedRecoverableValue: number;
  netExpectedBenefit: number;
  roiRatio: number;
  action: 'dispatch_recommended' | 'monitor_or_defer' | 'insufficient_confidence';
  rationale: string;
}

export interface DecisionPayload {
  action: 'dispatch' | 'defer' | 'dismiss';
  assigneeId?: string;
  notes?: string;
  expectedValue?: number;
}

// Economic default parameters (can be configured per utility / tenant)
export const DEFAULT_TARIFF_PER_KWH = 2.80; // TL per kWh
export const DEFAULT_DISPATCH_COST = 650.0; // TL cost per technician visit
export const DEFAULT_HORIZON_MONTHS = 6; // Recoverable horizon in months

/**
 * PRD FR-401: Strict Finite State Machine transitions.
 * Ensures no invalid transitions or un-audited state leaps.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['triaged', 'dismissed', 'closed'],
  triaged: ['diagnosed', 'dismissed', 'closed'],
  review: ['triaged', 'diagnosed', 'assigned', 'dismissed', 'closed'],
  diagnosed: ['assigned', 'review', 'dismissed', 'closed'],
  assigned: ['verified', 'dismissed', 'closed'],
  verified: ['closed'],
  dismissed: ['closed'],
  closed: [],
};

export function canTransition(current: string, next: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

/**
 * PRD FR-401 & FR-402: Triage step with Early Exit rules.
 * Closes events early without consuming technician time or reasoning tokens if:
 * 1. Data fault: Corrupted/missing sensor readings
 * 2. Systemic: Grid-wide or regional weather phenomenon affecting peers
 * 3. False alarm: Insignificant deviation (< 5%)
 */
export function runTriage(eventId: string): TriageResult {
  const event = db.prepare('SELECT * FROM event WHERE event_id = ?').get(eventId) as any;
  if (!event) throw new Error(`Vaka bulunamadı: ${eventId}`);

  const household = db.prepare('SELECT * FROM household WHERE household_id = ?').get(event.household_id) as any;
  const region = household?.district ?? 'İzmir';

  // 1. Peer Synchronization Check (Systemic anomaly check)
  // Check how many other events occurred in the same district around the same time
  const peerEventsCount = (db.prepare(`
    SELECT COUNT(*) as c
    FROM event e
    JOIN household h ON e.household_id = h.household_id
    WHERE h.district = ? AND e.event_id != ? AND e.t_start = ?
  `).get(region, eventId, event.t_start) as { c: number }).c;

  const totalDistrictEvents = Math.max(1, (db.prepare(`
    SELECT COUNT(*) as c FROM event e JOIN household h ON e.household_id = h.household_id WHERE h.district = ?
  `).get(region) as { c: number }).c);

  const peerSyncRate = Math.round((peerEventsCount / totalDistrictEvents) * 100) / 100;

  let verdict: TriageVerdict = 'valid';
  let earlyExit = false;
  let reason = 'Vaka geçerli bir anomali olarak onaylandı; teşhise yönlendirildi.';
  let nextStatus: CaseStatus = 'triaged';

  if (event.status === 'data_fault' || event.severity === 'data_fault') {
    verdict = 'data_fault';
    earlyExit = true;
    reason = 'Ölçüm verisinde eksiklik veya donmuş sensör tespit edildi. Saha sevki gerekmez.';
    nextStatus = 'dismissed';
  } else if (peerSyncRate > 0.40) {
    verdict = 'systemic';
    earlyExit = true;
    reason = `Bölgedeki diğer hanelerle eş zamanlı sapma (%${peerSyncRate * 100}). Şebeke veya bölgesel hava olayı.`;
    nextStatus = 'dismissed';
  } else if (Math.abs(event.dev) < 5.0) {
    verdict = 'false_positive';
    earlyExit = true;
    reason = 'Sapma oranı tolerans bandı içinde (< %5). Yanlış alarm olarak elendi.';
    nextStatus = 'dismissed';
  }

  const decidedAt = new Date().toISOString();

  transaction(() => {
    // Record triage verdict
    db.prepare(`
      INSERT INTO triage (event_id, verdict, peer_sync_rate, evidence, decided_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        verdict = excluded.verdict,
        peer_sync_rate = excluded.peer_sync_rate,
        evidence = excluded.evidence,
        decided_at = excluded.decided_at
    `).run(
      eventId,
      verdict,
      peerSyncRate,
      JSON.stringify({ region, peerEventsCount, dev: event.dev, reason }),
      decidedAt
    );

    // Transition event status
    db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run(nextStatus, eventId);

    db.prepare('INSERT INTO case_events (case_id, type, at, note) VALUES (?, ?, ?, ?)').run(
      eventId,
      earlyExit ? 'dismissed' : 'review',
      decidedAt,
      `Triyaj kararı: ${verdict} (${reason})`
    );
  });

  return {
    eventId,
    verdict,
    peerSyncRate,
    earlyExit,
    reason,
    evidence: { region, peerEventsCount, dev: event.dev },
    nextStatus,
  };
}

/**
 * PRD FR-405: Economic Dispatch Evaluation.
 * Invariant (PRD 3.4): Negative expected benefit NEVER produces a dispatch.
 * Expected benefit = (lossKwhMonth * horizonMonths * tariff) * confidence - dispatchCost
 */
export function evaluateDispatchEconomics(
  eventId: string,
  options: { tariff?: number; dispatchCost?: number; horizonMonths?: number } = {}
): EconomicEvaluation {
  const event = db.prepare('SELECT * FROM event WHERE event_id = ?').get(eventId) as any;
  if (!event) throw new Error(`Vaka bulunamadı: ${eventId}`);

  const tariff = options.tariff ?? DEFAULT_TARIFF_PER_KWH;
  const dispatchCost = options.dispatchCost ?? DEFAULT_DISPATCH_COST;
  const horizonMonths = options.horizonMonths ?? DEFAULT_HORIZON_MONTHS;

  // Get top hypothesis confidence
  const topHyp = db.prepare('SELECT confidence FROM hypothesis WHERE event_id = ? ORDER BY rank ASC LIMIT 1').get(eventId) as { confidence?: number } | undefined;
  const topConfidence = topHyp?.confidence ?? 0.50;

  const lossKwhMonth = Math.abs(event.magnitude_kwh);
  const annualizedLossKwh = lossKwhMonth * horizonMonths;
  const grossLossValue = annualizedLossKwh * tariff;
  const expectedRecoverableValue = Math.round(grossLossValue * topConfidence * 10) / 10;
  const netExpectedBenefit = Math.round((expectedRecoverableValue - dispatchCost) * 10) / 10;
  const roiRatio = Math.round((expectedRecoverableValue / dispatchCost) * 100) / 100;

  let action: 'dispatch_recommended' | 'monitor_or_defer' | 'insufficient_confidence' = 'dispatch_recommended';
  let rationale = `Pozitif beklenen tasarruf (${netExpectedBenefit.toFixed(1)} TL). Saha sevki ekonomik olarak rasyonel.`;

  if (topConfidence < 0.40) {
    action = 'insufficient_confidence';
    rationale = `Teşhis güven skoru (%${(topConfidence * 100).toFixed(0)}) sevk için yetersiz. Ek veri beklenmeli.`;
  } else if (netExpectedBenefit <= 0) {
    action = 'monitor_or_defer';
    rationale = `Negatif beklenen fayda (${netExpectedBenefit.toFixed(1)} TL). Sevk maliyeti (${dispatchCost} TL) kurtarılacak değerden yüksek.`;
  }

  return {
    eventId,
    lossKwhMonth,
    annualizedLossKwh,
    tariffPerKwh: tariff,
    dispatchCost,
    topConfidence,
    expectedRecoverableValue,
    netExpectedBenefit,
    roiRatio,
    action,
    rationale,
  };
}

/**
 * PRD FR-406: Human-in-the-Loop Dispatch Decision.
 * No financial action is triggered without human operator sign-off.
 */
export function executeOperatorDecision(
  eventId: string,
  payload: DecisionPayload,
  operatorUser: { id: string; name: string }
) {
  const event = db.prepare('SELECT * FROM event WHERE event_id = ?').get(eventId) as any;
  if (!event) throw new Error(`Vaka bulunamadı: ${eventId}`);

  const time = new Date().toISOString();
  const { action, assigneeId, notes } = payload;

  if (action === 'dispatch') {
    if (!assigneeId) throw new Error('Sevk için bir teknisyen atanmalıdır (assigneeId).');

    const economics = evaluateDispatchEconomics(eventId);
    if (economics.netExpectedBenefit <= 0) {
      throw new Error(`Guardrail ihlali: Negatif beklenen faydalı vaka sevk edilemez (${economics.rationale})`);
    }

    const tech = db.prepare('SELECT id, name FROM users WHERE id = ?').get(assigneeId) as { id: string; name: string } | undefined;
    if (!tech) throw new Error(`Teknisyen bulunamadı: ${assigneeId}`);

    transaction(() => {
      // 1. Update event status
      db.prepare('UPDATE event SET status = ?, tech_id = ? WHERE event_id = ?').run('assigned', tech.id, eventId);

      // 2. Create formal work_order record
      const woId = `WO-${eventId.slice(-5)}-${Date.now().toString(36).toUpperCase()}`;
      const topHyp = db.prepare('SELECT hypothesis_id, signature_id FROM hypothesis WHERE event_id = ? ORDER BY rank ASC LIMIT 1').get(eventId) as any;
      const sigRow = topHyp ? (db.prepare('SELECT check_tr FROM signature_def WHERE signature_id = ?').get(topHyp.signature_id) as any) : null;

      db.prepare(`
        INSERT INTO work_order (wo_id, event_id, hypothesis_id, priority, expected_value, first_check, sla_due, assignee, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        woId,
        eventId,
        topHyp?.hypothesis_id ?? null,
        event.priority,
        economics.netExpectedBenefit,
        sigRow?.check_tr ?? 'Sistem kontrolü',
        new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        tech.id,
        'dispatched'
      );

      // 3. Add to case events & technician messages
      db.prepare('INSERT INTO case_events (case_id, type, at, tech_id, note) VALUES (?, ?, ?, ?, ?)').run(
        eventId,
        'assigned',
        time,
        tech.id,
        notes || `Operatör (${operatorUser.name}) tarafından sevk onaylandı.`
      );

      db.prepare('INSERT INTO technician_messages (id, tech_id, case_id, at) VALUES (?, ?, ?, ?)').run(
        `m-${Date.now()}`,
        tech.id,
        eventId,
        time
      );
    });

    return {
      eventId,
      status: 'assigned',
      technician: tech.name,
      notes,
      economics,
    };
  } else if (action === 'dismiss') {
    transaction(() => {
      db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run('dismissed', eventId);
      db.prepare('INSERT INTO case_events (case_id, type, at, note) VALUES (?, ?, ?, ?)').run(
        eventId,
        'dismissed',
        time,
        notes || `Operatör (${operatorUser.name}) tarafından kapatıldı.`
      );
    });

    return {
      eventId,
      status: 'dismissed',
      notes,
    };
  } else {
    // defer / monitor
    transaction(() => {
      db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run('review', eventId);
      db.prepare('INSERT INTO case_events (case_id, type, at, note) VALUES (?, ?, ?, ?)').run(
        eventId,
        'review',
        time,
        notes || `Operatör (${operatorUser.name}) tarafından izlemeye alındı/ertelendi.`
      );
    });

    return {
      eventId,
      status: 'review',
      notes,
    };
  }
}

/**
 * PRD FR-404: Traceability Guardrail.
 * Validates that all quantitative numbers in a generated text claim trace back to factual DB values.
 */
export function validateClaimTraceability(
  eventId: string,
  claimedLossKwh: number,
  claimedDeviation: number
): boolean {
  const event = db.prepare('SELECT magnitude_kwh, dev FROM event WHERE event_id = ?').get(eventId) as any;
  if (!event) return false;

  const kwhMatches = Math.abs(event.magnitude_kwh - claimedLossKwh) < 0.1;
  const devMatches = Math.abs(event.dev - claimedDeviation) < 0.1;

  return kwhMatches && devMatches;
}
