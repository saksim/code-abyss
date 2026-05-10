# Host Governance Boundaries And Escalations

Use this reference when host constraints overlap with adjacent domains and the primary owner is not obvious.

## Keep the work here when

- the hard part is deciding how the bundle should behave under sandbox, permission, or execution limits
- the problem spans multiple skills because the host boundary is cross-cutting
- the main question is whether a blocked capability should fail, degrade, or become governed debt

## Escalate to adapters when

- the issue is host-specific translation detail rather than governance judgement
- you need the exact Codex, Claude, or Gemini path/tool assumption documented or updated
- the constraint is isolated to one host integration surface, not the portable policy around it

## Escalate to manage-skill when

- the work is authoritative skill CRUD, lifecycle mutation, route sync, or generated governance refresh
- the next step is to create, update, archive, merge, or delete a governed skill
- the host issue should change mutation preflight checks or operation behavior directly

## Escalate to verify-skill-system when

- the main task is auditing whether host constraints are already modeled correctly in readiness, backlog, or validation findings
- the issue is drift detection, scorecard integrity, or bundle-health reporting

## Escalate to architecture when

- host limits force an irreversible platform or system design choice
- the real question is whether the system should depend on a capability that some hosts do not provide

## Escalate to devops when

- the missing capability should be solved in CI, release automation, runtime environment preparation, or operator workflow
- the host boundary is best handled by changing where or how the workflow runs rather than changing skill governance

## Escalation triggers

- a workflow assumes directory creation, network, or shell authority without probing it
- the same host warning recurs across runs with no backlog or readiness surface
- a generated artifact is treated as authoritative in one place and derived in another
- a new skill admission is open only because the host cannot scaffold it
- the team is debating workaround mechanics without first naming the host boundary explicitly

## Output contract

Leave behind:

- primary owner domain
- adjacent surface that should take over next
- exact blocked capability or policy boundary
- whether the follow-up is code change, host change, or governance model change
