# Code Abyss

Code Abyss is an installer and runtime bundle for `Claude Code`, `Codex CLI`, and `Gemini CLI`.
It gives those CLIs a consistent setup for persona, output style, skills, and optional packs, with a tested installation path instead of a loose pile of prompt files.

## What you get

- One installer for multiple AI CLI hosts
- Switchable personas and output styles
- A governed skill source tree under `personal-skill-system/skills/`
- Install / uninstall flows with smoke coverage
- Pack support for optional runtime extensions

## Current release status

The package is release-ready when these gates pass:

```bash
npm test
npm run verify:skill-system
npm run verify:skills
npm run packs:check
npm run packs:vendor:sync -- --check
npm run verify:tarball-smoke
```

`verify:tarball-smoke` is the publish-level install proof. It packs a fresh npm tarball in a temporary staging directory, installs it into isolated Claude / Codex / Gemini homes, then uninstalls it and checks cleanup.

## Quick start

Discover the install surface first:

```bash
npx code-abyss --list-styles
npx code-abyss --list-personas
npx code-abyss --list-skills
npx code-abyss --explain-skill review
```

Interactive install:

```bash
npx code-abyss
```

Direct install:

```bash
npx code-abyss --target claude -y
npx code-abyss --target codex -y
npx code-abyss --target gemini -y
```

Pick a style and persona:

```bash
npx code-abyss --target claude --style abyss-cultivator --persona abyss -y
npx code-abyss --target codex --style scholar-classic --persona scholar -y
npx code-abyss --target gemini --style iron-dad-warm --persona iron-dad -y
```

Uninstall:

```bash
npx code-abyss --uninstall claude
npx code-abyss --uninstall codex
npx code-abyss --uninstall gemini
```

## How users should use it

After installation, keep using your normal AI CLI. Code Abyss changes the host runtime files that those CLIs already read.

| Host | Start using it from |
| --- | --- |
| Claude Code | Launch Claude Code normally; generated slash commands and skills are under `~/.claude/` |
| Codex CLI | Launch Codex normally; instructions are in `~/.codex/instruction.md` and shared skills are under `~/.agents/` |
| Gemini CLI | Launch Gemini normally; generated TOML commands and skills are under `~/.gemini/` |

Each install now writes `HOW_TO_USE_SKILLS.md` into the host runtime root so users have a first-run guide next to the installed files.

The practical rule is:

1. pick one primary skill
2. state the goal
3. state the constraints
4. state the deliverable
5. include an exact validation command

Examples:

```text
Use development for this task.
Goal: add rate limiting to the login endpoint
Context: src/auth/
Constraints: minimal change; keep current API shape
Deliverable: code + tests
Validation: npm test -- auth
```

```text
Use bugfix for this task.
Issue: payment callback signature verification regressed
Expected: valid callbacks pass and invalid ones fail
Constraints: root cause first; minimal patch
Deliverable: fix + regression test
Validation: pytest tests/payments/test_callback.py
```

```text
Use review for this change.
Scope: current PR
Requirements: findings first; order by severity
Output: concrete risks with file paths
Validation: name missing tests or checks
```

Common maintenance commands:

```bash
npx code-abyss --list-styles
npx code-abyss --list-personas
npx code-abyss --list-skills
npx code-abyss --explain-skill development
npx code-abyss --target codex --style scholar-classic --persona scholar -y
npx code-abyss --uninstall codex
```

## What skills can do

The skill system is easier to explain if you group it into four layers:

- `domain` skills: the main expertise entry points, such as `development`, `architecture`, `security`, `frontend-design`
- `workflow` skills: how to run the task, such as `bugfix`, `investigate`, `review`, `ship`
- `tool` skills: deterministic checks, such as `verify-change`, `verify-quality`, `verify-security`
- `guard` skills: release gates, such as `pre-commit-gate`, `pre-merge-gate`

In practice, most users only need to remember a small starter set:

- `development`: implement or refactor code
- `bugfix`: repair a known bug with a minimal patch
- `investigate`: find root cause before editing
- `review`: review a change with findings first
- `architecture`: make API, boundary, queue, cache, or migration decisions
- `verify-change`: inspect the current diff for risk and doc drift
- `verify-quality`: run a deterministic code quality pass
- `verify-security`: run a deterministic security pass

## Installed vs not installed

| User task | Without Code Abyss | With Code Abyss |
| --- | --- | --- |
| Ask the model to implement a feature | You describe the task ad hoc and hope the host prompt stack is good enough | You can explicitly route to `development` and use one stable prompt shape |
| Ask for a bug fix | There is no shared “fix with root cause first” workflow surface | You can explicitly route to `bugfix` |
| Ask for a review | Review style depends on whatever the current host prompt happens to say | You can explicitly route to `review` and get a findings-first workflow |
| Run a deterministic check | Usually manual; no shared built-in verification verbs | You can call `verify-change`, `verify-quality`, `verify-security` |
| Explain the setup to another user | Mostly tribal knowledge and copied prompts | Users get `HOW_TO_USE_SKILLS.md`, `--list-skills`, and `--explain-skill <name>` |
| Install across multiple hosts | Separate manual setup per host | One installer writes host-native runtime files for Claude, Codex, and Gemini |
| Remove the setup safely | Manual cleanup risks deleting the wrong files | Install and uninstall are manifest-backed |

Operationally, Code Abyss also gives you:

- one repeatable installer instead of host-by-host prompt copying
- a generated first-run guide in the runtime root
- a stable skill naming surface across Claude, Codex, and Gemini
- authoritative registry, route, runtime-proof, host-smoke, and pack governance metadata
- optional packs without changing the core skill source tree

## Boundaries

- First-class install targets are `claude`, `codex`, and `gemini`.
- OpenCode is compatibility-only today. Use the Claude path if OpenCode reads Claude-style files, or the Codex path if it reads AGENTS-style files.
- The root `skills/` mirror is retired. The source of truth is `personal-skill-system/skills/`.
- The installer does not guarantee API authentication. Users still need their host CLI login, environment key, or provider configuration.
- Best-effort optional pack failures do not make the core install fail unless the core runtime files cannot be installed.

## Which target should I use?

| If you use | Install command |
| --- | --- |
| Claude Code | `npx code-abyss --target claude -y` |
| Codex CLI | `npx code-abyss --target codex -y` |
| Gemini CLI | `npx code-abyss --target gemini -y` |

## OpenCode compatibility

OpenCode does not have a standalone `--target opencode` yet.

- If your OpenCode setup reads `CLAUDE.md`, `~/.claude/commands/`, or `~/.claude/skills/`, run:

```bash
npx code-abyss --target claude -y
```

- If your OpenCode setup reads `AGENTS.md`, `instruction.md`, or `~/.agents/skills/`, run:

```bash
npx code-abyss --target codex -y
```

- If your OpenCode setup consumes both layouts, run both commands. In the current release policy, all three cases count as a successful OpenCode-compatible installation.

## How do I know installation worked?

| Target | Main files written | What success looks like |
| --- | --- | --- |
| Claude | `~/.claude/CLAUDE.md`, `commands/`, `skills/`, `settings.json` | Claude sees `CLAUDE.md`, slash commands exist, skills runtime is present |
| Codex | `~/.codex/config.toml`, `instruction.md`, `AGENTS.md`, `~/.agents/skills/` | Codex keeps `instruction.md` and `AGENTS.md`, shared skills runtime exists under `.agents` |
| Gemini | `~/.gemini/GEMINI.md`, `commands/*.toml`, `skills/`, `settings.json` | Gemini sees `GEMINI.md`, command TOML files exist, skills runtime is present |

## Project layout

| Layer | Path | Purpose |
| --- | --- | --- |
| Persona | `config/personas/` | Long-lived role and tone presets |
| Output Style | `output-styles/` | Response style registry |
| Skills Source | `personal-skill-system/skills/` | Authoritative skill source tree |
| Installer / Runtime | `bin/` | Install, uninstall, command generation, pack sync |
| Packs | `packs/` and `.code-abyss/packs.lock.json` | Optional runtime extensions and lock policy |

If you are maintaining the repo, start with [docs/ONBOARDING.md](docs/ONBOARDING.md) and [DESIGN.md](DESIGN.md).

## Developer quick checks

```bash
npm ci
npm test
npm run verify:skill-system
npm run verify:skills
npm run packs:check
npm run verify:tarball-smoke
```

Useful local commands:

```bash
node bin/install.js --help
node bin/install.js --list-styles
node bin/install.js --list-personas
node bin/install.js --list-skills
node bin/install.js --explain-skill review
npm run verify:tarball-smoke
npm run verify:tarball-smoke -- --tgz ./code-abyss-2.1.2.tgz
node bin/release-smoke.js --pack
npm run packs:diff
npm run packs:report -- summary
npm run packs:bootstrap -- --apply-docs
```

## Docs map

| Doc | Use it for |
| --- | --- |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | First-time maintainer onboarding |
| [DESIGN.md](DESIGN.md) | Architecture and runtime model |
| [docs/PACK_SYSTEM.md](docs/PACK_SYSTEM.md) | Pack lock, vendor, and bootstrap behavior |
| [docs/SKILL_AUTHORING.md](docs/SKILL_AUTHORING.md) | Skill authoring and governance |
| [docs/RELEASE_GUIDE.md](docs/RELEASE_GUIDE.md) | npm release flow and public support wording |

## Important notes

- The authoritative skill source is `personal-skill-system/skills/**/SKILL.md`.
- Root `skills/` is retired and should not be restored as a source of truth.
- If docs and runtime behavior conflict, trust code and tests first, then fix the docs.
