// Types shared by the API server and the web client.

export type Lang = 'tr' | 'en';
export type ScreenKey = 'overview' | 'queue' | 'team' | 'reports' | 'data' | 'users' | 'jobs';
export type Capability = 'case.assign' | 'case.dismiss' | 'case.result' | 'report.export' | 'users.manage';
export type AddressLevel = 'district' | 'neighbourhood' | 'full';
export type RoleKey = 'manager' | 'operator' | 'technician' | 'admin';
export type CaseStatus = 'new' | 'review' | 'assigned' | 'verified' | 'dismissed';
export type FaultKey = 'airflow' | 'refrig' | 'aux' | 'defrost' | 'pv' | 'pvstring';
export type Equipment = 'hp' | 'pv';
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
}

export interface Cause {
  key: FaultKey;
  label: string;
  p: number;
}

export interface CaseSummary {
  id: string;
  status: CaseStatus;
  priority: Priority;
  equipment: Equipment;
  location: string;
  topCause: Cause;
  secondCause: Cause | null;
  deviation: number;
  days: number;
  lossKwhMonth: number;
  spark: { act: number[]; ref: number[]; onset: number };
  technicianName: string | null;
  firstCheck: string;
  /** Where this user can open the case, or null if they can't. */
  href: string | null;
}

export interface CaseList {
  items: CaseSummary[];
  counts: { open: number; closed: number; all: number };
}

export interface SeriesPoint {
  d: number;
  label: string;
  ref: number;
  lo: number;
  hi: number;
  act: number;
}

export interface CaseEvent {
  label: string;
  at: string;
  note: string | null;
}

export interface CaseDetail extends CaseSummary {
  meter: string;
  masked: boolean;
  hypotheses: (Cause & { inSet: boolean })[];
  other: number;
  evidence: string[];
  series: SeriesPoint[];
  onset: number;
  events: CaseEvent[];
  actions: { review: boolean; assign: boolean; dismiss: boolean; result: boolean };
}

export interface Notification {
  id: string;
  text: string;
  at: string;
  href: string | null;
}

export interface OverviewData {
  visitsPerConfirmed: number;
  falseAlarmRate: number;
  falseAlarmTarget: number;
  openCases: number;
  coverage: number;
  coverageTarget: number;
  fieldResults: number;
  weeks: { week: number; verified: number; dismissed: number; open: number }[];
  families: { key: FaultKey; label: string; count: number; mvp0: boolean }[];
  regions: { name: string; meters: number; open: number; verified: number; dismissed: number }[];
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
  confirmedRate: number | null;
  jobs: CaseSummary[];
}

export interface ReportRow {
  label: string;
  mvp0: boolean;
  confirmed: number;
  falseAlarms: number;
  visits: number;
  lossKwhMonth: number;
}

export interface ReportData {
  period: string;
  rows: ReportRow[];
  totals: ReportRow;
  canExport: boolean;
}

export interface DataSource {
  id: string;
  name: string;
  description: string;
  status: 'waiting' | 'connected' | 'example' | 'none';
  lastData: string | null;
}

export interface DataSourcesData {
  sources: DataSource[];
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
