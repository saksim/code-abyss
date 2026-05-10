'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile } = require('./skill-system-common');

const SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION = 1;
const INVESTMENT_PRIORITIES = ['critical', 'high', 'normal'];
const INVESTMENT_ITEM_STATUSES = new Set([
  'open',
  'planned',
  'in-progress',
  'deferred',
  'blocked',
  'resolved'
]);
const BACKLOG_SOURCES = new Set([
  'skill-opportunity-queue',
  'admission-ledger',
  'evolution-ledger',
  'review-queue',
  'scaffold-lineage',
  'top-tier-readiness'
]);

function normalizeOpportunityStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(normalized)) {
    return normalized;
  }
  return 'open';
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

function buildAdmissionItems(admissionLedgerData) {
  const entries = Array.isArray(admissionLedgerData && admissionLedgerData.entries) ? admissionLedgerData.entries : [];
  return entries
    .filter((entry) => normalizeString(entry.status) === 'open')
    .map((entry) => ({
      id: `admission-${normalizeString(entry['request-id'])}`,
      category: 'new-skill-admission',
      status: 'open',
      priority: 'high',
      source: 'admission-ledger',
      skill: normalizeString(entry && entry['created-skill']) || null,
      kind: normalizeString(entry && entry['suggested-kind']) || normalizeString(entry && entry.decision && entry.decision.suggested_kind) || null,
      summary: normalizeString(entry && entry.request) || 'Open admission request',
      reasons: uniqueSorted([
        `decision:${normalizeString(entry && entry.decision && entry.decision.action) || 'unknown'}`,
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
  const now = Number.isFinite(context.now) ? context.now : Date.now();

  const items = [
    ...buildOpportunityItems(opportunityQueueData),
    ...buildAdmissionItems(admissionLedgerData),
    ...buildEvolutionItems(evolutionLedgerData),
    ...buildReviewItems(reviewQueueData),
    ...buildScaffoldLineageItems(skillRecords, bundleRoot),
    ...buildTopTierReadinessItems(bundleRoot, skillRecords, registryData, ratingsData, reviewQueueData, routeFixturesData)
  ].sort(compareBacklogItems);

  return {
    'schema-version': SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: {
      'skill-opportunity-queue': 'registry/skill-opportunity-queue.generated.json',
      'admission-ledger': 'registry/admission-ledger.generated.json',
      'evolution-ledger': 'registry/evolution-ledger.generated.json',
      'review-queue': 'registry/review-queue.generated.json',
      'capability-ratings': 'registry/capability-ratings.generated.json',
      'route-fixtures': 'registry/route-fixtures.generated.json',
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
