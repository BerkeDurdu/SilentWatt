"""Markdown tables for a P1 development run, generated from the run's artifacts.

The numbers in the P1 reports and in PRD v2.0 come from this script, so no value is typed
by hand. It reads the run's report.json and, optionally, a P0 audit, and prints
Turkish-labelled Markdown to stdout. Only development and calibration results are read;
the test split is never touched.

Run from the repository root:

    .venv/bin/python docs/product/ekler/p1_report_tables.py \
        --run artifacts/p1-2026-10-06/development-run03 \
        --audit artifacts/p0-2026-10-06/final/data-audit.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

MODELS = ("B0", "B1")


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
    labels = {
        "all_households_calibrated": "Bütün haneler kalibre",
        "macro_pinball_improved": "B1 eşit hane pinball'ı B0'dan iyi",
        "coverage_in_exploratory_band": "B1 kalibre kapsaması %87–93 aralığında",
        "width_within_110pct_b0": "B1 bant genişliği ≤ 1,10 × B0",
    }
    lines = ["| Tarama koşulu | Sonuç |", "| --- | --- |"]
    for key, label in labels.items():
        lines.append(f"| {label} | {'evet' if screening[key] else 'hayır'} |")
    lines.append(f"| **Öneri** | **{report['comparison']['recommendation']}** |")
    return lines


def household_table(report: dict) -> list[str]:
    """Development results per household: daily-qualified slots, whole July."""
    records = {}
    for record in report["metrics"]:
        if (record["split"] == "development" and record["month"] == "all"
                and record["population"] == "daily_qualified"):
            records[(record["household_id"], record["model"])] = record
    training_days = {h["household_id"]: h["training_days"] for h in report["households"]}
    qhat = {(h["household_id"], name): h["calibration"][name]["qhat"]
            for h in report["households"] for name in MODELS}
    lines = ["| Hane | Uygun train günü | Değerlendirilen slot | Pinball B0 | Pinball B1 | "
             "Kalibre kapsama B0 | Üst aşım B0 | Çalışırken kapsama B0 | qhat B0 | qhat B1 |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for household in report["candidate_household_ids"]:
        b0 = records[(household, "B0")]
        b1 = records[(household, "B1")]
        lines.append(
            f"| {household} | {training_days[household]} | {turkish_integer(b0['scored_slots'])} | "
            f"{turkish_number(b0['mean_pinball'])} | {turkish_number(b1['mean_pinball'])} | "
            f"{turkish_percent(b0['calibrated_coverage'], 1)} | {turkish_percent(b0['upper_exceedance'], 1)} | "
            f"{turkish_percent(b0['running_calibrated_coverage'], 1)} | "
            f"{turkish_number(qhat[(household, 'B0')], 3)} | {turkish_number(qhat[(household, 'B1')], 3)} |")
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
    parser.add_argument("--run", required=True, help="P1 output directory with report.json")
    parser.add_argument("--audit", help="P0 data-audit.json for the cohort table")
    args = parser.parse_args()

    report = json.loads((Path(args.run) / "report.json").read_text())
    sections = [
        (f"Protokol {report['protocol']['protocol_version']}, "
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
        "### Hane bazında (Temmuz, günlük kapıdan geçen slotlar)",
        "",
        *household_table(report),
    ]
    if args.audit:
        audit = json.loads(Path(args.audit).read_text())
        sections += ["", "### Cohort", "", *cohort_table(audit)]
    print("\n".join(sections))


if __name__ == "__main__":
    main()
