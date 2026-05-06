# Operation Examples

Create a workflow:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create workflow ship-v2
```

Show a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show review
```

Update frontmatter fields:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js update review --set owner=self --set review-cycle-days=14
```

Move a skill through its lifecycle with generated governance sync:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status review stable
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

Archive a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js archive review
```

Delete a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete --path workflows/review
```
