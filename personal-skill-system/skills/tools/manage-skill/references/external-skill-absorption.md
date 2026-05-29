# External Skill Absorption

Use this reference when a request asks to import, strengthen, or mirror skills from another runtime.

## Default Flow

1. Classify the source as core-depth, new boundary, pack runtime, host adapter, raw expert source, or reject.
2. Run `admission-check` before creating a new public skill.
3. Prefer deepening the existing route when one current skill already owns the user intent.
4. Keep heavy runtime ecosystems as packs unless a small deterministic subset is rewritten as a local tool.
5. Record the decision in the governed ledger or decision doc before mutating route or registry files.
6. Add route evidence, runtime proof, host metadata, and validation before promotion.

## Placement Rules

| Source shape | Preferred placement |
| --- | --- |
| Durable judgement or domain knowledge | Existing `domains/` owner, or admitted new domain |
| Repeatable task flow | Existing `workflows/` owner, or admitted new workflow |
| Deterministic scriptable behavior | `tools/` with runtime proof and smoke manifest |
| Host-specific behavior | `adapters/` or explicit `supported-hosts` boundary |
| Browser, QA, daemon, or third-party command runtime | `packs/` and user docs |
| Large persona or expert prompt corpus | Expert-source family and task-shaped references |

## Merge Instead Of Create

Merge into the existing owner when:

- the external skill mainly adds examples, heuristics, or checklists
- the current route already wins representative prompts
- creating a sibling would split one user intent across multiple names
- the capability cannot be validated as an independent route

For these cases, add a focused reference under the owning skill and keep the public route unchanged.

## Create Only After Admission

Create a new skill only when:

- `admission-check` returns `create-new-skill`
- the boundary is distinct from current routes
- trigger keywords and negative keywords can be made concrete
- the skill can earn at least one non-placeholder route fixture
- scripted behavior has runtime proof and test evidence

Do not promote an admitted skill to `stable` in the same pass that creates it unless the top-tier assessment is clear.

## Pack-Owned Sources

When the incoming skill depends on a browser daemon, GUI control, external CLI, network service, or vendored upstream runtime, keep it pack-owned first.

Document:

- pack manifest and lock policy
- installed capability names
- when to use the pack instead of core skills
- validation commands such as `npm run packs:check`

Core skills may absorb portable judgement rules from the pack, but not the runtime implementation.
