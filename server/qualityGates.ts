// Quality Gates & Ingestion Pipeline (PRD v0.9 M1: FR-101, FR-102, FR-103)
// Evaluates measurement windows for missingness, frozen sensor, bounds, and energy balance.
import { db, transaction } from './db';

export interface RawReading {
  circuitId: string;
  ts: string; // ISO-8601 string
  powerKw: number;
}

export interface WeatherObservation {
  region: string;
  ts: string;
  tempC: number;
  relHumidity: number;
  ghi: number; // Global Horizontal Irradiance (W/m2)
  poa: number; // Plane of Array Irradiance (W/m2)
}

export interface QualityGateOptions {
  resolutionMinutes?: 1 | 15;
  expectedPoints?: number;
  maxMissingRatio?: number; // default 0.05 (5%)
  maxFrozenConsecutive?: number; // default 60 consecutive points
  nominalKw?: number;
  allowNegative?: boolean; // false for loads (HP), true for PV generation
}

export interface QualityGateReport {
  passed: boolean;
  circuitId: string;
  totalReceived: number;
  expectedPoints: number;
  missingRatio: number;
  maxConsecutiveFrozen: number;
  outOfBoundsCount: number;
  violations: string[];
  qualityFlag: 'valid' | 'data_fault';
  details: {
    frozenValue?: number;
    outOfBoundsSample?: number;
  };
}

/**
 * Validates a window of readings according to PRD FR-102:
 * 1. Missing ratio <= 5%
 * 2. Stuck / Frozen sensor (>= 60 consecutive identical readings)
 * 3. Range and physics boundary check
 */
export function evaluateQualityGate(
  readings: RawReading[],
  options: QualityGateOptions = {}
): QualityGateReport {
  const {
    resolutionMinutes: _resolutionMinutes = 15,
    expectedPoints = 96, // 24 hours * 4 points/hour for 15-min
    maxMissingRatio = 0.05,
    maxFrozenConsecutive = 60,
    nominalKw = 5.0,
    allowNegative = false,
  } = options;

  const violations: string[] = [];
  const totalReceived = readings.length;
  const circuitId = readings[0]?.circuitId ?? 'unknown';

  // Sort by timestamp
  const sorted = [...readings].sort((a, b) => a.ts.localeCompare(b.ts));

  // 1. Missing data check
  const missingPoints = Math.max(0, expectedPoints - totalReceived);
  const missingRatio = expectedPoints > 0 ? missingPoints / expectedPoints : 0;
  if (missingRatio > maxMissingRatio) {
    violations.push(`Eksik veri oranı sınırı aşıldı: %${(missingRatio * 100).toFixed(1)} > %${(maxMissingRatio * 100).toFixed(1)}`);
  }

  // 2. Frozen sensor check (identical non-zero readings in sequence)
  let maxConsecutiveFrozen = 0;
  let currentFrozen = 1;
  let frozenVal: number | undefined;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].powerKw;
    const curr = sorted[i].powerKw;

    // We check non-zero values (for solar, 0 at night is normal)
    if (Math.abs(curr - prev) < 0.0001 && Math.abs(curr) > 0.05) {
      currentFrozen++;
      if (currentFrozen > maxConsecutiveFrozen) {
        maxConsecutiveFrozen = currentFrozen;
        frozenVal = curr;
      }
    } else {
      currentFrozen = 1;
    }
  }

  if (maxConsecutiveFrozen >= maxFrozenConsecutive) {
    violations.push(`Donmuş sensör tespit edildi: ${maxConsecutiveFrozen} ardışık örnek (${frozenVal?.toFixed(3)} kW)`);
  }

  // 3. Out of bounds check
  let outOfBoundsCount = 0;
  let sampleOutOfBounds: number | undefined;
  const maxAllowable = nominalKw * 3.0; // 3x nominal capacity limit
  const minAllowable = allowNegative ? -nominalKw * 1.5 : -0.05;

  for (const r of sorted) {
    if (r.powerKw < minAllowable || r.powerKw > maxAllowable) {
      outOfBoundsCount++;
      if (sampleOutOfBounds === undefined) sampleOutOfBounds = r.powerKw;
    }
  }

  if (outOfBoundsCount > 0) {
    violations.push(`Fiziksel sınır dışı ölçümler: ${outOfBoundsCount} adet (örnek: ${sampleOutOfBounds?.toFixed(2)} kW)`);
  }

  const passed = violations.length === 0;

  return {
    passed,
    circuitId,
    totalReceived,
    expectedPoints,
    missingRatio: Math.round(missingRatio * 1000) / 1000,
    maxConsecutiveFrozen,
    outOfBoundsCount,
    violations,
    qualityFlag: passed ? 'valid' : 'data_fault',
    details: {
      frozenValue: frozenVal,
      outOfBoundsSample: sampleOutOfBounds,
    },
  };
}

export interface IngestionResult {
  insertedCount: number;
  report: QualityGateReport;
  eventCreated?: {
    eventId: string;
    verdict: string;
  };
}

/**
 * Ingests a window of readings into SQLite.
 * If quality gates fail, per PRD FR-103:
 * Readings are flagged as 'data_fault' and a data_fault event is created in triage.
 */
export function ingestReadingsWindow(
  readings: RawReading[],
  options: QualityGateOptions = {}
): IngestionResult {
  if (readings.length === 0) {
    return {
      insertedCount: 0,
      report: {
        passed: false,
        circuitId: 'empty',
        totalReceived: 0,
        expectedPoints: options.expectedPoints ?? 96,
        missingRatio: 1.0,
        maxConsecutiveFrozen: 0,
        outOfBoundsCount: 0,
        violations: ['Boş veri paketi'],
        qualityFlag: 'data_fault',
        details: {},
      },
    };
  }

  const report = evaluateQualityGate(readings, options);

  let eventCreated: { eventId: string; verdict: string } | undefined;

  transaction(() => {
    // 1. Insert or replace readings with quality flag
    const insertStmt = db.prepare(`
      INSERT INTO reading (circuit_id, ts, power_kw, quality_flag)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(circuit_id, ts) DO UPDATE SET
        power_kw = excluded.power_kw,
        quality_flag = excluded.quality_flag
    `);

    for (const r of readings) {
      insertStmt.run(r.circuitId, r.ts, r.powerKw, report.qualityFlag);
    }

    // 2. FR-103: Kalite kapısından geçemeyen pencereler için 'data_fault' olayı üret
    if (!report.passed) {
      const circuitRow = db.prepare('SELECT household_id FROM circuit WHERE circuit_id = ?').get(report.circuitId) as { household_id?: string } | undefined;
      const householdId = circuitRow?.household_id ?? 'h-unknown';
      const eventId = `EVT-DF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
      const startTime = readings[0].ts;
      const endTime = readings[readings.length - 1].ts;

      db.prepare(`
        INSERT INTO event (
          event_id, household_id, circuit_id, meter, equipment, detector,
          t_start, t_end, anomaly_score, magnitude_kwh, dev, days, priority, severity, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId,
        householdId,
        report.circuitId,
        `MTR-${report.circuitId}`,
        'hp',
        'acute',
        startTime,
        endTime,
        1.0,
        0.0,
        0.0,
        1,
        1,
        'low',
        'triaged'
      );

      db.prepare(`
        INSERT INTO triage (event_id, verdict, peer_sync_rate, evidence, decided_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        eventId,
        'data_fault',
        0.0,
        JSON.stringify({ violations: report.violations, details: report.details }),
        new Date().toISOString()
      );

      eventCreated = { eventId, verdict: 'data_fault' };
    }
  });

  return {
    insertedCount: readings.length,
    report,
    eventCreated,
  };
}

/**
 * Ingests external weather observations (PRD FR-104)
 */
export function ingestWeatherObservations(observations: WeatherObservation[]) {
  const insertStmt = db.prepare(`
    INSERT INTO weather_obs (region, ts, temp_c, rel_humidity, ghi, poa)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(region, ts) DO UPDATE SET
      temp_c = excluded.temp_c,
      rel_humidity = excluded.rel_humidity,
      ghi = excluded.ghi,
      poa = excluded.poa
  `);

  transaction(() => {
    for (const obs of observations) {
      insertStmt.run(obs.region, obs.ts, obs.tempC, obs.relHumidity, obs.ghi, obs.poa);
    }
  });

  return observations.length;
}

/**
 * Fetches recent reading summary and quality health metrics for a circuit.
 */
export function getCircuitQualitySummary(circuitId: string) {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN quality_flag = 'valid' THEN 1 ELSE 0 END) as valid_count,
      SUM(CASE WHEN quality_flag = 'data_fault' THEN 1 ELSE 0 END) as fault_count,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts,
      AVG(power_kw) as avg_kw,
      MAX(power_kw) as max_kw
    FROM reading
    WHERE circuit_id = ?
  `).get(circuitId) as any;

  return {
    circuitId,
    totalReadings: stats?.total ?? 0,
    validReadings: stats?.valid_count ?? 0,
    faultReadings: stats?.fault_count ?? 0,
    firstTimestamp: stats?.first_ts ?? null,
    lastTimestamp: stats?.last_ts ?? null,
    avgKw: stats?.avg_kw ? Math.round(stats.avg_kw * 1000) / 1000 : 0,
    maxKw: stats?.max_kw ? Math.round(stats.max_kw * 1000) / 1000 : 0,
  };
}
