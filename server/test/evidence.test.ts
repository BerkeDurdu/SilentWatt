import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadEvidence } from '../evidence';
import { explainCase, guardViolations } from '../explain';

const FIXTURES = path.resolve(import.meta.dirname, '../../shared/fixtures/evidence');

test('the committed fixtures load', () => {
  const evidence = loadEvidence(FIXTURES);
  assert.equal(evidence.cases.size, 8);
  assert.deepEqual(evidence.index.run.families.map((f) => f.family), ['hvac', 'refrigeration', 'solar']);
  assert.equal(evidence.index.fixture, true);
});

test('a file with a date outside the replay window is rejected (contract rule 5)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-evidence-'));
  try {
    fs.cpSync(FIXTURES, dir, { recursive: true });
    const file = path.join(dir, 'cases', 'SW-HVAC-90003-20180703-ACU.json');
    const evidenceCase = JSON.parse(fs.readFileSync(file, 'utf8'));
    evidenceCase.daily[0].local_date = '2018-08-15';
    fs.writeFileSync(file, JSON.stringify(evidenceCase));
    assert.throws(() => loadEvidence(dir), /outside the replay window: 2018-08-15/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown schema version is rejected instead of guessed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-evidence-'));
  try {
    fs.cpSync(FIXTURES, dir, { recursive: true });
    const file = path.join(dir, 'index.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('silentwatt.evidence/0.2', 'silentwatt.evidence/9.0'));
    assert.throws(() => loadEvidence(dir), /schema/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every fixture explanation passes the guard in both languages', () => {
  for (const evidenceCase of loadEvidence(FIXTURES).cases.values()) {
    for (const lang of ['tr', 'en'] as const) {
      const explanation = explainCase(evidenceCase, lang);
      assert.equal(explanation.guard.passed, true, `${evidenceCase.case_id} ${lang}: ${explanation.guard.violations.join(', ')}`);
      assert.equal(explanation.reasons.length, evidenceCase.reasons.length);
      assert.ok(explanation.humanDecisionNote);
    }
  }
});

test('the guard rejects forbidden wording, invented numbers and a missing human-decision sentence', () => {
  const evidenceCase = loadEvidence(FIXTURES).cases.get('SW-SYN-HVAC-90001-20180707-ACU')!;
  const note = explainCase(evidenceCase, 'tr').humanDecisionNote;
  assert.deepEqual(guardViolations(['Ölçülen değer referansın %31 üzerinde.'], note, evidenceCase, 'tr'), []);
  const violations = guardViolations(['Ayda 42 kWh kayıp; arıza doğrulandı.'], '', evidenceCase, 'tr');
  assert.ok(violations.some((v) => v.startsWith('forbidden_wording')));
  assert.ok(violations.includes('number_not_in_evidence: 42'));
  assert.ok(violations.includes('human_decision_note_missing'));
});

test('a v0.1 file (HVAC only, written by the current detector) is still read, as one air1 family', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-evidence-'));
  try {
    const id = 'SW-HVAC-90003-20180703-ACU';
    fs.mkdirSync(path.join(dir, 'cases'));
    const index = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
    index.schema_version = 'silentwatt.evidence/0.1';
    delete index.run.families;
    index.cases = index.cases.filter((c: { case_id: string }) => c.case_id === id).map((c: Record<string, unknown>) => {
      const { family: _family, circuit: _circuit, lower_shortfall_share: _lower, ...rest } = c;
      return rest;
    });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
    const file = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'cases', `${id}.json`), 'utf8'));
    file.schema_version = 'silentwatt.evidence/0.1';
    delete file.family;
    delete file.circuit;
    fs.writeFileSync(path.join(dir, 'cases', `${id}.json`), JSON.stringify(file));

    const evidence = loadEvidence(dir);
    assert.deepEqual(evidence.index.run.families.map((f) => [f.family, f.circuit]), [['hvac', 'air1']]);
    const loaded = evidence.cases.get(id)!;
    assert.equal(loaded.family, 'hvac');
    assert.equal(loaded.circuit, 'air1');
    assert.equal(explainCase(loaded, 'tr').guard.passed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
