"""The detector run: real 15-minute readings in, evidence files (silentwatt.evidence/0.2) out.

For every device family and household:

1. Readings of the family's channel on the 15-minute UTC grid, with the daily quality gate.
   Rows from August on (the closed test period) are dropped before any value is read.
2. A reference model fitted on train (Jan-May), its band calibrated on June (p1-v3, the lower
   and upper bound apart), predicted on June and July.
   - hvac, refrigeration: empirical quantiles by local hour and outdoor-temperature bin (B0).
     A refrigerator stands indoors, so a hot day does not leave its model's support; its
     temperature is clamped into the training range instead.
   - solar: the household's capacity (99th percentile of train production) times the median
     normalised production of the other solar households at the same slot. Clouds over Austin
     lower every system at once, so the reference follows the weather without irradiance data;
     what stays is the system's own shortfall. Night slots have no reference.
3. The daily table, and z against the household's own June days.
4. Thresholds chosen on June: the most sensitive grid point whose June cases stay inside the
   alarm budget (decision 2026-10-06), then frozen for July.
5. July cases on the unmodified readings, then validation scenarios injected into copies of
   July readings of households without a case, run through the same detector.

Nothing is tuned on July, and July results are reported as they come out.
"""
from __future__ import annotations

import copy
import itertools
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from silentwatt_ml.config import ProjectConfig
from silentwatt_ml.data.daily import daily_quality
from silentwatt_ml.data.quality import electric_timestamps, weather_frame
from silentwatt_ml.data.readers import iter_electric, require_files
from silentwatt_ml.detection import rules
from silentwatt_ml.detection.daily_stats import add_z, household_daily_table, june_reference
from silentwatt_ml.detection.evidence import (
    FAMILIES, SCHEMA_VERSION, build_case, rank_and_prioritize, summary_of, validate_case, write_evidence,
)
from silentwatt_ml.detection.synthetic import inject, requalify, scenario_dates
from silentwatt_ml.models.baseline import _prepare_frame, fit_empirical, predict_empirical
from silentwatt_ml.models.calibration import QUANTILES, apply_calibration, calibrate_asymmetric, ordered_quantiles
from silentwatt_ml.provenance import provenance

DEVIATION_KIND = {"hvac": "consumption_deviation", "refrigeration": "consumption_deviation", "solar": "production_shortfall"}


@dataclass
class HouseholdRun:
    household: int
    family: str
    status: str = "scored"
    reason: str = "ok"
    slots: pd.DataFrame | None = None      # calibration + development rows with band and gate
    days: pd.DataFrame | None = None       # daily-quality rows of the same splits
    table: pd.DataFrame | None = None      # daily table with z (original sign)
    reference: dict | None = None          # June median and scale of the daily residual
    temperature_range: tuple[float, float] | None = None
    calibration: dict | None = None
    details: dict = field(default_factory=dict)


# ── reading ──────────────────────────────────────────────────────────────────

def _bounds(config: ProjectConfig, split: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    lo, hi = config.raw["splits_local_date"][split]
    return pd.Timestamp(lo, tz=config.timezone), pd.Timestamp(hi, tz=config.timezone)


def load_rows(config: ProjectConfig, path: Path, channels: list[str]) -> pd.DataFrame:
    """Every household's rows up to the end of July; the test period never leaves the reader."""
    ids, stamp = config.columns["household_id"], config.columns["timestamp_15m"]
    _, end = _bounds(config, "development")
    chunks = []
    for chunk in iter_electric(path, usecols=[ids, stamp, *channels]):
        timestamps = electric_timestamps(chunk[stamp])
        if timestamps.isna().any():
            raise ValueError("Invalid source timestamps; resolve the source audit first")
        keep = timestamps.lt(end)
        chunk = chunk.loc[keep].copy()
        chunk["_ts"] = timestamps.loc[keep]
        chunks.append(chunk)
    return pd.concat(chunks, ignore_index=True)


def family_config(config: ProjectConfig, settings: dict) -> ProjectConfig:
    raw = copy.deepcopy(config.raw)
    raw["columns"]["target"] = settings["channel"]
    raw["target_dead_band"] = settings["dead_band"]
    return ProjectConfig(raw=raw, source=config.source)


def _in_split(frame: pd.DataFrame, config: ProjectConfig, split: str) -> pd.Series:
    lo, hi = config.raw["splits_local_date"][split]
    return frame["local_date"].ge(lo) & frame["local_date"].lt(hi)


def _in_train(frame: pd.DataFrame, config: ProjectConfig, settings: dict) -> pd.Series:
    """Train rows of a family; train_from narrows the window to the most recent weeks (Q-19)."""
    inside = _in_split(frame, config, "train")
    if settings.get("train_from"):
        inside &= frame["local_date"].ge(settings["train_from"])
    return inside


def _prepared(config: ProjectConfig, settings: dict, household: int, rows: pd.DataFrame,
              weather: pd.DataFrame) -> tuple[pd.DataFrame | None, str]:
    """The household's frame for one family, or None with the reason it is not replayed."""
    cfg = family_config(config, settings)
    stamp = config.columns["timestamp_15m"]
    train_lo, train_hi = _bounds(config, "train")
    train_rows = rows.loc[rows["_ts"].ge(train_lo) & rows["_ts"].lt(train_hi)]
    observed = [c for c in settings["exclude_if_observed"] if c in rows.columns and train_rows[c].notna().any()]
    if observed:
        return None, "second_device_channel_observed_in_training"
    if train_rows[settings["channel"]].notna().sum() == 0:
        return None, "channel_not_measured"
    _, end = _bounds(config, "development")
    frame, _ = _prepare_frame(cfg, {}, household,
                              raw=rows[[config.columns["household_id"], stamp, settings["channel"]]],
                              weather=weather, end_before=end)
    expected = int((train_hi - train_lo).total_seconds() / 900)
    coverage = frame.loc[_in_split(frame, config, "train"), "target"].notna().sum() / expected
    if coverage < config.raw["cohort"]["minimum_target_coverage"]:
        return None, "insufficient_valid_training_coverage"
    return frame, "ok"


# ── reference models ─────────────────────────────────────────────────────────

def _band(config: ProjectConfig, part: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Order the quantiles, keep only rows with a reference, calibrate on June, apply to all."""
    finite = np.isfinite(part[QUANTILES]).all(axis=1)
    part.loc[finite, QUANTILES] = ordered_quantiles(part.loc[finite, QUANTILES].to_numpy())
    part["eligible"] = part["eligible"].astype(bool) & finite
    profile = calibrate_asymmetric(part.loc[_in_split(part, config, "calibration")], config.raw["p1"]["calibration"])
    banded = apply_calibration(part, profile)
    banded["split"] = np.where(_in_split(banded, config, "calibration"), "calibration", "development")
    return banded, profile


def _split_days(config: ProjectConfig, days: pd.DataFrame, local_dates) -> pd.DataFrame:
    days = days.loc[days["local_date"].isin(set(local_dates))].copy()
    days["split"] = np.where(_in_split(days, config, "calibration"), "calibration", "development")
    return days


def temperature_hour_run(config: ProjectConfig, settings: dict, run: HouseholdRun, frame: pd.DataFrame) -> None:
    quality = config.raw["p1"]["daily_quality"]
    initial, _ = daily_quality(frame, config.timezone, quality)
    train = initial.loc[_in_train(initial, config, settings) & initial["eligible"]]
    if train.empty:
        run.status, run.reason = "not_scored", "no_eligible_training_days"
        return
    model = fit_empirical(train, config.raw["baseline"])
    low, high = model["training_temperature_range_c"]
    run.temperature_range = (low, high)
    gate = (low, high) if settings["temperature_support"] else None
    qualified, days = daily_quality(frame, config.timezone, quality, gate)
    keep = _in_split(qualified, config, "calibration") | _in_split(qualified, config, "development")
    part = qualified.loc[keep].reset_index(drop=True)
    model_input = part.copy()
    if not settings["temperature_support"]:
        width = float(config.raw["baseline"]["temperature_bin_c"])
        model_input["temperature_c"] = model_input["temperature_c"].clip(low, high)
        model_input["temperature_bin_c"] = np.floor(model_input["temperature_c"] / width) * width
    predicted = predict_empirical(model_input, model)
    predicted["temperature_c"] = part["temperature_c"].to_numpy()
    predicted["temperature_bin_c"] = part["temperature_bin_c"].to_numpy()
    run.slots, run.calibration = _band(config, predicted)
    run.days = _split_days(config, days, part["local_date"].unique())
    run.details["training_temperature_range_c"] = [low, high]


def solar_runs(config: ProjectConfig, settings: dict, frames: dict[int, pd.DataFrame],
               runs: dict[int, HouseholdRun]) -> None:
    quality = config.raw["p1"]["daily_quality"]
    gated, capacity = {}, {}
    for household, frame in frames.items():
        initial, days = daily_quality(frame, config.timezone, quality)
        train = initial.loc[_in_split(initial, config, "train") & initial["eligible"]]
        cap = float(train["target"].quantile(0.99)) if len(train) else 0.0
        if cap < settings["minimum_capacity"]:
            runs[household].status, runs[household].reason = "not_scored", "no_solar_production"
            continue
        gated[household], capacity[household] = (initial, days), cap
        runs[household].details["capacity_source_unit"] = round(cap, 3)

    # Normalised production of every system on one table; the fleet index of a household is the
    # median of the others, so its own fault does not move its own reference.
    normalised = pd.DataFrame({
        household: (initial["target"] / capacity[household]).where(initial["slot_valid"]).to_numpy()
        for household, (initial, _) in gated.items()
    }, index=next(iter(gated.values()))[0]["ts_utc"].to_numpy()) if gated else pd.DataFrame()
    for household, (initial, days) in gated.items():
        others = normalised.drop(columns=household)
        fleet = others.median(axis=1, skipna=True).where(others.notna().sum(axis=1) >= settings["fleet_minimum_households"])
        frame = initial.copy()
        frame["fleet_index"] = fleet.to_numpy()
        daylight = frame["fleet_index"].gt(settings["daylight_index"])
        expected = capacity[household] * frame["fleet_index"]
        train = frame.loc[_in_split(frame, config, "train") & frame["eligible"] & daylight].copy()
        train["ratio"] = train["target"] / expected.loc[train.index]
        by_hour = train.groupby("local_hour")["ratio"].quantile([0.05, 0.5, 0.95]).unstack()
        counts = train.groupby("local_hour").size()
        by_hour = by_hour.loc[counts.reindex(by_hour.index).ge(config.raw["baseline"]["minimum_hour_temperature_samples"])]
        overall = train["ratio"].quantile([0.05, 0.5, 0.95])
        keep = _in_split(frame, config, "calibration") | _in_split(frame, config, "development")
        part = frame.loc[keep].reset_index(drop=True)
        part_daylight = part["fleet_index"].gt(settings["daylight_index"])
        for column, q in zip(QUANTILES, (0.05, 0.5, 0.95)):
            ratio = part["local_hour"].map(by_hour[q]) if len(by_hour) else pd.Series(np.nan, index=part.index)
            ratio = ratio.fillna(float(overall[q]))
            part[column] = (capacity[household] * part["fleet_index"] * ratio).where(part_daylight)
        part["prediction_status"] = np.where(part["fleet_index"].isna(), "fleet_missing",
                                             np.where(part_daylight, "ok", "night"))
        runs[household].slots, runs[household].calibration = _band(config, part)
        runs[household].days = _split_days(config, days, part["local_date"].unique())


def _scale_band(slots: pd.DataFrame, factor) -> None:
    for column in ("q05", "q50", "q95", "lower", "upper"):
        slots[column] = slots[column] * factor


def june_level(config: ProjectConfig, settings: dict, runs: dict[int, HouseholdRun]) -> None:
    """Bring each household's reference to its own June level.

    A model fitted in spring can sit above or below a device all summer (a refrigerator that
    was moved, a thermostat set once in May). June is the detector's reference month, so the
    reference and band are scaled by the median June ratio observed / reference; a July case
    then means "more than this device used in June under the same conditions".
    """
    for run in runs.values():
        if run.status != "scored" or run.slots is None or not run.calibration or run.calibration["status"] != "calibrated":
            continue
        table = daily_table(settings, run.slots, run.days, None)
        june = table.loc[table["split"].eq("calibration") & table["scored"]
                         & table["reference_unit_hours"].ge(settings["excess_reference_floor"])]
        if len(june) < config.raw["detector"]["june_minimum_days"]:
            continue
        factor = float((june["observed_unit_hours"] / june["reference_unit_hours"]).median())
        if not np.isfinite(factor) or factor <= 0:
            continue
        _scale_band(run.slots, factor)
        run.details["june_level_factor"] = round(factor, 3)


def peer_adjust(settings: dict, runs: dict[int, HouseholdRun]) -> None:
    """Scale each household's reference by the day's common shift of its neighbours.

    A hot July lifts every air conditioner above a reference fitted in spring; that shift is
    the weather and the season, not a fault. For each day the median relative deviation of the
    other households of the family (observed / reference - 1, scored days only) multiplies the
    household's reference and band. A household's own deviation never enters its own factor,
    and a validation scenario injected later into one household cannot move it either.
    """
    ready = {h: r for h, r in runs.items() if r.status == "scored" and r.slots is not None
             and r.calibration and r.calibration["status"] == "calibrated"}
    relative = {}
    for household, run in ready.items():
        table = daily_table(settings, run.slots, run.days, None)
        share = (table["observed_unit_hours"] / table["reference_unit_hours"] - 1).where(
            table["scored"] & table["reference_unit_hours"].ge(settings["excess_reference_floor"]))
        relative[household] = pd.Series(share.to_numpy(), index=table["local_date"])
    if len(relative) < 2:
        return
    shares = pd.DataFrame(relative)
    for household, run in ready.items():
        others = shares.drop(columns=household)
        common = others.median(axis=1, skipna=True).where(others.notna().sum(axis=1) >= settings.get("minimum_peers", 5))
        factor = (1 + common.fillna(0.0)).clip(lower=0.2)
        _scale_band(run.slots, run.slots["local_date"].map(factor).fillna(1.0).to_numpy())
        july = factor.loc[[d for d in factor.index if d >= "2018-07-01"]]
        run.details["peer_factor_median"] = {"june": round(float(factor.loc[[d for d in factor.index if d < "2018-07-01"]].median()), 3),
                                             "july": round(float(july.median()), 3) if len(july) else None}


# ── daily table and rules ────────────────────────────────────────────────────

def daily_table(settings: dict, slots: pd.DataFrame, days: pd.DataFrame, reference: dict | None) -> pd.DataFrame:
    table = household_daily_table(slots, days, settings["excess_reference_floor"])
    return add_z(table, reference) if reference is not None else table


def rules_view(table: pd.DataFrame, family: str) -> pd.DataFrame:
    """What the rules read: for solar a shortfall is the positive direction."""
    view = table.copy()
    if family == "solar":
        view["z"] = -view["z"]
        view["upper_exceedance_share"] = view["lower_shortfall_share"]
    return view


def detect(view: pd.DataFrame, thresholds: dict, max_gap: int) -> dict:
    acute = rules.acute_candidates(view, thresholds["acute"], max_gap)
    statistic = rules.cusum_series(view, thresholds["chronic"], max_gap)
    chronic = rules.chronic_candidates(view, statistic, thresholds["chronic"], max_gap)
    issues = rules.data_issue_candidates(view, thresholds["data_issue"])
    return {"acute": acute, "chronic": chronic, "issues": issues, "statistic": statistic,
            "cases": rules.merge_into_cases(acute, chronic, issues)}


def june_view(view: pd.DataFrame) -> pd.DataFrame:
    """June days in the place of the replay month, to count the cases the budget allows."""
    june = view.loc[view["split"].eq("calibration")].copy()
    june["split"] = "development"
    return june


def choose_thresholds(views: list[pd.DataFrame], detector: dict) -> dict:
    """The most sensitive grid point whose June cases fit the alarm budget, per detector."""
    budget = detector["alarm_budget_per_family_month"]
    grid = detector["grid"]
    max_gap = detector["max_gap_days"]
    june = [june_view(v) for v in views]

    acute_grid = sorted(itertools.product(grid["acute"]["z_threshold"], grid["acute"]["exceedance_share_threshold"],
                                          grid["acute"]["consecutive_days"]))
    acute_counts = []
    for z, share, days in acute_grid:
        settings = {"z_threshold": z, "exceedance_share_threshold": share, "consecutive_days": days}
        acute_counts.append((settings, sum(len(rules.acute_candidates(v, settings, max_gap)) for v in june)))
    chronic_grid = sorted(itertools.product(grid["chronic"]["h"], grid["chronic"]["k"]))
    chronic_counts = []
    for h, k in chronic_grid:
        settings = {"k": k, "h": h, "positive_days": grid["chronic"]["positive_days"], "window_days": grid["chronic"]["window_days"]}
        count = 0
        for v in june:
            statistic = rules.cusum_series(v, settings, max_gap)
            count += len(rules.chronic_candidates(v, statistic, settings, max_gap))
        chronic_counts.append((settings, count))

    def pick(counts: list, limit: int):
        inside = [(s, n) for s, n in counts if n <= limit]
        return (inside[0], True) if inside else (counts[-1], False)

    (acute, acute_june), acute_ok = pick(acute_counts, budget["acute"])
    (chronic, chronic_june), chronic_ok = pick(chronic_counts, budget["chronic"])
    return {"acute": acute, "chronic": chronic, "data_issue": detector["data_issue"],
            "june_cases": {"acute": acute_june, "chronic": chronic_june},
            "budget_met": acute_ok and chronic_ok}


def flag_days(table: pd.DataFrame, view: pd.DataFrame, found: dict, thresholds: dict) -> pd.DataFrame:
    """flagged and cusum columns for the evidence file (development days)."""
    table = table.copy()
    development = view.loc[view["split"].eq("development")]
    flagged = rules.acute_day_flags(development, thresholds["acute"])
    for candidate in found["chronic"]:
        inside = development["local_date"].between(candidate["onset"], candidate["last"])
        flagged |= inside & development["scored"].astype(bool) & development["z"].gt(0)
    table["flagged"] = False
    table.loc[flagged.index, "flagged"] = flagged.astype(bool)
    table["cusum"] = np.nan
    table.loc[found["statistic"].index, "cusum"] = found["statistic"]
    return table


def deviation_size(table: pd.DataFrame, case: dict) -> float | None:
    window = table.loc[table["split"].eq("development") & table["local_date"].between(case["onset"], case["last"])
                       & table["flagged"].astype(bool) & table["scored"].astype(bool)]
    if window.empty:
        return None
    return float(abs(window["observed_unit_hours"].sum() - window["reference_unit_hours"].sum()))


# ── the run ──────────────────────────────────────────────────────────────────

def _replay_window(config: ProjectConfig) -> dict:
    lo, hi = config.raw["splits_local_date"]["development"]
    return {"split": "development", "start_local_date": lo, "end_local_date": hi}


def _cases_for(run: HouseholdRun, table: pd.DataFrame, found: dict, family: str, minimum_effect: float = 0.0) -> list[dict]:
    """Detector candidates as cases. A deviation case also needs a meaningful effect against the
    model reference over its flagged days (minimum_effect_share), in the family's direction."""
    cases = []
    for case in found["cases"]:
        case = dict(case)
        if case["kind"] == "consumption_deviation":
            case["kind"] = DEVIATION_KIND[family]
            share = effect_share(table, case)
            sign = -1 if family == "solar" else 1
            if share is None or sign * share < minimum_effect:
                continue
        cases.append(case)
    return cases


def effect_share(table: pd.DataFrame, case: dict) -> float | None:
    window = table.loc[table["split"].eq("development") & table["local_date"].between(case["onset"], case["last"])
                       & table["flagged"].astype(bool) & table["scored"].astype(bool)]
    reference = window["reference_unit_hours"].sum()
    return float(window["observed_unit_hours"].sum() / reference - 1) if reference > 0 else None


def run_detection(config: ProjectConfig, data_dir: Path, run_id: str) -> tuple[dict, list[dict], dict]:
    detector = config.raw["detector"]
    families = detector["families"]
    paths = require_files(data_dir, {key: config.files[key] for key in ("electric_15m", "weather")})
    channels = sorted({c for s in families.values() for c in [s["channel"], *s["exclude_if_observed"]]})
    rows = load_rows(config, paths["electric_15m"], channels)
    _, weather = weather_frame(paths["weather"], config)
    ids = config.columns["household_id"]
    replay = _replay_window(config)
    max_gap = detector["max_gap_days"]

    family_runs: dict[str, dict[int, HouseholdRun]] = {}
    for family, settings in families.items():
        runs: dict[int, HouseholdRun] = {}
        frames = {}
        for household, group in rows.groupby(ids, sort=True):
            household = int(household)
            run = HouseholdRun(household, family)
            frame, reason = _prepared(config, settings, household, group, weather)
            if frame is None:
                run.status, run.reason = "not_replayed", reason
            elif settings["model"] == "temperature_hour":
                temperature_hour_run(config, settings, run, frame)
            else:
                frames[household] = frame
            runs[household] = run
        if settings["model"] == "fleet_capacity":
            solar_runs(config, settings, frames, runs)
        if settings.get("june_level"):
            june_level(config, settings, runs)
        if settings.get("peer_adjustment"):
            peer_adjust(settings, runs)
        for run in runs.values():
            if run.status != "scored" or run.slots is None:
                continue
            if run.calibration["status"] != "calibrated":
                run.status, run.reason = "not_scored", "calibration_pending"
                continue
            table = daily_table(settings, run.slots, run.days, None)
            # A residual smaller than a few percent of the device's own daily use is not a signal;
            # the floor keeps a very steady June from turning tiny drifts into large z values.
            june = table.loc[table["split"].eq("calibration") & table["scored"]]
            floor = max(settings["scale_floor"],
                        settings.get("relative_scale_floor", 0.0) * float(june["reference_unit_hours"].median() or 0.0))
            run.reference = june_reference(table, detector["june_minimum_days"], floor)
            if run.reference is None:
                run.status, run.reason = "not_scored", "too_few_scored_june_days"
                continue
            run.table = add_z(table, run.reference)
        family_runs[family] = runs

    # Thresholds per family on June, frozen for July.
    thresholds = {}
    for family, runs in family_runs.items():
        views = [rules_view(r.table, family) for r in runs.values() if r.table is not None]
        thresholds[family] = choose_thresholds(views, detector)

    # July on the unmodified readings.
    observed_cases, tables = [], {}
    clean_days = 0
    for family, runs in family_runs.items():
        settings = families[family]
        for run in runs.values():
            if run.table is None:
                continue
            view = rules_view(run.table, family)
            found = detect(view, thresholds[family], max_gap)
            table = flag_days(run.table, view, found, thresholds[family])
            tables[(family, run.household)] = table
            development = table.loc[table["split"].eq("development")]
            clean_days += int(development["scored"].sum())
            for case in _cases_for(run, table, found, family, settings.get("minimum_effect_share", 0.0)):
                observed_cases.append({"family": family, "run": run, "case": case, "table": table,
                                       "slots": _development(config, run.slots),
                                       "origin": "observed", "synthetic": None})

    # Validation scenarios on copies of July readings of households without a case.
    synthetic_plan, evaluation, synthetic_cases = run_scenarios(config, family_runs, thresholds, observed_cases)
    scenario_details = evaluation.pop("details")
    evaluation["clean_household_days"] = clean_days
    evaluation["false_cases_on_clean_data"] = sum(1 for c in observed_cases if c["case"]["kind"] != "data_issue")

    # Files: rank, build, validate.
    all_cases = observed_cases + synthetic_cases
    entries = []
    for item in all_cases:
        cid = _case_id(item)
        entries.append({"case_id": cid, "kind": item["case"]["kind"], "item": item,
                        "excess_unit_hours": deviation_size(item["table"], item["case"]),
                        "flagged_days": int(item["table"].loc[item["table"]["split"].eq("development")
                                                              & item["table"]["local_date"].between(item["case"]["onset"], item["case"]["last"])
                                                              & item["table"]["flagged"].astype(bool)].shape[0])})
    ordered = rank_and_prioritize(entries)
    files = []
    for entry in ordered:
        item = entry["item"]
        settings = families[item["family"]]
        case_file = build_case(item["run"].household, item["case"], item["table"], item["slots"], item["origin"],
                               item["synthetic"], entry["rank"], entry["priority"], replay,
                               settings["excess_reference_floor"], item["family"])
        errors = validate_case(case_file, replay, config.timezone)
        if errors:
            raise ValueError(f"{case_file['case_id']}: {'; '.join(errors)}")
        files.append(case_file)

    family_rows = []
    for family, runs in family_runs.items():
        t = thresholds[family]
        provenance_text = (
            f"june-calibrated: most sensitive grid point inside the alarm budget "
            f"(≤{detector['alarm_budget_per_family_month']['acute']} acute, ≤{detector['alarm_budget_per_family_month']['chronic']} chronic per family-month); "
            f"acute z>{t['acute']['z_threshold']}, share>{t['acute']['exceedance_share_threshold']}, {t['acute']['consecutive_days']} days; "
            f"chronic k {t['chronic']['k']}, h {t['chronic']['h']}"
            + ("" if t["budget_met"] else "; budget not met on June, least sensitive grid point used")
        )
        family_rows.append({"family": family, "circuit": FAMILIES[family]["circuit"],
                            "households": sum(1 for r in runs.values() if r.table is not None),
                            "expected_from": families[family]["expected_from"],
                            "threshold_provenance": provenance_text})
    hvac = thresholds.get("hvac") or next(iter(thresholds.values()))
    households = sorted({r.household for runs in family_runs.values() for r in runs.values() if r.table is not None})
    index = {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fixture": False,
        "run": {
            "run_id": run_id,
            "source_run": f"silentwatt-ml detect · {config.dataset_id}",
            "dataset_id": config.dataset_id,
            "protocol_version": config.raw["p1"]["protocol_version"],
            "model": "B0",
            "replay_window": replay,
            "unit": "source_unit_unverified",
            "households": len(households),
            "families": family_rows,
            "detector": {"version": detector["version"], "acute": hvac["acute"], "chronic": hvac["chronic"],
                         "data_issue": hvac["data_issue"],
                         "threshold_provenance": "june-calibrated per family (see families)"},
            "synthetic_plan": synthetic_plan,
        },
        "evaluation": evaluation,
        "cases": [summary_of(f) for f in files],
    }
    report = {
        "run_id": run_id,
        "thresholds": thresholds,
        "scenario_details": scenario_details,
        "provenance": provenance(config, paths),
        "households": {family: {str(h): {"status": r.status, "reason": r.reason, "calibration": r.calibration,
                                         "june_reference": r.reference, **r.details}
                                for h, r in runs.items()} for family, runs in family_runs.items()},
        "limitations": [
            "Thresholds are chosen on June, the same days that set each household's z scale (in-sample).",
            "Observed July cases are not labelled faults; they count against the alarm budget.",
            "The solar reference follows the median neighbouring system, so a fault shared by most systems would hide.",
            "Physical units and device mapping remain unverified; values are source unit x hours.",
            "Validation scenarios are injected changes, not field-verified faults.",
        ],
    }
    return index, files, report


def _development(config: ProjectConfig, slots: pd.DataFrame) -> pd.DataFrame:
    return slots.loc[_in_split(slots, config, "development")]


def _case_id(item: dict) -> str:
    from silentwatt_ml.detection.evidence import case_id
    return case_id(item["run"].household, item["case"]["onset"], item["case"]["detectors"], item["origin"], item["family"])


# ── validation scenarios ─────────────────────────────────────────────────────

def run_scenarios(config: ProjectConfig, family_runs: dict, thresholds: dict,
                  observed_cases: list[dict]) -> tuple[dict, dict, list[dict]]:
    detector = config.raw["detector"]
    plan = detector["synthetic"]
    families = detector["families"]
    max_gap = detector["max_gap_days"]
    with_case = {(c["family"], c["run"].household) for c in observed_cases}
    by_scenario, written, used_ids, details = [], [], set(), []
    faults_caught_by_gate = 0
    injected_total = detected_total = 0

    for number, scenario in enumerate(plan["scenarios"]):
        family = scenario["family"]
        settings = families[family]
        pool = sorted(h for h, r in family_runs[family].items()
                      if r.table is not None and (family, h) not in with_case)
        # "all" injects into every household without a case; a number draws that many, with a
        # seed of its own per scenario so one scenario's draw never shifts another's.
        count = plan["households_per_scenario"]
        chosen = pool if count == "all" else random.Random(plan["seed"] + number).sample(pool, min(count, len(pool)))
        dates = scenario_dates(scenario)
        is_fault = scenario["scenario"] == "data_fault"
        expected_kind = "data_issue" if is_fault else DEVIATION_KIND[family]
        detected, delays, example = 0, [], None
        for household in chosen:
            run = family_runs[family][household]
            development = _development(config, run.slots).copy()
            development["split"] = "development"
            injected = inject(development, scenario, settings.get("running_threshold", 0.3))
            gate = run.temperature_range if settings["temperature_support"] else None
            requalified, days = requalify(injected, gate, config.timezone, config.raw["p1"]["daily_quality"])
            requalified["split"] = "development"
            june_slots = run.slots.loc[_in_split(run.slots, config, "calibration")].copy()
            june_slots["split"] = "calibration"
            june_days = run.days.loc[run.days["split"].eq("calibration")]
            slots = pd.concat([june_slots, requalified], ignore_index=True)
            all_days = pd.concat([june_days[days.columns], days], ignore_index=True)
            table = daily_table(settings, slots, all_days, run.reference)
            view = rules_view(table, family)
            found = detect(view, thresholds[family], max_gap)
            table = flag_days(table, view, found, thresholds[family])
            hit = None
            for case in _cases_for(run, table, found, family, settings.get("minimum_effect_share", 0.0)):
                if case["kind"] == expected_kind and case["onset"] <= dates[-1] and case["last"] >= dates[0]:
                    hit = case
                    break
            window = table.loc[table["split"].eq("development") & table["local_date"].isin(dates)]
            view_window = view.loc[window.index]
            details.append({"family": family, "scenario": scenario["scenario"], "fault_kind": scenario["fault_kind"],
                            "household": household, "detected": hit is not None,
                            "scored_days": int(window["scored"].astype(bool).sum()),
                            "z": [None if pd.isna(v) else round(float(v), 2) for v in view_window["z"]],
                            "share": [None if pd.isna(v) else round(float(v), 2) for v in view_window["upper_exceedance_share"]]})
            if is_fault and not window["scored"].astype(bool).any():
                faults_caught_by_gate += 1
            if hit is None:
                continue
            detected += 1
            delays.append((date.fromisoformat(hit["detected"]) - date.fromisoformat(dates[0])).days)
            item = {"family": family, "run": run, "case": hit, "table": table, "slots": requalified,
                    "origin": "synthetic",
                    "synthetic": {"scenario": scenario["scenario"], "fault_kind": scenario["fault_kind"],
                                  "severity": scenario["severity"], "duration_days": scenario["duration_days"],
                                  "start_local_date": scenario["start_local_date"], "seed": plan["seed"],
                                  "generator_version": plan["generator_version"]}}
            cid = _case_id(item)
            if example is None and cid not in used_ids:
                example = item
                used_ids.add(cid)
        if example is not None:
            written.append(example)
        injected_total += len(chosen)
        detected_total += detected
        by_scenario.append({"family": family, "scenario": scenario["scenario"], "fault_kind": scenario["fault_kind"],
                            "severity": scenario["severity"], "duration_days": scenario["duration_days"],
                            "injected": len(chosen), "detected": detected,
                            "median_delay_days": float(np.median(delays)) if delays else None})

    synthetic_plan = {"plan_id": f"{plan['generator_version']}-seed{plan['seed']}", "generator_version": plan["generator_version"],
                      "seed": plan["seed"],
                      "scenarios": [{k: s[k] for k in ("family", "scenario", "fault_kind", "severity", "duration_days")}
                                    for s in plan["scenarios"]]}
    evaluation = {"synthetic_cases": injected_total, "synthetic_detected": detected_total, "by_scenario": by_scenario,
                  "data_faults_caught_by_quality_gate": faults_caught_by_gate, "details": details}
    return synthetic_plan, evaluation, written


def write_run(directory: Path, index: dict, files: list[dict], report: dict) -> None:
    import json
    write_evidence(directory, index, files)
    (directory / "run-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False, default=str) + "\n",
                                                encoding="utf-8")
