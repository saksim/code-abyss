# Top-Tier Skill Standard

Use this document as the single charter for the personal skill system.

The goal is not to make every skill longer. The goal is to make the whole system easier to trust, easier to route, and easier to evolve.

## Objective

The system should make two things true at the same time:

1. current skills can become first-class capabilities inside their own domains
2. future skills can be added, merged, deepened, deprecated, archived, or deleted without inventing a new process each time

## Non-Negotiable System Properties

- `Route truth`
  A user request should enter the smallest correct surface with intentional conflicts, fallback, and escalation.
- `Depth truth`
  Thin entry skills should point at real deep references instead of pretending shallow prose is expertise.
- `Lifecycle truth`
  Every live skill should have explicit review cadence, owner, and status, and every future demand should have a governed intake path.
- `Proof truth`
  Stable claims should be backed by route fixtures, runtime proof, host-smoke policy when relevant, and verification artifacts.
- `Portfolio truth`
  New capability demand should be visible before implementation, and removal or merge decisions should leave clean history behind.
  Raw expert-source material that has not yet been internalized should also appear as governed integration debt instead of living as tribal backlog.
  New expert-source families should be onboarded by adding a family entry to `registry/expert-source-families.generated.json`, not by hardcoding another one-off validator path.

## What Top-Tier Means

Top-tier is a system property, not a word-count property.

A top-tier skill is:

- easy to route to correctly
- deep enough to solve hard cases
- honest about what it should not own
- validated by the surrounding governance system
- cheap to maintain because its lifecycle is explicit

## Two Governed Loops

### 1. Current-Skill Hardening

Use this loop when the capability already exists but is not yet top-tier.

1. identify the narrowest real failure mode
2. tighten the route surface
3. move dense detail into named references
4. harden deterministic runtime or validation behavior where needed
5. add route, runtime, and review evidence
6. preview the governed hardening blueprint so blocker families and command order are explicit
7. reassess top-tier readiness through governed tooling

### 2. Future-Skill Portfolio Evolution

Use this loop when the capability does not yet exist, or when removal or merge is under consideration.

1. record missing or long-horizon demand in the opportunity queue
2. run admission to decide add vs reuse vs deepen
3. if valuable raw source material already exists outside the routed bundle, surface it as governed extraction debt before inventing a duplicate public skill
4. scaffold in the correct layer only after the boundary is sharp
5. fill references and proof surfaces before promoting reach
6. graduate status only when evidence exists
7. deprecate, archive, merge, or delete through governed lifecycle paths

## Promotion Criteria

Promote a skill to `stable` only when all of the following are true.

### Route quality

- `description` clearly says when to use it
- trigger keywords are concrete, not generic filler
- conflicts and fallback behavior are intentional
- route fixtures cover representative prompts
- a `stable` skill should have at least one explicit route fixture proving direct win or explicit fallback behavior

### Depth quality

- `SKILL.md` stays concise enough to load repeatedly
- important hard decisions live in `references/`
- references are named by problem, not by vague notes
- a `stable` skill should not still look like a template or TODO scaffold
- if the skill owns capability modules, the entry skill should stay thin while the module surface holds the deeper reusable knowledge

### Execution quality

- deterministic tools and guards expose a trustworthy `scripts/run.js`
- runtime metadata matches the actual implementation
- dangerous or high-value behavior is tested
- a `stable` scripted skill should declare a small `Runtime Proof` section listing its real contracts
- if host-smoke governance applies, the smoke manifest, runtime-proof record, and executed evidence should tell the same story

### Governance quality

- owner is clear
- review rhythm is present and current
- generated metadata remains aligned
- `stable` / top-tier promotion must pass the governed `manage-skill assess-top-tier` gate rather than relying on manual judgement alone
- if a skill owns capability modules, every owned module must already be `top-ready` before the skill itself can truthfully claim top-tier

### Portfolio quality

- future neighboring demand is handled by opportunity, admission, or evolution flow instead of ad hoc sibling creation
- deprecation, archive, merge, and delete paths leave history that later maintainers can inspect
- the system prefers deepening an existing clean route before creating a new overlapping surface

## Current-Skill Upgrade Ladder

Use this order when hardening a current skill:

1. fix trigger ambiguity
2. split shallow entry from deep references
3. remove duplicated expert material
4. harden scripted behavior
5. add route fixtures and runtime tests
6. inspect the governed hardening blueprint before changing lifecycle state
7. refresh review cadence and promote lifecycle status only after evidence exists

Do not upgrade all skills at once by mass-editing tone or length. Upgrade by removing real failure modes.

## Future-Skill Operating Model

Every future skill should start from the canonical scaffold and inherit:

- valid schema-v2 frontmatter
- the right layer for its job
- reference placeholders that match the layer's top-tier depth floor
- lifecycle metadata from day one
- a scripted stub when runtime execution is required
- governed host metadata and route surfaces where applicable

This is the main mechanism that keeps future additions cheap and consistent.

Canonical templates should not only be inspectable; they should be governable through the same preview-first loop as live skills. Template review debt, host-metadata drift, scripted-stub breakage, and reference-floor erosion should be previewable through one hardening blueprint before the next generation of skills inherits that drift.

Kind-level system rules should also stay centralized instead of being redefined in scattered validators, scaffolders, and routing helpers. Future kind expansion should start from one governed definition surface, then let downstream tooling consume it.

Lifecycle-level system rules should stay centralized too. Status semantics, review-governed coverage, runtime-proof-governed coverage, and evolution-action defaults should come from one governed definition surface instead of being redefined separately in CLI flows, validators, and readiness tooling.

Capability-ratings system rules should stay centralized too. Rating buckets, next-batch promotion policy, mirrored ratings-doc sync behavior, and top-ready blocker construction should come from one governed definition surface instead of being redefined separately across CLI write paths, validators, self-smoke refresh flows, and top-tier promotion checks.

Route-fixture system rules should stay centralized too. Placeholder fixture naming, governed-fixture query generation, real-evidence vs governed-evidence semantics, and fallback expectation parsing should come from one governed definition surface instead of being redefined separately across routing validators, top-tier promotion checks, hardening blueprints, and skill CRUD flows.

Host-level system rules should stay centralized as well. Host-smoke policy tiers, host-smoke contract enums, governed runtime-proof eligibility, and host-writeability severity rules should come from one governed definition surface instead of being redefined separately across runtime validators, readiness artifacts, host-smoke runners, and recovery tooling.

Smoke-manifest rules should stay centralized too. The `scripts/smoke.json` schema version, command cwd modes, freshness units, path helper, and validation rules should come from one governed definition surface instead of being redefined separately across templates, runtime-proof construction, skill validation, and host-smoke normalization.

Derived-governance refresh rules should stay centralized too. The refresh order and rebuild semantics for runtime-proof promotion floors, review queue regeneration, capability-ratings sync, expert-source scorecards, host-smoke scorecards, investment backlog regeneration, and blocked-host export payloads should come from one governed definition surface instead of being redefined separately in self-smoke scripts, export paths, and future recovery helpers.

Runtime-proof system rules should stay centralized too. Runtime-proof schema version, minimum contract floor, evidence-test requirement semantics, entry-construction rules, and host-smoke-backed proof-policy error semantics should come from one governed definition surface instead of being redefined separately across CLI write paths, validators, backlog synthesis, and lifecycle promotion checks.

Expert-source family system rules should stay centralized too. Family status semantics, default-family constraints, future-family id rules, default integration/raw-root conventions, and experimental-pack include obligations should come from one governed definition surface instead of being redefined separately across integration validators, pack manifests, and `manage-skill` family CRUD flows.

Generated governance artifact rules should stay centralized too. The governed artifact catalog, including artifact ids, relative paths, write modes, and derived-governance fingerprint participation, should come from one definition surface instead of being redefined separately across writeability probes, self-smoke refresh flows, readiness diagnostics, derived-governance exports, and recovery tooling.

Future demand should also be governable before a concrete skill exists:

- record missing long-horizon capabilities in the governed opportunity queue first
- escalate from opportunity queue to admission only when the capability boundary is sharp enough to evaluate add-vs-reuse honestly
- close the originating opportunity when a real skill is created so portfolio intent and implementation stay linked
- keep future-skill pipeline semantics centralized too: opportunity status, admission decision action, admission blocking state, and pending-scaffold active state should come from one governed definition surface instead of being redefined separately across queue writers, backlog synthesis, host-evolution diagnostics, and registry validation
- keep admission and evolution ledger semantics centralized too: ledger paths, schema versions, canonical entry normalization, and validation rules should come from one governed definition surface instead of being redefined separately across CLI write paths, validators, self-smoke refresh flows, and host diagnostics

## Add / Iterate / Remove Protocol

### Add

- record opportunity first when the capability boundary is still fuzzy
- prefer deepening an existing route before creating a sibling skill
- create from template in the correct layer
- fill frontmatter honestly
- add references before expanding entry text
- verify routing and runtime surfaces before promotion

### Iterate

- improve the narrowest weak point first
- keep the entry skill thin and reusable
- promote only after evidence exists
- change lifecycle state through the governed manage-skill flow so runtime-proof, ratings, and readiness artifacts stay synchronized

### Remove

- deprecate if replacement migration matters
- archive if history matters
- merge when a neighboring skill should inherit the capability cleanly
- delete only when no live route or governance dependency remains

## Single-Charter Surfaces

These files should tell one coherent story:

- `personal-skill-system/docs/TOP_TIER_SKILL_STANDARD.md`
- `docs/SKILL_AUTHORING.md`
- `personal-skill-system/skills/tools/manage-skill/`
- `personal-skill-system/skills/tools/verify-skill-system/`
- `personal-skill-system/templates/skill/`

If one of these surfaces changes, the others should still describe the same operating model.

## Non-Goals

This standard does not require:

- every skill to be equally large
- every skill to own a script
- every skill to be public
- every future demand to become a new skill

It does require every skill and every future addition to be structurally honest.
