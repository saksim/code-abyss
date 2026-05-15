'use strict';

const fs = require('fs');
const path = require('path');
const { parseJsonFile } = require('./skill-system-common');
const {
  EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES,
  getRequiredExperimentalPackExpertSourceIncludes
} = require('./skill-expert-source-governance');

const EXPECTED_PACK_MODES = new Set(['copy', 'overlay']);
const RESERVED_EMPTY_PACKS = new Set(['project-overlay', 'work-private']);
const PERSONAL_CORE_REQUIRED_INCLUDES = [
  'docs',
  'registry',
  'skills/routers',
  'skills/domains',
  'skills/workflows',
  'skills/tools',
  'skills/guards',
  'skills/adapters',
  'templates',
  'benchmark'
];
const EXPERIMENTAL_REQUIRED_INCLUDES = EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES;
const EXPERT_SOURCE_INTEGRATION_INCLUDE_PATTERN = /^registry\/[a-z0-9]+(?:-[a-z0-9]+)*-integration\.generated\.json$/;

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

function isManagedExpertSourceIntegrationInclude(includePath) {
  return EXPERT_SOURCE_INTEGRATION_INCLUDE_PATTERN.test(normalizeString(includePath));
}

function syncExperimentalPackManifest(manifest, familyEntries = []) {
  const normalizedManifest = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    ? { ...manifest }
    : {};
  const currentIncludes = uniqueSorted(normalizedManifest.includes);
  const knownFamilyIntegrationIncludes = new Set(
    (Array.isArray(familyEntries) ? familyEntries : [])
      .map((entry) => normalizeString(entry && entry.integrationFile))
      .filter(Boolean)
  );
  const preservedIncludes = currentIncludes.filter((includePath) =>
    !knownFamilyIntegrationIncludes.has(includePath)
    && !isManagedExpertSourceIntegrationInclude(includePath)
  );
  const requiredIncludes = getRequiredExperimentalPackExpertSourceIncludes(familyEntries);

  return {
    ...normalizedManifest,
    includes: uniqueSorted([...preservedIncludes, ...requiredIncludes])
  };
}

function analyzePackManifests(targetDir, findings, rel) {
  const packsRoot = path.join(targetDir, 'packs');
  const hostCapabilitiesPath = path.join(targetDir, 'registry', 'host-capabilities.json');
  const hostCapabilities = parseJsonFile(hostCapabilitiesPath);
  const supportedHosts = new Set(Object.keys(hostCapabilities.data || {}));

  let packCount = 0;
  if (!fs.existsSync(packsRoot)) return packCount;

  const packDirs = fs.readdirSync(packsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory());
  for (const dir of packDirs) {
    const manifestPath = path.join(packsRoot, dir.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    packCount += 1;

    const parsed = parseJsonFile(manifestPath);
    if (parsed.error) {
      findings.push({ severity: 'error', file: rel(targetDir, manifestPath), message: `pack manifest parse failed: ${parsed.error}` });
      continue;
    }

    const manifest = parsed.data || {};
    if (manifest.name !== dir.name) {
      findings.push({ severity: 'warning', file: rel(targetDir, manifestPath), message: `pack manifest name '${manifest.name}' does not match directory '${dir.name}'` });
    }
    if (!EXPECTED_PACK_MODES.has(manifest.mode)) {
      findings.push({ severity: 'error', file: rel(targetDir, manifestPath), message: `pack mode '${manifest.mode}' is invalid` });
    }

    const includes = Array.isArray(manifest.includes) ? manifest.includes : [];
    if (includes.length === 0 && !RESERVED_EMPTY_PACKS.has(dir.name)) {
      findings.push({ severity: 'info', file: rel(targetDir, manifestPath), message: `pack '${dir.name}' has no includes yet` });
    }
    for (const includePath of includes) {
      if (!fs.existsSync(path.join(targetDir, includePath))) {
        findings.push({ severity: 'error', file: rel(targetDir, manifestPath), message: `pack include '${includePath}' does not exist` });
      }
    }

    const targets = Array.isArray(manifest.targets) ? manifest.targets : [];
    for (const target of targets) {
      if (supportedHosts.size > 0 && !supportedHosts.has(target)) {
        findings.push({ severity: 'error', file: rel(targetDir, manifestPath), message: `pack target '${target}' is not declared in host-capabilities.json` });
      }
    }

    if (dir.name === 'personal-core') {
      for (const requiredInclude of PERSONAL_CORE_REQUIRED_INCLUDES) {
        if (!includes.includes(requiredInclude)) {
          findings.push({ severity: 'warning', file: rel(targetDir, manifestPath), message: `personal-core is missing required self-evolving include '${requiredInclude}'` });
        }
      }
    }
    if (dir.name === 'experimental') {
      for (const requiredInclude of EXPERIMENTAL_REQUIRED_INCLUDES) {
        if (!includes.includes(requiredInclude)) {
          findings.push({ severity: 'warning', file: rel(targetDir, manifestPath), message: `experimental is missing required expert-source include '${requiredInclude}'` });
        }
      }
      const familiesPath = path.join(targetDir, 'registry', 'expert-source-families.generated.json');
      const familiesParsed = parseJsonFile(familiesPath);
      const familyEntries = Array.isArray(familiesParsed.data && familiesParsed.data.families)
        ? familiesParsed.data.families
        : [];
      for (const requiredInclude of getRequiredExperimentalPackExpertSourceIncludes(familyEntries)) {
        if (!EXPERIMENTAL_REQUIRED_INCLUDES.includes(requiredInclude) && !includes.includes(requiredInclude)) {
          findings.push({
            severity: 'warning',
            file: rel(targetDir, manifestPath),
            message: `experimental is missing registered expert-source integration include '${requiredInclude}'`
          });
        }
      }
    }
  }

  return packCount;
}

module.exports = {
  analyzePackManifests,
  PERSONAL_CORE_REQUIRED_INCLUDES,
  EXPERIMENTAL_REQUIRED_INCLUDES,
  syncExperimentalPackManifest
};
