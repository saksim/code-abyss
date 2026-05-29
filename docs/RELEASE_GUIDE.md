# Release Guide
> Audience: first-time maintainers publishing Personal Skill System
> Goal: ship from 0 to 1 with a clear public support statement

## Ship decision

Ship only when the release gates are green and the tarball smoke proves all first-class host install paths:

- Claude install and uninstall pass from the packaged tarball.
- Codex install and uninstall pass from the packaged tarball.
- Gemini install and uninstall pass from the packaged tarball.
- `verify:skill-system` exits non-zero on real error states and exits zero only when the governed skill system is green.
- Any remaining failure is explicitly classified as host/tooling noise and does not affect installed product behavior.

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
4. Until code, CLI help, target registry, and smoke coverage add first-class support, do not publish `npx personal-skill-system --target opencode -y`.

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
npm run verify:tarball-smoke
```

Optional package inspection:

```bash
npm pack --json --cache <temp-cache-dir>
```

`verify:tarball-smoke` first packs a fresh tarball into a system temp staging directory and then smokes that exact tarball. It is the preferred pre-publish package proof.

If your tarball was written somewhere else, pass it explicitly:

```bash
npm run verify:tarball-smoke -- --tgz <path-to/personal-skill-system-x.y.z.tgz>
```

Do not publish if any required gate fails.

## 3. Clean local-only artifacts

Before publishing, remove local probe output that is not part of the package:

```bash
Get-ChildItem -LiteralPath . -Filter 'personal-skill-system-*.tgz' | Remove-Item -Force
Remove-Item -LiteralPath tmp-release-smoke,tmp-npm-cache-release-smoke,tmp-release-smoke-inline-probe,tmp-npm-cache-inline-probe,tmp-delete-probe -Recurse -Force -ErrorAction SilentlyContinue
```

Keep these files. They are release infrastructure, not temporary artifacts:

- `bin/release-smoke.js`
- `bin/pack-release-tarball.js`
- `test/release-smoke.test.js`
- fresh host-smoke runtime evidence under `personal-skill-system/benchmark/host-smoke/runtime-runs/`

## 4. Version bump

Check [`package.json`](../package.json).

Common command:

```bash
npm version patch
```

Guideline:

- `patch`: fixes, installer hardening, doc corrections
- `minor`: stable capability expansion
- `major`: breaking changes

## 5. Publish to npm

Confirm auth first:

```bash
npm login
npm whoami
```

Then publish:

```bash
npm publish
```

## 6. Post-publish smoke checks

Do not rely only on CI. Re-test from a user angle after npm publishes the package.

Claude:

```bash
npx personal-skill-system --target claude -y
npx personal-skill-system --uninstall claude
```

Codex:

```bash
npx personal-skill-system --target codex -y
npx personal-skill-system --uninstall codex
```

Gemini:

```bash
npx personal-skill-system --target gemini -y
npx personal-skill-system --uninstall gemini
```

## 7. User-facing install instructions

Public install commands:

```bash
npx personal-skill-system --target claude -y
npx personal-skill-system --target codex -y
npx personal-skill-system --target gemini -y
```

Interactive install:

```bash
npx personal-skill-system
```

List available presets:

```bash
npx personal-skill-system --list-styles
npx personal-skill-system --list-personas
```

Uninstall:

```bash
npx personal-skill-system --uninstall claude
npx personal-skill-system --uninstall codex
npx personal-skill-system --uninstall gemini
```

## 8. User-facing use instructions

After install, users keep using their normal host CLI:

- Claude Code reads `~/.claude/CLAUDE.md`, `~/.claude/commands/`, and `~/.claude/skills/`.
- Codex CLI reads `~/.codex/AGENTS.md`, `~/.codex/instruction.md`, `~/.codex/config.toml`, and shared skills under `~/.agents/`.
- Gemini CLI reads `~/.gemini/GEMINI.md`, `~/.gemini/commands/*.toml`, and `~/.gemini/skills/`.

Useful reconfigure example:

```bash
npx personal-skill-system --target codex --style scholar-classic --persona scholar -y
```

## 9. What this release gives users

Capabilities gained:

- Repeatable multi-host install for Claude, Codex, and Gemini.
- Governed personal skill system with registry, route, runtime-proof, host-smoke, and pack metadata.
- Manifest-backed uninstall that removes generated files without treating user-owned files as disposable.
- Tarball-level release proof shared by local maintainers and CI.
- Optional pack support for runtime extensions without changing the authoritative skill source tree.

Boundaries gained:

- First-class support is limited to `claude`, `codex`, and `gemini`.
- OpenCode is compatibility-only through Claude-style or Codex-style runtime files.
- API credentials remain the user's responsibility.
- Optional degraded pack fetches can be non-fatal when the core runtime install succeeds.
- The source of truth is `personal-skill-system/skills/`; root `skills/` must stay retired.

Different improvement:

- This is no longer a prompt archive. It is a governed installable runtime with release gates, uninstall symmetry, host-specific files, and freshness-checked runtime evidence.

## 10. What to tell OpenCode users

Allowed wording:

- If OpenCode reads Claude-style runtime files, run `npx personal-skill-system --target claude -y`
- If OpenCode reads Codex / AGENTS-style runtime files, run `npx personal-skill-system --target codex -y`
- If OpenCode reads both layouts, run both commands

Not allowed wording:

- `npx personal-skill-system --target opencode -y`

## 11. What to record after publishing

Capture at least:

- published version
- which gates passed
- whether Claude / Codex / Gemini smoke runs were done
- which OpenCode compatibility path you are claiming
