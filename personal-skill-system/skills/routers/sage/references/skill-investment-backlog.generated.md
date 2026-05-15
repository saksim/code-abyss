# Skill Investment Backlog

Generated from `registry/skill-investment-backlog.generated.json`.
Use this as the human-readable portfolio board for current-skill hardening, future-skill intake, lifecycle debt, and host-governance blockers.

Generated at: 2026-05-15T12:45:36.717Z

## Summary

- total items: 2
- critical: 1
- high: 1
- normal: 0

### Categories

- `host-writeability`: 1
- `proof-governance`: 1

### Sources

- `host-writeability`: 1 -> live write-access probes across generated governance artifacts and authoritative skill tree
- `proof-governance`: 1 -> registry/runtime-proof.generated.json + benchmark/host-smoke/scorecard.generated.json

## Active Items

### Close proof-governance debt for 'verify-quality'.

- id: `proof-verify-quality`
- priority: `critical`
- status: `open`
- category: `proof-governance`
- source: `proof-governance`
- skill: `verify-quality`
- kind: `tool`
- reasons: `host-smoke-evidence:stale`, `host-smoke-governance:not-host-smoked`, `host-smoke-level:declared-and-tested`
- follow-up: `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-quality`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-quality --host codex`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-quality`

### Restore host ability to create authoritative skill directories.

- id: `host-writeability-authoritative-skill-create`
- priority: `high`
- status: `open`
- category: `host-writeability`
- source: `host-writeability`
- skill: -
- kind: -
- reasons: `artifact:authoritative-skill-tree`, `code:EPERM`, `mode:create-child-directory`
- follow-up: `node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --kind domain "<request>"`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js create domain <skill-name> --scaffold-modules`

## Operating Notes

1. treat this file as derived evidence, not the primary write surface
2. use `manage-skill` to change lifecycle, opportunity, admission, evolution, or scaffold state
3. regenerate this file whenever the governed backlog JSON changes
