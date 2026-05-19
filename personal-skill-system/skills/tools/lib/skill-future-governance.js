'use strict';

const {
  ALL_SKILL_KINDS
} = require('./skill-kind-governance');

const FUTURE_SKILL_KINDS = ALL_SKILL_KINDS;
const FUTURE_SKILL_PRIORITY_ORDER = Object.freeze(['critical', 'high', 'normal']);
const FUTURE_SKILL_HORIZON_ORDER = Object.freeze(['now', 'next', 'later']);
const FUTURE_SKILL_REGISTRY_SOURCE = 'managed-via-manage-skill';
const ADMISSION_DECISION_FIELD_DEFINITIONS = Object.freeze({
  target_skill: {
    type: 'skill-name'
  },
  target_kind: {
    type: 'kind'
  },
  primary_skill: {
    type: 'skill-name'
  },
  competing_skill: {
    type: 'skill-name'
  },
  suggested_kind: {
    type: 'kind'
  }
});
const ADMISSION_DECISION_FIELD_ORDER = Object.freeze(Object.keys(ADMISSION_DECISION_FIELD_DEFINITIONS));

const OPPORTUNITY_STATUS_DEFINITIONS = {
  open: {
    active: true,
    blocking: false
  },
  planned: {
    active: true,
    blocking: false
  },
  'in-progress': {
    active: true,
    blocking: false
  },
  blocked: {
    active: true,
    blocking: true
  },
  deferred: {
    active: true,
    blocking: false
  },
  implemented: {
    active: false,
    blocking: false
  },
  cancelled: {
    active: false,
    blocking: false
  }
};

const ADMISSION_DECISION_ACTION_DEFINITIONS = {
  'create-new-skill': {
    defaultStatus: 'open',
    opportunityStatus: 'planned',
    requiredFields: Object.freeze(['suggested_kind']),
    allowedFields: Object.freeze(['suggested_kind'])
  },
  'clarify-or-merge-boundary': {
    defaultStatus: 'blocked',
    opportunityStatus: 'blocked',
    requiredFields: Object.freeze(['primary_skill', 'competing_skill', 'suggested_kind']),
    allowedFields: Object.freeze(['primary_skill', 'competing_skill', 'suggested_kind'])
  },
  'reuse-existing-skill': {
    defaultStatus: 'advised-reuse',
    opportunityStatus: 'cancelled',
    requiredFields: Object.freeze(['target_skill', 'target_kind']),
    allowedFields: Object.freeze(['target_skill', 'target_kind'])
  },
  'upgrade-existing-skill': {
    defaultStatus: 'advised-upgrade',
    opportunityStatus: 'cancelled',
    requiredFields: Object.freeze(['target_skill', 'target_kind', 'suggested_kind']),
    allowedFields: Object.freeze(['target_skill', 'target_kind', 'suggested_kind'])
  }
};

const ADMISSION_STATUS_DEFINITIONS = {
  open: {
    active: true,
    blocking: false
  },
  planned: {
    active: true,
    blocking: false
  },
  'in-progress': {
    active: true,
    blocking: false
  },
  blocked: {
    active: true,
    blocking: true
  },
  deferred: {
    active: true,
    blocking: false
  },
  implemented: {
    active: false,
    blocking: false
  },
  cancelled: {
    active: false,
    blocking: false
  },
  resolved: {
    active: false,
    blocking: false
  },
  'advised-reuse': {
    active: false,
    blocking: false
  },
  'advised-upgrade': {
    active: false,
    blocking: false
  },
  'advised-noop': {
    active: false,
    blocking: false
  }
};

const EVOLUTION_LEDGER_STATUS_DEFINITIONS = {
  open: {
    active: true,
    terminal: false,
    implemented: false
  },
  implemented: {
    active: false,
    terminal: true,
    implemented: true
  },
  resolved: {
    active: false,
    terminal: true,
    implemented: false
  },
  'advised-noop': {
    active: false,
    terminal: true,
    implemented: false
  }
};

const PENDING_SCAFFOLD_STATUS_DEFINITIONS = {
  planned: {
    active: true,
    blocking: false
  },
  'in-progress': {
    active: true,
    blocking: false
  },
  blocked: {
    active: true,
    blocking: true
  },
  deferred: {
    active: true,
    blocking: false
  }
};

const OPPORTUNITY_STATUS_ORDER = Object.freeze(Object.keys(OPPORTUNITY_STATUS_DEFINITIONS));
const ADMISSION_DECISION_ACTION_ORDER = Object.freeze(Object.keys(ADMISSION_DECISION_ACTION_DEFINITIONS));
const ADMISSION_DECISION_ACTIONS = new Set(ADMISSION_DECISION_ACTION_ORDER);
const ADMISSION_STATUS_ORDER = Object.freeze(Object.keys(ADMISSION_STATUS_DEFINITIONS));
const EVOLUTION_LEDGER_STATUS_ORDER = Object.freeze(Object.keys(EVOLUTION_LEDGER_STATUS_DEFINITIONS));
const PENDING_SCAFFOLD_STATUS_ORDER = Object.freeze(Object.keys(PENDING_SCAFFOLD_STATUS_DEFINITIONS));

const ACTIVE_OPPORTUNITY_STATUSES = new Set(
  OPPORTUNITY_STATUS_ORDER.filter((status) => OPPORTUNITY_STATUS_DEFINITIONS[status].active)
);
const CLOSED_OPPORTUNITY_STATUSES = new Set(
  OPPORTUNITY_STATUS_ORDER.filter((status) => !OPPORTUNITY_STATUS_DEFINITIONS[status].active)
);
const ACTIVE_ADMISSION_STATUSES = new Set(
  ADMISSION_STATUS_ORDER.filter((status) => ADMISSION_STATUS_DEFINITIONS[status].active)
);
const TERMINAL_ADMISSION_STATUSES = new Set(
  ADMISSION_STATUS_ORDER.filter((status) => !ADMISSION_STATUS_DEFINITIONS[status].active)
);
const BLOCKING_ADMISSION_STATUSES = new Set(
  ADMISSION_STATUS_ORDER.filter((status) => ADMISSION_STATUS_DEFINITIONS[status].blocking)
);
const OPEN_EVOLUTION_LEDGER_STATUSES = new Set(
  EVOLUTION_LEDGER_STATUS_ORDER.filter((status) => EVOLUTION_LEDGER_STATUS_DEFINITIONS[status].active)
);
const TERMINAL_EVOLUTION_LEDGER_STATUSES = new Set(
  EVOLUTION_LEDGER_STATUS_ORDER.filter((status) => EVOLUTION_LEDGER_STATUS_DEFINITIONS[status].terminal)
);
const IMPLEMENTED_EVOLUTION_LEDGER_STATUSES = new Set(
  EVOLUTION_LEDGER_STATUS_ORDER.filter((status) => EVOLUTION_LEDGER_STATUS_DEFINITIONS[status].implemented)
);
const ACTIVE_PENDING_SCAFFOLD_STATUSES = new Set(
  PENDING_SCAFFOLD_STATUS_ORDER.filter((status) => PENDING_SCAFFOLD_STATUS_DEFINITIONS[status].active)
);

function normalizeGovernedGeneratedAt(value, fallback = Date.now()) {
  const parsed = Date.parse(String(value == null ? '' : value).trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildGovernedFutureRegistryDocument(schemaVersion, entries, summary, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  return {
    'schema-version': schemaVersion,
    'generated-at': new Date(now).toISOString(),
    source: FUTURE_SKILL_REGISTRY_SOURCE,
    summary,
    entries
  };
}

function buildStatusCountSummary(statusOrder, entries, normalizeStatus, isActiveStatus) {
  const summary = {
    total: 0,
    active: 0
  };

  for (const status of statusOrder) {
    summary[status] = 0;
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const status = normalizeStatus(entry && entry.status);
    summary.total += 1;
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
    if (isActiveStatus(status)) {
      summary.active += 1;
    }
  }

  return summary;
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function normalizeByOrder(value, order, fallback) {
  const normalized = normalizeString(value);
  return order.includes(normalized) ? normalized : fallback;
}

function normalizeFuturePriority(value, fallback = 'normal') {
  return normalizeByOrder(value, FUTURE_SKILL_PRIORITY_ORDER, fallback);
}

function normalizeFutureHorizon(value, fallback = 'next') {
  return normalizeByOrder(value, FUTURE_SKILL_HORIZON_ORDER, fallback);
}

function normalizeOpportunityStatus(value, fallback = 'open') {
  return normalizeByOrder(value, OPPORTUNITY_STATUS_ORDER, fallback);
}

function isKnownOpportunityStatus(value) {
  return OPPORTUNITY_STATUS_ORDER.includes(normalizeString(value));
}

function isActiveOpportunityStatus(value) {
  return ACTIVE_OPPORTUNITY_STATUSES.has(normalizeOpportunityStatus(value));
}

function isClosedOpportunityStatus(value) {
  return CLOSED_OPPORTUNITY_STATUSES.has(normalizeOpportunityStatus(value));
}

function normalizeAdmissionDecisionAction(value) {
  return String(value == null ? '' : value).trim();
}

function isKnownAdmissionDecisionAction(value) {
  return ADMISSION_DECISION_ACTIONS.has(normalizeAdmissionDecisionAction(value));
}

function getAdmissionDecisionDefinition(value) {
  return ADMISSION_DECISION_ACTION_DEFINITIONS[normalizeAdmissionDecisionAction(value)] || null;
}

function getAdmissionDecisionFieldDefinition(fieldName) {
  return ADMISSION_DECISION_FIELD_DEFINITIONS[String(fieldName || '').trim()] || null;
}

function getRequiredAdmissionDecisionFields(action) {
  const definition = getAdmissionDecisionDefinition(action);
  return definition ? [...definition.requiredFields] : [];
}

function getAllowedAdmissionDecisionFields(action) {
  const definition = getAdmissionDecisionDefinition(action);
  return definition ? [...definition.allowedFields] : [];
}

function normalizeAdmissionDecisionField(fieldName, value) {
  const definition = getAdmissionDecisionFieldDefinition(fieldName);
  const normalized = normalizeString(value);
  if (!definition || !normalized) {
    return normalized;
  }
  return normalized;
}

function normalizeAdmissionDecision(decision) {
  const action = normalizeAdmissionDecisionAction(decision && decision.action);
  const definition = getAdmissionDecisionDefinition(action);
  const fields = definition ? definition.allowedFields : ADMISSION_DECISION_FIELD_ORDER;
  const normalized = {};

  if (action) {
    normalized.action = action;
  }

  for (const fieldName of fields) {
    const normalizedValue = normalizeAdmissionDecisionField(fieldName, decision && decision[fieldName]);
    if (normalizedValue) {
      normalized[fieldName] = normalizedValue;
    }
  }

  return normalized;
}

function collectAdmissionDecisionContractErrors(decision, options = {}) {
  const normalizedDecision = normalizeAdmissionDecision(decision);
  const action = normalizeAdmissionDecisionAction(normalizedDecision.action);
  const definition = getAdmissionDecisionDefinition(action);
  const errors = [];
  const skillNames = options.skillNames instanceof Set ? options.skillNames : null;
  const entrySuggestedKind = normalizeAdmissionDecisionField('suggested_kind', options.entrySuggestedKind);

  if (!action) {
    errors.push('decision.action is missing');
    return errors;
  }

  if (!definition) {
    errors.push(`unsupported decision.action '${action}'`);
    return errors;
  }

  for (const fieldName of definition.requiredFields) {
    if (!normalizedDecision[fieldName]) {
      errors.push(`decision '${action}' is missing ${fieldName}`);
    }
  }

  for (const fieldName of ADMISSION_DECISION_FIELD_ORDER) {
    const normalizedValue = normalizeAdmissionDecisionField(fieldName, decision && decision[fieldName]);
    if (normalizedValue && !definition.allowedFields.includes(fieldName)) {
      errors.push(`decision '${action}' should not set ${fieldName}`);
    }
  }

  for (const fieldName of ['target_kind', 'suggested_kind']) {
    const value = normalizedDecision[fieldName];
    if (value && !FUTURE_SKILL_KINDS.has(value)) {
      errors.push(`decision '${action}' has unsupported ${fieldName} '${value}'`);
    }
  }

  if (skillNames) {
    for (const fieldName of ['target_skill', 'primary_skill', 'competing_skill']) {
      const value = normalizedDecision[fieldName];
      if (value && !skillNames.has(value)) {
        errors.push(`decision '${action}' references unknown ${fieldName} '${value}'`);
      }
    }
  }

  if (
    normalizedDecision.primary_skill
    && normalizedDecision.competing_skill
    && normalizedDecision.primary_skill === normalizedDecision.competing_skill
  ) {
    errors.push(`decision '${action}' should not use the same skill for primary_skill and competing_skill`);
  }

  if (normalizedDecision.suggested_kind && entrySuggestedKind && normalizedDecision.suggested_kind !== entrySuggestedKind) {
    errors.push(
      `decision '${action}' suggested_kind '${normalizedDecision.suggested_kind}' does not match entry suggested-kind '${entrySuggestedKind}'`
    );
  }

  return errors;
}

function buildAdmissionDecision(action, fields = {}, options = {}) {
  const normalizedDecision = normalizeAdmissionDecision({
    action,
    ...(fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {})
  });
  const errors = collectAdmissionDecisionContractErrors(normalizedDecision, options);
  if (options.strict === false || errors.length < 1) {
    return normalizedDecision;
  }
  throw new Error(`admission decision '${normalizeAdmissionDecisionAction(action) || 'unknown'}' violates centralized contract: ${errors.join('; ')}`);
}

function buildAdmissionOpportunityNote(action, context = {}) {
  const normalizedAction = normalizeAdmissionDecisionAction(action);
  const admissionRequestId = normalizeString(context.admissionRequestId);
  const decision = normalizeAdmissionDecision(context.decision || {});
  const targetSkill = normalizeAdmissionDecisionField('target_skill', context.targetSkill || decision.target_skill) || 'unknown';
  const primarySkill = normalizeAdmissionDecisionField('primary_skill', context.primarySkill || decision.primary_skill) || 'unknown';
  const competingSkill = normalizeAdmissionDecisionField('competing_skill', context.competingSkill || decision.competing_skill) || 'unknown';

  if (normalizedAction === 'create-new-skill') {
    return `escalated to admission request '${admissionRequestId}' with create-new-skill recommendation`;
  }
  if (normalizedAction === 'clarify-or-merge-boundary') {
    return `escalated to admission request '${admissionRequestId}' and blocked on route-boundary clarification between '${primarySkill}' and '${competingSkill}'`;
  }
  if (normalizedAction === 'reuse-existing-skill') {
    return `resolved by reusing existing skill '${targetSkill}' via admission request '${admissionRequestId}'`;
  }
  if (normalizedAction === 'upgrade-existing-skill') {
    return `resolved by upgrading existing skill '${targetSkill}' via admission request '${admissionRequestId}'`;
  }

  return '';
}

function getDefaultAdmissionStatusForDecision(value) {
  const definition = getAdmissionDecisionDefinition(value);
  return definition ? definition.defaultStatus : 'open';
}

function getDefaultOpportunityStatusForDecision(value) {
  const definition = getAdmissionDecisionDefinition(value);
  return definition ? definition.opportunityStatus : null;
}

function normalizeAdmissionStatus(value, fallback = 'open') {
  return normalizeByOrder(value, ADMISSION_STATUS_ORDER, fallback);
}

function isKnownAdmissionStatus(value) {
  return ADMISSION_STATUS_ORDER.includes(normalizeString(value));
}

function isActiveAdmissionStatus(value) {
  return ACTIVE_ADMISSION_STATUSES.has(normalizeAdmissionStatus(value));
}

function isTerminalAdmissionStatus(value) {
  return TERMINAL_ADMISSION_STATUSES.has(normalizeAdmissionStatus(value));
}

function isBlockingAdmissionStatus(value) {
  return BLOCKING_ADMISSION_STATUSES.has(normalizeAdmissionStatus(value));
}

function normalizeEvolutionLedgerStatus(value, fallback = 'open') {
  return normalizeByOrder(value, EVOLUTION_LEDGER_STATUS_ORDER, fallback);
}

function isKnownEvolutionLedgerStatus(value) {
  return EVOLUTION_LEDGER_STATUS_ORDER.includes(normalizeString(value));
}

function isOpenEvolutionLedgerStatus(value) {
  return OPEN_EVOLUTION_LEDGER_STATUSES.has(normalizeEvolutionLedgerStatus(value));
}

function isTerminalEvolutionLedgerStatus(value) {
  return TERMINAL_EVOLUTION_LEDGER_STATUSES.has(normalizeEvolutionLedgerStatus(value));
}

function isImplementedEvolutionLedgerStatus(value) {
  return IMPLEMENTED_EVOLUTION_LEDGER_STATUSES.has(normalizeEvolutionLedgerStatus(value));
}

function normalizePendingScaffoldStatus(value, fallback = 'blocked') {
  return normalizeByOrder(value, PENDING_SCAFFOLD_STATUS_ORDER, fallback);
}

function isKnownPendingScaffoldStatus(value) {
  return PENDING_SCAFFOLD_STATUS_ORDER.includes(normalizeString(value));
}

function isActivePendingScaffoldStatus(value) {
  return ACTIVE_PENDING_SCAFFOLD_STATUSES.has(normalizePendingScaffoldStatus(value));
}

module.exports = {
  FUTURE_SKILL_KINDS,
  FUTURE_SKILL_PRIORITY_ORDER,
  FUTURE_SKILL_HORIZON_ORDER,
  FUTURE_SKILL_REGISTRY_SOURCE,
  ADMISSION_DECISION_FIELD_DEFINITIONS,
  ADMISSION_DECISION_FIELD_ORDER,
  OPPORTUNITY_STATUS_ORDER,
  ACTIVE_OPPORTUNITY_STATUSES,
  CLOSED_OPPORTUNITY_STATUSES,
  ADMISSION_DECISION_ACTION_ORDER,
  ADMISSION_DECISION_ACTIONS,
  ADMISSION_STATUS_ORDER,
  ACTIVE_ADMISSION_STATUSES,
  TERMINAL_ADMISSION_STATUSES,
  BLOCKING_ADMISSION_STATUSES,
  EVOLUTION_LEDGER_STATUS_ORDER,
  OPEN_EVOLUTION_LEDGER_STATUSES,
  TERMINAL_EVOLUTION_LEDGER_STATUSES,
  IMPLEMENTED_EVOLUTION_LEDGER_STATUSES,
  PENDING_SCAFFOLD_STATUS_ORDER,
  ACTIVE_PENDING_SCAFFOLD_STATUSES,
  normalizeGovernedGeneratedAt,
  buildGovernedFutureRegistryDocument,
  normalizeFuturePriority,
  normalizeFutureHorizon,
  normalizeOpportunityStatus,
  isKnownOpportunityStatus,
  isActiveOpportunityStatus,
  isClosedOpportunityStatus,
  normalizeAdmissionDecisionAction,
  isKnownAdmissionDecisionAction,
  getAdmissionDecisionFieldDefinition,
  getRequiredAdmissionDecisionFields,
  getAllowedAdmissionDecisionFields,
  normalizeAdmissionDecision,
  buildAdmissionDecision,
  collectAdmissionDecisionContractErrors,
  buildAdmissionOpportunityNote,
  getDefaultAdmissionStatusForDecision,
  getDefaultOpportunityStatusForDecision,
  normalizeAdmissionStatus,
  isKnownAdmissionStatus,
  isActiveAdmissionStatus,
  isTerminalAdmissionStatus,
  isBlockingAdmissionStatus,
  normalizeEvolutionLedgerStatus,
  isKnownEvolutionLedgerStatus,
  isOpenEvolutionLedgerStatus,
  isTerminalEvolutionLedgerStatus,
  isImplementedEvolutionLedgerStatus,
  normalizePendingScaffoldStatus,
  isKnownPendingScaffoldStatus,
  isActivePendingScaffoldStatus,
  buildStatusCountSummary
};
