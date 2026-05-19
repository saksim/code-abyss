# Operation Examples

Check whether a proposed capability should become a new skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check "we need a repeatable workflow for upgrading the skill system itself"
```

Record a future-skill opportunity before it is concrete enough for admission:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js record-opportunity --kind domain --priority high --horizon next --adjacent architecture,orchestration "we need a cross-cutting platform-governance skill for long-term ownership and policy design"
```

Inspect the future-skill opportunity queue:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --status open --priority high
```

Inspect the unified future-skill pipeline, including host-blocked pending scaffolds:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-future-skill-pipeline --blocked
```

Escalate a governed future-skill opportunity into a linked admission decision:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --opportunity-id 20260509-platform-governance
```

Create the governed scaffold directly from the linked admission + opportunity pair:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create domain reliability-governance --scaffold-modules --request-id 20260509-reliability-governance --opportunity-id 20260509-reliability-governance
```

Check admission with an explicit target kind:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --kind tool "we need a validator for stale skill metadata and route drift"
```

Inspect recorded admission decisions:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --status open
```

Check whether an existing skill should be upgraded, promoted, archived, or merged:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check review "this workflow is ready for stable promotion"
```

Preview whether an existing skill is honestly ready for archive, merge, or delete before mutating anything:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-retirement-blueprint --name review
```

Preview the governed hardening path for an existing skill before stable promotion:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint --name verify-security
```

Preview the governed hardening path for a canonical template before future descendants inherit drift:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind workflow
```

Preview the governed scaffold-upgrade path for one descendant before syncing lineage forward:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-scaffold-upgrade-blueprint --name review
```

Refresh a canonical template's review metadata through the governed path:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js review-template --kind workflow --date 2026-05-19 --review-cycle-days 45
```

Resync canonical template host metadata after editing template title or description:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-template-host-metadata --kind workflow
```

Inspect recorded evolution decisions:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-evolution-ledger --status open
```

Inspect the generated cross-cutting investment backlog:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --priority high
```

Inspect the lifecycle decision board for active non-stable skills:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance
```

Inspect one skill's lifecycle state and direct promotion/hardening follow-up:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance --skill verify-security
```

Inspect governed expert-source families and focus only on families with unmapped raw sources:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-expert-source-families --unmapped
```

Register a new expert-source family so future raw expert corpora enter governance through one controlled path:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js register-expert-source-family --family-id expert-research --title "Expert Research" --create-raw-root
```

Rename the governed integration ledger for one expert-source family without hand-editing the registry and pack:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js update-expert-source-family --family-id expert-research --integration-file registry/expert-research-v2.generated.json
```

Archive a retired expert-source family so it stays recorded but no longer creates active governance debt:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js archive-expert-source-family expert-research
```

Restore an archived expert-source family so it resumes active pack and backlog governance:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js restore-expert-source-family expert-research
```

Resolve an evolution request after a governed lifecycle action:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js resolve-evolution 20260509-review-stable --status implemented --executed-action set-status --result-status stable
```

Resolve an admission request after a governed skill create:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js resolve-admission 20260508-skill-gap --status implemented --created-skill reliability-governance
```

Refresh one reviewed skill and keep all review-dependent governance artifacts synchronized:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed manage-skill --date 2026-05-19
```

Refresh every currently overdue governed skill in one pass:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed --overdue --date 2026-05-19
```

Create a workflow:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create workflow ship-v2
```

Create a skill directly from a governed future opportunity:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create workflow platform-governance --opportunity-id 20260509-platform-governance
```

The created `SKILL.md` should now carry scaffold lineage such as:

- `scaffold-origin: workflow-template`
- `scaffold-version: 1`

Create a new domain with immediate capability-module governance scaffolding:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create domain reliability-governance --scaffold-modules
```

If the host cannot create authoritative child directories but the request is already governed, persist the pending scaffold and later materialize it on a writable host:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create domain host-governance-drill --scaffold-modules --defer-when-host-blocked --request-id 20260510-host-governance-drill
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --skill host-governance-drill
node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold host-governance-drill
```

Export blocked derived governance artifacts and later apply the newest matching export on a writable bundle snapshot:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js export-derived-governance
node personal-skill-system/skills/tools/manage-skill/scripts/run.js diagnose-host-evolution
node personal-skill-system/skills/tools/manage-skill/scripts/run.js apply-derived-governance-export --latest
```

Show a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show review
```

Check whether a skill is genuinely ready for top-tier / `stable` promotion:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier review
```

This check is promotion-oriented even for non-`stable` skills, so missing stable-surface evidence such as route fixtures, runtime-proof floor, or review metadata is reported before `set-status stable` is allowed.

Update frontmatter fields:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js update review --set owner=self --set review-cycle-days=14
```

Use `update` for safe metadata drift, not identity or lifecycle mutations. For example, changing route participation through frontmatter will also sync governed route artifacts:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js update review --set user-invocable=false
```

Do not use `update` for `status`, `name`, `kind`, scaffold-lineage fields, or runtime/host-smoke contract fields; those must move through dedicated governed commands such as `set-status`, `create` + `merge`, `sync-scaffold-lineage`, `sync-runtime-proof`, or `run-host-smoke`.

Backfill scaffold lineage for one historical skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage review
```

Backfill scaffold lineage across every canonical non-router/non-adapter skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage --all
```

Move a skill through its lifecycle with generated governance sync:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status review stable
```

Close a governed evolution request while changing lifecycle state:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status review stable --request-id 20260509-review-stable
```

Before moving to `stable`, make sure:

- `assess-top-tier` reports `ready: true`
- every capability module owned by the skill is already `top-ready`
- scripted stable skills already have runtime-proof evidence tests and a valid `scripts/smoke.json`

Promote one capability module by one governance bucket:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-module-rating review-findings-and-severity top-ready
```

Promote every capability module owned by one skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-module-rating --skill review top-ready
```

Re-baseline a module with an explicit skip:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-module-rating temp-domain-skill-decision-rules top-ready --allow-skip
```

After promoting a scripted tool or guard to `stable`, also update:

```bash
personal-skill-system/registry/runtime-proof.generated.json
```

Keep its `contracts` aligned with the skill's `## Runtime Proof` bullets and point `evidence-tests` at real Jest cases.
Keep `scripts/smoke.json` aligned with the smallest executable smoke command so host-smoke metadata can be rebuilt automatically.

Sync one runtime-proof entry from the authoritative skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-quality --evidence-tests test/personal_skill_system_tools.test.js::analyzeQuality detects python-specific maintainability smells,test/personal_skill_system_tools.test.js::analyzeQuality detects async JS and TS contract smells
```

For stable scripted tools and guards, this sync also raises stale `declared-only` entries to the governed minimum level when the required contracts and evidence are already present.

Ask for suggested evidence-test candidates without changing the selected evidence list:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-security --suggest-evidence-tests
```

Auto-apply suggested evidence tests when a stable scripted skill has matching Jest coverage:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-quality --auto-evidence-tests
```

Bulk-sync all live scripted runtime-proof entries:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof --all
```

Run host-smoke across the whole governed scripted surface and refresh the scorecard:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke --all --host codex
```

Invalidate drifted host-smoke artifacts for one skill and rerun immediately:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js reconcile-host-smoke verify-quality --invalidate-drift --rerun --host codex --promote-host-smoked
```

Archive a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js archive review
```

Merge a skill into its neighboring owner while preserving governed history:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js merge verify-quality review --request-id 20260509-verify-quality-merge
```

Delete a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete --path workflows/review
```
