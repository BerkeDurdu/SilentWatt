"""Consistency of the committed evidence fixtures (shared/fixtures/evidence).

The fixtures are made up, but the console and the API are built on them, so their numbers
must not contradict each other. These tests recompute, from each case file alone:

- the daily rows from the 15-minute series points of the same day;
- every reason value from the daily rows and series points (contract reason table);
- the CUSUM column from the daily z, and the case dates from the detector rules.

Finally the generator must reproduce the committed files exactly.
"""
import importlib.util
import json
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from silentwatt_ml.detection.evidence import summary_of, validate_case

REPOSITORY = Path(__file__).resolve().parents[3]
FIXTURE_DIRECTORY = REPOSITORY / "shared" / "fixtures" / "evidence"
GENERATOR_PATH = REPOSITORY / "docs" / "product" / "ekler" / "make_evidence_fixtures.py"
LOCAL_TIMEZONE = ZoneInfo("America/Chicago")
SLOT_HOURS = 0.25
# The evidence writer counts unscored days from three days before the onset to the last day
# (evidence.py). Whether the window should start at the onset instead is an open decision.
DAYS_NOT_SCORED_DAYS_BEFORE = 3


def load_fixtures() -> tuple[dict, list[dict]]:
    index = json.loads((FIXTURE_DIRECTORY / "index.json").read_text(encoding="utf-8"))
    cases = [json.loads(path.read_text(encoding="utf-8"))
             for path in sorted((FIXTURE_DIRECTORY / "cases").glob("*.json"))]
    return index, cases


def load_generator():
    specification = importlib.util.spec_from_file_location("make_evidence_fixtures", GENERATOR_PATH)
    generator = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(generator)
    return generator


def local_date_of(point: dict) -> str:
    timestamp = point["ts_utc"].replace("Z", "+00:00")
    return datetime.fromisoformat(timestamp).astimezone(LOCAL_TIMEZONE).date().isoformat()


def shift(day: str, days: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=days)).isoformat()


def points_by_day(case: dict) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for point in case["series"]:
        grouped.setdefault(local_date_of(point), []).append(point)
    return grouped


def days_between(case: dict, first: str, last: str) -> list[dict]:
    return [row for row in case["daily"] if first <= row["local_date"] <= last]


def flagged_days_of(case: dict) -> list[dict]:
    window = days_between(case, case["onset_local_date"], case["last_local_date"])
    return [row for row in window if row["flagged"] and row["scored"]]


def used_points(points: list[dict]) -> list[dict]:
    """Points the daily statistics count: scored, with a reading and a band."""
    return [p for p in points if p["scored"] and p["observed"] is not None
            and p["reference"] is not None and p["upper"] is not None]


def expected_reasons(case: dict) -> dict:
    """Reason values from the case's own rows, by the contract's reason table."""
    by_day = points_by_day(case)
    if case["kind"] == "data_issue":
        window = days_between(case, case["onset_local_date"], case["last_local_date"])
        valid = sum(row["valid_slots"] for row in window)
        expected = sum(row["expected_slots"] for row in window)
        return {"MISSING_READINGS": 1 - valid / expected}

    flagged = flagged_days_of(case)
    points = [p for row in flagged for p in used_points(by_day[row["local_date"]])]
    observed = sum(p["observed"] for p in points)
    reference = sum(p["reference"] for p in points)
    above_upper = sum(1 for p in points if p["observed"] > p["upper"])
    reasons = {}
    if "acute" in case["detectors"]:
        reasons["DAILY_EXCESS_Z"] = max(row["z"] for row in flagged)
        reasons["CONSECUTIVE_FLAGGED_DAYS"] = len(flagged)
    reasons["UPPER_BOUND_EXCEEDANCE"] = above_upper / len(points)
    if "chronic" in case["detectors"]:
        window = days_between(case, case["onset_local_date"], case["last_local_date"])
        reasons["PERSISTENT_CUSUM"] = max(row["cusum"] for row in window if row["cusum"] is not None)
    reasons["EXCESS_OVER_REFERENCE"] = observed / reference - 1
    context = days_between(case, shift(case["onset_local_date"], -DAYS_NOT_SCORED_DAYS_BEFORE),
                           case["last_local_date"])
    not_scored = sum(1 for row in context if not row["scored"])
    if not_scored:
        reasons["DAYS_NOT_SCORED"] = not_scored
    return reasons


class EvidenceFixtureConsistencyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index, cls.cases = load_fixtures()
        cls.detector = cls.index["run"]["detector"]

    def test_daily_rows_follow_from_the_series_points(self):
        for case in self.cases:
            by_day = points_by_day(case)
            for row in case["daily"]:
                points = by_day.get(row["local_date"])
                if points is None:
                    continue  # the series covers only the days around the case
                with self.subTest(case=case["case_id"], day=row["local_date"]):
                    readings = [p for p in points if p["observed"] is not None]
                    self.assertEqual(row["valid_slots"], len(readings))
                    if not row["scored"]:
                        continue
                    used = used_points(points)
                    observed = SLOT_HOURS * sum(p["observed"] for p in used)
                    reference = SLOT_HOURS * sum(p["reference"] for p in used)
                    above_upper = sum(1 for p in used if p["observed"] > p["upper"]) / len(used)
                    self.assertAlmostEqual(row["observed_unit_hours"], observed, delta=1e-3)
                    self.assertAlmostEqual(row["reference_unit_hours"], reference, delta=1e-3)
                    self.assertAlmostEqual(row["upper_exceedance_share"], above_upper, delta=1e-4)

    def test_reason_values_follow_from_the_case_rows(self):
        for case in self.cases:
            with self.subTest(case=case["case_id"]):
                written = {reason["code"]: reason["value"] for reason in case["reasons"]}
                expected = expected_reasons(case)
                self.assertEqual(set(written), set(expected))
                for code, value in expected.items():
                    # z and CUSUM are written with 2 decimals, shares with 4.
                    tolerance = 0.006 if code in ("DAILY_EXCESS_Z", "PERSISTENT_CUSUM") else 1e-4
                    self.assertAlmostEqual(written[code], value, delta=tolerance, msg=code)

    def test_case_summary_fields_match_the_reasons(self):
        for case in self.cases:
            if case["kind"] != "consumption_deviation":
                continue
            with self.subTest(case=case["case_id"]):
                written = {reason["code"]: reason["value"] for reason in case["reasons"]}
                self.assertEqual(case["flagged_days"], len(flagged_days_of(case)))
                self.assertEqual(case["excess_share"], written["EXCESS_OVER_REFERENCE"])
                self.assertEqual(case["upper_exceedance_share"], written["UPPER_BOUND_EXCEEDANCE"])

    def test_cusum_column_follows_the_chronic_rule(self):
        # S_d = max(0, S_(d-1) + z_d - k) on scored days; unscored days are null. A gap of up to
        # max_gap_days unscored days freezes S, a longer gap resets it to 0 (rules.py). The
        # contract's detector block has no max_gap_days, so the generator's value is used.
        k = self.detector["chronic"]["k"]
        max_gap_days = load_generator().MAX_GAP_DAYS
        for case in self.cases:
            statistic = 0.0
            gap = 0
            for row in case["daily"]:
                with self.subTest(case=case["case_id"], day=row["local_date"]):
                    if not row["scored"]:
                        self.assertIsNone(row["cusum"])
                        gap += 1
                        if gap > max_gap_days:
                            statistic = 0.0
                        continue
                    gap = 0
                    statistic = max(0.0, statistic + row["z"] - k)
                    self.assertAlmostEqual(row["cusum"], statistic, delta=0.02)

    def test_case_dates_follow_the_detector_rules(self):
        acute = self.detector["acute"]
        chronic = self.detector["chronic"]
        for case in self.cases:
            with self.subTest(case=case["case_id"]):
                scored = [row for row in case["daily"] if row["scored"]]
                meets_acute = [row["local_date"] for row in scored
                               if row["z"] > acute["z_threshold"]
                               and row["upper_exceedance_share"] > acute["exceedance_share_threshold"]]
                above_h = [row["local_date"] for row in scored if row["cusum"] > chronic["h"]]
                if case["kind"] == "data_issue":
                    window = days_between(case, case["onset_local_date"], case["last_local_date"])
                    self.assertTrue(all(row["not_scored_reason"] == "insufficient_daily_coverage" for row in window))
                    consecutive = self.detector["data_issue"]["consecutive_days"]
                    self.assertEqual(case["detected_local_date"], shift(case["onset_local_date"], consecutive - 1))
                if "acute" in case["detectors"]:
                    window = days_between(case, case["onset_local_date"], case["last_local_date"])
                    self.assertEqual(meets_acute, [row["local_date"] for row in window])
                    second_day = window[acute["consecutive_days"] - 1]["local_date"]
                    self.assertEqual(case["detected_local_date"], second_day)
                else:
                    self.assertEqual(meets_acute, [], "the acute rule would open a case")
                if "chronic" in case["detectors"]:
                    self.assertEqual(case["detected_local_date"], above_h[0])
                    self.assertEqual(case["last_local_date"], above_h[-1])
                else:
                    self.assertEqual(above_h, [], "the chronic rule would open a case")

    def test_case_files_pass_the_contract_validation(self):
        replay_window = self.index["run"]["replay_window"]
        for case in self.cases:
            with self.subTest(case=case["case_id"]):
                self.assertEqual(validate_case(case, replay_window), [])

    def test_index_summaries_match_the_case_files(self):
        by_id = {case["case_id"]: case for case in self.cases}
        self.assertEqual(sorted(by_id), sorted(entry["case_id"] for entry in self.index["cases"]))
        for entry in self.index["cases"]:
            with self.subTest(case=entry["case_id"]):
                self.assertEqual(entry, summary_of(by_id[entry["case_id"]]))

    def test_generator_reproduces_the_committed_files(self):
        generator = load_generator()
        cases = generator.build_cases()
        committed_index, committed_cases = load_fixtures()
        # Round-trip through JSON so tuples and floats compare as they are written.
        # The committed files are read in file-name order, the generator lists them by household.
        generated = sorted(json.loads(json.dumps(cases)), key=lambda case: case["case_id"])
        self.assertEqual(generated, sorted(committed_cases, key=lambda case: case["case_id"]))
        self.assertEqual(json.loads(json.dumps(generator.build_index(cases))), committed_index)


if __name__ == "__main__":
    unittest.main()
