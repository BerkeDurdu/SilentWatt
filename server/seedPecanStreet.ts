// Seed Pecan Street sample time-series data and test Quality Gates (PRD M1 & M2)
import { ingestReadingsWindow, ingestWeatherObservations, type RawReading, type WeatherObservation } from './qualityGates';

export function seedPecanStreetData() {
  console.log('--- Pecan Street & Hava Durumu Veri Hattı Başlatılıyor ---');

  // 1. Seed Weather Observations for September 2026
  const weatherList: WeatherObservation[] = [];
  const startDay = 1;
  const daysCount = 14;

  for (let d = startDay; d <= daysCount; d++) {
    for (let h = 0; h < 24; h++) {
      const dayStr = d.toString().padStart(2, '0');
      const hourStr = h.toString().padStart(2, '0');
      const ts = `2026-09-${dayStr}T${hourStr}:00:00+03:00`;

      // Diurnal temperature cycle: coolest at 06:00 (18C), warmest at 15:00 (32C)
      const tempC = Math.round((25 + 7 * Math.sin(((h - 9) * Math.PI) / 12)) * 10) / 10;
      const relHumidity = Math.round((50 - 20 * Math.sin(((h - 9) * Math.PI) / 12)) * 10) / 10;

      // Solar irradiance: peak at 13:00, 0 at night
      const ghi = h >= 6 && h <= 19 ? Math.round(850 * Math.sin(((h - 6) * Math.PI) / 13)) : 0;
      const poa = Math.round(ghi * 1.08);

      weatherList.push({ region: 'İzmir', ts, tempC, relHumidity, ghi, poa });
    }
  }

  const weatherCount = ingestWeatherObservations(weatherList);
  console.log(`✓ ${weatherCount} adet hava durumu gözlemi işlendi (Sıcaklık, Bağıl Nem, GHI, POA).`);

  // 2. Generate healthy 15-minute readings for SW-F-24817 (Heat Pump)
  // 96 points per day for 7 days = 672 readings
  const healthyReadings: RawReading[] = [];
  const cId = 'c-SW-F-24817-main';

  for (let d = 1; d <= 7; d++) {
    for (let pt = 0; pt < 96; pt++) {
      const h = Math.floor(pt / 4);
      const m = (pt % 4) * 15;
      const dayStr = d.toString().padStart(2, '0');
      const hourStr = h.toString().padStart(2, '0');
      const minStr = m.toString().padStart(2, '0');
      const ts = `2026-09-${dayStr}T${hourStr}:${minStr}:00+03:00`;

      // Typical heat pump profile with temperature dependency and cycling
      const baseLoad = 0.8;
      const coolingLoad = (h >= 11 && h <= 21) ? (1.5 + Math.sin(pt / 8) * 0.8) : 0.2;
      const noise = (Math.random() - 0.5) * 0.1;
      const powerKw = Math.max(0.1, Math.round((baseLoad + coolingLoad + noise) * 1000) / 1000);

      healthyReadings.push({ circuitId: cId, ts, powerKw });
    }
  }

  const healthyResult = ingestReadingsWindow(healthyReadings, {
    resolutionMinutes: 15,
    expectedPoints: healthyReadings.length,
    nominalKw: 4.5,
  });
  console.log(`✓ Sağlıklı pencere (${healthyReadings.length} ölçüm) Kalite Kapısından geçti: ${healthyResult.report.passed ? 'BAŞARILI (valid)' : 'BAŞARISIZ'}`);

  // 3. Generate a faulty window with FROZEN SENSOR (65 consecutive identical non-zero readings)
  const frozenReadings: RawReading[] = [];
  const cIdFrozen = 'c-SW-F-24788-main'; // PV circuit

  for (let pt = 0; pt < 96; pt++) {
    const h = Math.floor(pt / 4);
    const m = (pt % 4) * 15;
    const hourStr = h.toString().padStart(2, '0');
    const minStr = m.toString().padStart(2, '0');
    const ts = `2026-09-08T${hourStr}:${minStr}:00+03:00`;

    // 65 consecutive stuck points between 08:00 and 24:00
    const powerKw = (pt >= 20 && pt <= 85) ? 2.450 : Math.round((Math.random() * 2.5) * 1000) / 1000;
    frozenReadings.push({ circuitId: cIdFrozen, ts, powerKw });
  }

  const frozenResult = ingestReadingsWindow(frozenReadings, {
    resolutionMinutes: 15,
    expectedPoints: 96,
    maxFrozenConsecutive: 60,
    nominalKw: 6.0,
    allowNegative: false,
  });
  console.log(`✓ Donmuş sensör testi: Geçti mi? ${frozenResult.report.passed} -> Beklenen 'data_fault' olayı üretildi: ${frozenResult.eventCreated?.eventId} (${frozenResult.report.violations[0]})`);

  // 4. Generate a faulty window with EXCESSIVE MISSING DATA (15% missing)
  const missingReadings: RawReading[] = [];
  const cIdMissing = 'c-SW-F-24776-main';

  for (let pt = 0; pt < 80; pt++) { // 80 out of 96 expected -> 16.6% missing
    const h = Math.floor(pt / 4);
    const m = (pt % 4) * 15;
    const hourStr = h.toString().padStart(2, '0');
    const minStr = m.toString().padStart(2, '0');
    const ts = `2026-09-09T${hourStr}:${minStr}:00+03:00`;
    missingReadings.push({ circuitId: cIdMissing, ts, powerKw: 1.25 });
  }

  const missingResult = ingestReadingsWindow(missingReadings, {
    resolutionMinutes: 15,
    expectedPoints: 96,
    maxMissingRatio: 0.05,
  });
  console.log(`✓ Eksik veri testi: Geçti mi? ${missingResult.report.passed} -> Beklenen 'data_fault' olayı üretildi: ${missingResult.eventCreated?.eventId} (${missingResult.report.violations[0]})`);

  console.log('--- Veri Hattı ve Kalite Kapıları Kurulumu Tamamlandı ---');
}
