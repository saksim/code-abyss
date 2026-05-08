---
schema-version: 2
name: claude-host
title: Claude Host Adapter
description: Internal adapter surface for Claude-specific runtime assumptions, import notes, and capability hints. Use when maintaining how the portable skill bundle should be translated or constrained on Claude hosts.
kind: adapter
visibility: internal
user-invocable: false
trigger-mode: [manual]
trigger-keywords: [claude-host]
negative-keywords: []
priority: 35
runtime: knowledge
executor: none
permissions: [Read]
risk-level: low
supported-hosts: [claude]
status: stable
owner: self
last-reviewed: 2026-05-08
review-cycle-days: 45
tags: [adapter, host, claude]
aliases: [claude-adapter]
---

# Claude Host Adapter

## Purpose

Capture Claude-specific runtime assumptions, translation rules, and packaging notes without leaking them into public routed skills.

## Host Surface

- treat Claude host behavior as an internal adaptation layer
- keep path, command, and packaging deltas explicit for downstream skills

## Compatibility Rules

- record Claude-specific runtime roots, command surfaces, and packaging expectations
- record any constraints that require portable skills to translate or downgrade behavior on Claude

## Read These References

- `references/host-capabilities.md`
  Read for the Claude host capability map and the stable assumptions the bundle can rely on.
- `references/import-and-translation-rules.md`
  Read for path rewrites, content translations, and host-local import rules.

## Route onward

- pass these host constraints into the router, domain, workflow, tool, or guard that owns the user-facing task
