# Skill Investment Backlog

Generated from `registry/skill-investment-backlog.generated.json`.
Use this as the human-readable portfolio board for current-skill hardening, future-skill intake, lifecycle debt, and host-governance blockers.

Generated at: 2026-05-29T05:47:10.058Z

## Stable Top-Tier Portfolio

- stable skills: 39
- ready: 39
- blocked: 0
- critical: 0
- high: 0
- normal: 0
- clear: 39

### Upgrade Board

- blocked stable skills: 0
- next wave: -

### Current Wave

- blocked stable skills: 0
- next wave: -
- next wave size: 0
- follow-up: `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier --all`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source top-tier-readiness`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-top-tier-wave`

## Summary

- total items: 2
- critical: 0
- high: 2
- normal: 0

### Categories

- `top-tier-hardening`: 2

### Sources

- `authoritative-skills`: 2 -> skills/**/SKILL.md

## Active Items

### Decide whether active skill 'imagegen' should be hardened to stable or intentionally retired.

- id: `lifecycle-hardening-imagegen`
- priority: `high`
- status: `open`
- category: `top-tier-hardening`
- source: `authoritative-skills`
- skill: `imagegen`
- kind: `tool`
- reasons: `active skill is still 'experimental' and has not been promoted into the canonical stable/top-tier surface`
- follow-up: `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier imagegen`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check imagegen "promote this active skill into the governed stable surface if it is honestly ready"`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show imagegen`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance --skill imagegen`

### Decide whether active skill 'plugin-creator' should be hardened to stable or intentionally retired.

- id: `lifecycle-hardening-plugin-creator`
- priority: `high`
- status: `open`
- category: `top-tier-hardening`
- source: `authoritative-skills`
- skill: `plugin-creator`
- kind: `tool`
- reasons: `active skill is still 'experimental' and has not been promoted into the canonical stable/top-tier surface`
- follow-up: `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier plugin-creator`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check plugin-creator "promote this active skill into the governed stable surface if it is honestly ready"`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show plugin-creator`, `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance --skill plugin-creator`

## Operating Notes

1. treat this file as derived evidence, not the primary write surface
2. use `manage-skill` to change lifecycle, opportunity, admission, evolution, or scaffold state
3. regenerate this file whenever the governed backlog JSON changes
