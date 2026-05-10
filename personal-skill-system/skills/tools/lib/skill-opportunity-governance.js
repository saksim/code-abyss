'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile } = require('./skill-system-common');

const SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION = 1;
const OPPORTUNITY_PRIORITIES = ['critical', 'high', 'normal'];
const OPPORTUNITY_HORIZONS = ['now', 'next', 'later'];
const OPPORTUNITY_KINDS = new Set(['router', 'domain', 'workflow', 'tool', 'guard', 'adapter']);
const OPPORTUNITY_STATUSES = new Set([
  'open',
  'planned',
  'in-progress',
  'blocked',
  'deferred',
  'implemented',
  'cancelled'
]);
const ACTIVE_OPPORTUNITY_STATUSES = new Set([
  'open',
  'planned',
  'in-progress',
  'blocked',
  'deferred'
]);

function getSkillOpportunityQueuePath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'skill-opportunity-queue.generated.json');
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function uniqueSorted(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function normalizeOpportunityPriority(value) {
  const normalized = normalizeString(value).toLowerCase();
  return OPPORTUNITY_PRIORITIES.includes(normalized) ? normalized : 'normal';
}

function normalizeOpportunityStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  return OPPORTUNITY_STATUSES.has(normalized) ? normalized : 'open';
}

function normalizeOpportunityHorizon(value) {
  const normalized = normalizeString(value).toLowerCase();
  return OPPORTUNITY_HORIZONS.includes(normalized) ? normalized : 'next';
}

function normalizeOpportunityEntries(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const opportunityId = normalizeString(entry['opportunity-id']);
    const summary = normalizeString(entry.summary);
    const recordedAt = normalizeString(entry['recorded-at']);
    const key = opportunityId || `${summary}::${recordedAt}`;
    if (!opportunityId || !summary || !recordedAt || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const suggestedKind = normalizeString(entry['suggested-kind']);
    const priority = normalizeOpportunityPriority(entry.priority);
    const status = normalizeOpportunityStatus(entry.status);
    const horizon = normalizeOpportunityHorizon(entry.horizon);
    const adjacentSkills = uniqueSorted(entry['adjacent-skills']);
    const rationale = uniqueSorted(entry.rationale);
    const createdSkill = normalizeString(entry['created-skill']);
    const admissionRequestId = normalizeString(entry['admission-request-id']);
    const note = normalizeString(entry.note);
    const resolvedAt = normalizeString(entry['resolved-at']);

    normalized.push({
      'opportunity-id': opportunityId,
      summary,
      ...(suggestedKind ? { 'suggested-kind': suggestedKind } : {}),
      priority,
      status,
      horizon,
      ...(adjacentSkills.length > 0 ? { 'adjacent-skills': adjacentSkills } : {}),
      ...(rationale.length > 0 ? { rationale } : {}),
      'recorded-at': recordedAt,
      ...(resolvedAt ? { 'resolved-at': resolvedAt } : {}),
      ...(createdSkill ? { 'created-skill': createdSkill } : {}),
      ...(admissionRequestId ? { 'admission-request-id': admissionRequestId } : {}),
      ...(note ? { note } : {})
    });
  }

  normalized.sort((left, right) => {
    const leftTime = Date.parse(left['recorded-at']) || 0;
    const rightTime = Date.parse(right['recorded-at']) || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left['opportunity-id'].localeCompare(right['opportunity-id']);
  });

  return normalized;
}

function summarizeSkillOpportunityQueue(entries) {
  const summary = {
    total: 0,
    active: 0,
    open: 0,
    planned: 0,
    'in-progress': 0,
    blocked: 0,
    deferred: 0,
    implemented: 0,
    cancelled: 0,
    critical: 0,
    high: 0,
    normal: 0,
    now: 0,
    next: 0,
    later: 0
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    const status = normalizeOpportunityStatus(entry && entry.status);
    const priority = normalizeOpportunityPriority(entry && entry.priority);
    const horizon = normalizeOpportunityHorizon(entry && entry.horizon);

    summary.total += 1;
    summary[status] += 1;
    summary[priority] += 1;
    summary[horizon] += 1;
    if (ACTIVE_OPPORTUNITY_STATUSES.has(status)) {
      summary.active += 1;
    }
  }

  return summary;
}

function buildSkillOpportunityQueue(entries, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const normalizedEntries = normalizeOpportunityEntries(entries);
  return {
    'schema-version': SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    source: 'managed-via-manage-skill',
    summary: summarizeSkillOpportunityQueue(normalizedEntries),
    entries: normalizedEntries
  };
}

function validateSkillOpportunityQueue(bundleRoot, skillRecords, findings) {
  const file = getSkillOpportunityQueuePath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill opportunity queue parse failed: ${parsed.error}`
    });
    return {
      entries: [],
      summary: summarizeSkillOpportunityQueue([])
    };
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(normalizeString(actual['generated-at']));
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildSkillOpportunityQueue(actual.entries, { now });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };
  const skillNames = new Set((Array.isArray(skillRecords) ? skillRecords : []).map((record) => normalizeString(record.name)));
  const seen = new Set();

  if (actual['schema-version'] !== SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill opportunity queue has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (normalizeString(actual.source) !== expected.source) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill opportunity queue source is out of sync'
    });
  }

  if (Number.isNaN(actualGeneratedAt.getTime())) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill opportunity queue has invalid generated-at'
    });
  }

  for (const entry of Array.isArray(actual.entries) ? actual.entries : []) {
    const opportunityId = normalizeString(entry && entry['opportunity-id']);
    const summary = normalizeString(entry && entry.summary);
    const suggestedKind = normalizeString(entry && entry['suggested-kind']);
    const status = normalizeOpportunityStatus(entry && entry.status);
    const priority = normalizeOpportunityPriority(entry && entry.priority);
    const horizon = normalizeOpportunityHorizon(entry && entry.horizon);
    const recordedAt = normalizeString(entry && entry['recorded-at']);
    const resolvedAt = normalizeString(entry && entry['resolved-at']);
    const createdSkill = normalizeString(entry && entry['created-skill']);

    if (!opportunityId) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: 'skill opportunity queue entry is missing opportunity-id'
      });
      continue;
    }
    if (seen.has(opportunityId)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue duplicates opportunity-id '${opportunityId}'`
      });
      continue;
    }
    seen.add(opportunityId);

    if (!summary) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' is missing summary`
      });
    }
    if (suggestedKind && !OPPORTUNITY_KINDS.has(suggestedKind)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' has unsupported suggested-kind '${suggestedKind}'`
      });
    }
    if (!OPPORTUNITY_STATUSES.has(normalizeString(entry && entry.status).toLowerCase())) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' has unsupported status '${normalizeString(entry && entry.status)}'`
      });
    }
    if (!OPPORTUNITY_PRIORITIES.includes(normalizeString(entry && entry.priority).toLowerCase())) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' has unsupported priority '${normalizeString(entry && entry.priority)}'`
      });
    }
    if (!OPPORTUNITY_HORIZONS.includes(normalizeString(entry && entry.horizon).toLowerCase())) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' has unsupported horizon '${normalizeString(entry && entry.horizon)}'`
      });
    }
    if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' has invalid recorded-at`
      });
    }
    if (resolvedAt && Number.isNaN(Date.parse(resolvedAt))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' has invalid resolved-at`
      });
    }
    for (const adjacentSkill of Array.isArray(entry && entry['adjacent-skills']) ? entry['adjacent-skills'] : []) {
      if (!skillNames.has(normalizeString(adjacentSkill))) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, file),
          message: `skill opportunity queue entry '${opportunityId}' references unknown adjacent skill '${normalizeString(adjacentSkill)}'`
        });
      }
    }
    if (status === 'implemented') {
      if (!createdSkill) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, file),
          message: `implemented skill opportunity '${opportunityId}' is missing created-skill`
        });
      } else if (!skillNames.has(createdSkill)) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, file),
          message: `implemented skill opportunity '${opportunityId}' references unknown created-skill '${createdSkill}'`
        });
      }
    }
    if (createdSkill && !skillNames.has(createdSkill) && status !== 'implemented') {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill opportunity queue entry '${opportunityId}' references unknown created-skill '${createdSkill}'`
      });
    }
    if (ACTIVE_OPPORTUNITY_STATUSES.has(status) && resolvedAt) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `active skill opportunity '${opportunityId}' should not carry resolved-at`
      });
    }
    if (!ACTIVE_OPPORTUNITY_STATUSES.has(status) && !resolvedAt) {
      findings.push({
        severity: 'warning',
        file: rel(bundleRoot, file),
        message: `closed skill opportunity '${opportunityId}' is missing resolved-at`
      });
    }
    if (priority !== normalizeString(entry && entry.priority).toLowerCase() && !normalizeString(entry && entry.priority)) {
      continue;
    }
    if (horizon !== normalizeString(entry && entry.horizon).toLowerCase() && !normalizeString(entry && entry.horizon)) {
      continue;
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill opportunity queue is out of sync with the canonical entry normalization rules'
    });
  }

  return {
    entries: Array.isArray(expected.entries) ? expected.entries : [],
    summary: expected.summary || summarizeSkillOpportunityQueue([])
  };
}

module.exports = {
  SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_HORIZONS,
  OPPORTUNITY_STATUSES,
  ACTIVE_OPPORTUNITY_STATUSES,
  getSkillOpportunityQueuePath,
  normalizeOpportunityPriority,
  normalizeOpportunityStatus,
  normalizeOpportunityHorizon,
  normalizeOpportunityEntries,
  summarizeSkillOpportunityQueue,
  buildSkillOpportunityQueue,
  validateSkillOpportunityQueue
};
