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

- describe what kind of task should enter this workflow
- describe what should route somewhere else

## Execution Chain

1. name the first irreversible step
2. name the major handoffs
3. name the validation points

## Read These References

- `references/entry-and-exit-criteria.md`
  Replace with routing boundaries, required prerequisites, and exit conditions.
- `references/verification-checklist.md`
  Replace with the workflow's proof checklist and common failure cases.
- `references/failure-modes.md`
  Replace with recovery rules, abort conditions, and escalation behavior when the workflow cannot complete cleanly.

## Summary Format

- define what the workflow should report back after execution
