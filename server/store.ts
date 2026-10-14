// Persistent SQLite data store backed by server/db.ts
// Compliant with SilentWatt PRD v0.9 Section 3.2 data model.
import { randomBytes } from 'node:crypto';
import type {
  AddressLevel, Capability, CaseDetail, CaseList, CaseStatus, CaseSummary, Cause, CustomerNotice, CustomerRequest,
  DataSourcesData, Equipment, FaultKey, FieldResult, JobsData, Lang, Me, Notification, OverviewData, Priority,
  ReportData, ReportRow, RequestPage, RequestReceipt, RequestSlot, RoleKey, ScreenKey, SeriesPoint, TeamMember,
  Technician, UserRow, UsersData,
} from '../shared/types';
import { ROLES, SCREENS, SCREEN_ORDER, isRoleKey, isScreenKey, screenLinks, type Text } from './catalog';
import { db, transaction } from './db';

export const ORGANIZATION: Text = { tr: 'Pilot Dağıtım A.Ş. (örnek)', en: 'Pilot Distribution Co. (example)' };
export const DEMO_PASSWORD = 'SilentWatt2026!';

const at = (s: string) => `2026-${s}:00+03:00`;
const now = () => new Date().toISOString();
const r1 = (n: number) => Math.round(n * 10) / 10;
const locale = (l: Lang) => (l === 'tr' ? 'tr-TR' : 'en-GB');
const lower = (s: string, l: Lang) => s.toLocaleLowerCase(locale(l));

/* ── users ─────────────────────────────────────────────── */

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: RoleKey;
  screens: ScreenKey[];
  active: boolean;
  salt: string;
  hash: string;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    email: row.email,
    role: row.role as RoleKey,
    screens: JSON.parse(row.screens) as ScreenKey[],
    active: Boolean(row.active),
    salt: row.salt,
    hash: row.hash,
  };
}

export function getAllUsers(): User[] {
  const rows = db.prepare('SELECT * FROM users').all() as any[];
  return rows.map(rowToUser);
}

// Exported for compatibility
export const users = new Proxy([] as User[], {
  get(_target, prop) {
    const list = getAllUsers();
    if (prop === 'length') return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    if (typeof prop === 'string' && !Number.isNaN(Number(prop))) return list[Number(prop)];
    const val = (list as any)[prop];
    return typeof val === 'function' ? val.bind(list) : val;
  },
});

export const findUser = (id: string): User | undefined => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  return row ? rowToUser(row) : undefined;
};

export const findUserByEmail = (email: string): User | undefined => {
  const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim()) as any;
  return row ? rowToUser(row) : undefined;
};

export const can = (u: User, cap: Capability) => ROLES[u.role].capabilities.includes(cap);
const addressLevel = (u: User): AddressLevel => ROLES[u.role].addressLevel;

export function toMe(u: User, l: Lang): Me {
  const role = ROLES[u.role];
  return {
    id: u.id, name: u.name, initials: u.initials, email: u.email,
    roleLabel: role.label[l], organization: ORGANIZATION[l], scopeNote: role.scopeNote[l],
    screens: screenLinks(u.screens, l), capabilities: role.capabilities,
  };
}

/* ── fault signatures (PRD FR-303 & 3.2) ─────────────────── */

export interface FaultDef {
  label: Text;
  check: Text;
  evidence: Record<Lang, string[]>;
}

export function loadFaults(): Record<FaultKey, FaultDef> {
  const rows = db.prepare('SELECT * FROM signature_def').all() as any[];
  const map = {} as Record<FaultKey, FaultDef>;
  for (const r of rows) {
    map[r.signature_id as FaultKey] = {
      label: { tr: r.name_tr, en: r.name_en },
      check: { tr: r.check_tr, en: r.check_en },
      evidence: {
        tr: JSON.parse(r.evidence_tr),
        en: JSON.parse(r.evidence_en),
      },
    };
  }
  return map;
}

const FAULTS: Record<FaultKey, FaultDef> = loadFaults();

/* ── cases ─────────────────────────────────────────────── */

export type EventType = 'created' | 'review' | 'assigned' | 'opened' | 'requested' | 'verified' | 'other' | 'dismissed';

export interface CaseEventRecord {
  type: EventType;
  at: string;
  techId?: string;
  note?: string;
}

export interface CaseRecord {
  id: string;
  district: string;
  hood: string;
  street: string;
  meter: string;
  equipment: Equipment;
  hyp: [FaultKey, number][];
  dev: number;
  days: number;
  kwh: number;
  status: CaseStatus;
  priority: Priority;
  techId: string | null;
  events: CaseEventRecord[];
}

function rowToCase(row: any): CaseRecord {
  const events = (db.prepare(`
    SELECT type, at, tech_id as techId, note
    FROM case_events
    WHERE case_id = ?
    ORDER BY id ASC
  `).all(row.event_id) as any[]).map((e) => ({
    type: e.type as EventType,
    at: e.at,
    ...(e.techId ? { techId: e.techId } : {}),
    ...(e.note ? { note: e.note } : {}),
  }));

  const hypRows = db.prepare(`
    SELECT signature_id, confidence
    FROM hypothesis
    WHERE event_id = ?
    ORDER BY rank ASC
  `).all(row.event_id) as { signature_id: FaultKey; confidence: number }[];

  const hyp = hypRows.map((h) => [h.signature_id, h.confidence] as [FaultKey, number]);

  return {
    id: row.event_id,
    district: row.district,
    hood: row.hood,
    street: row.street,
    meter: row.meter,
    equipment: row.equipment as Equipment,
    hyp,
    dev: row.dev,
    days: row.days,
    kwh: row.magnitude_kwh,
    status: row.status as CaseStatus,
    priority: row.priority as Priority,
    techId: row.tech_id,
    events,
  };
}

export function getAllCases(): CaseRecord[] {
  const rows = db.prepare(`
    SELECT e.*, h.district, h.hood, h.street
    FROM event e
    JOIN household h ON e.household_id = h.household_id
  `).all() as any[];
  return rows.map(rowToCase);
}

export const cases = new Proxy([] as CaseRecord[], {
  get(_target, prop) {
    const list = getAllCases();
    if (prop === 'length') return list.length;
    if (prop === Symbol.iterator) return list[Symbol.iterator].bind(list);
    if (typeof prop === 'string' && !Number.isNaN(Number(prop))) return list[Number(prop)];
    const val = (list as any)[prop];
    return typeof val === 'function' ? val.bind(list) : val;
  },
});

export function getCase(id: string): CaseRecord | undefined {
  const row = db.prepare(`
    SELECT e.*, h.district, h.hood, h.street
    FROM event e
    JOIN household h ON e.household_id = h.household_id
    WHERE e.event_id = ?
  `).get(id) as any;
  if (!row) return undefined;
  return rowToCase(row);
}

export interface MessageRecord {
  id: string;
  techId: string;
  caseId: string;
  at: string;
}

export function getTechnicianMessages(techId?: string): MessageRecord[] {
  const query = techId
    ? 'SELECT id, tech_id as techId, case_id as caseId, at FROM technician_messages WHERE tech_id = ? ORDER BY at DESC'
    : 'SELECT id, tech_id as techId, case_id as caseId, at FROM technician_messages ORDER BY at DESC';
  const rows = (techId ? db.prepare(query).all(techId) : db.prepare(query).all()) as any[];
  return rows;
}

/* ── residents: notice SMS and service requests ────────── */

interface CustomerRecord {
  name: string;
  phone: string;
  email: string;
}

const FALLBACK_CUSTOMER: CustomerRecord = { name: 'Abone', phone: '0500 000 00 00', email: '' };

function customerOf(c: CaseRecord): CustomerRecord {
  const row = db.prepare('SELECT name, phone, email FROM customers WHERE case_id = ?').get(c.id) as any;
  if (row) return { name: row.name, phone: row.phone, email: row.email };
  return FALLBACK_CUSTOMER;
}

function getCaseToken(caseId: string): string {
  const row = db.prepare('SELECT token FROM customers WHERE case_id = ?').get(caseId) as any;
  if (row) return row.token;
  const token = randomBytes(12).toString('base64url');
  db.prepare('INSERT OR REPLACE INTO customers (case_id, name, phone, email, token) VALUES (?, ?, ?, ?, ?)')
    .run(caseId, 'Abone', '0500 000 00 00', '', token);
  return token;
}

function getCaseIdByToken(token: string): string | null {
  const row = db.prepare('SELECT case_id FROM customers WHERE token = ?').get(token) as any;
  return row ? row.case_id : null;
}

export const REQUEST_PATH = '/talep';
const requestHref = (c: CaseRecord) => `${REQUEST_PATH}/${getCaseToken(c.id)}`;

interface RequestRecord {
  caseId: string;
  reference: string;
  at: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  addressEdited: boolean;
  slot: RequestSlot;
  note: string;
}

function requestFor(caseId: string): RequestRecord | undefined {
  const row = db.prepare('SELECT * FROM customer_requests WHERE case_id = ?').get(caseId) as any;
  if (!row) return undefined;
  return {
    caseId: row.case_id,
    reference: row.reference,
    at: row.at,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    address: row.address,
    addressEdited: Boolean(row.address_edited),
    slot: row.slot as RequestSlot,
    note: row.note || '',
  };
}

function getAllRequests(): RequestRecord[] {
  const rows = db.prepare('SELECT * FROM customer_requests').all() as any[];
  return rows.map((row) => ({
    caseId: row.case_id,
    reference: row.reference,
    at: row.at,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    address: row.address,
    addressEdited: Boolean(row.address_edited),
    slot: row.slot as RequestSlot,
    note: row.note || '',
  }));
}

const SLOT_LABELS: Record<Lang, Record<RequestSlot, string>> = {
  tr: { morning: 'Sabah · 09:00–12:00', afternoon: 'Öğleden sonra · 12:00–17:00', evening: 'Akşam · 17:00–20:00', any: 'Farketmez' },
  en: { morning: 'Morning · 09:00–12:00', afternoon: 'Afternoon · 12:00–17:00', evening: 'Evening · 17:00–20:00', any: 'Any time' },
};
const SLOTS = Object.keys(SLOT_LABELS.tr) as RequestSlot[];
const isSlot = (v: unknown): v is RequestSlot => typeof v === 'string' && SLOTS.includes(v as RequestSlot);

const fullAddress = (c: CaseRecord) => `${c.hood} ${c.street}, ${c.district}/İzmir`;
const equipmentLabel = (c: CaseRecord, l: Lang) =>
  c.equipment === 'pv' ? (l === 'tr' ? 'çatı güneş paneli' : 'rooftop solar') : (l === 'tr' ? 'ısı pompası' : 'heat pump');

export function customerNotice(c: CaseRecord, level: AddressLevel, l: Lang): CustomerNotice {
  const href = requestHref(c);
  const dev = Math.abs(c.dev);
  const gear = equipmentLabel(c, l);
  const text = l === 'tr'
    ? `SilentWatt: Sayacınız son ${c.days} gündür benzer hava koşullarında beklenenin %${dev} ${c.dev < 0 ? 'altında üretim' : 'üzerinde tüketim'} gösteriyor; ${gear} sisteminizde verim kaybı olabilir. Acil bir durum yok. Ücretsiz kontrol isterseniz:`
    : `SilentWatt: For ${c.days} days your meter has been ${dev}% ${c.dev < 0 ? 'below expected production' : 'above expected consumption'} in similar weather; your ${gear} may be losing efficiency. Nothing is urgent. For a free inspection:`;
  const full = level === 'full';
  return { at: c.events[0].at, text, href: full ? href : null, linkText: `silentwatt.app${full ? href : `${REQUEST_PATH}/••••••`}` };
}

function toCustomerRequest(r: RequestRecord, level: AddressLevel, l: Lang): CustomerRequest {
  const c = getCase(r.caseId)!;
  const masked = level !== 'full';
  return {
    reference: r.reference, at: r.at, name: r.name, phone: r.phone, email: r.email || null,
    address: masked ? address(c, level) : r.address,
    addressEdited: r.addressEdited, slotLabel: SLOT_LABELS[l][r.slot], note: r.note || null, masked,
  };
}

const toReceipt = (r: RequestRecord, l: Lang): RequestReceipt => ({
  reference: r.reference, at: r.at, name: r.name, phone: r.phone, address: r.address,
  slotLabel: SLOT_LABELS[l][r.slot], note: r.note || null,
});

export function requestPage(token: string, l: Lang): RequestPage | null {
  const caseId = getCaseIdByToken(token);
  if (!caseId) return null;
  const c = getCase(caseId);
  if (!c) return null;
  const tr = l === 'tr';
  const dev = Math.abs(c.dev);
  const gear = equipmentLabel(c, l);
  const existing = requestFor(c.id);
  const customer = customerOf(c);
  return {
    caseId: c.id,
    noticeAt: c.events[0].at,
    headline: tr ? 'Sayacınızda sessiz bir verim kaybı görüyoruz' : 'We see a silent efficiency loss on your meter',
    body: tr
      ? `Son ${c.days} gündür, benzer hava koşullarında beklenenin %${dev} ${c.dev < 0 ? 'altında üretim' : 'üzerinde tüketim'} ölçüyoruz. Acil bir durum yok; ${gear} sisteminiz çalışmaya devam ediyor. Bu fark ayda yaklaşık ${c.kwh} kWh'e karşılık geliyor.`
      : `For ${c.days} days we have measured ${dev}% ${c.dev < 0 ? 'below expected production' : 'above expected consumption'} in similar weather. Your ${gear} keeps running; nothing is urgent. The gap is worth about ${c.kwh} kWh a month.`,
    points: tr
      ? ['Bu bir arıza ihbarı değil, sayaç verisine dayanan bir ön tespit.', 'Kontrol ücretsizdir ve size uygun bir saatte yapılır.', 'Talep oluşturmak zorunda değilsiniz; istemiyorsanız bu mesajı yok sayabilirsiniz.']
      : ['This is not a fault report; it is an early finding from meter data.', 'The inspection is free and happens at a time that suits you.', 'You do not have to ask for one; you can ignore this message.'],
    equipmentLabel: gear,
    lossKwhMonth: c.kwh,
    days: c.days,
    closed: !isOpen(c),
    customer: { name: customer.name, phone: customer.phone, email: customer.email, address: fullAddress(c) },
    slots: SLOTS.map((value) => ({ value, label: SLOT_LABELS[l][value] })),
    submitted: existing ? toReceipt(existing, l) : null,
  };
}

export type RequestInput = Record<string, unknown>;
export type SubmitResult = { ok: true; receipt: RequestReceipt } | { ok: false; error: string };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export function submitRequest(token: string, input: RequestInput, l: Lang): SubmitResult {
  const caseId = getCaseIdByToken(token);
  if (!caseId) return { ok: false, error: 'not_found' };
  const c = getCase(caseId);
  if (!c) return { ok: false, error: 'not_found' };

  const name = text(input.name, 80);
  const phone = text(input.phone, 24);
  const email = text(input.email, 120);
  const address = text(input.address, 240);
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 400) : '';

  if (name.length < 2) return { ok: false, error: 'invalid_name' };
  if (!/^[+\d][\d\s()-]{8,23}$/.test(phone)) return { ok: false, error: 'invalid_phone' };
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'invalid_email' };
  if (address.length < 10) return { ok: false, error: 'invalid_address' };
  if (!isSlot(input.slot)) return { ok: false, error: 'invalid_slot' };

  const existing = requestFor(c.id);
  const record: RequestRecord = {
    caseId: c.id,
    reference: existing?.reference ?? `TL-${c.id.slice(-5)}`,
    at: now(), name, phone, email, address,
    addressEdited: address !== fullAddress(c),
    slot: input.slot, note,
  };

  transaction(() => {
    db.prepare(`
      INSERT INTO customer_requests (case_id, reference, at, name, phone, email, address, address_edited, slot, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE SET
        reference=excluded.reference,
        at=excluded.at,
        name=excluded.name,
        phone=excluded.phone,
        email=excluded.email,
        address=excluded.address,
        address_edited=excluded.address_edited,
        slot=excluded.slot,
        note=excluded.note
    `).run(
      record.caseId,
      record.reference,
      record.at,
      record.name,
      record.phone,
      record.email || null,
      record.address,
      record.addressEdited ? 1 : 0,
      record.slot,
      record.note || null
    );

    db.prepare('INSERT INTO case_events (case_id, type, at) VALUES (?, ?, ?)').run(c.id, 'requested', record.at);
  });

  return { ok: true, receipt: toReceipt(record, l) };
}

export const isOpen = (c: CaseRecord) => c.status === 'new' || c.status === 'review' || c.status === 'assigned';

export function canViewCase(u: User, c: CaseRecord) {
  return u.screens.includes('queue') || (u.screens.includes('jobs') && c.techId === u.id);
}

function caseHref(u: User, c: CaseRecord): string | null {
  if (u.screens.includes('queue')) return `${SCREENS.queue.path}/${c.id}`;
  if (u.screens.includes('jobs') && c.techId === u.id) return `${SCREENS.jobs.path}/${c.id}`;
  return null;
}

function address(c: CaseRecord, level: AddressLevel) {
  if (level === 'full') return `${c.hood} ${c.street}, ${c.district}`;
  if (level === 'neighbourhood') return `${c.hood}, ${c.district}`;
  return c.district;
}

function meter(c: CaseRecord, level: AddressLevel) {
  if (level === 'full') return c.meter;
  if (level === 'neighbourhood') return c.meter.replace(/-\d{4}-(\d{4})$/, '-••••-$1');
  return `•••• ${c.meter.slice(-4)}`;
}

const MONTHS: Record<Lang, [string, string]> = { tr: ['Ağu', 'Eyl'], en: ['Aug', 'Sep'] };

function dayLabel(d: number, l: Lang) {
  const day = 14 + d;
  return day <= 31 ? `${day} ${MONTHS[l][0]}` : `${day - 31} ${MONTHS[l][1]}`;
}

function series(c: CaseRecord, l: Lang): { points: SeriesPoint[]; onset: number } {
  let seed = Number.parseInt(c.id.slice(-5), 10);
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const onset = 30 - c.days + 1;
  const points: SeriesPoint[] = [];
  for (let d = 1; d <= 30; d++) {
    const ref = c.equipment === 'pv' ? 24 + 3.2 * Math.sin(d / 3.1) - d * 0.06 : 36 + 5 * Math.sin(d / 4.3) + d * 0.18;
    const noise = (rnd() - 0.5) * 0.05;
    const act = ref * (1 + noise + (d >= onset ? c.dev / 100 : 0));
    points.push({ d, label: dayLabel(d, l), ref: r1(ref), lo: r1(ref * 0.93), hi: r1(ref * 1.07), act: r1(act) });
  }
  return { points, onset };
}

const cause = (key: FaultKey, p: number, l: Lang): Cause => ({ key, label: FAULTS[key].label[l], p });
const nameOf = (id: string | null | undefined, l: Lang) => (id ? findUser(id)?.name ?? (l === 'tr' ? 'Bilinmeyen' : 'Unknown') : null);

export function toSummary(c: CaseRecord, u: User, l: Lang): CaseSummary {
  const s = series(c, l);
  const [top, second] = c.hyp;
  return {
    id: c.id, status: c.status, priority: c.priority, equipment: c.equipment,
    location: address(c, addressLevel(u)),
    topCause: cause(top[0], top[1], l),
    secondCause: second ? cause(second[0], second[1], l) : null,
    deviation: c.dev, days: c.days, lossKwhMonth: c.kwh,
    spark: { act: s.points.map((p) => p.act), ref: s.points.map((p) => p.ref), onset: s.onset },
    technicianName: nameOf(c.techId, l),
    firstCheck: FAULTS[top[0]].check[l],
    customerRequest: Boolean(requestFor(c.id)),
    href: caseHref(u, c),
  };
}

function eventLabel(e: CaseEventRecord, l: Lang) {
  const tr = l === 'tr';
  switch (e.type) {
    case 'created': return tr ? 'Uyarı üretildi, vaka açıldı' : 'Alert generated, case opened';
    case 'review': return tr ? 'Operatör incelemeye aldı' : 'Operator moved it to review';
    case 'assigned': return tr ? `${nameOf(e.techId, l)} kişisine SMS gönderildi` : `SMS sent to ${nameOf(e.techId, l)}`;
    case 'opened': return tr ? 'Teknisyen linki açtı' : 'Technician opened the link';
    case 'requested': return tr ? 'Müşteri SMS linkinden kontrol talebi oluşturdu' : 'The resident asked for an inspection from the SMS link';
    case 'verified': return tr ? 'Saha sonucu: önerilen neden doğrulandı' : 'Field result: suggested cause confirmed';
    case 'other': return tr ? 'Saha sonucu: farklı arıza bulundu' : 'Field result: a different fault was found';
    case 'dismissed': return tr ? 'Kapatıldı: yanlış alarm' : 'Closed: false alarm';
  }
}

export function toDetail(c: CaseRecord, u: User, l: Lang): CaseDetail {
  const s = series(c, l);
  const level = addressLevel(u);
  const open = isOpen(c);
  const triage = c.status === 'new' || c.status === 'review';
  return {
    ...toSummary(c, u, l),
    meter: meter(c, level),
    masked: level !== 'full',
    hypotheses: c.hyp.map(([k, p]) => ({ ...cause(k, p, l), inSet: p >= 0.15 })),
    other: r1(Math.max(0, 1 - c.hyp.reduce((a, [, p]) => a + p, 0)) * 100) / 100,
    evidence: FAULTS[c.hyp[0][0]].evidence[l],
    series: s.points,
    onset: s.onset,
    events: c.events.map((e) => ({ label: eventLabel(e, l), at: e.at, note: e.note ?? null })),
    notice: can(u, 'case.assign') || c.techId === u.id ? customerNotice(c, level, l) : null,
    request: (() => {
      const r = requestFor(c.id);
      return r ? toCustomerRequest(r, level, l) : null;
    })(),
    actions: {
      review: can(u, 'case.assign') && c.status === 'new',
      assign: can(u, 'case.assign') && triage,
      dismiss: can(u, 'case.dismiss') && triage,
      result: can(u, 'case.result') && open && c.status === 'assigned' && c.techId === u.id,
    },
  };
}

export function listCases(u: User, filter: string, l: Lang): CaseList {
  const allCases = getAllCases();
  const counts = { open: allCases.filter(isOpen).length, closed: allCases.filter((c) => !isOpen(c)).length, all: allCases.length };
  const items = allCases
    .filter((c) => (filter === 'all' ? true : filter === 'closed' ? !isOpen(c) : isOpen(c)))
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.priority - a.priority || Math.abs(b.dev) - Math.abs(a.dev))
    .map((c) => toSummary(c, u, l));
  return { items, counts };
}

/* ── case actions (persisted in SQLite) ─────────────────── */

export function markOpened(c: CaseRecord, u: User) {
  if (c.techId === u.id && c.events.at(-1)?.type === 'assigned') {
    const time = now();
    db.prepare('INSERT INTO case_events (case_id, type, at) VALUES (?, ?, ?)').run(c.id, 'opened', time);
    c.events.push({ type: 'opened', at: time });
  }
}

export function reviewCase(c: CaseRecord) {
  const time = now();
  transaction(() => {
    db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run('review', c.id);
    db.prepare('INSERT INTO case_events (case_id, type, at) VALUES (?, ?, ?)').run(c.id, 'review', time);
  });
  c.status = 'review';
  c.events.push({ type: 'review', at: time });
}

export function assignCase(c: CaseRecord, techId: string) {
  const tech = findUser(techId);
  if (!tech || !tech.active || !tech.screens.includes('jobs')) return false;
  const time = now();
  transaction(() => {
    db.prepare('UPDATE event SET status = ?, tech_id = ? WHERE event_id = ?').run('assigned', tech.id, c.id);
    db.prepare('INSERT INTO case_events (case_id, type, at, tech_id) VALUES (?, ?, ?, ?)').run(c.id, 'assigned', time, tech.id);
    const msgId = `m-${Date.now()}`;
    db.prepare('INSERT INTO technician_messages (id, tech_id, case_id, at) VALUES (?, ?, ?, ?)').run(msgId, tech.id, c.id, time);
  });
  c.status = 'assigned';
  c.techId = tech.id;
  c.events.push({ type: 'assigned', at: time, techId: tech.id });
  return true;
}

export function dismissCase(c: CaseRecord) {
  const time = now();
  transaction(() => {
    db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run('dismissed', c.id);
    db.prepare('INSERT INTO case_events (case_id, type, at) VALUES (?, ?, ?)').run(c.id, 'dismissed', time);
  });
  c.status = 'dismissed';
  c.events.push({ type: 'dismissed', at: time });
}

export function recordResult(c: CaseRecord, result: FieldResult, note: string) {
  const time = now();
  const nextStatus = result === 'dismissed' ? 'dismissed' : 'verified';
  transaction(() => {
    db.prepare('UPDATE event SET status = ? WHERE event_id = ?').run(nextStatus, c.id);
    db.prepare('INSERT INTO case_events (case_id, type, at, note) VALUES (?, ?, ?, ?)').run(c.id, result, time, note || null);
    const labelId = `lbl-${Date.now()}`;
    const outcome = result === 'verified' ? 'confirmed' : result === 'dismissed' ? 'rejected' : 'inconclusive';
    db.prepare(`
      INSERT INTO label (label_id, work_order_id, event_id, outcome, actual_fault, technician_note, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(labelId, null, c.id, outcome, c.hyp[0]?.[0] ?? null, note || null, time);
  });
  c.status = nextStatus;
  c.events.push({ type: result, at: time, note: note || undefined });
}

export const listTechnicians = (): Technician[] =>
  getAllUsers().filter((u) => u.active && u.screens.includes('jobs')).map((u) => ({ id: u.id, name: u.name }));

/* ── screen data ───────────────────────────────────────── */

export function jobsFor(u: User, l: Lang): JobsData {
  const allCases = getAllCases();
  const jobs = allCases
    .filter((c) => c.techId === u.id && isOpen(c))
    .sort((a, b) => b.priority - a.priority)
    .map((c) => toSummary(c, u, l));

  const messages = getTechnicianMessages(u.id);
  const inbox = messages
    .slice(0, 3)
    .map((m) => {
      const c = getCase(m.caseId);
      if (!c) return null;
      const path = `${SCREENS.jobs.path}/${c.id}`;
      const check = lower(FAULTS[c.hyp[0][0]].check[l], l);
      return {
        id: m.id, at: m.at,
        text: l === 'tr'
          ? `SilentWatt: ${c.id} size atandı. ${c.hood} ${c.street}. İlk kontrol: ${check}. Aç:`
          : `SilentWatt: ${c.id} assigned to you. ${c.hood} ${c.street}. Check first: ${check}. Open:`,
        href: path, linkText: `silentwatt.app${path}`, caseOpen: isOpen(c),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return { jobs, messages: inbox };
}

const PRIORITY_WORD: Record<Lang, Record<Priority, string>> = {
  tr: { 3: 'yüksek', 2: 'orta', 1: 'düşük' },
  en: { 3: 'high', 2: 'medium', 1: 'low' },
};

export function notificationsFor(u: User, l: Lang): Notification[] {
  const tr = l === 'tr';
  const list: Notification[] = [];
  const allCases = getAllCases();
  const allRequests = getAllRequests();

  if (u.screens.includes('queue') && can(u, 'case.assign')) {
    for (const c of allCases.filter((x) => x.status === 'new')) {
      const p = PRIORITY_WORD[l][c.priority];
      list.push({ id: `n-new-${c.id}`, text: tr ? `Yeni vaka ${c.id} · ${p} öncelik` : `New case ${c.id} · ${p} priority`, at: c.events[0].at, href: caseHref(u, c) });
    }
  }
  if (u.screens.includes('queue')) {
    for (const r of allRequests) {
      const c = getCase(r.caseId);
      if (!c) continue;
      list.push({
        id: `n-req-${c.id}`,
        text: tr ? `Müşteri kontrol talebi · ${c.id}` : `Resident asked for an inspection · ${c.id}`,
        at: r.at, href: caseHref(u, c),
      });
    }
  }
  if (u.screens.includes('jobs')) {
    for (const c of allCases.filter((x) => x.techId === u.id && x.status === 'assigned' && x.events.at(-1)?.type === 'assigned')) {
      list.push({ id: `n-job-${c.id}`, text: tr ? `İş emri atandı: ${c.id}` : `Work order assigned: ${c.id}`, at: c.events.at(-1)!.at, href: caseHref(u, c) });
    }
  }
  if (u.screens.includes('reports')) {
    list.push({ id: 'n-report', text: tr ? 'Son 12 haftanın raporu hazır' : 'The last-12-weeks report is ready', at: at('09-14T08:00'), href: SCREENS.reports.path });
  }
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

const WEEKS = [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38];
const W_VERIFIED = [3, 4, 3, 5, 6, 5, 7, 6, 8, 7, 6, 4];
const W_DISMISSED = [2, 2, 1, 2, 2, 1, 2, 1, 2, 1, 1, 1];
const REGIONS: [string, number, number, number][] = [['Bornova', 14600, 21, 5], ['Karşıyaka', 12100, 17, 6], ['Buca', 11800, 15, 4], ['Çiğli', 9700, 11, 3]];
const FAMILY_STATS: [FaultKey, number, number, number][] = [
  ['airflow', 26, 5, 2340], ['refrig', 14, 4, 1610], ['aux', 9, 3, 1480], ['defrost', 6, 3, 390], ['pv', 5, 2, 355], ['pvstring', 4, 1, 420],
];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function overview(l: Lang): OverviewData {
  const allCases = getAllCases();
  const verified = sum(W_VERIFIED);
  const dismissed = sum(W_DISMISSED);
  const open = allCases.filter(isOpen).length;
  const lastWeekOpen = Math.ceil(open * 0.57);
  return {
    visitsPerConfirmed: (verified + dismissed) / verified,
    falseAlarmRate: (dismissed / (verified + dismissed)) * 100,
    falseAlarmTarget: 25,
    openCases: open,
    coverage: 91.3,
    coverageTarget: 90,
    fieldResults: verified + dismissed,
    weeks: WEEKS.map((week, i) => ({
      week, verified: W_VERIFIED[i], dismissed: W_DISMISSED[i],
      open: i === 11 ? lastWeekOpen : i === 10 ? open - lastWeekOpen : 0,
    })),
    families: FAMILY_STATS.map(([key, count]) => ({ key, label: FAULTS[key].label[l], count, mvp0: key.startsWith('pv') })),
    regions: REGIONS.map(([name, meters, v, d]) => ({
      name, meters, verified: v, dismissed: d, open: allCases.filter((c) => c.district === name && isOpen(c)).length,
    })),
  };
}

export function team(u: User, l: Lang): TeamMember[] {
  const allCases = getAllCases();
  return getAllUsers()
    .filter((t) => t.active && t.screens.includes('jobs'))
    .map((t) => {
      const mine = allCases.filter((c) => c.techId === t.id);
      const closed = mine.filter((c) => !isOpen(c));
      return {
        id: t.id, name: t.name, initials: t.initials,
        openJobs: mine.filter(isOpen).length,
        closed: closed.length,
        confirmedRate: closed.length ? (closed.filter((c) => c.status === 'verified').length / closed.length) * 100 : null,
        jobs: mine.filter(isOpen).map((c) => toSummary(c, u, l)),
      };
    });
}

export function report(u: User, l: Lang): ReportData {
  const rows: ReportRow[] = FAMILY_STATS.map(([k, confirmed, falseAlarms, loss]) => ({
    label: FAULTS[k].label[l], mvp0: k.startsWith('pv'), confirmed, falseAlarms, visits: confirmed + falseAlarms, lossKwhMonth: loss,
  }));
  const totals: ReportRow = {
    label: l === 'tr' ? 'Toplam' : 'Total', mvp0: false,
    confirmed: sum(rows.map((r) => r.confirmed)), falseAlarms: sum(rows.map((r) => r.falseAlarms)),
    visits: sum(rows.map((r) => r.visits)), lossKwhMonth: sum(rows.map((r) => r.lossKwhMonth)),
  };
  return {
    period: l === 'tr' ? 'Son 12 hafta · H27–H38, 2026' : 'Last 12 weeks · W27–W38, 2026',
    rows, totals, canExport: can(u, 'report.export'),
  };
}

export function reportCsv(u: User, l: Lang) {
  const { rows, totals } = report(u, l);
  const sep = l === 'tr' ? ';' : ',';
  const header = l === 'tr'
    ? ['Arıza ailesi', 'Doğrulanan', 'Yanlış alarm', 'Saha ziyareti', 'Tespit edilen kayıp (kWh/ay)']
    : ['Fault family', 'Confirmed', 'False alarms', 'Field visits', 'Detected loss (kWh/mo)'];
  const lines = [header.join(sep)];
  for (const r of [...rows, totals]) lines.push([r.label, r.confirmed, r.falseAlarms, r.visits, r.lossKwhMonth].join(sep));
  return '﻿' + lines.join('\r\n');
}

export function dataSources(l: Lang): DataSourcesData {
  const tr = l === 'tr';
  return {
    sources: [
      { id: 'ami', name: tr ? 'Akıllı sayaç (AMI head-end)' : 'Smart meters (AMI head-end)', description: tr ? '15 dakikalık aktif enerji · 48.200 sayaç' : '15-minute active energy · 48,200 meters', status: 'example', lastData: at('09-14T09:15') },
      { id: 'weather', name: tr ? 'Hava durumu' : 'Weather', description: tr ? 'Saatlik sıcaklık ve derece-gün, bölge başına' : 'Hourly temperature and degree-days per district', status: 'connected', lastData: at('09-14T09:00') },
      { id: 'pv', name: tr ? 'PV invertör telemetrisi' : 'PV inverter telemetry', description: tr ? 'MVP-0 doğrulama ailesi; ground truth en ucuz burada' : 'MVP-0 validation family; the cheapest ground truth', status: 'example', lastData: at('09-14T08:45') },
      { id: 'circuit', name: tr ? 'Devre alt-ölçümü' : 'Circuit sub-metering', description: tr ? 'İsteğe bağlı; varsa teşhis netleşir' : 'Optional; sharpens the diagnosis when present', status: 'none', lastData: null },
    ],
  };
}

/* ── user management ───────────────────────────────────── */

function toUserRow(t: User, me: User, l: Lang): UserRow {
  return { id: t.id, name: t.name, email: t.email, role: t.role, roleLabel: ROLES[t.role].label[l], screens: [...t.screens], active: t.active, isSelf: t.id === me.id };
}

export function usersData(me: User, l: Lang): UsersData {
  const allUsers = getAllUsers();
  return {
    users: allUsers.map((t) => toUserRow(t, me, l)),
    screens: SCREEN_ORDER.map((key) => ({ key, title: SCREENS[key].title[l] })),
    roles: (Object.keys(ROLES) as RoleKey[]).map((key) => ({ key, label: ROLES[key].label[l], screens: ROLES[key].screens })),
    canManage: can(me, 'users.manage'),
  };
}

export type UpdateResult = { ok: true; user: UserRow; deactivated: boolean } | { ok: false; error: string };

export function updateUser(me: User, id: string, patch: Record<string, unknown>, l: Lang): UpdateResult {
  const target = findUser(id);
  if (!target) return { ok: false, error: 'not_found' };

  let role = target.role;
  if (patch.role !== undefined) {
    if (!isRoleKey(patch.role)) return { ok: false, error: 'invalid_role' };
    role = patch.role;
  }

  let screens = role !== target.role ? [...ROLES[role].screens] : [...target.screens];
  if (patch.screens !== undefined) {
    if (!Array.isArray(patch.screens) || !patch.screens.every(isScreenKey)) return { ok: false, error: 'invalid_screens' };
    screens = [...new Set(patch.screens)];
  }

  let active = target.active;
  if (patch.active !== undefined) {
    if (typeof patch.active !== 'boolean') return { ok: false, error: 'invalid_active' };
    active = patch.active;
  }

  if (target.id === me.id && (!screens.includes('users') || !active || role !== target.role)) {
    return { ok: false, error: 'self_lockout' };
  }

  const deactivated = target.active && !active;
  db.prepare('UPDATE users SET role = ?, screens = ?, active = ? WHERE id = ?')
    .run(role, JSON.stringify(screens), active ? 1 : 0, target.id);

  const updated = findUser(id)!;
  return { ok: true, user: toUserRow(updated, me, l), deactivated };
}
