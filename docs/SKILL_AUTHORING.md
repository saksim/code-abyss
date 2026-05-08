# Skill Authoring

This repository has one authoritative skill source tree:

- `personal-skill-system/skills/**/SKILL.md`

Do not author or revive repo-root `skills/`.

## What This Document Covers

Use this document when you add, upgrade, deprecate, archive, or delete skills inside the personal skill system.

It describes the real contracts enforced by the repository today, not a loose writing guide.

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

## Lifecycle Model

Every skill should move through an explicit lifecycle.

| Status | Meaning | Expected behavior |
| --- | --- | --- |
| `draft` | Scaffold or incomplete design | May have narrow or placeholder routing; must not be marketed as top-tier |
| `experimental` | Real but still under evaluation | Keep scope narrow and gather route/test evidence |
| `stable` | Default production skill | Requires strong references, review rhythm, and trustworthy routing |
| `deprecated` | Still present but no longer preferred | Keep migration notes explicit and avoid adding new depth here |
| `archived` | Retained for history only | Remove from active route surface and stop treating it as a live capability |

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

## Recommended Authoring Flow

### Add a new skill

1. Use the canonical scaffold path:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create <kind> <skill-name>
```

Supported scaffold kinds are `router`, `domain`, `workflow`, `tool`, `guard`, and `adapter`.
Use `adapter` for host-specific import notes, compatibility constraints, or capability hints that belong in the governed skill tree but should stay off the normal routed public surface.

If the new skill is a `domain` or `workflow` and you want future governance surfaces scaffolded immediately, use:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create <kind> <skill-name> --scaffold-modules
```

This seeds:

- a `registry.generated.json` module-group for the new host skill
- placeholder `expert-modules` on the generated route entry
- `thin` capability-module ratings for the new reference-backed modules
- `next-batch` governance entries in `capability-ratings.generated.json` so unfinished module depth is queued explicitly instead of becoming hidden follow-up debt

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

8. Link at least one concrete runtime or governance test to that runtime-proof entry.

9. If the skill targets `host-smoked`, keep `scripts/smoke.json` freshness aligned with `host-smoke-freshness-days`.
   `host-smoked` is evidence-backed, not sticky: if contract, pass state, or freshness drift, `manage-skill sync-runtime-proof` should downgrade the level back to the default governed state until fresh passing evidence exists again.
   When the contract itself changes, `sync-runtime-proof` should also invalidate older drifted runtime host-smoke artifacts through `benchmark/host-smoke/invalidation.generated.json` instead of leaving historical warnings behind.

10. Change lifecycle state through the governed command instead of hand-editing `status`:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status <skill-name> <draft|experimental|stable|deprecated|archived>
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

Use this order:

1. tighten route surface
2. deepen references
3. promote affected capability modules with `manage-skill set-module-rating` once the deeper reference work is real
4. harden scripted behavior
5. add route fixtures or runtime tests
6. move lifecycle status only after evidence exists, using `manage-skill set-status`

Do not promote a skill to `stable` if the only improvement is more prose.

### Deprecate or archive a skill

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
- hiding essential operating rules in external docs not copied into the bundle
- adding new public skills instead of deepening references behind an existing stable route
- keeping archived skills on the active route surface
- changing runtime behavior without adding tests or fixtures

## Related Documents

- [DESIGN.md](/D:/Download/gaming/new_program/code-abyss/DESIGN.md)
- [README.md](/D:/Download/gaming/new_program/code-abyss/README.md)
- [TOP_TIER_SKILL_STANDARD.md](/D:/Download/gaming/new_program/code-abyss/personal-skill-system/docs/TOP_TIER_SKILL_STANDARD.md)
