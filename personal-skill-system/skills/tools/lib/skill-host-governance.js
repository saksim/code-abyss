'use strict';

const {
  RUNTIME_PROOF_GOVERNED_SKILL_STATUSES
} = require('./skill-lifecycle-governance');

const GOVERNED_RUNTIME_PROOF_KIND_ORDER = Object.freeze(['tool', 'guard']);
const GOVERNED_RUNTIME_PROOF_KINDS = new Set(GOVERNED_RUNTIME_PROOF_KIND_ORDER);
const HOST_SMOKE_POLICY_TIERS = new Set(['critical', 'standard', 'experimental']);
const HOST_SMOKE_TARGET_LEVELS = new Set(['declared-only', 'declared-and-tested', 'host-smoked']);
const HOST_SMOKE_RESULT_STATUSES = new Set(['pass', 'fail']);
const HOST_SMOKE_COMMAND_CWD_MODES = new Set(['skill-dir', 'bundle-root']);
const HOST_SMOKE_FRESHNESS_UNITS = new Set(['hours', 'days']);
const HOST_SMOKE_EVIDENCE_STATUSES = new Set(['passing', 'stale', 'failing', 'missing', 'contract-drift', 'invalid-contract']);
const HOST_SMOKE_GOVERNANCE_STATUSES = new Set(['satisfied', 'not-host-smoked', 'stale', 'failing', 'missing', 'contract-drift', 'invalid-contract']);
const HOST_SMOKE_INVALIDATION_REASONS = new Set(['contract-drift', 'manual-reset', 'superseded']);

const HOST_WRITEABILITY_SEVERITY_BY_ARTIFACT = Object.freeze({
  'runtime-proof': 'critical',
  'host-smoke-scorecard': 'critical',
  'host-smoke-runtime-runs': 'critical',
  'system-readiness': 'high',
  'authoritative-skill-tree': 'high'
});
const HOST_WRITEABILITY_SEVERITY_ORDER = Object.freeze(['critical', 'high', 'normal']);

const AUTHORITATIVE_SKILL_TREE_CONSTRAINT = Object.freeze({
  id: 'authoritative-skill-tree',
  label: 'authoritative skill tree create surface',
  mode: 'create-child-directory'
});

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeHostSmokeTier(value) {
  const normalized = normalizeString(value);
  return HOST_SMOKE_POLICY_TIERS.has(normalized) ? normalized : null;
}

function normalizeHostSmokeTargetLevel(value) {
  const normalized = normalizeString(value);
  return HOST_SMOKE_TARGET_LEVELS.has(normalized) ? normalized : null;
}

function normalizeHostSmokeFreshnessDays(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function isGovernedRuntimeProofRecord(record) {
  return !!record
    && record.runtime === 'scripted'
    && GOVERNED_RUNTIME_PROOF_KINDS.has(normalizeString(record.kind))
    && RUNTIME_PROOF_GOVERNED_SKILL_STATUSES.has(normalizeString(record.status));
}

function defaultHostSmokePolicyForStatus(status) {
  return normalizeString(status) === 'stable'
    ? {
        tier: 'standard',
        'target-level': 'declared-and-tested'
      }
    : {
        tier: 'experimental',
        'target-level': 'declared-only'
      };
}

function normalizeHostSmokePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return null;
  }

  const tier = normalizeHostSmokeTier(policy.tier);
  const targetLevel = normalizeHostSmokeTargetLevel(policy['target-level'] || policy.targetLevel);
  if (!tier || !targetLevel) {
    return null;
  }

  const freshnessDays = normalizeHostSmokeFreshnessDays(
    policy['freshness-days'] ?? policy.freshnessDays ?? policy['max-freshness-days']
  );

  return {
    tier,
    'target-level': targetLevel,
    ...(freshnessDays != null ? { 'freshness-days': freshnessDays } : {})
  };
}

function deriveHostSmokePolicyFromRecord(record) {
  if (!record) {
    return null;
  }

  const fallback = defaultHostSmokePolicyForStatus(record.status);
  const tier = normalizeHostSmokeTier(record.hostSmokeTier) || fallback.tier;
  const targetLevel = normalizeHostSmokeTargetLevel(record.hostSmokeTargetLevel) || fallback['target-level'];
  const freshnessDays = normalizeHostSmokeFreshnessDays(record.hostSmokeFreshnessDays);

  return {
    tier,
    'target-level': targetLevel,
    ...(freshnessDays != null ? { 'freshness-days': freshnessDays } : {})
  };
}

function hostSmokePoliciesEqual(left, right) {
  const normalizedLeft = normalizeHostSmokePolicy(left);
  const normalizedRight = normalizeHostSmokePolicy(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function getHostWriteabilitySeverity(artifactId) {
  return HOST_WRITEABILITY_SEVERITY_BY_ARTIFACT[normalizeString(artifactId)] || 'normal';
}

function isCriticalHostWriteabilityArtifact(artifactId) {
  return getHostWriteabilitySeverity(artifactId) === 'critical';
}

module.exports = {
  GOVERNED_RUNTIME_PROOF_KIND_ORDER,
  GOVERNED_RUNTIME_PROOF_KINDS,
  RUNTIME_PROOF_LIVE_STATUSES: RUNTIME_PROOF_GOVERNED_SKILL_STATUSES,
  HOST_SMOKE_POLICY_TIERS,
  HOST_SMOKE_TARGET_LEVELS,
  HOST_SMOKE_RESULT_STATUSES,
  HOST_SMOKE_COMMAND_CWD_MODES,
  HOST_SMOKE_FRESHNESS_UNITS,
  HOST_SMOKE_EVIDENCE_STATUSES,
  HOST_SMOKE_GOVERNANCE_STATUSES,
  HOST_SMOKE_INVALIDATION_REASONS,
  HOST_WRITEABILITY_SEVERITY_ORDER,
  AUTHORITATIVE_SKILL_TREE_CONSTRAINT,
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays,
  isGovernedRuntimeProofRecord,
  defaultHostSmokePolicyForStatus,
  normalizeHostSmokePolicy,
  deriveHostSmokePolicyFromRecord,
  hostSmokePoliciesEqual,
  getHostWriteabilitySeverity,
  isCriticalHostWriteabilityArtifact
};
