# Top Skill Integration Promotion Decision (2026-05-29)

Scope: promotion and lifecycle decision record for the upgrade pass driven by
`TOP_SKILL_INTEGRATION_CONSTRUCTION_PLAN_2026-05-29.md`.

This memo is not a blanket stability claim. It records which integrations were promoted,
kept experimental, kept pack-owned, deferred, or rejected after admission, route evidence,
runtime proof, and top-tier readiness checks.

## Decision Summary

| Area | Decision | Evidence |
|---|---|---|
| OpenAI API guidance | Merge into `ai`; do not create `openai-docs` core skill in this pass. | Admission ledger advises reuse; `ai` now owns OpenAI API integration guidance and current-fact verification boundaries. |
| Python top-dev depth | Merge into `development`. | `development` now links a Python engineering depth reference and routes Python/type/pytest prompts directly. |
| `imagegen` | Keep `experimental`; ready for future stable promotion but not promoted in this pass. | Admission implemented; route fixture exists; runtime proof is declared-and-tested; `assess-top-tier imagegen` reports ready. |
| `plugin-creator` | Keep `experimental`; ready for future stable promotion but not promoted in this pass. | Admission implemented; route fixture exists; runtime proof is declared-and-tested; `assess-top-tier plugin-creator` reports ready. |
| gstack runtime skills | Keep pack-owned. | `GSTACK_PACK_OWNERSHIP_DECISION_2026-05-29.md`, `docs/GSTACK_CAPABILITY_MAP.md`, `packs:check`, and vendor sync check keep ownership outside core. |
| top-qa evidence rules | Merge into `review`; no sibling QA route. | `review` remains stable and `assess-top-tier review` reports ready. |
| skill-authoring method | Merge into `manage-skill` and `skill-evolution`; no duplicate `skill-creator` route. | Governance references now define external-skill absorption and skill creation boundaries. |

## Promoted

No experimental skill was promoted to `stable` in this pass.

Reason: the project should not turn newly materialized tool surfaces into stable user promises
on the same pass that creates them. `imagegen` and `plugin-creator` are promotion-ready by the
current top-tier gate, but they should see real project usage and host portability review before
their lifecycle status changes.

## Stable Skills Reaffirmed

| Skill | Result |
|---|---|
| `ai` | Stable, ready, no blockers. |
| `development` | Stable, ready, no blockers. |
| `review` | Stable, ready, no blockers. |
| `skill-evolution` | Stable, ready, no blockers. |
| `sage` | Stable, ready, no blockers. |

## Experimental

| Skill | Current status | Decision |
|---|---|---|
| `imagegen` | `experimental` | Keep experimental. It is route-tested and runtime-tested, but host image capability differences still need real-use proof. |
| `plugin-creator` | `experimental` | Keep experimental. It is Codex-specific by design, so stable promotion should wait for plugin scaffold usage across at least one release cycle. |

## Deferred

| Item | Decision |
|---|---|
| `openai-docs` standalone skill | Deferred. Current admission did not approve a new core skill; OpenAI API work is handled by `ai` with official-doc verification rules. |
| gstack pack host-smoke target | Deferred. Pack availability is documented and pack checks pass; a dedicated pack host-smoke target remains future P2-004 work. |
| Full release tarball smoke | Deferred until npm release preparation. The construction plan still requires `npm run verify:tarball-smoke` before release. |

## Rejected

| Item | Reason |
|---|---|
| Bulk-copying external SKILL trees into core | Violates the single-source and progressive-disclosure rules. |
| `skill-installer` as a duplicate core skill | Personal Skill System already owns install, uninstall, pack, and vendor workflows. |
| gstack skills as copied core workflows | Browser QA, design review, benchmark, canary, and deployment flows are external runtime capabilities and stay pack-owned. |

## Readiness Notes

- Critical host-smoke debt for the stable scripted skill wave was cleared in the follow-up
  iteration. `manage-skill`, `verify-chart-spec`, `verify-quality`, `verify-s2-config`, and
  `verify-skill-system` now report top-tier ready after fresh Codex host-smoke evidence.
- `show-top-tier-wave` now reports `blocked: 0`.
- New route fixtures were added for OpenAI API guidance and Python engineering depth, in addition
  to the existing `imagegen` and `plugin-creator` non-placeholder fixtures.
- The only remaining investment backlog items are the intentional `experimental` lifecycle
  decisions for `imagegen` and `plugin-creator`.

## Validation Snapshot

Already observed in this pass or the immediately preceding construction pass:

```bash
npm test -- test/personal_skill_system_tools.test.js --runInBand
npm run verify:skills
npm run verify:skill-system
npm run packs:check
npm run packs:vendor:sync -- --check
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ai --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier development --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier imagegen --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier plugin-creator --json
node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke manage-skill --host codex --promote-host-smoked
node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-chart-spec --host codex --promote-host-smoked
node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-quality --host codex --promote-host-smoked
node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-s2-config --host codex --promote-host-smoked
node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-skill-system --host codex --promote-host-smoked
```

Final release still needs the release validation profile to be rerun from a clean candidate,
plus tarball smoke before npm release.
