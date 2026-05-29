# Top Skill Integration Construction Plan (2026-05-29)

Scope: integrate the current high-value external and local SKILL sources into `personal-skill-system/` without breaking the governed source-of-truth, route, pack, and release contracts.

This is a construction document, not a promotion claim. A skill is not "top-tier" just because it was imported. It becomes top-tier only after it is normalized, routed, validated, benchmarked, and proven portable across the supported hosts.

## 1. Verdict

Integrate the current top SKILL set through controlled absorption, not bulk copy.

The target shape is:

- keep `personal-skill-system/skills/` as the only authoritative core skill source
- deepen existing domain and workflow skills first
- create new core skills only when the boundary is genuinely new
- keep heavy third-party runtimes as packs
- keep raw top-developer material as expert-source input until split into task-shaped references
- record every add, merge, defer, or reject decision in the governed skill-system surfaces

## 2. Source Classes

| Source class | Examples | Default treatment | Reason |
|---|---|---|---|
| Existing governed core | `development`, `architecture`, `security`, `review`, `ship`, `verify-*` | Harden in place | These already have route, registry, references, and validation surfaces. |
| Codex system skills | `openai-docs`, `imagegen`, `plugin-creator`, `skill-creator`, `skill-installer` | Admission first, then core or adapter-specific skill | They may depend on host capabilities, network, image tools, or Codex-specific concepts. |
| gstack workflow runtime | `browse`, `qa`, `benchmark`, `canary`, `design-review`, `health`, `ship` overlays | Keep as external pack and improve discoverability | The repo already has `packs/gstack/manifest.json`; duplicating it into core creates route and lifecycle drift. |
| top-developer overlays | `top-architect`, `top-python-dev`, `top-qa`, platform architect variants | Split into references behind existing skills | Direct exposure would create overlapping giant skills and context bloat. |
| Local root or legacy mirrors | retired `skills/` mirror, ad hoc prompt files | Do not edit as truth | They must not become a second source of truth. |

## 3. Non-Negotiable Rules

| Rule | Requirement |
|---|---|
| Single source | Core edits happen under `personal-skill-system/skills/`. |
| No bulk copy | Do not copy a complete external skill tree into core unless it passes admission and boundary review. |
| Deepen before adding | If an external skill improves an existing route, add references or scripts to that route instead of creating a sibling. |
| Pack heavy runtimes | Browser automation, QA daemons, and third-party command ecosystems stay as packs unless rewritten as small deterministic tools. |
| Preserve progressive disclosure | Keep `SKILL.md` concise; move depth into `references/`, deterministic logic into `scripts/`, and starter materials into `assets/`. |
| Prove portability | User-invocable skills need Codex, Claude, and Gemini compatibility notes or explicit host limits. |
| No false promotion | `stable` and top-tier language require route evidence, runtime proof, review freshness, and validation gates. |

## 4. Target Architecture

```text
personal-skill-system/
  skills/
    routers/          # routing policy and skill catalog
    domains/          # durable expertise surfaces
    workflows/        # task execution workflows
    tools/            # deterministic validators and generators
    guards/           # pre-commit, pre-merge, release gates
    adapters/         # host-specific runtime assumptions
  registry/           # generated and synchronized governance metadata
  benchmark/          # route, reasoning, correctness, and host proof
  packs/              # internal portable pack definitions
packs/
  abyss/              # core runtime install mapping
  gstack/             # external browser/QA/design runtime
```

The key integration principle:

```text
External SKILL value -> classify -> admit/reuse/defer -> normalize -> route -> prove -> promote
```

## 5. Integration Workstreams

### WS-1: Core Skill Hardening

Goal: fold useful material into existing core skills where route ownership is already clear.

Initial targets:

| Target skill | Incoming source | Integration action |
|---|---|---|
| `development` | `top-python-dev`, development overlays | Add language and runtime expert references where current depth is thin. |
| `architecture` | platform architect variants, middleware evolution | Merge reusable decision rules into architecture references. |
| `architecture-decision` | platform decision frameworks | Strengthen option scoring, migration, rollback, and ownership references. |
| `review` | `top-qa`, gstack review heuristics | Add severity, evidence, test-surface, and release-readiness depth. |
| `security` | security overlays and CSO patterns | Add supply-chain, CI/CD abuse, secrets, auth, and exploitability modules. |
| `devops` / `ship` | canary, release, deployment workflows | Add rollout, rollback, SLO gate, and production verification depth. |
| `frontend-design` | design-review, design-shotgun concepts | Add visual QA and design iteration rules without copying gstack runtime. |

Done when:

- the destination `SKILL.md` links the new reference
- capability ratings are updated only if actual depth changed
- route-map does not gain an overlapping sibling route
- `verify-skill-system` passes

### WS-2: System Skill Admission

Goal: decide how to absorb current Codex/system skills.

Candidate decisions:

| Candidate | Proposed placement | Rationale |
|---|---|---|
| `openai-docs` | New domain or adapter-aware tool after admission | It needs current official-doc browsing policy and may be OpenAI-specific enough to deserve a first-class route. |
| `imagegen` | Optional tool or pack-backed skill after host capability review | It depends on image generation/editing support and asset handling. |
| `plugin-creator` | Codex adapter or tool skill | It is likely Codex-specific and should not imply Claude/Gemini parity without proof. |
| `skill-creator` | Merge into `manage-skill` and `skill-evolution` references, not a duplicate core skill | The project already has governed skill creation and lifecycle tools. |
| `skill-installer` | Keep external or convert into pack/vendor docs | Code Abyss already owns install and pack workflows. |

Required admission commands:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --target personal-skill-system --name openai-docs --kind domain --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --target personal-skill-system --name imagegen --kind tool --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --target personal-skill-system --name plugin-creator --kind tool --json
```

Do not create files until the admission result says `create`. If the result says `merge` or `upgrade-existing`, apply the change to the named owner instead.

### WS-3: gstack Pack Integration

Goal: preserve gstack as a pack while making its top capabilities easy to discover and safe to use.

Construction tasks:

| Task | Write scope | Done signal |
|---|---|---|
| Document installed gstack capabilities | `docs/`, pack snippets | Users can see `browse`, `qa`, `benchmark`, `canary`, `design-review`, and related flows after install. |
| Add pack-to-core route guidance | `personal-skill-system/skills/routers/sage/references/` | Router can say when to use core `review` versus gstack `review`/`qa`. |
| Add pack health checks | `packs/gstack/`, tests | Pack manifest, vendor status, and install paths are validated. |
| Avoid duplicate core skills | No write to core skill folders unless admission says create | gstack remains externally versioned and pinned. |

Validation:

```bash
npm run packs:check
npm run packs:vendor:sync -- --check
npm test -- test/packs-cli.test.js --runInBand
```

### WS-4: Top-Developer Decomposition

Goal: finish converting giant top-developer skills into portable expert references.

Rules:

- split by decision task, not by original source file
- each new reference must have a clear owner skill
- avoid top-level routes named after credentials, prestige, or persona
- do not preserve repetitive examples unless they change execution quality
- record origin in `registry/top-developer-integration.generated.json` or the appropriate expert-source ledger

Preferred mapping:

| Raw source family | Destination |
|---|---|
| platform architecture variants | `architecture/references/` and `architecture-decision/references/` |
| middleware evolution | `architecture/references/` and `infrastructure/references/` |
| performance optimizer | `development/references/`, `architecture/references/`, possible future `performance` domain |
| Python developer | `development/references/` |
| QA | `review/references/`, `verify-quality/`, `pre-merge-gate/` |

Create a new first-class domain only if:

- the work appears repeatedly
- existing owners become overloaded
- routing can distinguish the new domain from existing ones
- benchmark tasks can prove uplift

## 6. Construction Cards

### P0: Inventory And Decision Records

| Card | Goal | Write scope | Validation |
|---|---|---|---|
| `TOPINT-P0-001` | Generate external SKILL inventory against project core. | `personal-skill-system/docs/` | Manual diff plus `verify-skill-system`. |
| `TOPINT-P0-002` | Mark each missing skill as `core`, `merge`, `pack`, `adapter`, `raw`, or `reject`. | This document or a follow-up matrix | Review against source-of-truth decision. |
| `TOPINT-P0-003` | Record admission decisions for `openai-docs`, `imagegen`, and `plugin-creator`. | `registry/admission-ledger.generated.json` through `manage-skill` | `show-admission-ledger --json`. |
| `TOPINT-P0-004` | Record gstack as pack-owned, not core-owned. | `docs/`, `packs/gstack/` if needed | `packs:check`. |

### P1: Low-Risk Depth Absorption

| Card | Goal | Write scope | Validation |
|---|---|---|---|
| `TOPINT-P1-001` | Add OpenAI API build guidance decision note or reference owner. | `skills/domains/ai/` or new admitted skill | Route and docs validation. |
| `TOPINT-P1-002` | Add image workflow host-capability notes. | `skills/adapters/`, admitted `imagegen`, or docs | Host support is explicit. |
| `TOPINT-P1-003` | Merge skill-authoring method into `skill-evolution` / `manage-skill` references. | Existing skill references | No duplicate `skill-creator` route. |
| `TOPINT-P1-004` | Add top-qa evidence rules to `review`. | `skills/workflows/review/references/` | Review references link and route stays stable. |
| `TOPINT-P1-005` | Add Python top-dev depth where missing. | `skills/domains/development/references/` | Capability ratings reflect actual depth only. |

### P2: Pack Discoverability And Runtime Proof

| Card | Goal | Write scope | Validation |
|---|---|---|---|
| `TOPINT-P2-001` | Add gstack capability map to install/user docs. | `README.md`, `docs/`, generated snippets if applicable | Docs drift tests. |
| `TOPINT-P2-002` | Add router reference explaining core-vs-gstack selection. | `skills/routers/sage/references/` | Route-map and skill-system validation. |
| `TOPINT-P2-003` | Ensure gstack pack manifest is still pinned and installable. | `packs/gstack/manifest.json`, lock policy | `packs:check`, vendor sync check. |
| `TOPINT-P2-004` | Add host smoke target for pack availability. | `benchmark/host-smoke/` | Host smoke scorecard refresh. |

### P3: New Skill Materialization

Only pull these cards after admission says `create`.

| Card | Goal | Write scope | Validation |
|---|---|---|---|
| `TOPINT-P3-001` | Create admitted `openai-docs` skill or merge target. | `skills/domains/` or owner references | `verify-skill-system`, route fixture. |
| `TOPINT-P3-002` | Create admitted `imagegen` skill or pack bridge. | `skills/tools/`, `assets/`, or pack | Host capability proof. |
| `TOPINT-P3-003` | Create admitted `plugin-creator` skill or Codex adapter note. | `skills/tools/` or `skills/adapters/codex/` | Codex-specific boundary is explicit. |
| `TOPINT-P3-004` | Sync host metadata for new or changed skills. | `agents/openai.yaml` through managed command | `sync-host-metadata` and validation. |
| `TOPINT-P3-005` | Sync route metadata and fixtures. | `registry/` through managed command | Route regression. |

### P4: Promotion And Release Gates

| Card | Goal | Write scope | Validation |
|---|---|---|---|
| `TOPINT-P4-001` | Run top-tier assessment for changed skills. | Registry/read-only output first | `assess-top-tier --json`. |
| `TOPINT-P4-002` | Add or update benchmark tasks for new domain claims. | `benchmark/tasks/` | Benchmark schema validation. |
| `TOPINT-P4-003` | Run host smoke for scripted or pack-backed skills. | `benchmark/host-smoke/` | Fresh pass/fail evidence. |
| `TOPINT-P4-004` | Write promotion decision memo. | `personal-skill-system/docs/` | Memo lists promoted, experimental, deferred, rejected. |
| `TOPINT-P4-005` | Run release validation profile. | No direct write unless generated refresh is intended | Commands below pass. |

Release validation profile:

```bash
npm run verify:skill-system
npm run verify:skills
npm run packs:check
npm run packs:vendor:sync -- --check
npm test -- --runInBand
```

Before npm release, add:

```bash
npm run verify:tarball-smoke
```

## 7. Admission Rubric

| Question | Create new skill if yes | Merge if yes | Pack if yes | Reject if yes |
|---|---|---|---|---|
| Is the capability a new durable user intent? | Yes | No | Maybe | No |
| Does an existing skill already own the route? | No | Yes | Maybe | No |
| Does it need a heavy runtime or external daemon? | No | No | Yes | No |
| Is it host-specific? | Maybe | Maybe | Maybe | No |
| Is it mostly generic advice? | No | Maybe | No | Yes |
| Can it be validated with fixtures, scripts, route tests, benchmark tasks, or host smoke? | Yes | Yes | Yes | No |

## 8. File And Command Playbook

Use these commands during construction.

Inventory:

```bash
node bin/install.js --list-skills
node bin/install.js --explain-skill development
npm run verify:skill-system
```

Governed skill operations:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --target personal-skill-system --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-future-skill-pipeline --target personal-skill-system --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --target personal-skill-system --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance --target personal-skill-system --json
```

Metadata sync after approved changes:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-host-metadata --target personal-skill-system --all --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-route-metadata --target personal-skill-system --all --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof --target personal-skill-system --all --json
```

Pack checks:

```bash
npm run packs:check
npm run packs:report -- summary
npm run packs:vendor:status -- gstack
```

## 9. Acceptance Criteria

The integration is ready when all of these are true:

- no new external skill was copied into core without an admission decision
- existing routes were deepened before creating overlapping siblings
- every changed skill has schema-v2-compatible metadata
- `SKILL.md` files remain concise and route-oriented
- deep material lives in `references/`
- scripted behavior has smoke or fixture coverage
- gstack remains pack-owned unless a specific sub-capability is intentionally rewritten
- top-developer material is split by task-shaped capability module
- registry, route-map, host metadata, and runtime proof are synchronized
- `verify:skill-system`, `verify:skills`, `packs:check`, and targeted tests pass
- promotion decisions clearly separate `core`, `experimental`, `pack-owned`, `deferred`, and `rejected`

## 10. Immediate Pull Order

Start with the lowest-risk sequence:

| Order | Card |
|---:|---|
| 1 | `TOPINT-P0-001` |
| 2 | `TOPINT-P0-002` |
| 3 | `TOPINT-P0-003` |
| 4 | `TOPINT-P0-004` |
| 5 | `TOPINT-P1-003` |
| 6 | `TOPINT-P1-004` |
| 7 | `TOPINT-P2-001` |
| 8 | `TOPINT-P2-002` |
| 9 | `TOPINT-P3-001` only if admission approves |
| 10 | `TOPINT-P4-001` |

This order avoids the two dangerous failure modes:

- bloating the core with duplicate routes
- claiming top-tier status before proof exists

