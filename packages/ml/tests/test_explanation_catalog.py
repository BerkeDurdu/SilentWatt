"""Explanation catalog exp-0.1 (Q-15): Turkish and English texts for evidence contract v0.1.

The catalog shared/explanation-catalog.json is content owned by Role C (Data & AI). The server
code that turns evidence into an explanation (explainCase in server/explain/index.ts) belongs to
the backend owner, who may adapt the format. These tests check the content only:

- every reason code, recommendation code, case kind and origin of the contract has texts in
  Turkish and English,
- placeholders name evidence fields, and static text carries no number of its own,
- the made-up fixture cases (households 90001-90004) render without an unresolved placeholder,
- no forbidden wording appears (unit claims, fault claims, fault probabilities, savings, money),
- synthetic cases carry the synthetic label, and every explanation follows the catalog's
  assembly order and ends with the approved human-decision note (contract rule 6).

The small renderer in this file exists only to test the content; it is not a second server
implementation. No real measurement and no real household id is used here.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from silentwatt_ml.detection.evidence import LIBRARY_VERSION, REASON_CODES, RECOMMENDATION_BY_KIND, SCHEMA_VERSION

REPOSITORY = Path(__file__).resolve().parents[3]
CATALOG_PATH = REPOSITORY / "shared" / "explanation-catalog.json"
EVIDENCE_TYPES_PATH = REPOSITORY / "shared" / "evidence.ts"
EVIDENCE_CONTRACT_PATH = REPOSITORY / "docs" / "architecture" / "evidence-contract.md"
FIXTURE_CASES_DIRECTORY = REPOSITORY / "shared" / "fixtures" / "evidence" / "cases"

CATALOG_VERSION = "exp-0.1"
LANGUAGES = ("tr", "en")
# {household_id}, {synthetic.start_local_date} or {value}
PLACEHOLDER_PATTERN = re.compile(r"\{([a-z_]+(?:\.[a-z_]+)?)\}")
# The channel name is the only digit allowed in static text: every other number in an
# explanation must come from the evidence through a placeholder.
CHANNEL_NAME = "air1"
# Marks an evidence path that does not exist, e.g. synthetic details of an observed case.
MISSING = object()
# The parts of the server's Explanation shape (server/explain/index.ts) that carry text, by the
# names the catalog's assembly uses.
EXPLANATION_PARTS = ("summary", "reasons", "recommendation.firstCheck", "recommendation.steps",
                     "limitations", "humanDecisionNote")
# Contract rule 6: every explanation ends with this sentence. The wording is approved, so a
# change must be deliberate and shows up here.
APPROVED_HUMAN_DECISION_NOTES = {
    "tr": "Bu bir inceleme önerisidir; karar ekibindir.",
    "en": "This is an inspection recommendation; the decision rests with the team.",
}
# Contract rules 1 and 2 and the MVP wording rules, one category each.
FORBIDDEN_TERM_CATEGORIES = ("unit", "fault", "probability", "savings", "money")
# Phrases that must be caught, by language and category. Each phrase holds wording of one
# category only, so it tests that category's terms on their own.
FORBIDDEN_SAMPLES = {
    "tr": {
        "unit": ["15 kWh", "3 kW", "toplam 2 kilovatsaat", "1200 watt"],
        "fault": ["Arıza doğrulandı", "ARIZA DOĞRULANDI", "kesin arıza", "cihaz arızalı"],
        "probability": ["%90 olasılıkla", "olası bir sorun", "muhtemelen", "ihtimali yüksek"],
        "savings": ["tasarruf sağlar", "tasarrufu artar"],
        "money": ["120 TL", "₺120", "US$40", "40 USD", "30 EUR", "5 lira", "10 dolar",
                  "maliyeti düşer", "faturaya yansır", "ücreti"],
    },
    "en": {
        "unit": ["15 kWh", "3 kW", "1200 watts", "2 kilowatt-hours"],
        "fault": ["Fault confirmed", "a faulty unit"],
        "probability": ["a 90% probability", "probably", "a probable cause", "the likelihood", "likely",
                        "unlikely", "a good chance"],
        "savings": ["savings", "it saves energy"],
        "money": ["$40", "US$40", "40 USD", "30 EUR", "40 dollars", "money", "lower cost", "the bill",
                  "the price"],
    },
}


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def load_fixture_cases() -> list[dict]:
    paths = sorted(FIXTURE_CASES_DIRECTORY.glob("*.json"))
    return [json.loads(path.read_text(encoding="utf-8")) for path in paths]


def made_up_case(kind: str, origin: str) -> dict:
    """A small evidence case built here with made-up values; only the fields the texts read.

    Exact expectations use these cases instead of the committed fixtures, so they do not move
    when the fixture generator changes. Household 90010 lies in the made-up range of the
    fixtures (from 90001); no value is a measurement. The numbers are chosen so that every
    format shows: a statistic and shares with two decimals, a count and a signed share.
    """
    if kind == "consumption_deviation":
        detector_suffix = "ACU"
        scenario, fault_kind, severity = "step_increase", None, 0.25
        reasons = [
            {"code": "DAILY_EXCESS_Z", "value": 2.75},
            {"code": "UPPER_BOUND_EXCEEDANCE", "value": 0.3125},
            {"code": "CONSECUTIVE_FLAGGED_DAYS", "value": 4},
            {"code": "EXCESS_OVER_REFERENCE", "value": 0.2264},
        ]
    else:
        detector_suffix = "DQ"
        scenario, fault_kind, severity = "data_fault", "freeze", None
        reasons = [
            {"code": "MISSING_READINGS", "value": 0.4375},
            {"code": "FROZEN_READINGS", "value": 48},
        ]

    case_id_prefix = "SW-HVAC"
    synthetic = None
    if origin == "synthetic":
        case_id_prefix = "SW-SYN-HVAC"
        synthetic = {"scenario": scenario, "fault_kind": fault_kind, "severity": severity,
                     "duration_days": 7, "start_local_date": "2018-07-08", "seed": 1,
                     "generator_version": "test"}

    # Four flagged days from 9 to 12 July; the rule is met on the second day.
    return {
        "case_id": f"{case_id_prefix}-90010-20180709-{detector_suffix}",
        "origin": origin,
        "household_id": 90010,
        "kind": kind,
        "onset_local_date": "2018-07-09",
        "detected_local_date": "2018-07-10",
        "last_local_date": "2018-07-12",
        "flagged_days": 4,
        "recommendation_code": RECOMMENDATION_BY_KIND[kind],
        "synthetic": synthetic,
        "reasons": reasons,
    }


# --- The contract, read from shared/evidence.ts ------------------------------------------

def typescript_union_members(type_name: str) -> set[str]:
    """Members of a string union type in shared/evidence.ts, e.g. ReasonCode."""
    source = EVIDENCE_TYPES_PATH.read_text(encoding="utf-8")
    declaration = re.search(rf"export type {type_name} =([^;]+);", source)
    if declaration is None:
        raise AssertionError(f"type {type_name} not found in {EVIDENCE_TYPES_PATH}")
    return set(re.findall(r"'(\w+)'", declaration.group(1)))


def typescript_interface_fields(interface_name: str) -> set[str]:
    """Field names of an interface in shared/evidence.ts; comment lines are skipped."""
    source = EVIDENCE_TYPES_PATH.read_text(encoding="utf-8")
    declaration = re.search(rf"export interface {interface_name}\b[^{{]*\{{(.*?)\n\}}", source, re.DOTALL)
    if declaration is None:
        raise AssertionError(f"interface {interface_name} not found in {EVIDENCE_TYPES_PATH}")
    fields = set()
    for line in declaration.group(1).splitlines():
        field = re.match(r"\s+(\w+)\??:", line)
        if field is not None:
            fields.add(field.group(1))
    return fields


def contract_first_check(code: str) -> str:
    """The first check of a recommendation code, from the code list in evidence-contract.md."""
    source = EVIDENCE_CONTRACT_PATH.read_text(encoding="utf-8")
    row = re.search(rf"^\| `{code}` \| (.+?) \|\s*$", source, re.MULTILINE)
    if row is None:
        raise AssertionError(f"recommendation code {code} not found in {EVIDENCE_CONTRACT_PATH}")
    return row.group(1).strip()


# --- Forbidden wording -------------------------------------------------------------------

def fold_for_matching(text: str) -> str:
    """Lower case with the two Turkish i letters folded together.

    A plain lower() turns "ARIZA" into "ariza", which would slip past the term "arıza", and
    turns "İ" into "i" plus a combining dot. Folding ı and i into one letter lets upper-case
    Turkish text be checked exactly like lower-case text.
    """
    lowered = text.lower().replace("̇", "")
    return lowered.replace("ı", "i")


def is_sign(term: str) -> bool:
    """True for a term without letters or digits, such as "$" or "₺"."""
    for character in term:
        if character.isalnum():
            return False
    return True


def forbidden_terms_in(text: str, terms: list[str]) -> list[str]:
    """The terms that occur in text.

    A word term must start a word (not directly after a letter) and may continue into a
    longer word: "tasarruf" also catches "tasarrufu", "kW" catches "kWh" and "5kW", while the
    "kw" inside "backward" is not a match. A sign term such as "$" or "₺" matches anywhere,
    so "US$40" is caught as well.
    """
    folded_text = fold_for_matching(text)
    not_after_a_letter = r"(?<![^\W\d_])"
    found = []
    for term in terms:
        folded_term = fold_for_matching(term)
        if is_sign(folded_term):
            occurs = folded_term in folded_text
        else:
            occurs = re.search(not_after_a_letter + re.escape(folded_term), folded_text) is not None
        if occurs:
            found.append(term)
    return found


def all_forbidden_terms(catalog: dict) -> list[str]:
    """The terms of every category in both languages, each once.

    A Turkish text must not carry English unit words either, so every text is checked against
    the terms of both languages.
    """
    terms = []
    for language_code in LANGUAGES:
        for category_terms in catalog["languages"][language_code]["forbidden_terms"].values():
            for term in category_terms:
                if term not in terms:
                    terms.append(term)
    return terms


# --- Formatting rules of the catalog ------------------------------------------------------

def format_number(number: float, max_decimals: int, decimal_separator: str) -> str:
    """At most max_decimals decimals, trailing zeros removed: 3.20 -> "3.2", 41.00 -> "41"."""
    text = f"{number:.{max_decimals}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    if text == "-0":
        text = "0"
    return text.replace(".", decimal_separator)


def format_share(share: float, formatting: dict, signed: bool) -> str:
    """A share of 1 as a percentage: 0.41 -> "%41" (tr) or "41%" (en); signed adds + or -."""
    # Round first: 0.58 * 100 is 57.99999999999999 in floating point.
    percent = round(share * 100, 2)
    digits = format_number(abs(percent), 2, formatting["decimal_separator"])
    if formatting["percent_sign_position"] == "before":
        text = "%" + digits
    else:
        text = digits + "%"
    if percent < 0:
        return "-" + text
    if signed and percent > 0:
        return "+" + text
    return text


def format_date(local_date: str, formatting: dict) -> str:
    """2018-07-07 -> "7 Temmuz 2018" (tr) or "7 July 2018" (en)."""
    year, month, day = local_date.split("-")
    month_name = formatting["month_names"][int(month) - 1]
    return f"{int(day)} {month_name} {year}"


def format_value(value, value_format: str, formatting: dict) -> str:
    """One evidence value as text. Null is written as the null text, never as 0."""
    if value is None:
        return formatting["null_text"]
    if value_format in ("identifier", "count"):
        return str(int(value))
    if value_format == "statistic":
        return format_number(value, 2, formatting["decimal_separator"])
    if value_format == "share":
        return format_share(value, formatting, signed=False)
    if value_format == "signed_share":
        return format_share(value, formatting, signed=True)
    if value_format == "date":
        return format_date(value, formatting)
    raise ValueError(f"unknown value format {value_format!r}")


# --- Rendering (test helper only) --------------------------------------------------------

def evidence_field(case: dict, source: str):
    """The value at a source path such as "case.synthetic.start_local_date", or MISSING."""
    value = case
    for step in source.split(".")[1:]:
        if not isinstance(value, dict) or step not in value:
            return MISSING
        value = value[step]
    return value


def fill(template: str, values: dict[str, str]) -> str:
    """Replace the known placeholders; an unknown one stays visible so a test can find it."""
    def replacement(match: re.Match) -> str:
        return values.get(match.group(1), match.group(0))
    return PLACEHOLDER_PATTERN.sub(replacement, template)


def case_placeholder_values(case: dict, catalog: dict, formatting: dict) -> dict[str, str]:
    """Formatted values of every case placeholder that exists in this case."""
    values = {}
    for name, placeholder in catalog["placeholders"].items():
        if not placeholder["source"].startswith("case."):
            continue  # {value} belongs to one reason and is filled per reason
        raw_value = evidence_field(case, placeholder["source"])
        if raw_value is MISSING:
            continue
        values[name] = format_value(raw_value, placeholder["format"], formatting)
    return values


def render_explanation(case: dict, catalog: dict, language_code: str) -> dict:
    """The text parts of the server's Explanation shape, filled from one evidence case.

    The keys are the names the catalog's assembly uses (EXPLANATION_PARTS).
    """
    language = catalog["languages"][language_code]
    formatting = language["formatting"]
    values = case_placeholder_values(case, catalog, formatting)

    summary = fill(language["summary"][case["kind"]][case["origin"]], values)

    # One sentence per evidence reason, in the order of the evidence.
    reasons = []
    for reason in case["reasons"]:
        value_format = catalog["reason_value_formats"][reason["code"]]
        reason_value = format_value(reason["value"], value_format, formatting)
        reasons.append(fill(language["reasons"][reason["code"]], {"value": reason_value}))

    recommendation = language["recommendations"][case["recommendation_code"]]

    # Standard limitations first, then those of the case kind, then the synthetic ones.
    limitations = list(language["limitations"]["always"])
    limitations += language["limitations"][case["kind"]]
    if case["origin"] == "synthetic":
        limitations += language["limitations"]["synthetic"]

    return {
        "summary": summary,
        "reasons": reasons,
        "recommendation.firstCheck": recommendation["first_check"],
        "recommendation.steps": list(recommendation["steps"]),
        "limitations": limitations,
        "humanDecisionNote": language["human_decision_note"],
    }


def explanation_text(explanation: dict, catalog: dict) -> str:
    """All parts in the order of the catalog's assembly, one text per line.

    The order is read from the catalog, not written here, so the tests check the order the
    server is told to use.
    """
    lines = []
    for step in catalog["assembly"]:
        part = explanation[step["field"]]
        if isinstance(part, list):
            lines += part
        else:
            lines.append(part)
    return "\n".join(lines)


def language_texts(language: dict) -> list[tuple[str, str]]:
    """Every user-visible text of one language with its location, e.g. "reasons.DAILY_EXCESS_Z"."""
    texts = [("labels.synthetic", language["labels"]["synthetic"]),
             ("formatting.null_text", language["formatting"]["null_text"]),
             ("formatting.unit_hours_label", language["formatting"]["unit_hours_label"])]
    for kind, templates_by_origin in language["summary"].items():
        for origin, template in templates_by_origin.items():
            texts.append((f"summary.{kind}.{origin}", template))
    for code, template in language["reasons"].items():
        texts.append((f"reasons.{code}", template))
    for code, recommendation in language["recommendations"].items():
        texts.append((f"recommendations.{code}.first_check", recommendation["first_check"]))
        for number, step in enumerate(recommendation["steps"], start=1):
            texts.append((f"recommendations.{code}.steps[{number}]", step))
    for group, sentences in language["limitations"].items():
        for number, sentence in enumerate(sentences, start=1):
            texts.append((f"limitations.{group}[{number}]", sentence))
    texts.append(("human_decision_note", language["human_decision_note"]))
    return texts


def numbers_in(text: str) -> list[str]:
    """Number tokens of a text, with the channel name removed: "%12,78 ve 3" -> ["12,78", "3"]."""
    return re.findall(r"\d+(?:[.,]\d+)?", text.replace(CHANNEL_NAME, ""))


# --- Tests ---------------------------------------------------------------------------------

class ForbiddenTermMatcherTests(unittest.TestCase):
    """The matcher itself, so the wording tests below cannot pass by matching nothing."""

    def test_matches_at_word_start_ignoring_case_and_turkish_i(self):
        self.assertEqual(forbidden_terms_in("ARIZA DOĞRULANDI", ["arıza doğrulandı"]), ["arıza doğrulandı"])
        self.assertEqual(forbidden_terms_in("İşte kesin arıza", ["kesin arıza"]), ["kesin arıza"])
        self.assertEqual(forbidden_terms_in("toplam 5kWh", ["kW"]), ["kW"])
        self.assertEqual(forbidden_terms_in("tasarrufu artar", ["tasarruf"]), ["tasarruf"])

    def test_does_not_match_inside_a_longer_word(self):
        self.assertEqual(forbidden_terms_in("a backward step", ["kW"]), [])
        self.assertEqual(forbidden_terms_in("veri kesintisi", ["kesin arıza"]), [])

    def test_a_currency_sign_matches_anywhere(self):
        # In "US$40" the sign follows a letter, so a word-start rule alone would miss it; the
        # match must not depend on the digit after it either.
        self.assertEqual(forbidden_terms_in("US$40", ["$"]), ["$"])
        self.assertEqual(forbidden_terms_in("paid in US$", ["$"]), ["$"])
        self.assertEqual(forbidden_terms_in("toplam₺", ["₺"]), ["₺"])

    def test_combined_term_list_has_each_term_once(self):
        terms = all_forbidden_terms(load_catalog())
        self.assertEqual(len(terms), len(set(terms)))


class HumanDecisionNoteTests(unittest.TestCase):
    """Contract rule 6: the product recommends an inspection; people decide."""

    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_note_texts_are_the_approved_ones(self):
        for language_code in LANGUAGES:
            with self.subTest(language=language_code):
                self.assertEqual(self.catalog["languages"][language_code]["human_decision_note"],
                                 APPROVED_HUMAN_DECISION_NOTES[language_code])

    def test_note_is_the_last_step_of_the_assembly(self):
        self.assertEqual(self.catalog["assembly"][-1]["field"], "humanDecisionNote")

    def test_assembly_names_every_explanation_part_exactly_once(self):
        fields = [step["field"] for step in self.catalog["assembly"]]
        self.assertEqual(sorted(fields), sorted(EXPLANATION_PARTS))


class CatalogCoverageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_versions_match_the_contract(self):
        self.assertEqual(self.catalog["catalog_version"], CATALOG_VERSION)
        self.assertEqual(self.catalog["evidence_schema_version"], SCHEMA_VERSION)
        self.assertEqual(self.catalog["recommendation_library_version"], LIBRARY_VERSION)

    def test_code_lists_agree_between_typescript_and_python(self):
        # The catalog follows the contract; if its two sources disagree, that is reported here.
        self.assertEqual(typescript_union_members("ReasonCode"), REASON_CODES)
        self.assertEqual(typescript_union_members("RecommendationCode"), set(RECOMMENDATION_BY_KIND.values()))
        self.assertEqual(typescript_union_members("EvidenceKind"), set(RECOMMENDATION_BY_KIND))

    def test_every_reason_code_has_a_value_format_and_a_text_in_both_languages(self):
        codes = typescript_union_members("ReasonCode") | REASON_CODES
        self.assertEqual(set(self.catalog["reason_value_formats"]), codes)
        for language_code in LANGUAGES:
            reasons = self.catalog["languages"][language_code]["reasons"]
            with self.subTest(language=language_code):
                # Equal sets: no code is missing and no unknown code (a typo) is present.
                self.assertEqual(set(reasons), codes)
                for code in codes:
                    self.assertTrue(reasons[code].strip(), code)

    def test_every_recommendation_code_has_a_first_check_and_steps_in_both_languages(self):
        codes = typescript_union_members("RecommendationCode") | set(RECOMMENDATION_BY_KIND.values())
        for language_code in LANGUAGES:
            recommendations = self.catalog["languages"][language_code]["recommendations"]
            with self.subTest(language=language_code):
                self.assertEqual(set(recommendations), codes)
                for code in codes:
                    self.assertTrue(recommendations[code]["first_check"].strip(), code)
                    self.assertGreater(len(recommendations[code]["steps"]), 0, code)
                    for step in recommendations[code]["steps"]:
                        self.assertTrue(step.strip(), code)

    def test_english_first_checks_are_the_contract_texts(self):
        # The contract's code list gives each recommendation's first check. The catalog adds
        # only the closing period, so the two cannot drift apart unnoticed.
        recommendations = self.catalog["languages"]["en"]["recommendations"]
        for code in sorted(typescript_union_members("RecommendationCode")):
            with self.subTest(code=code):
                self.assertEqual(recommendations[code]["first_check"], contract_first_check(code) + ".")

    def test_every_case_kind_and_origin_has_a_summary_in_both_languages(self):
        kinds = typescript_union_members("EvidenceKind")
        origins = typescript_union_members("EvidenceOrigin")
        for language_code in LANGUAGES:
            summary = self.catalog["languages"][language_code]["summary"]
            with self.subTest(language=language_code):
                self.assertEqual(set(summary), kinds)
                for kind in kinds:
                    self.assertEqual(set(summary[kind]), origins)
                    for origin in origins:
                        self.assertTrue(summary[kind][origin].strip(), f"{kind}.{origin}")

    def test_limitations_note_label_and_forbidden_terms_exist_in_both_languages(self):
        kinds = typescript_union_members("EvidenceKind")
        self.assertEqual(set(self.catalog["forbidden_term_categories"]), set(FORBIDDEN_TERM_CATEGORIES))
        for language_code in LANGUAGES:
            language = self.catalog["languages"][language_code]
            with self.subTest(language=language_code):
                self.assertEqual(set(language["limitations"]), {"always", "synthetic", *kinds})
                self.assertGreater(len(language["limitations"]["always"]), 0)
                self.assertGreater(len(language["limitations"]["synthetic"]), 0)
                self.assertTrue(language["human_decision_note"].strip())
                self.assertTrue(language["labels"]["synthetic"].strip())
                self.assertEqual(set(language["forbidden_terms"]), set(FORBIDDEN_TERM_CATEGORIES))
                for category in FORBIDDEN_TERM_CATEGORIES:
                    self.assertGreater(len(language["forbidden_terms"][category]), 0, category)


class TemplateRuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_placeholders_name_contract_fields_and_known_formats(self):
        case_fields = typescript_interface_fields("EvidenceCaseSummary") | typescript_interface_fields("EvidenceCase")
        synthetic_fields = typescript_interface_fields("SyntheticInjection")
        reason_fields = typescript_interface_fields("EvidenceReason")
        for name, placeholder in self.catalog["placeholders"].items():
            source = placeholder["source"].split(".")
            with self.subTest(placeholder=name):
                if source[0] == "reason":
                    self.assertEqual(len(source), 2)
                    self.assertIn(source[1], reason_fields)
                elif len(source) == 3:
                    self.assertEqual(source[:2], ["case", "synthetic"])
                    self.assertIn(source[2], synthetic_fields)
                else:
                    self.assertEqual(source[0], "case")
                    self.assertIn(source[1], case_fields)
                self.assertIn(placeholder["format"], self.catalog["formats"])

    def test_every_placeholder_in_a_text_is_listed_and_no_stray_brace_remains(self):
        listed = set(self.catalog["placeholders"])
        for language_code in LANGUAGES:
            for location, text in language_texts(self.catalog["languages"][language_code]):
                with self.subTest(language=language_code, location=location):
                    for name in PLACEHOLDER_PATTERN.findall(text):
                        self.assertIn(name, listed)
                    without_placeholders = PLACEHOLDER_PATTERN.sub("", text)
                    self.assertNotIn("{", without_placeholders)
                    self.assertNotIn("}", without_placeholders)

    def test_placeholders_are_used_only_where_their_evidence_exists(self):
        for language_code in LANGUAGES:
            language = self.catalog["languages"][language_code]
            for code, template in language["reasons"].items():
                with self.subTest(language=language_code, reason=code):
                    # A reason sentence shows its own value exactly once and nothing else.
                    self.assertEqual(PLACEHOLDER_PATTERN.findall(template), ["value"])
            for kind, templates_by_origin in language["summary"].items():
                for origin, template in templates_by_origin.items():
                    names = PLACEHOLDER_PATTERN.findall(template)
                    with self.subTest(language=language_code, summary=f"{kind}.{origin}"):
                        self.assertNotIn("value", names)
                        if origin == "observed":
                            # Observed cases have no synthetic details (synthetic is null).
                            self.assertEqual([name for name in names if name.startswith("synthetic.")], [])
            fixed_texts = [language["human_decision_note"], language["labels"]["synthetic"]]
            for recommendation in language["recommendations"].values():
                fixed_texts += [recommendation["first_check"], *recommendation["steps"]]
            for sentences in language["limitations"].values():
                fixed_texts += sentences
            for text in fixed_texts:
                with self.subTest(language=language_code, text=text):
                    self.assertEqual(PLACEHOLDER_PATTERN.findall(text), [])

    def test_static_text_has_no_number_of_its_own(self):
        for language_code in LANGUAGES:
            for location, text in language_texts(self.catalog["languages"][language_code]):
                with self.subTest(language=language_code, location=location):
                    static_text = PLACEHOLDER_PATTERN.sub("", text)
                    self.assertEqual(numbers_in(static_text), [], text)

    def test_no_forbidden_term_in_any_text(self):
        terms = all_forbidden_terms(self.catalog)
        for language_code in LANGUAGES:
            for location, text in language_texts(self.catalog["languages"][language_code]):
                with self.subTest(language=language_code, location=location):
                    self.assertEqual(forbidden_terms_in(text, terms), [], text)

    def test_each_category_catches_its_samples_on_its_own(self):
        # A sample must be caught by the terms of its own category and by no other category,
        # so "%90 olasılıkla" tests the probability terms and not the fault terms.
        for language_code, samples_by_category in FORBIDDEN_SAMPLES.items():
            categories = self.catalog["languages"][language_code]["forbidden_terms"]
            for category, phrases in samples_by_category.items():
                other_terms = []
                for other_category, terms in categories.items():
                    if other_category != category:
                        other_terms += terms
                for phrase in phrases:
                    with self.subTest(language=language_code, category=category, phrase=phrase):
                        self.assertNotEqual(forbidden_terms_in(phrase, categories[category]), [])
                        self.assertEqual(forbidden_terms_in(phrase, other_terms), [])

    def test_synthetic_summaries_carry_the_label_and_observed_summaries_do_not(self):
        for language_code in LANGUAGES:
            language = self.catalog["languages"][language_code]
            label = language["labels"]["synthetic"]
            for kind, templates_by_origin in language["summary"].items():
                with self.subTest(language=language_code, kind=kind):
                    self.assertIn(label, templates_by_origin["synthetic"])
                    self.assertNotIn(label, templates_by_origin["observed"])


class FormattingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_turkish_formats(self):
        formatting = self.catalog["languages"]["tr"]["formatting"]
        self.assertEqual(format_value(0.41, "share", formatting), "%41")
        self.assertEqual(format_value(0.58, "share", formatting), "%58")
        self.assertEqual(format_value(0.1278, "share", formatting), "%12,78")
        self.assertEqual(format_value(0.31, "signed_share", formatting), "+%31")
        self.assertEqual(format_value(-0.05, "signed_share", formatting), "-%5")
        self.assertEqual(format_value(3.2, "statistic", formatting), "3,2")
        self.assertEqual(format_value(4, "count", formatting), "4")
        self.assertEqual(format_value(90001, "identifier", formatting), "90001")
        self.assertEqual(format_value("2018-07-07", "date", formatting), "7 Temmuz 2018")
        self.assertEqual(format_value(None, "share", formatting), "hesaplanmadı")
        self.assertEqual(formatting["unit_hours_label"], "kaynak birimi × saat")

    def test_english_formats(self):
        formatting = self.catalog["languages"]["en"]["formatting"]
        self.assertEqual(format_value(0.41, "share", formatting), "41%")
        self.assertEqual(format_value(0.58, "share", formatting), "58%")
        self.assertEqual(format_value(0.1278, "share", formatting), "12.78%")
        self.assertEqual(format_value(0.31, "signed_share", formatting), "+31%")
        self.assertEqual(format_value(-0.05, "signed_share", formatting), "-5%")
        self.assertEqual(format_value(3.2, "statistic", formatting), "3.2")
        self.assertEqual(format_value(4, "count", formatting), "4")
        self.assertEqual(format_value(90001, "identifier", formatting), "90001")
        self.assertEqual(format_value("2018-07-07", "date", formatting), "7 July 2018")
        self.assertEqual(format_value(None, "share", formatting), "not computed")
        self.assertEqual(formatting["unit_hours_label"], "source unit × hours")

    def test_every_reason_renders_a_number_and_a_null_value(self):
        # Made-up sample values, one per value format; null must read as "not computed", never 0.
        sample_values = {"share": 0.25, "signed_share": 0.1, "statistic": 2.5, "count": 3}
        terms = all_forbidden_terms(self.catalog)
        for language_code in LANGUAGES:
            language = self.catalog["languages"][language_code]
            formatting = language["formatting"]
            for code, template in language["reasons"].items():
                value_format = self.catalog["reason_value_formats"][code]
                with self.subTest(language=language_code, reason=code):
                    number_value = format_value(sample_values[value_format], value_format, formatting)
                    with_number = fill(template, {"value": number_value})
                    with_null = fill(template, {"value": format_value(None, value_format, formatting)})
                    self.assertNotIn("{", with_number + with_null)
                    self.assertIn(number_value, with_number)
                    self.assertIn(formatting["null_text"], with_null)
                    self.assertEqual(numbers_in(with_null), [])
                    self.assertEqual(forbidden_terms_in(with_number + " " + with_null, terms), [])


class MadeUpCaseTests(unittest.TestCase):
    """Exact texts and numbers, from cases built in this file (see made_up_case)."""

    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_observed_summary_is_pinned_in_both_languages(self):
        case = made_up_case("consumption_deviation", "observed")
        expected = {
            "tr": ("Hane 90010 için air1 kanal sapması. 9 Temmuz 2018 ile 12 Temmuz 2018 arasında tüketim, "
                   "sıcaklık ve saate göre beklenenden yüksek seyretti. Dedektör kuralı ilk kez 10 Temmuz 2018 "
                   "tarihinde karşılandı; günlük koşulu karşılayan (işaretli) gün sayısı 4."),
            "en": ("Household 90010: air1 channel deviation. Between 9 July 2018 and 12 July 2018, consumption "
                   "was higher than expected for the temperature and time of day. The detector rule was first "
                   "met on 10 July 2018; number of days that met the daily condition (flagged days): 4."),
        }
        for language_code, summary in expected.items():
            with self.subTest(language=language_code):
                self.assertEqual(render_explanation(case, self.catalog, language_code)["summary"], summary)

    def test_reason_numbers_come_from_the_evidence(self):
        # Made-up reason values: z 2.75, upper-bound share 0.3125, 4 consecutive days and an
        # excess share of 0.2264, in this order.
        case = made_up_case("consumption_deviation", "observed")
        expected_numbers = {
            "tr": [["2,75"], ["31,25"], ["4"], ["22,64"]],
            "en": [["2.75"], ["31.25"], ["4"], ["22.64"]],
        }
        expected_shares = {"tr": ("%31,25", "+%22,64"), "en": ("31.25%", "+22.64%")}
        for language_code in LANGUAGES:
            reasons = render_explanation(case, self.catalog, language_code)["reasons"]
            with self.subTest(language=language_code):
                self.assertEqual([numbers_in(sentence) for sentence in reasons], expected_numbers[language_code])
                upper_bound_share, excess_share = expected_shares[language_code]
                self.assertIn(upper_bound_share, reasons[1])
                self.assertIn(excess_share, reasons[3])

    def test_every_kind_and_origin_renders_completely(self):
        # The fixtures have no observed data issue, so built cases cover all four summaries.
        terms = all_forbidden_terms(self.catalog)
        for kind in sorted(typescript_union_members("EvidenceKind")):
            for origin in sorted(typescript_union_members("EvidenceOrigin")):
                case = made_up_case(kind, origin)
                for language_code in LANGUAGES:
                    label = self.catalog["languages"][language_code]["labels"]["synthetic"]
                    with self.subTest(kind=kind, origin=origin, language=language_code):
                        explanation = render_explanation(case, self.catalog, language_code)
                        text = explanation_text(explanation, self.catalog)
                        self.assertNotIn("{", text)
                        self.assertNotIn("}", text)
                        self.assertEqual(forbidden_terms_in(text, terms), [])
                        self.assertTrue(text.endswith(APPROVED_HUMAN_DECISION_NOTES[language_code]))
                        if origin == "synthetic":
                            self.assertTrue(explanation["summary"].startswith(label))
                        else:
                            self.assertNotIn(label, explanation["summary"])


class SyntheticWordingTests(unittest.TestCase):
    """Contract rule 3: synthetic cases stay labelled and are never presented as real cases."""

    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_synthetic_summary_ends_with_the_scenario_sentence(self):
        # made_up_case applies its scenario from 2018-07-08 for 7 days.
        expected_endings = {
            "tr": "Bu vaka gerçek bir olay değildir: 8 Temmuz 2018 tarihinden başlayarak air1 verisine "
                  "7 günlük bir senaryo eklendi.",
            "en": "This case is not a real event: starting on 8 July 2018, a scenario was added to the "
                  "air1 data (scenario length in days: 7).",
        }
        for kind in sorted(typescript_union_members("EvidenceKind")):
            case = made_up_case(kind, "synthetic")
            for language_code, ending in expected_endings.items():
                with self.subTest(kind=kind, language=language_code):
                    summary = render_explanation(case, self.catalog, language_code)["summary"]
                    self.assertTrue(summary.endswith(ending), summary)

    def test_synthetic_summaries_do_not_call_the_data_measured(self):
        # The committed fixtures are made up throughout, so "measured data" would not be true
        # for them.
        words = {"tr": "ölçülmüş", "en": "measured"}
        for language_code, word in words.items():
            summaries = self.catalog["languages"][language_code]["summary"]
            for kind, templates_by_origin in summaries.items():
                with self.subTest(language=language_code, kind=kind):
                    self.assertNotIn(word, templates_by_origin["synthetic"].lower())

    def test_synthetic_limitations_say_demonstration_only(self):
        # The recommendation steps plan a technician and record the outcome; for a synthetic
        # case that must not happen.
        expected = {
            "tr": "Sentetik bir vaka yalnız gösterim amaçlıdır; teknisyen planlanmaz ve inceleme sonucu "
                  "kaydedilmez.",
            "en": "A synthetic case is for demonstration only; no technician is planned and no inspection "
                  "outcome is recorded.",
        }
        for language_code, sentence in expected.items():
            with self.subTest(language=language_code):
                self.assertIn(sentence, self.catalog["languages"][language_code]["limitations"]["synthetic"])


class FixtureRenderingTests(unittest.TestCase):
    """Completeness over the committed fixtures: placeholders resolve, labels, forbidden terms.

    Exact values are tested on built cases (MadeUpCaseTests): fixture values may change when
    the fixture generator is corrected.
    """

    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()
        cls.cases = load_fixture_cases()

    def test_fixture_cases_are_the_made_up_ones(self):
        # The fixtures are fully synthetic (made-up households from 90001), never real data.
        self.assertGreater(len(self.cases), 0)
        for case in self.cases:
            self.assertGreaterEqual(case["household_id"], 90001)

    def test_every_fixture_case_renders_completely_in_both_languages(self):
        terms = all_forbidden_terms(self.catalog)
        for case in self.cases:
            for language_code in LANGUAGES:
                with self.subTest(case=case["case_id"], language=language_code):
                    explanation = render_explanation(case, self.catalog, language_code)
                    text = explanation_text(explanation, self.catalog)
                    self.assertNotIn("{", text)
                    self.assertNotIn("}", text)
                    self.assertIsNone(re.search(r"\b(None|null|undefined|NaN)\b", text))
                    self.assertEqual(forbidden_terms_in(text, terms), [])
                    self.assertEqual(len(explanation["reasons"]), len(case["reasons"]))

    def test_every_explanation_ends_with_the_human_decision_note(self):
        for case in self.cases:
            for language_code in LANGUAGES:
                note = APPROVED_HUMAN_DECISION_NOTES[language_code]
                with self.subTest(case=case["case_id"], language=language_code):
                    explanation = render_explanation(case, self.catalog, language_code)
                    text = explanation_text(explanation, self.catalog)
                    self.assertTrue(text.endswith(note))
                    self.assertEqual(text.count(note), 1)

    def test_synthetic_cases_carry_the_synthetic_label(self):
        for case in self.cases:
            for language_code in LANGUAGES:
                label = self.catalog["languages"][language_code]["labels"]["synthetic"]
                with self.subTest(case=case["case_id"], language=language_code):
                    summary = render_explanation(case, self.catalog, language_code)["summary"]
                    if case["origin"] == "synthetic":
                        self.assertIn(label, summary)
                    else:
                        self.assertNotIn(label, summary)


if __name__ == "__main__":
    unittest.main()
