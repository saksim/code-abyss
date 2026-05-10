# Portability And Governance

## Portability bar

A portable skill bundle should survive copy-paste without hidden dependency on:

- sibling folders outside the bundle
- host-only runtime assumptions
- undocumented generators
- external references required at answer time

## Generated artifact rules

Keep generated artifacts for:

- registry index
- route map
- host capability map
- source-to-target integration records

Generated files should describe the bundle honestly, not a partial subset.

## Single-charter rule

Keep the following surfaces aligned:

- the top-tier standard
- authoring rules
- canonical templates
- governed manage-skill flows
- governed verify-skill-system checks

If these surfaces disagree, future skill growth becomes expensive even if the current bundle still appears to work.

## Pack rules

Use packs to separate:

- baseline reusable core
- project-specific overlays
- private work assets
- unstable experiments

Do not use packs as a substitute for clear routing.

## Governance loop

For every serious iteration:

1. change the structural source
2. update generated metadata
3. validate consistency
4. record the new design assumption

For core skill CRUD, the structural source step should go through `skills/tools/manage-skill/` instead of ad hoc file edits spread across the repo.

If metadata drifts from the real skill set, the bundle becomes untrustworthy.

## Current vs future work

Use different governed paths for different change classes:

- current-skill hardening
  Use evolution, capability, review, route, runtime-proof, and host-smoke flows.
- future-skill admission
  Use opportunity and admission flows before direct creation.
- lifecycle retirement
  Use deprecate, merge, archive, or delete flow so history remains inspectable.
