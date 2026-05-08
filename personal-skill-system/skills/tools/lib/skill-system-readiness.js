'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile, probeArtifactWriteAccess } = require('./skill-system-common');
const { collectSkillRecords } = require('./skill-system-skills');
const {
  getHostSmokeScorecardPath,
  buildHostSmokeScorecard
} = require('./skill-system-host-smoke');
const {
  isGovernedRuntimeProofRecord,
  normalizeHostSmokePolicy,
  deriveHostSmokePolicyFromRecord
} = require('./skill-system-governance');

const SYSTEM_READINESS_SCHEMA_VERSION = 1;
const HOST_SMOKE_POLICY_TIERS = new Set(['critical', 'standard', 'experimental']);
const SYSTEM_READINESS_STATUSES = new Set(['ready', 'attention', 'blocked']);

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
  return path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json');
}

function getSystemReadinessSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'system-readiness.schema.json');
}

function getRuntimeProofPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'runtime-proof.generated.json');
}

function getRouteFixturesPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'route-fixtures.generated.json');
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
    runtimeProofs: readArrayField(getRuntimeProofPath(bundleRoot), 'proofs'),
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
    && record.userInvocable
    && record.kind !== 'router'
    && record.kind !== 'adapter'
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
  const count = Array.isArray(runtimeProofs) ? runtimeProofs.length : 0;
  return {
    status: count === liveScriptedSkills ? 'ready' : 'attention',
    live_scripted_skills: liveScriptedSkills,
    runtime_proof_entries: count
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
  const runtimeProofs = Array.isArray(context.runtimeProofs) ? context.runtimeProofs : [];
  const routeFixtures = Array.isArray(context.routeFixtures) ? context.routeFixtures : [];
  const hostSmokeProofs = Array.isArray(context.hostSmokeProofs)
    ? context.hostSmokeProofs
    : runtimeProofs.filter((proof) => proof && proof['host-smoke']);

  const scorecard = context.hostSmokeScorecard || buildHostSmokeScorecard(bundleRoot, hostSmokeProofs, { now });
  const policyEntries = normalizeHostSmokePolicyEntries(scorecard, runtimeProofs, skillRecords);
  const liveScriptedSkills = countLiveScriptedSkills(skillRecords);

  const benchmarkSignal = buildBenchmarkSignal(bundleRoot);
  const routeEvidenceSignal = buildRouteEvidenceSignal(skillRecords, routeFixtures);
  const runtimeProofSignal = buildRuntimeProofSignal(runtimeProofs, liveScriptedSkills);
  const hostSmokeSignal = buildHostSmokeSignal(scorecard, policyEntries);
  const overallStatus = classifyReadinessStatus([
    benchmarkSignal.status,
    routeEvidenceSignal.status,
    runtimeProofSignal.status,
    hostSmokeSignal.status
  ]);

  return {
    'schema-version': SYSTEM_READINESS_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: {
      'benchmark-summary': portablePath(bundleRoot, getBenchmarkSummaryPath(bundleRoot)),
      'host-smoke-scorecard': portablePath(bundleRoot, getHostSmokeScorecardPath(bundleRoot)),
      'runtime-proof': 'registry/runtime-proof.generated.json',
      'route-fixtures': 'registry/route-fixtures.generated.json'
    },
    status: overallStatus,
    signals: {
      benchmark: benchmarkSignal,
      'route-evidence': routeEvidenceSignal,
      'runtime-proof': runtimeProofSignal,
      'host-smoke': hostSmokeSignal
    },
    'host-smoke-policy': policyEntries,
    summary: {
      'live-scripted-skills': liveScriptedSkills,
      'stable-user-invocable-skills': routeEvidenceSignal.stable_skills,
      'route-evidence-covered-skills': routeEvidenceSignal.covered_skills,
      'runtime-proof-entries': runtimeProofSignal.runtime_proof_entries,
      'host-smoke-capable-skills': hostSmokeSignal.host_smoke_capable_skills
    },
    notes: [
      'Generated from benchmark summary, route fixtures, runtime proof registry, and host-smoke scorecard.',
      'Host-smoke policy is sourced from runtime-proof governance metadata generated from authoritative skill frontmatter.'
    ]
  };
}

function writeSystemReadiness(bundleRoot, context = {}) {
  const baseContext = collectSystemReadinessContext(bundleRoot);
  const payload = buildSystemReadiness(bundleRoot, {
    ...baseContext,
    ...context
  });
  const file = getSystemReadinessPath(bundleRoot);
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
        ? 'system readiness is out of sync with benchmark summary, route evidence, runtime proof, or host-smoke state'
        : `system readiness is out of sync with benchmark summary, route evidence, runtime proof, or host-smoke state, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }
}

module.exports = {
  SYSTEM_READINESS_SCHEMA_VERSION,
  getBenchmarkSummaryPath,
  getBenchmarkSummarySchemaPath,
  getSystemReadinessPath,
  getSystemReadinessSchemaPath,
  determineHostSmokePolicyExpectation,
  normalizeHostSmokePolicyEntries,
  buildSystemReadiness,
  collectSystemReadinessContext,
  writeSystemReadiness,
  validateBenchmarkSummary,
  validateSystemReadiness
};
