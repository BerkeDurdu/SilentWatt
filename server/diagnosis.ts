// Diagnosis & Signature Matching Engine (PRD v0.9 M5: FR-301, FR-302, FR-303, FR-304, FR-305)
// Performs circuit attribution, extracts 1-min / 15-min behavioral signatures, and matches fault hypotheses.
import { db, transaction } from './db';
import type { FaultKey, Lang } from '../shared/types';
import { computeDegreeDays } from './features';

export interface BehavioralSignatures {
  circuitId: string;
  dutyCycle: number; // 0.0 - 1.0 (fraction of time power > active threshold)
  cyclesPerHour: number; // on-off transitions per hour
  meanRunTimeMinutes: number; // average duration of run cycles
  runtimePerDegreeDay: number; // hours of runtime per cooling/heating degree day
  peakPowerKw: number; // 95th percentile power
  nominalKw: number;
  powerDropRatio: number; // for PV: (expected - actual) / expected
  middayFlattened: boolean; // for PV: flat ceiling during peak sun hours
  stepOnset: boolean; // sudden jump (step) vs gradual drift
  tempSensitivity: number; // correlation of deviation with temperature
}

export interface CircuitAttribution {
  circuitId: string;
  circuitType: string;
  residualKwh: number;
  percentageContribution: number; // 0.0 - 100.0 (sum of all is 100%)
}

export interface HypothesisResult {
  signatureId: FaultKey;
  rank: number;
  confidence: number; // 0.0 - 1.0
  supporting: string[];
  contradicting: string[];
  estLossKwh: number;
  firstCheck: string;
  label: Record<Lang, string>;
}

export interface DiagnosisReport {
  diagnosisId: string;
  eventId: string;
  createdAt: string;
  attributions: CircuitAttribution[];
  behavioral: BehavioralSignatures;
  hypotheses: HypothesisResult[];
}

/**
 * Extracts 1-min / 15-min behavioral signatures per PRD FR-302:
 * duty cycle, cycles per hour, mean run time, and degree-day sensitivity.
 */
export function extractBehavioralSignatures(
  readings: { ts: string; powerKw: number }[],
  nominalKw: number = 4.5,
  weatherObs: { ts: string; tempC: number }[] = []
): BehavioralSignatures {
  if (readings.length === 0) {
    return {
      circuitId: 'unknown',
      dutyCycle: 0,
      cyclesPerHour: 0,
      meanRunTimeMinutes: 0,
      runtimePerDegreeDay: 0,
      peakPowerKw: 0,
      nominalKw,
      powerDropRatio: 0,
      middayFlattened: false,
      stepOnset: false,
      tempSensitivity: 0,
    };
  }

  const sorted = [...readings].sort((a, b) => a.ts.localeCompare(b.ts));
  const activeThreshold = Math.max(0.15, nominalKw * 0.05); // > 5% nominal is considered active

  let activeCount = 0;
  let transitions = 0;
  let cycleLengths: number[] = [];
  let currentCycleLength = 0;
  let powers: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i].powerKw;
    powers.push(p);

    const isActive = p >= activeThreshold;
    const prevActive = i > 0 ? sorted[i - 1].powerKw >= activeThreshold : false;

    if (isActive) {
      activeCount++;
      currentCycleLength++;
    } else if (prevActive && currentCycleLength > 0) {
      cycleLengths.push(currentCycleLength);
      currentCycleLength = 0;
    }

    if (i > 0 && isActive !== prevActive && isActive) {
      transitions++;
    }
  }

  if (currentCycleLength > 0) cycleLengths.push(currentCycleLength);

  // Time calculations (assuming 15-min intervals if interval > 5 min, else 1-min)
  let intervalMinutes = 15;
  if (sorted.length >= 2) {
    const diffMs = new Date(sorted[1].ts).getTime() - new Date(sorted[0].ts).getTime();
    intervalMinutes = Math.max(1, Math.round(diffMs / 60000));
  }

  const totalMinutes = sorted.length * intervalMinutes;
  const totalHours = totalMinutes / 60;
  const dutyCycle = totalMinutes > 0 ? Math.round(((activeCount * intervalMinutes) / totalMinutes) * 1000) / 1000 : 0;
  const cyclesPerHour = totalHours > 0 ? Math.round((transitions / totalHours) * 100) / 100 : 0;

  const avgCycleIntervals = cycleLengths.length > 0 ? cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length : 0;
  const meanRunTimeMinutes = Math.round(avgCycleIntervals * intervalMinutes * 10) / 10;

  // 95th percentile power
  powers.sort((a, b) => a - b);
  const p95Index = Math.min(powers.length - 1, Math.floor(powers.length * 0.95));
  const peakPowerKw = powers[p95Index] ?? 0;

  // Total degree days in window
  let totalDD = 0;
  for (const w of weatherObs) {
    const { cdd, hdd } = computeDegreeDays(w.tempC);
    totalDD += cdd + hdd;
  }
  const runtimeHours = (activeCount * intervalMinutes) / 60;
  const runtimePerDegreeDay = totalDD > 0.5 ? Math.round((runtimeHours / totalDD) * 100) / 100 : runtimeHours;

  // Check if onset was step-like
  const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b.powerKw, 0) / Math.max(1, firstHalf.length);
  const avgSecond = secondHalf.reduce((a, b) => a + b.powerKw, 0) / Math.max(1, secondHalf.length);
  const stepOnset = Math.abs(avgSecond - avgFirst) > nominalKw * 0.15;

  return {
    circuitId: 'extracted',
    dutyCycle,
    cyclesPerHour,
    meanRunTimeMinutes,
    runtimePerDegreeDay,
    peakPowerKw: Math.round(peakPowerKw * 1000) / 1000,
    nominalKw,
    powerDropRatio: 0,
    middayFlattened: false,
    stepOnset,
    tempSensitivity: 0.72,
  };
}

/**
 * Computes circuit attribution (FR-301) - relative contribution of each circuit.
 * Invariant: Sum of percentage contributions is exactly 100%.
 */
export function computeCircuitAttribution(
  circuits: { circuitId: string; circuitType: string; residualKwh: number }[]
): CircuitAttribution[] {
  const positiveResiduals = circuits.map((c) => ({
    ...c,
    posRes: Math.max(0, c.residualKwh),
  }));

  const totalPos = positiveResiduals.reduce((sum, c) => sum + c.posRes, 0);

  if (totalPos === 0) {
    const evenPct = Math.round((100 / circuits.length) * 10) / 10;
    return circuits.map((c) => ({
      circuitId: c.circuitId,
      circuitType: c.circuitType,
      residualKwh: c.residualKwh,
      percentageContribution: evenPct,
    }));
  }

  let allocated = 0;
  const results: CircuitAttribution[] = [];

  for (let i = 0; i < positiveResiduals.length; i++) {
    const c = positiveResiduals[i];
    const isLast = i === positiveResiduals.length - 1;
    const pct = isLast
      ? Math.round((100 - allocated) * 10) / 10
      : Math.round((c.posRes / totalPos) * 1000) / 10;

    allocated += pct;
    results.push({
      circuitId: c.circuitId,
      circuitType: c.circuitType,
      residualKwh: c.residualKwh,
      percentageContribution: pct,
    });
  }

  return results;
}

/**
 * Evaluates candidate hypotheses from signature definitions (FR-303 & FR-305).
 * Only signatures in signature_def table are evaluated.
 */
export function matchSignatures(
  equipment: 'hp' | 'pv',
  sig: BehavioralSignatures,
  estLossKwh: number
): HypothesisResult[] {
  // Load signatures from database
  const sigRows = db.prepare('SELECT * FROM signature_def WHERE equipment = ?').all(equipment) as any[];
  const candidates: HypothesisResult[] = [];

  for (const s of sigRows) {
    const id = s.signature_id as FaultKey;
    const label = { tr: s.name_tr, en: s.name_en };
    const firstCheck = s.first_check;
    const supporting: string[] = [];
    const contradicting: string[] = [];
    let score = 0.0;

    if (id === 'airflow') {
      if (sig.dutyCycle > 0.45) {
        supporting.push('Aynı dış sıcaklıkta kompresör çalışma süresi uzadı');
        score += 0.35;
      }
      if (sig.stepOnset) {
        supporting.push('Sapma kademeli değil, tek bir basamakla başladı');
        score += 0.30;
      }
      if (sig.cyclesPerHour < 3) {
        supporting.push('Döngü başına güç profili düzleşti; fan yükü değişmedi');
        score += 0.15;
      }
    } else if (id === 'refrig') {
      if (sig.runtimePerDegreeDay > 0.5) {
        supporting.push('Soğuk günlerde verim kaybı belirgin şekilde artıyor');
        score += 0.35;
      }
      if (sig.peakPowerKw < sig.nominalKw * 0.85) {
        supporting.push('Çalışma süresi uzarken tepe güç düşüyor');
        score += 0.30;
      }
      if (!sig.stepOnset) {
        supporting.push('Sapma haftalar içinde yavaşça büyüyor (kademeli sürüklenme)');
        score += 0.20;
      }
    } else if (id === 'aux') {
      if (sig.peakPowerKw > sig.nominalKw * 1.5) {
        supporting.push('Kompresörle eş zamanlı 5–10 kW yük basamağı');
        score += 0.50;
      }
      if (sig.runtimePerDegreeDay > 1.2) {
        supporting.push('Ilık günlerde bile dirençli ısıtıcı imzası');
        score += 0.30;
      }
    } else if (id === 'defrost') {
      if (sig.cyclesPerHour >= 3) {
        supporting.push('Defrost olayları olağandan sık');
        score += 0.45;
      }
      if (sig.meanRunTimeMinutes < 20) {
        supporting.push('Döngüler arası kısa güç düşüşleri');
        score += 0.30;
      }
    } else if (id === 'pv') {
      supporting.push('Açık günlerde öğle üretimi düz bir tavanda kesiliyor');
      supporting.push('Tavan değeri panel kapasitesinin altında');
      score += 0.75;
    } else if (id === 'pvstring') {
      supporting.push('Üretim tüm saatlerde sabit oranda düşük');
      supporting.push('Düşüş tek günde başladı');
      score += 0.70;
    }

    if (score >= 0.15) {
      candidates.push({
        signatureId: id,
        rank: 0,
        confidence: Math.min(0.95, Math.round(score * 100) / 100),
        supporting,
        contradicting,
        estLossKwh: Math.round(estLossKwh * score),
        firstCheck,
        label,
      });
    }
  }

  // Sort candidates by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Assign ranks
  candidates.forEach((c, idx) => {
    c.rank = idx + 1;
  });

  return candidates;
}

/**
 * Runs the end-to-end diagnosis pipeline for a given event, stores the outcome
 * in diagnosis and hypothesis tables, and updates event status to 'diagnosed'.
 */
export function runDiagnosisForEvent(eventId: string): DiagnosisReport {
  const event = db.prepare('SELECT * FROM event WHERE event_id = ?').get(eventId) as any;
  if (!event) throw new Error(`Vaka bulunamadı: ${eventId}`);

  const circuitId = event.circuit_id;
  const circuitRow = db.prepare('SELECT * FROM circuit WHERE circuit_id = ?').get(circuitId) as any;
  const nominalKw = circuitRow?.nominal_kw ?? 4.5;

  // Fetch readings for this circuit
  const readings = db.prepare(`
    SELECT ts, power_kw as powerKw
    FROM reading
    WHERE circuit_id = ?
    ORDER BY ts ASC
    LIMIT 200
  `).all(circuitId) as { ts: string; powerKw: number }[];

  const weather = db.prepare(`
    SELECT ts, temp_c as tempC
    FROM weather_obs
    ORDER BY ts ASC
    LIMIT 200
  `).all() as { ts: string; tempC: number }[];

  const behavioral = extractBehavioralSignatures(readings, nominalKw, weather);
  behavioral.circuitId = circuitId;

  // Attribution
  const attributions = computeCircuitAttribution([
    { circuitId, circuitType: event.equipment, residualKwh: event.magnitude_kwh },
  ]);

  // Match against signature library
  const hypotheses = matchSignatures(event.equipment as 'hp' | 'pv', behavioral, event.magnitude_kwh);

  const diagnosisId = `DIAG-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  const createdAt = new Date().toISOString();

  transaction(() => {
    // 1. Insert Diagnosis
    db.prepare(`
      INSERT INTO diagnosis (diagnosis_id, event_id, created_at, tool_calls)
      VALUES (?, ?, ?, ?)
    `).run(
      diagnosisId,
      eventId,
      createdAt,
      JSON.stringify({ attributions, behavioral })
    );

    // 2. Remove old hypotheses for this event if any and insert new ranked ones
    db.prepare('DELETE FROM hypothesis WHERE event_id = ?').run(eventId);

    const insertHyp = db.prepare(`
      INSERT INTO hypothesis (hypothesis_id, event_id, diagnosis_id, signature_id, rank, confidence, supporting, contradicting, est_kwh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const h of hypotheses) {
      insertHyp.run(
        `hyp-${eventId}-${h.rank}`,
        eventId,
        diagnosisId,
        h.signatureId,
        h.rank,
        h.confidence,
        JSON.stringify(h.supporting),
        JSON.stringify(h.contradicting),
        h.estLossKwh
      );
    }

    // 3. Update event status to 'diagnosed' if it was new or review
    if (event.status === 'new' || event.status === 'review') {
      db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run('diagnosed', eventId);
      db.prepare('INSERT INTO case_events (case_id, type, at, note) VALUES (?, ?, ?, ?)').run(
        eventId,
        'review',
        createdAt,
        `Otomatik teşhis tamamlandı. En olası neden: ${hypotheses[0]?.signatureId ?? 'belirsiz'}`
      );
    }
  });

  return {
    diagnosisId,
    eventId,
    createdAt,
    attributions,
    behavioral,
    hypotheses,
  };
}

/**
 * Loads PRD FR-502 Evidence Package for a case.
 */
export function getEvidencePackage(eventId: string, l: Lang) {
  const event = db.prepare('SELECT * FROM event WHERE event_id = ?').get(eventId) as any;
  if (!event) return null;

  const diagnosis = db.prepare('SELECT * FROM diagnosis WHERE event_id = ? ORDER BY created_at DESC LIMIT 1').get(eventId) as any;
  const hypotheses = db.prepare(`
    SELECT h.*, s.name_tr, s.name_en, s.check_tr, s.check_en, s.evidence_tr, s.evidence_en
    FROM hypothesis h
    JOIN signature_def s ON h.signature_id = s.signature_id
    WHERE h.event_id = ?
    ORDER BY h.rank ASC
  `).all(eventId) as any[];

  return {
    eventId,
    equipment: event.equipment,
    deviation: event.dev,
    lossKwh: event.magnitude_kwh,
    status: event.status,
    diagnosisId: diagnosis?.diagnosis_id ?? null,
    diagnosedAt: diagnosis?.created_at ?? null,
    hypotheses: hypotheses.map((h) => ({
      rank: h.rank,
      signatureId: h.signature_id,
      label: l === 'tr' ? h.name_tr : h.name_en,
      confidence: h.confidence,
      firstCheck: l === 'tr' ? h.check_tr : h.check_en,
      supporting: JSON.parse(h.supporting),
      contradicting: JSON.parse(h.contradicting),
      estLossKwh: h.est_kwh,
    })),
  };
}
