---
schema-version: 2
name: reliability-governance
template-version: 1
title: Reliability Governance Domain
description: TODO: describe reliability-governance. Use when this domain is the correct primary route.
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
scaffold-origin: domain-template
scaffold-version: 1
---
# Domain Template

## Purpose

Replace this scaffold with the judgement surface for one domain.

## Use This When

- state the primary domain boundary
- state what belongs elsewhere

## Quick Judgement

- list the default heuristics
- list the common tradeoffs

## Read These References

- `references/decision-rules.md`
  Replace with the compact judgement rules that should stay one click away from the entry skill.
- `references/deep-reference-index.md`
  Replace with the deeper topic map for advanced cases and escalation paths.
- `references/boundaries-and-escalations.md`
  Replace with crisp edge conditions, abstention rules, and handoff targets for adjacent skills.

## Route onward

- name the workflow, tool, or adjacent domain that should take over when this domain is not the terminal surface
