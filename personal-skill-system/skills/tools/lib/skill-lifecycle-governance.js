'use strict';

const SKILL_STATUS_DEFINITIONS = {
  draft: {
    live: false,
    reviewGoverned: false,
    runtimeProofGoverned: false,
    skillLevelBucket: null,
    defaultRuntimeProofLevel: 'declared-only'
  },
  experimental: {
    live: true,
    reviewGoverned: true,
    runtimeProofGoverned: true,
    skillLevelBucket: 'strong-uplift-but-not-top-yet',
    defaultRuntimeProofLevel: 'declared-only'
  },
  stable: {
    live: true,
    reviewGoverned: true,
    runtimeProofGoverned: true,
    skillLevelBucket: 'top-level-enough-now',
    defaultRuntimeProofLevel: 'declared-and-tested'
  },
  deprecated: {
    live: true,
    reviewGoverned: true,
    runtimeProofGoverned: true,
    skillLevelBucket: 'useful-overlay-not-top-level-alone',
    defaultRuntimeProofLevel: 'declared-only'
  },
  archived: {
    live: false,
    reviewGoverned: false,
    runtimeProofGoverned: false,
    skillLevelBucket: null,
    defaultRuntimeProofLevel: 'declared-only'
  },
  deleted: {
    live: false,
    reviewGoverned: false,
    runtimeProofGoverned: false,
    skillLevelBucket: null,
    defaultRuntimeProofLevel: 'declared-only'
  }
};

const SKILL_STATUS_ORDER = Object.freeze(['draft', 'experimental', 'stable', 'deprecated', 'archived']);
const ALL_SKILL_STATUSES = new Set(Object.keys(SKILL_STATUS_DEFINITIONS));
const WRITABLE_SKILL_STATUSES = new Set(SKILL_STATUS_ORDER);
const LIVE_SKILL_STATUSES = new Set(
  Object.entries(SKILL_STATUS_DEFINITIONS)
    .filter(([, definition]) => definition.live)
    .map(([status]) => status)
);
const REVIEW_GOVERNED_SKILL_STATUSES = new Set(
  Object.entries(SKILL_STATUS_DEFINITIONS)
    .filter(([, definition]) => definition.reviewGoverned)
    .map(([status]) => status)
);
const RUNTIME_PROOF_GOVERNED_SKILL_STATUSES = new Set(
  Object.entries(SKILL_STATUS_DEFINITIONS)
    .filter(([, definition]) => definition.runtimeProofGoverned)
    .map(([status]) => status)
);
const SKILL_LEVEL_BUCKET_BY_STATUS = new Map(
  Object.entries(SKILL_STATUS_DEFINITIONS)
    .filter(([, definition]) => definition.skillLevelBucket)
    .map(([status, definition]) => [status, definition.skillLevelBucket])
);

const RUNTIME_PROOF_LEVELS = new Set(['declared-only', 'declared-and-tested', 'host-smoked']);
const RUNTIME_PROOF_LEVEL_ORDER = Object.freeze(['declared-only', 'declared-and-tested', 'host-smoked']);
const RUNTIME_PROOF_LEVEL_INDEX = new Map(
  RUNTIME_PROOF_LEVEL_ORDER.map((level, index) => [level, index])
);

const EVOLUTION_ACTION_DEFINITIONS = {
  'status-already-correct': {
    terminal: false,
    defaultTargetStatus: null
  },
  'upgrade-existing-skill': {
    terminal: false,
    defaultTargetStatus: null
  },
  'promote-to-stable': {
    terminal: true,
    defaultTargetStatus: 'stable'
  },
  'deprecate-skill': {
    terminal: true,
    defaultTargetStatus: 'deprecated'
  },
  'archive-skill': {
    terminal: true,
    defaultTargetStatus: 'archived'
  },
  'delete-skill': {
    terminal: true,
    defaultTargetStatus: 'deleted'
  },
  'merge-into-skill': {
    terminal: true,
    defaultTargetStatus: null
  }
};

const EVOLUTION_DECISION_ACTIONS = new Set(Object.keys(EVOLUTION_ACTION_DEFINITIONS));
const EVOLUTION_ACTION_DEFAULT_TARGET_STATUS = new Map(
  Object.entries(EVOLUTION_ACTION_DEFINITIONS)
    .filter(([, definition]) => definition.defaultTargetStatus)
    .map(([action, definition]) => [action, definition.defaultTargetStatus])
);

function normalizeSkillStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function normalizeRuntimeProofLevel(level) {
  return String(level || '').trim();
}

function normalizeEvolutionAction(action) {
  return String(action || '').trim();
}

function getSkillStatusDefinition(status) {
  return SKILL_STATUS_DEFINITIONS[normalizeSkillStatus(status)] || null;
}

function isKnownSkillStatus(status) {
  return ALL_SKILL_STATUSES.has(normalizeSkillStatus(status));
}

function isWritableSkillStatus(status) {
  return WRITABLE_SKILL_STATUSES.has(normalizeSkillStatus(status));
}

function isLiveSkillStatus(status) {
  const definition = getSkillStatusDefinition(status);
  return Boolean(definition && definition.live);
}

function isReviewGovernedSkillStatus(status) {
  const definition = getSkillStatusDefinition(status);
  return Boolean(definition && definition.reviewGoverned);
}

function isRuntimeProofGovernedSkillStatus(status) {
  const definition = getSkillStatusDefinition(status);
  return Boolean(definition && definition.runtimeProofGoverned);
}

function getSkillLevelBucketForStatus(status) {
  const definition = getSkillStatusDefinition(status);
  return definition ? definition.skillLevelBucket : null;
}

function getDefaultRuntimeProofLevelForStatus(status) {
  const definition = getSkillStatusDefinition(status);
  return definition ? definition.defaultRuntimeProofLevel : 'declared-only';
}

function isKnownRuntimeProofLevel(level) {
  return RUNTIME_PROOF_LEVELS.has(normalizeRuntimeProofLevel(level));
}

function compareRuntimeProofLevels(left, right) {
  const normalizedLeft = normalizeRuntimeProofLevel(left);
  const normalizedRight = normalizeRuntimeProofLevel(right);
  const leftIndex = RUNTIME_PROOF_LEVEL_INDEX.get(normalizedLeft);
  const rightIndex = RUNTIME_PROOF_LEVEL_INDEX.get(normalizedRight);

  if (leftIndex == null || rightIndex == null) {
    return null;
  }
  if (leftIndex === rightIndex) {
    return 0;
  }
  return leftIndex < rightIndex ? -1 : 1;
}

function maxRuntimeProofLevel(left, right) {
  const comparison = compareRuntimeProofLevels(left, right);
  if (comparison == null) {
    return isKnownRuntimeProofLevel(left) ? normalizeRuntimeProofLevel(left) : normalizeRuntimeProofLevel(right);
  }
  return comparison >= 0 ? normalizeRuntimeProofLevel(left) : normalizeRuntimeProofLevel(right);
}

function getTargetRuntimeProofLevelForStatus(status) {
  return getDefaultRuntimeProofLevelForStatus(status);
}

function shouldAutoPromoteRuntimeProofLevel(currentLevel, status) {
  const normalizedCurrent = normalizeRuntimeProofLevel(currentLevel);
  if (!isKnownRuntimeProofLevel(normalizedCurrent)) {
    return false;
  }
  const targetLevel = getTargetRuntimeProofLevelForStatus(status);
  const comparison = compareRuntimeProofLevels(normalizedCurrent, targetLevel);
  return comparison != null && comparison < 0;
}

function getAutoPromotedRuntimeProofLevel(currentLevel, status) {
  const normalizedCurrent = normalizeRuntimeProofLevel(currentLevel);
  if (!isKnownRuntimeProofLevel(normalizedCurrent)) {
    return getTargetRuntimeProofLevelForStatus(status);
  }
  return shouldAutoPromoteRuntimeProofLevel(normalizedCurrent, status)
    ? getTargetRuntimeProofLevelForStatus(status)
    : normalizedCurrent;
}

function getEvolutionActionDefinition(action) {
  return EVOLUTION_ACTION_DEFINITIONS[normalizeEvolutionAction(action)] || null;
}

function isKnownEvolutionAction(action) {
  return EVOLUTION_DECISION_ACTIONS.has(normalizeEvolutionAction(action));
}

function getDefaultTargetStatusForEvolutionAction(action) {
  const definition = getEvolutionActionDefinition(action);
  return definition ? definition.defaultTargetStatus : null;
}

module.exports = {
  SKILL_STATUS_ORDER,
  ALL_SKILL_STATUSES,
  WRITABLE_SKILL_STATUSES,
  LIVE_SKILL_STATUSES,
  REVIEW_GOVERNED_SKILL_STATUSES,
  RUNTIME_PROOF_GOVERNED_SKILL_STATUSES,
  SKILL_LEVEL_BUCKET_BY_STATUS,
  RUNTIME_PROOF_LEVELS,
  RUNTIME_PROOF_LEVEL_ORDER,
  RUNTIME_PROOF_LEVEL_INDEX,
  EVOLUTION_DECISION_ACTIONS,
  EVOLUTION_ACTION_DEFAULT_TARGET_STATUS,
  getSkillStatusDefinition,
  isKnownSkillStatus,
  isWritableSkillStatus,
  isLiveSkillStatus,
  isReviewGovernedSkillStatus,
  isRuntimeProofGovernedSkillStatus,
  getSkillLevelBucketForStatus,
  getDefaultRuntimeProofLevelForStatus,
  getTargetRuntimeProofLevelForStatus,
  isKnownRuntimeProofLevel,
  compareRuntimeProofLevels,
  maxRuntimeProofLevel,
  shouldAutoPromoteRuntimeProofLevel,
  getAutoPromotedRuntimeProofLevel,
  getEvolutionActionDefinition,
  isKnownEvolutionAction,
  getDefaultTargetStatusForEvolutionAction
};
