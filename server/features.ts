// Feature Engineering & Context Alignment (PRD v0.9 M2: FR-104, FR-105)
// Calculates Degree Days, Lags, Rolling Statistics, and Calendar Covariates.

export interface EnrichedDataPoint {
  ts: string;
  powerKw: number;
  tempC?: number;
  relHumidity?: number;
  ghi?: number;
  // FR-105: Degree-Days
  cdd: number; // Cooling Degree Days (base 18C)
  hdd: number; // Heating Degree Days (base 18C)
  // FR-105: Calendar Features
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  hourSin: number;
  hourCos: number;
  // FR-105: Lags & Rolling
  lag1?: number; // Previous step
  lag4?: number; // 1 hour ago (for 15-min data)
  lag96?: number; // 24 hours ago (same hour yesterday)
  rollingMean4h?: number;
  rollingStd4h?: number;
}

export function computeDegreeDays(tempC: number, baseTemp: number = 18.0) {
  const cdd = Math.max(0, tempC - baseTemp);
  const hdd = Math.max(0, baseTemp - tempC);
  return { cdd, hdd };
}

export function computeCalendarFeatures(date: Date) {
  const hour = date.getHours();
  const dayOfWeek = date.getDay(); // 0 is Sunday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const hourRad = (2 * Math.PI * hour) / 24;
  const hourSin = Math.sin(hourRad);
  const hourCos = Math.cos(hourRad);

  return {
    hour,
    dayOfWeek,
    isWeekend,
    hourSin: Math.round(hourSin * 1000) / 1000,
    hourCos: Math.round(hourCos * 1000) / 1000,
  };
}

export function enrichTimeSeries(
  points: { ts: string; powerKw: number; tempC?: number; relHumidity?: number; ghi?: number }[]
): EnrichedDataPoint[] {
  // Ensure chronological order
  const sorted = [...points].sort((a, b) => a.ts.localeCompare(b.ts));
  const result: EnrichedDataPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const pt = sorted[i];
    const d = new Date(pt.ts);
    const { cdd, hdd } = computeDegreeDays(pt.tempC ?? 20.0);
    const cal = computeCalendarFeatures(d);

    // Lags
    const lag1 = i >= 1 ? sorted[i - 1].powerKw : undefined;
    const lag4 = i >= 4 ? sorted[i - 4].powerKw : undefined;
    const lag96 = i >= 96 ? sorted[i - 96].powerKw : undefined;

    // Rolling 4h window (16 points for 15-min)
    const windowStart = Math.max(0, i - 15);
    const windowPoints = sorted.slice(windowStart, i + 1).map((p) => p.powerKw);
    const sum = windowPoints.reduce((acc, v) => acc + v, 0);
    const mean = sum / windowPoints.length;
    const variance = windowPoints.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / windowPoints.length;
    const std = Math.sqrt(variance);

    result.push({
      ts: pt.ts,
      powerKw: pt.powerKw,
      tempC: pt.tempC,
      relHumidity: pt.relHumidity,
      ghi: pt.ghi,
      cdd: Math.round(cdd * 100) / 100,
      hdd: Math.round(hdd * 100) / 100,
      ...cal,
      lag1: lag1 !== undefined ? Math.round(lag1 * 1000) / 1000 : undefined,
      lag4: lag4 !== undefined ? Math.round(lag4 * 1000) / 1000 : undefined,
      lag96: lag96 !== undefined ? Math.round(lag96 * 1000) / 1000 : undefined,
      rollingMean4h: Math.round(mean * 1000) / 1000,
      rollingStd4h: Math.round(std * 1000) / 1000,
    });
  }

  return result;
}
