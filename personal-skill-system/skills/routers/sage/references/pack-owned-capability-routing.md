# Pack-Owned Capability Routing

Use this reference when a request could route to either a core project skill or an installed pack capability.

## Default Rule

Core skills own portable reasoning and project-governed workflows. Packs own heavy runtime capabilities.

Route to core first when the user asks for:

- implementation
- architecture
- review
- release readiness
- security judgement
- skill-system governance
- deterministic project validators

Route to the pack when the user asks for:

- browser control
- screenshots
- live page QA
- canary monitoring
- visual design review with runtime evidence
- a command that belongs to the pack runtime

## gstack

gstack is pack-owned in this project.

Use gstack for:

- `browse` and `open-gstack-browser` when a browser session is required
- `qa` and `qa-only` when the deliverable is runtime QA evidence
- `benchmark` when measuring page performance
- `canary` when watching a deployed app
- `design-review` and related design workflows when visual runtime inspection is required

Keep core ownership for:

- `review` as findings-first code review
- `ship` as release readiness and rollback judgement
- `frontend-design` as portable UI/UX/design-system reasoning
- `devops` as CI/CD and operational readiness reasoning

## Conflict Handling

If both are plausible:

1. Use the core route for framing and risk.
2. Chain to pack runtime only when evidence requires it.
3. Do not create a new core skill that only wraps a pack command.
4. Document any host-specific pack limitation instead of hiding it in route wording.

