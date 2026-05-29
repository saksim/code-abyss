# Top Skill Integration Inventory (2026-05-29)

Source plan: `TOP_SKILL_INTEGRATION_CONSTRUCTION_PLAN_2026-05-29.md`.

Purpose: record the first controlled inventory of currently available non-project SKILL sources against the governed `personal-skill-system/skills/` tree. This document satisfies `TOPINT-P0-001` and `TOPINT-P0-002` for the first upgrade pass.

## Inventory Snapshot

| Surface | Count | Notes |
|---|---:|---|
| Project governed skills | 39 | Authoritative source is `personal-skill-system/skills/`. |
| Codex user/system skills | 34 | Includes domain indexes, top-developer overlays, and system skills. |
| Agent pack skills | 36 | Mostly gstack runtime skills installed under `.agents/skills/gstack`. |
| Built-in system skill copy | 5 | Duplicates of system skills such as `openai-docs` and `imagegen`. |

## Decision Classes

| Class | Meaning |
|---|---|
| `merge-depth` | Existing project skill owns the route; absorb only useful depth into references or scripts. |
| `admit` | Run governed `manage-skill admission-check` before creating or merging. |
| `pack-owned` | Keep as external pack runtime; improve discoverability and route guidance instead of copying to core. |
| `raw-source` | Treat as expert material to split into task-shaped references. |
| `reject-core` | Do not integrate into core; current project already owns the concern or the source is too host-specific/generic. |

## Missing From Project Core

| Incoming skill or family | Source | Decision | Target owner | Rationale |
|---|---|---|---|---|
| `openai-docs` | Codex system | `admit` | New skill or `ai` after admission | Official OpenAI docs lookup and model-upgrade guidance may deserve a first-class route, but it is temporally unstable and host/tool dependent. |
| `imagegen` | Codex system | `admit` | New tool, pack bridge, or host adapter after admission | Raster generation depends on host image tooling and asset handling; portability must be explicit. |
| `plugin-creator` | Codex system | `admit` | `codex` adapter or tool after admission | Codex plugin scaffolding is host-specific and should not imply Claude/Gemini parity. |
| `skill-creator` | Codex system | `merge-depth` | `skill-evolution`, `manage-skill` | The project already has governed skill authoring, admission, templates, and lifecycle controls. |
| `skill-installer` | Codex system | `reject-core` / pack docs | Personal Skill System installer and pack docs | Personal Skill System owns install, uninstall, pack, and vendor flows; adding a second installer skill would confuse ownership. |
| `browse`, `qa`, `benchmark`, `canary`, `design-review`, `health`, `open-gstack-browser`, and related gstack skills | gstack pack | `pack-owned` | `packs/gstack`, router references | Heavy browser/runtime workflows should stay pinned through `packs/gstack/manifest.json`. |
| `land-and-deploy`, `setup-deploy`, `document-release`, `retro`, `learn` | gstack pack | `pack-owned` with selective depth absorption | `ship`, `devops`, docs | Keep runtime in gstack; only absorb release heuristics that improve core judgement. |
| `careful`, `freeze`, `guard`, `unfreeze`, `checkpoint` | gstack pack | `pack-owned` / `merge-depth` | `host-governance`, `pre-commit-gate`, docs | These overlap host safety and guard behavior; avoid duplicate public routes. |
| `top-architect`, platform architect variants | top-developer | `raw-source` | `architecture`, `architecture-decision` | Split into constraints, scoring, migration, rollback, ownership, HA, and platform governance references. |
| `top-middleware-evolutionary` | top-developer | `raw-source` | `architecture`, `infrastructure` | Use as input to middleware, data-plane, cache, queue, and migration references. |
| `top-performance-optimizer` | top-developer | `raw-source` | `development`, `architecture` | Absorb measured performance methodology; consider future `performance` domain only if routing demand grows. |
| `top-python-dev` | top-developer | `raw-source` / `merge-depth` | `development` | Existing development references already own Python depth; absorb missing runtime and production heuristics only. |
| `top-qa` | top-developer | `raw-source` / `merge-depth` | `review`, `verify-quality`, `pre-merge-gate` | Absorb evidence, severity, test-surface, and release-readiness rules. |

## Existing Overlap Already Stronger In Project

| Skill | Project state | Incoming source treatment |
|---|---|---|
| `development` | Domain with deep references and capability modules. | Merge only targeted language/runtime depth. |
| `architecture` | Domain with decision, migration, reliability, performance, and governance references. | Merge only non-duplicative top-developer material. |
| `security` | Domain plus `verify-security` tool. | Merge CSO/security patterns as references only when they improve trust-boundary judgement. |
| `review` | Workflow with findings, severity, CI, mocks, tests, release, git, and defect-governance references. | Merge top-qa evidence rules, not a sibling QA route. |
| `ship` | Workflow with readiness and rollback references. | Keep gstack deployment runtime pack-owned; merge release heuristics only. |
| `verify-change`, `verify-quality`, `verify-security`, `verify-module` | Scripted governed tools. | Do not replace with legacy/root copies. |
| frontend design variants | Canonical variant paths under `domains/frontend-design/variants/`. | Do not restore legacy flat variant paths. |

## First-Pass Decisions

| Card | Status | Evidence |
|---|---|---|
| `TOPINT-P0-001` | Done | This inventory document. |
| `TOPINT-P0-002` | Done | Decision class table above. |
| `TOPINT-P0-003` | Done | Admission ledger advises reuse for `openai-docs`; `imagegen` and `plugin-creator` were created through governed flow and resolved as implemented. |
| `TOPINT-P0-004` | Done | `GSTACK_PACK_OWNERSHIP_DECISION_2026-05-29.md`. |

## Follow-Up Pulls

1. Keep OpenAI API guidance under the existing `ai` owner unless a future admission decision approves a standalone `openai-docs` route.
2. Keep `imagegen` and `plugin-creator` experimental until real project usage and host portability evidence justify stable promotion.
3. Complete the deferred gstack pack host-smoke target when P2-004 is pulled.
4. Re-run the release validation profile, including tarball smoke, before npm release.
