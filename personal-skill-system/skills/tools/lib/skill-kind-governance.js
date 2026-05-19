'use strict';

const SKILL_KIND_DEFINITIONS = {
  router: {
    layer: 'routers',
    minReferenceFiles: 2,
    topTierReferenceFloor: 2,
    templateReferenceFloor: 2,
    participatesInActiveRouteSurface: false,
    supportsGovernedRouteArtifacts: false,
    participatesInSkillLevelSummary: true,
    createPlaceholderRoute: false,
    trackScaffoldLineage: false,
    scriptedTemplate: false,
    capabilityModuleScaffold: false,
    placeholderRoute: null,
    capabilityModuleDescriptions: {}
  },
  domain: {
    layer: 'domains',
    minReferenceFiles: 2,
    topTierReferenceFloor: 3,
    templateReferenceFloor: 3,
    participatesInActiveRouteSurface: true,
    supportsGovernedRouteArtifacts: true,
    participatesInSkillLevelSummary: true,
    createPlaceholderRoute: true,
    trackScaffoldLineage: true,
    scriptedTemplate: false,
    capabilityModuleScaffold: true,
    placeholderRoute: {
      priority: 40,
      namespace: 'domain',
      intentTags: ['knowledge'],
      primaryIntent: 'newly created domain placeholder route'
    },
    capabilityModuleDescriptions: {
      'decision-rules': 'Capture the domain\'s default judgement rules, tradeoffs, and anti-pattern boundaries.',
      'deep-reference-index': 'Map the deeper subtopics and expansion points behind the domain surface.',
      'boundaries-and-escalations': 'Declare abstention rules, edge conditions, and handoff triggers for adjacent skills.'
    }
  },
  workflow: {
    layer: 'workflows',
    minReferenceFiles: 2,
    topTierReferenceFloor: 3,
    templateReferenceFloor: 3,
    participatesInActiveRouteSurface: true,
    supportsGovernedRouteArtifacts: true,
    participatesInSkillLevelSummary: true,
    createPlaceholderRoute: true,
    trackScaffoldLineage: true,
    scriptedTemplate: false,
    capabilityModuleScaffold: true,
    placeholderRoute: {
      priority: 40,
      namespace: 'workflow',
      intentTags: ['execute'],
      primaryIntent: 'newly created workflow placeholder route'
    },
    capabilityModuleDescriptions: {
      'entry-and-exit-criteria': 'Define prerequisites, completion signals, and clean handoff exits for the workflow.',
      'verification-checklist': 'Capture the workflow\'s proof checklist and required validation chain.',
      'failure-modes': 'Capture recovery rules, abort conditions, and escalation behavior when the workflow breaks down.'
    }
  },
  tool: {
    layer: 'tools',
    minReferenceFiles: 2,
    topTierReferenceFloor: 2,
    templateReferenceFloor: 2,
    participatesInActiveRouteSurface: true,
    supportsGovernedRouteArtifacts: true,
    participatesInSkillLevelSummary: true,
    createPlaceholderRoute: true,
    trackScaffoldLineage: true,
    scriptedTemplate: true,
    templateHostMetadata: true,
    capabilityModuleScaffold: false,
    placeholderRoute: {
      priority: 40,
      namespace: 'tool',
      intentTags: ['validate'],
      primaryIntent: 'newly created tool placeholder route'
    },
    capabilityModuleDescriptions: {}
  },
  guard: {
    layer: 'guards',
    minReferenceFiles: 2,
    topTierReferenceFloor: 2,
    templateReferenceFloor: 2,
    participatesInActiveRouteSurface: true,
    supportsGovernedRouteArtifacts: true,
    participatesInSkillLevelSummary: true,
    createPlaceholderRoute: true,
    trackScaffoldLineage: true,
    scriptedTemplate: true,
    templateHostMetadata: true,
    capabilityModuleScaffold: false,
    placeholderRoute: {
      priority: 40,
      namespace: 'guard',
      intentTags: ['validate', 'release'],
      primaryIntent: 'newly created guard placeholder route'
    },
    capabilityModuleDescriptions: {}
  },
  adapter: {
    layer: 'adapters',
    minReferenceFiles: 2,
    topTierReferenceFloor: 2,
    templateReferenceFloor: 2,
    participatesInActiveRouteSurface: false,
    supportsGovernedRouteArtifacts: false,
    participatesInSkillLevelSummary: false,
    createPlaceholderRoute: false,
    trackScaffoldLineage: false,
    scriptedTemplate: false,
    templateHostMetadata: true,
    capabilityModuleScaffold: false,
    placeholderRoute: {
      priority: 40,
      namespace: 'adapter',
      intentTags: ['knowledge'],
      primaryIntent: 'newly created adapter placeholder route'
    },
    capabilityModuleDescriptions: {}
  }
};

const SKILL_KIND_ORDER = Object.freeze(Object.keys(SKILL_KIND_DEFINITIONS));
const TEMPLATE_KINDS = Object.freeze([...SKILL_KIND_ORDER]);
const ALL_SKILL_KINDS = new Set(SKILL_KIND_ORDER);
const KIND_TO_LAYER_MAP = new Map(SKILL_KIND_ORDER.map((kind) => [kind, SKILL_KIND_DEFINITIONS[kind].layer]));
const KIND_BY_LAYER = Object.freeze(
  Object.fromEntries(SKILL_KIND_ORDER.map((kind) => [SKILL_KIND_DEFINITIONS[kind].layer, kind]))
);
const MIN_REFERENCE_FILES_BY_KIND = Object.freeze(
  Object.fromEntries(SKILL_KIND_ORDER.map((kind) => [kind, SKILL_KIND_DEFINITIONS[kind].minReferenceFiles]))
);
const TOP_TIER_REFERENCE_FLOOR_BY_KIND = Object.freeze(
  Object.fromEntries(SKILL_KIND_ORDER.map((kind) => [kind, SKILL_KIND_DEFINITIONS[kind].topTierReferenceFloor]))
);
const TEMPLATE_REFERENCE_FLOOR_BY_KIND = Object.freeze(
  Object.fromEntries(SKILL_KIND_ORDER.map((kind) => [kind, SKILL_KIND_DEFINITIONS[kind].templateReferenceFloor]))
);
const SCRIPTED_TEMPLATE_KINDS = new Set(
  SKILL_KIND_ORDER.filter((kind) => SKILL_KIND_DEFINITIONS[kind].scriptedTemplate)
);
const CAPABILITY_MODULE_SCAFFOLD_KINDS = new Set(
  SKILL_KIND_ORDER.filter((kind) => SKILL_KIND_DEFINITIONS[kind].capabilityModuleScaffold)
);

function normalizeSkillKind(kind) {
  return String(kind || '').trim().toLowerCase();
}

function getSkillKindDefinition(kind) {
  return SKILL_KIND_DEFINITIONS[normalizeSkillKind(kind)] || null;
}

function isKnownSkillKind(kind) {
  return ALL_SKILL_KINDS.has(normalizeSkillKind(kind));
}

function getLayerForKind(kind) {
  const definition = getSkillKindDefinition(kind);
  return definition ? definition.layer : null;
}

function getKindForLayer(layer) {
  return KIND_BY_LAYER[String(layer || '').trim()] || null;
}

function getMinReferenceFilesForKind(kind) {
  const definition = getSkillKindDefinition(kind);
  return definition ? definition.minReferenceFiles : 0;
}

function getTopTierReferenceFloorForKind(kind) {
  const definition = getSkillKindDefinition(kind);
  return definition ? definition.topTierReferenceFloor : 0;
}

function getTemplateReferenceFloorForKind(kind) {
  const definition = getSkillKindDefinition(kind);
  return definition ? definition.templateReferenceFloor : 0;
}

function isRoutedSkillKind(kind) {
  const definition = getSkillKindDefinition(kind);
  return Boolean(definition && definition.participatesInActiveRouteSurface);
}

function supportsGovernedRouteArtifacts(kind) {
  const definition = getSkillKindDefinition(kind);
  return Boolean(definition && definition.supportsGovernedRouteArtifacts);
}

function shouldAppearOnActiveRouteSurface(record) {
  return !!record
    && record.userInvocable === true
    && isRoutedSkillKind(record.kind)
    && String(record.status || '').trim() !== 'archived';
}

function shouldCreatePlaceholderRoute(kind, userInvocable = true) {
  const definition = getSkillKindDefinition(kind);
  return Boolean(definition && definition.createPlaceholderRoute && userInvocable);
}

function getPlaceholderRouteConfig(kind) {
  const definition = getSkillKindDefinition(kind);
  if (!definition || !definition.placeholderRoute) {
    return null;
  }
  return {
    ...definition.placeholderRoute,
    intentTags: Array.isArray(definition.placeholderRoute.intentTags)
      ? [...definition.placeholderRoute.intentTags]
      : []
  };
}

function getRequiredIntentTagsForKind(kind) {
  const config = getPlaceholderRouteConfig(kind);
  return config ? [...config.intentTags] : [];
}

function supportsCapabilityModuleScaffold(kind) {
  return CAPABILITY_MODULE_SCAFFOLD_KINDS.has(normalizeSkillKind(kind));
}

function getCapabilityModuleScaffoldKinds() {
  return SKILL_KIND_ORDER.filter((kind) => supportsCapabilityModuleScaffold(kind));
}

function describeCapabilityModuleScaffoldKinds() {
  const kinds = getCapabilityModuleScaffoldKinds();
  if (kinds.length < 1) {
    return 'no governed skill kinds';
  }
  if (kinds.length === 1) {
    return kinds[0];
  }
  if (kinds.length === 2) {
    return `${kinds[0]} and ${kinds[1]}`;
  }
  return `${kinds.slice(0, -1).join(', ')}, and ${kinds[kinds.length - 1]}`;
}

function getCapabilityModuleDescriptions(kind) {
  const definition = getSkillKindDefinition(kind);
  return definition ? { ...definition.capabilityModuleDescriptions } : {};
}

function shouldTrackScaffoldLineage(kind) {
  const definition = getSkillKindDefinition(kind);
  return Boolean(definition && definition.trackScaffoldLineage);
}

function shouldSyncGovernedRouteArtifacts(record) {
  return !!record
    && record.userInvocable === true
    && supportsGovernedRouteArtifacts(record.kind)
    && String(record.status || '').trim() !== 'archived';
}

function participatesInSkillLevelSummary(kind) {
  const definition = getSkillKindDefinition(kind);
  return Boolean(definition && definition.participatesInSkillLevelSummary);
}

function shouldAppearInSkillLevelSummary(record) {
  return !!record
    && String(record.status || '').trim() !== 'archived'
    && participatesInSkillLevelSummary(record.kind);
}

function templateRequiresHostMetadata(kind) {
  const definition = getSkillKindDefinition(kind);
  return Boolean(definition) && definition.templateHostMetadata !== false;
}

module.exports = {
  SKILL_KIND_ORDER,
  TEMPLATE_KINDS,
  ALL_SKILL_KINDS,
  KIND_TO_LAYER_MAP,
  KIND_BY_LAYER,
  MIN_REFERENCE_FILES_BY_KIND,
  TOP_TIER_REFERENCE_FLOOR_BY_KIND,
  TEMPLATE_REFERENCE_FLOOR_BY_KIND,
  SCRIPTED_TEMPLATE_KINDS,
  CAPABILITY_MODULE_SCAFFOLD_KINDS,
  getSkillKindDefinition,
  isKnownSkillKind,
  getLayerForKind,
  getKindForLayer,
  getMinReferenceFilesForKind,
  getTopTierReferenceFloorForKind,
  getTemplateReferenceFloorForKind,
  isRoutedSkillKind,
  supportsGovernedRouteArtifacts,
  shouldAppearOnActiveRouteSurface,
  shouldCreatePlaceholderRoute,
  getPlaceholderRouteConfig,
  getRequiredIntentTagsForKind,
  supportsCapabilityModuleScaffold,
  getCapabilityModuleScaffoldKinds,
  describeCapabilityModuleScaffoldKinds,
  getCapabilityModuleDescriptions,
  shouldTrackScaffoldLineage,
  shouldSyncGovernedRouteArtifacts,
  participatesInSkillLevelSummary,
  shouldAppearInSkillLevelSummary,
  templateRequiresHostMetadata
};
