'use strict';

const fs = require('fs');
const path = require('path');
const { rel } = require('./skill-system-common');
const {
  SKILL_KIND_ORDER
} = require('./skill-kind-governance');
const {
  REVIEW_GOVERNED_SKILL_STATUSES
} = require('./skill-lifecycle-governance');

const REVIEW_QUEUE_SCHEMA_VERSION = 1;
const REVIEW_DUE_SOON_DAYS = 7;
const DEFAULT_SKILL_OWNER = 'self';
const DEFAULT_REVIEW_CYCLE_DAYS = 60;
const REVIEW_CYCLE_DAYS_BY_KIND = Object.freeze({
  router: 90,
  domain: 60,
  workflow: 60,
  tool: 45,
  guard: 45,
  adapter: 60
});
const REVIEW_QUEUE_STATUSES = new Set(['scheduled', 'due-soon', 'overdue', 'missing-metadata']);
const REVIEW_QUEUE_PRIORITIES = new Set(['critical', 'high', 'normal']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getReviewQueuePath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'review-queue.generated.json');
}

function isGovernedReviewStatus(status) {
  return REVIEW_GOVERNED_SKILL_STATUSES.has(String(status || '').trim());
}

function normalizeReviewDate(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return text;
}

function normalizeReviewCycleDays(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeReviewOwner(value, fallback = DEFAULT_SKILL_OWNER) {
  const owner = String(value == null ? '' : value).trim();
  if (owner) {
    return owner;
  }
  if (fallback == null) {
    return '';
  }
  return String(fallback).trim();
}

function formatUtcDate(value) {
  const parsed = value instanceof Date
    ? value
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function getDefaultReviewCycleDaysForKind(kind) {
  const normalizedKind = String(kind == null ? '' : kind).trim().toLowerCase();
  return REVIEW_CYCLE_DAYS_BY_KIND[normalizedKind] || DEFAULT_REVIEW_CYCLE_DAYS;
}

function listReviewMetadataPolicies() {
  return SKILL_KIND_ORDER.map((kind) => ({
    kind,
    owner: DEFAULT_SKILL_OWNER,
    'review-cycle-days': getDefaultReviewCycleDaysForKind(kind)
  }));
}

function buildSeedReviewMetadata(kind, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const explicitLastReviewed = normalizeReviewDate(options.lastReviewed) || formatUtcDate(options.lastReviewed);
  const explicitReviewCycleDays = normalizeReviewCycleDays(options.reviewCycleDays);

  return {
    owner: normalizeReviewOwner(options.owner, DEFAULT_SKILL_OWNER),
    'last-reviewed': explicitLastReviewed || formatUtcDate(now),
    'review-cycle-days': explicitReviewCycleDays || getDefaultReviewCycleDaysForKind(kind)
  };
}

function startOfUtcDay(timestamp) {
  const current = new Date(timestamp);
  return Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate()
  );
}

function addDays(dateText, dayCount) {
  const parsed = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setUTCDate(parsed.getUTCDate() + dayCount);
  return parsed.toISOString().slice(0, 10);
}

function diffUtcDays(fromDateText, now) {
  const parsed = new Date(`${fromDateText}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return Math.floor((startOfUtcDay(parsed.getTime()) - startOfUtcDay(now)) / MS_PER_DAY);
}

function deriveReviewSchedule(lastReviewed, reviewCycleDays, options = {}) {
  const normalizedLastReviewed = normalizeReviewDate(lastReviewed);
  const normalizedReviewCycleDays = normalizeReviewCycleDays(reviewCycleDays);
  if (!normalizedLastReviewed || normalizedReviewCycleDays == null) {
    return {
      'last-reviewed': normalizedLastReviewed,
      'review-cycle-days': normalizedReviewCycleDays,
      'review-status': 'missing-metadata'
    };
  }

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const nextReviewDue = addDays(normalizedLastReviewed, normalizedReviewCycleDays);
  const daysUntilDue = nextReviewDue ? diffUtcDays(nextReviewDue, now) : null;
  const overdueDays = typeof daysUntilDue === 'number' && daysUntilDue < 0
    ? Math.abs(daysUntilDue)
    : 0;
  let reviewStatus = 'missing-metadata';

  if (typeof daysUntilDue === 'number') {
    if (daysUntilDue < 0) {
      reviewStatus = 'overdue';
    } else if (daysUntilDue <= REVIEW_DUE_SOON_DAYS) {
      reviewStatus = 'due-soon';
    } else {
      reviewStatus = 'scheduled';
    }
  }

  return {
    'last-reviewed': normalizedLastReviewed,
    'review-cycle-days': normalizedReviewCycleDays,
    'next-review-due': nextReviewDue,
    'days-until-due': daysUntilDue,
    'overdue-days': overdueDays,
    'review-status': reviewStatus
  };
}

function deriveReviewPriority(entry) {
  if (entry['review-status'] === 'missing-metadata') {
    return entry.status === 'stable' ? 'critical' : 'high';
  }
  if (entry['review-status'] === 'overdue') {
    return entry.status === 'stable' ? 'critical' : 'high';
  }
  if (entry['review-status'] === 'due-soon') {
    return entry.status === 'stable' ? 'high' : 'normal';
  }
  return 'normal';
}

function buildReviewQueueEntry(record, options = {}) {
  const reviewSchedule = deriveReviewSchedule(record && record.lastReviewed, record && record.reviewCycleDays, options);
  const entry = {
    skill: String(record && record.name || '').trim(),
    kind: String(record && record.kind || '').trim(),
    status: String(record && record.status || '').trim(),
    owner: normalizeReviewOwner(record && record.owner, 'unassigned'),
    file: String(record && record.file || '').trim(),
    'last-reviewed': reviewSchedule['last-reviewed'],
    'review-cycle-days': reviewSchedule['review-cycle-days'],
    'review-status': reviewSchedule['review-status'],
    priority: 'normal'
  };

  if (reviewSchedule['next-review-due']) {
    entry['next-review-due'] = reviewSchedule['next-review-due'];
    entry['days-until-due'] = reviewSchedule['days-until-due'];
    entry['overdue-days'] = reviewSchedule['overdue-days'];
  }

  entry.priority = deriveReviewPriority(entry);
  return entry;
}

function compareReviewEntries(left, right) {
  const priorityOrder = new Map([
    ['critical', 0],
    ['high', 1],
    ['normal', 2]
  ]);
  const statusOrder = new Map([
    ['overdue', 0],
    ['missing-metadata', 1],
    ['due-soon', 2],
    ['scheduled', 3]
  ]);

  const leftPriority = priorityOrder.get(left.priority) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = priorityOrder.get(right.priority) ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftStatus = statusOrder.get(left['review-status']) ?? Number.MAX_SAFE_INTEGER;
  const rightStatus = statusOrder.get(right['review-status']) ?? Number.MAX_SAFE_INTEGER;
  if (leftStatus !== rightStatus) {
    return leftStatus - rightStatus;
  }

  const leftDays = typeof left['days-until-due'] === 'number' ? left['days-until-due'] : Number.MAX_SAFE_INTEGER;
  const rightDays = typeof right['days-until-due'] === 'number' ? right['days-until-due'] : Number.MAX_SAFE_INTEGER;
  if (leftDays !== rightDays) {
    return leftDays - rightDays;
  }

  const leftOverdue = Number(left['overdue-days'] || 0);
  const rightOverdue = Number(right['overdue-days'] || 0);
  if (leftOverdue !== rightOverdue) {
    return rightOverdue - leftOverdue;
  }

  return String(left.skill || '').localeCompare(String(right.skill || ''));
}

function buildReviewQueueEntries(skillRecords, options = {}) {
  return (Array.isArray(skillRecords) ? skillRecords : [])
    .filter((record) => record && isGovernedReviewStatus(record.status))
    .map((record) => buildReviewQueueEntry(record, options))
    .sort(compareReviewEntries);
}

function summarizeReviewQueue(entries) {
  const summary = {
    'governed-skills': 0,
    overdue: 0,
    'due-soon': 0,
    scheduled: 0,
    'missing-metadata': 0,
    'stable-overdue': 0,
    'stable-missing-metadata': 0
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    summary['governed-skills'] += 1;
    if (REVIEW_QUEUE_STATUSES.has(entry['review-status'])) {
      summary[entry['review-status']] += 1;
    }
    if (entry.status === 'stable' && entry['review-status'] === 'overdue') {
      summary['stable-overdue'] += 1;
    }
    if (entry.status === 'stable' && entry['review-status'] === 'missing-metadata') {
      summary['stable-missing-metadata'] += 1;
    }
  }

  return summary;
}

function buildReviewQueue(bundleRoot, skillRecords, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const entries = buildReviewQueueEntries(skillRecords, { now });
  return {
    'schema-version': REVIEW_QUEUE_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    source: 'skills/**/SKILL.md',
    thresholds: {
      'due-soon-days': REVIEW_DUE_SOON_DAYS
    },
    summary: summarizeReviewQueue(entries),
    skills: entries
  };
}

function writeReviewQueue(bundleRoot, skillRecords, options = {}) {
  const payload = buildReviewQueue(bundleRoot, skillRecords, options);
  const file = getReviewQueuePath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function readReviewQueue(bundleRoot) {
  const file = getReviewQueuePath(bundleRoot);
  if (!fs.existsSync(file)) {
    return {
      file,
      data: {
        'schema-version': REVIEW_QUEUE_SCHEMA_VERSION,
        summary: summarizeReviewQueue([]),
        skills: []
      }
    };
  }

  try {
    return {
      file,
      data: JSON.parse(fs.readFileSync(file, 'utf8'))
    };
  } catch (error) {
    return {
      file,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function validateReviewQueue(bundleRoot, skillRecords, findings, options = {}) {
  const file = getReviewQueuePath(bundleRoot);
  const actualRead = readReviewQueue(bundleRoot);
  if (actualRead.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `review queue parse failed: ${actualRead.error}`
    });
    return {
      entries: [],
      summary: summarizeReviewQueue([])
    };
  }

  const actual = actualRead.data || {};
  const actualGeneratedAt = new Date(String(actual['generated-at'] || '').trim());
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildReviewQueue(bundleRoot, skillRecords, { now });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (actual['schema-version'] !== REVIEW_QUEUE_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `review queue has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (String(actual.source || '') !== expected.source) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'review queue source does not match the canonical skill frontmatter surface'
    });
  }

  const actualThresholds = actual.thresholds || {};
  if (Number(actualThresholds['due-soon-days']) !== REVIEW_DUE_SOON_DAYS) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `review queue due-soon-days must stay '${REVIEW_DUE_SOON_DAYS}'`
    });
  }

  const entries = Array.isArray(actual.skills) ? actual.skills : [];
  const names = new Set();
  for (const entry of entries) {
    const skill = String(entry && entry.skill || '').trim();
    if (!skill) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: 'review queue entry is missing skill'
      });
      continue;
    }
    if (names.has(skill)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `review queue duplicates skill '${skill}'`
      });
      continue;
    }
    names.add(skill);

    if (!REVIEW_QUEUE_STATUSES.has(String(entry['review-status'] || '').trim())) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `review queue entry '${skill}' has unsupported review-status '${entry['review-status']}'`
      });
    }
    if (!REVIEW_QUEUE_PRIORITIES.has(String(entry.priority || '').trim())) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `review queue entry '${skill}' has unsupported priority '${entry.priority}'`
      });
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'review queue is out of sync with live governed skill review metadata'
    });
  }

  return {
    entries: Array.isArray(expected.skills) ? expected.skills : [],
    summary: expected.summary || summarizeReviewQueue([])
  };
}

module.exports = {
  REVIEW_QUEUE_SCHEMA_VERSION,
  REVIEW_DUE_SOON_DAYS,
  DEFAULT_SKILL_OWNER,
  REVIEW_CYCLE_DAYS_BY_KIND,
  getReviewQueuePath,
  isGovernedReviewStatus,
  normalizeReviewDate,
  normalizeReviewCycleDays,
  normalizeReviewOwner,
  formatUtcDate,
  getDefaultReviewCycleDaysForKind,
  listReviewMetadataPolicies,
  buildSeedReviewMetadata,
  deriveReviewSchedule,
  buildReviewQueueEntry,
  buildReviewQueueEntries,
  summarizeReviewQueue,
  buildReviewQueue,
  writeReviewQueue,
  readReviewQueue,
  validateReviewQueue
};
