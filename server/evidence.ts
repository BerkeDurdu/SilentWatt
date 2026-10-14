// Reads the evidence files ML writes (contract: docs/architecture/evidence-contract.md).
// The directory comes from config (SILENTWATT_EVIDENCE_DIR, or the committed fixtures).
import fs from 'node:fs';
import path from 'node:path';
import {
  EVIDENCE_SCHEMA_VERSIONS, type EvidenceCase, type EvidenceFamily, type EvidenceIndex, type EvidenceKind,
} from '../shared/evidence';

const CASE_ID = /^[A-Za-z0-9-]+$/;
const FAMILIES: EvidenceFamily[] = ['hvac', 'refrigeration', 'solar'];
const KINDS: EvidenceKind[] = ['consumption_deviation', 'production_shortfall', 'data_issue'];
/** What a v0.1 file implicitly was: one HVAC family on the air1 circuit. */
const V01_FAMILY = { family: 'hvac', circuit: 'air1', expected_from: 'outdoor_temperature,hour', threshold_provenance: null } as const;

export interface Evidence {
  dir: string;
  index: EvidenceIndex;
  cases: Map<string, EvidenceCase>;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const known = (version: unknown) => (EVIDENCE_SCHEMA_VERSIONS as readonly unknown[]).includes(version);

/** Loads one evidence directory and rejects anything the contract does not allow. */
export function loadEvidence(dir: string): Evidence {
  const index = readJson(path.join(dir, 'index.json')) as EvidenceIndex;
  if (!known(index.schema_version)) {
    throw new Error(`Evidence schema ${index.schema_version} is not one of ${EVIDENCE_SCHEMA_VERSIONS.join(', ')}: ${dir}`);
  }
  if (index.run.unit !== 'source_unit_unverified') throw new Error(`Unexpected evidence unit: ${index.run.unit}`);
  index.run.families ??= [{ ...V01_FAMILY, households: index.run.households }];
  const families = new Set(index.run.families.map((f) => f.family));
  for (const family of families) if (!FAMILIES.includes(family)) throw new Error(`Unknown family: ${family}`);

  // Rule 5: every date lies inside the replay window; a file with a test-period date is rejected.
  const { start_local_date: start, end_local_date: end } = index.run.replay_window;
  const inWindow = (day: string) => day >= start && day < end;

  const cases = new Map<string, EvidenceCase>();
  for (const summary of index.cases) {
    if (!CASE_ID.test(summary.case_id)) throw new Error(`Invalid case id: ${summary.case_id}`);
    const file = readJson(path.join(dir, 'cases', `${summary.case_id}.json`)) as EvidenceCase;
    if (!known(file.schema_version) || file.case_id !== summary.case_id) {
      throw new Error(`Case file does not match the index: ${summary.case_id}`);
    }
    file.family ??= V01_FAMILY.family;
    file.circuit ??= V01_FAMILY.circuit;
    summary.family ??= file.family;
    summary.circuit ??= file.circuit;
    if (!families.has(file.family)) throw new Error(`${summary.case_id}: family ${file.family} is not in run.families`);
    if (!KINDS.includes(file.kind)) throw new Error(`${summary.case_id}: unknown kind ${file.kind}`);
    const days = [file.onset_local_date, file.detected_local_date, file.last_local_date, ...file.daily.map((d) => d.local_date)];
    const outside = days.find((day) => !inWindow(day));
    if (outside) throw new Error(`${summary.case_id} has a date outside the replay window: ${outside}`);
    cases.set(file.case_id, file);
  }
  return { dir, index, cases };
}
