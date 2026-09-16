// In-memory data store with example data. Swap for a database later; the API shape stays the same.
import { randomBytes } from 'node:crypto';
import type {
  AddressLevel, Capability, CaseDetail, CaseList, CaseStatus, CaseSummary, Cause, CustomerNotice, CustomerRequest,
  DataSourcesData, Equipment, FaultKey, FieldResult, JobsData, Lang, Me, Notification, OverviewData, Priority,
  ReportData, ReportRow, RequestPage, RequestReceipt, RequestSlot, RoleKey, ScreenKey, SeriesPoint, TeamMember,
  Technician, UserRow, UsersData,
} from '../shared/types';
import { ROLES, SCREENS, SCREEN_ORDER, isRoleKey, isScreenKey, screenLinks, type Text } from './catalog';
import { hashPassword } from './password';

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

function makeUser(id: string, name: string, email: string, role: RoleKey): User {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return { id, name, initials, email, role, screens: [...ROLES[role].screens], active: true, ...hashPassword(DEMO_PASSWORD) };
}

export const users: User[] = [
  makeUser('u-selin', 'Selin Aydın', 'yonetim@silentwatt.demo', 'manager'),
  makeUser('u-kaan', 'Kaan Yıldız', 'operator@silentwatt.demo', 'operator'),
  makeUser('u-emre', 'Emre Kaya', 'emre@silentwatt.demo', 'technician'),
  makeUser('u-deniz', 'Deniz Tunç', 'deniz@silentwatt.demo', 'technician'),
  makeUser('u-ece', 'Ece Arslan', 'admin@silentwatt.demo', 'admin'),
];

export const findUser = (id: string) => users.find((u) => u.id === id);
export const findUserByEmail = (email: string) => users.find((u) => u.email === email.trim().toLowerCase());
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

/* ── fault knowledge ───────────────────────────────────── */

const FAULTS: Record<FaultKey, { label: Text; check: Text; evidence: Record<Lang, string[]> }> = {
  airflow: {
    label: { tr: 'Hava debisi kısıtı', en: 'Airflow restriction' },
    check: { tr: 'Filtre ve iç ünite fanı', en: 'Filter and indoor fan' },
    evidence: {
      tr: ['Aynı dış sıcaklıkta kompresör çalışma süresi uzadı', 'Döngü başına güç profili düzleşti; fan yükü değişmedi', 'Sapma kademeli değil, tek bir basamakla başladı'],
      en: ['Compressor runtime rose at the same outdoor temperature', 'Per-cycle power profile flattened; fan load unchanged', 'The deviation began as a single step, not a slow drift'],
    },
  },
  refrig: {
    label: { tr: 'Düşük soğutucu şarjı', en: 'Low refrigerant charge' },
    check: { tr: 'Emme/basma basıncı ve kaçak kontrolü', en: 'Suction/discharge pressure and leak check' },
    evidence: {
      tr: ['Soğuk günlerde verim kaybı belirgin şekilde artıyor', 'Çalışma süresi uzarken tepe güç düşüyor', 'Sapma haftalar içinde yavaşça büyüyor'],
      en: ['Efficiency loss grows sharply on cold days', 'Peak power drops while runtime lengthens', 'The deviation grows slowly over weeks'],
    },
  },
  aux: {
    label: { tr: 'Yedek ısıtıcı sürekli devrede', en: 'Auxiliary heater stuck on' },
    check: { tr: 'Yedek ısıtıcı rölesi ve termostat kilit ayarı', en: 'Aux heater relay and thermostat lockout setting' },
    evidence: {
      tr: ['Ilık günlerde bile dirençli ısıtıcı imzası', 'Kompresörle eş zamanlı 5–10 kW yük basamağı', 'Defrost dışında da devreye giriyor'],
      en: ['Resistive heater signature even on mild days', 'A 5–10 kW load step alongside the compressor', 'Engages outside defrost cycles'],
    },
  },
  defrost: {
    label: { tr: 'Defrost döngüsü arızası', en: 'Defrost cycle fault' },
    check: { tr: 'Defrost sensörü ve dış ünite serpantini', en: 'Defrost sensor and outdoor coil' },
    evidence: {
      tr: ['Defrost olayları olağandan sık', 'Nemli ve soğuk saatlerde sapma artıyor', 'Döngüler arası kısa güç düşüşleri'],
      en: ['Defrost events are more frequent than usual', 'The deviation rises in cold, humid hours', 'Short power dips between cycles'],
    },
  },
  pv: {
    label: { tr: 'İnvertör kırpması', en: 'Inverter clipping' },
    check: { tr: 'İnvertör güç limiti ayarı', en: 'Inverter power limit setting' },
    evidence: {
      tr: ['Açık günlerde öğle üretimi düz bir tavanda kesiliyor', 'Tavan değeri panel kapasitesinin altında', 'Bulutlu günlerde sapma yok'],
      en: ['Midday output is cut at a flat ceiling on clear days', 'The ceiling sits below array capacity', 'No deviation on cloudy days'],
    },
  },
  pvstring: {
    label: { tr: 'PV dizi kaybı', en: 'PV string loss' },
    check: { tr: 'Dizi sigortaları ve MC4 bağlantıları', en: 'String fuses and MC4 connectors' },
    evidence: {
      tr: ['Üretim tüm saatlerde sabit oranda düşük', 'Düşüş tek günde başladı', 'Işınım verisi normal'],
      en: ['Output is low by a constant ratio at every hour', 'The drop began on a single day', 'Irradiance data is normal'],
    },
  },
};

/* ── cases ─────────────────────────────────────────────── */

type EventType = 'created' | 'review' | 'assigned' | 'opened' | 'requested' | 'verified' | 'other' | 'dismissed';

interface CaseEventRecord {
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

export const cases: CaseRecord[] = [
  { id: 'SW-F-24817', district: 'Bornova', hood: 'Kazımdirik Mah.', street: '372/4 Sk. No:9', meter: 'TR-35-0082-4417', equipment: 'hp',
    hyp: [['airflow', 0.62], ['refrig', 0.27]], dev: 14, days: 9, kwh: 118, status: 'new', priority: 3, techId: null,
    events: [{ type: 'created', at: at('09-13T22:40') }] },
  { id: 'SW-F-24809', district: 'Karşıyaka', hood: 'Bostanlı Mah.', street: '1814 Sk. No:22', meter: 'TR-35-0114-0931', equipment: 'hp',
    hyp: [['aux', 0.71], ['defrost', 0.18]], dev: 31, days: 5, kwh: 204, status: 'review', priority: 3, techId: null,
    events: [{ type: 'created', at: at('09-12T06:15') }, { type: 'review', at: at('09-12T09:02') }] },
  { id: 'SW-F-24795', district: 'Buca', hood: 'Şirinyer Mah.', street: 'Menderes Cd. No:118', meter: 'TR-35-0209-7702', equipment: 'hp',
    hyp: [['refrig', 0.55], ['airflow', 0.33]], dev: 11, days: 14, kwh: 86, status: 'assigned', priority: 2, techId: 'u-emre',
    events: [{ type: 'created', at: at('09-10T23:05') }, { type: 'review', at: at('09-11T08:40') }, { type: 'assigned', at: at('09-11T10:12'), techId: 'u-emre' }] },
  { id: 'SW-F-24788', district: 'Çiğli', hood: 'Ataşehir Mah.', street: '8028 Sk. No:3', meter: 'TR-35-0341-2256', equipment: 'pv',
    hyp: [['pv', 0.8]], dev: -9, days: 21, kwh: 64, status: 'new', priority: 2, techId: null,
    events: [{ type: 'created', at: at('09-13T18:30') }] },
  { id: 'SW-F-24776', district: 'Bornova', hood: 'Evka-3 Mah.', street: '124 Sk. No:41', meter: 'TR-35-0082-6610', equipment: 'hp',
    hyp: [['defrost', 0.58], ['airflow', 0.22]], dev: 9, days: 6, kwh: 52, status: 'new', priority: 1, techId: null,
    events: [{ type: 'created', at: at('09-13T05:10') }] },
  { id: 'SW-F-24761', district: 'Karşıyaka', hood: 'Mavişehir Mah.', street: '2040/1 Sk. No:7', meter: 'TR-35-0114-3385', equipment: 'pv',
    hyp: [['pvstring', 0.74]], dev: -17, days: 11, kwh: 97, status: 'assigned', priority: 2, techId: 'u-deniz',
    events: [{ type: 'created', at: at('09-08T19:55') }, { type: 'assigned', at: at('09-09T09:30'), techId: 'u-deniz' }, { type: 'opened', at: at('09-09T09:41') }] },
  { id: 'SW-F-24744', district: 'Buca', hood: 'Kaynaklar Mah.', street: 'Kaynaklar Cd. No:62', meter: 'TR-35-0209-1147', equipment: 'hp',
    hyp: [['airflow', 0.49], ['refrig', 0.38]], dev: 7, days: 18, kwh: 41, status: 'review', priority: 1, techId: null,
    events: [{ type: 'created', at: at('09-06T21:20') }, { type: 'review', at: at('09-07T08:15') }] },
  { id: 'SW-F-24702', district: 'Bornova', hood: 'Erzene Mah.', street: '96 Sk. No:12', meter: 'TR-35-0082-0578', equipment: 'hp',
    hyp: [['refrig', 0.81]], dev: 16, days: 24, kwh: 131, status: 'verified', priority: 2, techId: 'u-emre',
    events: [{ type: 'created', at: at('09-02T22:10') }, { type: 'assigned', at: at('09-03T09:05'), techId: 'u-emre' }, { type: 'opened', at: at('09-03T11:20') },
      { type: 'verified', at: at('09-03T14:48'), note: 'Kaynak noktasında kaçak bulundu, şarj tamamlandı.' }] },
  { id: 'SW-F-24698', district: 'Çiğli', hood: 'Egekent Mah.', street: '8660 Sk. No:5', meter: 'TR-35-0341-9014', equipment: 'hp',
    hyp: [['airflow', 0.41], ['aux', 0.3]], dev: 6, days: 12, kwh: 28, status: 'dismissed', priority: 1, techId: null,
    events: [{ type: 'created', at: at('09-01T20:45') }, { type: 'review', at: at('09-02T08:30') }, { type: 'dismissed', at: at('09-02T10:05') }] },
];

interface MessageRecord {
  id: string;
  techId: string;
  caseId: string;
  at: string;
}

const messages: MessageRecord[] = [
  { id: 'm-1', techId: 'u-emre', caseId: 'SW-F-24702', at: at('09-03T09:05') },
  { id: 'm-2', techId: 'u-deniz', caseId: 'SW-F-24761', at: at('09-09T09:30') },
  { id: 'm-3', techId: 'u-emre', caseId: 'SW-F-24795', at: at('09-11T10:12') },
];

/* ── residents: notice SMS and service requests ────────── */

interface CustomerRecord {
  name: string;
  phone: string;
  email: string;
}

/** The subscriber on record for each meter. Used to prefill the request form; example data. */
const CUSTOMERS: Record<string, CustomerRecord> = {
  'SW-F-24817': { name: 'Ayşe Demir', phone: '0532 118 44 07', email: 'ayse.demir@ornek.com' },
  'SW-F-24809': { name: 'Mert Özkan', phone: '0505 447 20 91', email: 'mert.ozkan@ornek.com' },
  'SW-F-24795': { name: 'Hacer Yalçın', phone: '0543 260 71 88', email: 'hacer.yalcin@ornek.com' },
  'SW-F-24788': { name: 'Burak Şen', phone: '0538 905 13 62', email: 'burak.sen@ornek.com' },
  'SW-F-24776': { name: 'Nalan Kurt', phone: '0554 371 08 25', email: '' },
  'SW-F-24761': { name: 'Serkan Aksoy', phone: '0531 642 99 10', email: 'serkan.aksoy@ornek.com' },
  'SW-F-24744': { name: 'Fatma Uysal', phone: '0536 208 55 41', email: '' },
  'SW-F-24702': { name: 'İlker Bayrak', phone: '0542 713 66 09', email: 'ilker.bayrak@ornek.com' },
  'SW-F-24698': { name: 'Zeynep Çelik', phone: '0533 884 17 50', email: 'zeynep.celik@ornek.com' },
};

const FALLBACK_CUSTOMER: CustomerRecord = { name: 'Abone', phone: '0500 000 00 00', email: '' };
const customerOf = (c: CaseRecord) => CUSTOMERS[c.id] ?? FALLBACK_CUSTOMER;

/** One unguessable link per case. The resident never signs in; the token is the whole key. */
const tokenByCase = new Map<string, string>();
const caseByToken = new Map<string, string>();
for (const c of cases) {
  const token = randomBytes(12).toString('base64url');
  tokenByCase.set(c.id, token);
  caseByToken.set(token, c.id);
}

export const REQUEST_PATH = '/talep';
const requestHref = (c: CaseRecord) => `${REQUEST_PATH}/${tokenByCase.get(c.id)}`;

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

const requests: RequestRecord[] = [];
const requestFor = (caseId: string) => requests.find((r) => r.caseId === caseId);

const SLOT_LABELS: Record<Lang, Record<RequestSlot, string>> = {
  tr: { morning: 'Sabah · 09:00–12:00', afternoon: 'Öğleden sonra · 12:00–17:00', evening: 'Akşam · 17:00–20:00', any: 'Farketmez' },
  en: { morning: 'Morning · 09:00–12:00', afternoon: 'Afternoon · 12:00–17:00', evening: 'Evening · 17:00–20:00', any: 'Any time' },
};
const SLOTS = Object.keys(SLOT_LABELS.tr) as RequestSlot[];
const isSlot = (v: unknown): v is RequestSlot => typeof v === 'string' && SLOTS.includes(v as RequestSlot);

const fullAddress = (c: CaseRecord) => `${c.hood} ${c.street}, ${c.district}/İzmir`;
const equipmentLabel = (c: CaseRecord, l: Lang) =>
  c.equipment === 'pv' ? (l === 'tr' ? 'çatı güneş paneli' : 'rooftop solar') : (l === 'tr' ? 'ısı pompası' : 'heat pump');

/**
 * The informational SMS the resident gets when a case opens: what we noticed, in plain words,
 * plus a link they can use if — and only if — they want an inspection.
 */
export function customerNotice(c: CaseRecord, level: AddressLevel, l: Lang): CustomerNotice {
  const href = requestHref(c);
  const dev = Math.abs(c.dev);
  const gear = equipmentLabel(c, l);
  const text = l === 'tr'
    ? `SilentWatt: Sayacınız son ${c.days} gündür benzer hava koşullarında beklenenin %${dev} ${c.dev < 0 ? 'altında üretim' : 'üzerinde tüketim'} gösteriyor; ${gear} sisteminizde verim kaybı olabilir. Acil bir durum yok. Ücretsiz kontrol isterseniz:`
    : `SilentWatt: For ${c.days} days your meter has been ${dev}% ${c.dev < 0 ? 'below expected production' : 'above expected consumption'} in similar weather; your ${gear} may be losing efficiency. Nothing is urgent. For a free inspection:`;
  // The resident's page carries their full address and phone. Roles that see masked addresses
  // get neither the link nor the token it contains.
  const full = level === 'full';
  return { at: c.events[0].at, text, href: full ? href : null, linkText: `silentwatt.app${full ? href : `${REQUEST_PATH}/••••••`}` };
}

/** What staff see about the resident's request, with the address masked to their role. */
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

/** The public page behind the SMS link, or null when the token means nothing. */
export function requestPage(token: string, l: Lang): RequestPage | null {
  const c = getCase(caseByToken.get(token) ?? '');
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

/**
 * Saves a resident's inspection request. Every field arrives from the form, including the address —
 * the prefilled values are a convenience, not a constraint.
 */
export function submitRequest(token: string, input: RequestInput, l: Lang): SubmitResult {
  const c = getCase(caseByToken.get(token) ?? '');
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
  if (existing) Object.assign(existing, record);
  else requests.push(record);
  c.events.push({ type: 'requested', at: record.at });
  return { ok: true, receipt: toReceipt(record, l) };
}

export const getCase = (id: string) => cases.find((c) => c.id === id);
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
  const day = 14 + d; // day 1 = 15 Aug 2026
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
  const counts = { open: cases.filter(isOpen).length, closed: cases.filter((c) => !isOpen(c)).length, all: cases.length };
  const items = cases
    .filter((c) => (filter === 'all' ? true : filter === 'closed' ? !isOpen(c) : isOpen(c)))
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.priority - a.priority || Math.abs(b.dev) - Math.abs(a.dev))
    .map((c) => toSummary(c, u, l));
  return { items, counts };
}

/* ── case actions ──────────────────────────────────────── */

export function markOpened(c: CaseRecord, u: User) {
  if (c.techId === u.id && c.events.at(-1)?.type === 'assigned') c.events.push({ type: 'opened', at: now() });
}

export function reviewCase(c: CaseRecord) {
  c.status = 'review';
  c.events.push({ type: 'review', at: now() });
}

export function assignCase(c: CaseRecord, techId: string) {
  const tech = findUser(techId);
  if (!tech || !tech.active || !tech.screens.includes('jobs')) return false;
  const time = now();
  c.status = 'assigned';
  c.techId = tech.id;
  c.events.push({ type: 'assigned', at: time, techId: tech.id });
  messages.push({ id: `m-${messages.length + 1}`, techId: tech.id, caseId: c.id, at: time });
  return true;
}

export function dismissCase(c: CaseRecord) {
  c.status = 'dismissed';
  c.events.push({ type: 'dismissed', at: now() });
}

export function recordResult(c: CaseRecord, result: FieldResult, note: string) {
  c.status = result === 'dismissed' ? 'dismissed' : 'verified';
  c.events.push({ type: result, at: now(), note: note || undefined });
}

export const listTechnicians = (): Technician[] =>
  users.filter((u) => u.active && u.screens.includes('jobs')).map((u) => ({ id: u.id, name: u.name }));

/* ── screen data ───────────────────────────────────────── */

export function jobsFor(u: User, l: Lang): JobsData {
  const jobs = cases
    .filter((c) => c.techId === u.id && isOpen(c))
    .sort((a, b) => b.priority - a.priority)
    .map((c) => toSummary(c, u, l));
  const inbox = messages
    .filter((m) => m.techId === u.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)
    .map((m) => {
      const c = getCase(m.caseId)!;
      const path = `${SCREENS.jobs.path}/${c.id}`;
      const check = lower(FAULTS[c.hyp[0][0]].check[l], l);
      return {
        id: m.id, at: m.at,
        text: l === 'tr'
          ? `SilentWatt: ${c.id} size atandı. ${c.hood} ${c.street}. İlk kontrol: ${check}. Aç:`
          : `SilentWatt: ${c.id} assigned to you. ${c.hood} ${c.street}. Check first: ${check}. Open:`,
        href: path, linkText: `silentwatt.app${path}`, caseOpen: isOpen(c),
      };
    });
  return { jobs, messages: inbox };
}

const PRIORITY_WORD: Record<Lang, Record<Priority, string>> = {
  tr: { 3: 'yüksek', 2: 'orta', 1: 'düşük' },
  en: { 3: 'high', 2: 'medium', 1: 'low' },
};

export function notificationsFor(u: User, l: Lang): Notification[] {
  const tr = l === 'tr';
  const list: Notification[] = [];
  if (u.screens.includes('queue') && can(u, 'case.assign')) {
    for (const c of cases.filter((x) => x.status === 'new')) {
      const p = PRIORITY_WORD[l][c.priority];
      list.push({ id: `n-new-${c.id}`, text: tr ? `Yeni vaka ${c.id} · ${p} öncelik` : `New case ${c.id} · ${p} priority`, at: c.events[0].at, href: caseHref(u, c) });
    }
  }
  if (u.screens.includes('queue')) {
    for (const r of requests) {
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
    for (const c of cases.filter((x) => x.techId === u.id && x.status === 'assigned' && x.events.at(-1)?.type === 'assigned')) {
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
// family, confirmed, false alarms, detected loss kWh/month
const FAMILY_STATS: [FaultKey, number, number, number][] = [
  ['airflow', 26, 5, 2340], ['refrig', 14, 4, 1610], ['aux', 9, 3, 1480], ['defrost', 6, 3, 390], ['pv', 5, 2, 355], ['pvstring', 4, 1, 420],
];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function overview(l: Lang): OverviewData {
  const verified = sum(W_VERIFIED);
  const dismissed = sum(W_DISMISSED);
  const open = cases.filter(isOpen).length;
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
      name, meters, verified: v, dismissed: d, open: cases.filter((c) => c.district === name && isOpen(c)).length,
    })),
  };
}

export function team(u: User, l: Lang): TeamMember[] {
  return users
    .filter((t) => t.active && t.screens.includes('jobs'))
    .map((t) => {
      const mine = cases.filter((c) => c.techId === t.id);
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
  // Turkish spreadsheet apps expect ';' because ',' is the decimal separator.
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
  return {
    users: users.map((t) => toUserRow(t, me, l)),
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
  Object.assign(target, { role, screens, active });
  return { ok: true, user: toUserRow(target, me, l), deactivated };
}
