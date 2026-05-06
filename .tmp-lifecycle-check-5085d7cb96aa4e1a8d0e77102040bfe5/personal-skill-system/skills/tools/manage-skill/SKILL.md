---
schema-version: 2
name: manage-skill
title: Manage Skill Tool
description: Create, inspect, update, archive, or delete core skills inside personal-skill-system/skills. Use when maintaining the authoritative skill source rather than editing scattered files by hand.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [manual]
trigger-keywords: [manage-skill, skill crud, create skill, update skill, archive skill, delete skill, 维护技能, 创建技能, 更新技能, 删除技能, 归档技能]
negative-keywords: [ordinary feature, single bug, 普通功能开发, 单点缺陷]
priority: 92
runtime: scripted
executor: node
permissions: [Read, Write, Bash]
risk-level: medium
supported-hosts: [codex, claude, gemini]
status: stable
host-smoke-tier: critical
host-smoke-target-level: host-smoked
host-smoke-freshness-days: 7
owner: self
last-reviewed: 2026-05-05
review-cycle-days: 30
tags: [tool, skills, governance]
aliases: [skill-admin, skill-crud, 技能管理]
---

# Manage Skill Tool

## Purpose

Operate on the authoritative skill tree under `personal-skill-system/skills/` only.

## Commands

- `create`: scaffold a new skill from the canonical template
- `show`: inspect resolved paths and metadata for an existing skill
- `update`: patch non-lifecycle frontmatter fields for an existing skill
- `set-status`: move a skill between `draft`, `experimental`, `stable`, `deprecated`, and `archived` while keeping generated governance surfaces synchronized
- `archive`: mark a skill as archived without deleting it
- `delete`: remove a skill directory from the authoritative tree, preferably after archive
- `sync-runtime-proof`: align runtime-proof registry entries with current scripted skill metadata and Runtime Proof bullets
  and suggest or auto-fill evidence tests from the Jest runtime corpus when explicit evidence is missing;
  when `scripts/smoke.json` exists on a stable scripted skill, the host-smoke contract is also synchronized
- `run-host-smoke`: execute registry-backed host-smoke commands for one or all scripted skills and append evidence artifacts under `benchmark/host-smoke/runtime-runs/`
  while refreshing the bundle-wide host-smoke scorecard under `benchmark/host-smoke/scorecard.generated.json`

## Output Contract

Return:

1. the authoritative target path
2. what changed
3. any follow-up verification commands that should be run

## Runtime Proof

- `create` updates the authoritative skill tree and generated metadata together instead of leaving registry or route drift behind
- `set-status` updates lifecycle metadata through a governed path instead of allowing raw `status=` edits that can strand runtime-proof, ratings, or readiness artifacts
- `archive` and `delete` remove active-route surfaces for the target skill, including route fixtures and ratings summary membership
- `sync-runtime-proof` can rebuild or update runtime-proof entries from authoritative skill metadata instead of requiring hand-edited registry drift repair and can suggest or auto-apply matching evidence tests for scripted skills based on existing Jest coverage
- `sync-runtime-proof` also lifts skill-local `scripts/smoke.json` manifests into registry-backed host-smoke metadata so future host runners consume one consistent contract
- `run-host-smoke` executes the declared host-smoke contract and records append-only pass/fail evidence so `host-smoked` can be proven from artifacts instead of trust
- host-smoke contract and evidence changes also refresh a bundle-wide scorecard so system-level freshness and governance drift stay inspectable

## Read These References

- `references/authoritative-skill-rules.md`
  Read before modifying the skill tree so changes stay inside the single source of truth model.
- `references/operation-examples.md`
  Read when you need concrete command examples for create, update, archive, show, and delete.
