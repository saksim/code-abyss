# Top QA Evidence Rules

Use this reference when importing QA-oriented expert material or reviewing changes with a high release risk.

## Core Judgement

Review quality depends on evidence fit, not test volume.

Ask:

- what behavior changed
- what user or operator could observe
- what failure would be most expensive
- what proof layer would catch that failure
- whether current assertions actually guard the changed semantics

## Evidence Ladder

| Risk | Minimum evidence |
|---|---|
| Local pure logic | Unit test or existing equivalent assertion. |
| Cross-module contract | Integration test with real boundary behavior. |
| Persistence, migration, ordering, or idempotency | Integration or replay-style proof with failure-path assertion. |
| Security or authorization | Negative-path test and trust-boundary reasoning. |
| Release-critical workflow | High-fidelity proof plus rollback or mitigation note. |
| UI or visual regression | Runtime/browser evidence when available, otherwise explicit residual risk. |

## QA Finding Bar

A review finding is strong only when it names:

- the changed surface
- the missing or weak proof
- the concrete failure scenario
- the cheapest sufficient validation

## Anti-Patterns

- accepting green CI without mapping tests to changed behavior
- treating snapshots as behavior proof
- using broad mocks where the risk is boundary integration
- missing negative-path checks after validation, auth, or error semantics changed
- demanding end-to-end tests when a smaller proof layer is enough

## Release Gate Notes

For release-facing reviews, call out:

- whether rollback is simple, risky, or blocked
- whether data changes are backward compatible
- whether feature flags or canaries reduce exposure
- whether monitoring can detect the failure quickly

