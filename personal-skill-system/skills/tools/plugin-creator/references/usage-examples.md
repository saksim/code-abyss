# Usage Examples

## Dry Run

```bash
node scripts/run.js --name "My Plugin" --dry-run --json
```

Interpretation:

- no files are written
- `plugin` shows the normalized folder and manifest name
- `planned` lists all filesystem actions

## Create A Repo Plugin

```bash
node scripts/run.js --name my-plugin --path plugins --with-skills --with-scripts --json
```

Creates:

- `plugins/my-plugin/.codex-plugin/plugin.json`
- `plugins/my-plugin/skills/`
- `plugins/my-plugin/scripts/`

## Create Marketplace Entry

```bash
node scripts/run.js --name my-plugin --with-marketplace --json
```

Creates or updates:

- `.agents/plugins/marketplace.json`

The marketplace entry includes:

- `policy.installation: "AVAILABLE"`
- `policy.authentication: "ON_INSTALL"`
- `category: "Productivity"`

## Smallest Smoke

```bash
node scripts/run.js --name sample-plugin --dry-run --json
```
