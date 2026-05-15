'use strict';

const {
  ALL_SKILL_KINDS
} = require('./skill-kind-governance');

const FUTURE_SKILL_KINDS = ALL_SKILL_KINDS;
const FUTURE_SKILL_PRIORITY_ORDER = Object.freeze(['critical', 'high', 'normal']);
const FUTURE_SKILL_HORIZON_ORDER = Object.freeze(['now', 'next', 'later']);
const FUTURE_SKILL_REGISTRY_SOURCE = 'managed-via-manage-skill';

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
    opportunityStatus: 'planned'
  },
  'clarify-or-merge-boundary': {
    defaultStatus: 'blocked',
    opportunityStatus: 'blocked'
  },
  'reuse-existing-skill': {
    defaultStatus: 'advised-reuse',
    opportunityStatus: 'cancelled'
  },
  'upgrade-existing-skill': {
    defaultStatus: 'advised-upgrade',
    opportunityStatus: 'cancelled'
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
const ADMISSION_DECISION_ACTIONS = new Set(Object.keys(ADMISSION_DECISION_ACTION_DEFINITIONS));
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
  OPPORTUNITY_STATUS_ORDER,
  ACTIVE_OPPORTUNITY_STATUSES,
  CLOSED_OPPORTUNITY_STATUSES,
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
