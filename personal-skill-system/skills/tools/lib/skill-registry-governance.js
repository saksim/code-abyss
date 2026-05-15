'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile
} = require('./skill-system-common');
const {
  SKILL_KIND_ORDER
} = require('./skill-kind-governance');

const SKILL_REGISTRY_SCHEMA_VERSION = 2;
const SKILL_REGISTRY_SOURCE = 'managed-via-manage-skill';

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeGeneratedAt(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(normalizeString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueSorted(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function normalizeRegistrySkills(skills) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(skills) ? skills : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const name = normalizeString(entry.name);
    const kind = normalizeString(entry.kind);
    const skillPath = normalizeString(entry.path);
    const key = name || `${kind}::${skillPath}`;
    if (!name || !kind || !skillPath || seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      name,
      kind,
      path: skillPath
    });
  }

  normalized.sort((left, right) => left.name.localeCompare(right.name));
  return normalized;
}

function normalizeRegistryModuleGroups(groups) {
  const seenHosts = new Set();
  const normalized = [];

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      continue;
    }

    const hostSkill = normalizeString(group['host-skill']);
    const hostKind = normalizeString(group['host-kind']);
    if (!hostSkill || !hostKind || seenHosts.has(hostSkill)) {
      continue;
    }
    seenHosts.add(hostSkill);

    const seenModules = new Set();
    const modules = [];
    for (const module of Array.isArray(group.modules) ? group.modules : []) {
      if (!module || typeof module !== 'object' || Array.isArray(module)) {
        continue;
      }
      const moduleId = normalizeString(module.id);
      const modulePath = normalizeString(module.path);
      const capability = normalizeString(module.capability);
      if (!moduleId || !modulePath || !capability || seenModules.has(moduleId)) {
        continue;
      }
      seenModules.add(moduleId);
      modules.push({
        id: moduleId,
        path: modulePath,
        capability
      });
    }

    normalized.push({
      'host-skill': hostSkill,
      'host-kind': hostKind,
      modules
    });
  }

  normalized.sort((left, right) => String(left['host-skill'] || '').localeCompare(String(right['host-skill'] || '')));
  return normalized;
}

function summarizeSkillRegistry(skills, moduleGroups) {
  const summary = {
    skills: Array.isArray(skills) ? skills.length : 0,
    'module-groups': Array.isArray(moduleGroups) ? moduleGroups.length : 0,
    'capability-modules': 0,
    kinds: {}
  };

  for (const kind of SKILL_KIND_ORDER) {
    summary.kinds[kind] = 0;
  }

  for (const skill of Array.isArray(skills) ? skills : []) {
    const kind = normalizeString(skill && skill.kind);
    if (Object.prototype.hasOwnProperty.call(summary.kinds, kind)) {
      summary.kinds[kind] += 1;
    }
  }

  for (const group of Array.isArray(moduleGroups) ? moduleGroups : []) {
    summary['capability-modules'] += Array.isArray(group && group.modules) ? group.modules.length : 0;
  }

  return summary;
}

function buildSkillRegistryDocument(skills, moduleGroups, options = {}) {
  const now = normalizeGeneratedAt(options.now);
  const normalizedSkills = normalizeRegistrySkills(skills);
  const normalizedModuleGroups = normalizeRegistryModuleGroups(moduleGroups);
  return {
    'schema-version': SKILL_REGISTRY_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    source: SKILL_REGISTRY_SOURCE,
    summary: summarizeSkillRegistry(normalizedSkills, normalizedModuleGroups),
    skills: normalizedSkills,
    'module-groups': normalizedModuleGroups
  };
}

function getSkillRegistryPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'registry.generated.json');
}

function readSkillRegistry(bundleRoot) {
  const file = getSkillRegistryPath(bundleRoot);
  if (!fs.existsSync(file)) {
    return buildSkillRegistryDocument([], []);
  }
  const parsed = parseJsonFile(file);
  if (parsed.error || !parsed.data) {
    return buildSkillRegistryDocument([], []);
  }

  const data = parsed.data || {};
  return buildSkillRegistryDocument(data.skills, data['module-groups'], {
    now: normalizeGeneratedAt(data['generated-at'])
  });
}

function validateSkillRegistry(bundleRoot, findings) {
  const file = getSkillRegistryPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill registry parse failed: ${parsed.error}`
    });
    return buildSkillRegistryDocument([], []);
  }

  const actual = parsed.data || {};
  const actualGeneratedAtText = normalizeString(actual['generated-at']);
  const actualGeneratedAtMs = Date.parse(actualGeneratedAtText);
  const expected = buildSkillRegistryDocument(actual.skills, actual['module-groups'], {
    now: Number.isFinite(actualGeneratedAtMs) ? actualGeneratedAtMs : Date.now()
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (actual['schema-version'] !== SKILL_REGISTRY_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill registry has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (normalizeString(actual.source) !== normalizeString(expected.source)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill registry source is out of sync'
    });
  }

  if (!actualGeneratedAtText || !Number.isFinite(actualGeneratedAtMs)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill registry has invalid generated-at'
    });
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill registry is out of sync with the canonical normalization rules'
    });
  }

  return expected;
}

function formatSkillCatalogHeading(kind) {
  const normalized = String(kind || '').trim();
  if (!normalized) {
    return 'Skills';
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}s`;
}

function buildSkillCatalogMarkdown(registryData) {
  const skills = Array.isArray(registryData && registryData.skills) ? registryData.skills : [];
  const moduleGroups = Array.isArray(registryData && registryData['module-groups']) ? registryData['module-groups'] : [];
  const skillsByKind = new Map(SKILL_KIND_ORDER.map((kind) => [kind, []]));

  for (const skill of skills) {
    const kind = normalizeString(skill && skill.kind);
    if (!skillsByKind.has(kind)) {
      continue;
    }
    skillsByKind.get(kind).push(skill);
  }

  const lines = [
    '# Skill Catalog',
    '',
    'Generated from `registry/registry.generated.json`.',
    'Edit the registry, then regenerate this file through `manage-skill`.',
    ''
  ];

  for (const kind of SKILL_KIND_ORDER) {
    const entries = skillsByKind.get(kind) || [];
    if (entries.length < 1) {
      continue;
    }

    lines.push(`## ${formatSkillCatalogHeading(kind)}`);
    lines.push('');
    for (const entry of entries) {
      const pathText = normalizeString(entry && entry.path);
      lines.push(`- \`${normalizeString(entry && entry.name)}\`${pathText ? ` -> \`${pathText}\`` : ''}`);
    }
    lines.push('');
  }

  if (moduleGroups.length > 0) {
    lines.push('## Expert Modules');
    lines.push('');
    for (const group of moduleGroups) {
      const hostSkill = normalizeString(group && group['host-skill']);
      const modules = Array.isArray(group && group.modules) ? group.modules : [];
      if (!hostSkill || modules.length < 1) {
        continue;
      }
      const moduleList = modules
        .map((module) => normalizeString(module && module.id))
        .filter(Boolean)
        .join(', ');
      lines.push(`- \`${hostSkill}\`: ${moduleList}`);
    }
    lines.push('');
  }

  lines.push('## Use Strategy');
  lines.push('');
  lines.push('1. route to the smallest correct skill');
  lines.push('2. deepen references before creating a sibling');
  lines.push('3. use `manage-skill` for add, update, archive, merge, or delete');
  lines.push('4. keep this file derived from the registry so it never drifts from the authoritative tree');

  return lines.join('\n');
}

function getSkillCatalogPath(bundleRoot) {
  return path.join(bundleRoot, 'skills', 'routers', 'sage', 'references', 'skill-catalog.generated.md');
}

function syncSkillCatalog(bundleRoot, registryData = null) {
  const file = getSkillCatalogPath(bundleRoot);
  const expected = `${buildSkillCatalogMarkdown(registryData || readSkillRegistry(bundleRoot))}\n`;
  fs.writeFileSync(file, expected, 'utf8');
  return file;
}

function validateSkillCatalog(bundleRoot, registryData, findings) {
  const file = getSkillCatalogPath(bundleRoot);
  if (!fs.existsSync(file)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill catalog generated reference is missing'
    });
    return null;
  }

  const expected = `${buildSkillCatalogMarkdown(registryData || readSkillRegistry(bundleRoot))}\n`;
  const actual = fs.readFileSync(file, 'utf8');
  if (actual !== expected) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: 'skill catalog generated reference is out of sync with registry.generated.json'
    });
  }

  return file;
}

module.exports = {
  SKILL_REGISTRY_SCHEMA_VERSION,
  SKILL_REGISTRY_SOURCE,
  normalizeRegistrySkills,
  normalizeRegistryModuleGroups,
  summarizeSkillRegistry,
  buildSkillRegistryDocument,
  getSkillRegistryPath,
  readSkillRegistry,
  validateSkillRegistry,
  buildSkillCatalogMarkdown,
  getSkillCatalogPath,
  syncSkillCatalog,
  validateSkillCatalog
};
