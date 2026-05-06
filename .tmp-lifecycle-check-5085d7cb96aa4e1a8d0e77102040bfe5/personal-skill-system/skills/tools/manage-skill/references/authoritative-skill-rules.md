# Authoritative Skill Rules

All core skill create/read/update/delete operations must target:

- `personal-skill-system/skills/**/SKILL.md`
- `personal-skill-system/skills/**/references/*`
- `personal-skill-system/skills/**/scripts/*`

Never edit:

- repo root `skills/`
- generated registry files as a substitute for source edits
- route-map entries without the corresponding authoritative skill change

Operation rules:

1. create from the canonical template for the selected kind
2. keep public user-invocable skills routable and registry-backed
3. prefer `archive` over immediate destructive deletion when history may matter
4. destructive delete should prefer explicit authoritative relative path mode (`--path`)
5. change lifecycle state through `set-status` or `archive`; do not use generic frontmatter update to hand-edit `status`
6. after any mutation, run `npm run verify:skills`
7. if the skill is user-invocable, follow with route/registry verification
8. if the skill is a stable scripted tool or guard, keep `runtime-proof.generated.json` aligned with its Runtime Proof contract
   and keep `scripts/smoke.json` aligned with the smallest real executable smoke command for that skill
   so `benchmark/host-smoke/scorecard.generated.json` remains a trustworthy bundle-wide governance view
9. prefer `sync-runtime-proof --suggest-evidence-tests` or `--auto-evidence-tests` before hand-curating Jest evidence ids for scripted skills
