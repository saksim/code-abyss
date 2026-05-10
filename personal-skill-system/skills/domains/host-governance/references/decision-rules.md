# Host Governance Decision Rules

Use this reference when the core question is what the current host can safely do, what it cannot, and how the bundle should respond without lying about capability.

## Core rules

- distinguish permission to read from permission to mutate, and distinguish both from the ability to create new paths
- treat host capability as a first-class dependency of the workflow, not as an afterthought after planning is complete
- fail early when partial execution would leave governance state misleading or half-mutated
- degrade only when the degraded path preserves truth, traceability, and a useful next step
- recurring host limits should become governed debt, not repeated one-off console warnings

## Capability framing

Name these before choosing an execution plan:

- what operation is needed: read, rewrite existing file, create file, create directory, run shell, run networked tool, launch subagent
- whether the host blocks the operation structurally or only for this path
- whether a derived artifact can lag safely or whether it is part of the authoritative truth
- whether the constraint is transient, host-specific, or a durable portability boundary

## Fail vs degrade rules

- fail immediately when the blocked operation would leave authoritative source and generated governance state diverged without an explicit governed debt trail
- degrade when the authoritative source can still be updated correctly and the blocked artifact is derived, inspectable, and already modeled as debt
- reroute when another host-facing layer already owns the missing capability more cleanly than this domain
- defer when neither execution nor honest degradation is possible and the next required host change is clear

## Filesystem and sandbox rules

- a writable parent directory does not prove child-directory creation is allowed; probe the exact capability that the workflow needs
- separate:
  - rewrite existing artifact
  - create new file
  - create new directory
  - append runtime evidence
- if a host permits one of these but not another, record the narrower truth instead of collapsing everything into generic writeability

## Portability rules

- host adapters should describe host-local translation facts
- this domain should govern the decision of how much the bundle may rely on those facts
- avoid burying host-specific exceptions in otherwise portable public skills when the constraint is cross-cutting
- when a new host limit affects future skill creation or promotion, surface it in backlog/readiness governance so portfolio planning sees it

## Degraded-mode rules

- a degraded path must state:
  - what cannot be executed
  - what was still updated or verified
  - what debt or warning was emitted
  - what exact follow-up action is now required
- do not mark a workflow successful if the only successful part was analysis while the requested governed mutation was blocked
- do not silently skip generated artifact refresh unless the system explicitly models that artifact as derived debt under host constraint

## Anti-patterns

- assuming `fs.access(W_OK)` implies directory creation is possible
- retrying a host policy denial as if it were flaky IO
- hand-editing generated files to hide a host limitation that still exists
- treating sandbox drift as a content bug inside the skill itself
- promising cross-host portability while relying on one host's undocumented escape hatch

## Output contract

Leave behind:

- the exact blocked capability
- the chosen fail/degrade/reroute/defer decision
- whether the affected surface is authoritative or derived
- the next host or governance action required
