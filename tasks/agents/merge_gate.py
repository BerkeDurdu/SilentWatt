"""Merge gate for one agent branch, run by the main session before every merge.

The gate takes the mechanical checks off the reviewer, so the reviewer can spend its effort on
logic. Nothing in the main checkout changes: the trial merge happens in a temporary worktree
that is removed at the end.

Usage (from the main checkout):
    python3 tasks/agents/merge_gate.py --branch <agent branch> --scope '<glob>' [--scope ...]
                                       [--target feat/mvp]

Steps. A FAIL blocks the merge; a WARN is passed to the reviewer.
1. Scope: every file the branch changes (against the target) matches one of the --scope globs.
2. Trial merge of the branch into the target, in a temporary worktree. A conflict is a FAIL.
3. In the trial merge: `git diff --check`, the ML test suite, `npm run typecheck`, `npm run build`.
4. Wording scan of the added lines: unit, fault and savings wording, outside the files that
   list those words on purpose.
5. PRD v1.1 number scan of the added lines: PRD v1.1 target values, or a line that cites
   PRD v1.1 with a number, without an "unverified" label (decision pending, 2026-10-08).
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Files that list the forbidden words on purpose (the catalog, its test, the contract, the rules).
WORDING_ALLOWLIST = [
    "shared/explanation-catalog.json",
    "packages/ml/tests/test_explanation_catalog.py",
    "docs/architecture/explanation-catalog.md",
    "docs/architecture/evidence-contract.md",
    "AGENTS.md",
    "second_brain/glossary.md",
    ".claude/skills/README.md",
    ".claude/agents/*",
    "tasks/agents/*",
]
WORDING_PATTERNS = [
    r"\bkwh\b", r"\bkw\b", r"arıza doğrulandı", r"fault confirmed", r"kesin arıza",
    r"arıza olasılığı", r"fault probability", r"tasarruf", r"\bsavings?\b",
]
PRD_TARGET_PATTERNS = [
    r"87\s*[–-]\s*93", r"≥\s*%\s*80", r"0,25\s*yeni vaka", r"≤\s*2\s*geçerli gün", r"%95'i",
    r"1[.,]10\s*[×x*]",
]
PRD_CITATION = re.compile(r"PRD\s*(v?1\.1|§)", re.IGNORECASE)
UNVERIFIED_LABEL = re.compile(r"doğrulanmamış|unverified|hypothes|varsayım|side by side|yan yana", re.IGNORECASE)


def run(command: list[str], cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True)


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def matches_any(path: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in globs)


def check_scope(main: Path, target: str, branch: str, scope: list[str]) -> tuple[str, list[str]]:
    changed = [line for line in git(main, "diff", "--name-only", f"{target}...{branch}").splitlines() if line]
    outside = [path for path in changed if not matches_any(path, scope)]
    if outside:
        return "FAIL", [f"outside scope: {path}" for path in outside]
    return "PASS", [f"{len(changed)} changed files, all within scope"]


def added_lines(main: Path, target: str, branch: str) -> list[tuple[str, str]]:
    """(file, text) for every line the branch adds."""
    lines, current_file = [], None
    for line in git(main, "diff", "-U0", f"{target}...{branch}").splitlines():
        if line.startswith("+++ "):
            current_file = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("+") and current_file:
            lines.append((current_file, line[1:]))
    return lines


def scan_wording(lines: list[tuple[str, str]]) -> tuple[str, list[str]]:
    hits = []
    for path, text in lines:
        if matches_any(path, WORDING_ALLOWLIST):
            continue
        for pattern in WORDING_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                hits.append(f"{path}: {text.strip()[:120]}")
                break
    return ("WARN" if hits else "PASS"), hits or ["no unit, fault or savings wording added"]


def scan_prd_numbers(lines: list[tuple[str, str]]) -> tuple[str, list[str]]:
    hits = []
    for path, text in lines:
        if matches_any(path, ["tasks/agents/*", ".claude/agents/*"]) or UNVERIFIED_LABEL.search(text):
            continue
        is_target_value = any(re.search(pattern, text) for pattern in PRD_TARGET_PATTERNS)
        cites_prd_with_number = bool(PRD_CITATION.search(text)) and bool(re.search(r"\d", text))
        if is_target_value or cites_prd_with_number:
            hits.append(f"{path}: {text.strip()[:120]}")
    return ("WARN" if hits else "PASS"), hits or ["no unlabelled PRD v1.1 number added"]


def trial_merge_checks(main: Path, target: str, branch: str) -> list[tuple[str, str, list[str]]]:
    """Merge into a temporary worktree of the target and run the checks there."""
    results = []
    trial = Path(tempfile.mkdtemp(prefix="sw-merge-gate-"))
    try:
        git(main, "worktree", "add", "--detach", str(trial), target)
        merge = run(["git", "merge", "--no-commit", "--no-ff", branch], cwd=trial)
        if merge.returncode != 0:
            results.append(("Trial merge", "FAIL", [line for line in merge.stdout.splitlines() if "CONFLICT" in line]
                            or [merge.stderr.strip()[-300:]]))
            return results
        results.append(("Trial merge", "PASS", [f"{branch} merges cleanly into {target}"]))

        diff_check = run(["git", "diff", "--cached", "--check"], cwd=trial)
        results.append(("git diff --check", "PASS" if diff_check.returncode == 0 else "FAIL",
                        [diff_check.stdout.strip()[-300:]] if diff_check.returncode else ["clean"]))

        environment = dict(os.environ, PYTHONPATH=str(trial / "packages/ml/src"), PYTHONDONTWRITEBYTECODE="1")
        tests = run([str(main / ".venv/bin/python"), "-m", "unittest", "discover", "-s", "packages/ml/tests"],
                    cwd=trial, env=environment)
        summary = [line for line in tests.stderr.splitlines() if line.startswith(("Ran ", "OK", "FAILED"))]
        results.append(("ML tests", "PASS" if tests.returncode == 0 else "FAIL", summary or [tests.stderr[-300:]]))

        (trial / "node_modules").symlink_to(main / "node_modules")
        for script in ("typecheck", "build"):
            npm = run(["npm", "run", script], cwd=trial)
            results.append((f"npm run {script}", "PASS" if npm.returncode == 0 else "FAIL",
                            ["exit 0"] if npm.returncode == 0 else [(npm.stdout + npm.stderr).strip()[-300:]]))
    finally:
        run(["git", "merge", "--abort"], cwd=trial)
        run(["git", "worktree", "remove", "--force", str(trial)], cwd=main)
        shutil.rmtree(trial, ignore_errors=True)
        run(["git", "worktree", "prune"], cwd=main)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--branch", required=True)
    parser.add_argument("--scope", action="append", required=True, help="allowed path glob; repeat")
    parser.add_argument("--target", default="feat/mvp")
    args = parser.parse_args()

    main_checkout = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    if Path(git(main_checkout, "rev-parse", "--absolute-git-dir").strip()) != \
            Path(git(main_checkout, "rev-parse", "--git-common-dir").strip()).resolve():
        print("MERGE GATE FAIL: run the gate from the main checkout")
        sys.exit(1)

    results = []
    status, notes = check_scope(main_checkout, args.target, args.branch, args.scope)
    results.append(("Scope", status, notes))
    if status == "PASS":
        results.extend(trial_merge_checks(main_checkout, args.target, args.branch))
    lines = added_lines(main_checkout, args.target, args.branch)
    results.append(("Wording scan", *scan_wording(lines)))
    results.append(("PRD v1.1 number scan", *scan_prd_numbers(lines)))

    for name, status, notes in results:
        print(f"[{status}] {name}")
        for note in notes[:15]:
            print(f"        {note}")
        if len(notes) > 15:
            print(f"        ... {len(notes) - 15} more")
    failed = [name for name, status, _ in results if status == "FAIL"]
    print("MERGE GATE: " + ("FAIL (" + ", ".join(failed) + ")" if failed else "PASS"))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
