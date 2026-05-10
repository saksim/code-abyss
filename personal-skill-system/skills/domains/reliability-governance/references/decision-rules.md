# Reliability Decision Rules

Use this reference when the core question is what reliability promise to make, how to operate against it, and when to slow delivery in order to protect service health.

## Core rules

- define the user-visible promise before choosing dashboards or controls
- set SLOs by business consequence and operator capability, not by copying industry folklore
- treat error budget as a decision control for launches, risky migrations, and alert tuning
- require a degradation ladder before claiming high availability
- recovery is only complete after correctness, integrity, and user-impact checks pass

## Reliability framing

Name these first:

- critical user journeys and their reliability importance
- what counts as badness: error, timeout, stale result, integrity violation, delayed processing
- failure classes: dependency loss, overload, release regression, data corruption, operator error
- acceptable recovery time and acceptable data loss
- who owns the first response and who can trade correctness against availability

## SLO rules

- write SLOs at the user-journey or service-objective level, not only for infrastructure components
- pair each SLO with one or two SLIs that are directly observable and operationally actionable
- define what is excluded and why: maintenance, non-critical background work, best-effort features
- reject vanity SLOs with no paging threshold, no review cadence, or no owner
- split objectives when failure economics differ: interactive reads, writes, batch completion, recovery latency

## Error-budget rules

- define the budget window and burn semantics explicitly
- map budget burn to actions:
  - healthy burn: ship normally
  - elevated burn: tighten release review and pause low-value risk
  - critical burn: stop non-essential changes and prioritize stabilization
- use fast-burn alerts for acute incidents and slow-burn alerts for chronic reliability debt
- budget policy should mention who can override and what evidence is required

## Incident posture rules

- page only on user-impacting or budget-threatening signals with clear operator action
- define incident severity from user impact, correctness impact, and time sensitivity
- incident command must name one decision owner, one communication owner, and one technical lead when pressure is high
- every incident path should state:
  - first discriminator checks
  - safe mitigation actions
  - rollback or degradation option
  - proof required before closure

## Degradation and resilience rules

- define level 0 through worse-case fallback before production traffic forces improvisation
- each degradation step must state:
  - what functionality is removed or reduced
  - what user promise remains
  - what signal triggers escalation or rollback
- prefer graceful degradation over hidden silent corruption
- retries, queues, and failover only count as reliability improvements when bounded by idempotency and overload control

## Recovery-proof rules

- closure requires more than "the error rate dropped"
- prove:
  - primary user journey success
  - backlog or queue convergence where relevant
  - state integrity or reconciliation status
  - dependency posture if the incident was external
- if integrity cannot yet be proven, classify the service as degraded or partially recovered rather than resolved

## Anti-patterns

- one global 99.9 target across unrelated journeys with different failure economics
- alerting on infrastructure symptoms without mapping them to user impact or budget burn
- incident review that lists causes but leaves no reliability control change
- DR claims based on documents or tabletop only
- availability claims that ignore stale, duplicated, or corrupted outputs

## Output contract

Leave behind:

- service promise and SLO/SLI pair
- error-budget policy
- severity and paging posture
- degradation ladder
- recovery proof checklist
