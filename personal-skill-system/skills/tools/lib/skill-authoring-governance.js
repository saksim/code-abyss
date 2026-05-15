'use strict';

const fs = require('fs');
const {
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  getSkillKindDefinition,
  SKILL_KIND_ORDER
} = require('./skill-kind-governance');
const {
  REQUIRED_FRONTMATTER_KEYS,
  SKILL_VISIBILITY_ORDER,
  SKILL_TRIGGER_MODE_ORDER,
  SKILL_RUNTIME_ORDER,
  SKILL_EXECUTOR_ORDER,
  SKILL_RISK_LEVEL_ORDER,
  SKILL_SUPPORTED_HOSTS_ORDER
} = require('./skill-frontmatter-governance');
const {
  SKILL_STATUS_ORDER,
  ALL_SKILL_STATUSES,
  WRITABLE_SKILL_STATUSES,
  LIVE_SKILL_STATUSES,
  REVIEW_GOVERNED_SKILL_STATUSES,
  RUNTIME_PROOF_GOVERNED_SKILL_STATUSES,
  RUNTIME_PROOF_LEVEL_ORDER,
  getSkillLevelBucketForStatus,
  getDefaultRuntimeProofLevelForStatus
} = require('./skill-lifecycle-governance');
const {
  FUTURE_SKILL_KINDS,
  FUTURE_SKILL_PRIORITY_ORDER,
  FUTURE_SKILL_HORIZON_ORDER,
  OPPORTUNITY_STATUS_ORDER,
  ADMISSION_DECISION_ACTIONS,
  ADMISSION_STATUS_ORDER,
  PENDING_SCAFFOLD_STATUS_ORDER,
  isActiveOpportunityStatus,
  isActiveAdmissionStatus,
  isTerminalAdmissionStatus,
  isBlockingAdmissionStatus,
  getDefaultAdmissionStatusForDecision,
  getDefaultOpportunityStatusForDecision,
  isActivePendingScaffoldStatus
} = require('./skill-future-governance');
const {
  HOST_SMOKE_POLICY_TIERS,
  HOST_SMOKE_TARGET_LEVELS,
  HOST_SMOKE_RESULT_STATUSES,
  HOST_SMOKE_COMMAND_CWD_MODES,
  HOST_SMOKE_FRESHNESS_UNITS,
  HOST_SMOKE_INVALIDATION_REASONS,
  getHostWriteabilitySeverity
} = require('./skill-host-governance');
const {
  READINESS_SCHEMA_ORDER
} = require('./skill-readiness-schema-governance');
const {
  MIN_RUNTIME_PROOF_CONTRACTS,
  RUNTIME_PROOF_EVIDENCE_SOURCE_ORDER,
  needsEvidenceTestsForRuntimeProofLevel
} = require('./skill-runtime-proof-governance');
const {
  DEFAULT_SKILL_OWNER,
  listReviewMetadataPolicies
} = require('./skill-review-governance');
const {
  getGovernanceArtifactPath,
  listGovernanceArtifacts
} = require('./skill-generated-artifact-governance');
const {
  listDerivedGovernanceRefreshSteps
} = require('./skill-system-derived-governance-contract');
const {
  rel
} = require('./skill-system-common');

const AUTHORING_GOVERNANCE_REFERENCE_ARTIFACT_ID = 'authoring-governance-reference';

function getAuthoringGovernanceReferencePath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, AUTHORING_GOVERNANCE_REFERENCE_ARTIFACT_ID);
}

function asCode(value) {
  return `\`${String(value || '').trim()}\``;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function buildMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map((row) => `| ${row.join(' | ')} |`);
  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

function buildKindRows() {
  return SKILL_KIND_ORDER.map((kind) => {
    const definition = getSkillKindDefinition(kind);
    return [
      asCode(kind),
      asCode(`${definition.layer}/`),
      yesNo(definition.participatesInActiveRouteSurface),
      yesNo(definition.supportsGovernedRouteArtifacts),
      yesNo(definition.createPlaceholderRoute),
      yesNo(definition.capabilityModuleScaffold),
      yesNo(definition.trackScaffoldLineage),
      String(definition.minReferenceFiles),
      String(definition.topTierReferenceFloor),
      String(definition.templateReferenceFloor)
    ];
  });
}

function buildLifecycleRows() {
  return [...ALL_SKILL_STATUSES]
    .sort((left, right) => String(left).localeCompare(String(right)))
    .map((status) => [
      asCode(status),
      yesNo(WRITABLE_SKILL_STATUSES.has(status)),
      yesNo(LIVE_SKILL_STATUSES.has(status)),
      yesNo(REVIEW_GOVERNED_SKILL_STATUSES.has(status)),
      yesNo(RUNTIME_PROOF_GOVERNED_SKILL_STATUSES.has(status)),
      getSkillLevelBucketForStatus(status) ? asCode(getSkillLevelBucketForStatus(status)) : '-',
      asCode(getDefaultRuntimeProofLevelForStatus(status))
    ]);
}

function buildOpportunityRows() {
  return OPPORTUNITY_STATUS_ORDER.map((status) => [
    asCode(status),
    yesNo(isActiveOpportunityStatus(status)),
    yesNo(status === 'blocked')
  ]);
}

function buildAdmissionDecisionRows() {
  return [...ADMISSION_DECISION_ACTIONS].map((action) => [
    asCode(action),
    asCode(getDefaultAdmissionStatusForDecision(action)),
    asCode(getDefaultOpportunityStatusForDecision(action) || 'none')
  ]);
}

function buildAdmissionStatusRows() {
  return ADMISSION_STATUS_ORDER.map((status) => [
    asCode(status),
    yesNo(isActiveAdmissionStatus(status)),
    yesNo(isTerminalAdmissionStatus(status)),
    yesNo(isBlockingAdmissionStatus(status))
  ]);
}

function buildPendingScaffoldRows() {
  return PENDING_SCAFFOLD_STATUS_ORDER.map((status) => [
    asCode(status),
    yesNo(isActivePendingScaffoldStatus(status)),
    yesNo(status === 'blocked')
  ]);
}

function buildReviewMetadataPolicyRows() {
  return listReviewMetadataPolicies()
    .map((policy) => [
      asCode(policy.kind),
      asCode(policy.owner),
      String(policy['review-cycle-days'])
    ]);
}

function buildWriteabilityRows() {
  return listGovernanceArtifacts(null, { writeabilityTrackedOnly: true })
    .filter((artifact) => getHostWriteabilitySeverity(artifact.id) !== 'normal')
    .map((artifact) => [
      asCode(artifact.id),
      asCode(getHostWriteabilitySeverity(artifact.id)),
      asCode(artifact.relativePath),
      asCode(artifact.mode)
    ]);
}

function buildArtifactRows() {
  return listGovernanceArtifacts()
    .map((artifact) => [
      asCode(artifact.id),
      asCode(artifact.relativePath),
      asCode(artifact.mode),
      yesNo(artifact.writeabilityTracked),
      yesNo(artifact.derivedFingerprintSource)
    ]);
}

function buildDerivedGovernanceRefreshRows() {
  return listDerivedGovernanceRefreshSteps()
    .map((step) => [
      asCode(step.id),
      step.label,
      step.artifacts.map(asCode).join(', '),
      step.description
    ]);
}

function buildAuthoringGovernanceReferenceMarkdown() {
  const lines = [
    '# Skill Authoring Governance Reference',
    '',
    'Generated from the governance modules under `personal-skill-system/skills/tools/lib/`.',
    'Do not hand-edit this file. Update the governance source modules, then rerun `verify-skill-system --self-smoke` or another derived-governance refresh path.',
    '',
    'Use this reference for volatile token sets and matrices that should not be copied by hand into authoring docs.',
    '',
    '## Governed Tokens',
    '',
    `- skill kinds: ${[...FUTURE_SKILL_KINDS].map(asCode).join(', ')}`,
    `- writable lifecycle statuses: ${SKILL_STATUS_ORDER.map(asCode).join(', ')}`,
    `- runtime-proof levels: ${RUNTIME_PROOF_LEVEL_ORDER.map(asCode).join(', ')}`,
    `- future-skill priorities: ${FUTURE_SKILL_PRIORITY_ORDER.map(asCode).join(', ')}`,
    `- future-skill horizons: ${FUTURE_SKILL_HORIZON_ORDER.map(asCode).join(', ')}`,
    '',
    '## Skill Kinds',
    '',
    buildMarkdownTable(
      ['Kind', 'Layer', 'Active Route', 'Governed Route', 'Placeholder Route', 'Module Scaffold', 'Lineage', 'Min Refs', 'Top-tier Floor', 'Template Floor'],
      buildKindRows()
    ),
    '',
    '## Frontmatter Enums',
    '',
    `- required keys: ${REQUIRED_FRONTMATTER_KEYS.map(asCode).join(', ')}`,
    `- visibility: ${SKILL_VISIBILITY_ORDER.map(asCode).join(', ')}`,
    `- trigger-mode: ${SKILL_TRIGGER_MODE_ORDER.map(asCode).join(', ')}`,
    `- runtime: ${SKILL_RUNTIME_ORDER.map(asCode).join(', ')}`,
    `- executor: ${SKILL_EXECUTOR_ORDER.map(asCode).join(', ')}`,
    `- risk-level: ${SKILL_RISK_LEVEL_ORDER.map(asCode).join(', ')}`,
    `- supported-hosts: ${SKILL_SUPPORTED_HOSTS_ORDER.map(asCode).join(', ')}`,
    '',
    '## Lifecycle',
    '',
    buildMarkdownTable(
      ['Status', 'Writable', 'Live', 'Review-governed', 'Runtime-proof-governed', 'Skill-level Bucket', 'Default Runtime-proof Level'],
      buildLifecycleRows()
    ),
    '',
    '## Review Metadata Seed Policy',
    '',
    `- default owner for newly scaffolded skills: ${asCode(DEFAULT_SKILL_OWNER)}`,
    '- new skills should seed `last-reviewed` from scaffold creation date instead of copying the template review date',
    '',
    buildMarkdownTable(
      ['Kind', 'Seed Owner', 'Seed Review Cycle Days'],
      buildReviewMetadataPolicyRows()
    ),
    '',
    '## Runtime Proof',
    '',
    `- minimum contracts for a governed runtime-proof entry: ${MIN_RUNTIME_PROOF_CONTRACTS}`,
    `- evidence-test source order: ${RUNTIME_PROOF_EVIDENCE_SOURCE_ORDER.map(asCode).join(', ')}`,
    `- levels that require evidence tests: ${RUNTIME_PROOF_LEVEL_ORDER.filter((level) => needsEvidenceTestsForRuntimeProofLevel(level)).map(asCode).join(', ')}`,
    '',
    '## Future-Skill Intake',
    '',
    '### Opportunity Statuses',
    '',
    buildMarkdownTable(
      ['Status', 'Active', 'Blocking'],
      buildOpportunityRows()
    ),
    '',
    '### Admission Decision Actions',
    '',
    buildMarkdownTable(
      ['Action', 'Default Admission Status', 'Default Opportunity Status'],
      buildAdmissionDecisionRows()
    ),
    '',
    '### Admission Statuses',
    '',
    buildMarkdownTable(
      ['Status', 'Active', 'Terminal', 'Blocking'],
      buildAdmissionStatusRows()
    ),
    '',
    '### Pending Scaffold Statuses',
    '',
    buildMarkdownTable(
      ['Status', 'Active', 'Blocking'],
      buildPendingScaffoldRows()
    ),
    '',
    '## Host-Smoke Governance',
    '',
    `- policy tiers: ${[...HOST_SMOKE_POLICY_TIERS].sort().map(asCode).join(', ')}`,
    `- target levels: ${[...HOST_SMOKE_TARGET_LEVELS].sort().map(asCode).join(', ')}`,
    `- command cwd modes: ${[...HOST_SMOKE_COMMAND_CWD_MODES].sort().map(asCode).join(', ')}`,
    `- freshness units: ${[...HOST_SMOKE_FRESHNESS_UNITS].sort().map(asCode).join(', ')}`,
    `- result statuses: ${[...HOST_SMOKE_RESULT_STATUSES].sort().map(asCode).join(', ')}`,
    `- invalidation reasons: ${[...HOST_SMOKE_INVALIDATION_REASONS].sort().map(asCode).join(', ')}`,
    '',
    '### Writeability Severities',
    '',
    buildMarkdownTable(
      ['Artifact Id', 'Severity', 'Path', 'Mode'],
      buildWriteabilityRows()
    ),
    '',
    '### Readiness Schema Surfaces',
    '',
    `- centralized readiness schemas: ${READINESS_SCHEMA_ORDER.map(asCode).join(', ')}`,
    '',
    '## Portfolio Surfaces',
    '',
    '- `registry/skill-investment-backlog.generated.json`: machine-readable portfolio board for current-skill hardening, future-skill intake, lifecycle debt, and host constraints',
    '- `skills/routers/sage/references/skill-investment-backlog.generated.md`: human-readable mirror of the governed investment backlog for regular review and planning',
    '- skill deletion is governed too: active opportunity/admission/evolution/pending-scaffold/expert-source references block deletion, while historical references are only valid after a recorded `delete` evolution outcome exists',
    '',
    '## Derived-Governance Refresh Plan',
    '',
    buildMarkdownTable(
      ['Step Id', 'Label', 'Artifacts', 'Purpose'],
      buildDerivedGovernanceRefreshRows()
    ),
    '',
    '## Generated Governance Artifacts',
    '',
    buildMarkdownTable(
      ['Artifact Id', 'Relative Path', 'Mode', 'Writeability Tracked', 'Fingerprint Source'],
      buildArtifactRows()
    )
  ];

  return lines.join('\n');
}

function syncAuthoringGovernanceReference(bundleRoot) {
  const file = getAuthoringGovernanceReferencePath(bundleRoot);
  const expected = `${buildAuthoringGovernanceReferenceMarkdown()}\n`;
  fs.writeFileSync(file, expected, 'utf8');
  return file;
}

function validateAuthoringGovernanceReference(bundleRoot, findings) {
  const file = getAuthoringGovernanceReferencePath(bundleRoot);
  if (!fs.existsSync(file)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'authoring governance generated reference is missing'
    });
    return null;
  }

  const expected = `${buildAuthoringGovernanceReferenceMarkdown()}\n`;
  const actual = fs.readFileSync(file, 'utf8');
  if (actual !== expected) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'authoring governance generated reference is out of sync with centralized governance modules'
        : `authoring governance generated reference is out of sync with centralized governance modules, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  return file;
}

module.exports = {
  AUTHORING_GOVERNANCE_REFERENCE_ARTIFACT_ID,
  getAuthoringGovernanceReferencePath,
  buildAuthoringGovernanceReferenceMarkdown,
  syncAuthoringGovernanceReference,
  validateAuthoringGovernanceReference
};
