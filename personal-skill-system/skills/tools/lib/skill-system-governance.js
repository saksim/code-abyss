'use strict';

const RUNTIME_PROOF_LIVE_STATUSES = new Set(['stable', 'experimental', 'deprecated']);
const HOST_SMOKE_POLICY_TIERS = new Set(['critical', 'standard', 'experimental']);
const HOST_SMOKE_TARGET_LEVELS = new Set(['declared-only', 'declared-and-tested', 'host-smoked']);

function normalizeHostSmokeTier(value) {
  const normalized = String(value || '').trim();
  return HOST_SMOKE_POLICY_TIERS.has(normalized) ? normalized : null;
}

function normalizeHostSmokeTargetLevel(value) {
  const normalized = String(value || '').trim();
  return HOST_SMOKE_TARGET_LEVELS.has(normalized) ? normalized : null;
}

function normalizeHostSmokeFreshnessDays(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function isGovernedRuntimeProofRecord(record) {
  return !!record
    && record.runtime === 'scripted'
    && (record.kind === 'tool' || record.kind === 'guard')
    && RUNTIME_PROOF_LIVE_STATUSES.has(record.status);
}

function defaultHostSmokePolicyForStatus(status) {
  return status === 'stable'
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

module.exports = {
  RUNTIME_PROOF_LIVE_STATUSES,
  HOST_SMOKE_POLICY_TIERS,
  HOST_SMOKE_TARGET_LEVELS,
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays,
  isGovernedRuntimeProofRecord,
  defaultHostSmokePolicyForStatus,
  normalizeHostSmokePolicy,
  deriveHostSmokePolicyFromRecord,
  hostSmokePoliciesEqual
};
