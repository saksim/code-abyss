'use strict';

const EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION = 2;
const EXPERT_SOURCE_INTEGRATION_MODE = 'capability-modules';
const EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION = 1;
const EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION = 1;

const DEFAULT_EXPERT_SOURCE_FAMILY_NAME = 'top-developer';
const DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE = 'registry/top-developer-integration.generated.json';
const DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT = '../top_developer';

const EXPERT_SOURCE_FAMILY_STATUS_DEFINITIONS = Object.freeze({
  active: {
    active: true,
    experimentalPackRequired: true
  },
  archived: {
    active: false,
    experimentalPackRequired: false
  }
});

const EXPERT_SOURCE_FAMILY_STATUS_ORDER = Object.freeze(Object.keys(EXPERT_SOURCE_FAMILY_STATUS_DEFINITIONS));
const ACTIVE_EXPERT_SOURCE_FAMILY_STATUSES = new Set(
  EXPERT_SOURCE_FAMILY_STATUS_ORDER.filter((status) => EXPERT_SOURCE_FAMILY_STATUS_DEFINITIONS[status].active)
);

const EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_DEFINITIONS = Object.freeze({
  aligned: {
    activeFamily: true,
    included: true,
    required: true
  },
  'missing-active-include': {
    activeFamily: true,
    included: false,
    required: true
  },
  'archived-still-included': {
    activeFamily: false,
    included: true,
    required: false
  },
  'not-required': {
    activeFamily: false,
    included: false,
    required: false
  }
});

const EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER = Object.freeze(
  Object.keys(EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_DEFINITIONS)
);

const EXPERT_SOURCE_FAMILY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES = Object.freeze([
  'registry/expert-source-families.generated.json',
  'registry/expert-source-families.schema.json',
  'registry/expert-source-family-scorecard.generated.json',
  'registry/expert-source-family-scorecard.schema.json',
  'registry/expert-source-integration.schema.json',
  DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE
]);

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function slugToSnake(slug) {
  return normalizeString(slug).replace(/-/g, '_');
}

function normalizeExpertSourceFamilyStatus(value, fallback = 'active') {
  const normalized = normalizeString(value).toLowerCase();
  return EXPERT_SOURCE_FAMILY_STATUS_DEFINITIONS[normalized] ? normalized : fallback;
}

function isKnownExpertSourceFamilyStatus(value) {
  return EXPERT_SOURCE_FAMILY_STATUS_ORDER.includes(normalizeString(value).toLowerCase());
}

function isActiveExpertSourceFamilyStatus(value) {
  return ACTIVE_EXPERT_SOURCE_FAMILY_STATUSES.has(normalizeExpertSourceFamilyStatus(value));
}

function isActiveExpertSourceFamily(family) {
  return isActiveExpertSourceFamilyStatus(family && family.status);
}

function isDefaultExpertSourceFamily(familyOrId) {
  const familyId = typeof familyOrId === 'object' && familyOrId !== null
    ? familyOrId.id
    : familyOrId;
  return normalizeString(familyId) === DEFAULT_EXPERT_SOURCE_FAMILY_NAME;
}

function canArchiveExpertSourceFamily(familyOrId) {
  return !isDefaultExpertSourceFamily(familyOrId);
}

function isValidExpertSourceFamilyId(familyId) {
  return EXPERT_SOURCE_FAMILY_ID_PATTERN.test(normalizeString(familyId));
}

function normalizeExpertSourceExperimentalPackStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  return EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_DEFINITIONS[normalized] ? normalized : null;
}

function isKnownExpertSourceExperimentalPackStatus(value) {
  return EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER.includes(normalizeString(value).toLowerCase());
}

function getDefaultExpertSourceIntegrationFile(familyId) {
  const normalized = normalizeString(familyId);
  return normalized
    ? `registry/${normalized}-integration.generated.json`
    : 'registry/expert-source-integration.generated.json';
}

function getDefaultExpertSourceRawRoot(familyId) {
  const normalized = slugToSnake(familyId);
  return normalized ? `../${normalized}` : '../expert_source';
}

function getRequiredExperimentalPackExpertSourceIncludes(families = []) {
  const includes = new Set(EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES);
  for (const family of Array.isArray(families) ? families : []) {
    if (!isActiveExpertSourceFamily(family)) {
      continue;
    }
    const integrationFile = normalizeString(family && family.integrationFile);
    if (integrationFile) {
      includes.add(integrationFile);
    }
  }
  return [...includes].sort((left, right) => left.localeCompare(right));
}

module.exports = {
  EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
  EXPERT_SOURCE_INTEGRATION_MODE,
  EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION,
  EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION,
  DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
  DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE,
  DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT,
  EXPERT_SOURCE_FAMILY_STATUS_ORDER,
  ACTIVE_EXPERT_SOURCE_FAMILY_STATUSES,
  EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER,
  EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES,
  normalizeExpertSourceFamilyStatus,
  isKnownExpertSourceFamilyStatus,
  isActiveExpertSourceFamilyStatus,
  isActiveExpertSourceFamily,
  isDefaultExpertSourceFamily,
  canArchiveExpertSourceFamily,
  isValidExpertSourceFamilyId,
  normalizeExpertSourceExperimentalPackStatus,
  isKnownExpertSourceExperimentalPackStatus,
  getDefaultExpertSourceIntegrationFile,
  getDefaultExpertSourceRawRoot,
  getRequiredExperimentalPackExpertSourceIncludes
};
