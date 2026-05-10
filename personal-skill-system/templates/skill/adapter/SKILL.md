---
schema-version: 2
name: adapter-template
template-version: 1
title: Adapter Template
description: Template scaffold for an adapter skill. Replace this with host-specific import notes, compatibility constraints, and capability hints for one runtime environment.
kind: adapter
visibility: internal
user-invocable: false
trigger-mode: [manual]
trigger-keywords: [adapter-template]
negative-keywords: []
priority: 40
runtime: knowledge
executor: none
permissions: [Read]
risk-level: low
supported-hosts: [codex, claude, gemini]
status: draft
owner: self
last-reviewed: 2026-05-08
review-cycle-days: 60
tags: [template, adapter]
aliases: []
---

# Adapter Template

## Purpose

Replace this scaffold with one host-specific adaptation layer.

Own host translation and degradation rules, not ordinary public routing.

## Host Surface

- name the host or runtime this adapter exists for
- state which capability differences matter to downstream skills
- state which governance or filesystem limits materially change how other skills should behave

## Compatibility Rules

- list what this host can do reliably
- list what must be downgraded, rewritten, or avoided
- list which scripted behaviors should fall back to reference-only guidance on this host

## Read These References

- `references/host-capabilities.md`
  Replace with the host capability map, environment assumptions, and affordance limits that other skills need.
- `references/import-and-translation-rules.md`
  Replace with path rewrites, wording changes, or import-time transformation rules required for this host.

## Route onward

- point to the router, domain, workflow, tool, or guard that should consume these host-specific rules
