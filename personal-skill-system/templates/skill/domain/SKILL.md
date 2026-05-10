---
schema-version: 2
name: domain-template
template-version: 1
title: Domain Template
description: Template scaffold for a domain skill. Replace this with a domain-specific description that says what the skill covers and when to use it.
kind: domain
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [domain-signal, domain-trigger]
negative-keywords: []
priority: 70
runtime: knowledge
executor: none
permissions: [Read]
risk-level: low
supported-hosts: [codex, claude, gemini]
status: draft
owner: self
last-reviewed: 2026-04-17
review-cycle-days: 60
tags: [template, domain]
aliases: []
---

# Domain Template

## Purpose

Replace this scaffold with the judgement surface for one domain.

Own reusable domain judgement, not every downstream execution chain, guardrail, or tool.

## Use This When

- state the primary domain boundary in user language
- state the stable intents that should route here directly
- state what belongs in workflows, tools, guards, or adjacent domains instead

## Quick Judgement

- list the default win rules
- list the decisive variables and tradeoffs
- list the anti-patterns that should cause escalation or abstention

## Depth Contract

- keep the entry skill thin and reusable
- move dense topic depth into references
- prefer adding reference depth before creating a sibling skill with overlapping route intent

## Read These References

- `references/decision-rules.md`
  Replace with the compact default judgement rules that should stay one click away from the entry skill.
- `references/deep-reference-index.md`
  Replace with the deeper topic map for advanced cases, subtopics, and reusable expert depth.
- `references/boundaries-and-escalations.md`
  Replace with crisp edge conditions, abstention rules, and handoff targets for adjacent skills.

## Route onward

- name the workflow, tool, guard, or adjacent domain that should take over when this domain is not the terminal surface
