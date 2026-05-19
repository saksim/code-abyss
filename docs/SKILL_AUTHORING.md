# Skill Authoring

This repository has one authoritative skill source tree:

- `personal-skill-system/skills/**/SKILL.md`

Do not author or revive repo-root `skills/`.

Volatile governed token sets and matrices now live in the generated reference:

- [`personal-skill-system/docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md`](/D:/Download/gaming/new_program/code-abyss/personal-skill-system/docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md)

## What This Document Covers

Use this document when you add, upgrade, deprecate, archive, or delete skills inside the personal skill system.

It describes the real contracts enforced by the repository today, not a loose writing guide.

## Single Charter

Treat [`personal-skill-system/docs/TOP_TIER_SKILL_STANDARD.md`](/D:/Download/gaming/new_program/code-abyss/personal-skill-system/docs/TOP_TIER_SKILL_STANDARD.md) as the canonical charter.

This file is the execution guide for satisfying that charter inside this repository.

## First Classify The Work

Before editing a skill, decide which path you are on:

- `current-skill hardening`
  The capability already exists and should be tightened, deepened, proven, or promoted.
- `future-skill admission`
  The capability does not yet exist clearly enough, or may deserve reuse instead of a new sibling.
- `lifecycle retirement`
  The capability should be deprecated, archived, merged, or deleted cleanly.

Use the governed entry point that matches the path:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check <skill-name>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier <skill-name>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint --name <skill-name>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js record-opportunity --name <capability-name> --kind <kind>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --name <capability-name> --kind <kind>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-future-skill-pipeline
```

## Two Enforcement Layers

Skill work in this repository is governed by two different checks.

### 1. Distribution contract

Run:

```bash
npm run verify:skills
```

This check protects the source tree that the installer and runtime mirror consume.

It enforces:

- unique `name`
- non-empty `description`
- explicit `user-invocable`
- one authoritative `SKILL.md` per skill directory
- at most one `scripts/*.js` entrypoint per skill
- no revival of the retired repo-root `skills/` mirror

This contract is intentionally narrow. It answers: "Can the repository still discover, mirror, and distribute skills safely?"

### 2. Bundle governance contract

Run:

```bash
npm run verify:skill-system
```

This check protects the portable bundle as a system.

It enforces or audits:

- schema-v2 frontmatter presence on bundle skills
- layer and kind consistency
- registry, route-map, and route-fixture coverage
- bundle-level system readiness artifact freshness
- reference-link existence
- scripted runtime surface integrity
- template scaffold integrity
- lifecycle review hygiene
- legacy mirror retirement

This contract answers: "Is the skill system still coherent, governable, and safe to evolve?"

Treat both checks as required.

## Layer Model

Every public skill should belong to one primary layer.

| Layer | Purpose |
| --- | --- |
| `routers/` | Dispatch, conflict policy, fallback behavior |
| `domains/` | Judgment, domain knowledge, decision heuristics |
| `workflows/` | Multi-step execution chains |
| `tools/` | Deterministic validation, generation, or analysis |
| `guards/` | Risk gates downstream of routing |
| `adapters/` | Host-specific notes and capability hints |

Do not blur these without a strong reason. If a skill both routes and executes, split the routing concern from the execution concern unless doing so would make the system harder to use.

`adapters/` are governed skills, but they are not part of the normal public route surface. Use them for host-specific compatibility notes, translation rules, or capability hints that should remain discoverable and packable without competing in ordinary request routing.

For the current governed kind matrix, including route participation, placeholder-route policy, capability-module scaffold support, and scaffold-lineage tracking, use the generated governance reference instead of copying the current kind list by hand.

## Kind Governance Source

Code-level `kind` semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-kind-governance.js`

When you need to add a future skill kind or change kind-level behavior, update that file first.

It is the shared source for:

- layer-to-kind mapping
- template coverage expectations
- route-surface participation
- placeholder-route policy
- capability-module scaffold policy
- scaffold-lineage tracking

## Frontmatter Governance Source

Code-level core frontmatter enums and required-key semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-frontmatter-governance.js`

When you need to change canonical frontmatter contract values, update that file first.

It is the shared source for:

- required frontmatter keys enforced by bundle validation
- visibility enum order
- trigger-mode enum order
- runtime and executor enum order
- risk-level enum order
- supported-host enum order used by skill frontmatter and managed route defaults

The checked-in frontmatter schema at `personal-skill-system/registry/skill.schema.json` is a generated governance artifact from that source. Do not hand-edit the schema first; update the governance module and let the governed refresh path rewrite the schema.

For the current required frontmatter keys and enum values, use the generated governance reference instead of duplicating the live token sets here.

The governed portfolio board also has two surfaces:

- `personal-skill-system/registry/skill-investment-backlog.generated.json` for machine-readable backlog synthesis
- `personal-skill-system/skills/routers/sage/references/skill-investment-backlog.generated.md` for human review and planning

## Lifecycle Governance Source

Code-level `status` semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-lifecycle-governance.js`

When you need to change lifecycle behavior, update that file first.

It is the shared source for:

- which statuses are writable through governed commands
- which statuses count as live / review-governed / runtime-proof-governed
- status-to-skill-level-summary mapping
- default runtime-proof level by status
- evolution action names and default target-status mapping

## Route Fixture Governance Source

Code-level route-fixture semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-route-fixture-governance.js`

When you need to change governed placeholder-route fixture behavior or route-evidence semantics, update that file first.

It is the shared source for:

- governed placeholder fixture naming and query generation
- real-evidence vs governed-evidence distinction for top-tier promotion
- route-fixture expectation parsing for direct-route vs fallback assertions
- governed fixture lookup and per-skill evidence summaries used by hardening/promotion views

## Smoke Manifest Governance Source

Code-level `scripts/smoke.json` semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-smoke-manifest-governance.js`

When you need to change smoke-manifest validation or contract shape, update that file first.

It is the shared source for:

- `scripts/smoke.json` schema version
- smoke-manifest `cwd` modes and freshness units
- smoke-manifest path helper and validation rules

## Host Governance Source

Code-level host and host-smoke governance semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-host-governance.js`

When you need to change host-smoke or host-writeability behavior, update that file first.

It is the shared source for:

- host-smoke policy tiers and target levels
- governed runtime-proof eligibility for scripted tools and guards
- host-writeability severity rules, including the authoritative skill-tree create surface

## Runtime-Proof Governance Source

Code-level runtime-proof semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-runtime-proof-governance.js`

When you need to change runtime-proof behavior, update that file first.

It is the shared source for:

- `runtime-proof.generated.json` schema-version and registry document shape helpers
- minimum Runtime Proof contract floor and evidence-test requirement semantics
- governed runtime-proof entry construction from authoritative skill metadata
- evidence-test normalization and selection precedence
- host-smoke-backed runtime-proof policy/error semantics used by lifecycle and validation flows
- smoke-manifest validation used by runtime-proof, template, and skill validation flows

## Expert-Source Governance Source

Code-level expert-source family semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-expert-source-governance.js`

When you need to change expert-source family behavior, update that file first.

It is the shared source for:

- expert-source family status semantics and default-family policy
- expert-source family id rules and archive eligibility
- default integration-ledger and raw-root conventions for future expert-source families
- experimental-pack required include policy for governed expert-source families

## Future-Skill Governance Source

Code-level future-skill intake and materialization semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-future-governance.js`

When you need to change how future skills move through governed intake, update that file first.

It is the shared source for:

- opportunity queue priorities, horizons, and active vs closed statuses
- admission decision actions and their default admission/opportunity status transitions
- admission active vs terminal vs blocking status semantics
- pending scaffold active status semantics for deferred host-blocked materialization flows
- shared future-skill registry source markers and status-summary construction used by governed opportunity/pending-scaffold registries

## Ledger Governance Source

Code-level admission and evolution ledger semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-ledger-governance.js`

When you need to change admission/evolution ledger paths, schema versions, normalization rules, or validation behavior, update that file first.

It is the shared source for:

- admission and evolution ledger artifact paths
- ledger schema versions and canonical entry normalization
- governed read/write document shape used by `manage-skill`
- ledger validation behavior consumed by `verify-skill-system` and host-evolution diagnostics

## Capability Ratings Governance Source

Code-level capability-module ratings semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-capability-ratings-governance.js`

When you need to change capability-module bucket semantics, mirrored ratings doc behavior, or stable-promotion module-depth checks, update that file first.

It is the shared source for:

- capability-module rating bucket order and promotion-step policy
- skill-level-summary normalization attached to ratings governance
- `capability-ratings.generated.json` and `docs/CAPABILITY_MODULE_RATINGS.md` path/sync helpers
- shared `top-ready` blocker construction used by promotion checks and bundle validation

## Derived Governance Refresh Source

Code-level derived-governance refresh semantics are centralized in:

- `personal-skill-system/skills/tools/lib/skill-system-derived-governance.js`

When you need to change how self-smoke or governed export flows rebuild derived governance artifacts, update that file first.

It is the shared source for:

- the canonical refresh-step plan, including step order, artifact membership, and governed artifact paths
- governed refresh order for `runtime-proof`, `review-queue`, capability ratings, expert-source family scorecard, host-smoke scorecard, and investment backlog
- self-smoke reconstruction used by `verify-skill-system --self-smoke`
- derived-governance export payload construction for blocked `system-readiness` / `host-evolution` recovery loops

## Canonical Frontmatter

Bundle skills use schema-version 2 frontmatter.

Minimal example:

```yaml
---
schema-version: 2
name: verify-quality
title: Verify Quality Tool
description: Analyze maintainability and engineering quality drift in a codebase. Use when the task is an explicit quality audit or a quality gate.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [manual]
trigger-keywords: [verify-quality, quality audit, quality gate]
negative-keywords: []
priority: 90
runtime: scripted
executor: node
permissions: [Read, Bash]
risk-level: low
supported-hosts: [codex, claude, gemini]
status: stable
owner: self
last-reviewed: 2026-05-06
review-cycle-days: 30
tags: [tool, quality]
aliases: [vq]
---
```

`visibility` currently supports `public`, `private`, `project`, and `internal`.
Use `internal` for governed host-facing support skills such as `adapters/` that should stay packable and reviewable without participating in the ordinary public route surface.

## Lifecycle Model

Every skill should move through an explicit lifecycle.

The current governed lifecycle matrix, including writable vs live vs review-governed vs runtime-proof-governed semantics and default runtime-proof levels, lives in the generated governance reference.

Use `archive` before destructive deletion unless history is obviously disposable.

## Top-Tier Standard

A skill is not top-tier because it is long. A top-tier skill has a clean surface and deep usable internals.

For a current or future skill to count as top-tier, it should satisfy all of these:

1. Clear route surface
   - The description says when to use it.
   - Trigger keywords are specific.
   - Conflicts and fallback behavior are deliberate.

2. Thin entry, deep references
   - `SKILL.md` gives the operating model.
   - Dense detail lives in `references/`.
   - Reference filenames are stable and easy to navigate.

3. Real lifecycle ownership
   - `owner`, `last-reviewed`, and `review-cycle-days` are present.
   - Review cadence matches the volatility of the skill.

4. Honest runtime contract
   - `runtime`, `executor`, `permissions`, and scripts match reality.
   - Scripted skills expose `scripts/run.js`.
   - Stable scripted tools and guards keep `Runtime Proof` bullets aligned with `runtime-proof.generated.json`.
   - Governed scripted tools and guards declare `host-smoke-tier` and `host-smoke-target-level` in frontmatter; `host-smoke-freshness-days` is required when the target level is `host-smoked`.
   - Use the generated governance reference for the current host-smoke tiers, target levels, cwd modes, freshness units, result statuses, and invalidation reasons.

5. Governed host metadata
   - `agents/openai.yaml` should exist for any skill you expect to surface cleanly in host UIs.
   - `display_name`, `short_description`, and `default_prompt` should mirror `SKILL.md` instead of drifting into a second undocumented source of truth.

6. Proof surface
   - Registry and route-map entries are aligned.
   - Route-shared metadata stays governed from `SKILL.md` for `trigger-keywords`, `negative-keywords`, `aliases`, `conflicts-with`, `auto-chain`, `supported-hosts`, and explicit-vs-auto trigger mode.
   - Route-only tuning fields such as richer rationale, confidence thresholds, fallback prompts, and final route scoring priority may still live in `route-map.generated.json`.
   - Route fixtures cover representative activation paths.
   - Tool and guard behavior has runtime tests when the blast radius justifies it.
   - Runtime-proof evidence points to real test cases, not placeholder claims.

This repository treats "top-tier now" and "easy to evolve later" as one requirement, not two separate goals.

- existing skills should harden through governed evolution and proof
- future skills should enter through opportunity or admission flow before direct creation
- removals should leave clean history, not silent disappearance

## Recommended Authoring Flow

### Add a new skill

0. If the boundary is still fuzzy, record the demand before creating anything:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js record-opportunity --name <capability-name> --kind <kind>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --name <capability-name> --kind <kind>
```

Use `admission-check --opportunity-id <id>` when the future-skill demand already exists in the governed queue.
Admission decisions are centrally governed by action, not by ad hoc ledger shape:

- `create-new-skill` must carry `suggested_kind`.
- `reuse-existing-skill` must carry `target_skill` and `target_kind`.
- `upgrade-existing-skill` must carry `target_skill`, `target_kind`, and `suggested_kind`.
- `clarify-or-merge-boundary` must carry `primary_skill`, `competing_skill`, and `suggested_kind`.

Do not hand-edit `admission-ledger.generated.json` with extra decision fields. The generated governance reference is the contract surface for allowed and required admission fields.

1. Use the canonical scaffold path only after the boundary is sharp:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create <kind> <skill-name>
```

Supported scaffold kinds come from centralized kind governance; use the generated governance reference for the current list.
Use `adapter` for host-specific import notes, compatibility constraints, or capability hints that belong in the governed skill tree but should stay off the normal routed public surface.

If the new skill kind supports capability-module scaffolding and you want future governance surfaces scaffolded immediately, use:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create <kind> <skill-name> --scaffold-modules
```

Current capability-module scaffold kinds are `domain` and `workflow`.

This seeds:

- a `registry.generated.json` module-group for the new host skill
- placeholder `expert-modules` on the generated route entry
- `thin` capability-module ratings for the new reference-backed modules
- `next-batch` governance entries in `capability-ratings.generated.json` so unfinished module depth is queued explicitly instead of becoming hidden follow-up debt
- `owner`, `last-reviewed`, and `review-cycle-days` from centralized review-metadata seed policy, using the scaffold creation date rather than copying the template's own review history

2. Replace template placeholders:
   - description
   - trigger keywords
   - aliases
   - owner
   - lifecycle dates
   - reference contents
   - host metadata will be scaffolded, but rerun governed sync after any metadata edits

3. Decide whether the skill should be public, explicit-only, or internal in practice.

4. Add or deepen `references/` before bloating `SKILL.md`.

5. For scripted skills, replace the stub `scripts/run.js` with real logic.

6. For stable-bound scripted tools and guards, write a `## Runtime Proof` section in `SKILL.md` and sync matching contracts into `personal-skill-system/registry/runtime-proof.generated.json`.

7. Prefer `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof <skill-name>` instead of hand-editing runtime-proof registry drift.
   That governed sync should also auto-promote a stable scripted tool or guard from `declared-only` to the lifecycle-required proof floor once valid evidence tests and contracts already exist.

8. Link at least one concrete runtime or governance test to that runtime-proof entry.

9. If the skill targets `host-smoked`, keep `scripts/smoke.json` freshness aligned with `host-smoke-freshness-days`.
   `host-smoked` is evidence-backed, not sticky: if contract, pass state, or freshness drift, `manage-skill sync-runtime-proof` should downgrade the level back to the default governed state until fresh passing evidence exists again.
   When the contract itself changes, `sync-runtime-proof` should also invalidate older drifted runtime host-smoke artifacts through `benchmark/host-smoke/invalidation.generated.json` instead of leaving historical warnings behind.

10. Change lifecycle state through the governed command instead of hand-editing `status`:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status <skill-name> <status>
```

11. Run:

```bash
npm run verify:skills
npm run verify:skill-system
```

12. Refresh benchmark governance artifacts when you change benchmark, runtime-proof, or host-smoke surfaces:

```bash
node personal-skill-system/benchmark/scripts/generate-summary.js
node personal-skill-system/benchmark/scripts/generate-system-readiness.js
```

   `system-readiness.generated.json` is a derived governance snapshot. If the current host cannot rewrite that file but can still rewrite runtime-proof, scorecard, and invalidation artifacts, keep the core runtime-proof and host-smoke sync moving and carry the readiness rewrite failure as explicit follow-up debt instead of blocking all contract governance.
   When generated governance artifact paths or write-mode expectations change, update the shared artifact catalog first instead of hand-editing separate path lists across readiness, verify-skill-system self-smoke, derived-governance export, or host-writeability probes. Use the generated governance reference for the current artifact id/path/mode catalog and writeability severity matrix.

13. Add or update tests if the skill changes executable behavior or routing semantics.

14. When a domain or workflow module genuinely gets deeper, promote it through the governed capability command instead of hand-editing generated files:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-module-rating <module-id> <thin|strong-but-not-top|top-ready>
```

Use `--skill <skill-name>` to move all modules owned by one host skill together. Default policy only allows one-bucket moves; require `--allow-skip` for intentional re-baselining.

15. When you edit `name`, `title`, `description`, or anything that affects host-facing labels, regenerate governed host metadata instead of hand-editing `agents/openai.yaml`:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-host-metadata --skill <skill-name>
```

For migration or debt cleanup across the current stable set:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-host-metadata --all
```

16. When you edit frontmatter that changes the shared route surface, regenerate governed route metadata instead of hand-editing the matching route entry:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-route-metadata --skill <skill-name>
```

For migration or debt cleanup across the current governed route surface:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-route-metadata --all
```

This governed sync also refreshes route `expert-modules` from the skill's registered module-group, so route depth bindings do not drift from the capability-module surface.

### Upgrade an existing skill

Start from governed diagnosis rather than prose-first editing:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check <skill-name>
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier <skill-name>
```

Use this order:

1. tighten route surface
2. deepen references
3. promote affected capability modules with `manage-skill set-module-rating` once the deeper reference work is real
4. harden scripted behavior
5. add route fixtures or runtime tests
6. move lifecycle status only after evidence exists, using `manage-skill set-status`

Do not promote a skill to `stable` if the only improvement is more prose.

### Deprecate or archive a skill

Prefer governed lifecycle evaluation before mutating status:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check <skill-name>
```

1. mark lifecycle status
2. remove or narrow active routing as appropriate
3. point users toward the replacement surface
4. rerun both verification commands

### Delete a skill

Prefer the authoritative delete flow:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete --path <layer>/<skill-name>
```

Delete only after archive is unnecessary and generated surfaces can be safely updated.

## Common Failure Modes

- treating `SKILL.md` body as metadata instead of frontmatter
- creating a broad public route for a thin or weak skill
- creating a new sibling skill before checking whether an existing route should simply become deeper
- hiding essential operating rules in external docs not copied into the bundle
- adding new public skills instead of deepening references behind an existing stable route
- keeping archived skills on the active route surface
- changing runtime behavior without adding tests or fixtures

## Related Documents

- [DESIGN.md](/D:/Download/gaming/new_program/code-abyss/DESIGN.md)
- [README.md](/D:/Download/gaming/new_program/code-abyss/README.md)
- [TOP_TIER_SKILL_STANDARD.md](/D:/Download/gaming/new_program/code-abyss/personal-skill-system/docs/TOP_TIER_SKILL_STANDARD.md)
- [SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md](/D:/Download/gaming/new_program/code-abyss/personal-skill-system/docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md)
