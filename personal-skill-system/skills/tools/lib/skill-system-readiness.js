'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  probeArtifactWriteAccess,
  collectGeneratedArtifactWriteability,
  probeDirectoryCreateAccess
} = require('./skill-system-common');
const {
  getGovernanceArtifactPath,
  getGovernanceArtifactRelativePath
} = require('./skill-generated-artifact-governance');
const { collectSkillRecords } = require('./skill-system-skills');
const {
  getHostSmokeScorecardPath,
  buildHostSmokeScorecard
} = require('./skill-system-host-smoke');
const {
  isGovernedRuntimeProofRecord,
  normalizeHostSmokePolicy,
  deriveHostSmokePolicyFromRecord,
  HOST_SMOKE_POLICY_TIERS,
  getHostWriteabilitySeverity,
  AUTHORITATIVE_SKILL_TREE_CONSTRAINT
} = require('./skill-host-governance');
const {
  getReviewQueuePath,
  summarizeReviewQueue,
  buildReviewQueue,
  validateReviewQueue
} = require('./skill-review-governance');
const {
  buildHostEvolutionReport,
  getHostEvolutionPath
} = require('./skill-system-host-evolution');
const {
  buildExpertSourceFamilyScorecard,
  getExpertSourceFamilyScorecardPath
} = require('./expert-source-integration');
const {
  summarizeStableTopTierBlockers,
  STABLE_TOP_TIER_BLOCKER_FIELDS,
  buildStableTopTierPortfolio,
  buildStableTopTierExecutionFocus
} = require('./skill-top-tier-governance');
const {
  dedupeRuntimeProofEntries
} = require('./skill-runtime-proof-governance');
const {
  shouldAppearOnActiveRouteSurface
} = require('./skill-kind-governance');

const SYSTEM_READINESS_SCHEMA_VERSION = 2;
const SYSTEM_READINESS_STATUSES = new Set(['ready', 'attention', 'blocked']);
const SYSTEM_READINESS_STATUS_ORDER = Object.freeze([...SYSTEM_READINESS_STATUSES]);
const SYSTEM_READINESS_SIGNAL_ORDER = Object.freeze([
  'benchmark',
  'route-evidence',
  'runtime-proof',
  'host-smoke',
  'top-tier-readiness',
  'review-cadence',
  'investment-backlog',
  'expert-source-families',
  'host-writeability'
]);
const SYSTEM_READINESS_HOST_SMOKE_SOURCE_KEYS = Object.freeze([
  'benchmark-summary',
  'host-smoke-scorecard',
  'runtime-proof',
  'route-fixtures',
  'review-queue',
  'skill-opportunity-queue',
  'expert-source-family-scorecard',
  'pending-scaffolds',
  'skill-investment-backlog'
]);
const SYSTEM_READINESS_SUMMARY_KEYS = Object.freeze([
  'live-scripted-skills',
  'stable-user-invocable-skills',
  'route-evidence-covered-skills',
  'runtime-proof-entries',
  'host-smoke-capable-skills',
  'stable-top-tier-blocked-skills',
  'stable-top-tier-ready-skills',
  'stable-top-tier-critical-skills',
  'stable-top-tier-high-skills',
  'stable-top-tier-normal-skills',
  'stable-top-tier-clear-skills',
  'stable-top-tier-next-wave-size',
  ...STABLE_TOP_TIER_BLOCKER_FIELDS,
  'review-governed-skills',
  'review-overdue-skills',
  'review-due-soon-skills',
  'review-missing-metadata-skills',
  'investment-backlog-items',
  'investment-backlog-critical',
  'investment-backlog-high',
  'active-expert-source-families',
  'active-expert-source-unmapped-raw-sources',
  'host-writeability-blocked-artifacts'
]);
const SYSTEM_READINESS_NOTES_MIN_ITEMS = 1;
const SYSTEM_READINESS_BENCHMARK_SUMMARY_STATUS_ORDER = Object.freeze(['empty', 'ok', 'partial']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getBenchmarkSummaryPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'summary.generated.json');
}

function getBenchmarkSummarySchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'summary.schema.json');
}

function getSystemReadinessPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'system-readiness');
}

function getSystemReadinessSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'system-readiness.schema.json');
}

function getHostEvolutionGeneratedPath(bundleRoot) {
  return getHostEvolutionPath(bundleRoot);
}

function getHostEvolutionSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'host-evolution.schema.json');
}

function getRuntimeProofPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'runtime-proof');
}

function getRouteFixturesPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'route-fixtures');
}

function getReviewQueueGeneratedPath(bundleRoot) {
  return getReviewQueuePath(bundleRoot);
}

function getSkillInvestmentBacklogPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'skill-investment-backlog');
}

function getPendingScaffoldRegistryPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'pending-scaffolds');
}

function portablePath(bundleRoot, targetPath) {
  return rel(bundleRoot, targetPath);
}

function readArrayField(file, field) {
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    return [];
  }
  const value = parsed.data && parsed.data[field];
  return Array.isArray(value) ? value : [];
}

function collectSystemReadinessContext(bundleRoot) {
  const findings = [];
  const { skillRecords } = collectSkillRecords(bundleRoot, findings);

  return {
    skillRecords,
    runtimeProofs: dedupeRuntimeProofEntries(readArrayField(getRuntimeProofPath(bundleRoot), 'proofs'), { prefer: 'first' }),
    routeFixtures: readArrayField(getRouteFixturesPath(bundleRoot), 'cases')
  };
}

function countLiveScriptedSkills(skillRecords) {
  return (Array.isArray(skillRecords) ? skillRecords : []).filter((record) => isGovernedRuntimeProofRecord(record)).length;
}

function resolveHostSmokePolicy(entry, runtimeProofs, skillRecords) {
  const skill = String(entry && entry.skill || '').trim();
  if (!skill) {
    return {
      tier: 'experimental',
      'target-level': 'declared-only'
    };
  }

  const proof = (Array.isArray(runtimeProofs) ? runtimeProofs : []).find((item) => item && item.skill === skill);
  const proofPolicy = normalizeHostSmokePolicy(proof && proof['host-smoke-policy']);
  if (proofPolicy) {
    return proofPolicy;
  }

  const record = (Array.isArray(skillRecords) ? skillRecords : []).find((item) => item && item.name === skill);
  if (record) {
    return deriveHostSmokePolicyFromRecord(record);
  }

  return {
    tier: 'experimental',
    'target-level': 'declared-only'
  };
}

function determineHostSmokePolicyExpectation(entry, runtimeProofs, skillRecords) {
  const policy = resolveHostSmokePolicy(entry, runtimeProofs, skillRecords);
  return {
    tier: policy.tier,
    targetLevel: policy['target-level'],
    requiresFreshness: Number.isInteger(policy['freshness-days']),
    maxFreshnessDays: Number.isInteger(policy['freshness-days']) ? policy['freshness-days'] : null
  };
}

function classifyHostSmokePolicyStatus(entry, expectation) {
  if (!entry || !expectation) {
    return 'blocked';
  }

  if (expectation.targetLevel === 'host-smoked') {
    if (entry.level !== 'host-smoked') return 'attention';
    if (entry['governance-status'] !== 'satisfied') return 'blocked';
    if (expectation.requiresFreshness && !entry.freshness) return 'attention';
    return 'ready';
  }

  if (expectation.targetLevel === 'declared-and-tested') {
    if (entry.level === 'declared-only') return 'attention';
    if (entry['evidence-status'] === 'invalid-contract' || entry['evidence-status'] === 'contract-drift') return 'blocked';
    if (entry['evidence-status'] === 'failing') return 'attention';
    return 'ready';
  }

  return entry.level === 'declared-only' ? 'ready' : 'attention';
}

function normalizeHostSmokePolicyEntries(scorecard, runtimeProofs = [], skillRecords = []) {
  const skills = Array.isArray(scorecard && scorecard.skills) ? scorecard.skills : [];
  return skills.map((entry) => {
    const expectation = determineHostSmokePolicyExpectation(entry, runtimeProofs, skillRecords);
    const policyStatus = classifyHostSmokePolicyStatus(entry, expectation);
    return {
      skill: entry.skill,
      kind: entry.kind,
      tier: expectation.tier,
      status: policyStatus,
      level: entry.level,
      'target-level': expectation.targetLevel,
      'requires-freshness': expectation.requiresFreshness,
      ...(expectation.maxFreshnessDays != null ? { 'max-freshness-days': expectation.maxFreshnessDays } : {}),
      'evidence-status': entry['evidence-status'],
      'governance-status': entry['governance-status']
    };
  }).sort((left, right) => left.skill.localeCompare(right.skill));
}

function summarizeHostSmokePolicy(entries) {
  const summary = {
    tiers: {
      critical: 0,
      standard: 0,
      experimental: 0
    },
    statuses: {
      ready: 0,
      attention: 0,
      blocked: 0
    }
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (HOST_SMOKE_POLICY_TIERS.has(entry.tier)) {
      summary.tiers[entry.tier] += 1;
    }
    if (SYSTEM_READINESS_STATUSES.has(entry.status)) {
      summary.statuses[entry.status] += 1;
    }
  }

  return summary;
}

function classifyReadinessStatus(signalStates) {
  if (signalStates.some((item) => item === 'blocked')) return 'blocked';
  if (signalStates.some((item) => item === 'attention')) return 'attention';
  return 'ready';
}

function buildBenchmarkSignal(bundleRoot) {
  const summaryPath = getBenchmarkSummaryPath(bundleRoot);
  const parsed = parseJsonFile(summaryPath);
  if (parsed.error) {
    return {
      status: 'attention',
      file: portablePath(bundleRoot, summaryPath),
      reason: `benchmark summary parse failed: ${parsed.error}`
    };
  }

  const data = parsed.data || {};
  const status = String(data.status || '').trim();
  const runCount = Number.isInteger(data.run_count) ? data.run_count : 0;

  return {
    status: status === 'ok' ? 'ready' : status === 'partial' ? 'attention' : 'attention',
    file: portablePath(bundleRoot, summaryPath),
    summary_status: status || 'empty',
    run_count: runCount
  };
}

function buildRouteEvidenceSignal(skillRecords, routeFixtures) {
  const stableUserInvocable = (Array.isArray(skillRecords) ? skillRecords : []).filter((record) =>
    record
    && record.status === 'stable'
    && shouldAppearOnActiveRouteSurface(record)
  );

  const fixtures = Array.isArray(routeFixtures) ? routeFixtures : [];
  let covered = 0;
  for (const record of stableUserInvocable) {
    const directCoverage = fixtures.some((fixture) => fixture.expect === record.name);
    const fallbackCoverage = fixtures.some((fixture) => String(fixture['expect-fallback-question-contains'] || '').toLowerCase().includes(record.name.toLowerCase()));
    if (directCoverage || fallbackCoverage) {
      covered += 1;
    }
  }

  return {
    status: covered === stableUserInvocable.length ? 'ready' : 'attention',
    stable_skills: stableUserInvocable.length,
    covered_skills: covered
  };
}

function buildRuntimeProofSignal(runtimeProofs, liveScriptedSkills) {
  const dedupedProofs = dedupeRuntimeProofEntries(runtimeProofs, { prefer: 'first' });
  const count = dedupedProofs.length;
  return {
    status: count === liveScriptedSkills ? 'ready' : 'attention',
    live_scripted_skills: liveScriptedSkills,
    runtime_proof_entries: count
  };
}

function classifyReviewCadenceStatus(summary) {
  const normalized = summary || summarizeReviewQueue([]);
  if ((normalized['stable-overdue'] || 0) > 0 || (normalized['stable-missing-metadata'] || 0) > 0) {
    return 'blocked';
  }
  if ((normalized.overdue || 0) > 0 || (normalized['missing-metadata'] || 0) > 0 || (normalized['due-soon'] || 0) > 0) {
    return 'attention';
  }
  return 'ready';
}

function buildReviewCadenceSignal(reviewQueue) {
  const summary = reviewQueue && reviewQueue.summary ? reviewQueue.summary : summarizeReviewQueue([]);
  return {
    status: classifyReviewCadenceStatus(summary),
    'governed-skills': Number(summary['governed-skills'] || 0),
    overdue: Number(summary.overdue || 0),
    'due-soon': Number(summary['due-soon'] || 0),
    scheduled: Number(summary.scheduled || 0),
    'missing-metadata': Number(summary['missing-metadata'] || 0),
    'stable-overdue': Number(summary['stable-overdue'] || 0),
    'stable-missing-metadata': Number(summary['stable-missing-metadata'] || 0)
  };
}

function buildTopTierReadinessSignal(skillRecords, context = {}) {
  const topTierSummary = context.topTierSummary || summarizeStableTopTierBlockers(skillRecords, context);
  const topTierPortfolio = context.topTierPortfolio || buildStableTopTierPortfolio(skillRecords, context);
  const executionFocus = context.topTierExecutionFocus || buildStableTopTierExecutionFocus(topTierPortfolio);
  const counts = topTierSummary && topTierSummary.counts ? topTierSummary.counts : {};
  const blockedSkills = topTierSummary && topTierSummary.blockersBySkill instanceof Map
    ? [...topTierSummary.blockersBySkill.values()].filter((blockers) => Array.isArray(blockers) && blockers.length > 0).length
    : 0;
  const stableSkills = (Array.isArray(skillRecords) ? skillRecords : []).filter((record) => record && record.status === 'stable').length;
  const portfolioSummary = topTierPortfolio && topTierPortfolio.summary ? topTierPortfolio.summary : {};

  return {
    status: blockedSkills > 0 ? 'attention' : 'ready',
    'stable-skills': stableSkills,
    'blocked-stable-skills': blockedSkills,
    'ready-stable-skills': Number(portfolioSummary.ready || 0),
    priorities: {
      critical: Number((portfolioSummary.priorities || {}).critical || 0),
      high: Number((portfolioSummary.priorities || {}).high || 0),
      normal: Number((portfolioSummary.priorities || {}).normal || 0),
      clear: Number((portfolioSummary.priorities || {}).clear || 0)
    },
    'execution-focus': executionFocus,
    ...Object.fromEntries(
      STABLE_TOP_TIER_BLOCKER_FIELDS.map((field) => [field, Number(counts[field] || 0)])
    )
  };
}

function buildInvestmentBacklogSignal(backlog) {
  const summary = backlog && backlog.summary ? backlog.summary : {};
  const critical = Number(summary.critical || 0);
  const high = Number(summary.high || 0);
  return {
    status: critical > 0 ? 'blocked' : high > 0 ? 'attention' : 'ready',
    total: Number(summary.total || 0),
    critical,
    high,
    normal: Number(summary.normal || 0)
  };
}

function buildHostWriteabilitySignal(bundleRoot) {
  const probes = collectGeneratedArtifactWriteability(bundleRoot);
  const skillCreateProbe = probeDirectoryCreateAccess(path.join(bundleRoot, 'skills', 'domains', `__create-probe__-${Date.now()}`));
  const failed = probes.filter((probe) => probe.ok !== true);
  const counts = {
    critical: 0,
    high: 0,
    normal: 0
  };

  const artifacts = failed.map((probe) => ({
    id: probe.id,
    label: probe.label,
    mode: probe.mode,
    code: probe.code || 'UNKNOWN'
  }));
  for (const probe of failed) {
    counts[getHostWriteabilitySeverity(probe.id)] += 1;
  }
  if (!skillCreateProbe.ok) {
    artifacts.push({
      id: AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id,
      label: AUTHORITATIVE_SKILL_TREE_CONSTRAINT.label,
      mode: AUTHORITATIVE_SKILL_TREE_CONSTRAINT.mode,
      code: skillCreateProbe.code || 'UNKNOWN'
    });
    counts[getHostWriteabilitySeverity(AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id)] += 1;
  }

  return {
    status: counts.critical > 0 ? 'blocked' : artifacts.length > 0 ? 'attention' : 'ready',
    total: probes.length + 1,
    writable: (probes.length - failed.length) + (skillCreateProbe.ok ? 1 : 0),
    blocked: artifacts.length,
    critical: counts.critical,
    high: counts.high,
    normal: counts.normal,
    artifacts
  };
}

function buildExpertSourceFamiliesSignal(scorecard) {
  const summary = isPlainObject(scorecard && scorecard.summary) ? scorecard.summary : {};
  const activeFamilies = Number(summary['active-families'] || 0);
  const parseErrors = Number(summary['active-families-with-parse-errors'] || 0);
  const unmapped = Number(summary['active-unmapped-raw-sources'] || 0);
  const stale = Number(summary['active-stale-mapped-sources'] || 0);
  const missingIncludes = Number(summary['active-missing-pack-includes'] || 0);
  const status = parseErrors > 0
    ? 'blocked'
    : (unmapped > 0 || stale > 0 || missingIncludes > 0)
      ? 'attention'
      : 'ready';

  return {
    status,
    'total-families': Number(summary['total-families'] || 0),
    'active-families': activeFamilies,
    'archived-families': Number(summary['archived-families'] || 0),
    'active-parse-errors': parseErrors,
    'active-unmapped-raw-sources': unmapped,
    'active-stale-mapped-sources': stale,
    'active-missing-pack-includes': missingIncludes
  };
}

function buildHostSmokeSignal(scorecard, policyEntries) {
  const scorecardSummary = isPlainObject(scorecard && scorecard.summary) ? scorecard.summary : {};
  const governance = isPlainObject(scorecardSummary['governance-status']) ? scorecardSummary['governance-status'] : {};
  const evidence = isPlainObject(scorecardSummary['evidence-status']) ? scorecardSummary['evidence-status'] : {};
  const policySummary = summarizeHostSmokePolicy(policyEntries);
  const status = classifyReadinessStatus([
    policySummary.statuses.blocked > 0 ? 'blocked' : null,
    policySummary.statuses.attention > 0 ? 'attention' : null
  ].filter(Boolean));

  return {
    status: status || 'ready',
    host_smoke_capable_skills: Number(scorecardSummary['host-smoke-capable-skills'] || 0),
    satisfied: Number(governance.satisfied || 0),
    passing: Number(evidence.passing || 0),
    missing: Number(evidence.missing || 0),
    failing: Number(evidence.failing || 0),
    stale: Number(evidence.stale || 0),
    contract_drift: Number(evidence['contract-drift'] || 0),
    policy: policySummary
  };
}

function buildSystemReadiness(bundleRoot, context = {}) {
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  const skillRecords = Array.isArray(context.skillRecords) ? context.skillRecords : [];
  const runtimeProofs = dedupeRuntimeProofEntries(context.runtimeProofs, { prefer: 'first' });
  const routeFixtures = Array.isArray(context.routeFixtures) ? context.routeFixtures : [];
  const hostSmokeProofs = Array.isArray(context.hostSmokeProofs)
    ? context.hostSmokeProofs
    : runtimeProofs.filter((proof) => proof && proof['host-smoke']);
  const reviewQueue = context.reviewQueue || buildReviewQueue(bundleRoot, skillRecords, { now });
  const investmentBacklog = context.investmentBacklog || parseJsonFile(getSkillInvestmentBacklogPath(bundleRoot)).data || { summary: { total: 0, critical: 0, high: 0, normal: 0 } };
  const expertSourceFamilyScorecard = context.expertSourceFamilyScorecard
    || buildExpertSourceFamilyScorecard(bundleRoot, context.registryData || {}, { now });

  const scorecard = context.hostSmokeScorecard || buildHostSmokeScorecard(bundleRoot, hostSmokeProofs, { now });
  const policyEntries = normalizeHostSmokePolicyEntries(scorecard, runtimeProofs, skillRecords);
  const liveScriptedSkills = countLiveScriptedSkills(skillRecords);
  const topTierSummary = context.topTierSummary || summarizeStableTopTierBlockers(skillRecords, {
    ...context,
    bundleRoot,
    runtimeProofData: { proofs: runtimeProofs },
    routeFixturesData: { cases: routeFixtures },
    reviewQueueData: reviewQueue,
    hostSmokeScorecardData: scorecard,
    ratingsData: context.ratingsData,
    registryData: context.registryData
  });
  const topTierPortfolio = context.topTierPortfolio || buildStableTopTierPortfolio(skillRecords, {
    ...context,
    bundleRoot,
    skillRecords,
    runtimeProofData: { proofs: runtimeProofs },
    routeFixturesData: { cases: routeFixtures },
    reviewQueueData: reviewQueue,
    hostSmokeScorecardData: scorecard,
    ratingsData: context.ratingsData,
    registryData: context.registryData
  });
  const topTierExecutionFocus = context.topTierExecutionFocus || buildStableTopTierExecutionFocus(topTierPortfolio);

  const benchmarkSignal = buildBenchmarkSignal(bundleRoot);
  const routeEvidenceSignal = buildRouteEvidenceSignal(skillRecords, routeFixtures);
  const runtimeProofSignal = buildRuntimeProofSignal(runtimeProofs, liveScriptedSkills);
  const hostSmokeSignal = buildHostSmokeSignal(scorecard, policyEntries);
  const topTierReadinessSignal = buildTopTierReadinessSignal(skillRecords, {
    ...context,
    topTierSummary,
    topTierPortfolio,
    topTierExecutionFocus
  });
  const reviewCadenceSignal = buildReviewCadenceSignal(reviewQueue);
  const investmentBacklogSignal = buildInvestmentBacklogSignal(investmentBacklog);
  const expertSourceFamiliesSignal = buildExpertSourceFamiliesSignal(expertSourceFamilyScorecard);
  const hostWriteabilitySignal = buildHostWriteabilitySignal(bundleRoot);
  const overallStatus = classifyReadinessStatus([
    benchmarkSignal.status,
    routeEvidenceSignal.status,
    runtimeProofSignal.status,
    hostSmokeSignal.status,
    topTierReadinessSignal.status,
    reviewCadenceSignal.status,
    investmentBacklogSignal.status,
    expertSourceFamiliesSignal.status,
    hostWriteabilitySignal.status
  ]);

  return {
    'schema-version': SYSTEM_READINESS_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: {
      'benchmark-summary': portablePath(bundleRoot, getBenchmarkSummaryPath(bundleRoot)),
      'host-smoke-scorecard': portablePath(bundleRoot, getHostSmokeScorecardPath(bundleRoot)),
      'runtime-proof': getGovernanceArtifactRelativePath('runtime-proof'),
      'route-fixtures': getGovernanceArtifactRelativePath('route-fixtures'),
      'review-queue': portablePath(bundleRoot, getReviewQueueGeneratedPath(bundleRoot)),
      'skill-opportunity-queue': getGovernanceArtifactRelativePath('skill-opportunity-queue'),
      'expert-source-family-scorecard': portablePath(bundleRoot, getExpertSourceFamilyScorecardPath(bundleRoot)),
      'pending-scaffolds': portablePath(bundleRoot, getPendingScaffoldRegistryPath(bundleRoot)),
      'skill-investment-backlog': portablePath(bundleRoot, getSkillInvestmentBacklogPath(bundleRoot))
    },
    status: overallStatus,
    signals: {
      benchmark: benchmarkSignal,
      'route-evidence': routeEvidenceSignal,
      'runtime-proof': runtimeProofSignal,
      'host-smoke': hostSmokeSignal,
      'top-tier-readiness': topTierReadinessSignal,
      'review-cadence': reviewCadenceSignal,
      'investment-backlog': investmentBacklogSignal,
      'expert-source-families': expertSourceFamiliesSignal,
      'host-writeability': hostWriteabilitySignal
    },
    'host-smoke-policy': policyEntries,
    summary: {
      'live-scripted-skills': liveScriptedSkills,
      'stable-user-invocable-skills': routeEvidenceSignal.stable_skills,
      'route-evidence-covered-skills': routeEvidenceSignal.covered_skills,
      'runtime-proof-entries': runtimeProofSignal.runtime_proof_entries,
      'host-smoke-capable-skills': hostSmokeSignal.host_smoke_capable_skills,
      'stable-top-tier-blocked-skills': topTierReadinessSignal['blocked-stable-skills'],
      'stable-top-tier-ready-skills': Number(topTierReadinessSignal['ready-stable-skills'] || 0),
      'stable-top-tier-critical-skills': Number((topTierReadinessSignal.priorities || {}).critical || 0),
      'stable-top-tier-high-skills': Number((topTierReadinessSignal.priorities || {}).high || 0),
      'stable-top-tier-normal-skills': Number((topTierReadinessSignal.priorities || {}).normal || 0),
      'stable-top-tier-clear-skills': Number((topTierReadinessSignal.priorities || {}).clear || 0),
      'stable-top-tier-next-wave-size': Number((topTierReadinessSignal['execution-focus'] || {})['next-wave-size'] || 0),
      ...Object.fromEntries(
        STABLE_TOP_TIER_BLOCKER_FIELDS.map((field) => [field, Number(topTierReadinessSignal[field] || 0)])
      ),
      'review-governed-skills': reviewCadenceSignal['governed-skills'],
      'review-overdue-skills': reviewCadenceSignal.overdue,
      'review-due-soon-skills': reviewCadenceSignal['due-soon'],
      'review-missing-metadata-skills': reviewCadenceSignal['missing-metadata'],
      'investment-backlog-items': Number((investmentBacklogSignal && investmentBacklogSignal.total) || 0),
      'investment-backlog-critical': Number((investmentBacklogSignal && investmentBacklogSignal.critical) || 0),
      'investment-backlog-high': Number((investmentBacklogSignal && investmentBacklogSignal.high) || 0),
      'active-expert-source-families': Number((expertSourceFamiliesSignal && expertSourceFamiliesSignal['active-families']) || 0),
      'active-expert-source-unmapped-raw-sources': Number((expertSourceFamiliesSignal && expertSourceFamiliesSignal['active-unmapped-raw-sources']) || 0),
      'host-writeability-blocked-artifacts': Number((hostWriteabilitySignal && hostWriteabilitySignal.blocked) || 0)
    },
    notes: [
      'Generated from benchmark summary, route fixtures, runtime proof registry, host-smoke scorecard, review queue, skill opportunity queue, expert-source family scorecard, pending scaffold registry, and skill investment backlog.',
      'Host-smoke policy is sourced from runtime-proof governance metadata generated from authoritative skill frontmatter.',
      'Top-tier readiness is sourced from the same centralized stable-skill blocker taxonomy and prioritized portfolio view that drive capability-ratings and assess-top-tier.',
      'Generated artifact writeability is tracked separately so host-level execution constraints do not get mistaken for skill-content defects.'
    ]
  };
}

function writeSystemReadiness(bundleRoot, context = {}) {
  const baseContext = collectSystemReadinessContext(bundleRoot);
  const mergedContext = {
    ...baseContext,
    ...context
  };
  const payload = buildSystemReadiness(bundleRoot, mergedContext);
  const file = getSystemReadinessPath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const hostEvolution = writeHostEvolution(bundleRoot, {
    ...mergedContext,
    report: buildHostEvolutionReport(bundleRoot, mergedContext)
  });
  return {
    file,
    payload,
    hostEvolution
  };
}

function writeHostEvolution(bundleRoot, context = {}) {
  const payload = context.report || buildHostEvolutionReport(bundleRoot, context);
  const file = getHostEvolutionGeneratedPath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateBenchmarkSummary(bundleRoot, findings) {
  const summaryPath = getBenchmarkSummaryPath(bundleRoot);
  const parsed = parseJsonFile(summaryPath);
  if (parsed.error) {
    findings.push({
      severity: 'warning',
      file: portablePath(bundleRoot, summaryPath),
      message: `benchmark summary parse failed: ${parsed.error}`
    });
    return { data: null, path: summaryPath };
  }

  const data = parsed.data || {};
  if (data.schema_version !== 2) {
    findings.push({
      severity: 'error',
      file: portablePath(bundleRoot, summaryPath),
      message: `benchmark summary has unsupported schema_version '${data.schema_version}'`
    });
  }

  return { data, path: summaryPath };
}

function validateSystemReadiness(bundleRoot, findings, context = {}) {
  const schemaPath = getSystemReadinessSchemaPath(bundleRoot);
  const schema = parseJsonFile(schemaPath);
  if (schema.error) {
    findings.push({
      severity: 'warning',
      file: portablePath(bundleRoot, schemaPath),
      message: `system readiness schema parse failed: ${schema.error}`
    });
  }

  const readinessPath = getSystemReadinessPath(bundleRoot);
  const parsed = parseJsonFile(readinessPath);
  if (parsed.error) {
    findings.push({
      severity: 'warning',
      file: portablePath(bundleRoot, readinessPath),
      message: `system readiness parse failed: ${parsed.error}`
    });
    return;
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(String(actual['generated-at'] || '').trim());
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildSystemReadiness(bundleRoot, {
    ...context,
    now
  });

  if (actual['schema-version'] !== expected['schema-version']) {
    findings.push({
      severity: 'error',
      file: portablePath(bundleRoot, readinessPath),
      message: `system readiness has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(readinessPath, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: portablePath(bundleRoot, readinessPath),
      message: probe.ok
        ? 'system readiness is out of sync with benchmark summary, route evidence, runtime proof, host-smoke state, top-tier readiness state, or review cadence state'
        : `system readiness is out of sync with benchmark summary, route evidence, runtime proof, host-smoke state, top-tier readiness state, or review cadence state, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }
}

function validateHostEvolution(bundleRoot, findings, context = {}) {
  const schemaPath = getHostEvolutionSchemaPath(bundleRoot);
  const schema = parseJsonFile(schemaPath);
  if (schema.error) {
    findings.push({
      severity: 'warning',
      file: portablePath(bundleRoot, schemaPath),
      message: `host evolution schema parse failed: ${schema.error}`
    });
  }

  const reportPath = getHostEvolutionGeneratedPath(bundleRoot);
  const parsed = parseJsonFile(reportPath);
  if (parsed.error) {
    findings.push({
      severity: 'warning',
      file: portablePath(bundleRoot, reportPath),
      message: `host evolution report parse failed: ${parsed.error}`
    });
    return;
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(String(actual['generated-at'] || '').trim());
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildHostEvolutionReport(bundleRoot, {
    ...context,
    now
  });

  if (actual['schema-version'] !== expected['schema-version']) {
    findings.push({
      severity: 'error',
      file: portablePath(bundleRoot, reportPath),
      message: `host evolution report has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(reportPath, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: portablePath(bundleRoot, reportPath),
      message: probe.ok
        ? 'host evolution report is out of sync with live host constraints, backlog debt, or pending scaffold state'
        : `host evolution report is out of sync with live host constraints, backlog debt, or pending scaffold state, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }
}

function validateReviewCadence(bundleRoot, findings, context = {}) {
  return validateReviewQueue(bundleRoot, context.skillRecords || [], findings, context);
}

module.exports = {
  SYSTEM_READINESS_SCHEMA_VERSION,
  SYSTEM_READINESS_STATUS_ORDER,
  SYSTEM_READINESS_SIGNAL_ORDER,
  SYSTEM_READINESS_HOST_SMOKE_SOURCE_KEYS,
  SYSTEM_READINESS_SUMMARY_KEYS,
  SYSTEM_READINESS_NOTES_MIN_ITEMS,
  SYSTEM_READINESS_BENCHMARK_SUMMARY_STATUS_ORDER,
  getBenchmarkSummaryPath,
  getBenchmarkSummarySchemaPath,
  getSystemReadinessPath,
  getSystemReadinessSchemaPath,
  getHostEvolutionGeneratedPath,
  getHostEvolutionSchemaPath,
  getReviewQueueGeneratedPath,
  determineHostSmokePolicyExpectation,
  normalizeHostSmokePolicyEntries,
  buildSystemReadiness,
  buildHostEvolutionReport,
  collectSystemReadinessContext,
  writeSystemReadiness,
  writeHostEvolution,
  validateBenchmarkSummary,
  validateSystemReadiness,
  validateHostEvolution,
  validateReviewCadence
};
