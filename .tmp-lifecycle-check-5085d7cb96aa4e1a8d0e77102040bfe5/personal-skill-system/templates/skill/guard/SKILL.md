---
schema-version: 2
name: guard-template
title: Guard Template
description: Template scaffold for a guard skill. Replace this with a description that says what risky work the guard blocks or allows and when to invoke it.
kind: guard
visibility: public
user-invocable: true
trigger-mode: [manual]
trigger-keywords: [guard-signal]
negative-keywords: []
priority: 95
runtime: scripted
executor: node
permissions: [Read, Bash]
risk-level: medium
supported-hosts: [codex, claude, gemini]
status: draft
host-smoke-tier: experimental
host-smoke-target-level: declared-only
owner: self
last-reviewed: 2026-04-17
review-cycle-days: 45
tags: [template, guard]
aliases: []
---

# Guard Template

## Block Conditions

- describe what should block immediately
- describe what needs operator escalation

## Pass Conditions

- describe what evidence is enough to continue

## Read These References

- `references/block-and-pass-rules.md`
  Replace with the concrete decision table for block, warn, and pass.
- `references/escalation-policy.md`
  Replace with operator-facing escalation and exception handling notes.

## Runtime Proof

- Replace with one concrete machine-readable decision contract this guard is expected to satisfy.
- Replace with a second contract that can later be linked to a smoke test or regression test.

## Host Smoke

- Update `scripts/smoke.json` so the smallest executable command asserts the real top-level output contract for this guard.

## Invoke

```bash
node scripts/run.js --target <path> --json
```
