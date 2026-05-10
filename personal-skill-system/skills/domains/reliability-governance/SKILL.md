---
schema-version: 2
name: reliability-governance
scaffold-origin: domain-template
scaffold-version: 1
title: Reliability Governance Domain
description: Reliability decision making and operating governance: SLOs, error budgets, incident posture, degradation, recovery proof, and availability tradeoffs. Use when the task is about reliability targets, on-call quality, service resilience, incident readiness, or deciding how much availability and correctness cost is justified.
kind: domain
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [reliability, slo, sli, sla, error budget, incident, on-call, availability, resilience, failover, recovery, 可靠性, 可用性, 服务等级目标, 错误预算, 事故响应, 故障恢复, 稳定性治理]
negative-keywords: [visual design, 视觉设计]
priority: 79
runtime: knowledge
executor: none
permissions: [Read]
risk-level: high
supported-hosts: [codex, claude, gemini]
status: stable
owner: self
last-reviewed: 2026-05-09
review-cycle-days: 45
tags: [domain, reliability, governance]
aliases: [reliability, incident-governance, 可靠性治理]
---
# Reliability Governance Domain

## Use This When

- the task is about SLOs, SLIs, availability targets, incident response quality, or recovery expectations
- the hard part is deciding what resilience posture the system actually needs, not only how to build it
- the user asks how to balance reliability, latency, correctness, and operational cost

## Quick Judgement

- reliability without an explicit service promise is theater
- page policy, degradation policy, and recovery proof must agree with the declared SLO
- error budget should control change speed, not sit in a dashboard unread
- recovery is not complete when graphs flatten; it is complete when integrity and user-impact checks pass

## Read These References

- `references/decision-rules.md`
  Read when setting reliability targets, paging posture, degradation ladders, or recovery gates.
- `references/deep-reference-index.md`
  Read when the problem needs deeper guidance on SLO math, incident command, drills, failover, or AI/service reliability.
- `references/boundaries-and-escalations.md`
  Read when deciding whether the task belongs here or should hand off to architecture, devops, infrastructure, security, or investigate.

## Route onward

- architecture shape or irreversible topology choice -> `architecture`
- release gates, observability wiring, or runbook operations -> `devops`
- cluster, failover, or DR topology execution -> `infrastructure`
- exploit or trust-boundary incident -> `security`
- active production issue root cause analysis -> `investigate`
