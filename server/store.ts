// In-memory store: users and case workflow live here, the cases themselves come from the evidence files.
// Swap for a database later; the API shape stays the same.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import type {
  ChangeKind, ChangeNotice, DetectorName, EvidenceCase, EvidenceFamily, EvidenceKind, EvidenceOrigin,
} from '../shared/evidence';
import type {
  AddressLevel, Capability, CaseDetail, CaseList, CaseStatus, CaseSummary, ChangeView, CustomerNotice, CustomerRequest,
  DataSourcesData, FieldResult, JobsData, Lang, Me, Notification, OverviewData, Priority,
  ReportData, ReportRow, RequestPage, RequestReceipt, RequestSlot, RoleKey, ScreenKey, TeamMember,
  Technician, UserRow, UsersData,
} from '../shared/types';
import { ROLES, SCREENS, SCREEN_ORDER, isRoleKey, isScreenKey, screenLinks, type Text } from './catalog';
import { config } from './config';
import { loadEvidence } from './evidence';
import { explainCase } from './explain';
import type { AssistantInput } from './explain/llm';
import { hashPassword } from './password';
import { createStateStore } from './persist';

export const ORGANIZATION: Text = { tr: 'Pilot Dağıtım A.Ş. (örnek)', en: 'Pilot Distribution Co. (example)' };
export const DEMO_PASSWORD = 'SilentWatt2026!';

const now = () => new Date().toISOString();
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

const demoUsers = (): User[] => [
  makeUser('u-selin', 'Selin Aydın', 'yonetim@silentwatt.demo', 'manager'),
  makeUser('u-kaan', 'Kaan Yıldız', 'operator@silentwatt.demo', 'operator'),
  makeUser('u-emre', 'Emre Kaya', 'emre@silentwatt.demo', 'technician'),
  makeUser('u-deniz', 'Deniz Tunç', 'deniz@silentwatt.demo', 'technician'),
  makeUser('u-ece', 'Ece Arslan', 'admin@silentwatt.demo', 'admin'),
];

/** Accounts from SILENTWATT_USERS_FILE: [{id, name, email, role, salt, hash}], hashes from scripts/hash-password.ts. */
function fileUsers(file: string): User[] {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>[];
  if (!Array.isArray(rows)) throw new Error(`${file} must hold a JSON array of users`);
  return rows.map((row, i) => {
    const field = (key: string) => {
      const value = row[key];
      if (typeof value !== 'string' || value === '') throw new Error(`${file}: user ${i + 1} has no "${key}"`);
      return value;
    };
    const role = field('role');
    if (!isRoleKey(role)) throw new Error(`${file}: user ${i + 1} has an unknown role "${role}"`);
    const name = field('name');
    const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
    return {
      id: field('id'), name, initials, email: field('email').trim().toLowerCase(), role,
      screens: [...ROLES[role].screens], active: row.active !== false, salt: field('salt'), hash: field('hash'),
    };
  });
}

function loadUsers(): User[] {
  const list = [...(config.demoAccounts ? demoUsers() : []), ...(config.usersFile ? fileUsers(config.usersFile) : [])];
  if (list.length === 0) {
    throw new Error('No accounts: set SILENTWATT_USERS_FILE, or SILENTWATT_DEMO_ACCOUNTS=on for a demo (the demo password is public).');
  }
  const emails = new Set<string>();
  for (const u of list) {
    if (emails.has(u.email)) throw new Error(`Two accounts share the e-mail ${u.email}`);
    emails.add(u.email);
  }
  return list;
}

export const users: User[] = loadUsers();

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
    fixture: evidence.index.fixture,
  };
}

/* ── evidence ──────────────────────────────────────────── */

const evidence = loadEvidence(config.evidenceDir);
const run = evidence.index.run;

/** Which evidence run is being served; for health checks and request logs. */
export const evidenceInfo = () => ({ run_id: run.run_id, fixture: evidence.index.fixture, cases: evidence.index.cases.length });

const FAMILY_LABEL: Record<EvidenceFamily, Text> = {
  hvac: { tr: 'Klima', en: 'Air conditioning' },
  refrigeration: { tr: 'Buzdolabı', en: 'Refrigerator' },
  solar: { tr: 'Güneş paneli', en: 'Solar panels' },
};
const FAMILY_ORDER: EvidenceFamily[] = ['hvac', 'refrigeration', 'solar'];
const KIND_LABEL: Record<EvidenceKind, Text> = {
  consumption_deviation: { tr: 'tüketim sapması', en: 'consumption deviation' },
  production_shortfall: { tr: 'üretim açığı', en: 'production shortfall' },
  data_issue: { tr: 'veri sorunu', en: 'data issue' },
};
const caseTitle = (e: EvidenceCase, l: Lang) =>
  `${FAMILY_LABEL[e.family][l]}${e.family === 'hvac' ? ' (air1)' : ''}: ${KIND_LABEL[e.kind][l]}`;
// Synthetic cases are how the method is validated: scenarios with a known answer.
const ORIGIN_LABEL: Record<EvidenceOrigin, Text> = {
  observed: { tr: 'Gözlenen', en: 'Observed' },
  synthetic: { tr: 'Doğrulama senaryosu', en: 'Validation scenario' },
};
const EXPECTED_FROM: Record<string, Text> = {
  'outdoor_temperature,hour': { tr: 'Dış sıcaklık ve saat', en: 'Outdoor temperature and hour' },
  'own_june_profile,hour_of_week': { tr: 'Haziran’daki kendi haftalık profili', en: 'Its own weekly profile in June' },
  'clear_sky_irradiance,capacity': { tr: 'Açık gök ışınımı ve panel kapasitesi', en: 'Clear-sky irradiance and panel capacity' },
  'outdoor_temperature,hour,june_level,peers': {
    tr: 'Dış sıcaklık ve saat; cihazın Haziran düzeyi ve komşu hanelerin aynı günkü ortak değişimi',
    en: 'Outdoor temperature and hour; the device’s June level and the same day’s common shift of neighbouring households',
  },
  'neighbour_systems,capacity,june_level': {
    tr: 'Panel kapasitesi ve aynı anda komşu sistemlerin üretimi; sistemin Haziran düzeyi',
    en: 'Panel capacity and neighbouring systems at the same time; the system’s June level',
  },
};
const expectedFromLabel = (code: string, l: Lang) => EXPECTED_FROM[code]?.[l] ?? code;
const familyRun = (family: EvidenceFamily) => run.families.find((f) => f.family === family)!;

const CHANGE_LABEL: Record<ChangeKind, Text> = {
  new_device: { tr: 'Yeni cihaz takıldı', en: 'A new device was installed' },
  repair: { tr: 'Onarım veya bakım yapıldı', en: 'It was repaired or serviced' },
  usage_change: { tr: 'Kullanım değişti (misafir, tatil, yeni alışkanlık)', en: 'Usage changed (guests, holiday, a new habit)' },
  other: { tr: 'Başka bir değişiklik', en: 'Another change' },
};
const CHANGE_KINDS = Object.keys(CHANGE_LABEL) as ChangeKind[];
export const isChangeKind = (v: unknown): v is ChangeKind => typeof v === 'string' && CHANGE_KINDS.includes(v as ChangeKind);
const changeOptions = (l: Lang) => CHANGE_KINDS.map((value) => ({ value, label: CHANGE_LABEL[value][l] }));
const DETECTOR_LABEL: Record<DetectorName, Text> = {
  acute: { tr: 'Akut kural', en: 'Acute rule' },
  chronic: { tr: 'Kronik kural', en: 'Chronic rule' },
  data_quality: { tr: 'Veri kalitesi kuralı', en: 'Data-quality rule' },
};
const NOT_SCORED: Record<string, Text> = {
  temperature_out_of_support: { tr: 'Sıcaklık eğitim aralığının dışında', en: 'Temperature outside the training range' },
  insufficient_daily_coverage: { tr: 'Günlük ölçüm kapsaması yetersiz', en: 'Not enough valid readings that day' },
  frozen_suspected: { tr: 'Donma şüphesi (yinelenen değer)', en: 'Suspected frozen readings' },
};
const SCENARIO_LABEL: Record<string, Text> = {
  step_increase: { tr: 'Basamak artış', en: 'Step increase' },
  ramp_increase: { tr: 'Kademeli artış', en: 'Ramp increase' },
  outage: { tr: 'Veri kesintisi', en: 'Data outage' },
  freeze: { tr: 'Donmuş ölçüm', en: 'Frozen readings' },
  spike: { tr: 'Ani sıçrama', en: 'Spike' },
  production_drop: { tr: 'Üretim düşüşü', en: 'Production drop' },
};

const scenarioLabel = (scenario: string, faultKind: string | null, l: Lang) => SCENARIO_LABEL[faultKind ?? scenario]?.[l] ?? scenario;
/** A production drop lowers the readings: its severity reads as a negative share. */
const signedSeverity = (scenario: string, severity: number | null) =>
  severity === null ? null : scenario === 'production_drop' ? -severity : severity;

/**
 * Where the thresholds come from, in the reader's language. A detector run writes e.g.
 * "june-calibrated: … acute z>1.5, share>0.1, 2 days; chronic k 1.0, h 5.0"; other texts pass through.
 */
function provenanceLabel(text: string | null | undefined, l: Lang): string {
  if (!text) return '—';
  if (!text.startsWith('june-calibrated')) return text;
  const tr = l === 'tr';
  const acute = text.match(/acute z>([\d.]+), share>([\d.]+), (\d+) days/);
  const chronic = text.match(/chronic k ([\d.]+), h ([\d.]+)/);
  const notMet = text.includes('budget not met');
  if (!acute || !chronic) return tr ? 'Haziran’da alarm bütçesine göre seçildi' : 'Chosen on June within the alarm budget';
  const share = (v: string) => (tr ? `%${Math.round(Number(v) * 100)}` : `${Math.round(Number(v) * 100)}%`);
  return tr
    ? `Haziran’da alarm bütçesine (aile başına ayda en çok 1 akut, 1 kronik vaka) uyan en hassas değerler: akut z > ${acute[1].replace('.', ',')}, aşım payı > ${share(acute[2])}, ${acute[3]} gün; kronik k ${chronic[1].replace('.', ',')}, h ${chronic[2].replace('.', ',')}${notMet ? ' · bütçe Haziran’da sağlanamadı' : ''}`
    : `The most sensitive values inside the June alarm budget (at most 1 acute and 1 chronic case per family-month): acute z > ${acute[1]}, exceedance share > ${share(acute[2])}, ${acute[3]} days; chronic k ${chronic[1]}, h ${chronic[2]}${notMet ? ' · budget not met in June' : ''}`;
}
const householdLabel = (id: number, l: Lang) => `${l === 'tr' ? 'Hane' : 'Household'} ${id}`;

function notScoredLabel(scored: boolean, reason: string | null, l: Lang): string | null {
  if (scored) return null;
  if (!reason) return l === 'tr' ? 'Değerlendirilemedi' : 'Could not be scored';
  return reason.split('|').map((code) => NOT_SCORED[code]?.[l] ?? code).join(' · ');
}

const fmt = (n: number, digits: number, l: Lang) => new Intl.NumberFormat(locale(l), { maximumFractionDigits: digits }).format(n);
const pct = (share: number, l: Lang) => (l === 'tr' ? `%${fmt(share * 100, 0, l)}` : `${fmt(share * 100, 0, l)}%`);
const dayText = (iso: string, l: Lang) =>
  new Intl.DateTimeFormat(locale(l), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
/** The replay window's end is exclusive in the contract; screens show the last day itself. */
const windowEnd = new Date(Date.parse(`${run.replay_window.end_local_date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const windowText = (l: Lang) => `${dayText(run.replay_window.start_local_date, l)} – ${dayText(windowEnd, l)}`;

/* ── cases ─────────────────────────────────────────────── */

type EventType = 'created' | 'review' | 'assigned' | 'opened' | 'requested' | 'verified' | 'other' | 'dismissed' | 'explained';

interface CaseEventRecord {
  type: EventType;
  at: string;
  techId?: string;
  note?: string;
}

interface CustomerRecord {
  name: string;
  phone: string;
  email: string;
}

interface Site {
  district: string;
  hood: string;
  street: string;
  customer: CustomerRecord;
}

/**
 * The dataset has no addresses and no subscriber identities. These example records stand in for
 * them so that assignment, address masking and the resident SMS can be shown; screens label them.
 */
const EXAMPLE_SITES: Site[] = [
  { district: 'Bornova', hood: 'Kazımdirik Mah.', street: '372/4 Sk. No:9', customer: { name: 'Ayşe Demir', phone: '0532 118 44 07', email: 'ayse.demir@ornek.com' } },
  { district: 'Karşıyaka', hood: 'Bostanlı Mah.', street: '1814 Sk. No:22', customer: { name: 'Mert Özkan', phone: '0505 447 20 91', email: 'mert.ozkan@ornek.com' } },
  { district: 'Buca', hood: 'Şirinyer Mah.', street: 'Menderes Cd. No:118', customer: { name: 'Hacer Yalçın', phone: '0543 260 71 88', email: 'hacer.yalcin@ornek.com' } },
  { district: 'Çiğli', hood: 'Ataşehir Mah.', street: '8028 Sk. No:3', customer: { name: 'Burak Şen', phone: '0538 905 13 62', email: 'burak.sen@ornek.com' } },
  { district: 'Bornova', hood: 'Evka-3 Mah.', street: '124 Sk. No:41', customer: { name: 'Nalan Kurt', phone: '0554 371 08 25', email: '' } },
  { district: 'Karşıyaka', hood: 'Mavişehir Mah.', street: '2040/1 Sk. No:7', customer: { name: 'Serkan Aksoy', phone: '0531 642 99 10', email: 'serkan.aksoy@ornek.com' } },
  { district: 'Buca', hood: 'Kaynaklar Mah.', street: 'Kaynaklar Cd. No:62', customer: { name: 'Fatma Uysal', phone: '0536 208 55 41', email: '' } },
  { district: 'Bornova', hood: 'Erzene Mah.', street: '96 Sk. No:12', customer: { name: 'İlker Bayrak', phone: '0542 713 66 09', email: 'ilker.bayrak@ornek.com' } },
  { district: 'Çiğli', hood: 'Egekent Mah.', street: '8660 Sk. No:5', customer: { name: 'Zeynep Çelik', phone: '0533 884 17 50', email: 'zeynep.celik@ornek.com' } },
];

export interface CaseRecord {
  id: string;
  evidence: EvidenceCase;
  site: Site;
  status: CaseStatus;
  techId: string | null;
  events: CaseEventRecord[];
}

// One example site per household, so two cases of a household share an address.
const householdIds = [...new Set(evidence.index.cases.map((c) => c.household_id))].sort((a, b) => a - b);
const siteOf = (householdId: number) => EXAMPLE_SITES[householdIds.indexOf(householdId) % EXAMPLE_SITES.length];

/** Every case starts as the detector left it; status, assignment and history are the console's own. */
export const cases: CaseRecord[] = evidence.index.cases.map((summary) => ({
  id: summary.case_id,
  evidence: evidence.cases.get(summary.case_id)!,
  site: siteOf(summary.household_id),
  status: 'new',
  techId: null,
  events: [{ type: 'created', at: evidence.index.generated_at_utc }],
}));

export const getCase = (id: string) => cases.find((c) => c.id === id);
export const isOpen = (c: CaseRecord) => c.status === 'new' || c.status === 'review' || c.status === 'assigned';
/** Synthetic cases are experiments: shown and labelled, never assigned, closed or counted as real. */
export const isSynthetic = (c: CaseRecord) => c.evidence.origin === 'synthetic';
const observedCases = () => cases.filter((c) => !isSynthetic(c));
// The contract ranks 1 = first; the console's glyph is tallest at 3.
const priorityOf = (c: CaseRecord) => (4 - c.evidence.priority) as Priority;
/** A resident hears about a measured deviation on their own device, never about a data issue. */
const hasNotice = (c: CaseRecord) => !isSynthetic(c) && c.evidence.kind !== 'data_issue';

interface MessageRecord {
  id: string;
  techId: string;
  caseId: string;
  at: string;
}

const messages: MessageRecord[] = [];

/* ── residents: notice SMS and service requests ────────── */

/** One unguessable link per case. The resident never signs in; the token is the whole key. */
const tokenByCase = new Map<string, string>();
const caseByToken = new Map<string, string>();

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
  change: ChangeKind | null;
}

const requests: RequestRecord[] = [];
const requestFor = (caseId: string) => requests.find((r) => r.caseId === caseId);

/** Reported changes; exported to ML (GET /api/v1/changes) so the next run re-learns the reference. */
const changes: ChangeNotice[] = [];
const changesFor = (c: CaseRecord) => changes.filter((n) =>
  n.household_id === c.evidence.household_id && (n.family === null || n.family === c.evidence.family));
export const listChanges = (): ChangeNotice[] => [...changes].sort((a, b) => a.recorded_at_utc.localeCompare(b.recorded_at_utc));

function recordChange(c: CaseRecord, kind: ChangeKind, localDate: string, source: ChangeNotice['source'], note: string | null) {
  // One notice per case and source: a resident correcting the form replaces their earlier answer.
  const previous = changes.findIndex((n) => n.case_id === c.id && n.source === source);
  const notice: ChangeNotice = {
    id: `chg-${c.evidence.household_id}-${c.evidence.circuit}-${localDate}-${source}`,
    household_id: c.evidence.household_id, family: c.evidence.family, circuit: c.evidence.circuit,
    kind, local_date: localDate, source, case_id: c.id, note, recorded_at_utc: now(),
  };
  if (previous >= 0) changes[previous] = notice;
  else changes.push(notice);
}

/* ── saved state ───────────────────────────────────────── */

/** What people did on top of the evidence. The evidence itself is never copied here. */
interface ConsoleState {
  cases: { id: string; status: CaseStatus; techId: string | null; events: CaseEventRecord[] }[];
  messages: MessageRecord[];
  requests: RequestRecord[];
  tokens: [caseId: string, token: string][];
  users: { id: string; role: RoleKey; screens: ScreenKey[]; active: boolean }[];
  changes?: ChangeNotice[];
}

function snapshot(): ConsoleState {
  return {
    cases: cases.map(({ id, status, techId, events }) => ({ id, status, techId, events })),
    messages, requests, changes,
    tokens: [...tokenByCase],
    users: users.map(({ id, role, screens, active }) => ({ id, role, screens, active })),
  };
}

export const stateStore = createStateStore<ConsoleState>(config);

/** Saves after every change. Writes are queued; the latest state always wins. */
const save = () => stateStore.save(snapshot());

/**
 * Restores what matches the current evidence and accounts. A case that is no longer in the evidence,
 * or a user that no longer exists, is dropped instead of guessed.
 */
async function restore() {
  const saved = await stateStore.load();
  if (saved) {
    for (const s of saved.cases) {
      const c = getCase(s.id);
      if (c && !isSynthetic(c)) Object.assign(c, { status: s.status, techId: s.techId && findUser(s.techId) ? s.techId : null, events: s.events });
    }
    messages.push(...saved.messages.filter((m) => getCase(m.caseId) && findUser(m.techId)));
    requests.push(...saved.requests.filter((r) => getCase(r.caseId)).map((r) => ({ ...r, change: r.change ?? null })));
    changes.push(...(saved.changes ?? []).filter((n) => householdIds.includes(n.household_id)));
    for (const [caseId, token] of saved.tokens) {
      const c = getCase(caseId);
      if (c && hasNotice(c)) {
        tokenByCase.set(caseId, token);
        caseByToken.set(token, caseId);
      }
    }
    for (const s of saved.users) {
      const u = findUser(s.id);
      if (u && isRoleKey(s.role) && s.screens.every(isScreenKey)) Object.assign(u, { role: s.role, screens: s.screens, active: s.active });
    }
  }
  // One unguessable link per case that may notify a resident.
  for (const c of cases.filter(hasNotice)) {
    if (tokenByCase.has(c.id)) continue;
    const token = randomBytes(12).toString('base64url');
    tokenByCase.set(c.id, token);
    caseByToken.set(token, c.id);
  }
  save();
}

await restore();

const SLOT_LABELS: Record<Lang, Record<RequestSlot, string>> = {
  tr: { morning: 'Sabah · 09:00–12:00', afternoon: 'Öğleden sonra · 12:00–17:00', evening: 'Akşam · 17:00–20:00', any: 'Farketmez' },
  en: { morning: 'Morning · 09:00–12:00', afternoon: 'Afternoon · 12:00–17:00', evening: 'Evening · 17:00–20:00', any: 'Any time' },
};
const SLOTS = Object.keys(SLOT_LABELS.tr) as RequestSlot[];
const isSlot = (v: unknown): v is RequestSlot => typeof v === 'string' && SLOTS.includes(v as RequestSlot);

const fullAddress = (c: CaseRecord) => `${c.site.hood} ${c.site.street}, ${c.site.district}`;
/** The resident's device, as they would name it. */
const DEVICE: Record<EvidenceFamily, { label: Text; on: Text }> = {
  hvac: { label: { tr: 'Klima devresi (air1)', en: 'Air-conditioning circuit (air1)' }, on: { tr: 'Klima devrenizde', en: 'On your air-conditioning circuit' } },
  refrigeration: { label: { tr: 'Buzdolabı', en: 'Refrigerator' }, on: { tr: 'Buzdolabınızda', en: 'On your refrigerator' } },
  solar: { label: { tr: 'Güneş paneli', en: 'Solar panels' }, on: { tr: 'Güneş panelinizde', en: 'On your solar panels' } },
};

/** What was measured, in the words a resident reads. No unit, no energy, no diagnosis. */
function measuredText(c: CaseRecord, l: Lang) {
  const { flagged_days: days, excess_share: share, kind, family } = c.evidence;
  const tr = l === 'tr';
  const when = family === 'hvac' ? (tr ? ' benzer hava koşullarındaki' : ' for similar weather') : '';
  if (share === null) {
    return tr ? `${days} gün boyunca${when} model referansından farklı bir değer ölçtük` : `for ${days} days we measured values that differ from the model reference${when}`;
  }
  if (kind === 'production_shortfall') {
    return tr ? `${days} gün boyunca model referansının ${pct(Math.abs(share), l)} altında üretim ölçtük` : `for ${days} days we measured production ${pct(Math.abs(share), l)} below the model reference`;
  }
  return tr
    ? `${days} gün boyunca${when} model referansının ${pct(share, l)} üzerinde tüketim ölçtük`
    : `for ${days} days we measured consumption ${pct(share, l)} above the model reference${when}`;
}

/**
 * The informational SMS the resident gets when a case opens: what we measured, in plain words,
 * plus a link they can use if — and only if — they want an inspection.
 */
export function customerNotice(c: CaseRecord, level: AddressLevel, l: Lang): CustomerNotice {
  const href = requestHref(c);
  const text = l === 'tr'
    ? `SilentWatt: ${DEVICE[c.evidence.family].on.tr} ${measuredText(c, l)}. Bu bir arıza bildirimi değildir; acil bir durum yok. Yakın zamanda bir değişiklik olduysa veya ücretsiz kontrol isterseniz:`
    : `SilentWatt: ${DEVICE[c.evidence.family].on.en}, ${measuredText(c, l)}. This is not a fault report; nothing is urgent. If something changed recently, or for a free inspection:`;
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
    changeLabel: r.change ? CHANGE_LABEL[r.change][l] : null,
  };
}

const toReceipt = (r: RequestRecord, l: Lang): RequestReceipt => ({
  reference: r.reference, at: r.at, name: r.name, phone: r.phone, address: r.address,
  slotLabel: SLOT_LABELS[l][r.slot], note: r.note || null,
  changeLabel: r.change ? CHANGE_LABEL[r.change][l] : null,
});

/** The public page behind the SMS link, or null when the token means nothing. */
export function requestPage(token: string, l: Lang): RequestPage | null {
  const c = getCase(caseByToken.get(token) ?? '');
  if (!c) return null;
  const tr = l === 'tr';
  const existing = requestFor(c.id);
  const measured = measuredText(c, l);
  return {
    caseId: c.id,
    noticeAt: c.events[0].at,
    headline: c.evidence.kind === 'production_shortfall'
      ? (tr ? `${DEVICE[c.evidence.family].on.tr} beklenenden düşük bir üretim görüyoruz` : `We see lower production than expected ${DEVICE[c.evidence.family].on.en.toLowerCase()}`)
      : (tr ? `${DEVICE[c.evidence.family].on.tr} beklenenden farklı bir tüketim görüyoruz` : `We see unexpected consumption ${DEVICE[c.evidence.family].on.en.toLowerCase()}`),
    body: tr
      ? `${DEVICE[c.evidence.family].on.tr} ${measured}. Acil bir durum yok; bu yalnızca bir inceleme önerisidir ve karar sizindir.`
      : `${DEVICE[c.evidence.family].on.en}, ${measured}. Nothing is urgent; this is only a suggestion to have it looked at, and the decision is yours.`,
    points: tr
      ? ['Bu bir arıza ihbarı değil, ölçüm verisine dayanan bir ön tespit.', 'Yakın zamanda yeni bir cihaz taktırdıysanız veya kullanımınız değiştiyse aşağıda belirtin; fark bundan kaynaklanıyorsa sistem kendini buna göre ayarlar.', 'Kontrol ücretsizdir ve size uygun bir saatte yapılır; talep oluşturmak zorunda değilsiniz.']
      : ['This is not a fault report; it is an early finding from measurement data.', 'If you recently had a new device installed or your usage changed, tell us below; if that explains the gap, the system adjusts to it.', 'The inspection is free and happens at a time that suits you; you do not have to ask for one.'],
    equipmentLabel: DEVICE[c.evidence.family].label[l],
    excessShare: c.evidence.excess_share,
    days: c.evidence.flagged_days,
    closed: !isOpen(c),
    customer: { ...c.site.customer, address: fullAddress(c) },
    slots: SLOTS.map((value) => ({ value, label: SLOT_LABELS[l][value] })),
    changeOptions: changeOptions(l),
    changeQuestion: tr ? 'Son zamanlarda bu cihazla ilgili bir değişiklik oldu mu? (isteğe bağlı)' : 'Did anything change with this device recently? (optional)',
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
  if (input.change !== undefined && input.change !== null && input.change !== '' && !isChangeKind(input.change)) {
    return { ok: false, error: 'invalid_change' };
  }
  const change = isChangeKind(input.change) ? input.change : null;

  const existing = requestFor(c.id);
  const record: RequestRecord = {
    caseId: c.id,
    reference: existing?.reference ?? `TL-${c.evidence.household_id}-${c.evidence.onset_local_date.slice(5).replace('-', '')}`,
    at: now(), name, phone, email, address,
    addressEdited: address !== fullAddress(c),
    slot: input.slot, note, change,
  };
  if (existing) Object.assign(existing, record);
  else requests.push(record);
  // The resident cannot date the change against the replay; it is taken to hold from the onset.
  if (change) recordChange(c, change, c.evidence.onset_local_date, 'resident', note || null);
  c.events.push({ type: 'requested', at: record.at, note: change ? CHANGE_LABEL[change].tr : undefined });
  save();
  return { ok: true, receipt: toReceipt(record, l) };
}

export function canViewCase(u: User, c: CaseRecord) {
  return u.screens.includes('queue') || (u.screens.includes('jobs') && c.techId === u.id);
}

function caseHref(u: User, c: CaseRecord): string | null {
  if (u.screens.includes('queue')) return `${SCREENS.queue.path}/${c.id}`;
  if (u.screens.includes('jobs') && c.techId === u.id) return `${SCREENS.jobs.path}/${c.id}`;
  return null;
}

function address(c: CaseRecord, level: AddressLevel) {
  if (level === 'full') return fullAddress(c);
  if (level === 'neighbourhood') return `${c.site.hood}, ${c.site.district}`;
  return c.site.district;
}

const nameOf = (id: string | null | undefined, l: Lang) => (id ? findUser(id)?.name ?? (l === 'tr' ? 'Bilinmeyen' : 'Unknown') : null);
const explainOf = (e: EvidenceCase, l: Lang) => explainCase(e, l, familyRun(e.family).expected_from);
const firstCheck = (c: CaseRecord, l: Lang) => explainOf(c.evidence, l).recommendation.firstCheck;

export function toSummary(c: CaseRecord, u: User, l: Lang): CaseSummary {
  const e = c.evidence;
  const dates = e.daily.map((d) => d.local_date);
  return {
    id: c.id, status: c.status, priority: priorityOf(c), origin: e.origin,
    family: e.family, familyLabel: FAMILY_LABEL[e.family][l], kind: e.kind,
    title: caseTitle(e, l),
    detectorLabel: e.detectors.map((d) => DETECTOR_LABEL[d][l]).join(' + '),
    household: householdLabel(e.household_id, l),
    location: address(c, addressLevel(u)),
    excessShare: e.excess_share,
    flaggedDays: e.flagged_days,
    onsetDate: e.onset_local_date,
    lastDate: e.last_local_date,
    spark: {
      observed: e.daily.map((d) => d.observed_unit_hours),
      reference: e.daily.map((d) => d.reference_unit_hours),
      from: dates.indexOf(e.onset_local_date),
      to: dates.indexOf(e.last_local_date),
    },
    technicianName: nameOf(c.techId, l),
    firstCheck: firstCheck(c, l),
    customerRequest: Boolean(requestFor(c.id)),
    changeReported: changesFor(c).length > 0,
    href: caseHref(u, c),
  };
}

function eventLabel(e: CaseEventRecord, l: Lang) {
  const tr = l === 'tr';
  switch (e.type) {
    case 'created': return tr ? 'Dedektör vakayı üretti' : 'The detector raised the case';
    case 'review': return tr ? 'Operatör incelemeye aldı' : 'Operator moved it to review';
    case 'assigned': return tr ? `${nameOf(e.techId, l)} kişisine SMS gönderildi` : `SMS sent to ${nameOf(e.techId, l)}`;
    case 'opened': return tr ? 'Teknisyen linki açtı' : 'Technician opened the link';
    case 'requested': return tr ? 'Müşteri SMS linkinden kontrol talebi oluşturdu' : 'The resident asked for an inspection from the SMS link';
    case 'verified': return tr ? 'Saha sonucu: öneriyle uyumlu bir neden bulundu' : 'Field result: a cause in line with the recommendation was found';
    case 'other': return tr ? 'Saha sonucu: farklı bir neden bulundu' : 'Field result: a different cause was found';
    case 'dismissed': return tr ? 'Kapatıldı: bulgu yok' : 'Closed: nothing found';
    case 'explained': return tr ? 'Bildirilen değişiklikle açıklandı; referans yeniden öğrenilecek' : 'Explained by a reported change; the reference will be re-learned';
  }
}

export function toDetail(c: CaseRecord, u: User, l: Lang): CaseDetail {
  const e = c.evidence;
  const level = addressLevel(u);
  const actionable = !isSynthetic(c);
  const triage = c.status === 'new' || c.status === 'review';
  const { summary, reasons, recommendation, limitations, humanDecisionNote } = explainOf(e, l);
  return {
    ...toSummary(c, u, l),
    masked: level !== 'full',
    detectedDate: e.detected_local_date,
    upperExceedanceShare: e.upper_exceedance_share,
    lowerShortfallShare: e.lower_shortfall_share ?? null,
    synthetic: e.synthetic && {
      scenarioLabel: scenarioLabel(e.synthetic.scenario, e.synthetic.fault_kind, l),
      severity: signedSeverity(e.synthetic.scenario, e.synthetic.severity), durationDays: e.synthetic.duration_days, startDate: e.synthetic.start_local_date,
    },
    daily: e.daily.map((d) => ({ ...d, notScoredLabel: notScoredLabel(d.scored, d.not_scored_reason, l) })),
    series: e.series,
    explanation: { summary, reasons, recommendation, limitations, humanDecisionNote },
    run: {
      model: run.model, protocol: run.protocol_version, circuit: e.circuit,
      thresholdProvenance: provenanceLabel(familyRun(e.family).threshold_provenance ?? run.detector.threshold_provenance, l),
      expectedFrom: expectedFromLabel(familyRun(e.family).expected_from, l),
    },
    changes: changesFor(c).map((n): ChangeView => ({
      kind: n.kind, kindLabel: CHANGE_LABEL[n.kind][l], localDate: n.local_date,
      sourceLabel: n.source === 'resident' ? (l === 'tr' ? 'Müşteri bildirdi' : 'Reported by the resident') : (l === 'tr' ? 'Operatör kaydetti' : 'Recorded by an operator'),
      note: n.note, at: n.recorded_at_utc,
    })),
    events: c.events.map((ev) => ({ label: eventLabel(ev, l), at: ev.at, note: ev.note ?? null })),
    notice: hasNotice(c) && (can(u, 'case.assign') || c.techId === u.id) ? customerNotice(c, level, l) : null,
    request: (() => {
      const r = requestFor(c.id);
      return r ? toCustomerRequest(r, level, l) : null;
    })(),
    actions: {
      review: actionable && can(u, 'case.assign') && c.status === 'new',
      assign: actionable && can(u, 'case.assign') && triage,
      dismiss: actionable && can(u, 'case.dismiss') && triage,
      result: actionable && can(u, 'case.result') && c.status === 'assigned' && c.techId === u.id,
      explain: actionable && can(u, 'case.assign') && isOpen(c),
    },
    changeOptions: changeOptions(l),
  };
}

const STATUS_FACT: Record<CaseStatus, Text> = {
  new: { tr: 'yeni, henüz incelenmedi', en: 'new, not reviewed yet' },
  review: { tr: 'operatör incelemesinde', en: 'under operator review' },
  assigned: { tr: 'teknisyene atandı', en: 'assigned to a technician' },
  verified: { tr: 'sahada doğrulandı', en: 'verified on site' },
  dismissed: { tr: 'bulgu yok diye kapatıldı', en: 'closed with no finding' },
  explained: { tr: 'bildirilen bir değişiklikle açıklandı', en: 'explained by a reported change' },
};

/**
 * What the case assistant may read: the sentences the console already shows, nothing more. No address,
 * name or phone ever goes to a model, and no raw series; free-text notes are left out because their
 * numbers would not be in the evidence.
 */
export function assistantInput(c: CaseRecord, l: Lang, question: string | null): AssistantInput {
  const e = c.evidence;
  const x = explainOf(e, l);
  const tr = l === 'tr';
  const facts = [
    `${tr ? 'Vaka' : 'Case'}: ${caseTitle(e, l)} · ${ORIGIN_LABEL[e.origin][l]} · ${tr ? 'durum' : 'status'}: ${isSynthetic(c) ? (tr ? 'yalnız okunur doğrulama senaryosu' : 'read-only validation scenario') : STATUS_FACT[c.status][l]}`,
    priorityFact(c, l),
    x.summary,
    ...x.reasons,
    `${tr ? 'İlk kontrol' : 'First check'}: ${x.recommendation.firstCheck}. ${x.recommendation.steps.join(' ')}`,
    ...x.limitations,
    ...(changesFor(c).length
      ? changesFor(c).map((n) => `${tr ? 'Bildirilen değişiklik' : 'Reported change'}: ${CHANGE_LABEL[n.kind][l]} (${n.source === 'resident' ? (tr ? 'müşteri bildirdi' : 'reported by the resident') : (tr ? 'operatör kaydetti' : 'recorded by an operator')})`)
      : [tr ? 'Bildirilen değişiklik: yok. Müşteri veya operatör yeni cihaz, onarım ya da kullanım değişikliği bildirirse operatör vakayı "bildirilen değişiklikle açıklandı" diye kapatabilir ve dedektör referansı yeniden öğrenir.'
        : 'Reported change: none. If the resident or an operator reports a new device, a repair or a change in use, the operator can close the case as "explained by a reported change" and the detector re-learns the reference.']),
    x.humanDecisionNote,
  ];
  return { caseId: c.id, evidence: e, facts, templateSummary: x.summary, question, lang: l, assigned: c.status === 'assigned' || c.status === 'verified' };
}

/**
 * The priority comes from the detector, not from the model: deviations are ranked by how far and how
 * long they stray from the reference, and the ranking is cut in thirds. The assistant may explain it,
 * never change it. Written without digits so every number the model repeats is still from the evidence.
 */
function priorityFact(c: CaseRecord, l: Lang): string {
  const tr = l === 'tr';
  const word = PRIORITY_WORD[l][priorityOf(c)];
  if (c.evidence.kind === 'data_issue') {
    return tr
      ? `Öncelik: ${word}. Dedektör bunu verir: veri sorunları her zaman düşük önceliklidir, çünkü cihaz sinyali değildir ve tüketim sapmalarından sonra sıralanır.`
      : `Priority: ${word}. Set by the detector: data issues are always low priority, because they are not a device signal and rank after every consumption deviation.`;
  }
  const third = tr
    ? { 3: 'en büyük', 2: 'ortadaki', 1: 'en küçük' }[priorityOf(c)]
    : { 3: 'largest', 2: 'middle', 1: 'smallest' }[priorityOf(c)];
  // The first sentence is the answer to "why this priority?"; the rest is the rule behind it.
  return tr
    ? `Öncelik: ${word}. Bu vaka ${word} önceliklidir, çünkü dedektörün bu koşudaki sapma sıralamasında ${third} üçte birdedir; önceliği dil modeli değil dedektör verir. Kural: tüketim sapmaları model referansından sapmanın büyüklüğüne (sapma × süre) ve işaretli gün sayısına göre sıralanır; ilk üçte bir yüksek, ortadaki üçte bir orta, son üçte bir düşük öncelik alır.`
    : `Priority: ${word}. This case is ${word} priority because it sits in the ${third} third of the detector's ranking of this run's deviations; the detector sets it, not the language model. Rule: deviations are ranked by their size against the model reference (deviation × duration) and by flagged days; the top third is high, the middle third medium, the bottom third low.`;
}

/** Summaries for the assistant to write ahead of time: open observed cases first. */
export const assistantWarmList = (l: Lang) =>
  [...cases].sort((a, b) => Number(isSynthetic(a)) - Number(isSynthetic(b)) || a.evidence.rank - b.evidence.rank)
    .map((c) => assistantInput(c, l, null));

export function listCases(u: User, filter: string, family: string, l: Lang): CaseList {
  const observed = observedCases();
  const counts = {
    open: observed.filter(isOpen).length, closed: observed.filter((c) => !isOpen(c)).length,
    synthetic: cases.length - observed.length, all: cases.length,
  };
  const wanted = (c: CaseRecord) =>
    filter === 'all' ? true : filter === 'synthetic' ? isSynthetic(c) : !isSynthetic(c) && (filter === 'closed' ? !isOpen(c) : isOpen(c));
  const byStatus = cases.filter(wanted);
  const families = FAMILY_ORDER
    .filter((key) => run.families.some((f) => f.family === key))
    .map((key) => ({ key, label: FAMILY_LABEL[key][l], count: byStatus.filter((c) => c.evidence.family === key).length }));
  const items = byStatus
    .filter((c) => !family || c.evidence.family === family)
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || a.evidence.rank - b.evidence.rank)
    .map((c) => toSummary(c, u, l));
  return { items, counts, families };
}

/* ── case actions ──────────────────────────────────────── */

export function markOpened(c: CaseRecord, u: User) {
  if (c.techId !== u.id || c.events.at(-1)?.type !== 'assigned') return;
  c.events.push({ type: 'opened', at: now() });
  save();
}

export function reviewCase(c: CaseRecord) {
  c.status = 'review';
  c.events.push({ type: 'review', at: now() });
  save();
}

export function assignCase(c: CaseRecord, techId: string) {
  const tech = findUser(techId);
  if (!tech || !tech.active || !tech.screens.includes('jobs')) return false;
  const time = now();
  c.status = 'assigned';
  c.techId = tech.id;
  c.events.push({ type: 'assigned', at: time, techId: tech.id });
  messages.push({ id: `m-${messages.length + 1}`, techId: tech.id, caseId: c.id, at: time });
  save();
  return true;
}

/** Closes a case because a reported change (new device, repair, usage) accounts for it. */
export function explainByChange(c: CaseRecord, kind: ChangeKind, localDate: string | null, note: string) {
  const inWindow = localDate !== null && localDate >= run.replay_window.start_local_date && localDate <= windowEnd;
  const day = inWindow ? localDate : c.evidence.onset_local_date;
  recordChange(c, kind, day, 'operator', note || null);
  c.status = 'explained';
  c.events.push({ type: 'explained', at: now(), note: [CHANGE_LABEL[kind].tr, note].filter(Boolean).join(' · ') });
  save();
}

export function dismissCase(c: CaseRecord) {
  c.status = 'dismissed';
  c.events.push({ type: 'dismissed', at: now() });
  save();
}

export function recordResult(c: CaseRecord, result: FieldResult, note: string) {
  c.status = result === 'dismissed' ? 'dismissed' : 'verified';
  c.events.push({ type: result, at: now(), note: note || undefined });
  save();
}

export const listTechnicians = (): Technician[] =>
  users.filter((u) => u.active && u.screens.includes('jobs')).map((u) => ({ id: u.id, name: u.name }));

/* ── screen data ───────────────────────────────────────── */

export function jobsFor(u: User, l: Lang): JobsData {
  const jobs = cases
    .filter((c) => c.techId === u.id && isOpen(c))
    .sort((a, b) => a.evidence.rank - b.evidence.rank)
    .map((c) => toSummary(c, u, l));
  const inbox = messages
    .filter((m) => m.techId === u.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)
    .map((m) => {
      const c = getCase(m.caseId)!;
      const path = `${SCREENS.jobs.path}/${c.id}`;
      const check = lower(firstCheck(c, l), l);
      return {
        id: m.id, at: m.at,
        text: l === 'tr'
          ? `SilentWatt: ${c.id} size atandı. ${c.site.hood} ${c.site.street}. İlk kontrol: ${check}. Aç:`
          : `SilentWatt: ${c.id} assigned to you. ${c.site.hood} ${c.site.street}. Check first: ${check}. Open:`,
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
    for (const c of observedCases().filter((x) => x.status === 'new')) {
      const p = PRIORITY_WORD[l][priorityOf(c)];
      list.push({ id: `n-new-${c.id}`, text: tr ? `Yeni vaka ${c.id} · ${p} öncelik` : `New case ${c.id} · ${p} priority`, at: c.events[0].at, href: caseHref(u, c) });
    }
  }
  if (u.screens.includes('queue')) {
    for (const r of requests) {
      const c = getCase(r.caseId);
      if (!c) continue;
      list.push({
        id: `n-req-${c.id}`,
        text: r.change
          ? (tr ? `Müşteri değişiklik bildirdi · ${c.id}` : `Resident reported a change · ${c.id}`)
          : (tr ? `Müşteri kontrol talebi · ${c.id}` : `Resident asked for an inspection · ${c.id}`),
        at: r.at, href: caseHref(u, c),
      });
    }
  }
  if (u.screens.includes('jobs')) {
    for (const c of cases.filter((x) => x.techId === u.id && x.status === 'assigned' && x.events.at(-1)?.type === 'assigned')) {
      list.push({ id: `n-job-${c.id}`, text: tr ? `İş emri atandı: ${c.id}` : `Work order assigned: ${c.id}`, at: c.events.at(-1)!.at, href: caseHref(u, c) });
    }
  }
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

export function overview(l: Lang): OverviewData {
  const observed = observedCases();
  const evaluation = evidence.index.evaluation;
  // Scored and unscored days are known only for households that have a case file.
  const householdRows = householdIds.map((id) => {
    const mine = cases.filter((c) => c.evidence.household_id === id);
    const daily = mine[0].evidence.daily;
    const real = mine.filter((c) => !isSynthetic(c));
    return {
      household: householdLabel(id, l),
      observedOpen: real.filter(isOpen).length,
      observedClosed: real.filter((c) => !isOpen(c)).length,
      synthetic: mine.length - real.length,
      scoredDays: daily.filter((d) => d.scored).length,
      notScoredDays: daily.filter((d) => !d.scored).length,
    };
  });
  return {
    window: { start: run.replay_window.start_local_date, end: windowEnd },
    households: run.households,
    observed: {
      open: observed.filter(isOpen).length,
      closed: observed.filter((c) => !isOpen(c)).length,
      deviations: observed.filter((c) => c.evidence.kind !== 'data_issue').length,
      dataIssues: observed.filter((c) => c.evidence.kind === 'data_issue').length,
    },
    syntheticCases: cases.length - observed.length,
    thresholdProvenance: run.families.some((f) => f.threshold_provenance)
      ? (l === 'tr' ? 'Haziran’da, her cihaz ailesi için alarm bütçesine göre seçildi' : 'Chosen on June within the alarm budget, per device family')
      : provenanceLabel(run.detector.threshold_provenance, l),
    evaluation: evaluation && {
      syntheticCases: evaluation.synthetic_cases,
      syntheticDetected: evaluation.synthetic_detected,
      cleanHouseholdDays: evaluation.clean_household_days,
      falseCasesOnCleanData: evaluation.false_cases_on_clean_data,
      dataFaultsCaughtByQualityGate: evaluation.data_faults_caught_by_quality_gate,
      scenarios: evaluation.by_scenario.map((s) => ({
        label: `${s.family ? `${FAMILY_LABEL[s.family][l]} · ` : ''}${scenarioLabel(s.scenario, s.fault_kind, l)}`,
        severity: signedSeverity(s.scenario, s.severity), durationDays: s.duration_days,
        injected: s.injected, detected: s.detected, medianDelayDays: s.median_delay_days,
      })),
    },
    familyRows: FAMILY_ORDER.filter((key) => run.families.some((f) => f.family === key)).map((key) => {
      const f = familyRun(key);
      const mine = cases.filter((c) => c.evidence.family === key);
      const real = mine.filter((c) => !isSynthetic(c));
      return {
        key, label: FAMILY_LABEL[key][l], circuit: f.circuit, households: f.households, expectedFrom: expectedFromLabel(f.expected_from, l),
        observedOpen: real.filter(isOpen).length, observedClosed: real.filter((c) => !isOpen(c)).length, validation: mine.length - real.length,
      };
    }),
    householdRows,
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
        findingRate: closed.length ? (closed.filter((c) => c.status === 'verified').length / closed.length) * 100 : null,
        jobs: mine.filter(isOpen).map((c) => toSummary(c, u, l)),
      };
    });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ORIGINS: EvidenceOrigin[] = ['observed', 'synthetic'];
const KINDS: EvidenceKind[] = ['consumption_deviation', 'production_shortfall', 'data_issue'];

export function report(u: User, l: Lang): ReportData {
  const rows: ReportRow[] = [];
  for (const origin of ORIGINS) {
    for (const family of FAMILY_ORDER) {
      for (const kind of KINDS) {
        const group = cases.filter((c) => c.evidence.origin === origin && c.evidence.family === family && c.evidence.kind === kind);
        if (group.length === 0) continue;
        rows.push({
          label: `${ORIGIN_LABEL[origin][l]} · ${FAMILY_LABEL[family][l]} · ${KIND_LABEL[kind][l]}`,
          synthetic: origin === 'synthetic',
          cases: group.length,
          open: group.filter(isOpen).length,
          withFinding: group.filter((c) => c.status === 'verified').length,
          noFinding: group.filter((c) => c.status === 'dismissed' || c.status === 'explained').length,
          flaggedDays: group.reduce((total, c) => total + c.evidence.flagged_days, 0),
          // Null is not zero: cases without an excess share stay out of the median.
          medianExcessShare: median(group.flatMap((c) => (c.evidence.excess_share === null ? [] : [c.evidence.excess_share]))),
        });
      }
    }
  }
  return { period: `${windowText(l)} · ${run.run_id}`, rows, canExport: can(u, 'report.export') };
}

export function reportCsv(u: User, l: Lang) {
  const { rows } = report(u, l);
  // Turkish spreadsheet apps expect ';' because ',' is the decimal separator.
  const sep = l === 'tr' ? ';' : ',';
  const header = l === 'tr'
    ? ['Grup', 'Vaka', 'Açık', 'Saha bulgusu', 'Bulgu yok', 'İşaretli gün', 'Referansa göre medyan fark (%)']
    : ['Group', 'Cases', 'Open', 'Field finding', 'Nothing found', 'Flagged days', 'Median difference from reference (%)'];
  const lines = [header.join(sep)];
  for (const r of rows) {
    const excess = r.medianExcessShare === null ? '' : fmt(r.medianExcessShare * 100, 1, l);
    // Nobody acts on synthetic cases, so their workflow columns stay empty rather than 0.
    const workflow = r.synthetic ? ['', '', ''] : [r.open, r.withFinding, r.noFinding];
    lines.push([r.label, r.cases, ...workflow, r.flaggedDays, excess].join(sep));
  }
  return '﻿' + lines.join('\r\n');
}

export function dataSources(l: Lang): DataSourcesData {
  const tr = l === 'tr';
  const d = run.detector;
  const groups: DataSourcesData['groups'] = [
    {
      title: tr ? 'Koşu' : 'Run',
      rows: [
        { label: tr ? 'Koşu kimliği' : 'Run id', value: run.run_id },
        { label: tr ? 'Tahminlerin geldiği P1 koşusu' : 'P1 run the predictions come from', value: run.source_run },
        { label: tr ? 'Veri seti' : 'Dataset', value: run.dataset_id },
        { label: tr ? 'Protokol' : 'Protocol', value: run.protocol_version },
        { label: 'Model', value: run.model },
        { label: tr ? 'Yeniden oynatma penceresi' : 'Replay window', value: windowText(l) },
        { label: tr ? 'Hane sayısı' : 'Households', value: fmt(run.households, 0, l) },
        { label: tr ? 'Kanal' : 'Channel', value: 'air1' },
        { label: tr ? 'Birim' : 'Unit', value: tr ? 'Doğrulanmamış kaynak birimi' : 'Unverified source unit' },
      ],
    },
    {
      title: tr ? 'Cihaz aileleri' : 'Device families',
      rows: [
        ...run.families.map((f) => ({
          label: `${FAMILY_LABEL[f.family][l]} · ${f.circuit}`,
          value: `${tr ? `${f.households} hane` : `${f.households} households`} · ${expectedFromLabel(f.expected_from, l)}`,
        })),
        { label: tr ? 'Bildirilen değişiklik (dedektöre aktarılır)' : 'Reported changes (sent to the detector)', value: String(changes.length) },
      ],
    },
    {
      title: tr ? `Dedektör · ${d.version}` : `Detector · ${d.version}`,
      rows: [
        { label: tr ? 'Eşiklerin kaynağı' : 'Where the thresholds come from', value: provenanceLabel(d.threshold_provenance, l) },
        ...run.families.filter((f) => f.threshold_provenance).map((f) => ({
          label: tr ? `${FAMILY_LABEL[f.family].tr}: eşikler` : `${FAMILY_LABEL[f.family].en}: thresholds`,
          value: provenanceLabel(f.threshold_provenance, l),
        })),
        { label: tr ? 'Akut: z eşiği' : 'Acute: z threshold', value: fmt(d.acute.z_threshold, 2, l) },
        { label: tr ? 'Akut: üst sınır aşım payı eşiği' : 'Acute: upper-bound exceedance share', value: pct(d.acute.exceedance_share_threshold, l) },
        { label: tr ? 'Akut: art arda gün' : 'Acute: consecutive days', value: fmt(d.acute.consecutive_days, 0, l) },
        { label: tr ? 'Kronik: k / h' : 'Chronic: k / h', value: `${fmt(d.chronic.k, 2, l)} / ${fmt(d.chronic.h, 2, l)}` },
        { label: tr ? 'Kronik: pozitif gün / pencere' : 'Chronic: positive days / window', value: `${d.chronic.positive_days} / ${d.chronic.window_days}` },
        { label: tr ? 'Veri sorunu: art arda gün' : 'Data issue: consecutive days', value: fmt(d.data_issue.consecutive_days, 0, l) },
      ],
    },
  ];
  const plan = run.synthetic_plan;
  if (plan) {
    groups.push({
      title: tr ? 'Doğrulama senaryoları' : 'Validation scenarios',
      rows: [
        { label: 'Plan', value: plan.plan_id },
        { label: tr ? 'Üretici sürümü' : 'Generator version', value: plan.generator_version },
        { label: tr ? 'Tohum' : 'Seed', value: String(plan.seed) },
        ...plan.scenarios.map((s) => ({
          label: `${s.family ? `${FAMILY_LABEL[s.family][l]} · ` : ''}${scenarioLabel(s.scenario, s.fault_kind, l)}`,
          value: [s.severity === null ? null : `${s.scenario === 'production_drop' ? '−' : '+'}${pct(s.severity, l)}`, tr ? `${s.duration_days} gün` : `${s.duration_days} days`].filter(Boolean).join(' · '),
        })),
      ],
    });
  }
  return { fixture: evidence.index.fixture, generatedAt: evidence.index.generated_at_utc, groups };
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
  save();
  return { ok: true, user: toUserRow(target, me, l), deactivated };
}
