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
4. after any mutation, run `npm run verify:skills`
5. if the skill is user-invocable, follow with route/registry verification
