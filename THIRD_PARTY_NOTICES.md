# Third-party agent skills

The project includes selected skill directories copied from the following public repositories. Their upstream instructions remain in the copied files. Full license texts and copyright notices are included below; project-specific usage constraints are in `.claude/skills/README.md`.

| Source | Pinned commit | Included paths | License |
| --- | --- | --- | --- |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156` | `skills/ponytail*` → `.codex/skills/ponytail*` | MIT |
| [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | `9874ad73813715fc36875e45afd9cd94c68f3c3f` | `skills/diagram-design` → `.claude/skills/diagram-design` | MIT |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | `19392f7a08264ed00486a251f5b2098321771f94` | `senior-ml-engineer`, `senior-data-scientist`, `data-quality-auditor`, `senior-architect`, `code-reviewer`, `tdd-guide`, `dependency-auditor`, `skill-security-auditor` → `.claude/skills/<name>` | MIT |

On 2026-09-23 the nine non-`ponytail` directories were moved from `.codex/skills/` to `.claude/skills/` with `git mv`; file contents are unchanged. The `ponytail` copies stay under `.codex/skills/` and are no longer used. Project usage constraints now live in [`.claude/skills/README.md`](.claude/skills/README.md).

`mksglu/context-mode` was reviewed at commit `5bca2948959a7fb538e895d9a032c1a19b8685a5` but was not copied. It is an Elastic License 2.0 MCP/plugin package with runtime hooks and a separate Node process. The project records the optional setup in `.codex/skills/README.md`; no context-mode code, hook or MCP manifest is committed.

The raw `skill-security-auditor` result is 14 PASS and 1 FAIL. The single FAIL was manually reviewed as a false positive: `diagram-design/scripts/drawio_extract.py` base64-decodes draw.io's documented compressed payload format. It is a parser for user-supplied diagram data, not an obfuscated executable payload. The scanner result was not suppressed or relabeled PASS. See the dated [security review](docs/project-status/p0-verification-2026-09-17.md) for evidence and limitations. Re-run the audit when updating that skill or adding another external skill.

## Included license texts

- [Ponytail — MIT, Copyright (c) 2026 DietrichGebert](docs/third-party/ponytail-LICENSE.txt)
- [Diagram Design — MIT, Copyright (c) 2025 Cathryn Lavery](docs/third-party/diagram-design-LICENSE.txt)
- [Claude Skills — MIT, Copyright (c) 2025 Alireza Rezvani](docs/third-party/claude-skills-LICENSE.txt)

All 15 skill directories were compared byte-for-byte against the pinned GitHub
archives on 2026-09-17: no changed, extra or missing files inside those skill
directories. `.codex/skills/README.md` and `AGENTS.md` are local integration rules,
not upstream skill contents. The license files above were copied verbatim from
the same pinned revisions.

## Exact Claude Skills source paths

The local directory name is the last component of each upstream path:

- `engineering-team/skills/code-reviewer`
- `engineering/data-quality-auditor/skills/data-quality-auditor`
- `engineering/skills/dependency-auditor`
- `engineering-team/skills/senior-architect`
- `engineering-team/skills/senior-data-scientist`
- `engineering-team/skills/senior-ml-engineer`
- `engineering/skills/skill-security-auditor`
- `engineering-team/skills/tdd-guide`
