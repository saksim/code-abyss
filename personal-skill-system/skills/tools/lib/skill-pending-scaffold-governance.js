'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile } = require('./skill-system-common');

const PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION = 1;
const PENDING_SCAFFOLD_KINDS = new Set(['router', 'domain', 'workflow', 'tool', 'guard', 'adapter']);
const PENDING_SCAFFOLD_STATUSES = new Set(['planned', 'in-progress', 'blocked', 'deferred']);
const ACTIVE_PENDING_SCAFFOLD_STATUSES = new Set(['planned', 'in-progress', 'blocked', 'deferred']);

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePendingScaffoldStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  return PENDING_SCAFFOLD_STATUSES.has(normalized) ? normalized : 'blocked';
}

function getPendingScaffoldRegistryPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'pending-scaffolds.generated.json');
}

function normalizePortablePath(value) {
  const normalized = normalizeString(value).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) {
    return '';
  }
  return normalized;
}

function normalizePendingScaffoldFiles(files) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(files) ? files : []) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const filePath = normalizePortablePath(entry.path);
    if (!filePath || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    normalized.push({
      path: filePath,
      content: String(entry.content == null ? '' : entry.content)
    });
  }

  normalized.sort((left, right) => left.path.localeCompare(right.path));
  return normalized;
}

function normalizeCapabilityModules(modules) {
  const seen = new Set();
  const normalized = [];

  for (const module of Array.isArray(modules) ? modules : []) {
    if (!isPlainObject(module)) {
      continue;
    }
    const id = normalizeString(module.id);
    const modulePath = normalizePortablePath(module.path);
    const capability = normalizeString(module.capability);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      ...(modulePath ? { path: modulePath } : {}),
      ...(capability ? { capability } : {})
    });
  }

  normalized.sort((left, right) => left.id.localeCompare(right.id));
  return normalized;
}

function normalizeHostConstraint(constraint) {
  if (!isPlainObject(constraint)) {
    return null;
  }
  const type = normalizeString(constraint.type);
  const mode = normalizeString(constraint.mode);
  const code = normalizeString(constraint.code);
  const parent = normalizePortablePath(constraint.parent);
  return {
    ...(type ? { type } : {}),
    ...(mode ? { mode } : {}),
    ...(code ? { code } : {}),
    ...(parent ? { parent } : {})
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePendingScaffoldEntries(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const pendingId = normalizeString(entry['pending-id']);
    const kind = normalizeString(entry.kind);
    const skill = normalizeString(entry.skill);
    const targetPath = normalizePortablePath(entry.path);
    const recordedAt = normalizeString(entry['recorded-at']);
    const files = normalizePendingScaffoldFiles(entry.files);
    if (
      !pendingId
      || seen.has(pendingId)
      || !PENDING_SCAFFOLD_KINDS.has(kind)
      || !skill
      || !targetPath
      || !recordedAt
      || files.length < 1
    ) {
      continue;
    }
    seen.add(pendingId);

    const status = normalizePendingScaffoldStatus(entry.status);
    const hostConstraint = normalizeHostConstraint(entry['host-constraint']);
    const capabilityModules = normalizeCapabilityModules(entry['capability-modules']);
    const rerunCommand = normalizeString(entry['rerun-command']);
    const requestId = normalizeString(entry['request-id']);
    const opportunityId = normalizeString(entry['opportunity-id']);
    const note = normalizeString(entry.note);
    const templateOrigin = normalizeString(entry['template-origin']);
    const templateVersion = Number(entry['template-version']);
    const createPlaceholderRoute = entry['create-placeholder-route'] === true;
    const scaffoldModules = entry['scaffold-modules'] === true;

    normalized.push({
      'pending-id': pendingId,
      kind,
      skill,
      path: targetPath,
      status,
      'recorded-at': recordedAt,
      files,
      ...(requestId ? { 'request-id': requestId } : {}),
      ...(opportunityId ? { 'opportunity-id': opportunityId } : {}),
      ...(rerunCommand ? { 'rerun-command': rerunCommand } : {}),
      ...(note ? { note } : {}),
      ...(templateOrigin ? { 'template-origin': templateOrigin } : {}),
      ...(Number.isInteger(templateVersion) && templateVersion > 0 ? { 'template-version': templateVersion } : {}),
      ...(hostConstraint && Object.keys(hostConstraint).length > 0 ? { 'host-constraint': hostConstraint } : {}),
      ...(capabilityModules.length > 0 ? { 'capability-modules': capabilityModules } : {}),
      ...(createPlaceholderRoute ? { 'create-placeholder-route': true } : {}),
      ...(scaffoldModules ? { 'scaffold-modules': true } : {}),
      ...(isPlainObject(entry.shared) ? { shared: cloneJson(entry.shared) } : {})
    });
  }

  normalized.sort((left, right) => {
    const leftTime = Date.parse(left['recorded-at']) || 0;
    const rightTime = Date.parse(right['recorded-at']) || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left['pending-id'].localeCompare(right['pending-id']);
  });

  return normalized;
}

function summarizePendingScaffoldRegistry(entries) {
  const summary = {
    total: 0,
    active: 0,
    planned: 0,
    'in-progress': 0,
    blocked: 0,
    deferred: 0
  };

  for (const entry of Array.isArray(entries) ? entries : []) {
    const status = normalizePendingScaffoldStatus(entry && entry.status);
    summary.total += 1;
    summary[status] += 1;
    if (ACTIVE_PENDING_SCAFFOLD_STATUSES.has(status)) {
      summary.active += 1;
    }
  }

  return summary;
}

function buildPendingScaffoldRegistry(entries, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const normalizedEntries = normalizePendingScaffoldEntries(entries);
  return {
    'schema-version': PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    source: 'managed-via-manage-skill',
    summary: summarizePendingScaffoldRegistry(normalizedEntries),
    entries: normalizedEntries
  };
}

function validatePendingScaffoldRegistry(bundleRoot, skillRecords, findings) {
  const file = getPendingScaffoldRegistryPath(bundleRoot);
  if (!fs.existsSync(file)) {
    return {
      entries: [],
      summary: summarizePendingScaffoldRegistry([])
    };
  }

  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `pending scaffold registry parse failed: ${parsed.error}`
    });
    return {
      entries: [],
      summary: summarizePendingScaffoldRegistry([])
    };
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(normalizeString(actual['generated-at']));
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildPendingScaffoldRegistry(actual.entries, { now });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };
  const skillNames = new Set((Array.isArray(skillRecords) ? skillRecords : []).map((record) => normalizeString(record.name)));
  const seenIds = new Set();
  const seenSkills = new Set();

  if (actual['schema-version'] !== PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `pending scaffold registry has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (normalizeString(actual.source) !== expected.source) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'pending scaffold registry source is out of sync'
    });
  }

  if (Number.isNaN(actualGeneratedAt.getTime())) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'pending scaffold registry has invalid generated-at'
    });
  }

  for (const entry of Array.isArray(actual.entries) ? actual.entries : []) {
    const pendingId = normalizeString(entry && entry['pending-id']);
    const kind = normalizeString(entry && entry.kind);
    const skill = normalizeString(entry && entry.skill);
    const status = normalizePendingScaffoldStatus(entry && entry.status);
    const files = normalizePendingScaffoldFiles(entry && entry.files);
    const recordedAt = normalizeString(entry && entry['recorded-at']);

    if (!pendingId) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: 'pending scaffold entry is missing pending-id'
      });
      continue;
    }
    if (seenIds.has(pendingId)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `pending scaffold registry duplicates pending-id '${pendingId}'`
      });
      continue;
    }
    seenIds.add(pendingId);

    if (!PENDING_SCAFFOLD_KINDS.has(kind)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `pending scaffold '${pendingId}' has unsupported kind '${kind}'`
      });
    }
    if (!skill) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `pending scaffold '${pendingId}' is missing skill`
      });
    }
    if (skill) {
      if (seenSkills.has(skill)) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, file),
          message: `pending scaffold registry contains multiple active entries for '${skill}'`
        });
      }
      seenSkills.add(skill);
      if (ACTIVE_PENDING_SCAFFOLD_STATUSES.has(status) && skillNames.has(skill)) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, file),
          message: `pending scaffold '${pendingId}' still targets existing skill '${skill}' and should be materialized or cleared`
        });
      }
    }
    if (files.length < 1) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `pending scaffold '${pendingId}' is missing file payloads`
      });
    }
    if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `pending scaffold '${pendingId}' has invalid recorded-at`
      });
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'pending scaffold registry is out of sync with the canonical entry normalization rules'
    });
  }

  return {
    entries: Array.isArray(expected.entries) ? expected.entries : [],
    summary: expected.summary || summarizePendingScaffoldRegistry([])
  };
}

module.exports = {
  PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION,
  PENDING_SCAFFOLD_STATUSES,
  ACTIVE_PENDING_SCAFFOLD_STATUSES,
  getPendingScaffoldRegistryPath,
  normalizePendingScaffoldStatus,
  normalizePendingScaffoldEntries,
  summarizePendingScaffoldRegistry,
  buildPendingScaffoldRegistry,
  validatePendingScaffoldRegistry
};
