# Check Surface

This tool validates the skill system itself rather than ordinary product code.

## Structural checks

- expected top-level directories exist
- `personal-skill-system/skills/**/SKILL.md` files are discoverable
- generated registry files exist and parse
- canonical template scaffolds exist and stay valid

## Skill contract checks

- required frontmatter fields exist
- skill `kind` matches directory layer
- skill names are unique
- user-invocable skills have route coverage
- stable skills have route-fixture evidence, not only route-map presence
- lifecycle review fields stay present on live skills
- stable skills avoid template/TODO residue and keep a stronger reference floor

## Link and portability checks

- referenced files mentioned in `SKILL.md` exist
- scripted tools and guards expose `scripts/run.js`
- stable scripted skills declare a minimal `Runtime Proof` contract in `SKILL.md`
- `runtime-proof.generated.json` stays aligned with the current stable scripted skills and their declared Runtime Proof bullets
- runtime-proof evidence entries point to real test files and concrete test names
- runtime-proof maintenance should remain cheap enough that evidence coverage can be suggested or reused instead of rediscovered manually
- stable scripted skills expose `scripts/smoke.json` with at least one executable command and scalar success assertions
- runtime-proof host-smoke metadata mirrors each skill-local smoke manifest instead of drifting into hand-edited registry prose
- runtime host-smoke execution artifacts under `benchmark/host-smoke/runtime-runs/` stay parseable and append-only
- `benchmark/host-smoke/scorecard.generated.json` stays aligned with runtime-proof host-smoke entries and executed runtime artifacts
- `host-smoked` should mean a matching smoke contract was actually executed successfully, not just declared in the registry
- when a host-smoke contract declares freshness, `host-smoked` should also mean the latest matching passing artifact is still within that allowed age window
- scripted templates expose `scripts/run.js` where required
- generated metadata does not reference missing skills

## What this tool does not prove

- that every route choice is semantically perfect
- that every reference contains optimal advice
- that host import into a real runtime has already succeeded

It proves structural integrity, not ultimate product taste.
