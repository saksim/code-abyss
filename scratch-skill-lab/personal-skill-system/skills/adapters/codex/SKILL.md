---
schema-version: 2
name: codex-host
title: Codex Host Adapter
description: Internal adapter surface for Codex-specific runtime assumptions, import notes, and capability hints. Use when maintaining how the portable skill bundle should be translated or constrained on Codex hosts.
kind: adapter
visibility: internal
user-invocable: false
trigger-mode: [manual]
trigger-keywords: [codex-host]
negative-keywords: []
priority: 35
runtime: knowledge
executor: none
permissions: [Read]
risk-level: low
supported-hosts: [codex]
status: stable
owner: self
last-reviewed: 2026-05-08
review-cycle-days: 45
tags: [adapter, host, codex]
aliases: [codex-adapter]
---

# Codex Host Adapter

## Purpose

Capture Codex-specific runtime assumptions, translation rules, and packaging notes without leaking them into public routed skills.

## Host Surface

- treat Codex host behavior as an internal adaptation layer
- keep path, command, and packaging deltas explicit for downstream skills

## Compatibility Rules

- record Codex-specific runtime roots, command surfaces, and packaging expectations
- record any constraints that require portable skills to translate or downgrade behavior on Codex

## Read These References

- `references/host-capabilities.md`
  Read for the Codex host capability map and the stable assumptions the bundle can rely on.
- `references/import-and-translation-rules.md`
  Read for path rewrites, content translations, and host-local import rules.

## Route onward

- pass these host constraints into the router, domain, workflow, tool, or guard that owns the user-facing task
