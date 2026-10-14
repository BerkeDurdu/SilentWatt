// Types shared by the API server and the web client.
import type { ChangeKind, DailyEvidence, EvidenceFamily, EvidenceKind, EvidenceOrigin, EvidenceSeriesPoint } from './evidence';

export type Lang = 'tr' | 'en';
export type ScreenKey = 'overview' | 'queue' | 'team' | 'reports' | 'data' | 'users' | 'jobs';
export type Capability = 'case.assign' | 'case.dismiss' | 'case.result' | 'report.export' | 'users.manage';
export type AddressLevel = 'district' | 'neighbourhood' | 'full';
export type RoleKey = 'manager' | 'operator' | 'technician' | 'admin';
/** explained: closed because a reported change (new device, repair, usage) accounts for the deviation. */
export type CaseStatus = 'new' | 'review' | 'assigned' | 'verified' | 'dismissed' | 'explained';
export type Priority = 1 | 2 | 3;
export type FieldResult = 'verified' | 'other' | 'dismissed';

/** A screen the signed-in user is allowed to open. The server only ever sends these. */
export interface ScreenLink {
  key: ScreenKey;
  path: string;
  title: string;
}

export interface Me {
  id: string;
  name: string;
  initials: string;
  email: string;
  roleLabel: string;
  organization: string;
  scopeNote: string;
  screens: ScreenLink[];
  capabilities: Capability[];
  /** True while the console reads the committed synthetic fixtures instead of a detector run. */
  fixture: boolean;
}

export interface CaseSummary {
  id: string;
  status: CaseStatus;
  priority: Priority;
  /** Synthetic cases are injected scenarios: always labelled, never acted on, counted apart. */
  origin: EvidenceOrigin;
  family: EvidenceFamily;
  familyLabel: string;
  kind: EvidenceKind;
  title: string;
  detectorLabel: string;
  household: string;
  /** Example site record, masked to the user's address level. */
  location: string;
  /** observed / reference − 1 over the flagged days; null when not computed. Never drawn as 0. */
  excessShare: number | null;
  flaggedDays: number;
  onsetDate: string;
  lastDate: string;
  /** Daily unit-hours of the replay month; null on days that could not be scored. */
  spark: { observed: (number | null)[]; reference: (number | null)[]; from: number; to: number };
  technicianName: string | null;
  firstCheck: string;
  /** True once the resident asked for an inspection from the SMS link. */
  customerRequest: boolean;
  /** True once someone reported a change (new device, repair, usage) for this household and device. */
  changeReported: boolean;
  /** Where this user can open the case, or null if they can't. */
  href: string | null;
}

export interface CaseList {
  items: CaseSummary[];
  counts: { open: number; closed: number; synthetic: number; all: number };
  /** Device families present in the run, with how many cases the current status filter shows for each. */
  families: { key: EvidenceFamily; label: string; count: number }[];
}

export interface ChangeView {
  kind: ChangeKind;
  kindLabel: string;
  localDate: string;
  sourceLabel: string;
  note: string | null;
  at: string;
}

/* ── resident notice & service request ─────────────────── */

export type RequestSlot = 'morning' | 'afternoon' | 'evening' | 'any';

/** The informational SMS the resident received, with the link that opens the request form. */
export interface CustomerNotice {
  at: string;
  text: string;
  /** Only roles that see full addresses can open the resident's page; others read the link as text. */
  href: string | null;
  linkText: string;
}

/** A request the resident sent from that link, as staff see it. */
export interface CustomerRequest {
  reference: string;
  at: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  addressEdited: boolean;
  slotLabel: string;
  note: string | null;
  masked: boolean;
  /** The change the resident reported with the request, if any. */
  changeLabel: string | null;
}

export interface RequestReceipt {
  reference: string;
  at: string;
  name: string;
  phone: string;
  address: string;
  slotLabel: string;
  note: string | null;
  changeLabel: string | null;
}

/** Everything the public request page shows. No household id, no detector internals. */
export interface RequestPage {
  caseId: string;
  noticeAt: string;
  headline: string;
  body: string;
  points: string[];
  equipmentLabel: string;
  excessShare: number | null;
  days: number;
  closed: boolean;
  /** Prefilled from the subscriber record; the resident can change any of it. */
  customer: { name: string; phone: string; email: string; address: string };
  slots: { value: RequestSlot; label: string }[];
  /** "Did anything change?" choices: a new device explains a deviation better than any model. */
  changeOptions: { value: ChangeKind; label: string }[];
  changeQuestion: string;
  submitted: RequestReceipt | null;
}


export interface CaseEvent {
  label: string;
  at: string;
  note: string | null;
}

export interface DailyPoint extends DailyEvidence {
  /** Why the day could not be scored, in the user's language; null on scored days. */
  notScoredLabel: string | null;
}

/** Text written from the evidence by server/explain. No fault probability, no diagnosis. */
export interface CaseExplanation {
  summary: string;
  reasons: string[];
  recommendation: { firstCheck: string; steps: string[] };
  limitations: string[];
  humanDecisionNote: string;
}

export interface CaseDetail extends CaseSummary {
  masked: boolean;
  detectedDate: string;
  upperExceedanceShare: number | null;
  lowerShortfallShare: number | null;
  /** How the injected scenario was built; null for observed cases. */
  synthetic: { scenarioLabel: string; severity: number | null; durationDays: number; startDate: string } | null;
  daily: DailyPoint[];
  series: EvidenceSeriesPoint[];
  explanation: CaseExplanation;
  run: { model: string; protocol: string; thresholdProvenance: string; expectedFrom: string; circuit: string };
  changes: ChangeView[];
  events: CaseEvent[];
  notice: CustomerNotice | null;
  request: CustomerRequest | null;
  actions: { review: boolean; assign: boolean; dismiss: boolean; result: boolean; explain: boolean };
  changeOptions: { value: ChangeKind; label: string }[];
}

export interface Notification {
  id: string;
  text: string;
  at: string;
  href: string | null;
}

export interface ScenarioRow {
  label: string;
  severity: number | null;
  durationDays: number;
  injected: number;
  detected: number;
  medianDelayDays: number | null;
}

export interface OverviewData {
  window: { start: string; end: string };
  households: number;
  /** Observed cases only; synthetic cases never enter these counts. */
  observed: { open: number; closed: number; deviations: number; dataIssues: number };
  syntheticCases: number;
  thresholdProvenance: string;
  /** Detection results on injected scenarios and clean data; null when the run has none. */
  evaluation: {
    syntheticCases: number;
    syntheticDetected: number;
    cleanHouseholdDays: number;
    falseCasesOnCleanData: number;
    dataFaultsCaughtByQualityGate: number;
    scenarios: ScenarioRow[];
  } | null;
  familyRows: { key: EvidenceFamily; label: string; circuit: string; households: number; expectedFrom: string; observedOpen: number; observedClosed: number; validation: number }[];
  householdRows: { household: string; observedOpen: number; observedClosed: number; synthetic: number; scoredDays: number; notScoredDays: number }[];
}

export interface SmsMessage {
  id: string;
  at: string;
  text: string;
  href: string;
  linkText: string;
  caseOpen: boolean;
}

export interface JobsData {
  jobs: CaseSummary[];
  messages: SmsMessage[];
}

export interface Technician {
  id: string;
  name: string;
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  openJobs: number;
  closed: number;
  findingRate: number | null;
  jobs: CaseSummary[];
}

export interface ReportRow {
  label: string;
  synthetic: boolean;
  cases: number;
  open: number;
  /** Closed after a site visit that found something. */
  withFinding: number;
  /** Closed with nothing found, on site or at the desk. */
  noFinding: number;
  flaggedDays: number;
  /** Median excess share of the group's cases; null when none has one. */
  medianExcessShare: number | null;
}

export interface ReportData {
  period: string;
  rows: ReportRow[];
  canExport: boolean;
}

/** Where the cases on screen come from: the detector run, its thresholds and the synthetic plan. */
export interface DataSourcesData {
  fixture: boolean;
  generatedAt: string;
  groups: { title: string; rows: { label: string; value: string }[] }[];
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  roleLabel: string;
  screens: ScreenKey[];
  active: boolean;
  isSelf: boolean;
}

export interface UsersData {
  users: UserRow[];
  screens: { key: ScreenKey; title: string }[];
  roles: { key: RoleKey; label: string; screens: ScreenKey[] }[];
  canManage: boolean;
}
