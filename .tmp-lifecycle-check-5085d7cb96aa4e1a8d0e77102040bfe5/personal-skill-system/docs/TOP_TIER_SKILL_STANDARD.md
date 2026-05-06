# Top-Tier Skill Standard

Use this document when deciding whether a skill is already top-tier, only partially strong, or not ready for promotion.

## Objective

The personal skill system should make two things true at the same time:

1. existing skills can become first-class capabilities inside their own domains
2. future skills can be added, upgraded, deprecated, or removed without inventing a new process each time

## What "Top-Tier" Means

Top-tier is a system property, not a word-count property.

A top-tier skill is:

- easy to route to correctly
- deep enough to solve hard cases
- honest about its boundaries
- validated by the surrounding system
- cheap to maintain because its lifecycle is explicit

## Promotion Criteria

Promote a skill to `stable` only when all of the following are true.

### Route quality

- `description` clearly says when to use it
- trigger keywords are concrete, not generic filler
- conflicts and fallback behavior are intentional
- route fixtures cover representative prompts
- a `stable` skill should have at least one explicit route fixture proving direct win or explicit fallback behavior

### Depth quality

- `SKILL.md` is concise enough to load repeatedly
- important hard decisions are in `references/`
- references are named by problem, not by vague notes
- a `stable` skill should not still look like a template or TODO scaffold

### Runtime quality

- scripted skills expose a trustworthy `scripts/run.js`
- runtime metadata matches the actual implementation
- dangerous or high-value behavior is tested
- a `stable` scripted skill should declare a small `Runtime Proof` section listing its smoke-contract expectations
- runtime-proof evidence tests should be discoverable and maintainable without ad-hoc manual registry hunting
- a `stable` scripted skill should also ship `scripts/smoke.json` with the smallest host-invocable command and top-level success assertions
- host-smoke governance should be declared in frontmatter so tier, target level, and freshness expectations move with the skill instead of living in hard-coded policy lists
- `host-smoked` promotion should mean executable smoke commands exist, not only that the enum value is available

### Governance quality

- owner is clear
- review rhythm is present
- lifecycle status is current
- generated metadata remains aligned

## Current-Skill Upgrade Ladder

Use this order when hardening a current skill:

1. fix trigger ambiguity
2. split shallow entry from deep references
3. remove duplicated expert material
4. harden scripted behavior
5. add route fixtures and runtime tests
6. promote lifecycle status

Do not upgrade all skills at once by mass-editing tone or length. Upgrade by removing real failure modes.

## Future-Skill Operating Model

Every future skill should start from the canonical scaffold and inherit:

- valid schema-v2 frontmatter
- the right layer for its job
- at least two reference placeholders
- a scripted stub when runtime execution is required
- lifecycle metadata from day one

This is the main mechanism that keeps future additions cheap and consistent.

## Add / Iterate / Remove Protocol

### Add

- create from template
- fill in frontmatter honestly
- add references before expanding entry text
- verify routing and runtime surfaces

### Iterate

- improve the narrowest weak point first
- prefer deepening an existing route over creating a sibling skill
- promote only after evidence exists
- change lifecycle state through the governed manage-skill flow so runtime-proof, ratings, and readiness artifacts stay synchronized

### Remove

- deprecate if replacement migration matters
- archive if history matters
- delete only when no live route or governance dependency remains

## Non-Goals

This standard does not require:

- every skill to be equally large
- every skill to own a script
- every skill to be public

It does require every skill to be structurally honest.
