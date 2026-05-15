# Skill Authoring Governance Reference

Generated from the governance modules under `personal-skill-system/skills/tools/lib/`.
Do not hand-edit this file. Update the governance source modules, then rerun `verify-skill-system --self-smoke` or another derived-governance refresh path.

Use this reference for volatile token sets and matrices that should not be copied by hand into authoring docs.

## Governed Tokens

- skill kinds: `router`, `domain`, `workflow`, `tool`, `guard`, `adapter`
- writable lifecycle statuses: `draft`, `experimental`, `stable`, `deprecated`, `archived`
- runtime-proof levels: `declared-only`, `declared-and-tested`, `host-smoked`
- future-skill priorities: `critical`, `high`, `normal`
- future-skill horizons: `now`, `next`, `later`

## Skill Kinds

| Kind | Layer | Active Route | Governed Route | Placeholder Route | Module Scaffold | Lineage | Min Refs | Top-tier Floor | Template Floor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `router` | `routers/` | no | no | no | no | no | 2 | 2 | 2 |
| `domain` | `domains/` | yes | yes | yes | yes | yes | 2 | 3 | 3 |
| `workflow` | `workflows/` | yes | yes | yes | yes | yes | 2 | 3 | 3 |
| `tool` | `tools/` | yes | yes | yes | no | yes | 2 | 2 | 2 |
| `guard` | `guards/` | yes | yes | yes | no | yes | 2 | 2 | 2 |
| `adapter` | `adapters/` | no | no | no | no | no | 2 | 2 | 2 |

## Frontmatter Enums

- required keys: `schema-version`, `name`, `description`, `kind`, `user-invocable`, `trigger-mode`, `priority`, `runtime`, `executor`, `supported-hosts`, `status`
- visibility: `public`, `private`, `project`, `internal`
- trigger-mode: `auto`, `manual`
- runtime: `knowledge`, `scripted`, `hybrid`
- executor: `none`, `node`, `python`, `bash`, `powershell`
- risk-level: `low`, `medium`, `high`, `critical`
- supported-hosts: `codex`, `claude`, `gemini`

## Lifecycle

| Status | Writable | Live | Review-governed | Runtime-proof-governed | Skill-level Bucket | Default Runtime-proof Level |
| --- | --- | --- | --- | --- | --- | --- |
| `archived` | yes | no | no | no | - | `declared-only` |
| `deleted` | no | no | no | no | - | `declared-only` |
| `deprecated` | yes | yes | yes | yes | `useful-overlay-not-top-level-alone` | `declared-only` |
| `draft` | yes | no | no | no | - | `declared-only` |
| `experimental` | yes | yes | yes | yes | `strong-uplift-but-not-top-yet` | `declared-only` |
| `stable` | yes | yes | yes | yes | `top-level-enough-now` | `declared-and-tested` |

## Review Metadata Seed Policy

- default owner for newly scaffolded skills: `self`
- new skills should seed `last-reviewed` from scaffold creation date instead of copying the template review date

| Kind | Seed Owner | Seed Review Cycle Days |
| --- | --- | --- |
| `router` | `self` | 90 |
| `domain` | `self` | 60 |
| `workflow` | `self` | 60 |
| `tool` | `self` | 45 |
| `guard` | `self` | 45 |
| `adapter` | `self` | 60 |

## Runtime Proof

- minimum contracts for a governed runtime-proof entry: 2
- evidence-test source order: `explicit`, `existing`, `suggested`, `none`
- levels that require evidence tests: `declared-and-tested`, `host-smoked`

## Future-Skill Intake

### Opportunity Statuses

| Status | Active | Blocking |
| --- | --- | --- |
| `open` | yes | no |
| `planned` | yes | no |
| `in-progress` | yes | no |
| `blocked` | yes | yes |
| `deferred` | yes | no |
| `implemented` | no | no |
| `cancelled` | no | no |

### Admission Decision Actions

| Action | Default Admission Status | Default Opportunity Status |
| --- | --- | --- |
| `create-new-skill` | `open` | `planned` |
| `clarify-or-merge-boundary` | `blocked` | `blocked` |
| `reuse-existing-skill` | `advised-reuse` | `cancelled` |
| `upgrade-existing-skill` | `advised-upgrade` | `cancelled` |

### Admission Statuses

| Status | Active | Terminal | Blocking |
| --- | --- | --- | --- |
| `open` | yes | no | no |
| `planned` | yes | no | no |
| `in-progress` | yes | no | no |
| `blocked` | yes | no | yes |
| `deferred` | yes | no | no |
| `implemented` | no | yes | no |
| `cancelled` | no | yes | no |
| `resolved` | no | yes | no |
| `advised-reuse` | no | yes | no |
| `advised-upgrade` | no | yes | no |
| `advised-noop` | no | yes | no |

### Pending Scaffold Statuses

| Status | Active | Blocking |
| --- | --- | --- |
| `planned` | yes | no |
| `in-progress` | yes | no |
| `blocked` | yes | yes |
| `deferred` | yes | no |

## Host-Smoke Governance

- policy tiers: `critical`, `experimental`, `standard`
- target levels: `declared-and-tested`, `declared-only`, `host-smoked`
- command cwd modes: `bundle-root`, `skill-dir`
- freshness units: `days`, `hours`
- result statuses: `fail`, `pass`
- invalidation reasons: `contract-drift`, `manual-reset`, `superseded`

### Writeability Severities

| Artifact Id | Severity | Path | Mode |
| --- | --- | --- | --- |
| `runtime-proof` | `critical` | `registry/runtime-proof.generated.json` | `rewrite-file` |
| `host-smoke-scorecard` | `critical` | `benchmark/host-smoke/scorecard.generated.json` | `rewrite-file` |
| `system-readiness` | `high` | `benchmark/system-readiness.generated.json` | `rewrite-file` |
| `host-smoke-runtime-runs` | `critical` | `benchmark/host-smoke/runtime-runs` | `write-dir` |

### Readiness Schema Surfaces

- centralized readiness schemas: `system-readiness-schema`, `host-evolution-schema`

## Portfolio Surfaces

- `registry/skill-investment-backlog.generated.json`: machine-readable portfolio board for current-skill hardening, future-skill intake, lifecycle debt, and host constraints
- `skills/routers/sage/references/skill-investment-backlog.generated.md`: human-readable mirror of the governed investment backlog for regular review and planning
- skill deletion is governed too: active opportunity/admission/evolution/pending-scaffold/expert-source references block deletion, while historical references are only valid after a recorded `delete` evolution outcome exists

## Derived-Governance Refresh Plan

| Step Id | Label | Artifacts | Purpose |
| --- | --- | --- | --- |
| `runtime-proof` | Runtime-proof registry | `runtime-proof` | Normalize runtime-proof floors before downstream readiness and host-evolution refreshes. |
| `skill-catalog` | Skill catalog reference | `skill-catalog` | Keep the router-facing catalog aligned with the governed registry. |
| `authoring-governance-reference` | Authoring governance reference | `authoring-governance-reference` | Expose volatile governance tokens and refresh policy from one generated authoring reference. |
| `skill-frontmatter-schema` | Skill frontmatter schema | `skill-frontmatter-schema` | Refresh the canonical frontmatter schema before later validation or scaffold work. |
| `future-registry-schemas` | Future-skill registry schemas | `skill-opportunity-queue-schema`, `admission-ledger-schema`, `evolution-ledger-schema`, `pending-scaffolds-schema` | Refresh future-skill intake schemas from the centralized future-governance rules. |
| `skill-investment-backlog-schema` | Investment backlog schema | `skill-investment-backlog-schema` | Refresh the governed portfolio/backlog schema before backlog regeneration. |
| `readiness-schemas` | Readiness and host-evolution schemas | `system-readiness-schema`, `host-evolution-schema` | Refresh the centralized host-readiness and host-evolution schemas before rebuilding host-specific readiness artifacts. |
| `review-queue-schema` | Review queue schema | `review-queue-schema` | Refresh the governed review-cadence schema before queue regeneration. |
| `capability-ratings-schema` | Capability ratings schema | `capability-ratings-schema` | Refresh the capability-ratings schema before ratings regeneration. |
| `expert-source-schemas` | Expert-source schemas | `expert-source-families-schema`, `expert-source-family-scorecard-schema`, `expert-source-integration-schema` | Refresh expert-source family schemas before scorecard and backlog synthesis. |
| `review-queue` | Review queue registry | `review-queue` | Rebuild the governed live-skill review queue from current lifecycle metadata. |
| `capability-ratings` | Capability ratings surfaces | `capability-ratings`, `capability-ratings-doc` | Regenerate capability-module ratings and the mirrored human-readable ratings doc together. |
| `expert-source-family-scorecard` | Expert-source family scorecard | `expert-source-family-scorecard` | Recompute expert-source family health so raw-source integration debt stays inspectable. |
| `host-smoke-scorecard` | Host-smoke scorecard | `host-smoke-scorecard` | Recompute host-smoke evidence freshness before readiness rollups. |
| `skill-investment-backlog` | Skill investment backlog surfaces | `skill-investment-backlog`, `skill-investment-backlog-doc` | Rebuild the portfolio backlog and its router-readable mirror from current governance debt. |
| `system-readiness` | System readiness and host evolution | `system-readiness`, `host-evolution` | Finish the cycle by rebuilding host-specific readiness and recovery artifacts from refreshed governance state. |

## Generated Governance Artifacts

| Artifact Id | Relative Path | Mode | Writeability Tracked | Fingerprint Source |
| --- | --- | --- | --- | --- |
| `registry` | `registry/registry.generated.json` | `rewrite-file` | yes | yes |
| `route-map` | `registry/route-map.generated.json` | `rewrite-file` | yes | yes |
| `route-fixtures` | `registry/route-fixtures.generated.json` | `rewrite-file` | yes | yes |
| `skill-catalog` | `skills/routers/sage/references/skill-catalog.generated.md` | `rewrite-file` | yes | yes |
| `capability-ratings` | `registry/capability-ratings.generated.json` | `rewrite-file` | yes | no |
| `capability-ratings-doc` | `docs/CAPABILITY_MODULE_RATINGS.md` | `rewrite-file` | yes | yes |
| `capability-ratings-schema` | `registry/capability-ratings.schema.json` | `rewrite-file` | yes | yes |
| `skill-opportunity-queue` | `registry/skill-opportunity-queue.generated.json` | `rewrite-file` | yes | no |
| `skill-opportunity-queue-schema` | `registry/skill-opportunity-queue.schema.json` | `rewrite-file` | yes | yes |
| `review-queue` | `registry/review-queue.generated.json` | `rewrite-file` | yes | yes |
| `review-queue-schema` | `registry/review-queue.schema.json` | `rewrite-file` | yes | yes |
| `admission-ledger` | `registry/admission-ledger.generated.json` | `rewrite-file` | yes | yes |
| `admission-ledger-schema` | `registry/admission-ledger.schema.json` | `rewrite-file` | yes | yes |
| `evolution-ledger` | `registry/evolution-ledger.generated.json` | `rewrite-file` | yes | no |
| `evolution-ledger-schema` | `registry/evolution-ledger.schema.json` | `rewrite-file` | yes | yes |
| `runtime-proof` | `registry/runtime-proof.generated.json` | `rewrite-file` | yes | yes |
| `skill-frontmatter-schema` | `registry/skill.schema.json` | `rewrite-file` | yes | yes |
| `skill-investment-backlog` | `registry/skill-investment-backlog.generated.json` | `rewrite-file` | yes | yes |
| `skill-investment-backlog-doc` | `skills/routers/sage/references/skill-investment-backlog.generated.md` | `rewrite-file` | yes | yes |
| `skill-investment-backlog-schema` | `registry/skill-investment-backlog.schema.json` | `rewrite-file` | yes | yes |
| `expert-source-families` | `registry/expert-source-families.generated.json` | `rewrite-file` | yes | no |
| `expert-source-families-schema` | `registry/expert-source-families.schema.json` | `rewrite-file` | yes | yes |
| `expert-source-family-scorecard` | `registry/expert-source-family-scorecard.generated.json` | `rewrite-file` | yes | yes |
| `expert-source-family-scorecard-schema` | `registry/expert-source-family-scorecard.schema.json` | `rewrite-file` | yes | yes |
| `expert-source-integration-schema` | `registry/expert-source-integration.schema.json` | `rewrite-file` | yes | yes |
| `authoring-governance-reference` | `docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md` | `rewrite-file` | yes | yes |
| `pending-scaffolds` | `registry/pending-scaffolds.generated.json` | `rewrite-file` | yes | yes |
| `pending-scaffolds-schema` | `registry/pending-scaffolds.schema.json` | `rewrite-file` | yes | yes |
| `benchmark-summary` | `benchmark/summary.generated.json` | `rewrite-file` | no | yes |
| `system-readiness-schema` | `benchmark/system-readiness.schema.json` | `rewrite-file` | yes | yes |
| `host-smoke-scorecard` | `benchmark/host-smoke/scorecard.generated.json` | `rewrite-file` | yes | yes |
| `host-smoke-invalidation` | `benchmark/host-smoke/invalidation.generated.json` | `create-file` | yes | no |
| `system-readiness` | `benchmark/system-readiness.generated.json` | `rewrite-file` | yes | no |
| `host-smoke-runtime-runs` | `benchmark/host-smoke/runtime-runs` | `write-dir` | yes | no |
| `host-evolution` | `benchmark/host-evolution.generated.json` | `create-or-rewrite-file` | yes | no |
| `host-evolution-schema` | `benchmark/host-evolution.schema.json` | `rewrite-file` | yes | yes |
