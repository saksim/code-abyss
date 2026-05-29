# gstack Capability Map

gstack is installed as an external pack, not as core Personal Skill System skills. The core skill source remains `personal-skill-system/skills/`; gstack runtime files are governed through `packs/gstack/manifest.json` and `.personal-skill-system/packs.lock.json`.

## Installed Capability Groups

| Capability group | gstack skills | Use when |
| --- | --- | --- |
| Browser control | `browse`, `open-gstack-browser`, `setup-browser-cookies`, `pair-agent` | A task needs real browser navigation, authenticated state, screenshots, form interaction, or visible browser pairing. |
| QA and validation | `qa`, `qa-only`, `benchmark`, `canary`, `health` | A running web app needs runtime testing, visual checks, performance baselines, post-deploy canaries, or a code quality dashboard. |
| Design workflows | `design-review`, `design-shotgun`, `design-html`, `design-consultation` | A UI needs visual QA, alternative mockups, production HTML/CSS generation, or a complete design system pass. |
| Release workflows | `ship`, `land-and-deploy`, `setup-deploy`, `document-release` | A change needs PR shipping, deploy setup, post-merge verification, or release documentation tied to gstack runtime flows. |
| Workspace safety | `careful`, `freeze`, `guard`, `unfreeze`, `checkpoint` | Work needs host-side destructive-command warnings, edit scoping, or resumable checkpoints. |
| Product and DX review | `devex-review`, `office-hours`, `retro`, `learn` | A product, docs, developer experience, team cadence, or accumulated learning surface needs a specialized review flow. |

## Core Versus gstack

| User intent | Prefer core Personal Skill System | Prefer gstack pack |
| --- | --- | --- |
| Code review | `review` for static diff review and findings-first risk ranking | gstack `review` only when the installed pack runtime is explicitly requested |
| Web app QA | `verify-*`, `pre-merge-gate`, or `review` for static checks | `qa` / `qa-only` when a live app must be exercised in a browser |
| UI design | `frontend-design` for portable UX/design guidance | `design-review` or `design-shotgun` when screenshots, visual iteration, or gstack design tooling is needed |
| Release | `ship`, `devops`, and guards for portable release judgement | `land-and-deploy`, `canary`, or `setup-deploy` for gstack-managed deploy verification |
| Safety controls | `host-governance`, `pre-commit-gate`, `pre-merge-gate` for portable policy | `freeze`, `guard`, or `careful` for host-specific workspace controls |

## Install And Validation

The gstack pack is pinned in `packs/gstack/manifest.json` and required for `claude`, `codex`, and `gemini` by the current project lock policy.

Use these checks after changing pack policy or docs:

```bash
npm run packs:check
npm run packs:vendor:sync -- --check
npm test -- test/packs-cli.test.js --runInBand
```

Do not copy gstack skills into `personal-skill-system/skills/` unless a specific sub-capability is admitted as a small portable core skill.
