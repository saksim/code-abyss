# Usage Examples

## Project Hero Image

```bash
node scripts/run.js --prompt "minimal ceramic coffee mug hero image" --asset-type hero --project-bound --json
```

Interpretation:

- `project_bound=true` means the final selected asset must be saved inside the workspace.
- `performs_generation=false` means a host image tool still has to produce the bitmap.

## Transparent Asset

```bash
node scripts/run.js --prompt "small app mascot on transparent background" --asset-type icon --transparent --json
```

Interpretation:

- transparent output is marked host-sensitive
- the plan should preserve either native alpha output or a validated background-removal workflow
- do not claim a transparent asset exists until the file has an alpha channel

## Edit Existing Image

```bash
node scripts/run.js --mode edit --input assets/banner.png --prompt "remove the text and keep the background" --json
```

Interpretation:

- if the input is missing, the output includes a warning
- the host must load the image into its image-editing context before editing

## Smallest Smoke

```bash
node scripts/run.js --prompt "ceramic mug hero image" --project-bound --json
```
