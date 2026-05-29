# External Skill Integration

Use this reference when importing, merging, or rejecting an outside SKILL source.

## Default Flow

1. Inventory the incoming skill and its source root.
2. Classify it as `merge-depth`, `admit`, `pack-owned`, `raw-source`, or `reject-core`.
3. Prefer deepening an existing owner before creating a new public route.
4. Run `manage-skill admission-check` before creating any new core skill.
5. Keep heavy runtime systems in packs.
6. Split raw expert material into task-shaped references.
7. Validate route, registry, runtime proof, and host assumptions after mutation.

## Classification Rules

| Class | Use when | Action |
|---|---|---|
| `merge-depth` | A project skill already owns the user intent. | Add or refine references/scripts under the owner skill. |
| `admit` | The capability may be distinct but needs governance. | Run `admission-check`; create only if recommended. |
| `pack-owned` | The capability depends on heavy runtime, daemon, browser, or external command ecosystem. | Keep as pack and improve docs/router guidance. |
| `raw-source` | The source is a large expert overlay, persona, or monolithic guide. | Extract reusable rules into references. |
| `reject-core` | The source duplicates installer/runtime/platform responsibilities or is too generic. | Record the reason; do not create a route. |

## Anti-Patterns

- copying a full external skill folder into core without admission
- creating a public skill for a narrow expert persona
- creating a sibling route because the existing owner is shallow
- importing host-specific behavior while claiming cross-host portability
- counting an index or prompt slogan as expert depth
- hand-editing generated registry files as the source of truth

## System Skill Rules

For Codex/system skills:

- `openai-docs`: admit before creating; official-doc freshness and citation policy must be explicit.
- `imagegen`: admit before creating; host image tooling and asset persistence must be explicit.
- `plugin-creator`: admit before creating; Codex-specific plugin behavior belongs in a Codex adapter or tool.
- `skill-creator`: merge into `skill-evolution` and `manage-skill`; do not duplicate the authoring route.
- `skill-installer`: prefer Code Abyss installer and pack documentation over a duplicate installer skill.

## Pack Rules

Keep gstack and similar heavy runtimes as packs when they own:

- browser control
- screenshots
- visual QA loops
- canary monitoring
- deployment automation
- runtime commands that cannot be represented as portable knowledge

Core skills may point to the pack, but should not duplicate its commands.

## Top-Developer Rules

Treat top-developer overlays as raw source material.

Extract by judgement task:

- architecture constraints and platform tradeoffs -> `architecture`
- option scoring and rollback -> `architecture-decision`
- Python runtime and production heuristics -> `development`
- quality evidence and severity rules -> `review`
- validator and release gates -> `verify-quality`, `pre-merge-gate`

Do not expose raw top-developer skill names as default public routes.

