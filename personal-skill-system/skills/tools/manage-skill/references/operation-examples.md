# Operation Examples

Check whether a proposed capability should become a new skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check "we need a repeatable workflow for upgrading the skill system itself"
```

Check admission with an explicit target kind:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --kind tool "we need a validator for stale skill metadata and route drift"
```

Inspect recorded admission decisions:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --status open
```

Resolve an admission request after a governed skill create:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js resolve-admission 20260508-skill-gap --status implemented --created-skill reliability-governance
```

Create a workflow:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create workflow ship-v2
```

Create a new domain with immediate capability-module governance scaffolding:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create domain reliability-governance --scaffold-modules
```

Show a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show review
```

Check whether a skill is genuinely ready for top-tier / `stable` promotion:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier review
```

Update frontmatter fields:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js update review --set owner=self --set review-cycle-days=14
```

Move a skill through its lifecycle with generated governance sync:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status review stable
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

Delete a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete --path workflows/review
```
