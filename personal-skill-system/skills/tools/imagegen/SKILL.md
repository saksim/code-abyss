---
schema-version: 2
name: imagegen
template-version: 1
title: Image Generation Tool
description: Plan and govern raster image generation or image editing work: prompt shaping, generated bitmap assets, project-bound asset persistence, transparent-background workflows, and host capability checks. Use when the user asks to create or edit raster images, product mockups, hero images, sprites, concept art, or transparent PNG/WebP assets; do not use for SVG/vector/code-native graphics that should be edited directly.
kind: tool
visibility: public
user-invocable: true
trigger-mode: [auto, manual]
trigger-keywords: [imagegen, image generation, image edit, generated image, raster asset, bitmap asset, transparent background, product mockup, hero image, sprite asset]
negative-keywords: [svg icon, vector icon, css illustration, html canvas, repo-native graphic]
priority: 82
runtime: scripted
executor: node
permissions: [Read, Write, Bash]
risk-level: medium
supported-hosts: [codex, claude, gemini]
status: experimental
host-smoke-tier: experimental
host-smoke-target-level: declared-and-tested
owner: self
last-reviewed: 2026-05-29
review-cycle-days: 30
tags: [tool, image, assets]
aliases: [image-generation, raster-assets, bitmap-generator]
scaffold-origin: tool-template
scaffold-version: 1
---
# Image Generation Tool

## Purpose

Plan raster image generation and editing work without pretending every host has the same image runtime.

This tool owns the portable planning surface:

- classify the image task
- shape the prompt
- decide whether the host needs a native image-generation capability
- define how final assets must be persisted into the project
- call out transparent-background and overwrite risks

The script does not call an image API. It emits a machine-readable execution plan that the active host or pack runtime can carry out.

## Expected Inputs

- `--prompt <text>`: required for real use; smoke uses a default prompt
- `--mode generate|edit`: optional; inferred from `--input` when omitted
- `--input <path>`: optional edit target or reference path
- `--asset-type <type>`: optional intended use such as `hero`, `sprite`, `product`, `mockup`
- `--transparent`: request transparent output planning
- `--project-bound`: require final output to live in the current workspace
- `--output <path>`: planned final output path
- `--host <codex|claude|gemini|unknown>`: optional host hint
- `--json`: emit JSON only

## Output Contract

The script returns JSON with:

- `tool: "imagegen"`
- `mode`
- `use_case`
- `execution.requires_host_image_capability`
- `execution.performs_generation: false`
- `asset_policy`
- `prompt_spec`
- `warnings`

## Maintenance Rules

- Keep host-specific image execution out of the portable core until the host can prove it.
- Do not overwrite project assets by default.
- Do not leave project-referenced image assets only in a host temp directory.
- Prefer code-native SVG/CSS/canvas edits when the requested asset is not actually raster.

## Read These References

- `references/check-surface.md`
  Read when deciding whether imagegen should own a request or defer to frontend/vector/code-native work.
- `references/usage-examples.md`
  Read for representative invocations and output interpretation.

## Runtime Proof

- `node scripts/run.js --prompt "ceramic mug hero image" --project-bound --json` returns a structured image-generation plan with `tool=imagegen`.
- `node scripts/run.js --prompt "app icon on transparent background" --transparent --json` marks transparent output as a host-sensitive workflow and does not claim to generate the asset locally.

## Host Smoke

The smoke manifest uses the dry planning path only. It proves the portable planning contract, not live image generation.

## Run

```bash
node scripts/run.js --prompt "ceramic mug hero image" --project-bound --json
node scripts/run.js --prompt "transparent app icon" --transparent --asset-type icon --json
```
