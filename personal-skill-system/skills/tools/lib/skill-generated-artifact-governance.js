'use strict';

const path = require('path');

const GOVERNANCE_ARTIFACT_DEFINITIONS = Object.freeze({
  registry: {
    path: 'registry/registry.generated.json',
    mode: 'rewrite-file',
    label: 'skill registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'route-map': {
    path: 'registry/route-map.generated.json',
    mode: 'rewrite-file',
    label: 'route-map generated registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'route-fixtures': {
    path: 'registry/route-fixtures.generated.json',
    mode: 'rewrite-file',
    label: 'route-fixtures generated registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'skill-catalog': {
    path: 'skills/routers/sage/references/skill-catalog.generated.md',
    mode: 'rewrite-file',
    label: 'skill catalog generated reference',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'capability-ratings': {
    path: 'registry/capability-ratings.generated.json',
    mode: 'rewrite-file',
    label: 'capability ratings registry',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'capability-ratings-doc': {
    path: 'docs/CAPABILITY_MODULE_RATINGS.md',
    mode: 'rewrite-file',
    label: 'capability ratings generated doc',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'capability-ratings-schema': {
    path: 'registry/capability-ratings.schema.json',
    mode: 'rewrite-file',
    label: 'capability ratings schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'skill-opportunity-queue': {
    path: 'registry/skill-opportunity-queue.generated.json',
    mode: 'rewrite-file',
    label: 'skill opportunity queue registry',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'skill-opportunity-queue-schema': {
    path: 'registry/skill-opportunity-queue.schema.json',
    mode: 'rewrite-file',
    label: 'skill opportunity queue schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'review-queue': {
    path: 'registry/review-queue.generated.json',
    mode: 'rewrite-file',
    label: 'review queue registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'review-queue-schema': {
    path: 'registry/review-queue.schema.json',
    mode: 'rewrite-file',
    label: 'review queue schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'admission-ledger': {
    path: 'registry/admission-ledger.generated.json',
    mode: 'rewrite-file',
    label: 'admission ledger registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'admission-ledger-schema': {
    path: 'registry/admission-ledger.schema.json',
    mode: 'rewrite-file',
    label: 'admission ledger schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'evolution-ledger': {
    path: 'registry/evolution-ledger.generated.json',
    mode: 'rewrite-file',
    label: 'evolution ledger registry',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'evolution-ledger-schema': {
    path: 'registry/evolution-ledger.schema.json',
    mode: 'rewrite-file',
    label: 'evolution ledger schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'runtime-proof': {
    path: 'registry/runtime-proof.generated.json',
    mode: 'rewrite-file',
    label: 'runtime-proof registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'skill-frontmatter-schema': {
    path: 'registry/skill.schema.json',
    mode: 'rewrite-file',
    label: 'skill frontmatter schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'skill-investment-backlog': {
    path: 'registry/skill-investment-backlog.generated.json',
    mode: 'rewrite-file',
    label: 'skill investment backlog registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'skill-investment-backlog-doc': {
    path: 'skills/routers/sage/references/skill-investment-backlog.generated.md',
    mode: 'rewrite-file',
    label: 'skill investment backlog generated reference',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'skill-investment-backlog-schema': {
    path: 'registry/skill-investment-backlog.schema.json',
    mode: 'rewrite-file',
    label: 'skill investment backlog schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'expert-source-families': {
    path: 'registry/expert-source-families.generated.json',
    mode: 'rewrite-file',
    label: 'expert-source family registry',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'expert-source-families-schema': {
    path: 'registry/expert-source-families.schema.json',
    mode: 'rewrite-file',
    label: 'expert-source family schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'expert-source-family-scorecard': {
    path: 'registry/expert-source-family-scorecard.generated.json',
    mode: 'rewrite-file',
    label: 'expert-source family scorecard registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'expert-source-family-scorecard-schema': {
    path: 'registry/expert-source-family-scorecard.schema.json',
    mode: 'rewrite-file',
    label: 'expert-source family scorecard schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'expert-source-integration-schema': {
    path: 'registry/expert-source-integration.schema.json',
    mode: 'rewrite-file',
    label: 'expert-source integration schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'authoring-governance-reference': {
    path: 'docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md',
    mode: 'rewrite-file',
    label: 'authoring governance generated reference',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'pending-scaffolds': {
    path: 'registry/pending-scaffolds.generated.json',
    mode: 'rewrite-file',
    label: 'pending scaffold registry',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'pending-scaffolds-schema': {
    path: 'registry/pending-scaffolds.schema.json',
    mode: 'rewrite-file',
    label: 'pending scaffold schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'benchmark-summary': {
    path: 'benchmark/summary.generated.json',
    mode: 'rewrite-file',
    label: 'benchmark summary artifact',
    writeabilityTracked: false,
    derivedFingerprintSource: true
  },
  'system-readiness-schema': {
    path: 'benchmark/system-readiness.schema.json',
    mode: 'rewrite-file',
    label: 'system readiness schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'host-smoke-scorecard': {
    path: 'benchmark/host-smoke/scorecard.generated.json',
    mode: 'rewrite-file',
    label: 'host-smoke scorecard',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  },
  'host-smoke-invalidation': {
    path: 'benchmark/host-smoke/invalidation.generated.json',
    mode: 'create-file',
    label: 'host-smoke invalidation ledger',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'system-readiness': {
    path: 'benchmark/system-readiness.generated.json',
    mode: 'rewrite-file',
    label: 'system readiness artifact',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'host-smoke-runtime-runs': {
    path: 'benchmark/host-smoke/runtime-runs',
    mode: 'write-dir',
    label: 'host-smoke runtime-runs directory',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'host-evolution': {
    path: 'benchmark/host-evolution.generated.json',
    mode: 'create-or-rewrite-file',
    label: 'host evolution report',
    writeabilityTracked: true,
    derivedFingerprintSource: false
  },
  'host-evolution-schema': {
    path: 'benchmark/host-evolution.schema.json',
    mode: 'rewrite-file',
    label: 'host evolution schema',
    writeabilityTracked: true,
    derivedFingerprintSource: true
  }
});

const GOVERNANCE_ARTIFACT_ORDER = Object.freeze(Object.keys(GOVERNANCE_ARTIFACT_DEFINITIONS));
const GOVERNANCE_ARTIFACT_IDS = new Set(GOVERNANCE_ARTIFACT_ORDER);
const WRITEABILITY_TRACKED_GOVERNANCE_ARTIFACT_IDS = Object.freeze(
  GOVERNANCE_ARTIFACT_ORDER.filter((id) => GOVERNANCE_ARTIFACT_DEFINITIONS[id].writeabilityTracked)
);
const DERIVED_GOVERNANCE_FINGERPRINT_ARTIFACT_IDS = Object.freeze(
  GOVERNANCE_ARTIFACT_ORDER.filter((id) => GOVERNANCE_ARTIFACT_DEFINITIONS[id].derivedFingerprintSource)
);
const DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS = Object.freeze([
  'system-readiness',
  'host-evolution'
]);

function normalizeArtifactId(artifactId) {
  return String(artifactId || '').trim();
}

function getGovernanceArtifactDefinition(artifactId) {
  return GOVERNANCE_ARTIFACT_DEFINITIONS[normalizeArtifactId(artifactId)] || null;
}

function isKnownGovernanceArtifact(artifactId) {
  return GOVERNANCE_ARTIFACT_IDS.has(normalizeArtifactId(artifactId));
}

function getGovernanceArtifactRelativePath(artifactId) {
  const definition = getGovernanceArtifactDefinition(artifactId);
  return definition ? definition.path : null;
}

function getGovernanceArtifactPath(bundleRoot, artifactId) {
  const relativePath = getGovernanceArtifactRelativePath(artifactId);
  return relativePath ? path.join(bundleRoot, relativePath) : null;
}

function listGovernanceArtifacts(bundleRoot, options = {}) {
  const ids = Array.isArray(options.ids) && options.ids.length > 0
    ? options.ids.map((artifactId) => normalizeArtifactId(artifactId)).filter(Boolean)
    : GOVERNANCE_ARTIFACT_ORDER;
  const trackedOnly = options.writeabilityTrackedOnly === true;

  return ids
    .map((artifactId) => {
      const definition = getGovernanceArtifactDefinition(artifactId);
      if (!definition) {
        return null;
      }
      if (trackedOnly && definition.writeabilityTracked !== true) {
        return null;
      }
      return {
        id: artifactId,
        path: bundleRoot ? getGovernanceArtifactPath(bundleRoot, artifactId) : definition.path,
        relativePath: definition.path,
        mode: definition.mode,
        label: definition.label,
        writeabilityTracked: definition.writeabilityTracked === true,
        derivedFingerprintSource: definition.derivedFingerprintSource === true
      };
    })
    .filter(Boolean);
}

function getWriteabilityTrackedGovernanceArtifacts(bundleRoot) {
  return listGovernanceArtifacts(bundleRoot, {
    writeabilityTrackedOnly: true
  });
}

function getDerivedGovernanceFingerprintSourcePaths() {
  return DERIVED_GOVERNANCE_FINGERPRINT_ARTIFACT_IDS
    .map((artifactId) => GOVERNANCE_ARTIFACT_DEFINITIONS[artifactId].path);
}

function getDerivedGovernanceExportArtifacts(bundleRoot) {
  return listGovernanceArtifacts(bundleRoot, {
    ids: DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS
  });
}

function getDerivedGovernanceExportArtifactPaths() {
  const paths = {};
  for (const artifactId of DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS) {
    paths[artifactId] = GOVERNANCE_ARTIFACT_DEFINITIONS[artifactId].path;
  }
  return paths;
}

module.exports = {
  GOVERNANCE_ARTIFACT_DEFINITIONS,
  GOVERNANCE_ARTIFACT_ORDER,
  GOVERNANCE_ARTIFACT_IDS,
  WRITEABILITY_TRACKED_GOVERNANCE_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_FINGERPRINT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  getGovernanceArtifactDefinition,
  isKnownGovernanceArtifact,
  getGovernanceArtifactRelativePath,
  getGovernanceArtifactPath,
  listGovernanceArtifacts,
  getWriteabilityTrackedGovernanceArtifacts,
  getDerivedGovernanceFingerprintSourcePaths,
  getDerivedGovernanceExportArtifacts,
  getDerivedGovernanceExportArtifactPaths
};
