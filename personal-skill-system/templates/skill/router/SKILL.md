---
schema-version: 2
name: router-template
template-version: 1
title: Router Template
description: Template scaffold for a router skill. Replace this with a routing-specific description that says what the router dispatches and when it should lead.
kind: router
visibility: public
user-invocable: false
trigger-mode: [auto]
trigger-keywords: [router-signal, router-trigger]
negative-keywords: []
priority: 100
runtime: knowledge
executor: none
permissions: [Read]
risk-level: low
supported-hosts: [codex, claude, gemini]
status: draft
owner: self
last-reviewed: 2026-04-17
review-cycle-days: 90
tags: [template, router]
aliases: []
---

# Router Template

## Purpose

Replace this scaffold with the dispatch policy for a surface that should decide first.

Own dispatch, not downstream execution detail.

## Routing Order

- list the precedence order
- note any explicit-invocation overrides
- state when the router should deepen an existing surface instead of sending maintainers toward a new sibling skill

## Conflict Policy

- explain how adjacent routes compete
- explain when clarification is required
- explain when one short question is better than forcing a weak route

## Read These References

- `references/routing-policy.md`
  Replace with the route-order rules, add-vs-deepen heuristics, and scoring logic that should stay stable.
- `references/conflict-playbook.md`
  Replace with concrete conflict cases, fallback rules, and escalation notes.

## Fallback Behavior

- state the single-question fallback shape
- state any safe default route when confidence is low
- state what should happen when no current route is strong enough and future-skill opportunity intake is the honest next step
