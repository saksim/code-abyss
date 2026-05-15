'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile } = require('./skill-system-common');
const {
  FUTURE_SKILL_KINDS,
  FUTURE_SKILL_PRIORITY_ORDER,
  FUTURE_SKILL_HORIZON_ORDER,
  OPPORTUNITY_STATUS_ORDER,
  ACTIVE_OPPORTUNITY_STATUSES,
  normalizeGovernedGeneratedAt,
  buildGovernedFutureRegistryDocument,
  buildStatusCountSummary,
  normalizeFuturePriority,
  normalizeFutureHorizon,
  normalizeOpportunityStatus,
  isKnownOpportunityStatus
} = require('./skill-future-governance');
const {
  SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION
} = require('./skill-future-registry-schema-governance');

const OPPORTUNITY_PRIORITIES = [...FUTURE_SKILL_PRIORITY_ORDER];
const OPPORTUNITY_HORIZONS = [...FUTURE_SKILL_HORIZON_ORDER];
const OPPORTUNITY_KINDS = FUTURE_SKILL_KINDS;
const OPPORTUNITY_STATUSES = new Set(OPPORTUNITY_STATUS_ORDER);

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
  return normalizeFuturePriority(value);
}

function normalizeOpportunityHorizon(value) {
  return normalizeFutureHorizon(value);
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
  const summary = buildStatusCountSummary(
    OPPORTUNITY_STATUS_ORDER,
    entries,
    normalizeOpportunityStatus,
    (status) => ACTIVE_OPPORTUNITY_STATUSES.has(status)
  );
  summary.critical = 0;
  summary.high = 0;
  summary.normal = 0;
  summary.now = 0;
  summary.next = 0;
  summary.later = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const priority = normalizeOpportunityPriority(entry && entry.priority);
    const horizon = normalizeOpportunityHorizon(entry && entry.horizon);

    summary[priority] += 1;
    summary[horizon] += 1;
  }

  return summary;
}

function buildSkillOpportunityQueue(entries, options = {}) {
  const now = normalizeGovernedGeneratedAt(options.now);
  const normalizedEntries = normalizeOpportunityEntries(entries);
  return buildGovernedFutureRegistryDocument(
    SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
    normalizedEntries,
    summarizeSkillOpportunityQueue(normalizedEntries),
    { now }
  );
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
  const actualGeneratedAtText = normalizeString(actual['generated-at']);
  const actualGeneratedAtMs = Date.parse(actualGeneratedAtText);
  const now = Number.isFinite(actualGeneratedAtMs) ? actualGeneratedAtMs : Date.now();
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

  if (normalizeString(actual.source) !== normalizeString(expected.source)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill opportunity queue source is out of sync'
    });
  }

  if (!actualGeneratedAtText || !Number.isFinite(actualGeneratedAtMs)) {
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
    if (!isKnownOpportunityStatus(entry && entry.status)) {
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
