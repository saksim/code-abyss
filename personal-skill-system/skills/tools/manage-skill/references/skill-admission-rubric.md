# Skill Admission Rubric

Use this rubric before creating a new skill.

## Default order

1. ask whether an existing routed skill already owns the request strongly
2. if yes, deepen that skill before creating a sibling
3. if two live skills are close, fix the boundary before adding surface area
4. create a new skill only when the request is real and structurally distinct

## Recommendation modes

### Reuse existing skill

Choose this when one routed skill already wins with strong confidence.

Typical action:

- tighten references
- add route fixtures
- promote capability modules

### Upgrade existing skill

Choose this when one routed skill partially fits but only at minimum confidence.

Typical action:

- improve trigger boundaries
- deepen reference coverage
- add missing capability modules

Do not create a sibling skill just because the current one is shallow.

### Clarify or merge boundary

Choose this when two current skills remain close on the same request.

Typical action:

- narrow one route
- improve conflict notes
- move depth behind one primary route

This prevents route sprawl.

### Create new skill

Choose this only when the request is not strongly owned by any current route and its boundary is clear.

Use kind selection as follows:

- `domain`: judgement surface or durable knowledge area
- `workflow`: repeatable multi-step execution chain
- `tool`: deterministic validation, generation, or analysis
- `guard`: downstream risk gate or policy blocker
- `router`: dispatch and fallback policy
- `adapter`: host-specific compatibility or capability translation

## Anti-patterns

- creating a new public skill because an existing stable skill lacks depth
- creating overlapping peer skills without first resolving route competition
- creating a tool where a workflow or domain boundary is the real gap
- creating a public routed skill for something that should stay as capability depth
