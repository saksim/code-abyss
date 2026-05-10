# Routing And Depth Strategy

## First separate three things

- direct route surface
- execution chain
- expert depth

Do not solve all three by making SKILL.md longer.

## Route surface rules

Use direct routing for:

- stable user intents
- high-frequency request classes
- actions that need predictable entry points
- work that benefits from a reusable named surface instead of buried reference depth

Keep out of direct routing:

- niche variants
- overlapping expert personas
- long examples that only add token cost
- premature sibling skills whose only difference is a slightly different wording of the same intent

## Depth rules

Use references for:

- checklists
- pattern catalogs
- selection matrices
- edge-case heuristics
- expert overlays

Normalize repeated ideas into one shared reference instead of copying them into several skills.

If the new demand is real but not yet sharp enough for a public route, prefer opportunity or admission flow over inventing a weak direct route.

## Escalation model

Recommended order:

1. route to the smallest correct skill
2. load direct references for that skill
3. escalate to expert depth only if the baseline layer is insufficient
4. attach validation or guards only when the task crosses a risk threshold

Recommended add-vs-deepen rule:

1. if an existing stable route already owns the intent, deepen it
2. if the intent is adjacent but distinct, test whether a workflow or tool under the same domain is cleaner than a new peer domain
3. create a new top-level sibling only when boundary, ownership, and route language are all sharp

## Self-system work

When the target artifact is the skill system itself:

- prefer `skill-evolution`
- use `architecture-decision` only for large irreversible design choices
- use tools and guards as downstream checks, not as primary reasoning engines
- use `manage-skill` opportunity, admission, and evolution commands so future additions and removals stay governable
