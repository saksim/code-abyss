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
- `update`: patch frontmatter fields for an existing skill
- `archive`: mark a skill as archived without deleting it
- `delete`: remove a skill directory from the authoritative tree

## Output Contract

Return:

1. the authoritative target path
2. what changed
3. any follow-up verification commands that should be run

## Read These References

- `references/authoritative-skill-rules.md`
  Read before modifying the skill tree so changes stay inside the single source of truth model.
- `references/operation-examples.md`
  Read when you need concrete command examples for create, update, archive, show, and delete.
