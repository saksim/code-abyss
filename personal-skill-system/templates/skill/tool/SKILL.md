---
schema-version: 2
name: tool-template
template-version: 1
title: Tool Template
description: Template scaffold for a scripted tool skill. Replace this with a description that says what the tool validates or generates and when to invoke it explicitly.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [manual]
trigger-keywords: [tool-signal]
negative-keywords: []
priority: 90
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
tags: [template, tool]
aliases: []
---

# Tool Template

## Purpose

Replace this scaffold with the deterministic job this tool owns.

Own one trustworthy executable contract, not a vague checklist disguised as a tool.

## Expected Inputs

- list required arguments or target shape
- list unsafe or unsupported modes

## Output Contract

- define the machine-readable output shape
- define the operator summary shape

## Maintenance Rules

- keep the structural source of truth in the skill and its scripts, not in generated registry prose
- keep the smallest executable command aligned with `scripts/smoke.json`
- do not let runtime-proof, smoke manifest, and implementation drift apart

## Read These References

- `references/check-surface.md`
  Replace with the exact surfaces this tool should inspect or produce.
- `references/usage-examples.md`
  Replace with representative invocations and interpretation notes.

## Runtime Proof

- Replace with one concrete machine-readable runtime contract this tool is expected to satisfy.
- Replace with a second contract that can later be linked to a smoke test or regression test.

## Host Smoke

- Update `scripts/smoke.json` so the smallest executable command asserts the real top-level output contract for this tool.

## Run

```bash
node scripts/run.js --target <path> --json
```
