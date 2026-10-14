import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import type { FaultKey, RoleKey } from '../shared/types';
import { ROLES } from './catalog';
import { hashPassword } from './password';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'silentwatt.db');
export const db = new DatabaseSync(DB_PATH);

// Pragmas for performance, concurrency, and integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Creates PRD v0.9 Section 3.2 compliant schema and seeds initial data if missing.
 */
export function initSchema() {
  db.exec(`
    -- 1. ÖLÇÜM TARAFI (PRD 3.2)
    CREATE TABLE IF NOT EXISTS household (
      household_id TEXT PRIMARY KEY,
      region TEXT NOT NULL,
      district TEXT,
      hood TEXT,
      street TEXT,
      floor_area REAL,
      pv_capacity_kw REAL,
      hvac_type TEXT,
      has_ev INTEGER DEFAULT 0,
      tariff_class TEXT
    );

    CREATE TABLE IF NOT EXISTS circuit (
      circuit_id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES household(household_id),
      circuit_type TEXT NOT NULL,
      nominal_kw REAL
    );

    CREATE TABLE IF NOT EXISTS reading (
      circuit_id TEXT NOT NULL REFERENCES circuit(circuit_id),
      ts TEXT NOT NULL,
      power_kw REAL NOT NULL,
      quality_flag TEXT DEFAULT 'valid',
      PRIMARY KEY (circuit_id, ts)
    );

    CREATE TABLE IF NOT EXISTS weather_obs (
      region TEXT NOT NULL,
      ts TEXT NOT NULL,
      temp_c REAL,
      rel_humidity REAL,
      ghi REAL,
      poa REAL,
      PRIMARY KEY (region, ts)
    );

    -- 2. MODEL VE İMZA TARAFI (PRD 3.2)
    CREATE TABLE IF NOT EXISTS model_version (
      model_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      trained_at TEXT NOT NULL,
      params TEXT,
      metrics TEXT,
      frozen INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS calibration_profile (
      profile_id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES household(household_id),
      circuit_id TEXT REFERENCES circuit(circuit_id),
      model_id TEXT NOT NULL REFERENCES model_version(model_id),
      alpha_target REAL NOT NULL,
      q_offset REAL NOT NULL,
      coverage_observed REAL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signature_def (
      signature_id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      equipment TEXT NOT NULL,
      name_tr TEXT NOT NULL,
      name_en TEXT NOT NULL,
      check_tr TEXT NOT NULL,
      check_en TEXT NOT NULL,
      evidence_tr TEXT NOT NULL, -- JSON
      evidence_en TEXT NOT NULL, -- JSON
      physical_rationale TEXT,
      typical_impact_pct REAL,
      first_check TEXT
    );

    -- 3. KARAR VE İŞ EMRİ TARAFI (PRD 3.2)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      screens TEXT NOT NULL, -- JSON
      active INTEGER NOT NULL DEFAULT 1,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event (
      event_id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL REFERENCES household(household_id),
      circuit_id TEXT REFERENCES circuit(circuit_id),
      meter TEXT NOT NULL,
      equipment TEXT NOT NULL,
      detector TEXT NOT NULL CHECK(detector IN ('acute', 'chronic')),
      t_start TEXT NOT NULL,
      t_end TEXT,
      anomaly_score REAL NOT NULL,
      magnitude_kwh REAL NOT NULL,
      dev REAL NOT NULL,
      days INTEGER NOT NULL,
      priority INTEGER NOT NULL,
      severity TEXT NOT NULL,
      model_id TEXT REFERENCES model_version(model_id),
      profile_id TEXT REFERENCES calibration_profile(profile_id),
      status TEXT NOT NULL CHECK(status IN ('new', 'review', 'assigned', 'verified', 'dismissed', 'triaged', 'diagnosed', 'dispatched', 'closed')),
      tech_id TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS triage (
      event_id TEXT PRIMARY KEY REFERENCES event(event_id),
      verdict TEXT NOT NULL CHECK(verdict IN ('valid', 'false_positive', 'data_fault', 'systemic')),
      peer_sync_rate REAL,
      evidence TEXT,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagnosis (
      diagnosis_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES event(event_id),
      created_at TEXT NOT NULL,
      tool_calls TEXT
    );

    CREATE TABLE IF NOT EXISTS hypothesis (
      hypothesis_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES event(event_id),
      diagnosis_id TEXT,
      signature_id TEXT NOT NULL REFERENCES signature_def(signature_id),
      rank INTEGER NOT NULL,
      confidence REAL NOT NULL,
      supporting TEXT, -- JSON
      contradicting TEXT, -- JSON
      est_kwh REAL
    );

    CREATE TABLE IF NOT EXISTS work_order (
      wo_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES event(event_id),
      hypothesis_id TEXT REFERENCES hypothesis(hypothesis_id),
      priority INTEGER NOT NULL,
      expected_value REAL,
      first_check TEXT,
      sla_due TEXT,
      assignee TEXT REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('queued', 'dispatched', 'closed'))
    );

    CREATE TABLE IF NOT EXISTS label (
      label_id TEXT PRIMARY KEY,
      work_order_id TEXT,
      event_id TEXT NOT NULL REFERENCES event(event_id),
      outcome TEXT NOT NULL CHECK(outcome IN ('confirmed', 'rejected', 'inconclusive')),
      actual_fault TEXT,
      technician_note TEXT,
      closed_at TEXT NOT NULL
    );

    -- 4. VAKA VE MÜŞTERİ ETKİLEŞİMİ
    CREATE TABLE IF NOT EXISTS case_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES event(event_id),
      type TEXT NOT NULL,
      at TEXT NOT NULL,
      tech_id TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS technician_messages (
      id TEXT PRIMARY KEY,
      tech_id TEXT NOT NULL REFERENCES users(id),
      case_id TEXT NOT NULL REFERENCES event(event_id),
      at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      case_id TEXT PRIMARY KEY REFERENCES event(event_id),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_requests (
      case_id TEXT PRIMARY KEY REFERENCES event(event_id),
      reference TEXT NOT NULL,
      at TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT NOT NULL,
      address_edited INTEGER NOT NULL DEFAULT 0,
      slot TEXT NOT NULL,
      note TEXT
    );
  `);

  seedDefaultData();
}

const DEMO_PASSWORD = 'SilentWatt2026!';
const atTime = (s: string) => `2026-${s}:00+03:00`;

function seedDefaultData() {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount > 0) return; // already seeded

  transaction(() => {
    // 1. Seed Users
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, initials, email, role, screens, active, salt, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const usersData: [string, string, string, RoleKey][] = [
      ['u-selin', 'Selin Aydın', 'yonetim@silentwatt.demo', 'manager'],
      ['u-kaan', 'Kaan Yıldız', 'operator@silentwatt.demo', 'operator'],
      ['u-emre', 'Emre Kaya', 'emre@silentwatt.demo', 'technician'],
      ['u-deniz', 'Deniz Tunç', 'deniz@silentwatt.demo', 'technician'],
      ['u-ece', 'Ece Arslan', 'admin@silentwatt.demo', 'admin'],
    ];

    for (const [id, name, email, role] of usersData) {
      const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
      const { salt, hash } = hashPassword(DEMO_PASSWORD);
      insertUser.run(id, name, initials, email, role, JSON.stringify(ROLES[role].screens), 1, salt, hash);
    }

    // 2. Seed Model Version & Calibration
    db.prepare(`
      INSERT INTO model_version (model_id, kind, trained_at, params, metrics, frozen)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'mv-2026-tft',
      'quantile_tft',
      '2026-08-01T00:00:00+03:00',
      JSON.stringify({ quantiles: [0.1, 0.5, 0.9], window_days: 30 }),
      JSON.stringify({ pinball_loss: 0.082, coverage: 0.913 }),
      1
    );

    // 3. Seed Fault Signatures (PRD 2.3 & 3.2)
    const insertSig = db.prepare(`
      INSERT INTO signature_def (signature_id, version, equipment, name_tr, name_en, check_tr, check_en, evidence_tr, evidence_en, physical_rationale, typical_impact_pct, first_check)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const signatures = [
      {
        id: 'airflow',
        equipment: 'hp',
        name: { tr: 'Hava debisi kısıtı', en: 'Airflow restriction' },
        check: { tr: 'Filtre ve iç ünite fanı', en: 'Filter and indoor fan' },
        evidence: {
          tr: ['Aynı dış sıcaklıkta kompresör çalışma süresi uzadı', 'Döngü başına güç profili düzleşti; fan yükü değişmedi', 'Sapma kademeli değil, tek bir basamakla başladı'],
          en: ['Compressor runtime rose at the same outdoor temperature', 'Per-cycle power profile flattened; fan load unchanged', 'The deviation began as a single step, not a slow drift'],
        },
        impact: 14,
      },
      {
        id: 'refrig',
        equipment: 'hp',
        name: { tr: 'Düşük soğutucu şarjı', en: 'Low refrigerant charge' },
        check: { tr: 'Emme/basma basıncı ve kaçak kontrolü', en: 'Suction/discharge pressure and leak check' },
        evidence: {
          tr: ['Soğuk günlerde verim kaybı belirgin şekilde artıyor', 'Çalışma süresi uzarken tepe güç düşüyor', 'Sapma haftalar içinde yavaşça büyüyor'],
          en: ['Efficiency loss grows sharply on cold days', 'Peak power drops while runtime lengthens', 'The deviation grows slowly over weeks'],
        },
        impact: 18,
      },
      {
        id: 'aux',
        equipment: 'hp',
        name: { tr: 'Yedek ısıtıcı sürekli devrede', en: 'Auxiliary heater stuck on' },
        check: { tr: 'Yedek ısıtıcı rölesi ve termostat kilit ayarı', en: 'Aux heater relay and thermostat lockout setting' },
        evidence: {
          tr: ['Ilık günlerde bile dirençli ısıtıcı imzası', 'Kompresörle eş zamanlı 5–10 kW yük basamağı', 'Defrost dışında da devreye giriyor'],
          en: ['Resistive heater signature even on mild days', 'A 5–10 kW load step alongside the compressor', 'Engages outside defrost cycles'],
        },
        impact: 31,
      },
      {
        id: 'defrost',
        equipment: 'hp',
        name: { tr: 'Defrost döngüsü arızası', en: 'Defrost cycle fault' },
        check: { tr: 'Defrost sensörü ve dış ünite serpantini', en: 'Defrost sensor and outdoor coil' },
        evidence: {
          tr: ['Defrost olayları olağandan sık', 'Nemli ve soğuk saatlerde sapma artıyor', 'Döngüler arası kısa güç düşüşleri'],
          en: ['Defrost events are more frequent than usual', 'The deviation rises in cold, humid hours', 'Short power dips between cycles'],
        },
        impact: 9,
      },
      {
        id: 'pv',
        equipment: 'pv',
        name: { tr: 'İnvertör kırpması', en: 'Inverter clipping' },
        check: { tr: 'İnvertör güç limiti ayarı', en: 'Inverter power limit setting' },
        evidence: {
          tr: ['Açık günlerde öğle üretimi düz bir tavanda kesiliyor', 'Tavan değeri panel kapasitesinin altında', 'Bulutlu günlerde sapma yok'],
          en: ['Midday output is cut at a flat ceiling on clear days', 'The ceiling sits below array capacity', 'No deviation on cloudy days'],
        },
        impact: -9,
      },
      {
        id: 'pvstring',
        equipment: 'pv',
        name: { tr: 'PV dizi kaybı', en: 'PV string loss' },
        check: { tr: 'Dizi sigortaları ve MC4 bağlantıları', en: 'String fuses and MC4 connectors' },
        evidence: {
          tr: ['Üretim tüm saatlerde sabit oranda düşük', 'Düşüş tek günde başladı', 'Işınım verisi normal'],
          en: ['Output is low by a constant ratio at every hour', 'The drop began on a single day', 'Irradiance data is normal'],
        },
        impact: -17,
      },
    ];

    for (const s of signatures) {
      insertSig.run(
        s.id,
        '1.0',
        s.equipment,
        s.name.tr,
        s.name.en,
        s.check.tr,
        s.check.en,
        JSON.stringify(s.evidence.tr),
        JSON.stringify(s.evidence.en),
        'Physical thermo/electrical model signature match',
        s.impact,
        s.check.tr
      );
    }

    // 4. Seed Households & Circuits & Calibration Profiles
    const insertHouse = db.prepare(`
      INSERT INTO household (household_id, region, district, hood, street, floor_area, pv_capacity_kw, hvac_type, has_ev, tariff_class)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCircuit = db.prepare(`
      INSERT INTO circuit (circuit_id, household_id, circuit_type, nominal_kw)
      VALUES (?, ?, ?, ?)
    `);

    const insertProfile = db.prepare(`
      INSERT INTO calibration_profile (profile_id, household_id, circuit_id, model_id, alpha_target, q_offset, coverage_observed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 5. Seed Events / Cases
    const insertEvent = db.prepare(`
      INSERT INTO event (event_id, household_id, circuit_id, meter, equipment, detector, t_start, t_end, anomaly_score, magnitude_kwh, dev, days, priority, severity, model_id, profile_id, status, tech_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHyp = db.prepare(`
      INSERT INTO hypothesis (hypothesis_id, event_id, diagnosis_id, signature_id, rank, confidence, supporting, contradicting, est_kwh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCaseEvent = db.prepare(`
      INSERT INTO case_events (case_id, type, at, tech_id, note)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertCustomer = db.prepare(`
      INSERT INTO customers (case_id, name, phone, email, token)
      VALUES (?, ?, ?, ?, ?)
    `);

    const casesSeed = [
      {
        id: 'SW-F-24817', district: 'Bornova', hood: 'Kazımdirik Mah.', street: '372/4 Sk. No:9', meter: 'TR-35-0082-4417', equipment: 'hp',
        hyp: [['airflow', 0.62], ['refrig', 0.27]] as [FaultKey, number][], dev: 14, days: 9, kwh: 118, status: 'new', priority: 3, techId: null,
        events: [{ type: 'created', at: atTime('09-13T22:40') }],
        cust: { name: 'Ayşe Demir', phone: '0532 118 44 07', email: 'ayse.demir@ornek.com' },
      },
      {
        id: 'SW-F-24809', district: 'Karşıyaka', hood: 'Bostanlı Mah.', street: '1814 Sk. No:22', meter: 'TR-35-0114-0931', equipment: 'hp',
        hyp: [['aux', 0.71], ['defrost', 0.18]] as [FaultKey, number][], dev: 31, days: 5, kwh: 204, status: 'review', priority: 3, techId: null,
        events: [{ type: 'created', at: atTime('09-12T06:15') }, { type: 'review', at: atTime('09-12T09:02') }],
        cust: { name: 'Mert Özkan', phone: '0505 447 20 91', email: 'mert.ozkan@ornek.com' },
      },
      {
        id: 'SW-F-24795', district: 'Buca', hood: 'Şirinyer Mah.', street: 'Menderes Cd. No:118', meter: 'TR-35-0209-7702', equipment: 'hp',
        hyp: [['refrig', 0.55], ['airflow', 0.33]] as [FaultKey, number][], dev: 11, days: 14, kwh: 86, status: 'assigned', priority: 2, techId: 'u-emre',
        events: [{ type: 'created', at: atTime('09-10T23:05') }, { type: 'review', at: atTime('09-11T08:40') }, { type: 'assigned', at: atTime('09-11T10:12'), techId: 'u-emre' }],
        cust: { name: 'Hacer Yalçın', phone: '0543 260 71 88', email: 'hacer.yalcin@ornek.com' },
      },
      {
        id: 'SW-F-24788', district: 'Çiğli', hood: 'Ataşehir Mah.', street: '8028 Sk. No:3', meter: 'TR-35-0341-2256', equipment: 'pv',
        hyp: [['pv', 0.8]] as [FaultKey, number][], dev: -9, days: 21, kwh: 64, status: 'new', priority: 2, techId: null,
        events: [{ type: 'created', at: atTime('09-13T18:30') }],
        cust: { name: 'Burak Şen', phone: '0538 905 13 62', email: 'burak.sen@ornek.com' },
      },
      {
        id: 'SW-F-24776', district: 'Bornova', hood: 'Evka-3 Mah.', street: '124 Sk. No:41', meter: 'TR-35-0082-6610', equipment: 'hp',
        hyp: [['defrost', 0.58], ['airflow', 0.22]] as [FaultKey, number][], dev: 9, days: 6, kwh: 52, status: 'new', priority: 1, techId: null,
        events: [{ type: 'created', at: atTime('09-13T05:10') }],
        cust: { name: 'Nalan Kurt', phone: '0554 371 08 25', email: '' },
      },
      {
        id: 'SW-F-24761', district: 'Karşıyaka', hood: 'Mavişehir Mah.', street: '2040/1 Sk. No:7', meter: 'TR-35-0114-3385', equipment: 'pv',
        hyp: [['pvstring', 0.74]] as [FaultKey, number][], dev: -17, days: 11, kwh: 97, status: 'assigned', priority: 2, techId: 'u-deniz',
        events: [{ type: 'created', at: atTime('09-08T19:55') }, { type: 'assigned', at: atTime('09-09T09:30'), techId: 'u-deniz' }, { type: 'opened', at: atTime('09-09T09:41') }],
        cust: { name: 'Serkan Aksoy', phone: '0531 642 99 10', email: 'serkan.aksoy@ornek.com' },
      },
      {
        id: 'SW-F-24744', district: 'Buca', hood: 'Kaynaklar Mah.', street: 'Kaynaklar Cd. No:62', meter: 'TR-35-0209-1147', equipment: 'hp',
        hyp: [['airflow', 0.49], ['refrig', 0.38]] as [FaultKey, number][], dev: 7, days: 18, kwh: 41, status: 'review', priority: 1, techId: null,
        events: [{ type: 'created', at: atTime('09-06T21:20') }, { type: 'review', at: atTime('09-07T08:15') }],
        cust: { name: 'Fatma Uysal', phone: '0536 208 55 41', email: '' },
      },
      {
        id: 'SW-F-24702', district: 'Bornova', hood: 'Erzene Mah.', street: '96 Sk. No:12', meter: 'TR-35-0082-0578', equipment: 'hp',
        hyp: [['refrig', 0.81]] as [FaultKey, number][], dev: 16, days: 24, kwh: 131, status: 'verified', priority: 2, techId: 'u-emre',
        events: [{ type: 'created', at: atTime('09-02T22:10') }, { type: 'assigned', at: atTime('09-03T09:05'), techId: 'u-emre' }, { type: 'opened', at: atTime('09-03T11:20') },
          { type: 'verified', at: atTime('09-03T14:48'), note: 'Kaynak noktasında kaçak bulundu, şarj tamamlandı.' }],
        cust: { name: 'İlker Bayrak', phone: '0542 713 66 09', email: 'ilker.bayrak@ornek.com' },
      },
      {
        id: 'SW-F-24698', district: 'Çiğli', hood: 'Egekent Mah.', street: '8660 Sk. No:5', meter: 'TR-35-0341-9014', equipment: 'hp',
        hyp: [['airflow', 0.41], ['aux', 0.3]] as [FaultKey, number][], dev: 6, days: 12, kwh: 28, status: 'dismissed', priority: 1, techId: null,
        events: [{ type: 'created', at: atTime('09-01T20:45') }, { type: 'review', at: atTime('09-02T08:30') }, { type: 'dismissed', at: atTime('09-02T10:05') }],
        cust: { name: 'Zeynep Çelik', phone: '0533 884 17 50', email: 'zeynep.celik@ornek.com' },
      },
    ];

    for (const c of casesSeed) {
      const hId = `h-${c.id}`;
      const cId = `c-${c.id}-main`;
      const pId = `prof-${c.id}`;

      insertHouse.run(hId, 'İzmir', c.district, c.hood, c.street, 140, c.equipment === 'pv' ? 6.5 : null, c.equipment === 'hp' ? 'air-to-water' : null, 0, 'residential');
      insertCircuit.run(cId, hId, c.equipment === 'pv' ? 'solar' : 'hvac', c.equipment === 'pv' ? 6.0 : 4.5);
      insertProfile.run(pId, hId, cId, 'mv-2026-tft', 0.1, 0.05, 0.913, '2026-08-15T00:00:00+03:00');

      insertEvent.run(
        c.id,
        hId,
        cId,
        c.meter,
        c.equipment,
        'acute',
        c.events[0].at,
        null,
        Math.abs(c.dev) / 100,
        c.kwh,
        c.dev,
        c.days,
        c.priority,
        c.priority === 3 ? 'high' : c.priority === 2 ? 'medium' : 'low',
        'mv-2026-tft',
        pId,
        c.status,
        c.techId
      );

      // Hypotheses
      let rank = 1;
      for (const [key, conf] of c.hyp) {
        insertHyp.run(
          `hyp-${c.id}-${rank}`,
          c.id,
          null,
          key,
          rank,
          conf,
          JSON.stringify(['Anomaly signature correlation > 0.8']),
          JSON.stringify([]),
          c.kwh * conf
        );
        rank++;
      }

      // Case events
      for (const ev of c.events) {
        insertCaseEvent.run(c.id, ev.type, ev.at, (ev as { techId?: string }).techId ?? null, (ev as { note?: string }).note ?? null);
      }

      // Customer link token
      const token = randomBytes(12).toString('base64url');
      insertCustomer.run(c.id, c.cust.name, c.cust.phone, c.cust.email, token);
    }

    // 6. Seed Messages for technicians
    const insertMsg = db.prepare(`
      INSERT INTO technician_messages (id, tech_id, case_id, at)
      VALUES (?, ?, ?, ?)
    `);

    insertMsg.run('m-1', 'u-emre', 'SW-F-24702', atTime('09-03T09:05'));
    insertMsg.run('m-2', 'u-deniz', 'SW-F-24761', atTime('09-09T09:30'));
    insertMsg.run('m-3', 'u-emre', 'SW-F-24795', atTime('09-11T10:12'));
  });
}

// Automatically initialize schema and seed on import
initSchema();
