---
schema-version: 2
name: manage-skill
title: Manage Skill Tool
description: Create, inspect, update, archive, or delete core skills inside personal-skill-system/skills. Use when maintaining the authoritative skill source rather than editing scattered files by hand.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [manual]
trigger-keywords: [manage-skill, skill crud, create skill, update skill, archive skill, delete skill, 维护技能, 创建技能, 更新技能, 删除技能, 归档技能]
negative-keywords: [ordinary feature, single bug, 普通功能开发, 单点缺陷]
priority: 92
runtime: scripted
executor: node
permissions: [Read, Write, Bash]
risk-level: medium
supported-hosts: [codex, claude, gemini]
status: stable
host-smoke-tier: critical
host-smoke-target-level: host-smoked
host-smoke-freshness-days: 7
owner: self
last-reviewed: 2026-05-05
review-cycle-days: 30
tags: [tool, skills, governance]
aliases: [skill-admin, skill-crud, 技能管理]
---

# Manage Skill Tool

## Purpose

Operate on the authoritative skill tree under `personal-skill-system/skills/` only.

## Commands

- `admission-check`: evaluate whether a proposed capability should become a new skill, be merged into an existing skill, or first be handled by upgrading an existing route boundary
- `show-admission-ledger`: inspect governed admission decisions so future add/merge work starts from recorded system history instead of memory
- `resolve-admission`: close or annotate a governed admission decision when a request is implemented, deferred, or intentionally dropped
- `assess-top-tier`: inspect whether a skill is actually ready to be treated as top-tier / `stable`, including capability-module depth and governed route/runtime surfaces
- `create`: scaffold a new skill from the canonical template, including internal adapter skills, with optional capability-module governance scaffolding for new domain/workflow skills
- `show`: inspect resolved paths and metadata for an existing skill
- `update`: patch non-lifecycle frontmatter fields for an existing skill
- `set-status`: move a skill between `draft`, `experimental`, `stable`, `deprecated`, and `archived` while keeping generated governance surfaces synchronized
  and refuse `stable` promotion unless the skill's capability modules are all `top-ready` and the stable/top-tier governance blockers are clear
- `set-module-rating`: move one capability module or every module owned by a host skill between `thin`, `strong-but-not-top`, and `top-ready`
  while keeping `capability-ratings.generated.json` and `docs/CAPABILITY_MODULE_RATINGS.md` synchronized;
  default behavior only allows one-bucket moves unless `--allow-skip` is set intentionally
- `archive`: mark a skill as archived without deleting it
- `delete`: remove a skill directory from the authoritative tree, preferably after archive
- `sync-host-metadata`: regenerate governed `agents/openai.yaml` files from authoritative `SKILL.md` metadata
  for one skill or the current governed set of stable skills, keeping host-facing labels and prompts aligned
- `sync-route-metadata`: regenerate the route-shared portion of `route-map.generated.json` from authoritative `SKILL.md`
  metadata for one skill or the current governed live route surface, keeping trigger/alias/conflict/auto-chain facts aligned without overwriting richer route rationale and fallback tuning
  and refreshing governed `expert-modules` from the registered module-group when the skill has capability depth behind its route
- `sync-route-metadata` also refreshes the governed route-fixture placeholder for the selected skill(s), so explicit/manual route evidence keeps tracking current trigger wording instead of drifting as one-time scaffolding
- `sync-runtime-proof`: align runtime-proof registry entries with current scripted skill metadata and Runtime Proof bullets
  and suggest or auto-fill evidence tests from the Jest runtime corpus when explicit evidence is missing;
  when `scripts/smoke.json` exists on a stable scripted skill, the host-smoke contract is also synchronized;
  if a previous `host-smoked` level no longer has matching fresh passing evidence, the level is downgraded automatically
- `run-host-smoke`: execute registry-backed host-smoke commands for one or all scripted skills and append evidence artifacts under `benchmark/host-smoke/runtime-runs/`
  while refreshing the bundle-wide host-smoke scorecard under `benchmark/host-smoke/scorecard.generated.json`;
  failed executions also demote stale or broken `host-smoked` levels back to the default governed level
- `reconcile-host-smoke`: inspect the current host-smoke evidence state for one or all scripted skills, append governed invalidation entries for drifted artifacts when requested,
  downgrade unsupported `host-smoked` claims, and optionally rerun the selected host-smoke contract immediately
- `admission-check` writes governed add-vs-reuse decisions into `registry/admission-ledger.generated.json`, and `create --request-id` can close that request once the skill is actually created

If the host cannot rewrite required generated governance artifacts such as runtime-proof, scorecard, or system-readiness files, fail early instead of partially mutating lifecycle state.
Treat `benchmark/system-readiness.generated.json` as a derived snapshot rather than the primary governance source:
if that file alone is not writable on the current host but runtime-proof, scorecard, and invalidation artifacts are still writable, keep host-smoke governance moving and surface the readiness rewrite failure as explicit follow-up debt.

## Output Contract

Return:

1. the authoritative target path
2. what changed
3. any follow-up verification commands that should be run

## Runtime Proof

- `admission-check` evaluates proposed skill additions against the live route surface and existing governed skills so future growth is routed through one repeatable add/merge/upgrade decision path instead of ad-hoc judgement
- `assess-top-tier` turns "this skill is top-tier enough" into a governed read-only check instead of a hand-waved label by inspecting capability-module ratings and stable-surface blockers together
- `create` updates the authoritative skill tree and generated metadata together instead of leaving registry or route drift behind
- `create --scaffold-modules` also seeds module-group registry entries, placeholder route `expert-modules`, and thin capability-module ratings for new domain/workflow skills
- `set-module-rating` upgrades or downgrades registered capability modules through a governed path instead of hand-editing rating buckets, `next-batch`, or the mirrored ratings doc
- `set-status` updates lifecycle metadata through a governed path instead of allowing raw `status=` edits that can strand runtime-proof, ratings, or readiness artifacts
- `set-status stable` now reuses the same top-tier readiness gate as `assess-top-tier`, so "stable" cannot drift away from the skill system's claimed top-tier standard
- `archive` and `delete` remove active-route surfaces for the target skill, including route fixtures and ratings summary membership
- `sync-host-metadata` keeps `agents/openai.yaml` governed from authoritative skill metadata instead of allowing host UI labels or default prompts to drift, including nested runtime paths such as variant skills
- `sync-route-metadata` keeps the shared route surface governed from authoritative frontmatter for trigger keywords, negative keywords, aliases, conflicts, auto-chain, supported hosts, and explicit-vs-auto routing mode while leaving richer route-only rationale/confidence/fallback tuning intact
- `sync-route-metadata` also keeps route `expert-modules` aligned with the capability modules registered for that skill so depth bindings do not drift after governance edits
- governed route-fixture placeholders are refreshed from current trigger metadata during route sync and lifecycle restore flows, but stable/top-tier evidence still requires at least one non-placeholder route fixture
- `sync-runtime-proof` can rebuild or update runtime-proof entries from authoritative skill metadata instead of requiring hand-edited registry drift repair and can suggest or auto-apply matching evidence tests for scripted skills based on existing Jest coverage
- `sync-runtime-proof` also lifts skill-local `scripts/smoke.json` manifests into registry-backed host-smoke metadata so future host runners consume one consistent contract
- `sync-runtime-proof` treats `host-smoked` as evidence-backed state instead of sticky status and automatically downgrades entries whose contract, pass state, or freshness proof no longer holds
- `sync-runtime-proof` also invalidates drifted runtime host-smoke artifacts when a contract changes, so append-only evidence history stays cleanly governed without a separate manual cleanup pass
- `run-host-smoke` executes the declared host-smoke contract and records append-only pass/fail evidence so `host-smoked` can be proven from artifacts instead of trust
- failed host-smoke executions preserve their artifacts and demote any now-invalid `host-smoked` level instead of leaving stale governance claims behind
- host-smoke contract and evidence changes also refresh a bundle-wide scorecard so system-level freshness and governance drift stay inspectable
- `reconcile-host-smoke` invalidates drifted runtime host-smoke artifacts through a governed ledger instead of rewriting append-only run history and can chain directly into a rerun when fresh evidence is needed

## Read These References

- `references/authoritative-skill-rules.md`
  Read before modifying the skill tree so changes stay inside the single source of truth model.
- `references/operation-examples.md`
  Read when you need concrete command examples for create, update, archive, show, and delete.
- `references/skill-admission-rubric.md`
  Read when deciding whether a new request deserves a brand-new skill, should deepen an existing route, or should stay as capability depth behind a current skill.
