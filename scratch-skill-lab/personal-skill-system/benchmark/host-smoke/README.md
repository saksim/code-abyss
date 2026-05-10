# Host Smoke Task Set

Task set file:

- `tasks.host-smoke.v1.json`

Result template:

- `results.template.json`

Usage:

1. Run all tasks for one host.
2. Record per-task status and failure type.
3. Keep host runs append-only for historical comparison.

## Runtime Host-Smoke Runs

Executable scripted-skill smoke runs live in:

- `runtime-runs/`

Schema:

- `runtime-run.schema.json`

These runs are distinct from route/task-set evaluations:

- they execute `runtime-proof.generated.json -> host-smoke.commands`
- they capture pass/fail evidence for stable scripted tools and guards
- they let `verify-skill-system` distinguish declared smoke contracts from actually executed host-smoke evidence
- they feed `scorecard.generated.json`, which summarizes bundle-wide host-smoke coverage, freshness, and governance status
- drift invalidation is tracked separately in `invalidation.generated.json` so append-only run history stays intact while governed reconciliation can retire stale evidence

Operational rule:

1. append a new JSON run artifact for each execution
2. never overwrite older run files
3. treat the latest matching passing result for a skill as the current executable evidence surface
4. record governed invalidations in `invalidation.generated.json` instead of deleting old run files by hand
5. refresh `scorecard.generated.json` whenever runtime-proof host-smoke contracts, invalidation state, or runtime run artifacts change
