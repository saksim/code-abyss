# Host Governance Deep Reference Index

Use this index when the entry skill is not enough and the real work needs a deeper host, governance, or portability lens.

## Host-local assumptions and translation

- read [`../../../adapters/codex/references/host-capabilities.md`](../../../adapters/codex/references/host-capabilities.md)
  when the current issue is Codex-specific capability shape or path/runtime assumptions
- read [`../../../adapters/claude/references/host-capabilities.md`](../../../adapters/claude/references/host-capabilities.md)
  when the issue is Claude-specific capability or translation behavior
- read [`../../../adapters/gemini/references/host-capabilities.md`](../../../adapters/gemini/references/host-capabilities.md)
  when the issue is Gemini-specific capability or translation behavior

## Governed mutation surfaces

- read [`../../../tools/manage-skill/references/authoritative-skill-rules.md`](../../../tools/manage-skill/references/authoritative-skill-rules.md)
  when the blocked operation touches authoritative skill CRUD, generated artifact sync, or lifecycle mutation
- read [`../../../tools/verify-skill-system/references/check-surface.md`](../../../tools/verify-skill-system/references/check-surface.md)
  when the host constraint should appear as bundle audit/readiness/backlog signal rather than an incidental runtime error

## Runtime proof and evidence governance

- read [`../../../tools/verify-skill-system/SKILL.md`](../../../tools/verify-skill-system/SKILL.md)
  when host-smoke, runtime-proof, or generated-readiness surfaces are involved
- read [`../../../workflows/skill-evolution/references/portability-and-governance.md`](../../../workflows/skill-evolution/references/portability-and-governance.md)
  when the real question is how to evolve bundle architecture around durable host limits

## Cross-domain decision overlap

- read [`../../architecture/references/expert-platform-governance.md`](../../architecture/references/expert-platform-governance.md)
  when host constraints force platform-wide ownership or policy decisions
- read [`../../devops/references/expert-release-gate-design.md`](../../devops/references/expert-release-gate-design.md)
  when the host issue should change CI or release gate behavior rather than skill content

## What this domain should add

The surrounding references explain adapters, mutation tools, or verification mechanics.
This domain is responsible for the governing judgement that ties them together:

- what the host can truthfully promise
- what capability must be probed instead of assumed
- what can degrade safely
- what must remain blocked until the host boundary changes

## Strong outputs for deeper cases

Leave behind:

- host capability matrix for the relevant operation
- degrade-vs-fail decision with rationale
- authoritative vs derived artifact classification
- bundle-level follow-up debt or escalation target
