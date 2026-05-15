'use strict';

const DERIVED_GOVERNANCE_EXPORT_ARTIFACT = 'derived-governance-export';
const {
  getGovernanceArtifactRelativePath,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  getDerivedGovernanceExportArtifactPaths
} = require('./skill-generated-artifact-governance');

function defineRefreshStep(label, artifactIds, description) {
  return Object.freeze({
    label: String(label || '').trim(),
    artifacts: Object.freeze(
      (Array.isArray(artifactIds) ? artifactIds : [])
        .map((artifactId) => String(artifactId || '').trim())
        .filter(Boolean)
    ),
    description: String(description || '').trim()
  });
}

function buildArtifactPathMap(artifactIds) {
  const map = {};
  for (const artifactId of Array.isArray(artifactIds) ? artifactIds : []) {
    const relativePath = getGovernanceArtifactRelativePath(artifactId);
    if (!relativePath) {
      throw new Error(`unknown derived-governance artifact '${artifactId}'`);
    }
    map[artifactId] = relativePath;
  }
  return Object.freeze(map);
}

const DERIVED_GOVERNANCE_REFRESH_STEP_DEFINITIONS = Object.freeze({
  'runtime-proof': defineRefreshStep(
    'Runtime-proof registry',
    ['runtime-proof'],
    'Normalize runtime-proof floors before downstream readiness and host-evolution refreshes.'
  ),
  'skill-catalog': defineRefreshStep(
    'Skill catalog reference',
    ['skill-catalog'],
    'Keep the router-facing catalog aligned with the governed registry.'
  ),
  'authoring-governance-reference': defineRefreshStep(
    'Authoring governance reference',
    ['authoring-governance-reference'],
    'Expose volatile governance tokens and refresh policy from one generated authoring reference.'
  ),
  'skill-frontmatter-schema': defineRefreshStep(
    'Skill frontmatter schema',
    ['skill-frontmatter-schema'],
    'Refresh the canonical frontmatter schema before later validation or scaffold work.'
  ),
  'future-registry-schemas': defineRefreshStep(
    'Future-skill registry schemas',
    ['skill-opportunity-queue-schema', 'admission-ledger-schema', 'evolution-ledger-schema', 'pending-scaffolds-schema'],
    'Refresh future-skill intake schemas from the centralized future-governance rules.'
  ),
  'skill-investment-backlog-schema': defineRefreshStep(
    'Investment backlog schema',
    ['skill-investment-backlog-schema'],
    'Refresh the governed portfolio/backlog schema before backlog regeneration.'
  ),
  'readiness-schemas': defineRefreshStep(
    'Readiness and host-evolution schemas',
    ['system-readiness-schema', 'host-evolution-schema'],
    'Refresh the centralized host-readiness and host-evolution schemas before rebuilding host-specific readiness artifacts.'
  ),
  'review-queue-schema': defineRefreshStep(
    'Review queue schema',
    ['review-queue-schema'],
    'Refresh the governed review-cadence schema before queue regeneration.'
  ),
  'capability-ratings-schema': defineRefreshStep(
    'Capability ratings schema',
    ['capability-ratings-schema'],
    'Refresh the capability-ratings schema before ratings regeneration.'
  ),
  'expert-source-schemas': defineRefreshStep(
    'Expert-source schemas',
    ['expert-source-families-schema', 'expert-source-family-scorecard-schema', 'expert-source-integration-schema'],
    'Refresh expert-source family schemas before scorecard and backlog synthesis.'
  ),
  'review-queue': defineRefreshStep(
    'Review queue registry',
    ['review-queue'],
    'Rebuild the governed live-skill review queue from current lifecycle metadata.'
  ),
  'capability-ratings': defineRefreshStep(
    'Capability ratings surfaces',
    ['capability-ratings', 'capability-ratings-doc'],
    'Regenerate capability-module ratings and the mirrored human-readable ratings doc together.'
  ),
  'expert-source-family-scorecard': defineRefreshStep(
    'Expert-source family scorecard',
    ['expert-source-family-scorecard'],
    'Recompute expert-source family health so raw-source integration debt stays inspectable.'
  ),
  'host-smoke-scorecard': defineRefreshStep(
    'Host-smoke scorecard',
    ['host-smoke-scorecard'],
    'Recompute host-smoke evidence freshness before readiness rollups.'
  ),
  'skill-investment-backlog': defineRefreshStep(
    'Skill investment backlog surfaces',
    ['skill-investment-backlog', 'skill-investment-backlog-doc'],
    'Rebuild the portfolio backlog and its router-readable mirror from current governance debt.'
  ),
  'system-readiness': defineRefreshStep(
    'System readiness and host evolution',
    ['system-readiness', 'host-evolution'],
    'Finish the cycle by rebuilding host-specific readiness and recovery artifacts from refreshed governance state.'
  )
});

const DERIVED_GOVERNANCE_REFRESH_STEP_ORDER = Object.freeze(
  Object.keys(DERIVED_GOVERNANCE_REFRESH_STEP_DEFINITIONS)
);
const DERIVED_GOVERNANCE_REFRESH_ARTIFACT_IDS = Object.freeze([
  ...new Set(
    DERIVED_GOVERNANCE_REFRESH_STEP_ORDER.flatMap(
      (stepId) => DERIVED_GOVERNANCE_REFRESH_STEP_DEFINITIONS[stepId].artifacts
    )
  )
]);
const DERIVED_GOVERNANCE_REFRESH_ARTIFACT_PATHS = buildArtifactPathMap(DERIVED_GOVERNANCE_REFRESH_ARTIFACT_IDS);
const DERIVED_GOVERNANCE_ARTIFACT_PATHS = {
  ...getDerivedGovernanceExportArtifactPaths(),
  ...buildArtifactPathMap([
    'skill-catalog',
    'skill-investment-backlog-doc',
    'capability-ratings-doc',
    'authoring-governance-reference'
  ])
};

function getDerivedGovernanceRefreshStepDefinition(stepId) {
  return DERIVED_GOVERNANCE_REFRESH_STEP_DEFINITIONS[String(stepId || '').trim()] || null;
}

function listDerivedGovernanceRefreshSteps() {
  return DERIVED_GOVERNANCE_REFRESH_STEP_ORDER.map((stepId) => ({
    id: stepId,
    ...getDerivedGovernanceRefreshStepDefinition(stepId)
  }));
}

module.exports = {
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_ARTIFACT_PATHS,
  DERIVED_GOVERNANCE_REFRESH_STEP_DEFINITIONS,
  DERIVED_GOVERNANCE_REFRESH_STEP_ORDER,
  DERIVED_GOVERNANCE_REFRESH_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_REFRESH_ARTIFACT_PATHS,
  getDerivedGovernanceRefreshStepDefinition,
  listDerivedGovernanceRefreshSteps
};
