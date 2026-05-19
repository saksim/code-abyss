'use strict';

const fs = require('fs');
const {
  rel,
  parseJsonFile
} = require('./skill-system-common');
const {
  getGovernanceArtifactPath
} = require('./skill-generated-artifact-governance');
const {
  FUTURE_SKILL_REGISTRY_SOURCE,
  ADMISSION_DECISION_FIELD_ORDER,
  isKnownAdmissionDecisionAction,
  normalizeAdmissionDecision,
  collectAdmissionDecisionContractErrors,
  ADMISSION_STATUS_ORDER,
  isKnownAdmissionStatus,
  normalizeAdmissionStatus,
  isActiveAdmissionStatus,
  normalizeGovernedGeneratedAt,
  buildGovernedFutureRegistryDocument,
  buildStatusCountSummary,
  EVOLUTION_LEDGER_STATUS_ORDER,
  isKnownEvolutionLedgerStatus,
  normalizeEvolutionLedgerStatus,
  isOpenEvolutionLedgerStatus,
  isTerminalEvolutionLedgerStatus,
  isImplementedEvolutionLedgerStatus
} = require('./skill-future-governance');
const {
  isKnownSkillStatus,
  isKnownEvolutionAction
} = require('./skill-lifecycle-governance');
const {
  ADMISSION_LEDGER_SCHEMA_VERSION,
  EVOLUTION_LEDGER_SCHEMA_VERSION
} = require('./skill-future-registry-schema-governance');

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeAdmissionText(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueSorted(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function readJsonFromFileOrFallback(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }
  const parsed = parseJsonFile(file);
  return parsed.error ? fallback : (parsed.data || fallback);
}

function getAdmissionLedgerPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'admission-ledger');
}

function getEvolutionLedgerPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'evolution-ledger');
}

function normalizeAdmissionLedgerEntries(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const requestId = normalizeString(entry['request-id']);
    const request = normalizeAdmissionText(entry.request);
    const decisionAction = normalizeString(entry && entry.decision && entry.decision.action);
    const recordedAt = normalizeString(entry['recorded-at']);
    const key = requestId || `${request}::${recordedAt}`;
    if (!requestId || !request || !decisionAction || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const status = normalizeAdmissionStatus(entry.status || 'open');
    const normalizedDecision = normalizeAdmissionDecision(entry && entry.decision);
    const normalizedEntry = {
      'request-id': requestId,
      request,
      ...(entry['suggested-kind'] ? { 'suggested-kind': normalizeString(entry['suggested-kind']) } : {}),
      ...(Array.isArray(entry['inferred-intent-tags'])
        ? { 'inferred-intent-tags': uniqueSorted(entry['inferred-intent-tags']) }
        : {}),
      ...(entry['opportunity-id'] ? { 'opportunity-id': normalizeString(entry['opportunity-id']) } : {}),
      decision: normalizedDecision.action ? normalizedDecision : { action: decisionAction },
      status,
      'recorded-at': recordedAt,
      ...(entry['created-skill'] ? { 'created-skill': normalizeString(entry['created-skill']) } : {}),
      ...(entry.note ? { note: normalizeString(entry.note) } : {})
    };
    if (!isActiveAdmissionStatus(status) && entry['resolved-at']) {
      normalizedEntry['resolved-at'] = normalizeString(entry['resolved-at']);
    }
    normalized.push(normalizedEntry);
  }

  normalized.sort((left, right) => {
    const leftTime = Date.parse(left['recorded-at']) || 0;
    const rightTime = Date.parse(right['recorded-at']) || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left['request-id'].localeCompare(right['request-id']);
  });

  return normalized;
}

function summarizeAdmissionLedger(entries) {
  return buildStatusCountSummary(
    ADMISSION_STATUS_ORDER,
    entries,
    normalizeAdmissionStatus,
    isActiveAdmissionStatus
  );
}

function buildAdmissionLedger(entries, options = {}) {
  const now = normalizeGovernedGeneratedAt(options.now);
  const normalizedEntries = normalizeAdmissionLedgerEntries(entries);
  return buildGovernedFutureRegistryDocument(
    ADMISSION_LEDGER_SCHEMA_VERSION,
    normalizedEntries,
    summarizeAdmissionLedger(normalizedEntries),
    { now }
  );
}

function readAdmissionLedger(bundleRoot) {
  const raw = readJsonFromFileOrFallback(getAdmissionLedgerPath(bundleRoot), { entries: [] });
  return buildAdmissionLedger(raw.entries, {
    now: normalizeGovernedGeneratedAt(raw['generated-at'])
  });
}

function normalizeEvolutionLedgerEntries(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const requestId = normalizeString(entry['request-id']);
    const skill = normalizeString(entry.skill);
    const request = normalizeAdmissionText(entry.request);
    const decisionAction = normalizeString(entry && entry.decision && entry.decision.action);
    const recordedAt = normalizeString(entry['recorded-at']);
    const key = requestId || `${skill}::${request}::${recordedAt}`;
    if (!requestId || !skill || !request || !decisionAction || seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      'request-id': requestId,
      skill,
      request,
      decision: {
        action: decisionAction,
        ...(entry && entry.decision && entry.decision.target_status ? { target_status: normalizeString(entry.decision.target_status) } : {}),
        ...(entry && entry.decision && entry.decision.target_skill ? { target_skill: normalizeString(entry.decision.target_skill) } : {}),
        ...(entry && entry.decision && entry.decision.note ? { note: normalizeString(entry.decision.note) } : {})
      },
      status: normalizeEvolutionLedgerStatus(entry.status || 'open'),
      'recorded-at': recordedAt,
      ...(entry['resolved-at'] ? { 'resolved-at': normalizeString(entry['resolved-at']) } : {}),
      ...(entry['executed-action'] ? { 'executed-action': normalizeString(entry['executed-action']) } : {}),
      ...(entry['result-status'] ? { 'result-status': normalizeString(entry['result-status']) } : {}),
      ...(entry['merged-into'] ? { 'merged-into': normalizeString(entry['merged-into']) } : {}),
      ...(entry.note ? { note: normalizeString(entry.note) } : {})
    });
  }

  normalized.sort((left, right) => {
    const leftTime = Date.parse(left['recorded-at']) || 0;
    const rightTime = Date.parse(right['recorded-at']) || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left['request-id'].localeCompare(right['request-id']);
  });

  return normalized;
}

function summarizeEvolutionLedger(entries) {
  const summary = buildStatusCountSummary(
    EVOLUTION_LEDGER_STATUS_ORDER,
    entries,
    normalizeEvolutionLedgerStatus,
    isOpenEvolutionLedgerStatus
  );
  summary.implemented = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (isImplementedEvolutionLedgerStatus(entry && entry.status)) {
      summary.implemented += 1;
    }
  }

  return summary;
}

function buildEvolutionLedger(entries, options = {}) {
  const now = normalizeGovernedGeneratedAt(options.now);
  const normalizedEntries = normalizeEvolutionLedgerEntries(entries);
  return buildGovernedFutureRegistryDocument(
    EVOLUTION_LEDGER_SCHEMA_VERSION,
    normalizedEntries,
    summarizeEvolutionLedger(normalizedEntries),
    { now }
  );
}

function readEvolutionLedger(bundleRoot) {
  const raw = readJsonFromFileOrFallback(getEvolutionLedgerPath(bundleRoot), { entries: [] });
  return buildEvolutionLedger(raw.entries, {
    now: normalizeGovernedGeneratedAt(raw['generated-at'])
  });
}

function validateAdmissionLedger(bundleRoot, skillRecords, opportunityIds, findings, options = {}) {
  const ledgerPath = getAdmissionLedgerPath(bundleRoot);
  const parsed = parseJsonFile(ledgerPath);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: `admission ledger parse failed: ${parsed.error}`
    });
    return buildAdmissionLedger([]);
  }

  const actual = parsed.data || {};
  const actualGeneratedAtText = normalizeString(actual['generated-at']);
  const actualGeneratedAtMs = Date.parse(actualGeneratedAtText);
  const expected = buildAdmissionLedger(actual.entries, {
    now: Number.isFinite(actualGeneratedAtMs) ? actualGeneratedAtMs : Date.now()
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at'],
    entries: Array.isArray(actual.entries) ? actual.entries : []
  };
  const skillNames = new Set((Array.isArray(skillRecords) ? skillRecords : []).map((record) => normalizeString(record.name)));
  const deleteEvidenceBySkill = options.deleteEvidenceBySkill instanceof Map
    ? options.deleteEvidenceBySkill
    : new Map();
  const requestIds = new Set();
  const opportunityIdSet = opportunityIds instanceof Set ? opportunityIds : new Set();

  if (actual['schema-version'] !== ADMISSION_LEDGER_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: `admission ledger has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (normalizeString(actual.source) !== normalizeString(expected.source)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: 'admission ledger source is out of sync'
    });
  }

  if (!actualGeneratedAtText || !Number.isFinite(actualGeneratedAtMs)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: 'admission ledger has invalid generated-at'
    });
  }

  for (const entry of comparableActual.entries) {
    const requestId = normalizeString(entry && entry['request-id']);
    const request = normalizeAdmissionText(entry && entry.request);
    const recordedAt = normalizeString(entry && entry['recorded-at']);
    const decisionAction = normalizeString(entry && entry.decision && entry.decision.action);
    const status = normalizeString(entry && entry.status);
    const opportunityId = normalizeString(entry && entry['opportunity-id']);

    if (!requestId) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: 'admission ledger entry is missing request-id' });
      continue;
    }
    if (requestIds.has(requestId)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger duplicates request-id '${requestId}'` });
      continue;
    }
    requestIds.add(requestId);

    if (!request) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' is missing request text` });
    }
    if (!decisionAction) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' is missing decision.action` });
    } else if (!isKnownAdmissionDecisionAction(decisionAction)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' has unsupported decision.action '${decisionAction}'` });
    }
    const decisionErrors = collectAdmissionDecisionContractErrors(entry && entry.decision, {
      skillNames,
      entrySuggestedKind: normalizeString(entry && entry['suggested-kind'])
    });
    for (const error of decisionErrors) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, ledgerPath),
        message: `admission ledger entry '${requestId}' ${error}`
      });
    }
    if (!isKnownAdmissionStatus(status)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' has unsupported status '${status}'` });
    }
    if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' has invalid recorded-at` });
    }
    if (entry && entry['resolved-at'] && Number.isNaN(Date.parse(String(entry['resolved-at'])))) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' has invalid resolved-at` });
    }
    if (opportunityId && !opportunityIdSet.has(opportunityId)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `admission ledger entry '${requestId}' references unknown opportunity-id '${opportunityId}'` });
    }
    if (status === 'implemented') {
      const createdSkill = normalizeString(entry && entry['created-skill']);
      if (!createdSkill) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `implemented admission ledger entry '${requestId}' is missing created-skill` });
      } else if (!skillNames.has(createdSkill) && deleteEvidenceBySkill.get(createdSkill) !== true) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `implemented admission ledger entry '${requestId}' references unknown created-skill '${createdSkill}'` });
      }
    }
    if (decisionAction === 'create-new-skill' && normalizeAdmissionStatus(status) === 'open') {
      findings.push({ severity: 'warning', file: rel(bundleRoot, ledgerPath), message: `admission request '${requestId}' still recommends creating a new skill and remains open` });
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: 'admission ledger is out of sync with the canonical entry normalization rules'
    });
  }

  return expected;
}

function validateEvolutionLedger(bundleRoot, skillRecords, findings) {
  const ledgerPath = getEvolutionLedgerPath(bundleRoot);
  const parsed = parseJsonFile(ledgerPath);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: `evolution ledger parse failed: ${parsed.error}`
    });
    return buildEvolutionLedger([]);
  }

  const actual = parsed.data || {};
  const actualGeneratedAtText = normalizeString(actual['generated-at']);
  const actualGeneratedAtMs = Date.parse(actualGeneratedAtText);
  const expected = buildEvolutionLedger(actual.entries, {
    now: Number.isFinite(actualGeneratedAtMs) ? actualGeneratedAtMs : Date.now()
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at'],
    entries: Array.isArray(actual.entries) ? actual.entries : []
  };
  const requestIds = new Set();
  const skillNames = new Set((Array.isArray(skillRecords) ? skillRecords : []).map((record) => normalizeString(record.name)));

  if (actual['schema-version'] !== EVOLUTION_LEDGER_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: `evolution ledger has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (normalizeString(actual.source) !== normalizeString(expected.source)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: 'evolution ledger source is out of sync'
    });
  }

  if (!actualGeneratedAtText || !Number.isFinite(actualGeneratedAtMs)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: 'evolution ledger has invalid generated-at'
    });
  }

  for (const entry of comparableActual.entries) {
    const requestId = normalizeString(entry && entry['request-id']);
    const skill = normalizeString(entry && entry.skill);
    const request = normalizeAdmissionText(entry && entry.request);
    const recordedAt = normalizeString(entry && entry['recorded-at']);
    const decisionAction = normalizeString(entry && entry.decision && entry.decision.action);
    const status = normalizeString(entry && entry.status);
    const targetStatus = normalizeString(entry && entry.decision && entry.decision.target_status);

    if (!requestId) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: 'evolution ledger entry is missing request-id' });
      continue;
    }
    if (requestIds.has(requestId)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger duplicates request-id '${requestId}'` });
      continue;
    }
    requestIds.add(requestId);

    if (!skill) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' is missing skill` });
    } else if (
      !skillNames.has(skill)
      && !isTerminalEvolutionLedgerStatus(status)
      && normalizeString(entry && entry['result-status']) !== 'deleted'
    ) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' references unknown skill '${skill}'` });
    }
    if (!request) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' is missing request text` });
    }
    if (!decisionAction) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' is missing decision.action` });
    }
    if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' has invalid recorded-at` });
    }
    if (entry && entry['resolved-at'] && Number.isNaN(Date.parse(String(entry['resolved-at'])))) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' has invalid resolved-at` });
    }
    if (decisionAction && !isKnownEvolutionAction(decisionAction)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' has unsupported decision.action '${decisionAction}'` });
    }
    if (!isKnownEvolutionLedgerStatus(status)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' has unsupported status '${status}'` });
    }
    if (targetStatus && !isKnownSkillStatus(targetStatus)) {
      findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger entry '${requestId}' has unsupported decision.target_status '${targetStatus}'` });
    }
    if (decisionAction === 'merge-into-skill') {
      const targetSkill = normalizeString(entry && entry.decision && entry.decision.target_skill);
      if (!targetSkill) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger merge entry '${requestId}' is missing decision.target_skill` });
      } else if (!skillNames.has(targetSkill)) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `evolution ledger merge entry '${requestId}' references unknown target_skill '${targetSkill}'` });
      }
    }
    if (isImplementedEvolutionLedgerStatus(status)) {
      const executedAction = normalizeString(entry && entry['executed-action']);
      const resultStatus = normalizeString(entry && entry['result-status']);
      if (!executedAction) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `implemented evolution ledger entry '${requestId}' is missing executed-action` });
      }
      if (!resultStatus) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `implemented evolution ledger entry '${requestId}' is missing result-status` });
      }
      if (resultStatus && resultStatus !== 'deleted' && !skillNames.has(skill)) {
        findings.push({ severity: 'error', file: rel(bundleRoot, ledgerPath), message: `implemented evolution ledger entry '${requestId}' references missing skill '${skill}' for non-delete result` });
      }
    }
    if (isOpenEvolutionLedgerStatus(status) && decisionAction !== 'status-already-correct') {
      findings.push({ severity: 'warning', file: rel(bundleRoot, ledgerPath), message: `evolution request '${requestId}' for '${skill || 'unknown'}' remains open` });
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, ledgerPath),
      message: 'evolution ledger is out of sync with the canonical entry normalization rules'
    });
  }

  return expected;
}

function collectDeleteEvidenceBySkill(skillRecords, evolutionLedger) {
  const liveSkillNames = new Set((Array.isArray(skillRecords) ? skillRecords : []).map((record) => normalizeString(record.name)));
  const evidence = new Map();
  const entries = Array.isArray(evolutionLedger && evolutionLedger.entries) ? evolutionLedger.entries : [];
  for (const entry of entries) {
    const skill = normalizeString(entry && entry.skill);
    if (!skill || liveSkillNames.has(skill)) {
      continue;
    }
    const executedAction = normalizeString(entry && entry['executed-action']);
    const resultStatus = normalizeString(entry && entry['result-status']);
    const status = normalizeString(entry && entry.status);
    if (
      isImplementedEvolutionLedgerStatus(status)
      && (executedAction === 'delete' || resultStatus === 'deleted')
    ) {
      evidence.set(skill, true);
    }
  }
  return evidence;
}

module.exports = {
  ADMISSION_LEDGER_SCHEMA_VERSION,
  EVOLUTION_LEDGER_SCHEMA_VERSION,
  FUTURE_SKILL_REGISTRY_SOURCE,
  normalizeAdmissionText,
  normalizeAdmissionLedgerEntries,
  summarizeAdmissionLedger,
  buildAdmissionLedger,
  readAdmissionLedger,
  getAdmissionLedgerPath,
  normalizeEvolutionLedgerEntries,
  summarizeEvolutionLedger,
  buildEvolutionLedger,
  readEvolutionLedger,
  getEvolutionLedgerPath,
  validateAdmissionLedger,
  validateEvolutionLedger,
  collectDeleteEvidenceBySkill
};
