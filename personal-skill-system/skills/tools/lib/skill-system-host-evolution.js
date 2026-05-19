'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  collectGeneratedArtifactWriteability,
  probeArtifactWriteAccess,
  probeDirectoryCreateAccess
} = require('./skill-system-common');
const {
  getGovernanceArtifactPath
} = require('./skill-generated-artifact-governance');
const {
  getAdmissionLedgerPath,
  readAdmissionLedger
} = require('./skill-ledger-governance');
const {
  getPendingScaffoldRegistryPath,
  normalizePendingScaffoldStatus,
  ACTIVE_PENDING_SCAFFOLD_STATUSES
} = require('./skill-pending-scaffold-governance');
const {
  isBlockingAdmissionStatus
} = require('./skill-future-governance');
const { getSkillInvestmentBacklogPath } = require('./skill-investment-governance');
const {
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_ARTIFACT_PATHS,
  findDerivedGovernanceRefreshStepByArtifactId
} = require('./skill-system-derived-governance-contract');
const {
  getHostWriteabilitySeverity,
  AUTHORITATIVE_SKILL_TREE_CONSTRAINT
} = require('./skill-host-governance');
const {
  buildStableTopTierExecutionFocusFromUpgradeBoard
} = require('./skill-top-tier-governance');

const HOST_EVOLUTION_SCHEMA_VERSION = 1;
const HOST_EVOLUTION_CAPABILITY_VALUE_ORDER = Object.freeze(['available', 'degraded', 'blocked']);
const HOST_EVOLUTION_NOTES_MIN_ITEMS = 1;

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueSorted(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function uniqueOrdered(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonOrFallback(file, fallback) {
  const parsed = parseJsonFile(file);
  return parsed.error ? fallback : (parsed.data || fallback);
}

function getHostEvolutionPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'host-evolution');
}

function getHostEvolutionSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'host-evolution.schema.json');
}

function getSystemReadinessPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'system-readiness');
}

function toPortablePath(bundleRoot, targetPath) {
  return rel(bundleRoot, targetPath);
}

function getDirectoryCreateConstraint(bundleRoot, targetDir, actionLabel) {
  const resolvedPath = path.resolve(targetDir);
  const parentDir = path.dirname(resolvedPath);
  const writeProbe = probeArtifactWriteAccess(path.join(parentDir, '.codex-write-probe.tmp'), { mode: 'create-file' });
  if (!writeProbe.ok) {
    return {
      type: 'parent-write-blocked',
      mode: 'create-file',
      path: resolvedPath,
      parent: parentDir,
      code: writeProbe.code || 'UNKNOWN',
      message: `cannot ${actionLabel} because the authoritative skill tree parent is not writable on this host: ${toPortablePath(bundleRoot, parentDir)} (${writeProbe.code || 'UNKNOWN'})`
    };
  }
  const createProbe = probeDirectoryCreateAccess(resolvedPath);
  if (createProbe.ok) {
    return null;
  }
  return {
    type: 'child-directory-blocked',
    mode: 'create-child-directory',
    path: resolvedPath,
    parent: parentDir,
    code: createProbe.code || 'UNKNOWN',
    message: `cannot ${actionLabel} because the authoritative skill tree cannot create child directories on this host: ${toPortablePath(bundleRoot, parentDir)} (${createProbe.code || 'UNKNOWN'})`
  };
}

function readCurrentSystemReadiness(bundleRoot) {
  const readinessPath = getSystemReadinessPath(bundleRoot);
  if (!fs.existsSync(readinessPath)) {
    return null;
  }
  return readJsonOrFallback(readinessPath, null);
}

function readCurrentSkillInvestmentBacklog(bundleRoot) {
  return readJsonOrFallback(getSkillInvestmentBacklogPath(bundleRoot), {
    items: [],
    summary: {
      total: 0,
      critical: 0,
      high: 0,
      normal: 0
    }
  });
}

function readPendingScaffoldRegistry(bundleRoot) {
  return readJsonOrFallback(getPendingScaffoldRegistryPath(bundleRoot), {
    entries: [],
    summary: {
      total: 0,
      active: 0,
      planned: 0,
      'in-progress': 0,
      blocked: 0,
      deferred: 0
    }
  });
}

function buildBlockedArtifactConstraints(bundleRoot) {
  return collectGeneratedArtifactWriteability(bundleRoot)
    .filter((probe) => probe.ok !== true)
    .map((probe) => {
      const refreshStep = findDerivedGovernanceRefreshStepByArtifactId(probe.id);
      return {
        id: probe.id,
        label: probe.label,
        mode: probe.mode,
        code: probe.code || 'UNKNOWN',
        path: toPortablePath(bundleRoot, probe.path),
        severity: getHostWriteabilitySeverity(probe.id),
        ...(refreshStep ? {
          'refresh-step': {
            id: refreshStep.id,
            order: refreshStep.order,
            label: refreshStep.label
          }
        } : {})
      };
    });
}

function buildPendingScaffoldEntries(bundleRoot, registry) {
  return (Array.isArray(registry && registry.entries) ? registry.entries : [])
    .filter((entry) => ACTIVE_PENDING_SCAFFOLD_STATUSES.has(normalizePendingScaffoldStatus(entry && entry.status)))
    .map((entry) => ({
      'pending-id': normalizeString(entry && entry['pending-id']),
      skill: normalizeString(entry && entry.skill),
      kind: normalizeString(entry && entry.kind),
      status: normalizePendingScaffoldStatus(entry && entry.status),
      'request-id': normalizeString(entry && entry['request-id']) || null,
      'opportunity-id': normalizeString(entry && entry['opportunity-id']) || null,
      note: normalizeString(entry && entry.note) || null,
      'host-constraint': isPlainObject(entry && entry['host-constraint']) ? cloneJson(entry['host-constraint']) : null,
      'rerun-command': normalizeString(entry && entry['rerun-command']) || null
    }));
}

function buildBlockedAdmissions(admissionLedger, pendingScaffolds) {
  const pendingByRequestId = new Map(
    pendingScaffolds
      .filter((entry) => entry['request-id'])
      .map((entry) => [entry['request-id'], entry])
  );

  return (Array.isArray(admissionLedger && admissionLedger.entries) ? admissionLedger.entries : [])
    .filter((entry) => isBlockingAdmissionStatus(entry && entry.status))
    .map((entry) => {
      const requestId = normalizeString(entry && entry['request-id']);
      const linkedPending = pendingByRequestId.get(requestId) || null;
      return {
        'request-id': requestId,
        request: normalizeString(entry && entry.request),
        status: normalizeString(entry && entry.status),
        note: normalizeString(entry && entry.note) || null,
        'suggested-kind': normalizeString(entry && entry['suggested-kind']) || null,
        ...(linkedPending ? {
          'linked-pending-scaffold': {
            'pending-id': linkedPending['pending-id'],
            skill: linkedPending.skill,
            kind: linkedPending.kind,
            status: linkedPending.status
          }
        } : {})
      };
    });
}

function normalizeTopTierExecutionFocus(value) {
  if (!isPlainObject(value)) {
    return {
      blocked: 0,
      'next-wave': [],
      'next-wave-size': 0,
      'current-priority-lane': null,
      'current-blocker-family': null,
      follow_up: []
    };
  }

  return {
    blocked: Number(value.blocked || 0),
    'next-wave': uniqueOrdered(value['next-wave']),
    'next-wave-size': Number(value['next-wave-size'] || 0),
    'current-priority-lane': isPlainObject(value['current-priority-lane']) ? cloneJson(value['current-priority-lane']) : null,
    'current-blocker-family': isPlainObject(value['current-blocker-family']) ? cloneJson(value['current-blocker-family']) : null,
    follow_up: uniqueOrdered(value.follow_up)
  };
}

function deriveTopTierExecutionFocus(readiness, backlog) {
  const signal = readiness && readiness.signals && readiness.signals['top-tier-readiness'];
  if (isPlainObject(signal && signal['execution-focus'])) {
    return normalizeTopTierExecutionFocus(signal['execution-focus']);
  }

  const backlogBoard = backlog
    && backlog['top-tier-portfolio']
    && backlog['top-tier-portfolio']['upgrade-board'];

  return normalizeTopTierExecutionFocus(
    buildStableTopTierExecutionFocusFromUpgradeBoard(backlogBoard || {})
  );
}

function buildFollowUp(activeConstraints, pendingScaffolds, blockedAdmissions, hostWriteabilityDebt, topTierExecutionFocus) {
  const followUp = [];
  const blockedDerivedArtifactIds = DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS.filter((artifactId) =>
    activeConstraints.some((item) => item.id === artifactId)
  );

  if (pendingScaffolds.length > 0) {
    followUp.push('node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds');
    const candidate = pendingScaffolds.find((entry) => entry.skill) || pendingScaffolds[0];
    if (candidate && activeConstraints.every((entry) => entry.id !== AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id)) {
      followUp.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold ${candidate.skill}`);
    }
  }
  if (blockedAdmissions.length > 0) {
    followUp.push('node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --status blocked');
  }
  if (hostWriteabilityDebt.length > 0 || activeConstraints.length > 0) {
    followUp.push('node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source host-writeability');
  }
  if (blockedDerivedArtifactIds.length > 0) {
    followUp.push('node personal-skill-system/skills/tools/manage-skill/scripts/run.js export-derived-governance');
  }
  if (activeConstraints.some((item) => item.id === 'system-readiness') || hostWriteabilityDebt.some((item) => normalizeString(item.id) === 'host-writeability-system-readiness')) {
    followUp.push('npm run verify:skill-system');
  }
  if (
    activeConstraints.length < 1
    && hostWriteabilityDebt.length < 1
    && pendingScaffolds.length < 1
    && blockedAdmissions.length < 1
    && Number(topTierExecutionFocus && topTierExecutionFocus.blocked || 0) > 0
  ) {
    for (const command of uniqueSorted(topTierExecutionFocus.follow_up)) {
      followUp.push(command);
    }
  }
  if (followUp.length < 1) {
    followUp.push('node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier manage-skill');
  }

  return uniqueSorted(followUp);
}

function buildHostEvolutionReport(bundleRoot, context = {}) {
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  const readiness = context.readiness === undefined ? readCurrentSystemReadiness(bundleRoot) : context.readiness;
  const backlog = context.backlog || readCurrentSkillInvestmentBacklog(bundleRoot);
  const pendingRegistry = context.pendingScaffoldRegistry || readPendingScaffoldRegistry(bundleRoot);
  const admissionLedger = context.admissionLedger || readAdmissionLedger(bundleRoot);
  const readinessHostWriteability = readiness && readiness.signals
    ? readiness.signals['host-writeability']
    : null;
  const topTierExecutionFocus = normalizeTopTierExecutionFocus(
    context.topTierExecutionFocus || deriveTopTierExecutionFocus(readiness, backlog)
  );
  const hostWriteabilityDebt = (Array.isArray(backlog && backlog.items) ? backlog.items : [])
    .filter((item) => normalizeString(item && item.source) === 'host-writeability');

  const blockedArtifacts = buildBlockedArtifactConstraints(bundleRoot);
  const createConstraint = getDirectoryCreateConstraint(
    bundleRoot,
    path.join(bundleRoot, 'skills', 'domains', `__create-probe__-${Date.now()}`),
    'create new governed skill'
  );
  const createSkillCapability = createConstraint ? 'blocked' : 'available';
  const activeConstraints = [...blockedArtifacts];
  if (createConstraint) {
    activeConstraints.push({
      id: AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id,
      label: AUTHORITATIVE_SKILL_TREE_CONSTRAINT.label,
      mode: AUTHORITATIVE_SKILL_TREE_CONSTRAINT.mode,
      code: createConstraint.code || 'UNKNOWN',
      path: toPortablePath(bundleRoot, createConstraint.parent),
      severity: getHostWriteabilitySeverity(AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id),
      message: createConstraint.message
    });
  }

  const pendingScaffolds = buildPendingScaffoldEntries(bundleRoot, pendingRegistry);
  const blockedAdmissions = buildBlockedAdmissions(admissionLedger, pendingScaffolds);
  const hasCriticalWriteabilityBlocker = activeConstraints.some((item) => item.severity === 'critical');
  const hasBlockedWork = pendingScaffolds.some((entry) => entry.status === 'blocked') || blockedAdmissions.length > 0;
  const status = hasCriticalWriteabilityBlocker || hasBlockedWork
    ? 'blocked'
    : activeConstraints.length > 0 || hostWriteabilityDebt.length > 0
      ? 'attention'
      : 'ready';
  const generatedGovernanceCapability = blockedArtifacts.length < 1
    ? 'available'
    : hasCriticalWriteabilityBlocker
      ? 'blocked'
      : 'degraded';
  const followUp = buildFollowUp(activeConstraints, pendingScaffolds, blockedAdmissions, hostWriteabilityDebt, topTierExecutionFocus);

  return {
    'schema-version': HOST_EVOLUTION_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: {
      'system-readiness': toPortablePath(bundleRoot, getSystemReadinessPath(bundleRoot)),
      'skill-investment-backlog': toPortablePath(bundleRoot, getSkillInvestmentBacklogPath(bundleRoot)),
      'pending-scaffolds': toPortablePath(bundleRoot, getPendingScaffoldRegistryPath(bundleRoot)),
      'admission-ledger': toPortablePath(bundleRoot, getAdmissionLedgerPath(bundleRoot))
    },
    status,
    capabilities: {
      'create-authoritative-skill': createSkillCapability,
      'materialize-pending-scaffold': pendingScaffolds.length > 0
        ? createSkillCapability
        : 'idle',
      'rewrite-generated-governance': generatedGovernanceCapability
    },
    summary: {
      'active-constraints': activeConstraints.length,
      'blocked-governance-artifacts': blockedArtifacts.length,
      'pending-scaffolds': pendingScaffolds.length,
      'blocked-admissions': blockedAdmissions.length,
      'host-writeability-backlog-items': hostWriteabilityDebt.length,
      'top-tier-next-wave-size': Number(topTierExecutionFocus['next-wave-size'] || 0),
      'top-tier-blocked-stable-skills': Number(topTierExecutionFocus.blocked || 0)
    },
    'active-constraints': activeConstraints,
    'pending-scaffolds': pendingScaffolds,
    'blocked-admissions': blockedAdmissions,
    'host-writeability-debt': hostWriteabilityDebt,
    'top-tier-execution-focus': topTierExecutionFocus,
    readiness: readiness ? {
      status: normalizeString(readiness.status) || null,
      'generated-at': normalizeString(readiness['generated-at']) || null,
      'host-writeability': readinessHostWriteability || null,
      'top-tier-execution-focus': topTierExecutionFocus
    } : null,
    follow_up: followUp,
    notes: [
      'Generated from the current backlog, pending-scaffold registry, admission ledger, and live writeability probes.',
      'This artifact is host-specific recovery guidance for self-evolution, not a substitute for registry/backlog validation.',
      'Use it to understand whether future skill creation or generated-governance refreshes are blocked on the current runtime.',
      `When derived benchmark artifacts are blocked, export ${DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS.map((artifactId) => DERIVED_GOVERNANCE_ARTIFACT_PATHS[artifactId]).join(' and ')} through the governed export path before syncing them back via distribution.`
    ]
  };
}

function writeHostEvolutionReport(bundleRoot, context = {}) {
  const payload = context.report || buildHostEvolutionReport(bundleRoot, context);
  const file = getHostEvolutionPath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateHostEvolutionReport(bundleRoot, findings, context = {}) {
  const schemaPath = getHostEvolutionSchemaPath(bundleRoot);
  const schema = parseJsonFile(schemaPath);
  if (schema.error) {
    findings.push({
      severity: 'warning',
      file: rel(bundleRoot, schemaPath),
      message: `host evolution schema parse failed: ${schema.error}`
    });
  }

  const file = getHostEvolutionPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'warning',
      file: rel(bundleRoot, file),
      message: `host evolution report parse failed: ${parsed.error}`
    });
    return null;
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(normalizeString(actual['generated-at']));
  const expected = buildHostEvolutionReport(bundleRoot, {
    ...context,
    now: Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime()
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (actual['schema-version'] !== HOST_EVOLUTION_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `host evolution report has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'host evolution report is out of sync with live host constraints, backlog debt, or pending scaffold state'
        : `host evolution report is out of sync with live host constraints, backlog debt, or pending scaffold state, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  return expected;
}

module.exports = {
  HOST_EVOLUTION_SCHEMA_VERSION,
  HOST_EVOLUTION_CAPABILITY_VALUE_ORDER,
  HOST_EVOLUTION_NOTES_MIN_ITEMS,
  getHostEvolutionPath,
  getHostEvolutionSchemaPath,
  buildHostEvolutionReport,
  writeHostEvolutionReport,
  validateHostEvolutionReport
};
