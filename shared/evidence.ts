// Evidence contract v0.1: the files ML writes and the API reads.
// Field meanings and the rules every consumer follows: docs/architecture/evidence-contract.md

export const EVIDENCE_SCHEMA_VERSION = 'silentwatt.evidence/0.1';

export type EvidenceOrigin = 'observed' | 'synthetic';
export type EvidenceFamily = 'hvac';
export type EvidenceKind = 'consumption_deviation' | 'data_issue';
export type DetectorName = 'acute' | 'chronic' | 'data_quality';
export type SyntheticScenario = 'step_increase' | 'ramp_increase' | 'data_fault';
export type DataFaultKind = 'outage' | 'freeze' | 'spike';

export type ReasonCode =
  | 'DAILY_EXCESS_Z'
  | 'UPPER_BOUND_EXCEEDANCE'
  | 'CONSECUTIVE_FLAGGED_DAYS'
  | 'PERSISTENT_CUSUM'
  | 'EXCESS_OVER_REFERENCE'
  | 'DAYS_NOT_SCORED'
  | 'MISSING_READINGS'
  | 'FROZEN_READINGS';

export type RecommendationCode = 'HVAC_PERSISTENT_INCREASE' | 'DATA_SOURCE_CHECK';

/** Thresholds the detector used and where they come from (shown to users). */
export interface DetectorSettings {
  version: string;
  acute: { z_threshold: number; exceedance_share_threshold: number; consecutive_days: number };
  chronic: { k: number; h: number; positive_days: number; window_days: number };
  data_issue: { consecutive_days: number };
  threshold_provenance: string;
}

export interface SyntheticPlan {
  plan_id: string;
  generator_version: string;
  seed: number;
  scenarios: { scenario: SyntheticScenario; fault_kind: DataFaultKind | null; severity: number | null; duration_days: number }[];
}

export interface EvidenceRun {
  run_id: string;
  source_run: string;
  dataset_id: string;
  protocol_version: string;
  model: 'B0' | 'B1';
  replay_window: { split: 'development'; start_local_date: string; end_local_date: string };
  unit: 'source_unit_unverified';
  households: number;
  detector: DetectorSettings;
  synthetic_plan: SyntheticPlan | null;
}

export interface ScenarioResult {
  scenario: SyntheticScenario;
  fault_kind: DataFaultKind | null;
  severity: number | null;
  duration_days: number;
  injected: number;
  detected: number;
  median_delay_days: number | null;
}

export interface EvidenceEvaluation {
  clean_household_days: number;
  false_cases_on_clean_data: number;
  synthetic_cases: number;
  synthetic_detected: number;
  by_scenario: ScenarioResult[];
  data_faults_caught_by_quality_gate: number;
}

/** One case as listed in index.json. */
export interface EvidenceCaseSummary {
  case_id: string;
  origin: EvidenceOrigin;
  household_id: number;
  family: EvidenceFamily;
  circuit: 'air1';
  kind: EvidenceKind;
  detectors: DetectorName[];
  onset_local_date: string;
  detected_local_date: string;
  last_local_date: string;
  flagged_days: number;
  /** observed / reference − 1 over the flagged days; null for data issues or a tiny reference. */
  excess_share: number | null;
  upper_exceedance_share: number | null;
  rank: number;
  rank_basis: string;
  priority: 1 | 2 | 3;
  recommendation_code: RecommendationCode;
}

export interface EvidenceIndex {
  schema_version: typeof EVIDENCE_SCHEMA_VERSION;
  generated_at_utc: string;
  /** True only for the committed synthetic fixtures. */
  fixture: boolean;
  run: EvidenceRun;
  evaluation: EvidenceEvaluation | null;
  cases: EvidenceCaseSummary[];
}

export interface SyntheticInjection {
  scenario: SyntheticScenario;
  fault_kind: DataFaultKind | null;
  severity: number | null;
  duration_days: number;
  start_local_date: string;
  seed: number;
  generator_version: string;
}

export interface DailyEvidence {
  local_date: string;
  scored: boolean;
  not_scored_reason: string | null;
  valid_slots: number;
  expected_slots: number;
  /** 0.25 × Σ observed over valid slots, in source unit × hours (never kWh). */
  observed_unit_hours: number | null;
  /** 0.25 × Σ q50 over the same slots: the model reference. */
  reference_unit_hours: number | null;
  excess_share: number | null;
  upper_exceedance_share: number | null;
  z: number | null;
  cusum: number | null;
  flagged: boolean;
  max_temperature_c: number | null;
}

export interface EvidenceSeriesPoint {
  ts_utc: string;
  observed: number | null;
  reference: number | null;
  lower: number | null;
  upper: number | null;
  temperature_c: number | null;
  scored: boolean;
}

export interface EvidenceReason {
  code: ReasonCode;
  value: number | null;
}

/** The full evidence of one case (cases/<case_id>.json). */
export interface EvidenceCase extends EvidenceCaseSummary {
  schema_version: typeof EVIDENCE_SCHEMA_VERSION;
  synthetic: SyntheticInjection | null;
  daily: DailyEvidence[];
  series: EvidenceSeriesPoint[];
  reasons: EvidenceReason[];
  recommendation: { code: RecommendationCode; library_version: string };
}
