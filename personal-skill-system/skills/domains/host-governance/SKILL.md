---
schema-version: 2
name: host-governance
scaffold-origin: domain-template
scaffold-version: 1
title: Host Governance Domain
description: Host execution governance for sandbox boundaries, filesystem writeability, tool/runtime limits, degraded-mode policy, and portability decisions across agents. Use when the hard part is what the current host is allowed or able to do, how to react when it cannot, or how to keep the skill bundle reliable across different hosts.
kind: domain
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [host governance, sandbox, filesystem permission, writeability, execution limit, host capability, degraded mode, portability boundary, codex host, claude host, gemini host, 宿主治理, 沙箱, 写权限, 文件系统权限, 宿主能力, 降级策略, 可移植边界]
negative-keywords: [visual design, ordinary feature, 视觉设计, 普通功能开发]
priority: 78
runtime: knowledge
executor: none
permissions: [Read]
risk-level: high
supported-hosts: [codex, claude, gemini]
status: stable
owner: self
last-reviewed: 2026-05-10
review-cycle-days: 45
tags: [domain, host, governance, portability]
aliases: [host-policy, sandbox-governance, 宿主治理]
---

# Host Governance Domain

## Use This When

- the task is blocked or shaped by sandbox policy, filesystem permissions, shell limits, or host-specific tool access
- the hard part is deciding whether to fail, degrade, virtualize, defer, or reroute because the current host cannot do something safely
- the user asks how to keep the same skill bundle honest across Codex, Claude, Gemini, or other constrained environments

## Quick Judgement

- host limits are product reality, not incidental annoyance
- declare capability boundaries before promising execution paths that the host cannot actually satisfy
- degrade only when the degraded output is still honest and operationally useful
- if a host constraint will recur, model it as governance state instead of repeating ad-hoc warnings

## Read These References

- `references/decision-rules.md`
  Read when deciding fail-vs-degrade-vs-reroute policy for sandbox, permission, or capability constraints.
- `references/deep-reference-index.md`
  Read when the problem spans host adapters, generated governance artifacts, runtime proof, portability, or cross-host bundle strategy.
- `references/boundaries-and-escalations.md`
  Read when deciding whether the current issue belongs here or should hand off to adapters, manage-skill, verify-skill-system, architecture, or devops.

## Route onward

- host-specific translation rules or per-host assumptions -> `codex-host`, `claude-host`, or `gemini-host`
- authoritative skill CRUD or generated governance mutation -> `manage-skill`
- bundle audit or governance drift detection -> `verify-skill-system`
- platform-wide runtime topology or irreversible system design choice -> `architecture`
- CI, deploy, or operator workflow implementation -> `devops`
