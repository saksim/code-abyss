# Check Surface

`plugin-creator` owns Codex plugin scaffold creation and planning.

## In Scope

- normalize plugin folder names
- create `.codex-plugin/plugin.json`
- create optional `skills`, `hooks`, `scripts`, `assets`, `.mcp.json`, and `.app.json` placeholders
- create or update `.agents/plugins/marketplace.json`
- emit a dry-run plan before filesystem mutation

## Out Of Scope

- publishing plugins
- validating all future Codex plugin schema fields
- creating browser, VS Code, npm, or generic plugin systems
- claiming compatibility with Claude or Gemini plugin mechanisms
- implementing plugin runtime behavior

## Evidence Emitted

The script emits:

- normalized plugin name
- target paths
- files and directories created or planned
- marketplace entry status
- warnings for existing paths and host-specific assumptions

## Safety Rules

- default to non-overwrite behavior
- use `--force` only for intentional replacement
- keep generated manifest values as placeholders
- keep marketplace paths relative and predictable
