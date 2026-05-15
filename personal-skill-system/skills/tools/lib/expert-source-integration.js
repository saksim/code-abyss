'use strict';

const fs = require('fs');
const path = require('path');
const { parseJsonFile, rel } = require('./skill-system-common');
const {
  getGovernanceArtifactPath
} = require('./skill-generated-artifact-governance');
const {
  EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
  EXPERT_SOURCE_INTEGRATION_MODE,
  EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION,
  EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION,
  DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
  DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE,
  DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT,
  normalizeExpertSourceExperimentalPackStatus,
  normalizeExpertSourceFamilyStatus,
  isActiveExpertSourceFamily,
  getDefaultExpertSourceIntegrationFile,
  getDefaultExpertSourceRawRoot
} = require('./skill-expert-source-governance');

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

function listDifference(left, right) {
  const rightSet = new Set(Array.isArray(right) ? right : []);
  return (Array.isArray(left) ? left : []).filter((item) => !rightSet.has(item));
}

function slugToTitle(slug) {
  return normalizeString(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugToSnake(slug) {
  return normalizeString(slug)
    .replace(/-/g, '_');
}

function getExpertSourceFamiliesPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'expert-source-families');
}

function getExpertSourceFamilyScorecardPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'expert-source-family-scorecard');
}

function createExpertSourceFamily(config = {}) {
  const id = normalizeString(config.id);
  const integrationFile = normalizeString(config.integrationFile) || getDefaultExpertSourceIntegrationFile(id);
  const rawRoot = normalizeString(config.rawRoot) || getDefaultExpertSourceRawRoot(id);
  const source = normalizeString(config.source) || id;
  const title = normalizeString(config.title) || slugToTitle(id || 'expert-source');
  const label = normalizeString(config.label) || `${title.toLowerCase()} integration`;
  const rawSourceLabel = normalizeString(config.rawSourceLabel) || `${title.toLowerCase()} raw source`;
  const unmappedReason = normalizeString(config.unmappedReason) || 'exists outside governed integration coverage';
  const staleReason = normalizeString(config.staleReason) || 'is still mapped but the raw source is missing locally';

  return {
    id,
    title,
    source,
    label,
    rawSourceLabel,
    integrationFile,
    rawRoot,
    status: normalizeExpertSourceFamilyStatus(config.status),
    schemaVersion: Number(config.schemaVersion || EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION),
    integrationMode: normalizeString(config.integrationMode) || EXPERT_SOURCE_INTEGRATION_MODE,
    expectedPortable: config.expectedPortable !== false,
    parseErrorSummary: normalizeString(config.parseErrorSummary) || `Repair ${label} registry before the next expert-source extraction.`,
    unmappedSummaryTemplate: normalizeString(config.unmappedSummaryTemplate) || `Integrate raw ${title.toLowerCase()} source '%s' into governed capability modules.`,
    unmappedReason,
    staleReason,
    backlogFollowUp: Array.isArray(config.backlogFollowUp) ? config.backlogFollowUp : [],
    sourceDescription: normalizeString(config.sourceDescription)
      || `${integrationFile}${rawRoot ? ` + ${rawRoot}/**/SKILL.md when present` : ''}`
  };
}

function buildDefaultExpertSourceFamilies() {
  return [
    createExpertSourceFamily({
      id: DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
      title: 'Top Developer',
      source: 'top-developer-integration',
      label: 'top-developer integration',
      rawSourceLabel: 'raw expert source',
      integrationFile: DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE,
      rawRoot: DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT,
      unmappedReason: 'exists outside governed top-developer integration coverage',
      staleReason: 'is still mapped by top-developer integration but the raw top_developer source is missing locally',
      sourceDescription: `${DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE} + ${DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT}/**/SKILL.md when present`,
      backlogFollowUp: [
        'review top_developer/%s/SKILL.md and decide extract-vs-admit',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show skill-evolution'
      ]
    })
  ];
}

function loadExpertSourceFamilies(bundleRoot) {
  const file = getExpertSourceFamiliesPath(bundleRoot);
  const parsed = parseJsonFile(file);
  const defaults = buildDefaultExpertSourceFamilies();

  if (parsed.error) {
    return {
      file,
      error: parsed.error,
      data: null,
      families: defaults
    };
  }

  const data = parsed.data || {};
  const entries = Array.isArray(data.families) ? data.families : [];
  const families = entries
    .map((entry) => createExpertSourceFamily(entry))
    .filter((entry) => entry.id && entry.integrationFile);

  return {
    file,
    error: null,
    data,
    families: families.length > 0 ? families : defaults
  };
}

function normalizeExpertSourceFamiliesDocument(data = {}) {
  const entries = Array.isArray(data && data.families) ? data.families : [];
  const seen = new Set();
  const families = entries
    .map((entry) => createExpertSourceFamily(entry))
    .filter((family) => {
      if (!family.id || seen.has(family.id)) {
        return false;
      }
      seen.add(family.id);
      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    'schema-version': EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION,
    families
  };
}

function buildEmptyExpertSourceIntegration(family = {}) {
  return {
    'schema-version': Number(family.schemaVersion || EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION),
    'integration-mode': normalizeString(family.integrationMode) || EXPERT_SOURCE_INTEGRATION_MODE,
    portable: family.expectedPortable !== false,
    'module-count': 0,
    groups: [],
    modules: [],
    'source-index': []
  };
}

function buildRegistryModuleIndex(registryData) {
  const registrySkills = Array.isArray(registryData && registryData.skills) ? registryData.skills : [];
  const moduleGroups = Array.isArray(registryData && registryData['module-groups']) ? registryData['module-groups'] : [];
  const skillByName = new Map();
  const moduleById = new Map();
  const modulesByHostSkill = new Map();

  for (const entry of registrySkills) {
    const name = normalizeString(entry && entry.name);
    if (!name) continue;
    skillByName.set(name, {
      kind: normalizeString(entry && entry.kind),
      path: normalizeString(entry && entry.path)
    });
  }

  for (const group of moduleGroups) {
    const hostSkill = normalizeString(group && group['host-skill']);
    if (!hostSkill) continue;

    const registrySkill = skillByName.get(hostSkill) || {};
    const hostKind = normalizeString(group && group['host-kind']) || normalizeString(registrySkill.kind);
    const hostPath = normalizeString(registrySkill.path);
    const moduleIds = [];

    for (const module of Array.isArray(group && group.modules) ? group.modules : []) {
      const moduleId = normalizeString(module && module.id);
      if (!moduleId) continue;

      moduleIds.push(moduleId);
      moduleById.set(moduleId, {
        id: moduleId,
        path: normalizeString(module && module.path),
        capability: normalizeString(module && module.capability),
        'host-skill': hostSkill,
        'host-kind': hostKind,
        'host-path': hostPath
      });
    }

    modulesByHostSkill.set(hostSkill, {
      'host-skill': hostSkill,
      'host-kind': hostKind,
      'host-path': hostPath,
      modules: uniqueSorted(moduleIds)
    });
  }

  return {
    skillByName,
    moduleById,
    modulesByHostSkill
  };
}

function resolveRawSourceRoot(bundleRoot, family) {
  if (!family || !family.rawRoot) {
    return null;
  }
  return path.resolve(bundleRoot, family.rawRoot);
}

function getExpertSourceIntegrationPath(bundleRoot, family) {
  return path.join(bundleRoot, normalizeString(family && family.integrationFile));
}

function readExperimentalPackManifest(bundleRoot) {
  const file = path.join(bundleRoot, 'packs', 'experimental', 'manifest.json');
  const parsed = parseJsonFile(file);
  const data = parsed.data || {};
  return {
    file,
    error: parsed.error || null,
    data,
    includes: Array.isArray(data.includes) ? data.includes.map((item) => normalizeString(item)).filter(Boolean) : []
  };
}

function classifyExperimentalPackFamilyStatus(family, includes = []) {
  const integrationFile = normalizeString(family && family.integrationFile);
  const included = integrationFile ? includes.includes(integrationFile) : false;
  const required = isActiveExpertSourceFamily(family);

  if (required) {
    return {
      required,
      included,
      status: normalizeExpertSourceExperimentalPackStatus(included ? 'aligned' : 'missing-active-include')
    };
  }

  return {
    required,
    included,
    status: normalizeExpertSourceExperimentalPackStatus(included ? 'archived-still-included' : 'not-required')
  };
}

function collectRawExpertSources(bundleRoot, family) {
  const root = resolveRawSourceRoot(bundleRoot, family);
  if (!root) {
    return {
      root: null,
      exists: false,
      skills: []
    };
  }

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return {
      root,
      exists: false,
      skills: []
    };
  }

  const skills = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(root, name, 'SKILL.md')))
    .sort((left, right) => left.localeCompare(right));

  return {
    root,
    exists: true,
    skills
  };
}

function summarizeExpertSourceIntegrationFamily(bundleRoot, family, registryData = {}, registryIndex = null) {
  const integrationPath = getExpertSourceIntegrationPath(bundleRoot, family);
  const rawSourceCatalog = collectRawExpertSources(bundleRoot, family);
  const parsed = parseJsonFile(integrationPath);
  const resolvedRegistryIndex = registryIndex || buildRegistryModuleIndex(registryData);

  if (parsed.error) {
    return {
      family,
      integrationPath,
      parseError: parsed.error,
      data: {},
      groups: [],
      modules: [],
      sourceIndex: [],
      rawSourceCatalog,
      registryIndex: resolvedRegistryIndex,
      integratedSourceSkills: [],
      integratedModuleIds: [],
      unmappedRawSources: rawSourceCatalog.exists ? [...rawSourceCatalog.skills] : [],
      staleMappedSources: []
    };
  }

  const data = parsed.data || {};
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const modules = Array.isArray(data.modules) ? data.modules : [];
  const sourceIndex = Array.isArray(data['source-index']) ? data['source-index'] : [];
  const integratedSourceSkills = uniqueSorted([
    ...sourceIndex.map((entry) => entry && entry['source-skill']),
    ...modules.flatMap((entry) => Array.isArray(entry && entry['derived-from']) ? entry['derived-from'] : [])
  ]);
  const integratedModuleIds = uniqueSorted(modules.map((entry) => entry && entry.module));
  const rawSourceSet = new Set(rawSourceCatalog.skills);
  const unmappedRawSources = rawSourceCatalog.exists
    ? rawSourceCatalog.skills.filter((name) => !integratedSourceSkills.includes(name))
    : [];
  const staleMappedSources = rawSourceCatalog.exists
    ? integratedSourceSkills.filter((name) => !rawSourceSet.has(name))
    : [];

  return {
    family,
    integrationPath,
    data,
    groups,
    modules,
    sourceIndex,
    rawSourceCatalog,
    registryIndex: resolvedRegistryIndex,
    integratedSourceSkills,
    integratedModuleIds,
    unmappedRawSources,
    staleMappedSources
  };
}

function validateExpertSourceIntegrationFamily(bundleRoot, family, registryData, findings, registryIndex = null) {
  const summary = summarizeExpertSourceIntegrationFamily(bundleRoot, family, registryData, registryIndex);
  const integrationFile = rel(bundleRoot, summary.integrationPath);

  if (summary.parseError) {
    findings.push({
      severity: 'error',
      file: integrationFile,
      message: `${family.label} parse failed: ${summary.parseError}`
    });
    return summary;
  }

  const data = summary.data || {};
  if (data['schema-version'] !== family.schemaVersion) {
    findings.push({
      severity: 'error',
      file: integrationFile,
      message: `${family.label} has unsupported schema-version '${data['schema-version']}'`
    });
  }
  if (normalizeString(data['integration-mode']) !== family.integrationMode) {
    findings.push({
      severity: 'error',
      file: integrationFile,
      message: `${family.label} has unsupported integration-mode '${normalizeString(data['integration-mode']) || 'missing'}'`
    });
  }
  if (family.expectedPortable && data.portable !== true) {
    findings.push({
      severity: 'error',
      file: integrationFile,
      message: `${family.label} must declare portable=true`
    });
  }
  if (Number(data['module-count'] || 0) !== summary.modules.length) {
    findings.push({
      severity: 'error',
      file: integrationFile,
      message: `${family.label} module-count (${Number(data['module-count'] || 0)}) does not match modules length (${summary.modules.length})`
    });
  }

  const registryModuleById = summary.registryIndex.moduleById;
  const modulesByHostSkill = new Map();
  const modulesBySourceSkill = new Map();
  const seenModules = new Set();

  for (const entry of summary.modules) {
    const moduleId = normalizeString(entry && entry.module);
    if (!moduleId) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module entry is missing module`
      });
      continue;
    }
    if (seenModules.has(moduleId)) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} duplicates module '${moduleId}'`
      });
      continue;
    }
    seenModules.add(moduleId);

    const registryModule = registryModuleById.get(moduleId);
    if (!registryModule) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} references unknown capability module '${moduleId}'`
      });
      continue;
    }

    const hostSkill = entry && entry['host-skill'] || {};
    const hostName = normalizeString(hostSkill.name);
    const hostKind = normalizeString(hostSkill.kind);
    const hostPath = normalizeString(hostSkill.path);
    const modulePath = normalizeString(entry && entry.path);
    const capability = normalizeString(entry && entry.capability);
    const derivedFrom = uniqueSorted(entry && entry['derived-from']);

    if (hostName !== registryModule['host-skill']) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module '${moduleId}' maps host skill '${hostName || 'missing'}' but registry owns '${registryModule['host-skill']}'`
      });
    }
    if (hostKind !== registryModule['host-kind']) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module '${moduleId}' maps host kind '${hostKind || 'missing'}' but registry owns '${registryModule['host-kind']}'`
      });
    }
    if (hostPath !== registryModule['host-path']) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module '${moduleId}' maps host path '${hostPath || 'missing'}' but registry owns '${registryModule['host-path']}'`
      });
    }
    if (modulePath !== registryModule.path) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module '${moduleId}' path '${modulePath || 'missing'}' is out of sync with registry path '${registryModule.path}'`
      });
    }
    if (capability !== registryModule.capability) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module '${moduleId}' capability text is out of sync with registry metadata`
      });
    }
    if (derivedFrom.length < 1) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} module '${moduleId}' is missing derived-from provenance`
      });
    }

    modulesByHostSkill.set(
      registryModule['host-skill'],
      uniqueSorted([
        ...(modulesByHostSkill.get(registryModule['host-skill']) || []),
        moduleId
      ])
    );

    for (const sourceSkill of derivedFrom) {
      modulesBySourceSkill.set(
        sourceSkill,
        uniqueSorted([
          ...(modulesBySourceSkill.get(sourceSkill) || []),
          moduleId
        ])
      );
    }
  }

  const seenGroups = new Set();
  for (const group of summary.groups) {
    const name = normalizeString(group && group.name);
    const kind = normalizeString(group && group.kind);
    const moduleIds = uniqueSorted(group && group.modules);
    if (!name) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} group is missing name`
      });
      continue;
    }
    if (seenGroups.has(name)) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} duplicates group '${name}'`
      });
      continue;
    }
    seenGroups.add(name);

    const registryGroup = summary.registryIndex.modulesByHostSkill.get(name);
    if (!registryGroup) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} group '${name}' references unknown host skill`
      });
      continue;
    }
    if (kind !== registryGroup['host-kind']) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} group '${name}' kind '${kind || 'missing'}' is out of sync with registry kind '${registryGroup['host-kind']}'`
      });
    }

    const expectedModules = modulesByHostSkill.get(name) || [];
    const missing = listDifference(expectedModules, moduleIds);
    const extra = listDifference(moduleIds, expectedModules);
    if (missing.length > 0 || extra.length > 0) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} group '${name}' modules are out of sync (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`
      });
    }
  }

  for (const hostSkill of modulesByHostSkill.keys()) {
    if (!seenGroups.has(hostSkill)) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} is missing group coverage for host skill '${hostSkill}'`
      });
    }
  }

  const seenSourceIndex = new Set();
  const sourceIndexModules = new Map();
  for (const entry of summary.sourceIndex) {
    const sourceSkill = normalizeString(entry && entry['source-skill']);
    const moduleIds = uniqueSorted(entry && entry.modules);
    if (!sourceSkill) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} source-index entry is missing source-skill`
      });
      continue;
    }
    if (seenSourceIndex.has(sourceSkill)) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} duplicates source-index entry '${sourceSkill}'`
      });
      continue;
    }
    seenSourceIndex.add(sourceSkill);
    sourceIndexModules.set(sourceSkill, moduleIds);

    const unknownModules = moduleIds.filter((moduleId) => !seenModules.has(moduleId));
    if (unknownModules.length > 0) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} source-index '${sourceSkill}' references unknown modules: ${unknownModules.join(', ')}`
      });
    }
  }

  const allSourceSkills = uniqueSorted([
    ...seenSourceIndex,
    ...modulesBySourceSkill.keys()
  ]);
  for (const sourceSkill of allSourceSkills) {
    const expectedModules = modulesBySourceSkill.get(sourceSkill) || [];
    const actualModules = sourceIndexModules.get(sourceSkill) || [];
    const missing = listDifference(expectedModules, actualModules);
    const extra = listDifference(actualModules, expectedModules);
    if (missing.length > 0 || extra.length > 0) {
      findings.push({
        severity: 'error',
        file: integrationFile,
        message: `${family.label} source-index '${sourceSkill}' is out of sync with module provenance (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`
      });
    }
  }

  if (summary.rawSourceCatalog.exists) {
    for (const sourceSkill of summary.unmappedRawSources) {
      findings.push({
        severity: 'warning',
        file: rel(bundleRoot, path.join(summary.rawSourceCatalog.root, sourceSkill, 'SKILL.md')),
        message: `${family.rawSourceLabel} '${sourceSkill}' ${family.unmappedReason}`
      });
    }
    for (const sourceSkill of summary.staleMappedSources) {
      findings.push({
        severity: 'warning',
        file: integrationFile,
        message: `${family.label} source '${sourceSkill}' ${family.staleReason}`
      });
    }
  }

  return summary;
}

function summarizeExpertSourceIntegrations(bundleRoot, registryData = {}) {
  const familiesState = loadExpertSourceFamilies(bundleRoot);
  const registryIndex = buildRegistryModuleIndex(registryData);
  const families = familiesState.families.map((family) =>
    summarizeExpertSourceIntegrationFamily(bundleRoot, family, registryData, registryIndex)
  );
  const activeFamilies = families.filter((item) => isActiveExpertSourceFamily(item && item.family));

  const totals = {
    rawSourceSkills: activeFamilies.reduce((sum, item) => sum + (item.rawSourceCatalog.exists ? item.rawSourceCatalog.skills.length : 0), 0),
    integratedSourceSkills: activeFamilies.reduce((sum, item) => sum + item.integratedSourceSkills.length, 0),
    integratedModules: activeFamilies.reduce((sum, item) => sum + item.integratedModuleIds.length, 0),
    unmappedRawSources: activeFamilies.reduce((sum, item) => sum + item.unmappedRawSources.length, 0)
  };

  const byId = new Map(families.map((item) => [item.family.id, item]));
  const primary = byId.get(DEFAULT_EXPERT_SOURCE_FAMILY_NAME) || families[0] || {
    family: createExpertSourceFamily({ id: DEFAULT_EXPERT_SOURCE_FAMILY_NAME, integrationFile: DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE }),
    rawSourceCatalog: { exists: false, skills: [] },
    integratedSourceSkills: [],
    integratedModuleIds: [],
    unmappedRawSources: []
  };

  return {
    familiesFile: familiesState.file,
    familiesParseError: familiesState.error,
    familiesConfig: familiesState.families,
    families,
    activeFamilies,
    byId,
    registryIndex,
    totals,
    primary,
    rawSourceCatalog: primary.rawSourceCatalog,
    integratedSourceSkills: primary.integratedSourceSkills,
    integratedModuleIds: primary.integratedModuleIds,
    unmappedRawSources: primary.unmappedRawSources,
    staleMappedSources: primary.staleMappedSources,
    integrationPath: primary.integrationPath,
    parseError: primary.parseError,
    data: primary.data,
    groups: primary.groups,
    modules: primary.modules,
    sourceIndex: primary.sourceIndex
  };
}

function buildExpertSourceFamilyScorecard(bundleRoot, registryData = {}, options = {}) {
  const integrations = options.integrations || summarizeExpertSourceIntegrations(bundleRoot, registryData);
  const experimentalPack = readExperimentalPackManifest(bundleRoot);
  const includes = experimentalPack.includes;
  const now = Number.isFinite(options.now) ? options.now : Date.now();

  const families = (Array.isArray(integrations.families) ? integrations.families : [])
    .map((entry) => {
      const family = entry && entry.family ? entry.family : {};
      const packStatus = classifyExperimentalPackFamilyStatus(family, includes);
      return {
        id: normalizeString(family.id),
        title: normalizeString(family.title),
        source: normalizeString(family.source),
        label: normalizeString(family.label),
        status: normalizeExpertSourceFamilyStatus(family.status),
        integrationFile: normalizeString(family.integrationFile),
        rawRoot: normalizeString(family.rawRoot),
        expectedPortable: family.expectedPortable !== false,
        parseError: normalizeString(entry && entry.parseError) || null,
        rawRootExists: !!(entry && entry.rawSourceCatalog && entry.rawSourceCatalog.exists),
        rawSourceSkills: Array.isArray(entry && entry.rawSourceCatalog && entry.rawSourceCatalog.skills)
          ? entry.rawSourceCatalog.skills.length
          : 0,
        integratedSourceSkills: Array.isArray(entry && entry.integratedSourceSkills)
          ? entry.integratedSourceSkills.length
          : 0,
        integratedModules: Array.isArray(entry && entry.integratedModuleIds)
          ? entry.integratedModuleIds.length
          : 0,
        unmappedRawSources: Array.isArray(entry && entry.unmappedRawSources) ? entry.unmappedRawSources : [],
        staleMappedSources: Array.isArray(entry && entry.staleMappedSources) ? entry.staleMappedSources : [],
        experimentalPackRequired: packStatus.required,
        experimentalPackIncluded: packStatus.included,
        experimentalPackStatus: packStatus.status
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const activeFamilies = families.filter((entry) => entry.status === 'active');
  const archivedFamilies = families.filter((entry) => entry.status === 'archived');

  return {
    'schema-version': EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: {
      'family-registry': rel(bundleRoot, integrations.familiesFile),
      'experimental-pack': rel(bundleRoot, experimentalPack.file)
    },
    'experimental-pack': {
      file: rel(bundleRoot, experimentalPack.file),
      parseError: normalizeString(experimentalPack.error) || null,
      includes
    },
    summary: {
      'total-families': families.length,
      'active-families': activeFamilies.length,
      'archived-families': archivedFamilies.length,
      'families-with-parse-errors': families.filter((entry) => !!entry.parseError).length,
      'active-families-with-parse-errors': activeFamilies.filter((entry) => !!entry.parseError).length,
      'experimental-pack-parse-errors': experimentalPack.error ? 1 : 0,
      'active-raw-source-skills': Number(integrations.totals && integrations.totals.rawSourceSkills || 0),
      'active-integrated-source-skills': Number(integrations.totals && integrations.totals.integratedSourceSkills || 0),
      'active-integrated-modules': Number(integrations.totals && integrations.totals.integratedModules || 0),
      'active-unmapped-raw-sources': Number(integrations.totals && integrations.totals.unmappedRawSources || 0),
      'active-stale-mapped-sources': activeFamilies.reduce((sum, entry) => sum + entry.staleMappedSources.length, 0),
      'active-missing-pack-includes': activeFamilies.filter((entry) => entry.experimentalPackStatus === 'missing-active-include').length,
      'archived-pack-includes': archivedFamilies.filter((entry) => entry.experimentalPackStatus === 'archived-still-included').length
    },
    families
  };
}

function addExpertSourceTopTierBlocker(blockersBySkill, skillName, blocker) {
  const normalizedSkill = normalizeString(skillName);
  if (!normalizedSkill) {
    return;
  }
  const nextBlocker = blocker && typeof blocker === 'object'
    ? { ...blocker }
    : {};
  const existing = blockersBySkill.get(normalizedSkill) || [];
  const fingerprint = JSON.stringify(nextBlocker);
  if (existing.some((item) => JSON.stringify(item) === fingerprint)) {
    return;
  }
  blockersBySkill.set(normalizedSkill, [...existing, nextBlocker]);
}

function buildExpertSourceTopTierBlockerMap(bundleRoot, registryData = {}, options = {}) {
  const integrations = options.integrations || summarizeExpertSourceIntegrations(bundleRoot, registryData);
  const blockersBySkill = new Map();

  for (const summary of Array.isArray(integrations.families) ? integrations.families : []) {
    const family = summary && summary.family ? summary.family : {};
    if (!isActiveExpertSourceFamily(family) || normalizeString(summary && summary.parseError)) {
      continue;
    }

    const familyId = normalizeString(family.id) || normalizeString(family.source) || 'unknown-family';
    const integrationFile = normalizeString(family.integrationFile);
    const modules = Array.isArray(summary && summary.modules) ? summary.modules : [];
    const hostSkillsBySourceSkill = new Map();
    const moduleIdsByHostSkill = new Map();

    for (const moduleEntry of modules) {
      const moduleId = normalizeString(moduleEntry && moduleEntry.module);
      const hostSkill = normalizeString(moduleEntry && moduleEntry['host-skill'] && moduleEntry['host-skill'].name);
      const derivedFrom = uniqueSorted(moduleEntry && moduleEntry['derived-from']);
      if (!hostSkill || !moduleId) {
        continue;
      }

      moduleIdsByHostSkill.set(
        hostSkill,
        uniqueSorted([...(moduleIdsByHostSkill.get(hostSkill) || []), moduleId])
      );

      for (const sourceSkill of derivedFrom) {
        hostSkillsBySourceSkill.set(sourceSkill, [
          ...(hostSkillsBySourceSkill.get(sourceSkill) || []),
          { skill: hostSkill, module: moduleId }
        ]);
      }
    }

    const packStatus = classifyExperimentalPackFamilyStatus(
      family,
      Array.isArray(options.experimentalPackIncludes)
        ? options.experimentalPackIncludes
        : readExperimentalPackManifest(bundleRoot).includes
    );

    if (packStatus.status === 'missing-active-include') {
      for (const [hostSkill, moduleIds] of moduleIdsByHostSkill.entries()) {
        addExpertSourceTopTierBlocker(blockersBySkill, hostSkill, {
          type: 'expert-source-pack-include',
          family: familyId,
          integrationFile,
          modules: moduleIds,
          message: `expert-source family '${familyId}' is missing required experimental-pack include '${integrationFile}'`
        });
      }
    }

    for (const sourceSkill of Array.isArray(summary && summary.staleMappedSources) ? summary.staleMappedSources : []) {
      const impacted = Array.isArray(hostSkillsBySourceSkill.get(sourceSkill)) ? hostSkillsBySourceSkill.get(sourceSkill) : [];
      const impactedBySkill = new Map();

      for (const item of impacted) {
        impactedBySkill.set(
          item.skill,
          uniqueSorted([...(impactedBySkill.get(item.skill) || []), item.module])
        );
      }

      for (const [hostSkill, moduleIds] of impactedBySkill.entries()) {
        addExpertSourceTopTierBlocker(blockersBySkill, hostSkill, {
          type: 'expert-source-stale-mapped-source',
          family: familyId,
          sourceSkill,
          integrationFile,
          modules: moduleIds,
          message: `expert-source family '${familyId}' still maps missing raw source '${sourceSkill}' into skill '${hostSkill}'`
        });
      }
    }
  }

  return {
    integrations,
    blockersBySkill
  };
}

function collectExpertSourceTopTierBlockersForSkill(bundleRoot, registryData = {}, skillName, options = {}) {
  const blockerMapState = options.blockerMapState || buildExpertSourceTopTierBlockerMap(bundleRoot, registryData, options);
  return Array.isArray(blockerMapState.blockersBySkill.get(normalizeString(skillName)))
    ? blockerMapState.blockersBySkill.get(normalizeString(skillName))
    : [];
}

function writeExpertSourceFamilyScorecard(bundleRoot, registryData = {}, options = {}) {
  const payload = buildExpertSourceFamilyScorecard(bundleRoot, registryData, options);
  const file = getExpertSourceFamilyScorecardPath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateExpertSourceFamilyScorecard(bundleRoot, findings, registryData = {}, integrations = null) {
  const file = getExpertSourceFamilyScorecardPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `expert-source family scorecard parse failed: ${parsed.error}`
    });
    return null;
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(normalizeString(actual['generated-at']));
  const expected = buildExpertSourceFamilyScorecard(bundleRoot, registryData, {
    integrations: integrations || summarizeExpertSourceIntegrations(bundleRoot, registryData),
    now: Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime()
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (actual['schema-version'] !== EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `expert-source family scorecard has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'expert-source family scorecard is out of sync with family registry, integration ledgers, or experimental pack includes'
    });
  }

  return expected;
}

function validateExpertSourceIntegrations(bundleRoot, registryData, findings) {
  const familiesState = loadExpertSourceFamilies(bundleRoot);
  const registryIndex = buildRegistryModuleIndex(registryData);

  if (familiesState.error) {
    findings.push({
      severity: 'warning',
      file: rel(bundleRoot, familiesState.file),
      message: `expert-source family registry parse failed; using built-in defaults (${familiesState.error})`
    });
  } else {
    const data = familiesState.data || {};
    if (data['schema-version'] !== EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, familiesState.file),
        message: `expert-source family registry has unsupported schema-version '${data['schema-version']}'`
      });
    }

    const seenFamilies = new Set();
    for (const family of familiesState.families) {
      if (seenFamilies.has(family.id)) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, familiesState.file),
          message: `expert-source family registry duplicates family '${family.id}'`
        });
        continue;
      }
      seenFamilies.add(family.id);
      if (!family.integrationFile) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, familiesState.file),
          message: `expert-source family '${family.id || 'unknown'}' is missing integrationFile`
        });
      }
      if (!family.source) {
        findings.push({
          severity: 'error',
          file: rel(bundleRoot, familiesState.file),
          message: `expert-source family '${family.id || 'unknown'}' is missing source`
        });
      }
    }
  }

  const families = familiesState.families.map((family) =>
    validateExpertSourceIntegrationFamily(bundleRoot, family, registryData, findings, registryIndex)
  );
  const activeFamilies = families.filter((item) => isActiveExpertSourceFamily(item && item.family));
  const totals = {
    rawSourceSkills: activeFamilies.reduce((sum, item) => sum + (item.rawSourceCatalog.exists ? item.rawSourceCatalog.skills.length : 0), 0),
    integratedSourceSkills: activeFamilies.reduce((sum, item) => sum + item.integratedSourceSkills.length, 0),
    integratedModules: activeFamilies.reduce((sum, item) => sum + item.integratedModuleIds.length, 0),
    unmappedRawSources: activeFamilies.reduce((sum, item) => sum + item.unmappedRawSources.length, 0)
  };
  const byId = new Map(families.map((item) => [item.family.id, item]));
  const primary = byId.get(DEFAULT_EXPERT_SOURCE_FAMILY_NAME) || families[0] || null;

  return {
    familiesFile: familiesState.file,
    familiesParseError: familiesState.error,
    familiesConfig: familiesState.families,
    families,
    activeFamilies,
    byId,
    registryIndex,
    totals,
    primary,
    rawSourceCatalog: primary ? primary.rawSourceCatalog : { exists: false, skills: [] },
    integratedSourceSkills: primary ? primary.integratedSourceSkills : [],
    integratedModuleIds: primary ? primary.integratedModuleIds : [],
    unmappedRawSources: primary ? primary.unmappedRawSources : [],
    staleMappedSources: primary ? primary.staleMappedSources : [],
    integrationPath: primary ? primary.integrationPath : null,
    parseError: primary ? primary.parseError : null,
    data: primary ? primary.data : {},
    groups: primary ? primary.groups : [],
    modules: primary ? primary.modules : [],
    sourceIndex: primary ? primary.sourceIndex : []
  };
}

function summarizeTopDeveloperIntegration(bundleRoot, registryData = {}) {
  return summarizeExpertSourceIntegrations(bundleRoot, registryData).primary;
}

function validateTopDeveloperIntegration(bundleRoot, registryData, findings) {
  return validateExpertSourceIntegrations(bundleRoot, registryData, findings).primary;
}

function getTopDeveloperIntegrationPath(bundleRoot) {
  return getExpertSourceIntegrationPath(bundleRoot, createExpertSourceFamily({
    id: DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
    integrationFile: DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE
  }));
}

function getRawTopDeveloperRoot(bundleRoot) {
  return resolveRawSourceRoot(bundleRoot, createExpertSourceFamily({
    id: DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
    integrationFile: DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE,
    rawRoot: DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT
  }));
}

function collectRawTopDeveloperSources(bundleRoot) {
  return collectRawExpertSources(bundleRoot, createExpertSourceFamily({
    id: DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
    integrationFile: DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE,
    rawRoot: DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT
  }));
}

module.exports = {
  EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
  EXPERT_SOURCE_INTEGRATION_MODE,
  EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION,
  EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION,
  DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
  getDefaultExpertSourceIntegrationFile,
  getDefaultExpertSourceRawRoot,
  getExpertSourceFamiliesPath,
  getExpertSourceFamilyScorecardPath,
  createExpertSourceFamily,
  loadExpertSourceFamilies,
  normalizeExpertSourceFamiliesDocument,
  normalizeExpertSourceFamilyStatus,
  isActiveExpertSourceFamily,
  buildEmptyExpertSourceIntegration,
  getExpertSourceIntegrationPath,
  collectRawExpertSources,
  summarizeExpertSourceIntegrationFamily,
  validateExpertSourceIntegrationFamily,
  summarizeExpertSourceIntegrations,
  validateExpertSourceIntegrations,
  buildExpertSourceFamilyScorecard,
  buildExpertSourceTopTierBlockerMap,
  collectExpertSourceTopTierBlockersForSkill,
  writeExpertSourceFamilyScorecard,
  validateExpertSourceFamilyScorecard,
  getTopDeveloperIntegrationPath,
  getRawTopDeveloperRoot,
  collectRawTopDeveloperSources,
  summarizeTopDeveloperIntegration,
  validateTopDeveloperIntegration
};
