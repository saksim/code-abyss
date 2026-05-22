# Release Guide
> Audience: first-time maintainers publishing Code Abyss
> Goal: ship from 0 to 1 with a clear public support statement

## Current public support statement

As of 2026-05-22, the install targets validated by tests and live smoke runs are:

- `Claude Code`
- `Codex CLI`
- `Gemini CLI`

`OpenCode` does not have a standalone `--target opencode` yet.
Its current support model is compatibility:

- Claude-compatible path: `CLAUDE.md`, `~/.claude/commands/`, `~/.claude/skills/`
- Codex-compatible path: `AGENTS.md`, `instruction.md`, `~/.agents/skills/`

That means:

1. If the `claude` install path succeeds, you can claim Claude-compatible OpenCode setups are supported.
2. If the `codex` install path succeeds, you can claim Codex / AGENTS-compatible OpenCode setups are supported.
3. If an OpenCode setup reads one of those layouts, or both, it counts as a successful compatible installation.
4. Until code, CLI help, target registry, and smoke coverage add first-class support, do not publish `npx code-abyss --target opencode -y`.

## 1. Pre-release setup

Requirements:

- Node.js `>=18`
- npm
- npm publish access

Install dependencies:

```bash
npm ci
```

## 2. Release gates that must pass

Minimum required gates:

```bash
npm test
npm run verify:skill-system
npm run verify:skills
npm run packs:check
npm run packs:vendor:sync -- --check
```

Recommended package check:

```bash
npm pack --json --cache <temp-cache-dir>
```

Do not publish if any of these fail.

## 3. Version bump

Check [`package.json`](../package.json).

Common command:

```bash
npm version patch
```

Guideline:

- `patch`: fixes, installer hardening, doc corrections
- `minor`: stable capability expansion
- `major`: breaking changes

## 4. Publish to npm

Confirm auth first:

```bash
npm login
npm whoami
```

Then publish:

```bash
npm publish
```

## 5. Post-publish smoke checks

Do not rely only on CI. Re-test from a user angle.

Claude:

```bash
npx code-abyss --target claude -y
npx code-abyss --uninstall claude
```

Codex:

```bash
npx code-abyss --target codex -y
npx code-abyss --uninstall codex
```

Gemini:

```bash
npx code-abyss --target gemini -y
npx code-abyss --uninstall gemini
```

## 6. What to tell OpenCode users

Allowed wording:

- If OpenCode reads Claude-style runtime files, run `npx code-abyss --target claude -y`
- If OpenCode reads Codex / AGENTS-style runtime files, run `npx code-abyss --target codex -y`
- If OpenCode reads both layouts, run both commands

Not allowed wording:

- `npx code-abyss --target opencode -y`

## 7. What to record after publishing

Capture at least:

- published version
- which gates passed
- whether Claude / Codex / Gemini smoke runs were done
- which OpenCode compatibility path you are claiming
