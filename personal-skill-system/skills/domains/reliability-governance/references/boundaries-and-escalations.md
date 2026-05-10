# Reliability Boundaries And Escalations

Use this reference when reliability concerns overlap with adjacent domains and the primary owner is not obvious.

## Keep the work here when

- the hard part is deciding the service promise, not implementing the mechanism
- the question is how strict the SLO, page policy, degradation ladder, or recovery proof should be
- the team needs a reliability governance rule such as error-budget action, incident severity, or drill acceptance criteria

## Escalate to architecture when

- the main question is system shape, service boundaries, queue/cache/database design, or HA topology
- an irreversible design choice determines the feasible reliability envelope
- you need explicit tradeoffs among active-active, replication mode, or isolation strategy

## Escalate to devops when

- the reliability policy is already known and the missing work is release gates, instrumentation, alert predicates, or runbook wiring
- the issue is CI/CD, canary mechanics, rollback operation, or observability implementation detail

## Escalate to infrastructure when

- the key problem is cluster failover, region topology, DR environment shape, platform identity, or runtime control plane behavior
- recovery realism depends on infra automation or drill execution details

## Escalate to security when

- the incident involves compromise, auth abuse, secret exposure, or trust re-establishment after prevention failed
- the dominant tradeoff is containment and authority reset, not only availability

## Escalate to investigate when

- there is an active failure and the root cause is still unknown
- you need to reconstruct what happened before prescribing policy or long-term controls

## Escalation triggers

- no clear user-impact definition exists yet
- operators disagree on whether availability can override correctness
- the proposed SLO has no owner, page policy, or recovery proof
- recovery depends on state reconciliation the team has never practiced
- repeated incidents exist but no budget or severity policy has changed

## Output contract

Leave behind:

- primary owner domain
- escalation target if reliability is not the terminal surface
- unresolved dependency or evidence gap
- exact follow-up question or artifact needed next
