---
schema-version: 2
name: skill-evolution
scaffold-origin: workflow-template
scaffold-version: 1
title: Skill Evolution Workflow
description: Improve a personal skill system itself: current-skill hardening, future-skill admission, router behavior, trigger surfaces, reference layering, registry quality, portability, pack strategy, and self-hosting governance. Use when refining or rebuilding a skill bundle into a stronger standardized portfolio rather than solving an ordinary product or code task.
kind: workflow
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [skill system, skill-evolution, skill architecture, route map, registry, portability, personal skill, 技能系统, 技能演进, 技能架构, 路由图, 可移植性, 个人技能体系, skill governance, route strategy, 技能治理, 路由策略]
negative-keywords: [ordinary feature, 普通功能开发, single bug, 单点缺陷]
priority: 86
auto-chain: [verify-skill-system, verify-change, verify-quality]
runtime: knowledge
executor: none
permissions: [Read, Write, Grep, Bash]
risk-level: medium
supported-hosts: [codex, claude, gemini]
status: stable
owner: self
last-reviewed: 2026-05-19
review-cycle-days: 30
tags: [workflow, skills, system-design]
aliases: [skill-system, 技能系统演进]
---
# Skill Evolution Workflow

## Chain

1. classify the task as current-skill hardening, future-skill admission, or lifecycle retirement
2. audit the current bundle shape and find the narrowest real structural bottleneck
3. use `manage-skill` to route the change through opportunity, admission, evolution, creation, promotion, merge, archive, or delete flow instead of ad hoc edits
4. decide what belongs in router, domain, workflow, tool, guard, adapter, or reference depth
5. optimize for portable depth, explicit lifecycle, and future add/remove ease rather than local convenience
6. update the smallest charter, template, or skill surface that fixes the real failure mode
7. validate registry, routes, proof surfaces, and self-consistency with `verify-skill-system`

## Constraint

Do not bloat SKILL entry points when the same value belongs in references or generated registry files.

Prefer deepening an existing clean route before creating a new overlapping sibling skill.

## Default Split

- `current-skill hardening`
  Tighten route quality, deepen references, strengthen proof, and promote only after evidence exists.
- `future-skill portfolio work`
  Record demand first, admit only when the capability boundary is sharp, then scaffold in the correct layer.

## Output

- the changed structural source of truth
- the validation evidence that proves the change holds together
- any remaining governed opportunity, evolution, or review debt that should stay visible

## Read These References

- `references/system-audit-lens.md`
  Read when reviewing the bundle as one governed portfolio and looking for structural weakness instead of isolated wording issues.
- `references/routing-and-depth-strategy.md`
  Read when deciding what should be routed directly, what should stay as depth references, and when a new skill would be worse than deepening an existing one.
- `references/portability-and-governance.md`
  Read when the hard part is self-contained packaging, generated metadata, pack boundaries, validation gates, or future-skill lifecycle governance.
- `references/external-skill-integration.md`
  Read when importing, merging, rejecting, or pack-routing outside SKILL sources into the governed bundle.
