"""Markdown tables for a P1 development run, generated from the run's artifacts.

The numbers in the P1 reports and in PRD v2.0 come from this script, so no value is typed
by hand. It reads the run's report.json and predictions.csv and, optionally, a P0 audit and
the report.json of a previous run to compare with, and prints Turkish-labelled Markdown to
stdout. Only calibration (June) and development (July) results are read; the test split is
never touched.

Run from the repository root:

    .venv/bin/python docs/product/ekler/p1_report_tables.py \
        --run artifacts/p1-v3-2026-10-06/development-run01 \
        --previous-run artifacts/p1-2026-10-06/development-run04 \
        --audit artifacts/p0-2026-10-06/final/data-audit.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

MODELS = ("B0", "B1")
SPLIT_NAMES = {"calibration": "Haziran", "development": "Temmuz"}
METHOD_NAMES = {"symmetric": "simetrik", "asymmetric": "asimetrik"}
# A descriptive count only, as in the Q-03 record (8 → 0 households); not a decision threshold.
HIGH_UPPER_EXCEEDANCE = 0.15
SCREENING_LABELS = {
    "all_households_calibrated": "Bütün haneler kalibre",
    "macro_pinball_improved": "B1 eşit hane pinball'ı B0'dan iyi",
    "coverage_in_exploratory_band": "B1 kalibre kapsaması %87–93 aralığında",
    "width_within_110pct_b0": "B1 bant genişliği ≤ 1,10 × B0",
}


def turkish_number(value: float | None, digits: int = 4) -> str:
    """Decimal comma and dot thousands separator; a missing value shows as a dash."""
    if value is None:
        return "—"
    text = f"{value:,.{digits}f}"
    return text.replace(",", "_").replace(".", ",").replace("_", ".")


def turkish_percent(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "—"
    return "%" + turkish_number(100 * value, digits)


def turkish_integer(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def calibration_method(report: dict) -> str:
    """Calibration method of a run. Reports before p1-v3 have no method field: they were symmetric."""
    return report["protocol"]["calibration"].get("method", "symmetric")


def run_label(report: dict) -> str:
    """Short run name for column headers, for example 'p1-v3 (asimetrik)'."""
    method = calibration_method(report)
    return f"{report['protocol']['protocol_version']} ({METHOD_NAMES[method]})"


def side_corrections(profile: dict) -> tuple[float | None, float | None]:
    """qhat of the lower and of the upper side of one calibration profile.

    Reports before p1-v3 record one symmetric qhat, which widens both sides.
    """
    if "qhat_lower" in profile:
        return profile["qhat_lower"], profile["qhat_upper"]
    return profile["qhat"], profile["qhat"]


def household_records(report: dict, model: str, split: str) -> list[dict]:
    """Whole-split metric records of one model, one per household, on daily-qualified slots."""
    selected = []
    for record in report["metrics"]:
        if (record["model"] == model and record["split"] == split
                and record["month"] == "all" and record["population"] == "daily_qualified"):
            selected.append(record)
    return selected


def slot_weighted_mean(records: list[dict], metric_name: str, slot_count_name: str) -> float | None:
    """Household values weighted by their slot counts: the share over all their slots together."""
    total_slots = 0
    weighted_sum = 0.0
    for record in records:
        slots = record[slot_count_name]
        if slots:
            total_slots += slots
            weighted_sum += record[metric_name] * slots
    if total_slots == 0:
        return None
    return weighted_sum / total_slots


def pooled_from_households(report: dict, model: str, split: str) -> dict:
    """Slot-pooled metrics of one model and split, rebuilt from the household records.

    report.json keeps a pooled record for development only. Each household record holds a
    share and the number of slots behind it, so the slot-weighted mean of the household
    shares is the share over the slots of all households together.
    """
    records = household_records(report, model, split)
    return {
        "calibrated_slots": sum(record["calibrated_slots"] for record in records),
        "running_slots": sum(record["running_slots"] for record in records),
        "raw_coverage": slot_weighted_mean(records, "raw_coverage", "scored_slots"),
        "calibrated_coverage": slot_weighted_mean(records, "calibrated_coverage", "calibrated_slots"),
        "calibrated_width": slot_weighted_mean(records, "calibrated_width", "calibrated_slots"),
        "upper_exceedance": slot_weighted_mean(records, "upper_exceedance", "calibrated_slots"),
        "lower_exceedance": slot_weighted_mean(records, "lower_exceedance", "calibrated_slots"),
        "running_calibrated_coverage": slot_weighted_mean(records, "running_calibrated_coverage", "running_slots"),
    }


def households_with_high_upper_exceedance(report: dict, model: str) -> int:
    """Households whose July upper exceedance is above HIGH_UPPER_EXCEEDANCE (a descriptive count)."""
    count = 0
    for record in household_records(report, model, "development"):
        share = record["upper_exceedance"]
        if share is not None and share > HIGH_UPPER_EXCEEDANCE:
            count += 1
    return count


def raw_q95_exceedance(run_directory: Path) -> dict:
    """Share of daily-qualified slots above the raw (uncalibrated) q95, per model and split.

    This is the season-drift signal of open question Q-19: calibration only moves the
    bounds, the raw quantiles come from training alone. report.json has no such record, so
    this reads predictions.csv with round-trip float parsing: pandas' default parser can
    move a value by one unit in the last place and flip an exact comparison.
    """
    columns = ["model", "split", "eligible", "target", "q95"]
    predictions = pd.read_csv(run_directory / "predictions.csv", usecols=columns,
                              float_precision="round_trip")
    shares = {}
    for (model, split), slots in predictions.groupby(["model", "split"]):
        daily_qualified = slots.loc[slots["eligible"]]
        above_raw_q95 = daily_qualified["target"] > daily_qualified["q95"]
        shares[(model, split)] = float(above_raw_q95.mean())
    return shares


def pooled_table(report: dict) -> list[str]:
    """Pooled development metrics of both models on the same daily-qualified slots."""
    models = report["comparison"]["models"]
    pooled = {name: models[name]["pooled"] for name in MODELS}
    rows = [
        ("Değerlendirilen slot / beklenen",
         lambda name: f"{turkish_integer(pooled[name]['scored_slots'])} / {turkish_integer(pooled[name]['expected_slots'])}"),
        ("Değerlendirilen pay", lambda name: turkish_percent(pooled[name]["scored_fraction"], 1)),
        ("Ortalama pinball (havuz)", lambda name: turkish_number(pooled[name]["mean_pinball"])),
        ("Ortalama pinball (eşit hane)", lambda name: turkish_number(models[name]["macro_mean_pinball"])),
        ("MAE (q50)", lambda name: turkish_number(pooled[name]["mae"])),
        ("Ham q05–q95 kapsaması", lambda name: turkish_percent(pooled[name]["raw_coverage"])),
        ("Kalibre kapsama (iki taraflı)", lambda name: turkish_percent(pooled[name]["calibrated_coverage"])),
        ("Kalibre bant genişliği", lambda name: turkish_number(pooled[name]["calibrated_width"])),
        ("Üst sınır aşımı (hedef ≈ %5)", lambda name: turkish_percent(pooled[name]["upper_exceedance"])),
        ("Alt sınır aşımı", lambda name: turkish_percent(pooled[name]["lower_exceedance"])),
        ("Klima çalışırken kapsama",
         lambda name: f"{turkish_percent(pooled[name]['running_calibrated_coverage'])} "
                      f"(n = {turkish_integer(pooled[name]['running_slots'])})"),
        ("Tam kalibre hane", lambda name: str(models[name]["households_fully_calibrated"])),
    ]
    lines = ["| Metrik | B0 | B1 |", "| --- | ---: | ---: |"]
    for label, cell in rows:
        lines.append(f"| {label} | {cell('B0')} | {cell('B1')} |")
    return lines


def screening_table(report: dict) -> list[str]:
    screening = report["comparison"]["screening"]
    lines = ["| Tarama koşulu | Sonuç |", "| --- | --- |"]
    for key, label in SCREENING_LABELS.items():
        lines.append(f"| {label} | {'evet' if screening[key] else 'hayır'} |")
    lines.append(f"| **Öneri** | **{report['comparison']['recommendation']}** |")
    return lines


def june_diagnostic_table(report: dict) -> list[str]:
    """Pooled calibration-split (June) metrics: an in-sample diagnostic, not an evaluation.

    The bands were fitted on these very slots. Under the asymmetric method each side
    therefore stays below alpha / 2 here by construction; July is the evaluation.
    """
    pooled = {name: pooled_from_households(report, name, "calibration") for name in MODELS}
    rows = [
        ("Kalibre slot", lambda name: turkish_integer(pooled[name]["calibrated_slots"])),
        ("Ham q05–q95 kapsaması", lambda name: turkish_percent(pooled[name]["raw_coverage"])),
        ("Kalibre kapsama (iki taraflı)", lambda name: turkish_percent(pooled[name]["calibrated_coverage"])),
        ("Kalibre bant genişliği", lambda name: turkish_number(pooled[name]["calibrated_width"])),
        ("Üst sınır aşımı", lambda name: turkish_percent(pooled[name]["upper_exceedance"])),
        ("Alt sınır aşımı", lambda name: turkish_percent(pooled[name]["lower_exceedance"])),
        ("Klima çalışırken kapsama",
         lambda name: f"{turkish_percent(pooled[name]['running_calibrated_coverage'])} "
                      f"(n = {turkish_integer(pooled[name]['running_slots'])})"),
    ]
    lines = ["| Metrik | B0 | B1 |", "| --- | ---: | ---: |"]
    for label, cell in rows:
        lines.append(f"| {label} | {cell('B0')} | {cell('B1')} |")
    return lines


def raw_q95_table(shares: dict) -> list[str]:
    """Raw q95 exceedance per month and model (see raw_q95_exceedance)."""
    lines = ["| Dönem | B0 | B1 |", "| --- | ---: | ---: |"]
    for split, month_name in SPLIT_NAMES.items():
        lines.append(f"| {month_name} | {turkish_percent(shares[('B0', split)])} | "
                     f"{turkish_percent(shares[('B1', split)])} |")
    return lines


def household_table(report: dict) -> list[str]:
    """Development results per household: daily-qualified slots, whole July."""
    records = {}
    for record in report["metrics"]:
        if (record["split"] == "development" and record["month"] == "all"
                and record["population"] == "daily_qualified"):
            records[(record["household_id"], record["model"])] = record
    training_days = {}
    corrections = {}
    for household_record in report["households"]:
        household = household_record["household_id"]
        training_days[household] = household_record["training_days"]
        for name in MODELS:
            corrections[(household, name)] = side_corrections(household_record["calibration"][name])
    lines = ["| Hane | Uygun train günü | Değerlendirilen slot | Pinball B0 | Pinball B1 | "
             "Kalibre kapsama B0 | Üst aşım B0 | Çalışırken kapsama B0 | qhat B0 alt / üst | qhat B1 alt / üst |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for household in report["candidate_household_ids"]:
        b0 = records[(household, "B0")]
        b1 = records[(household, "B1")]
        b0_qhat_lower, b0_qhat_upper = corrections[(household, "B0")]
        b1_qhat_lower, b1_qhat_upper = corrections[(household, "B1")]
        lines.append(
            f"| {household} | {training_days[household]} | {turkish_integer(b0['scored_slots'])} | "
            f"{turkish_number(b0['mean_pinball'])} | {turkish_number(b1['mean_pinball'])} | "
            f"{turkish_percent(b0['calibrated_coverage'], 1)} | {turkish_percent(b0['upper_exceedance'], 1)} | "
            f"{turkish_percent(b0['running_calibrated_coverage'], 1)} | "
            f"{turkish_number(b0_qhat_lower, 3)} / {turkish_number(b0_qhat_upper, 3)} | "
            f"{turkish_number(b1_qhat_lower, 3)} / {turkish_number(b1_qhat_upper, 3)} |")
    return lines


def previous_run_table(previous: dict, current: dict) -> list[str]:
    """June and July band metrics of a previous run next to this run, for both models.

    June is in-sample (the calibration data itself); July is the development comparison.
    The equal-household pinball comes from the raw quantiles, which calibration never changes.
    """
    reports = {"previous": previous, "current": current}
    june = {}
    july = {}
    pinball = {}
    high_upper_households = {}
    for run, report in reports.items():
        for name in MODELS:
            key = (run, name)
            june[key] = pooled_from_households(report, name, "calibration")
            july[key] = report["comparison"]["models"][name]["pooled"]
            pinball[key] = report["comparison"]["models"][name]["macro_mean_pinball"]
            high_upper_households[key] = households_with_high_upper_exceedance(report, name)
    rows = [
        ("Haziran üst sınır aşımı (örneklem içi)", lambda key: turkish_percent(june[key]["upper_exceedance"])),
        ("Haziran alt sınır aşımı (örneklem içi)", lambda key: turkish_percent(june[key]["lower_exceedance"])),
        ("Haziran kalibre kapsama (örneklem içi)", lambda key: turkish_percent(june[key]["calibrated_coverage"])),
        ("Temmuz üst sınır aşımı (hedef ≈ %5)", lambda key: turkish_percent(july[key]["upper_exceedance"])),
        ("Temmuz alt sınır aşımı", lambda key: turkish_percent(july[key]["lower_exceedance"])),
        ("Temmuz kalibre kapsama (iki taraflı)", lambda key: turkish_percent(july[key]["calibrated_coverage"])),
        ("Temmuz klima çalışırken kapsama", lambda key: turkish_percent(july[key]["running_calibrated_coverage"])),
        ("Temmuz kalibre bant genişliği", lambda key: turkish_number(july[key]["calibrated_width"])),
        ("Temmuz ortalama pinball (eşit hane)", lambda key: turkish_number(pinball[key])),
        (f"Temmuz üst sınır aşımı {turkish_percent(HIGH_UPPER_EXCEEDANCE, 0)}'in üstünde olan hane",
         lambda key: str(high_upper_households[key])),
    ]
    previous_label = run_label(previous)
    current_label = run_label(current)
    lines = [f"| Metrik | B0 {previous_label} | B0 {current_label} | B1 {previous_label} | B1 {current_label} |",
             "| --- | ---: | ---: | ---: | ---: |"]
    for label, cell in rows:
        lines.append(f"| {label} | {cell(('previous', 'B0'))} | {cell(('current', 'B0'))} | "
                     f"{cell(('previous', 'B1'))} | {cell(('current', 'B1'))} |")
    return lines


def screening_comparison_table(previous: dict, current: dict) -> list[str]:
    """Screening conditions and recommendation of a previous run next to this run."""
    lines = [f"| Tarama koşulu | {run_label(previous)} | {run_label(current)} |", "| --- | --- | --- |"]
    for key, label in SCREENING_LABELS.items():
        previous_result = "evet" if previous["comparison"]["screening"][key] else "hayır"
        current_result = "evet" if current["comparison"]["screening"][key] else "hayır"
        lines.append(f"| {label} | {previous_result} | {current_result} |")
    lines.append(f"| **Öneri** | **{previous['comparison']['recommendation']}** | "
                 f"**{current['comparison']['recommendation']}** |")
    return lines


def cohort_table(audit: dict) -> list[str]:
    rule = audit["cohort_rule"]
    excluded = [h for h in audit["households"] if not h["candidate"]]
    lines = [
        f"Kural: yalnız train, geçerli hedef kapsamı ≥ {turkish_percent(rule['minimum_valid_target_coverage'], 0)}, "
        f"ölü bant ±{turkish_number(rule['target_dead_band'], 2)}, ek soğutma kanalı "
        f"({', '.join(rule['exclude_if_observed'])}) yok.",
        "",
        f"Aday: {len(audit['candidate_household_ids'])} hane — "
        f"{', '.join(str(h) for h in audit['candidate_household_ids'])}.",
        "",
        "| Dışarıda kalan hane | Train kapsaması | Neden |",
        "| --- | ---: | --- |",
    ]
    for household in excluded:
        lines.append(f"| {household['household_id']} | "
                     f"{turkish_percent(household['training_valid_target_coverage'], 1)} | "
                     f"{', '.join(household['exclusion_reasons'])} |")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Markdown tables for a P1 development run.")
    parser.add_argument("--run", required=True, help="P1 output directory with report.json and predictions.csv")
    parser.add_argument("--previous-run", help="An earlier P1 output directory to compare with")
    parser.add_argument("--audit", help="P0 data-audit.json for the cohort table")
    args = parser.parse_args()

    run_directory = Path(args.run)
    report = json.loads((run_directory / "report.json").read_text())
    method = calibration_method(report)
    sections = [
        (f"Protokol {report['protocol']['protocol_version']}, "
         f"kalibrasyon {METHOD_NAMES[method]}, "
         f"ölü bant {turkish_number(report['provenance']['config']['target_dead_band'], 2)}, "
         f"çalışma eşiği {turkish_number(report['protocol']['evaluation']['running_threshold'], 1)}; "
         f"kaynak: `{args.run}`"),
        "",
        "### Havuzlanmış development metrikleri",
        "",
        *pooled_table(report),
        "",
        "### Tarama ve öneri",
        "",
        *screening_table(report),
        "",
        "### Haziran (kalibrasyon): örneklem içi tanı, değerlendirme değil",
        "",
        *june_diagnostic_table(report),
        "",
        "### Ham q95 aşımı (kalibrasyondan önce; mevsim kayması, Q-19)",
        "",
        *raw_q95_table(raw_q95_exceedance(run_directory)),
        "",
        "### Hane bazında (Temmuz, günlük kapıdan geçen slotlar)",
        "",
        *household_table(report),
    ]
    if args.previous_run:
        previous = json.loads((Path(args.previous_run) / "report.json").read_text())
        sections += [
            "",
            f"### Önceki koşuyla karşılaştırma: {run_label(previous)} → {run_label(report)}",
            "",
            f"Önceki koşu: `{args.previous_run}`",
            "",
            *previous_run_table(previous, report),
            "",
            *screening_comparison_table(previous, report),
        ]
    if args.audit:
        audit = json.loads(Path(args.audit).read_text())
        sections += ["", "### Cohort", "", *cohort_table(audit)]
    print("\n".join(sections))


if __name__ == "__main__":
    main()
