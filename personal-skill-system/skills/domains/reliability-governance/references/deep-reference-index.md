# Reliability Deep Reference Index

Use this index when the entry skill is not enough and the real work needs a deeper reliability lens across adjacent domains.

## SLOs, budgets, and reliability policy

- use `decision-rules.md` first for the operating posture
- read [`../../devops/references/expert-alerts-runbooks-and-diagnosis.md`](../../devops/references/expert-alerts-runbooks-and-diagnosis.md)
  when alert classes, paging quality, or runbook shape are the weak point
- read [`../../architecture/references/expert-reliability-and-ha.md`](../../architecture/references/expert-reliability-and-ha.md)
  when target posture depends on HA controls, retries, isolation, or failure injection

## Recovery operations and drills

- read [`../../infrastructure/references/expert-dr-exercises-and-recovery-operations.md`](../../infrastructure/references/expert-dr-exercises-and-recovery-operations.md)
  when the issue is whether DR or recovery capability is actually practiced
- read [`../../infrastructure/references/expert-failover-topology-and-consistency.md`](../../infrastructure/references/expert-failover-topology-and-consistency.md)
  when active-active, active-standby, or consistency during failover are the main tradeoffs

## Release and operational pressure

- read [`../../devops/references/expert-rollback-and-release-operations.md`](../../devops/references/expert-rollback-and-release-operations.md)
  when reliability policy must constrain rollout, rollback, or canary behavior
- read [`../../devops/references/expert-signal-design-and-instrumentation.md`](../../devops/references/expert-signal-design-and-instrumentation.md)
  when the problem is missing or low-quality signal rather than the target itself

## AI and service reliability

- read [`../../ai/references/expert-latency-cost-and-reliability.md`](../../ai/references/expert-latency-cost-and-reliability.md)
  when degradation, timeout classes, and fallback economics are AI-system specific

## What this domain should add

The surrounding references explain architecture shape, observability operations, or infra drills.
This domain is responsible for the governing judgement that ties them together:

- what promise to make
- what budget and page policy enforces it
- what degradation is acceptable
- what proof is needed before declaring recovery

## Strong outputs for deeper cases

Leave behind:

- journey-level reliability objective
- incident severity matrix
- release guard tied to budget health
- recovery drill scope and acceptance bar
- owner map for decision, mitigation, and closure
