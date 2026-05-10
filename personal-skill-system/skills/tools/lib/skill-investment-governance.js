'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  collectGeneratedArtifactWriteability,
  probeDirectoryCreateAccess
} = require('./skill-system-common');
const {
  getPendingScaffoldRegistryPath
} = require('./skill-pending-scaffold-governance');
const {
  getHostSmokeScorecardPath
} = require('./skill-system-host-smoke');
const {
  normalizeHostSmokePolicy
} = require('./skill-system-governance');

const SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION = 1;
const INVESTMENT_PRIORITIES = ['critical', 'high', 'normal'];
const INVESTMENT_ITEM_STATUSES = new Set([
  'open',
  'planned',
  'in-progress',
  'deferred',
  'blocked',
  'implemented',
  'cancelled',
  'resolved'
]);
const BACKLOG_SOURCES = new Set([
  'skill-opportunity-queue',
  'admission-ledger',
  'evolution-ledger',
  'review-queue',
  'scaffold-lineage',
  'pending-scaffolds',
  'top-tier-readiness',
  'proof-governance',
  'host-writeability'
]);

function normalizeOpportunityStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (['open', 'planned', 'in-progress', 'blocked', 'deferred', 'implemented', 'cancelled'].includes(normalized)) {
    return normalized;
  }
  return normalized || 'open';
}

function getSkillInvestmentBacklogPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'skill-investment-backlog.generated.json');
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeOpenItemStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(normalized)) {
    return normalized;
  }
  return 'open';
}

function uniqueSorted(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function readJsonOrFallback(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readHostSmokeScorecard(bundleRoot) {
  return readJsonOrFallback(getHostSmokeScorecardPath(bundleRoot), { skills: [], summary: {} });
}

function readRuntimeProofRegistry(bundleRoot) {
  return readJsonOrFallback(path.join(bundleRoot, 'registry', 'runtime-proof.generated.json'), { proofs: [] });
}

function readTemplateVersions(bundleRoot) {
  const templateRoot = path.join(bundleRoot, 'templates', 'skill');
  const versions = new Map();
  if (!fs.existsSync(templateRoot)) {
    return versions;
  }

  for (const entry of fs.readdirSync(templateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = path.join(templateRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      continue;
    }
    const text = fs.readFileSync(skillFile, 'utf8');
    const match = text.match(/^template-version:\s*(\d+)\s*$/m);
    if (!match) {
      continue;
    }
    versions.set(entry.name, Number(match[1]));
  }

  return versions;
}

function normalizeScaffoldVersion(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePriority(value) {
  const normalized = normalizeString(value).toLowerCase();
  return INVESTMENT_PRIORITIES.includes(normalized) ? normalized : 'normal';
}

function getReviewEntries(reviewQueueData) {
  if (Array.isArray(reviewQueueData && reviewQueueData.skills)) {
    return reviewQueueData.skills;
  }
  if (Array.isArray(reviewQueueData && reviewQueueData.entries)) {
    return reviewQueueData.entries;
  }
  return [];
}

function normalizeRouteFixtureEvidence(fixtures, skillName) {
  return (Array.isArray(fixtures) ? fixtures : []).some((fixture) => {
    const expect = normalizeString(fixture && fixture.expect).toLowerCase();
    if (expect === normalizeString(skillName).toLowerCase() && fixture && fixture.governed !== true) {
      return true;
    }
    const fallbackText = normalizeString(fixture && fixture['expect-fallback-question-contains']).toLowerCase();
    return fallbackText.includes(normalizeString(skillName).toLowerCase());
  });
}

function buildTopTierReadinessItems(bundleRoot, skillRecords, registryData, ratingsData, reviewQueueData, routeFixturesData) {
  const reviewEntries = getReviewEntries(reviewQueueData);
  const reviewBySkill = new Map(reviewEntries.map((entry) => [normalizeString(entry.skill), entry]));
  const fixtures = Array.isArray(routeFixturesData && routeFixturesData.cases) ? routeFixturesData.cases : [];
  const moduleGroups = Array.isArray(registryData && registryData['module-groups'])
    ? registryData['module-groups']
    : [];
  const topReady = new Set((((ratingsData || {})['rating-buckets'] || {})['top-ready']) || []);
  const strongButNotTop = new Set((((ratingsData || {})['rating-buckets'] || {})['strong-but-not-top']) || []);
  const templateVersions = readTemplateVersions(bundleRoot);
  const items = [];

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (normalizeString(record.status) !== 'stable') {
      continue;
    }
    if (normalizeString(record.kind) === 'adapter' || normalizeString(record.kind) === 'router') {
      continue;
    }

    const reasons = [];
    const reviewEntry = reviewBySkill.get(record.name) || null;
    const reviewStatus = normalizeString(reviewEntry && reviewEntry['review-status']);
    if (reviewStatus === 'overdue' || reviewStatus === 'missing-metadata') {
      reasons.push(`review:${reviewStatus}`);
    }

    if (record.userInvocable && !normalizeRouteFixtureEvidence(fixtures, record.name)) {
      reasons.push('route-evidence-missing');
    }

    const ownedModules = moduleGroups
      .filter((group) => normalizeString(group && group['host-skill']) === record.name)
      .flatMap((group) => Array.isArray(group.modules) ? group.modules : [])
      .map((module) => normalizeString(module && module.id))
      .filter(Boolean);
    const weakModules = ownedModules.filter((moduleId) => !topReady.has(moduleId));
    if (weakModules.length > 0) {
      const weakKinds = weakModules.map((moduleId) => {
        if (strongButNotTop.has(moduleId)) return `${moduleId}:strong-but-not-top`;
        return `${moduleId}:thin-or-unrated`;
      });
      reasons.push(`module-depth:${weakKinds.join(',')}`);
    }

    const scaffoldVersion = normalizeScaffoldVersion(record.scaffoldVersion);
    const templateVersion = templateVersions.get(record.kind) || null;
    if (templateVersion != null && scaffoldVersion != null && scaffoldVersion < templateVersion) {
      reasons.push(`scaffold-behind:v${scaffoldVersion}->v${templateVersion}`);
    }

    if (reasons.length < 1) {
      continue;
    }

    const priority = reasons.some((reason) => reason.startsWith('review:') || reason.startsWith('module-depth:'))
      ? 'high'
      : 'normal';
    items.push({
      id: `stable-gap-${record.name}`,
      category: 'top-tier-hardening',
      status: 'open',
      priority,
      source: 'top-tier-readiness',
      skill: record.name,
      kind: record.kind,
      summary: `Harden stable skill '${record.name}' until top-tier governance debt clears.`,
      reasons,
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
      ]
    });
  }

  return items;
}

function buildProofGovernanceItems(bundleRoot, skillRecords, runtimeProofData = {}, hostSmokeScorecardData = {}) {
  const proofEntries = Array.isArray(runtimeProofData && runtimeProofData.proofs) ? runtimeProofData.proofs : [];
  const proofBySkill = new Map(proofEntries.map((entry) => [normalizeString(entry && entry.skill), entry]));
  const hostSmokeEntries = Array.isArray(hostSmokeScorecardData && hostSmokeScorecardData.skills) ? hostSmokeScorecardData.skills : [];
  const hostSmokeBySkill = new Map(hostSmokeEntries.map((entry) => [normalizeString(entry && entry.skill), entry]));
  const items = [];

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (normalizeString(record.status) !== 'stable') {
      continue;
    }
    if (normalizeString(record.runtime) !== 'scripted') {
      continue;
    }

    const proofEntry = proofBySkill.get(record.name) || null;
    if (!proofEntry) {
      items.push({
        id: `proof-${record.name}-runtime-proof-missing`,
        category: 'proof-governance',
        status: 'open',
        priority: 'high',
        source: 'proof-governance',
        skill: record.name,
        kind: record.kind,
        summary: `Add governed runtime proof coverage for '${record.name}'.`,
        reasons: ['runtime-proof:missing'],
        follow_up: [
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof ${record.name}`,
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
        ]
      });
      continue;
    }

    const reasons = [];
    const policy = normalizeHostSmokePolicy(proofEntry['host-smoke-policy']);
    const evidenceTests = Array.isArray(proofEntry['evidence-tests']) ? proofEntry['evidence-tests'] : [];
    if (evidenceTests.length < 1) {
      reasons.push('evidence-tests:missing');
    }
    if ((Array.isArray(proofEntry.contracts) ? proofEntry.contracts : []).length < 2) {
      reasons.push('contracts:below-floor');
    }

    if (policy && policy['target-level'] === 'host-smoked') {
      const scorecardEntry = hostSmokeBySkill.get(record.name) || null;
      if (!scorecardEntry) {
        reasons.push('host-smoke-scorecard:missing');
      } else {
        if (normalizeString(scorecardEntry.level) !== 'host-smoked') {
          reasons.push(`host-smoke-level:${normalizeString(scorecardEntry.level) || 'missing'}`);
        }
        if (normalizeString(scorecardEntry['governance-status']) !== 'satisfied') {
          reasons.push(`host-smoke-governance:${normalizeString(scorecardEntry['governance-status']) || 'unknown'}`);
        }
        if (normalizeString(scorecardEntry['evidence-status']) !== 'passing') {
          reasons.push(`host-smoke-evidence:${normalizeString(scorecardEntry['evidence-status']) || 'unknown'}`);
        }
      }
    }

    if (reasons.length < 1) {
      continue;
    }

    items.push({
      id: `proof-${record.name}`,
      category: 'proof-governance',
      status: 'open',
      priority: reasons.some((reason) => reason.startsWith('host-smoke-governance:') || reason.startsWith('host-smoke-level:'))
        ? 'critical'
        : 'high',
      source: 'proof-governance',
      skill: record.name,
      kind: record.kind,
      summary: `Close proof-governance debt for '${record.name}'.`,
      reasons,
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke ${record.name} --host codex`
      ]
    });
  }

  return items;
}

function buildHostWriteabilityItems(bundleRoot) {
  const probes = collectGeneratedArtifactWriteability(bundleRoot);
  const items = [];

  for (const probe of probes) {
    if (probe.ok) {
      continue;
    }

    items.push({
      id: `host-writeability-${probe.id}`,
      category: 'host-writeability',
      status: 'open',
      priority: probe.id === 'runtime-proof'
        || probe.id === 'host-smoke-scorecard'
        || probe.id === 'host-smoke-runtime-runs'
        ? 'critical'
        : probe.id === 'system-readiness'
          ? 'high'
          : 'normal',
      source: 'host-writeability',
      skill: null,
      kind: null,
      summary: `Restore host write access for '${probe.label}'.`,
      reasons: [
        `artifact:${probe.id}`,
        `mode:${normalizeString(probe.mode)}`,
        `code:${normalizeString(probe.code) || 'UNKNOWN'}`
      ],
      follow_up: [
        'npm run verify:skill-system'
      ]
    });
  }

  const skillCreateProbe = probeDirectoryCreateAccess(path.join(bundleRoot, 'skills', 'domains', `__create-probe__-${Date.now()}`));
  if (!skillCreateProbe.ok) {
    items.push({
      id: 'host-writeability-authoritative-skill-create',
      category: 'host-writeability',
      status: 'open',
      priority: 'high',
      source: 'host-writeability',
      skill: null,
      kind: null,
      summary: "Restore host ability to create authoritative skill directories.",
      reasons: [
        'artifact:authoritative-skill-tree',
        'mode:create-child-directory',
        `code:${normalizeString(skillCreateProbe.code) || 'UNKNOWN'}`
      ],
      follow_up: [
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --kind domain "<request>"',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js create domain <skill-name> --scaffold-modules'
      ]
    });
  }

  return items;
}

function buildScaffoldLineageItems(skillRecords, bundleRoot) {
  const templateVersions = readTemplateVersions(bundleRoot);
  const items = [];

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (['router', 'adapter'].includes(normalizeString(record.kind))) {
      continue;
    }
    const templateVersion = templateVersions.get(record.kind) || null;
    const scaffoldVersion = normalizeScaffoldVersion(record.scaffoldVersion);

    if (templateVersion == null || scaffoldVersion == null || scaffoldVersion >= templateVersion) {
      continue;
    }

    items.push({
      id: `scaffold-drift-${record.name}`,
      category: 'template-upgrade',
      status: 'open',
      priority: normalizeString(record.status) === 'stable' ? 'high' : 'normal',
      source: 'scaffold-lineage',
      skill: record.name,
      kind: record.kind,
      summary: `Refresh '${record.name}' from canonical ${record.kind} scaffold lineage.`,
      reasons: [`scaffold-version:${scaffoldVersion}`, `template-version:${templateVersion}`],
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
      ]
    });
  }

  return items;
}

function buildPendingScaffoldItems(pendingScaffoldData) {
  const entries = Array.isArray(pendingScaffoldData && pendingScaffoldData.entries) ? pendingScaffoldData.entries : [];
  return entries
    .filter((entry) => ['planned', 'in-progress', 'blocked', 'deferred'].includes(normalizeString(entry.status)))
    .map((entry) => ({
      id: `pending-scaffold-${normalizeString(entry['pending-id'])}`,
      category: 'pending-scaffold-materialization',
      status: normalizeOpenItemStatus(entry.status),
      priority: normalizeString(entry.status) === 'blocked' ? 'critical' : 'high',
      source: 'pending-scaffolds',
      skill: normalizeString(entry.skill) || null,
      kind: normalizeString(entry.kind) || null,
      summary: `Materialize pending scaffold '${normalizeString(entry.skill) || 'unknown'}' into the authoritative tree.`,
      reasons: uniqueSorted([
        `status:${normalizeString(entry.status) || 'blocked'}`,
        ...(normalizeString(entry.path) ? [`path:${normalizeString(entry.path)}`] : []),
        ...(normalizeString(entry['host-constraint'] && entry['host-constraint'].code)
          ? [`code:${normalizeString(entry['host-constraint'].code)}`]
          : []),
        ...(normalizeString(entry['host-constraint'] && entry['host-constraint'].mode)
          ? [`mode:${normalizeString(entry['host-constraint'].mode)}`]
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --skill ${normalizeString(entry.skill)}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold ${normalizeString(entry.skill)}`
      ]
    }));
}

function buildAdmissionItems(admissionLedgerData) {
  const entries = Array.isArray(admissionLedgerData && admissionLedgerData.entries) ? admissionLedgerData.entries : [];
  return entries
    .filter((entry) => ['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(normalizeString(entry.status)))
    .map((entry) => ({
      id: `admission-${normalizeString(entry['request-id'])}`,
      category: 'new-skill-admission',
      status: normalizeString(entry.status) || 'open',
      priority: normalizeString(entry.status) === 'blocked' ? 'critical' : 'high',
      source: 'admission-ledger',
      skill: normalizeString(entry && entry['created-skill']) || null,
      kind: normalizeString(entry && entry['suggested-kind']) || normalizeString(entry && entry.decision && entry.decision.suggested_kind) || null,
      summary: normalizeString(entry && entry.request) || 'Open admission request',
      reasons: uniqueSorted([
        `decision:${normalizeString(entry && entry.decision && entry.decision.action) || 'unknown'}`,
        `status:${normalizeString(entry && entry.status) || 'open'}`,
        ...(Array.isArray(entry && entry['inferred-intent-tags'])
          ? entry['inferred-intent-tags'].map((item) => `intent:${normalizeString(item)}`)
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --request-id ${normalizeString(entry['request-id'])}`
      ]
    }));
}

function buildOpportunityItems(opportunityQueueData) {
  const entries = Array.isArray(opportunityQueueData && opportunityQueueData.entries) ? opportunityQueueData.entries : [];
  return entries
    .filter((entry) => ['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(normalizeOpportunityStatus(entry && entry.status)))
    .map((entry) => ({
      id: `opportunity-${normalizeString(entry['opportunity-id'])}`,
      category: 'future-skill-opportunity',
      status: normalizeOpportunityStatus(entry && entry.status),
      priority: normalizePriority(entry && entry.priority),
      source: 'skill-opportunity-queue',
      skill: normalizeString(entry && entry['created-skill']) || null,
      kind: normalizeString(entry && entry['suggested-kind']) || null,
      summary: normalizeString(entry && entry.summary) || 'Open future skill opportunity',
      reasons: uniqueSorted([
        `horizon:${normalizeString(entry && entry.horizon) || 'next'}`,
        ...(Array.isArray(entry && entry['adjacent-skills'])
          ? entry['adjacent-skills'].map((item) => `adjacent:${normalizeString(item)}`)
          : []),
        ...(Array.isArray(entry && entry.rationale)
          ? entry.rationale.map((item) => `reason:${normalizeString(item)}`)
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id ${normalizeString(entry['opportunity-id'])}`
      ]
    }));
}

function buildEvolutionItems(evolutionLedgerData) {
  const entries = Array.isArray(evolutionLedgerData && evolutionLedgerData.entries) ? evolutionLedgerData.entries : [];
  return entries
    .filter((entry) => normalizeString(entry.status) === 'open')
    .map((entry) => ({
      id: `evolution-${normalizeString(entry['request-id'])}`,
      category: 'existing-skill-evolution',
      status: 'open',
      priority: normalizeString(entry && entry.decision && entry.decision.target_status) === 'stable' ? 'high' : 'normal',
      source: 'evolution-ledger',
      skill: normalizeString(entry && entry.skill) || null,
      kind: null,
      summary: normalizeString(entry && entry.request) || `Open evolution request for '${normalizeString(entry && entry.skill) || 'unknown'}'`,
      reasons: uniqueSorted([
        `decision:${normalizeString(entry && entry.decision && entry.decision.action) || 'unknown'}`,
        ...(normalizeString(entry && entry.decision && entry.decision.target_status)
          ? [`target-status:${normalizeString(entry.decision.target_status)}`]
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-evolution-ledger --request-id ${normalizeString(entry['request-id'])}`
      ]
    }));
}

function buildReviewItems(reviewQueueData) {
  const entries = getReviewEntries(reviewQueueData);
  return entries
    .filter((entry) => ['overdue', 'missing-metadata'].includes(normalizeString(entry['review-status'])))
    .map((entry) => ({
      id: `review-${normalizeString(entry.skill)}`,
      category: 'review-cadence',
      status: 'open',
      priority: normalizeString(entry.status) === 'stable' ? 'critical' : 'high',
      source: 'review-queue',
      skill: normalizeString(entry.skill) || null,
      kind: normalizeString(entry.kind) || null,
      summary: `Refresh governed review metadata for '${normalizeString(entry.skill) || 'unknown'}'.`,
      reasons: uniqueSorted([
        `review-status:${normalizeString(entry['review-status'])}`,
        ...(normalizeString(entry['next-review-due']) ? [`next-review-due:${normalizeString(entry['next-review-due'])}`] : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed ${normalizeString(entry.skill)}`
      ]
    }));
}

function compareBacklogItems(left, right) {
  const priorityIndex = new Map(INVESTMENT_PRIORITIES.map((item, index) => [item, index]));
  const leftPriority = priorityIndex.get(normalizePriority(left && left.priority)) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = priorityIndex.get(normalizePriority(right && right.priority)) ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return normalizeString(left && left.id).localeCompare(normalizeString(right && right.id));
}

function summarizeBacklogItems(items) {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    normal: 0,
    categories: {},
    sources: {}
  };

  for (const item of Array.isArray(items) ? items : []) {
    const priority = normalizePriority(item.priority);
    const category = normalizeString(item.category) || 'unknown';
    const source = normalizeString(item.source) || 'unknown';
    summary.total += 1;
    summary[priority] += 1;
    summary.categories[category] = Number(summary.categories[category] || 0) + 1;
    summary.sources[source] = Number(summary.sources[source] || 0) + 1;
  }

  return summary;
}

function buildSkillInvestmentBacklog(bundleRoot, context = {}) {
  const skillRecords = Array.isArray(context.skillRecords) ? context.skillRecords : [];
  const registryData = context.registryData || {};
  const ratingsData = context.ratingsData || {};
  const reviewQueueData = context.reviewQueueData || {};
  const admissionLedgerData = context.admissionLedgerData || {};
  const evolutionLedgerData = context.evolutionLedgerData || {};
  const opportunityQueueData = context.opportunityQueueData || {};
  const routeFixturesData = context.routeFixturesData || {};
  const runtimeProofData = context.runtimeProofData || readRuntimeProofRegistry(bundleRoot);
  const hostSmokeScorecardData = context.hostSmokeScorecardData || readHostSmokeScorecard(bundleRoot);
  const pendingScaffoldData = context.pendingScaffoldData || readJsonOrFallback(getPendingScaffoldRegistryPath(bundleRoot), { entries: [] });
  const now = Number.isFinite(context.now) ? context.now : Date.now();

  const items = [
    ...buildOpportunityItems(opportunityQueueData),
    ...buildAdmissionItems(admissionLedgerData),
    ...buildEvolutionItems(evolutionLedgerData),
    ...buildReviewItems(reviewQueueData),
    ...buildScaffoldLineageItems(skillRecords, bundleRoot),
    ...buildPendingScaffoldItems(pendingScaffoldData),
    ...buildTopTierReadinessItems(bundleRoot, skillRecords, registryData, ratingsData, reviewQueueData, routeFixturesData),
    ...buildProofGovernanceItems(bundleRoot, skillRecords, runtimeProofData, hostSmokeScorecardData),
    ...buildHostWriteabilityItems(bundleRoot)
  ].sort(compareBacklogItems);

  return {
    'schema-version': SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: {
      'skill-opportunity-queue': 'registry/skill-opportunity-queue.generated.json',
      'admission-ledger': 'registry/admission-ledger.generated.json',
      'evolution-ledger': 'registry/evolution-ledger.generated.json',
      'review-queue': 'registry/review-queue.generated.json',
      'pending-scaffolds': 'registry/pending-scaffolds.generated.json',
      'capability-ratings': 'registry/capability-ratings.generated.json',
      'route-fixtures': 'registry/route-fixtures.generated.json',
      'runtime-proof': 'registry/runtime-proof.generated.json',
      'host-smoke-scorecard': 'benchmark/host-smoke/scorecard.generated.json',
      'authoritative-skills': 'skills/**/SKILL.md'
    },
    summary: summarizeBacklogItems(items),
    items
  };
}

function writeSkillInvestmentBacklog(bundleRoot, context = {}) {
  const payload = buildSkillInvestmentBacklog(bundleRoot, context);
  const file = getSkillInvestmentBacklogPath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateSkillInvestmentBacklog(bundleRoot, findings, context = {}) {
  const file = getSkillInvestmentBacklogPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill investment backlog parse failed: ${parsed.error}`
    });
    return {
      items: [],
      summary: summarizeBacklogItems([])
    };
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(normalizeString(actual['generated-at']));
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildSkillInvestmentBacklog(bundleRoot, {
    ...context,
    now
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (actual['schema-version'] !== SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill investment backlog has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  const sourceMap = actual.sources || {};
  for (const [key, value] of Object.entries(expected.sources || {})) {
    if (normalizeString(sourceMap[key]) !== normalizeString(value)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog source '${key}' is out of sync`
      });
    }
  }

  const seen = new Set();
  for (const item of Array.isArray(actual.items) ? actual.items : []) {
    const id = normalizeString(item && item.id);
    if (!id) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: 'skill investment backlog item is missing id'
      });
      continue;
    }
    if (seen.has(id)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog duplicates id '${id}'`
      });
      continue;
    }
    seen.add(id);

    if (!BACKLOG_SOURCES.has(normalizeString(item && item.source))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog item '${id}' has unsupported source '${normalizeString(item && item.source)}'`
      });
    }

    if (!INVESTMENT_ITEM_STATUSES.has(normalizeString(item && item.status))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog item '${id}' has unsupported status '${normalizeString(item && item.status)}'`
      });
    }

    if (!INVESTMENT_PRIORITIES.includes(normalizeString(item && item.priority))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog item '${id}' has unsupported priority '${normalizeString(item && item.priority)}'`
      });
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill investment backlog is out of sync with admission, evolution, review, scaffold, or top-tier governance state'
    });
  }

  return {
    items: Array.isArray(expected.items) ? expected.items : [],
    summary: expected.summary || summarizeBacklogItems([])
  };
}

module.exports = {
  SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
  INVESTMENT_PRIORITIES,
  getSkillInvestmentBacklogPath,
  buildSkillInvestmentBacklog,
  writeSkillInvestmentBacklog,
  validateSkillInvestmentBacklog
};
