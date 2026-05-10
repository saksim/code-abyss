---
schema-version: 2
name: workflow-template
template-version: 1
title: Workflow Template
description: Template scaffold for a workflow skill. Replace this with a workflow-specific description that says what chain it owns and when to use it.
kind: workflow
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [workflow-signal, workflow-trigger]
negative-keywords: []
priority: 80
runtime: knowledge
executor: none
permissions: [Read, Write, Grep, Bash]
risk-level: medium
supported-hosts: [codex, claude, gemini]
status: draft
owner: self
last-reviewed: 2026-04-17
review-cycle-days: 60
tags: [template, workflow]
aliases: []
---

# Workflow Template

## Entry Condition

- describe the task shape that should enter this workflow
- describe the prerequisites that must already be true
- describe what should route to a domain, tool, guard, or adjacent workflow instead

## Execution Chain

1. name the first irreversible or highest-cost step
2. name the major handoffs and decision gates
3. name the validation points and stop conditions

## Proof Contract

- define what evidence must exist before the workflow can claim completion
- define what the workflow should emit when it stops early, retries, or hands off

## Read These References

- `references/entry-and-exit-criteria.md`
  Replace with routing boundaries, required prerequisites, and exit conditions.
- `references/verification-checklist.md`
  Replace with the workflow's proof checklist, validation order, and completion evidence.
- `references/failure-modes.md`
  Replace with recovery rules, abort conditions, and escalation behavior when the workflow cannot complete cleanly.

## Summary Format

- define what the workflow should report back after execution, including evidence, changed artifacts, and remaining risk
