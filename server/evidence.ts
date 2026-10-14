// Reads the evidence files ML writes (contract: docs/architecture/evidence-contract.md).
// The directory comes from config (SILENTWATT_EVIDENCE_DIR, or the committed fixtures).
import fs from 'node:fs';
import path from 'node:path';
import { EVIDENCE_SCHEMA_VERSION, type EvidenceCase, type EvidenceIndex } from '../shared/evidence';

const CASE_ID = /^[A-Za-z0-9-]+$/;

export interface Evidence {
  dir: string;
  index: EvidenceIndex;
  cases: Map<string, EvidenceCase>;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Loads one evidence directory and rejects anything the contract does not allow. */
export function loadEvidence(dir: string): Evidence {
  const index = readJson(path.join(dir, 'index.json')) as EvidenceIndex;
  if (index.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`Evidence schema ${index.schema_version} is not ${EVIDENCE_SCHEMA_VERSION}: ${dir}`);
  }
  if (index.run.unit !== 'source_unit_unverified') throw new Error(`Unexpected evidence unit: ${index.run.unit}`);

  // Rule 5: every date lies inside the replay window; a file with a test-period date is rejected.
  const { start_local_date: start, end_local_date: end } = index.run.replay_window;
  const inWindow = (day: string) => day >= start && day < end;

  const cases = new Map<string, EvidenceCase>();
  for (const summary of index.cases) {
    if (!CASE_ID.test(summary.case_id)) throw new Error(`Invalid case id: ${summary.case_id}`);
    const file = readJson(path.join(dir, 'cases', `${summary.case_id}.json`)) as EvidenceCase;
    if (file.schema_version !== EVIDENCE_SCHEMA_VERSION || file.case_id !== summary.case_id) {
      throw new Error(`Case file does not match the index: ${summary.case_id}`);
    }
    const days = [file.onset_local_date, file.detected_local_date, file.last_local_date, ...file.daily.map((d) => d.local_date)];
    const outside = days.find((day) => !inWindow(day));
    if (outside) throw new Error(`${summary.case_id} has a date outside the replay window: ${outside}`);
    cases.set(file.case_id, file);
  }
  return { dir, index, cases };
}
