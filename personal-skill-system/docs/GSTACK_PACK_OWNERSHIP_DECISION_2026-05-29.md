# gstack Pack Ownership Decision (2026-05-29)

Scope: gstack-related skills currently available from `.agents/skills/gstack` and the project pack manifest at `packs/gstack/manifest.json`.

## Verdict

gstack remains pack-owned. Do not copy gstack skills into `personal-skill-system/skills/` as core skills.

The project should integrate gstack by:

- keeping `packs/gstack/manifest.json` as the installation and lifecycle contract
- using `.code-abyss/packs.lock.json` to decide whether gstack is required for each host
- documenting the user-visible capability map
- adding router guidance for core-vs-pack selection
- absorbing only small, reusable judgement rules into existing core references

## Current Evidence

| Surface | Current state |
|---|---|
| Pack manifest | `packs/gstack/manifest.json` exists and pins upstream gstack. |
| Lock policy | `.code-abyss/packs.lock.json` requires gstack for `claude`, `codex`, and `gemini`. |
| Host install model | Manifest includes host-specific runtime dirs, files, rewrites, and uninstall rules. |
| Runtime nature | Browser QA, design review, benchmark, canary, and deployment workflows depend on external runtime behavior. |

## Pack-Owned Skills

| gstack skill | Core relation | Decision |
|---|---|---|
| `browse`, `open-gstack-browser`, `setup-browser-cookies` | Browser interaction and authenticated QA runtime. | Keep pack-owned. |
| `qa`, `qa-only`, `benchmark`, `canary` | Runtime validation and live app dogfooding. | Keep pack-owned; document when to invoke. |
| `design-review`, `design-shotgun`, `design-html`, `design-consultation` | Visual design workflows. | Keep pack-owned; absorb only design QA heuristics into `frontend-design` if needed. |
| `review`, `ship`, `land-and-deploy`, `document-release` | Overlaps project workflows. | Keep pack-owned for external runtime; core `review` and `ship` remain default route owners. |
| `careful`, `freeze`, `guard`, `unfreeze`, `checkpoint` | Host safety and workspace control. | Keep pack-owned; core `host-governance` and guards own portable policy. |
| `health`, `devex-review`, `retro`, `learn`, `office-hours` | Specialized analysis workflows. | Keep pack-owned unless repeated usage proves a distinct portable core route. |

## Router Policy

Use core skills when the request is about portable reasoning, code review, implementation, release readiness, architecture, or skill-system governance.

Use gstack pack skills when the request requires:

- controlling a browser
- taking screenshots
- checking responsive layout in a live page
- running visual QA loops
- monitoring a deployment/canary
- interacting with gstack-specific runtime commands

If both are plausible:

1. Start with the core route for reasoning and risk framing.
2. Chain to gstack only when runtime evidence is needed.
3. Do not create a duplicate core skill for the same gstack command.

## Validation

Run:

```bash
npm run packs:check
npm run packs:vendor:sync -- --check
npm test -- test/packs-cli.test.js --runInBand
```

For release-level proof, also run:

```bash
npm run verify:tarball-smoke
```

## Follow-Up

- Add a compact gstack capability map to user-facing docs.
- Add router reference guidance so `sage` can distinguish core `review` from gstack runtime review/QA.
- Keep upstream pin and vendor status visible before release.

