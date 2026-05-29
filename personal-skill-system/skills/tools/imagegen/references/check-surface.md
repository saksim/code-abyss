# Check Surface

`imagegen` owns planning for raster image generation and editing.

## In Scope

- new generated bitmap assets
- edits to existing raster images
- product mockups, hero images, sprites, concept art, ad images, and UI mockups
- transparent PNG/WebP planning
- prompt shaping and avoid constraints
- deciding whether final output must be copied into the workspace
- warning when host image capabilities are required

## Out Of Scope

- SVG/vector icon edits
- CSS, canvas, or HTML-native illustrations
- matching an existing repository icon system
- calling an image API directly
- storing credentials
- replacing the active host's image tool or pack runtime

## Evidence Emitted

The script emits:

- inferred mode
- use-case classification
- normalized prompt spec
- host capability requirements
- asset persistence policy
- warnings for transparent output, missing edit targets, and unsafe overwrite assumptions

## Handoff

After the plan is emitted:

- use the active host image tool if available
- use a pack/runtime only if the user or host policy allows it
- move any project-bound final asset into the workspace
- update consuming code only after the final file exists
