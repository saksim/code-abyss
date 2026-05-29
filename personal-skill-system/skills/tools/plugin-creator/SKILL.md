---
schema-version: 2
name: plugin-creator
template-version: 1
title: Plugin Creator Tool
description: Create or plan Codex plugin scaffolds with `.codex-plugin/plugin.json`, optional plugin folders, and repo or home marketplace entries. Use when the task is to create a Codex plugin, validate the plugin scaffold shape, or generate `.agents/plugins/marketplace.json` entries; treat this as Codex-specific unless another host explicitly supports the same plugin contract.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [plugin-creator, create plugin, codex plugin, plugin scaffold, plugin.json, marketplace.json, .codex-plugin]
negative-keywords: [browser extension, vscode extension, npm plugin, generic plugin architecture]
priority: 81
runtime: scripted
executor: node
permissions: [Read, Write, Bash]
risk-level: medium
supported-hosts: [codex]
status: experimental
host-smoke-tier: experimental
host-smoke-target-level: declared-and-tested
owner: self
last-reviewed: 2026-05-29
review-cycle-days: 30
tags: [tool, codex, plugin]
aliases: [codex-plugin-creator, plugin-scaffold]
scaffold-origin: tool-template
scaffold-version: 1
---
# Plugin Creator Tool

## Purpose

Create or plan Codex plugin scaffolds while keeping host boundaries explicit.

This tool owns:

- normalized plugin names
- `.codex-plugin/plugin.json` scaffold creation
- optional plugin subdirectories
- optional `.agents/plugins/marketplace.json` entries
- non-destructive dry-run planning

It does not claim Claude or Gemini plugin compatibility.

## Expected Inputs

- `--name <plugin-name>`: required
- `--path <parent-directory>`: optional; defaults to `plugins`
- `--with-skills`, `--with-hooks`, `--with-scripts`, `--with-assets`, `--with-mcp`, `--with-apps`
- `--with-marketplace`: create or update a marketplace entry
- `--marketplace-path <path>`: optional; defaults to `.agents/plugins/marketplace.json`
- `--category <name>`: optional marketplace category, default `Productivity`
- `--force`: allow replacing an existing plugin manifest or marketplace entry
- `--dry-run`: report planned writes without mutating the filesystem
- `--json`: emit JSON only

## Output Contract

The script returns JSON with:

- `tool: "plugin-creator"`
- normalized `plugin`
- `plugin_path`
- `manifest_path`
- `marketplace_path`
- `created`
- `planned`
- `warnings`

## Maintenance Rules

- Always create `.codex-plugin/plugin.json` when not in dry-run mode.
- Do not overwrite an existing plugin unless `--force` is set.
- Keep manifest values as placeholders until a follow-up fills real metadata.
- Marketplace entries must include `policy.installation`, `policy.authentication`, and `category`.
- Omit `policy.products` unless explicitly added by a future extension.

## Read These References

- `references/check-surface.md`
  Read when deciding what plugin structure this tool owns and what it intentionally leaves to Codex host docs.
- `references/usage-examples.md`
  Read for dry-run, scaffold, and marketplace examples.

## Runtime Proof

- `node scripts/run.js --name sample-plugin --dry-run --json` returns a structured plan with `tool=plugin-creator` and no filesystem mutation.
- `node scripts/run.js --name sample-plugin --path <tmp> --with-marketplace --json` creates a plugin manifest and marketplace entry in the selected target tree.

## Host Smoke

The smoke manifest uses dry-run mode so host-smoke can prove the planning contract without writing into user plugin directories.

## Run

```bash
node scripts/run.js --name my-plugin --dry-run --json
node scripts/run.js --name my-plugin --path plugins --with-skills --with-scripts --with-marketplace --json
```
