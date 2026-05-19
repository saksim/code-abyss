---
schema-version: 2
name: manage-skill
scaffold-origin: tool-template
scaffold-version: 1
title: Manage Skill Tool
description: Create, inspect, update, archive, merge, or delete core skills inside personal-skill-system/skills. Use when maintaining the authoritative skill source rather than editing scattered files by hand.
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

Read-only governance views exposed by `manage-skill` accept an explicit `--json` flag, so automations can call future-pipeline, scaffold, hardening, top-tier, blueprint, retirement, and expert-family surfaces through one consistent structured-output convention.

- `record-opportunity`: register a governed future-skill opportunity before a concrete skill exists, so early demand for missing capabilities does not disappear into notes or memory
- `show-opportunity-queue`: inspect the governed future-skill opportunity queue by status, kind, priority, horizon, or id
- `show-future-skill-pipeline`: inspect the unified governed future-skill pipeline across opportunity intake, admission, pending scaffolds, and host-blocked materialization, so future add / reuse / materialize work can be triaged from one control surface
- `resolve-opportunity`: close or annotate a future-skill opportunity when it is implemented, cancelled, deferred, or converted into a concrete admission request
- `admission-check`: evaluate whether a proposed capability should become a new skill, be merged into an existing skill, or first be handled by upgrading an existing route boundary;
  `admission-check --opportunity-id` escalates a governed future-skill opportunity into a linked admission decision instead of forcing maintainers to reconstruct the request by hand
- `show-skill-blueprint`: preview the governed scaffold, capability modules, route placeholder, review metadata, runtime-proof expectations, and top-tier blockers for a proposed new skill before any files are created
- `show-skill-hardening-blueprint`: preview the governed current-skill hardening surface for an existing skill before promotion or deeper investment, including current route/review/runtime state, ordered blocker families, and the concrete follow-up commands needed to become honestly top-tier
- `show-template-hardening-blueprint`: preview the governed canonical-template hardening surface before future descendants inherit drift, including template review/reference/host-metadata/runtime blockers and the concrete follow-up commands needed to restore the scaffold
- `show-skill-scaffold-upgrade-blueprint`: preview the governed descendant-upgrade surface for one existing skill when scaffold lineage is missing, behind, mismatched, or ahead of the canonical template, so template drift repair follows an explicit audit path instead of blind lineage sync
- `show-skill-retirement-blueprint`: preview the governed retirement surface for an existing skill before archiving, merging, or deleting it, including delete blockers, historical references, route ownership, runtime-proof residue, and recommended lifecycle moves
- `show-admission-ledger`: inspect governed admission decisions so future add/merge work starts from recorded system history instead of memory
- `resolve-admission`: close or annotate a governed admission decision when a request is implemented, deferred, or intentionally dropped
- `evolution-check`: evaluate whether an existing skill should be upgraded in place, promoted, deprecated, archived, deleted, or merged into a neighboring owner
- `show-evolution-ledger`: inspect governed lifecycle/evolution decisions for existing skills instead of reconstructing them from commit history
- `resolve-evolution`: close or annotate a governed evolution decision when the requested lifecycle action is executed, deferred, or intentionally cancelled
- `show-review-queue`: inspect the governed review-cadence queue for live skills, including overdue and due-soon items
- `review-template`: refresh canonical template review metadata through the governed path instead of hand-editing `last-reviewed` / `review-cycle-days`
- `show-investment-backlog`: inspect the governed skill investment portfolio so future add / deepen / deprecate work is prioritized from one generated backlog instead of scattered notes
- `show-lifecycle-governance`: inspect the live lifecycle control surface for active and non-stable skills, including promotion-ready vs hardening-needed state, top-tier blockers, and direct promotion/hardening follow-up commands
- `show-scaffold-governance`: inspect canonical template health plus per-skill scaffold lineage drift, so template upgrades and missing lineage metadata are visible in one governed maintenance view
- `show-skill-scaffold-upgrade-blueprint` turns one drifted descendant into an explicit upgrade playbook, distinguishing pure lineage backfill from template-family mismatch and manual descendant audit work
- `show-expert-source-families`: inspect governed expert-source family health across raw roots, integration ledgers, unmapped raw sources, stale mappings, and parse drift before deciding where to deepen the bundle next
- `register-expert-source-family`: register a new governed expert-source family, seed its empty integration ledger, optionally create its raw source root, and wire it into the experimental pack so future expert corpora can enter governance without ad-hoc file editing
- `update-expert-source-family`: update a governed expert-source family's metadata, integration ledger path, raw-root metadata, portability flag, or lifecycle status while keeping generated governance surfaces in sync
- `archive-expert-source-family`: mark a governed expert-source family as archived so it remains in history but no longer blocks active experimental-pack or backlog governance
- `restore-expert-source-family`: reactivate an archived expert-source family through the same governed path so pack includes, scorecards, and backlog obligations return without manual repair
- `diagnose-host-evolution`: inspect whether the current host can still evolve the bundle in place, including authoritative create capability,
  generated-governance writeability, blocked admissions, pending scaffolds, and the exact recovery commands needed to resume self-evolution
- `refresh-derived-governance`: rebuild the governed derived artifact set in canonical refresh order on writable hosts and surface the blocked step/artifact map when the host can only complete a partial refresh
- `export-derived-governance`: export host-specific derived governance artifacts when the current runtime can compute readiness/host-evolution state but cannot rewrite the blocked benchmark files in place
- `apply-derived-governance-export`: copy a governed derived-governance export back into the current writable bundle snapshot and verify the fingerprint before sync;
  `--latest` reuses the newest matching export for the current bundle snapshot instead of requiring a manual path lookup
- `show-pending-scaffolds`: inspect governed scaffold payloads that were prepared on a constrained host but not yet materialized into the authoritative skill tree
- `mark-reviewed`: update `last-reviewed` (and optionally `review-cycle-days`) for one skill, all overdue skills, or the whole governed review surface while refreshing all review-dependent governance artifacts together
- `assess-top-tier`: inspect whether a skill is actually ready to be treated as top-tier / `stable`, including capability-module depth and governed route/runtime surfaces;
  for non-`stable` skills this still evaluates the full stable-candidate surface, so promotion blockers are visible before status changes
- `create`: scaffold a new skill from the canonical template, including internal adapter skills, with optional capability-module governance scaffolding for kinds that support scaffolded capability modules today
  and stamp scaffold lineage into frontmatter so future template upgrades can detect which generated skills are now behind the canonical scaffold;
  the scaffolded skill seeds `owner`, `last-reviewed`, and `review-cycle-days` from centralized review-metadata governance instead of copying template review history verbatim
- `materialize-pending-scaffold`: take a governed pending scaffold payload and write it into the authoritative skill tree on a writable host, then clear the pending record
- `show`: inspect resolved paths and metadata for an existing skill
- `update`: patch safe frontmatter fields for an existing skill while automatically syncing the affected governed route/review surfaces;
  identity-bearing fields such as `name`, `kind`, scaffold lineage, and runtime/host-smoke contract fields are intentionally blocked here and must move through dedicated governed flows instead
- `set-status`: move a skill between `draft`, `experimental`, `stable`, `deprecated`, and `archived` while keeping generated governance surfaces synchronized
  and refuse `stable` promotion unless the skill's capability modules are all `top-ready` and the stable/top-tier governance blockers are clear
- `set-module-rating`: move one capability module or every module owned by a host skill between `thin`, `strong-but-not-top`, and `top-ready`
  while keeping `capability-ratings.generated.json` and `docs/CAPABILITY_MODULE_RATINGS.md` synchronized;
  default behavior only allows one-bucket moves unless `--allow-skip` is set intentionally
- `archive`: mark a skill as archived without deleting it
- `merge`: archive one skill as subsumed by a neighboring owner and resolve the governed evolution record with explicit `merged-into` history
- `delete`: remove a skill directory from the authoritative tree, preferably after archive
  and only after active governance references are cleared; historical intake/history ledgers remain valid only when a governed delete evolution result exists
- `sync-scaffold-lineage`: backfill or refresh `scaffold-origin` and `scaffold-version` on existing skills from the canonical template for that skill kind,
  so historical skills can join the same governed scaffold lineage surface as newly created skills
- `sync-host-metadata`: regenerate governed `agents/openai.yaml` files from authoritative `SKILL.md` metadata
  for one skill or the current governed set of stable skills, keeping host-facing labels and prompts aligned
- `sync-template-host-metadata`: regenerate canonical template `agents/openai.yaml` metadata from the template `SKILL.md`, so future descendants inherit the correct host-facing scaffold
- `sync-route-metadata`: regenerate the route-shared portion of `route-map.generated.json` from authoritative `SKILL.md`
  metadata for one skill or the current governed live route surface, keeping trigger/alias/conflict/auto-chain facts aligned without overwriting richer route rationale and fallback tuning
  and refreshing governed `expert-modules` from the registered module-group when the skill has capability depth behind its route
- `sync-route-metadata` also refreshes the governed route-fixture placeholder for the selected skill(s), so explicit/manual route evidence keeps tracking current trigger wording instead of drifting as one-time scaffolding
- `sync-runtime-proof`: align runtime-proof registry entries with current scripted skill metadata and Runtime Proof bullets
  and suggest or auto-fill evidence tests from the Jest runtime corpus when explicit evidence is missing;
  when `scripts/smoke.json` exists on a stable scripted skill, the host-smoke contract is also synchronized;
  if the stored runtime-proof level sits below the lifecycle-governed stable floor, the sync also raises it automatically;
  if a previous `host-smoked` level no longer has matching fresh passing evidence, the level is downgraded automatically
- `run-host-smoke`: execute registry-backed host-smoke commands for one or all scripted skills and append evidence artifacts under `benchmark/host-smoke/runtime-runs/`
  while refreshing the bundle-wide host-smoke scorecard under `benchmark/host-smoke/scorecard.generated.json`;
  failed executions also demote stale or broken `host-smoked` levels back to the default governed level
- `reconcile-host-smoke`: inspect the current host-smoke evidence state for one or all scripted skills, append governed invalidation entries for drifted artifacts when requested,
  downgrade unsupported `host-smoked` claims, and optionally rerun the selected host-smoke contract immediately
- `admission-check` writes governed add-vs-reuse decisions into `registry/admission-ledger.generated.json`, and `create --request-id` can close that request once the skill is actually created
- `admission-check --opportunity-id` also links the admission record back to the originating future-skill opportunity and advances the opportunity queue status so portfolio intent, intake, and concrete admission stay connected
- `evolution-check` writes governed existing-skill decisions into `registry/evolution-ledger.generated.json`, and `set-status` / `archive` / `merge` / `delete` can close that request with `--request-id`
- review cadence is also governed through `registry/review-queue.generated.json`, so live skills can be queried as overdue/due-soon instead of treating `last-reviewed` as dead metadata
- cross-cutting future work is governed through `registry/skill-investment-backlog.generated.json`, which merges open admission requests, open evolution requests,
  review debt, scaffold drift, active non-stable lifecycle debt, stable-skill hardening debt, host writeability debt, and the future-skill opportunity queue into one generated portfolio surface
- `show-lifecycle-governance` complements that portfolio view with a direct per-skill lifecycle decision board, so active non-stable skills can be promoted, hardened, or intentionally left alone from one read surface instead of being inferred from backlog rows
- `show-scaffold-governance` complements that portfolio view by separating canonical template review debt from per-skill scaffold drift, so maintainers can decide whether to upgrade templates first or refresh historical skill lineage first
- future-skill demand can be captured earlier than admission through `registry/skill-opportunity-queue.generated.json`,
  so the system can track missing-but-not-yet-shaped skills before they are precise enough for add-vs-reuse routing
- host-blocked `create --defer-when-host-blocked` now writes a governed payload into `registry/pending-scaffolds.generated.json`,
  so constrained hosts can still generate the exact scaffold artifact that should later be materialized on a writable host instead of losing work to a blocked status note

If the host cannot rewrite required generated governance artifacts such as runtime-proof, scorecard, or system-readiness files, fail early instead of partially mutating lifecycle state.
Treat `benchmark/system-readiness.generated.json` as a derived snapshot rather than the primary governance source:
if that file alone is not writable on the current host but runtime-proof, scorecard, and invalidation artifacts are still writable, keep host-smoke governance moving and surface the readiness rewrite failure as explicit follow-up debt.
Treat broader generated-artifact write failures as governed host debt, not as silent incidental warnings, so platform limits stay visible in the same portfolio system that tracks skill gaps.

## Output Contract

Return:

1. the authoritative target path
2. what changed
3. any follow-up verification commands that should be run

## Runtime Proof

- `admission-check` evaluates proposed skill additions against the live route surface and existing governed skills so future growth is routed through one repeatable add/merge/upgrade decision path instead of ad-hoc judgement
- `record-opportunity` creates a governed queue for future skills that do not yet deserve full admission, keeping long-horizon portfolio demand visible and structured instead of burying it in docs or chat history
- `admission-check --opportunity-id` upgrades a governed future-skill opportunity into a traceable admission request, preserving the originating opportunity id and moving queue state forward without manual ledger patching
- linked opportunity escalation also resolves whether the original demand should stay active, move to planned, or close as reuse/upgrade advice, so the opportunity queue and admission ledger cannot silently diverge
- `evolution-check` evaluates existing-skill lifecycle moves against current routing, module depth, and top-tier blockers so promote/deprecate/archive/delete work is also routed through a repeatable governed decision path
- `show-skill-retirement-blueprint` makes destructive lifecycle work symmetric with creation blueprints, so deletion and retirement are previewed as governed payloads instead of reconstructed from scattered ledgers
- `show-skill-hardening-blueprint` makes current-skill promotion and deepening symmetric with creation and retirement blueprints, so maintainers can inspect ordered blocker families and repair commands from one governed payload instead of reconstructing top-tier state from separate review, route, runtime-proof, and host-smoke surfaces
- `show-skill-scaffold-upgrade-blueprint` makes scaffold drift repair symmetric with creation, hardening, and retirement blueprints, so descendant template upgrades become governed audit work instead of a risky direct `sync-scaffold-lineage`
- `assess-top-tier` turns "this skill is top-tier enough" into a governed read-only check instead of a hand-waved label by inspecting capability-module ratings and stable-surface blockers together, even when the current lifecycle state is still `experimental` or `deprecated`
- `create` updates the authoritative skill tree and generated metadata together instead of leaving registry or route drift behind
- `create` also records which canonical scaffold and template version seeded the new skill so future scaffold upgrades become governable drift instead of tribal knowledge
- `create` seeds review metadata from centralized kind policy, so newly created skills start with current review baselines instead of inheriting stale template dates
- `sync-scaffold-lineage` upgrades pre-lineage historical skills into the same canonical scaffold tracking model as newly created skills without hand-editing every frontmatter block
- `create --scaffold-modules` also seeds module-group registry entries, placeholder route `expert-modules`, and thin capability-module ratings for new capability-module scaffold kinds (currently `domain` and `workflow`)
- `show-skill-blueprint` exposes the exact future-skill governance payload before creation, so maintainers can review whether the proposed boundary, scaffold lineage, capability modules, and top-tier hardening debt are correct before materializing files
- `set-module-rating` upgrades or downgrades registered capability modules through a governed path instead of hand-editing rating buckets, `next-batch`, or the mirrored ratings doc
- `set-status` updates lifecycle metadata through a governed path instead of allowing raw `status=` edits that can strand runtime-proof, ratings, or readiness artifacts
- `update` is intentionally narrower than raw frontmatter editing: it can repair safe metadata quickly, but it refuses identity/layer/lineage mutations plus runtime/host-smoke contract mutations that would orphan registries, route ownership, or proof governance
- `set-status stable` now reuses the same stable-candidate readiness gate as `assess-top-tier`, so "stable" cannot drift away from the skill system's claimed top-tier standard and live non-stable skills cannot skip route/runtime-proof/review evidence on the way up
- `assess-top-tier` also treats expired stable review cadence as a real blocker instead of allowing stale `stable` claims to persist forever
- `archive` and `delete` remove active-route surfaces for the target skill, including route fixtures and ratings summary membership
- `delete` also enforces centralized delete-governance blockers, refusing removal while active opportunity, admission, evolution, pending-scaffold, or expert-source dependencies still point at the skill
- successful governed delete now records delete evidence in the evolution ledger, so historical admission/opportunity references to the removed skill remain explainable instead of turning into orphaned governance debt
- `merge` turns a merge recommendation into an executable lifecycle move without inventing ad-hoc archive + ledger edits: the source skill is archived, active-route surfaces are removed, and the evolution ledger records which target inherited ownership
- lifecycle mutations can also resolve recorded evolution requests so governance history follows the executed promote/deprecate/archive/delete action instead of staying as oral history
- `sync-host-metadata` keeps `agents/openai.yaml` governed from authoritative skill metadata instead of allowing host UI labels or default prompts to drift, including nested runtime paths such as variant skills
- `sync-route-metadata` keeps the shared route surface governed from authoritative frontmatter for trigger keywords, negative keywords, aliases, conflicts, auto-chain, supported hosts, and explicit-vs-auto routing mode while leaving richer route-only rationale/confidence/fallback tuning intact
- `sync-route-metadata` also keeps route `expert-modules` aligned with the capability modules registered for that skill so depth bindings do not drift after governance edits
- governed route-fixture placeholders are refreshed from current trigger metadata during route sync and lifecycle restore flows, but stable/top-tier evidence still requires at least one non-placeholder route fixture
- `sync-runtime-proof` can rebuild or update runtime-proof entries from authoritative skill metadata instead of requiring hand-edited registry drift repair and can suggest or auto-apply matching evidence tests for scripted skills based on existing Jest coverage
- `sync-runtime-proof` also lifts skill-local `scripts/smoke.json` manifests into registry-backed host-smoke metadata so future host runners consume one consistent contract
- `sync-runtime-proof` also auto-promotes stable scripted tools and guards to the lifecycle-governed minimum proof level once their declared contracts and evidence already satisfy that floor
- `sync-runtime-proof` treats `host-smoked` as evidence-backed state instead of sticky status and automatically downgrades entries whose contract, pass state, or freshness proof no longer holds
- `sync-runtime-proof` also invalidates drifted runtime host-smoke artifacts when a contract changes, so append-only evidence history stays cleanly governed without a separate manual cleanup pass
- `run-host-smoke` executes the declared host-smoke contract and records append-only pass/fail evidence so `host-smoked` can be proven from artifacts instead of trust
- failed host-smoke executions preserve their artifacts and demote any now-invalid `host-smoked` level instead of leaving stale governance claims behind
- host-smoke contract and evidence changes also refresh a bundle-wide scorecard so system-level freshness and governance drift stay inspectable
- `reconcile-host-smoke` invalidates drifted runtime host-smoke artifacts through a governed ledger instead of rewriting append-only run history and can chain directly into a rerun when fresh evidence is needed
- `mark-reviewed` refreshes review metadata together with the governed review queue, capability-ratings surfaces, investment backlog, and readiness rollups so review operations cannot leave stale top-tier summaries behind
- `show-investment-backlog` gives the bundle a first-class portfolio view for future skill additions, upgrades, deprecations, and template refreshes instead of relying on memory or stale roadmap docs
- `show-lifecycle-governance` gives the bundle a first-class lifecycle decision board for active skills, so promotion-ready and hardening-blocked skills can be distinguished without reconstructing state from backlog plus top-tier checks
- `show-future-skill-pipeline` compresses the future-skill control loop into one governed view, linking each thread's intake, admission decision, deferred scaffold, and host blockage instead of forcing maintainers to reconstruct state from separate registries
- `show-expert-source-families` gives the bundle a family-level health board for expert-source ingestion, so maintainers can see which raw corpora are registered, portable, unmapped, stale, or parse-broken before touching deeper integration ledgers
- `register-expert-source-family` turns future expert-source onboarding into a governed write path that seeds the family registry, integration ledger, experimental pack include, and derived portfolio surfaces together instead of relying on hand-edited registry sprawl
- `update-expert-source-family` keeps expert-source family metadata and ledger location changes inside the same governed write path instead of spreading rename/edit drift across registry, pack, and backlog surfaces
- `archive-expert-source-family` turns retired expert-source corpora into explicit lifecycle state rather than ad-hoc deletion, so history stays visible while active governance obligations stop firing
- `restore-expert-source-family` makes expert-source lifecycle governance symmetric, so archived families can rejoin active pack, scorecard, and backlog surfaces without hand-editing multiple generated files
- `diagnose-host-evolution` turns host writeability debt, blocked admissions, and deferred scaffold state into one action-oriented recovery view instead of forcing maintainers to reconstruct host limitations from readiness files, backlog entries, and error messages
- `export-derived-governance` and `apply-derived-governance-export` turn blocked benchmark rewrites into a governed export/sync-back loop, so host-limited runtimes can hand derived readiness state to a writable bundle without losing fingerprint or artifact provenance
- `create --opportunity-id` can close a governed future-skill opportunity at the same time as the concrete skill scaffold is created, so portfolio intent and shipped artifact stay linked
- `create --defer-when-host-blocked` preserves the exact scaffold payload, host constraint, and rerun command in a governed pending scaffold registry instead of reducing blocked future-skill work to an opaque note
- `materialize-pending-scaffold` reuses that governed payload on a writable host so deferred future-skill creation stays deterministic and audit-friendly

## Read These References

- `references/authoritative-skill-rules.md`
  Read before modifying the skill tree so changes stay inside the single source of truth model.
- `references/operation-examples.md`
  Read when you need concrete command examples for create, update, archive, show, and delete.
- `references/skill-admission-rubric.md`
  Read when deciding whether a new request deserves a brand-new skill, should deepen an existing route, or should stay as capability depth behind a current skill.
