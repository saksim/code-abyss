'use strict';

const {
  getGovernanceArtifactPath
} = require('./skill-generated-artifact-governance');
const {
  isGovernedRuntimeProofRecord,
  deriveHostSmokePolicyFromRecord,
  normalizeHostSmokePolicy,
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays
} = require('./skill-host-governance');
const {
  getDefaultRuntimeProofLevelForStatus,
  isKnownRuntimeProofLevel,
  getAutoPromotedRuntimeProofLevel
} = require('./skill-lifecycle-governance');
const {
  validateSmokeManifest
} = require('./skill-system-common');
const {
  normalizeHostSmokeContract
} = require('./skill-system-host-smoke');

const RUNTIME_PROOF_SCHEMA_VERSION = 1;
const MIN_RUNTIME_PROOF_CONTRACTS = 2;
const RUNTIME_PROOF_EVIDENCE_SOURCE_ORDER = Object.freeze(['explicit', 'existing', 'suggested', 'none']);
const HOST_SMOKED_EVIDENCE_FAILURE_REASONS = Object.freeze([
  'invalid-contract',
  'missing',
  'contract-drift',
  'failing',
  'stale'
]);

function getRuntimeProofPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'runtime-proof');
}

function normalizeEvidenceTests(values) {
  const items = Array.isArray(values) ? values : [];
  const normalized = [];
  const seen = new Set();
  for (const raw of items) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function shouldHaveRuntimeProofEntry(record) {
  return isGovernedRuntimeProofRecord(record);
}

function defaultRuntimeProofLevelForStatus(status) {
  return getDefaultRuntimeProofLevelForStatus(status);
}

function hasMinimumRuntimeProofContracts(contracts) {
  return (Array.isArray(contracts) ? contracts : []).length >= MIN_RUNTIME_PROOF_CONTRACTS;
}

function needsEvidenceTestsForRuntimeProofLevel(level) {
  return String(level || '').trim() !== 'declared-only';
}

function hasRequiredRuntimeProofEvidenceTests(level, evidenceTests) {
  return !needsEvidenceTestsForRuntimeProofLevel(level)
    || normalizeEvidenceTests(evidenceTests).length >= 1;
}

function resolveEvidenceTests(existing, options = {}, suggestedEvidenceTests = []) {
  if (options.evidenceTests !== undefined) {
    return {
      evidenceTests: normalizeEvidenceTests(options.evidenceTests),
      evidenceTestSource: 'explicit',
      suggestedEvidenceTests
    };
  }

  const existingEvidenceTests = normalizeEvidenceTests(existing && existing['evidence-tests']);
  if (existingEvidenceTests.length > 0) {
    return {
      evidenceTests: existingEvidenceTests,
      evidenceTestSource: 'existing',
      suggestedEvidenceTests
    };
  }

  if (options.autoEvidenceTests && suggestedEvidenceTests.length > 0) {
    return {
      evidenceTests: [...suggestedEvidenceTests],
      evidenceTestSource: 'suggested',
      suggestedEvidenceTests
    };
  }

  return {
    evidenceTests: [],
    evidenceTestSource: 'none',
    suggestedEvidenceTests
  };
}

function resolveRuntimeProofHostSmoke(record) {
  const manifestPath = String(record && record.smokeManifestPath || '').trim();
  const manifest = record && record.smokeManifest;

  if (!manifestPath || !manifest) {
    return null;
  }

  const errors = validateSmokeManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`invalid smoke manifest for '${record.name}': ${errors.join('; ')}`);
  }

  return {
    manifest: manifestPath,
    ...(manifest.freshness ? { freshness: { ...manifest.freshness } } : {}),
    commands: normalizeHostSmokeContract({
      manifest: manifestPath,
      ...(manifest.freshness ? { freshness: { ...manifest.freshness } } : {}),
      commands: manifest.commands
    }).commands
  };
}

function buildHostSmokePolicyForRuntimeProof(record, overrides = {}, existing = null) {
  const recordPolicy = deriveHostSmokePolicyFromRecord(record) || {};
  const existingPolicy = normalizeHostSmokePolicy(existing && existing['host-smoke-policy']) || {};
  const tier = normalizeHostSmokeTier(overrides.hostSmokeTier)
    || recordPolicy.tier
    || existingPolicy.tier;
  const targetLevel = normalizeHostSmokeTargetLevel(overrides.hostSmokeTargetLevel)
    || recordPolicy['target-level']
    || existingPolicy['target-level'];
  const freshnessDays = normalizeHostSmokeFreshnessDays(overrides.hostSmokeFreshnessDays)
    ?? normalizeHostSmokeFreshnessDays(record && record.hostSmokeFreshnessDays)
    ?? normalizeHostSmokeFreshnessDays(existingPolicy['freshness-days']);

  if (!tier || !targetLevel) {
    throw new Error(`host-smoke policy for '${record.name}' is incomplete; declare host-smoke-tier and host-smoke-target-level in SKILL.md`);
  }
  if (tier === 'critical' && targetLevel !== 'host-smoked') {
    throw new Error(`critical host-smoke policy for '${record.name}' must target 'host-smoked'`);
  }
  if (targetLevel === 'host-smoked' && freshnessDays == null) {
    throw new Error(`host-smoke policy for '${record.name}' targeting 'host-smoked' requires host-smoke-freshness-days`);
  }
  if (targetLevel !== 'host-smoked' && freshnessDays != null) {
    throw new Error(`host-smoke-freshness-days for '${record.name}' is only valid when host-smoke-target-level is 'host-smoked'`);
  }

  return {
    tier,
    'target-level': targetLevel,
    ...(freshnessDays != null ? { 'freshness-days': freshnessDays } : {})
  };
}

function buildRuntimeProofEntry(record, overrides = {}, existing = null) {
  const requestedLevel = String(
    overrides.level || (existing && existing.level) || defaultRuntimeProofLevelForStatus(record.status)
  ).trim();
  if (!isKnownRuntimeProofLevel(requestedLevel)) {
    throw new Error(`invalid runtime-proof level '${requestedLevel}' for '${record.name}'`);
  }
  const level = overrides.level
    ? requestedLevel
    : getAutoPromotedRuntimeProofLevel(requestedLevel, record.status);

  const evidenceTests = normalizeEvidenceTests(
    overrides.evidenceTests !== undefined
      ? overrides.evidenceTests
      : existing && existing['evidence-tests']
  );
  const hostSmokePolicy = buildHostSmokePolicyForRuntimeProof(record, overrides, existing);
  const hostSmoke = record.status === 'stable' || level === 'host-smoked' || hostSmokePolicy['target-level'] !== 'declared-only'
    ? resolveRuntimeProofHostSmoke(record)
    : null;

  if (level === 'host-smoked' && (!hostSmoke || !Array.isArray(hostSmoke.commands) || hostSmoke.commands.length < 1)) {
    throw new Error(`runtime-proof level 'host-smoked' for '${record.name}' requires a valid scripts/smoke.json manifest`);
  }
  if (hostSmokePolicy['target-level'] === 'host-smoked') {
    const freshness = hostSmoke && hostSmoke.freshness ? hostSmoke.freshness : null;
    if (!freshness || freshness['max-age'] !== hostSmokePolicy['freshness-days'] || freshness.unit !== 'days') {
      throw new Error(`host-smoke policy for '${record.name}' requires scripts/smoke.json freshness to match host-smoke-freshness-days in days`);
    }
  }

  return {
    skill: record.name,
    kind: record.kind,
    level,
    contracts: [...(Array.isArray(record.runtimeProofItems) ? record.runtimeProofItems : [])],
    'evidence-tests': evidenceTests,
    'host-smoke-policy': hostSmokePolicy,
    ...(hostSmoke ? { 'host-smoke': hostSmoke } : {})
  };
}

function buildRuntimeProofRegistryDocument(proofs) {
  return {
    'schema-version': RUNTIME_PROOF_SCHEMA_VERSION,
    proofs: Array.isArray(proofs) ? proofs : []
  };
}

function describeHostSmokedEvidenceFailure(evaluation) {
  switch (evaluation && evaluation.reason) {
    case 'invalid-contract':
      return 'current host-smoke contract is invalid or incomplete';
    case 'missing':
      return 'no matching runtime host-smoke artifact exists for the current contract';
    case 'contract-drift':
      return 'recorded runtime host-smoke artifacts do not match the current contract';
    case 'failing':
      return 'the latest matching runtime host-smoke artifact did not pass';
    case 'stale':
      return 'the latest passing runtime host-smoke artifact is older than the declared freshness window';
    default:
      return 'host-smoke evidence is not sufficient';
  }
}

module.exports = {
  RUNTIME_PROOF_SCHEMA_VERSION,
  MIN_RUNTIME_PROOF_CONTRACTS,
  RUNTIME_PROOF_EVIDENCE_SOURCE_ORDER,
  HOST_SMOKED_EVIDENCE_FAILURE_REASONS,
  getRuntimeProofPath,
  normalizeEvidenceTests,
  shouldHaveRuntimeProofEntry,
  defaultRuntimeProofLevelForStatus,
  hasMinimumRuntimeProofContracts,
  needsEvidenceTestsForRuntimeProofLevel,
  hasRequiredRuntimeProofEvidenceTests,
  resolveEvidenceTests,
  resolveRuntimeProofHostSmoke,
  buildHostSmokePolicyForRuntimeProof,
  buildRuntimeProofEntry,
  buildRuntimeProofRegistryDocument,
  describeHostSmokedEvidenceFailure
};
