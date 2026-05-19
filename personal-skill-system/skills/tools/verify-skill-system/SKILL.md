---
schema-version: 2
name: verify-skill-system
scaffold-origin: tool-template
scaffold-version: 1
title: Verify Skill System Tool
description: Validate a portable skill bundle itself: frontmatter integrity, registry coverage, route-map coverage, reference links, runtime contracts, and structural portability assumptions. Use when auditing the health of a personal skill system rather than application code.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [manual]
trigger-keywords: [verify-skill-system, skill system audit, registry audit, route map audit, 技能系统校验, 注册表审计, 路由图审计, skill audit, 技能体检]
negative-keywords: []
priority: 90
runtime: scripted
executor: node
permissions: [Read, Glob, Bash]
risk-level: low
supported-hosts: [codex, claude, gemini]
status: stable
host-smoke-tier: critical
host-smoke-target-level: host-smoked
host-smoke-freshness-days: 7
owner: self
last-reviewed: 2026-05-19
review-cycle-days: 30
tags: [tool, skills, governance]
aliases: [skill-system-audit, 技能系统审计]
---
# Verify Skill System Tool

## Read These References

- `references/check-surface.md`
  Read when deciding what a healthy portable skill bundle should validate.
- `references/interpreting-findings.md`
  Read when the checker reports drift, missing coverage, or runtime-contract problems and you need to prioritize the damage.

## Checks

- top-level bundle structure
- `SKILL.md` frontmatter integrity
- registry completeness
- admission/evolution ledger integrity
- future skill opportunity queue integrity
- skill investment backlog integrity
- expert-source family scorecard integrity
- route-map completeness for user-invocable skills
- reference link existence
- runtime and script contract alignment
- host-smoke execution evidence alignment for stable scripted skills
- route-map linkage to known skills
- generated governance artifact writeability on the current host for readiness, scorecards, and runtime-proof refreshes
- host-level writeability debt as a separate governance surface, so sandbox or filesystem limits are tracked explicitly instead of being mistaken for skill-content drift

## Runtime Proof

- `node scripts/run.js --target ./personal-skill-system --json` returns a structured bundle-health report with findings and metrics
- governance drift in registry, route fixtures, future opportunity queue, investment backlog, expert-source family scorecards, stable skill standards, runtime host-smoke evidence, host writeability, or template integrity is reported as explicit findings
- `node scripts/run.js --target ./personal-skill-system --self-smoke --json` validates the tool on a temporary writable copy, so host-smoke can prove bundle-audit correctness even when the live host cannot rewrite every generated artifact in place

## Run

```bash
node scripts/run.js --target ./personal-skill-system --json
```
