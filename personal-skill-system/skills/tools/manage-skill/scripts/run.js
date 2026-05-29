#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  resolveSkillProjectRoot
} = require('../../lib/runtime');
const { collectSkillRecords } = require('../../lib/skill-system-skills');
const {
  validateSmokeManifest,
  probeArtifactWriteAccess,
  probeDirectoryCreateAccess,
  readReferencePaths,
  readBulletSectionItems,
  collectGeneratedArtifactWriteability
} = require('../../lib/skill-system-common');
const {
  explainRouteSelection
} = require('../../lib/skill-system-routing');
const {
  buildGovernedRouteFixture,
  hasRouteFixtureEvidence,
  routeFixtureReferencesSkill,
  isGovernedRouteFixture,
  summarizeRouteFixtureEvidence
} = require('../../lib/skill-route-fixture-governance');
const {
  normalizeHostSmokeContract,
  hostSmokeContractsEqual,
  getHostSmokeRuntimeRunsDir,
  getHostSmokeScorecardPath,
  getHostSmokeInvalidationPath,
  loadHostSmokeInvalidationIndex,
  HOST_SMOKE_RUN_SCHEMA_VERSION,
  buildHostSmokeScorecard,
  loadHostSmokeRunIndex,
  writeHostSmokeInvalidationLedger,
  findLatestHostSmokeEvidence,
  evaluateHostSmokeFreshness
} = require('../../lib/skill-system-host-smoke');
const {
  writeSystemReadiness,
  buildSystemReadiness,
  collectSystemReadinessContext
} = require('../../lib/skill-system-readiness');
const {
  isGovernedRuntimeProofRecord,
  deriveHostSmokePolicyFromRecord,
  normalizeHostSmokePolicy,
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays,
  HOST_SMOKE_RESULT_STATUSES
} = require('../../lib/skill-host-governance');
const {
  WRITABLE_SKILL_STATUSES,
  SKILL_LEVEL_BUCKET_BY_STATUS,
  isWritableSkillStatus,
  isKnownRuntimeProofLevel,
  getSkillLevelBucketForStatus,
  getDefaultRuntimeProofLevelForStatus,
  shouldAutoPromoteRuntimeProofLevel,
  getAutoPromotedRuntimeProofLevel
} = require('../../lib/skill-lifecycle-governance');
const {
  getRuntimeProofPath: getRuntimeProofRegistryPath,
  normalizeEvidenceTests: normalizeRuntimeProofEvidenceTests,
  shouldHaveRuntimeProofEntry: shouldHaveGovernedRuntimeProofEntry,
  defaultRuntimeProofLevelForStatus: getDefaultRuntimeProofLevelForStatusGoverned,
  resolveEvidenceTests: resolveRuntimeProofEvidenceTests,
  resolveRuntimeProofHostSmoke,
  buildRuntimeProofEntry: buildGovernedRuntimeProofEntry,
  buildRuntimeProofRegistryDocument,
  dedupeRuntimeProofEntries,
  describeHostSmokedEvidenceFailure: describeRuntimeProofHostSmokedEvidenceFailure
} = require('../../lib/skill-runtime-proof-governance');
const {
  writeOpenAiMetadataFile
} = require('../../lib/skill-system-host-metadata');
const {
  getReviewQueuePath,
  buildReviewQueue,
  readReviewQueue,
  normalizeReviewDate,
  normalizeReviewCycleDays,
  buildSeedReviewMetadata
} = require('../../lib/skill-review-governance');
const {
  getSkillInvestmentBacklogPath,
  getSkillInvestmentBacklogDocPath,
  buildSkillInvestmentBacklog,
  writeSkillInvestmentBacklog
} = require('../../lib/skill-investment-governance');
const {
  CAPABILITY_RATING_BUCKET_SEQUENCE,
  CAPABILITY_RATING_BUCKET_INDEX,
  applyCapabilityRatingsGovernance,
  buildCapabilityModuleTopReadyBlockers,
  getCapabilityModuleRatingsForSkill: getCapabilityModuleRatingsForSkillGoverned,
  getCapabilityRatingsDocPath,
  getCapabilityRatingsPath,
  normalizeCapabilityRatingBuckets,
  recomputeCapabilityRatingCounts,
  syncCapabilityRatingsForModules,
  getCapabilityRatingBucketForModule,
  buildCapabilityModuleMetadataMapFromRegistry,
  syncCapabilityRatingsDoc: syncCapabilityRatingsDocFile
} = require('../../lib/skill-capability-ratings-governance');
const {
  SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
  getSkillOpportunityQueuePath,
  normalizeOpportunityEntries,
  normalizeOpportunityPriority,
  normalizeOpportunityStatus,
  normalizeOpportunityHorizon,
  buildSkillOpportunityQueue
} = require('../../lib/skill-opportunity-governance');
const {
  SCAFFOLD_ORIGIN_FIELD,
  SCAFFOLD_VERSION_FIELD,
  readTemplateLineage,
  collectTemplateRecords,
  collectTemplateHardeningBlockers
} = require('../../lib/skill-system-templates');
const {
  getPendingScaffoldRegistryPath,
  buildPendingScaffoldRegistry,
  normalizePendingScaffoldStatus
} = require('../../lib/skill-pending-scaffold-governance');
const {
  ACTIVE_OPPORTUNITY_STATUSES,
  isActiveOpportunityStatus,
  normalizeAdmissionDecisionAction,
  buildAdmissionDecision,
  buildAdmissionOpportunityNote,
  getDefaultAdmissionStatusForDecision,
  getDefaultOpportunityStatusForDecision,
  normalizeAdmissionStatus,
  isActiveAdmissionStatus,
  normalizeEvolutionLedgerStatus,
  ACTIVE_PENDING_SCAFFOLD_STATUSES
} = require('../../lib/skill-future-governance');
const {
  normalizeFutureSkillPipelineStage,
  buildFutureSkillPipelineView
} = require('../../lib/skill-future-pipeline-governance');
const {
  normalizeAdmissionText,
  buildAdmissionLedger,
  readAdmissionLedger: readAdmissionLedgerGoverned,
  getAdmissionLedgerPath,
  buildEvolutionLedger,
  readEvolutionLedger: readEvolutionLedgerGoverned,
  getEvolutionLedgerPath
} = require('../../lib/skill-ledger-governance');
const {
  buildHostEvolutionReport
} = require('../../lib/skill-system-host-evolution');
const {
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_ARTIFACT_PATHS,
  DERIVED_GOVERNANCE_EXPORT_SCHEMA_VERSION,
  listDerivedGovernanceRefreshPlan,
  findDerivedGovernanceRefreshStepByArtifactId,
  buildDerivedGovernanceFingerprint,
  writeDerivedGovernanceExport,
  readDerivedGovernanceExport,
  findLatestDerivedGovernanceExport,
  describeDerivedGovernanceExport,
  refreshDerivedGovernanceArtifacts
} = require('../../lib/skill-system-derived-governance');
const {
  createExpertSourceFamily,
  getExpertSourceFamiliesPath,
  getExpertSourceFamilyScorecardPath,
  loadExpertSourceFamilies,
  normalizeExpertSourceFamiliesDocument,
  buildEmptyExpertSourceIntegration,
  summarizeExpertSourceIntegrations,
  buildExpertSourceFamilyScorecard,
  writeExpertSourceFamilyScorecard
} = require('../../lib/expert-source-integration');
const {
  buildDeleteDependencySummary
} = require('../../lib/skill-delete-governance');
const {
  buildStableTopTierAssessment,
  buildStableTopTierPortfolio,
  buildStableTopTierUpgradeBoard,
  buildStableTopTierExecutionFocus,
  buildStableTopTierHardeningPlan
} = require('../../lib/skill-top-tier-governance');
const {
  EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
  EXPERT_SOURCE_INTEGRATION_MODE,
  DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
  isActiveExpertSourceFamily,
  normalizeExpertSourceFamilyStatus,
  canArchiveExpertSourceFamily,
  isValidExpertSourceFamilyId,
  getDefaultExpertSourceIntegrationFile,
  getDefaultExpertSourceRawRoot
} = require('../../lib/skill-expert-source-governance');
const {
  ALL_SKILL_KINDS,
  KIND_TO_LAYER_MAP,
  getTopTierReferenceFloorForKind,
  getPlaceholderRouteConfig,
  getRequiredIntentTagsForKind: getRequiredIntentTagsForKindFromGovernance,
  supportsCapabilityModuleScaffold,
  describeCapabilityModuleScaffoldKinds,
  getCapabilityModuleDescriptions,
  shouldCreatePlaceholderRoute,
  shouldAppearOnActiveRouteSurface,
  shouldTrackScaffoldLineage,
  shouldSyncGovernedRouteArtifacts
} = require('../../lib/skill-kind-governance');
const {
  SKILL_SUPPORTED_HOSTS_ORDER,
  isKnownSupportedHost
} = require('../../lib/skill-frontmatter-governance');
const {
  getWriteabilityTrackedGovernanceArtifacts
} = require('../../lib/skill-generated-artifact-governance');
const {
  buildSkillRegistryDocument,
  readSkillRegistry,
  syncSkillCatalog
} = require('../../lib/skill-registry-governance');
const {
  syncExperimentalPackManifest
} = require('../../lib/skill-system-packs');

const VALID_KINDS = KIND_TO_LAYER_MAP;
const HOSTS = SKILL_SUPPORTED_HOSTS_ORDER;

function fail(message) {
  throw new Error(message);
}

function getProjectRoot() {
  return resolveSkillProjectRoot({
    startDir: process.cwd(),
    scriptPath: __filename
  });
}

function isJsonOutputFlag(value) {
  return value === '--json';
}

function getAuthoritativeSkillsRoot() {
  return path.join(getProjectRoot(), 'personal-skill-system', 'skills');
}

function splitFrontmatter(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return null;
  return {
    head: normalized.slice(4, end),
    body: normalized.slice(end + 5),
  };
}

function getRequiredIntentTagsForKind(kind) {
  return [...getRequiredIntentTagsForKindFromGovernance(kind)];
}

function getScaffoldModulesCliSuffix(kind) {
  return supportsCapabilityModuleScaffold(kind) ? ' --scaffold-modules' : '';
}

function formatCreateCommand(kind, skillNamePlaceholder = '<skill-name>', options = {}) {
  return `node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${kind} ${skillNamePlaceholder}${options.scaffoldModules ? ' --scaffold-modules' : ''}${options.deferWhenHostBlocked ? ' --defer-when-host-blocked' : ''}${options.requestId ? ` --request-id ${options.requestId}` : ''}${options.opportunityId ? ` --opportunity-id ${options.opportunityId}` : ''}`;
}

function parseRouteSharedMetadata(parsed) {
  const kind = String(parsed.map.get('kind') || '').trim();
  const triggerMode = uniqueSorted(parsed.map.get('trigger-mode'));
  const triggerKeywords = uniqueSorted(parsed.map.get('trigger-keywords'));
  const negativeKeywords = uniqueSorted(parsed.map.get('negative-keywords'));
  const aliases = uniqueSorted(parsed.map.get('aliases'));
  const supportedHosts = uniqueSorted(parsed.map.get('supported-hosts'));
  const autoChain = uniqueSorted(parsed.map.get('auto-chain'));
  const conflictsWith = uniqueSorted(parsed.map.get('conflicts-with'));
  const intentTags = uniqueSorted([
    ...getRequiredIntentTagsForKind(kind),
    ...(triggerMode.includes('auto') ? [] : [])
  ]);

  return {
    kind,
    priority: parseInteger(parsed.map.get('priority'), 40),
    supportedHosts: supportedHosts.length > 0 ? supportedHosts : [...HOSTS],
    triggerMode,
    triggerKeywords,
    negativeKeywords,
    aliases,
    autoChain,
    conflictsWith,
    requiresExplicitInvocation: !triggerMode.includes('auto'),
    intentTags
  };
}

function parseFrontmatterMap(text) {
  const parts = splitFrontmatter(text);
  if (!parts) fail('invalid SKILL.md frontmatter');
  const map = new Map();
  for (const line of parts.head.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map.set(key, value);
  }
  return { parts, map };
}

function renderFrontmatter(map) {
  return [...map.entries()].map(([key, value]) => `${key}: ${value}`).join('\n');
}

function renderSkillFile(parsed) {
  const body = parsed.parts.body.startsWith('\n') ? parsed.parts.body : `\n${parsed.parts.body}`;
  return `---\n${renderFrontmatter(parsed.map)}\n---${body}`;
}

function writeSkillHostMetadata(targetDir, parsed) {
  const hostMetadataFile = path.join(targetDir, 'agents', 'openai.yaml');
  const skillsRoot = getAuthoritativeSkillsRoot();
  writeOpenAiMetadataFile(hostMetadataFile, {
    name: parsed.map.get('name'),
    title: parsed.map.get('title'),
    description: parsed.map.get('description'),
    kind: parsed.map.get('kind'),
    skillRelPath: path.relative(skillsRoot, targetDir).split(path.sep).join('/')
  }, {
    preserveExisting: true
  });
}

function parseBoolean(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function parseFrontmatterStoredValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    return '';
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^\d+$/.test(text)) return Number(text);
  if (text.startsWith('[') && text.endsWith(']')) {
    return text
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return text;
}

function parseInteger(value, fallback = null) {
  const parsed = Number(parseFrontmatterStoredValue(value));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeStringList(value) {
  const parsed = parseFrontmatterStoredValue(value);
  return (Array.isArray(parsed) ? parsed : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueSorted(values) {
  return [...new Set(normalizeStringList(values))].sort((a, b) => a.localeCompare(b));
}

const DIRECT_UPDATE_FORBIDDEN_FIELDS = new Map([
  ['name', 'update cannot modify name directly; create/merge/archive/delete through governed flows so identity-bearing registries and ledgers stay coherent'],
  ['kind', 'update cannot modify kind directly; create a replacement skill through governed flows so layer, template, and route contracts stay coherent'],
  ['status', 'update cannot modify status directly; use set-status, archive, or delete so generated governance surfaces stay synchronized'],
  ['scaffold-origin', 'update cannot modify scaffold-origin directly; use sync-scaffold-lineage so canonical template lineage stays governable'],
  ['scaffold-version', 'update cannot modify scaffold-version directly; use sync-scaffold-lineage so canonical template lineage stays governable'],
  ['runtime', 'update cannot modify runtime directly; repair the implementation intentionally and then use sync-runtime-proof through the governed runtime contract path'],
  ['executor', 'update cannot modify executor directly; repair the implementation intentionally and then use sync-runtime-proof through the governed runtime contract path'],
  ['permissions', 'update cannot modify permissions directly; repair the implementation intentionally and then use sync-runtime-proof through the governed runtime contract path'],
  ['host-smoke-tier', 'update cannot modify host-smoke-tier directly; repair the smoke contract intentionally and then use sync-runtime-proof / run-host-smoke through the governed proof path'],
  ['host-smoke-target-level', 'update cannot modify host-smoke-target-level directly; repair the smoke contract intentionally and then use sync-runtime-proof / run-host-smoke through the governed proof path'],
  ['host-smoke-freshness-days', 'update cannot modify host-smoke-freshness-days directly; repair the smoke contract intentionally and then use sync-runtime-proof through the governed proof path']
]);
const DIRECT_UPDATE_ROUTE_FIELDS = new Set([
  'description',
  'user-invocable',
  'trigger-mode',
  'trigger-keywords',
  'negative-keywords',
  'priority',
  'supported-hosts',
  'aliases',
  'conflicts-with',
  'auto-chain'
]);
const DIRECT_UPDATE_HOST_METADATA_FIELDS = new Set([
  'name',
  'title',
  'description',
  'kind'
]);
const DIRECT_UPDATE_REVIEW_FIELDS = new Set([
  'owner',
  'last-reviewed',
  'review-cycle-days',
  'status'
]);
const DIRECT_UPDATE_RUNTIME_PROOF_FIELDS = new Set([
  'runtime',
  'executor',
  'permissions',
  'host-smoke-tier',
  'host-smoke-target-level',
  'host-smoke-freshness-days',
  'status'
]);
function dedupeStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function slugToTitle(slug) {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function resolveSkillDirByName(skillsRoot, skillName) {
  if (!fs.existsSync(skillsRoot)) {
    fail(`authoritative skills root is missing: ${skillsRoot}`);
  }
  const stack = [skillsRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === 'references' || entry.name === 'scripts') continue;
      const skillFile = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const text = fs.readFileSync(skillFile, 'utf8');
        const parts = splitFrontmatter(text);
        if (!parts) {
          stack.push(full);
          continue;
        }
        const parsed = parseFrontmatterMap(text);
        const currentName = parsed.map.get('name');
        if (currentName === skillName) {
          return { dir: full, skillFile, parsed };
        }
      }
      stack.push(full);
    }
  }
  return null;
}

function resolveSkillDirByRelPath(skillsRoot, relPath) {
  const normalized = String(relPath || '').replace(/\//g, path.sep);
  const targetDir = path.join(skillsRoot, normalized);
  const skillFile = path.join(targetDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    return null;
  }
  const text = fs.readFileSync(skillFile, 'utf8');
  const parsed = parseFrontmatterMap(text);
  return { dir: targetDir, skillFile, parsed };
}

function ensureInsideAuthoritativeRoot(targetPath, skillsRoot) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(skillsRoot);
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    fail(`refuse to operate outside authoritative skill root: ${resolvedTarget}`);
  }
}

function directoryContainsFiles(rootDir) {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return false;
  }

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isFile()) {
        return true;
      }
      if (entry.isDirectory()) {
        stack.push(full);
      }
    }
  }
  return false;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readRuntimeProofRegistry(projectRoot) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  return {
    ...registry,
    proofs: dedupeRuntimeProofEntries(registry && registry.proofs, { prefer: 'first' })
  };
}

function mergeRuntimeProofUpdates(projectRoot, nextProofs = [], options = {}) {
  const currentRegistry = readRuntimeProofRegistry(projectRoot);
  const currentProofs = dedupeRuntimeProofEntries(currentRegistry.proofs, { prefer: 'first' });
  const removedSkills = new Set(
    (Array.isArray(options.removedSkills) ? options.removedSkills : [])
      .map((skill) => String(skill || '').trim())
      .filter(Boolean)
  );
  const touchedSkills = new Set(
    (
      Array.isArray(options.touchedSkills) && options.touchedSkills.length > 0
        ? options.touchedSkills
        : (Array.isArray(nextProofs) ? nextProofs.map((proof) => proof && proof.skill) : [])
    )
      .map((skill) => String(skill || '').trim())
      .filter(Boolean)
  );
  for (const skill of removedSkills) {
    touchedSkills.add(skill);
  }
  const nextProofBySkill = new Map(
    dedupeRuntimeProofEntries(nextProofs, { prefer: 'last' })
      .map((proof) => [String(proof && proof.skill || '').trim(), proof])
      .filter(([skill]) => !!skill)
  );

  const mergedProofs = [];
  for (const proof of currentProofs) {
    const skill = String(proof && proof.skill || '').trim();
    if (!skill || touchedSkills.has(skill)) {
      continue;
    }
    mergedProofs.push(proof);
  }
  for (const skill of touchedSkills) {
    if (!skill || removedSkills.has(skill)) {
      continue;
    }
    const proof = nextProofBySkill.get(skill);
    if (!proof) {
      continue;
    }
    mergedProofs.push(proof);
  }

  return dedupeRuntimeProofEntries(
    mergedProofs.sort((a, b) => String(a && a.skill || '').localeCompare(String(b && b.skill || ''))),
    { prefer: 'last' }
  );
}

function readGovernedRegistry(projectRoot) {
  const registryPath = getRegistryPath(projectRoot);
  if (!fs.existsSync(registryPath)) {
    return readSkillRegistry(getBundleRoot(projectRoot));
  }
  const raw = readJsonSafe(registryPath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(`skill registry is unreadable or invalid: ${registryPath}`);
  }
  return readSkillRegistry(getBundleRoot(projectRoot));
}

function writeGovernedRegistry(projectRoot, registry, options = {}) {
  const nextRegistry = buildSkillRegistryDocument(
    registry && registry.skills,
    registry && registry['module-groups'],
    {
      now: Date.parse(String(registry && registry['generated-at'] || '').trim()) || options.now || Date.now()
    }
  );
  writeJson(getRegistryPath(projectRoot), nextRegistry);
  syncSkillCatalog(getBundleRoot(projectRoot), nextRegistry);
  return nextRegistry;
}

function getGeneratedWriteRequirements(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  return getWriteabilityTrackedGovernanceArtifacts(bundleRoot).map((artifact) => ({
    path: artifact.path,
    mode: artifact.mode,
    label: artifact.label
  }));
}

function assertGeneratedArtifactsWritable(projectRoot, actionLabel, options = {}) {
  const requestedPaths = Array.isArray(options.paths) && options.paths.length > 0
    ? new Set(options.paths.map((item) => path.resolve(item)))
    : null;
  const optionalPaths = Array.isArray(options.optionalPaths) && options.optionalPaths.length > 0
    ? new Set(options.optionalPaths.map((item) => path.resolve(item)))
    : new Set();
  const failures = [];

  for (const requirement of getGeneratedWriteRequirements(projectRoot)) {
    if (requestedPaths && !requestedPaths.has(path.resolve(requirement.path))) {
      continue;
    }
    const probe = probeArtifactWriteAccess(requirement.path, { mode: requirement.mode });
    if (!probe.ok) {
      if (optionalPaths.has(path.resolve(requirement.path))) {
        continue;
      }
      failures.push({
        ...requirement,
        code: probe.code || 'UNKNOWN'
      });
    }
  }

  if (failures.length < 1) {
    return;
  }

  const details = failures
    .map((item) => `${item.label} (${toPortablePath(projectRoot, item.path)}: ${item.code})`)
    .join('; ');
  fail(`cannot ${actionLabel} because generated governance surfaces are not writable on this host: ${details}`);
}

function getDirectoryCreateConstraint(projectRoot, targetDir, actionLabel) {
  const resolvedPath = path.resolve(targetDir);
  const parentDir = path.dirname(resolvedPath);
  const writeProbe = probeArtifactWriteAccess(path.join(parentDir, '.codex-write-probe.tmp'), { mode: 'create-file' });
  if (!writeProbe.ok) {
    return {
      type: 'parent-write-blocked',
      mode: 'create-file',
      path: resolvedPath,
      parent: parentDir,
      code: writeProbe.code || 'UNKNOWN',
      message: `cannot ${actionLabel} because the authoritative skill tree parent is not writable on this host: ${toPortablePath(projectRoot, parentDir)} (${writeProbe.code || 'UNKNOWN'})`
    };
  }
  const createProbe = probeDirectoryCreateAccess(resolvedPath);
  if (createProbe.ok) {
    return null;
  }
  return {
    type: 'child-directory-blocked',
    mode: 'create-child-directory',
    path: resolvedPath,
    parent: parentDir,
    code: createProbe.code || 'UNKNOWN',
    message: `cannot ${actionLabel} because the authoritative skill tree cannot create child directories on this host: ${toPortablePath(projectRoot, parentDir)} (${createProbe.code || 'UNKNOWN'})`
  };
}

function assertDirectoryCreatable(targetDir, actionLabel) {
  const constraint = getDirectoryCreateConstraint(getProjectRoot(), targetDir, actionLabel);
  if (!constraint) {
    return;
  }
  fail(constraint.message);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugifyAdmissionText(value) {
  return normalizeAdmissionText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'admission-request';
}

function suggestSkillNameFromAdmissionRequest(value, kind = '') {
  const normalized = slugifyAdmissionText(value).replace(/^-+|-+$/g, '');
  const truncated = normalized.slice(0, 48).replace(/-+$/g, '');
  const fallbackKind = normalizeString(kind) || 'skill';
  return truncated || `new-${fallbackKind}`;
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function replaceLine(text, pattern, nextLine) {
  if (!pattern.test(text)) {
    return text;
  }
  return text.replace(pattern, `${nextLine}`);
}

function getRegistryPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'registry.generated.json');
}

function getRouteMapPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'route-map.generated.json');
}

function getRouteFixturesPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
}

function getRatingsPath(projectRoot) {
  return getCapabilityRatingsPath(getBundleRoot(projectRoot));
}

function getReviewQueueRegistryPath(projectRoot) {
  return getReviewQueuePath(getBundleRoot(projectRoot));
}

function getSkillOpportunityQueueRegistryPath(projectRoot) {
  return getSkillOpportunityQueuePath(getBundleRoot(projectRoot));
}

function getSkillInvestmentBacklogRegistryPath(projectRoot) {
  return getSkillInvestmentBacklogPath(getBundleRoot(projectRoot));
}

function getSkillInvestmentBacklogDocFilePath(projectRoot) {
  return getSkillInvestmentBacklogDocPath(getBundleRoot(projectRoot));
}

function getPendingScaffoldRegistryFilePath(projectRoot) {
  return getPendingScaffoldRegistryPath(getBundleRoot(projectRoot));
}

function getExpertSourceFamiliesRegistryPath(projectRoot) {
  return getExpertSourceFamiliesPath(getBundleRoot(projectRoot));
}

function getExpertSourceFamilyScorecardRegistryPath(projectRoot) {
  return getExpertSourceFamilyScorecardPath(getBundleRoot(projectRoot));
}

function getRatingsDocPath(projectRoot) {
  return getCapabilityRatingsDocPath(getBundleRoot(projectRoot));
}

function getRuntimeProofPath(projectRoot) {
  return getRuntimeProofRegistryPath(getBundleRoot(projectRoot));
}

function getSystemReadinessPath(projectRoot) {
  return path.join(getBundleRoot(projectRoot), 'benchmark', 'system-readiness.generated.json');
}

function getBundleRoot(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system');
}

function getDerivedGovernanceExportRoot(projectRoot) {
  return path.join(projectRoot, '.personal-skill-system', 'derived-governance-exports');
}

function getFallbackDerivedGovernanceExportRoot() {
  return path.join(os.tmpdir(), 'personal-skill-system', 'derived-governance-exports');
}

function resolveDerivedGovernanceExportRoot(projectRoot) {
  const candidateRoots = [
    getDerivedGovernanceExportRoot(projectRoot),
    getFallbackDerivedGovernanceExportRoot()
  ];

  for (const root of candidateRoots) {
    try {
      fs.mkdirSync(root, { recursive: true });
      return root;
    } catch {
      continue;
    }
  }

  return candidateRoots[0];
}

function buildDefaultDerivedGovernanceExportDir(projectRoot) {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  const root = resolveDerivedGovernanceExportRoot(projectRoot);
  return path.join(root, `derived-governance-export-${stamp}`);
}

function getDerivedGovernanceSearchRoots(projectRoot) {
  return [
    getDerivedGovernanceExportRoot(projectRoot),
    getFallbackDerivedGovernanceExportRoot()
  ];
}

function getExperimentalPackManifestPath(projectRoot) {
  return path.join(getBundleRoot(projectRoot), 'packs', 'experimental', 'manifest.json');
}

function normalizeOptionalCliValue(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function getHostSmokeProofsFromRegistry(projectRoot) {
  const registry = readRuntimeProofRegistry(projectRoot);
  return (Array.isArray(registry.proofs) ? registry.proofs : [])
    .filter((proof) => proof && proof['host-smoke']);
}

function readCurrentSystemReadiness(projectRoot) {
  const readinessPath = getSystemReadinessPath(projectRoot);
  if (!fs.existsSync(readinessPath)) {
    return null;
  }
  return readJsonSafe(readinessPath);
}

function readAdmissionLedger(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  const ledgerPath = getAdmissionLedgerPath(bundleRoot);
  const ledger = readAdmissionLedgerGoverned(bundleRoot);
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    fail(`admission ledger is unreadable or invalid: ${ledgerPath}`);
  }
  return ledger;
}

function writeAdmissionLedger(projectRoot, ledger) {
  const bundleRoot = getBundleRoot(projectRoot);
  const nextLedger = buildAdmissionLedger(ledger && ledger.entries);
  writeJson(getAdmissionLedgerPath(bundleRoot), nextLedger);
  return nextLedger;
}

function appendAdmissionLedgerEntry(projectRoot, entry) {
  const ledger = readAdmissionLedger(projectRoot);
  ledger.entries.push(entry);
  return writeAdmissionLedger(projectRoot, ledger);
}

function resolveCreateGovernanceLinks(projectRoot, options = {}) {
  const requestId = normalizeString(options.requestId);
  let opportunityId = normalizeString(options.opportunityId);
  let admissionEntry = null;

  if (requestId) {
    const ledger = readAdmissionLedger(projectRoot);
    admissionEntry = (Array.isArray(ledger.entries) ? ledger.entries : [])
      .find((entry) => normalizeString(entry && entry['request-id']) === requestId) || null;
    if (!admissionEntry) {
      fail(`unknown admission request '${requestId}'`);
    }

    const linkedOpportunityId = normalizeString(admissionEntry['opportunity-id']);
    if (opportunityId && linkedOpportunityId && opportunityId !== linkedOpportunityId) {
      fail(`admission request '${requestId}' is linked to opportunity '${linkedOpportunityId}', not '${opportunityId}'`);
    }
    if (!opportunityId) {
      opportunityId = linkedOpportunityId;
    }
  }

  return {
    requestId: requestId || null,
    opportunityId: opportunityId || null,
    admissionEntry
  };
}

function readEvolutionLedger(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  const ledgerPath = getEvolutionLedgerPath(bundleRoot);
  const ledger = readEvolutionLedgerGoverned(bundleRoot);
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    fail(`evolution ledger is unreadable or invalid: ${ledgerPath}`);
  }
  return ledger;
}

function writeEvolutionLedger(projectRoot, ledger) {
  const bundleRoot = getBundleRoot(projectRoot);
  const nextLedger = buildEvolutionLedger(ledger && ledger.entries);
  writeJson(getEvolutionLedgerPath(bundleRoot), nextLedger);
  return nextLedger;
}

function appendEvolutionLedgerEntry(projectRoot, entry) {
  const ledger = readEvolutionLedger(projectRoot);
  ledger.entries.push(entry);
  return writeEvolutionLedger(projectRoot, ledger);
}

function readOpportunityQueue(projectRoot) {
  const queuePath = getSkillOpportunityQueueRegistryPath(projectRoot);
  if (!fs.existsSync(queuePath)) {
    return buildSkillOpportunityQueue([], { now: Date.now() });
  }

  const raw = readJsonSafe(queuePath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(`skill opportunity queue is unreadable or invalid: ${queuePath}`);
  }

  return buildSkillOpportunityQueue(raw.entries, {
    now: Date.parse(String(raw['generated-at'] || '').trim()) || Date.now()
  });
}

function writeOpportunityQueue(projectRoot, queue) {
  const nextQueue = buildSkillOpportunityQueue(queue && queue.entries, {
    now: Date.parse(String(queue && queue['generated-at'] || '').trim()) || Date.now()
  });
  writeJson(getSkillOpportunityQueueRegistryPath(projectRoot), nextQueue);
  return nextQueue;
}

function appendOpportunityQueueEntry(projectRoot, entry) {
  const queue = readOpportunityQueue(projectRoot);
  queue.entries.push(entry);
  return writeOpportunityQueue(projectRoot, queue);
}

function findOpportunityQueueEntry(projectRoot, opportunityId) {
  const normalizedId = normalizeString(opportunityId);
  if (!normalizedId) {
    fail('opportunity id is required');
  }

  const queue = readOpportunityQueue(projectRoot);
  const entry = queue.entries.find((item) => item['opportunity-id'] === normalizedId) || null;
  if (!entry) {
    fail(`unknown skill opportunity '${normalizedId}'`);
  }

  return {
    queue,
    entry
  };
}

function resolveOpportunity(projectRoot, opportunityId, resolution = {}) {
  const normalizedId = String(opportunityId || '').trim();
  if (!normalizedId) {
    fail('resolve-opportunity requires a non-empty opportunity id');
  }

  const queue = readOpportunityQueue(projectRoot);
  const index = queue.entries.findIndex((entry) => entry['opportunity-id'] === normalizedId);
  if (index === -1) {
    fail(`unknown skill opportunity '${normalizedId}'`);
  }

  const existing = queue.entries[index];
  const nextStatus = normalizeOpportunityStatus(resolution.status || existing.status || 'implemented');
  queue.entries[index] = {
    ...existing,
    status: nextStatus,
    ...(resolution.createdSkill ? { 'created-skill': String(resolution.createdSkill).trim() } : existing['created-skill'] ? { 'created-skill': existing['created-skill'] } : {}),
    ...(resolution.admissionRequestId ? { 'admission-request-id': String(resolution.admissionRequestId).trim() } : existing['admission-request-id'] ? { 'admission-request-id': existing['admission-request-id'] } : {}),
    ...(resolution.note ? { note: String(resolution.note).trim() } : existing.note ? { note: existing.note } : {}),
    ...(!isActiveOpportunityStatus(nextStatus)
      ? { 'resolved-at': String(resolution['resolved-at'] || new Date().toISOString()).trim() }
      : {})
  };
  const nextQueue = writeOpportunityQueue(projectRoot, queue);
  refreshSkillInvestmentBacklog(projectRoot, {
    opportunityQueueData: nextQueue
  });
  refreshSystemReadiness(projectRoot, { bestEffort: true });
  return nextQueue.entries.find((entry) => entry['opportunity-id'] === normalizedId) || queue.entries[index];
}

function syncOpportunityQueueOnAdmissionDecision(projectRoot, result, options = {}) {
  const opportunityId = normalizeString(options.opportunityId);
  if (!opportunityId) {
    return null;
  }

  const queue = readOpportunityQueue(projectRoot);
  const index = queue.entries.findIndex((entry) => entry['opportunity-id'] === opportunityId);
  if (index === -1) {
    fail(`unknown skill opportunity '${opportunityId}'`);
  }

  const existing = queue.entries[index];
  const recommendationAction = normalizeAdmissionDecisionAction(result && result.recommendation && result.recommendation.action);
  const admissionRequestId = normalizeString(result && result['request-id']);
  let nextStatus = normalizeOpportunityStatus(
    getDefaultOpportunityStatusForDecision(recommendationAction) || existing.status || 'open'
  );
  const note = buildAdmissionOpportunityNote(recommendationAction, {
    admissionRequestId,
    decision: result && result.recommendation
  }) || normalizeString(existing.note);

  queue.entries[index] = {
    ...existing,
    status: nextStatus,
    ...(admissionRequestId ? { 'admission-request-id': admissionRequestId } : {}),
    ...(note ? { note } : {}),
    ...(ACTIVE_OPPORTUNITY_STATUSES.has(nextStatus)
      ? {}
      : { 'resolved-at': new Date().toISOString() })
  };

  if (ACTIVE_OPPORTUNITY_STATUSES.has(nextStatus)) {
    delete queue.entries[index]['resolved-at'];
  }

  const nextQueue = writeOpportunityQueue(projectRoot, queue);
  refreshSkillInvestmentBacklog(projectRoot, {
    opportunityQueueData: nextQueue
  });
  return nextQueue.entries.find((entry) => entry['opportunity-id'] === opportunityId) || null;
}

function resolveAdmissionDecision(projectRoot, requestId, resolution = {}) {
  const normalizedId = String(requestId || '').trim();
  if (!normalizedId) {
    fail('resolve-admission requires a non-empty request id');
  }

  const ledger = readAdmissionLedger(projectRoot);
  const index = ledger.entries.findIndex((entry) => entry['request-id'] === normalizedId);
  if (index === -1) {
    fail(`unknown admission request '${normalizedId}'`);
  }

  const existing = ledger.entries[index];
  const nextStatus = normalizeAdmissionStatus(resolution.status || existing.status || 'resolved', 'resolved');
  const nextEntry = {
    ...existing,
    status: nextStatus,
    ...(resolution.createdSkill ? { 'created-skill': String(resolution.createdSkill).trim() } : existing['created-skill'] ? { 'created-skill': existing['created-skill'] } : {}),
    ...(resolution.note ? { note: String(resolution.note).trim() } : existing.note ? { note: existing.note } : {})
  };
  if (isActiveAdmissionStatus(nextStatus)) {
    delete nextEntry['resolved-at'];
  } else {
    nextEntry['resolved-at'] = String(resolution['resolved-at'] || new Date().toISOString()).trim();
  }
  ledger.entries[index] = nextEntry;
  writeAdmissionLedger(projectRoot, ledger);
  refreshSkillInvestmentBacklog(projectRoot, {
    admissionLedgerData: ledger
  });
  refreshSystemReadiness(projectRoot, { bestEffort: true });
  return ledger.entries[index];
}

function resolveEvolutionDecision(projectRoot, requestId, resolution = {}) {
  const normalizedId = String(requestId || '').trim();
  if (!normalizedId) {
    fail('resolve-evolution requires a non-empty request id');
  }

  const ledger = readEvolutionLedger(projectRoot);
  const index = ledger.entries.findIndex((entry) => entry['request-id'] === normalizedId);
  if (index === -1) {
    fail(`unknown evolution request '${normalizedId}'`);
  }

  const existing = ledger.entries[index];
  ledger.entries[index] = {
    ...existing,
    status: normalizeEvolutionLedgerStatus(resolution.status || existing.status || 'resolved', 'resolved'),
    ...(resolution.executedAction ? { 'executed-action': String(resolution.executedAction).trim() } : existing['executed-action'] ? { 'executed-action': existing['executed-action'] } : {}),
    ...(resolution.resultStatus ? { 'result-status': String(resolution.resultStatus).trim() } : existing['result-status'] ? { 'result-status': existing['result-status'] } : {}),
    ...(resolution.mergedInto ? { 'merged-into': String(resolution.mergedInto).trim() } : existing['merged-into'] ? { 'merged-into': existing['merged-into'] } : {}),
    ...(resolution.note ? { note: String(resolution.note).trim() } : existing.note ? { note: existing.note } : {}),
    'resolved-at': String(resolution['resolved-at'] || new Date().toISOString()).trim()
  };
  writeEvolutionLedger(projectRoot, ledger);
  refreshSkillInvestmentBacklog(projectRoot, {
    evolutionLedgerData: ledger
  });
  refreshSystemReadiness(projectRoot, { bestEffort: true });
  return ledger.entries[index];
}

function buildRegistryPath(kind, skillName) {
  return `skills/${VALID_KINDS.get(kind)}/${skillName}/SKILL.md`;
}

function removeValues(values, needles) {
  const items = Array.isArray(values) ? values : [];
  const removals = needles instanceof Set ? needles : new Set(Array.isArray(needles) ? needles : []);
  return items.filter((item) => !removals.has(item));
}

function slugFromReferencePath(refPath) {
  return path.basename(String(refPath || ''), path.extname(String(refPath || ''))).toLowerCase();
}

function titleFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildCapabilityModuleDescription(kind, refPath) {
  const slug = slugFromReferencePath(refPath);
  const descriptions = getCapabilityModuleDescriptions(kind);
  if (descriptions[slug]) {
    return descriptions[slug];
  }
  return `Scaffolded capability module for ${titleFromSlug(slug)} inside ${kind} '${refPath}'.`;
}

function buildCapabilityModuleScaffolds(projectRoot, kind, skillName, skillText, targetDir, outputTargetDir = targetDir) {
  if (!supportsCapabilityModuleScaffold(kind)) {
    fail(`capability-module scaffolding is only supported for ${describeCapabilityModuleScaffoldKinds()} skills, not '${kind}'`);
  }

  const referencePaths = readReferencePaths(skillText).filter((refPath) => String(refPath || '').startsWith('references/'));
  if (referencePaths.length < 1) {
    fail(`cannot scaffold capability modules for '${skillName}' because SKILL.md declares no references/ entries in 'Read These References'`);
  }

  return referencePaths.map((refPath) => {
    const absoluteRefPath = path.join(targetDir, refPath);
    if (!fs.existsSync(absoluteRefPath)) {
      fail(`cannot scaffold capability module '${skillName}' because reference '${refPath}' is missing from the copied template`);
    }

    const slug = slugFromReferencePath(refPath);
    return {
      id: `${skillName}-${slug}`,
      path: toPortablePath(getBundleRoot(projectRoot), path.join(outputTargetDir, refPath)),
      capability: buildCapabilityModuleDescription(kind, refPath)
    };
  });
}

function readPendingScaffoldRegistry(projectRoot) {
  const file = getPendingScaffoldRegistryFilePath(projectRoot);
  if (!fs.existsSync(file)) {
    return buildPendingScaffoldRegistry([]);
  }
  return readJson(file);
}

function writePendingScaffoldRegistry(projectRoot, registry) {
  writeJson(getPendingScaffoldRegistryFilePath(projectRoot), buildPendingScaffoldRegistry(registry.entries || []));
}

function buildScaffoldPlan(projectRoot, kind, skillName, options = {}) {
  const templateDir = path.join(projectRoot, 'personal-skill-system', 'templates', 'skill', kind);
  const targetDir = path.join(getAuthoritativeSkillsRoot(), VALID_KINDS.get(kind), skillName);
  const authoritativeSkillRelPath = path.relative(getAuthoritativeSkillsRoot(), targetDir).split(path.sep).join('/');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `pss-scaffold-${skillName}-`));
  const stagedDir = path.join(tempRoot, skillName);
  try {
    fs.mkdirSync(stagedDir, { recursive: true });
    fs.cpSync(templateDir, stagedDir, { recursive: true });

    const skillFile = path.join(stagedDir, 'SKILL.md');
    const parsed = parseFrontmatterMap(fs.readFileSync(skillFile, 'utf8'));
    const templateLineage = readTemplateLineage(path.join(projectRoot, 'personal-skill-system'), kind);
    const reviewMetadata = buildSeedReviewMetadata(kind);
    parsed.map.set('name', skillName);
    parsed.map.set('title', `${slugToTitle(skillName)} ${slugToTitle(kind)}`);
    parsed.map.set('description', `TODO: describe ${skillName}. Use when this ${kind} is the correct primary route.`);
    parsed.map.set('status', 'draft');
    parsed.map.set('owner', reviewMetadata.owner);
    parsed.map.set('last-reviewed', reviewMetadata['last-reviewed']);
    parsed.map.set('review-cycle-days', String(reviewMetadata['review-cycle-days']));
    if (templateLineage) {
      parsed.map.set(SCAFFOLD_ORIGIN_FIELD, templateLineage.origin);
      parsed.map.set(SCAFFOLD_VERSION_FIELD, String(templateLineage.version));
    }
    const renderedSkill = renderSkillFile(parsed);
    fs.writeFileSync(skillFile, renderedSkill, 'utf8');
    writeOpenAiMetadataFile(path.join(stagedDir, 'agents', 'openai.yaml'), {
      name: parsed.map.get('name'),
      title: parsed.map.get('title'),
      description: parsed.map.get('description'),
      kind: parsed.map.get('kind'),
      skillRelPath: authoritativeSkillRelPath
    });

    const capabilityModules = options.scaffoldModules
      ? buildCapabilityModuleScaffolds(projectRoot, kind, skillName, renderedSkill, stagedDir, targetDir)
      : [];
    const createPlaceholderRoute = shouldCreatePlaceholderRoute(kind, parseBoolean(parsed.map.get('user-invocable'), true));
    const shared = parseRouteSharedMetadata(parsed);
    const files = [];
    const stack = [stagedDir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        files.push({
          path: path.relative(stagedDir, full).split(path.sep).join('/'),
          content: fs.readFileSync(full, 'utf8')
        });
      }
    }
    files.sort((left, right) => left.path.localeCompare(right.path));

    return {
      kind,
      skill: skillName,
      targetDir,
      templateDir,
      files,
      capabilityModules,
      createPlaceholderRoute,
      shared,
      templateLineage
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildSkillBlueprint(projectRoot, kind, skillName, options = {}) {
  const plan = buildScaffoldPlan(projectRoot, kind, skillName, options);
  const skillFile = (Array.isArray(plan.files) ? plan.files : []).find((file) => file.path === 'SKILL.md') || null;
  if (!skillFile) {
    fail(`unable to build scaffold blueprint for '${skillName}' because SKILL.md is missing from the scaffold plan`);
  }

  const parsed = parseFrontmatterMap(String(skillFile.content || ''));
  const shared = plan.shared || parseRouteSharedMetadata(parsed);
  const referencePaths = readReferencePaths(skillFile.content);
  const runtimeProofItems = readBulletSectionItems(skillFile.content, 'Runtime Proof');
  const filePaths = (Array.isArray(plan.files) ? plan.files : [])
    .map((file) => String(file.path || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const routePreview = plan.createPlaceholderRoute
    ? buildRouteEntry(kind, skillName, {
        shared,
        expertModules: Array.isArray(plan.capabilityModules)
          ? plan.capabilityModules.map((module) => module.id)
          : []
      })
    : null;
  const reviewMetadata = {
    owner: normalizeString(parsed.map.get('owner')),
    'last-reviewed': normalizeString(parsed.map.get('last-reviewed')),
    'review-cycle-days': parseInteger(parsed.map.get('review-cycle-days'))
  };
  const runtimeProofExpectation = {
    level: getDefaultRuntimeProofLevelForStatus(normalizeString(parsed.map.get('status')) || 'draft'),
    'minimum-contracts': 2,
    'current-contract-count': runtimeProofItems.length,
    'needs-more-contracts': runtimeProofItems.length < 2,
    'host-smoke-policy': isGovernedRuntimeProofRecord({
      status: normalizeString(parsed.map.get('status')),
      runtime: normalizeString(parsed.map.get('runtime')),
      kind,
      executor: normalizeString(parsed.map.get('executor')),
      permissions: normalizeStringList(parseFrontmatterStoredValue(parsed.map.get('permissions')))
    })
      ? {
          tier: normalizeHostSmokeTier(parsed.map.get('host-smoke-tier')) || null,
          'target-level': normalizeHostSmokeTargetLevel(parsed.map.get('host-smoke-target-level')) || null,
          'freshness-days': normalizeHostSmokeFreshnessDays(parsed.map.get('host-smoke-freshness-days')) ?? null
        }
      : null
  };
  const topTierReadiness = {
    references: {
      current: referencePaths.length,
      required: getTopTierReferenceFloorForKind(kind)
    },
    capability_modules: {
      required: supportsCapabilityModuleScaffold(kind),
      count: Array.isArray(plan.capabilityModules) ? plan.capabilityModules.length : 0,
      ids: Array.isArray(plan.capabilityModules) ? plan.capabilityModules.map((module) => module.id) : []
    },
    route_surface: {
      user_invocable: parseBoolean(parsed.map.get('user-invocable'), true),
      placeholder_route_planned: Boolean(routePreview),
      explicit_invocation: Boolean(shared.requiresExplicitInvocation),
      trigger_keywords: Array.isArray(shared.triggerKeywords) ? shared.triggerKeywords : []
    },
    runtime_proof: runtimeProofExpectation,
    review: reviewMetadata,
    blockers: buildSkillBlueprintTopTierBlockers(kind, {
      referencePaths,
      runtimeProofItems,
      capabilityModules: plan.capabilityModules,
      routePreview,
      reviewMetadata,
      parsed,
      shared
    })
  };

  return {
    action: 'show-skill-blueprint',
    kind,
    skill: skillName,
    path: path.relative(projectRoot, plan.targetDir).split(path.sep).join('/'),
    template: {
      source: path.relative(projectRoot, plan.templateDir).split(path.sep).join('/'),
      ...(plan.templateLineage
        ? {
            lineage: {
              origin: plan.templateLineage.origin,
              version: plan.templateLineage.version
            }
          }
        : {})
    },
    frontmatter: Object.fromEntries(parsed.map.entries()),
    files: filePaths,
    references: referencePaths,
    'runtime-proof-items': runtimeProofItems,
    'capability-modules': Array.isArray(plan.capabilityModules) ? plan.capabilityModules : [],
    'route-preview': routePreview,
    'review-metadata': reviewMetadata,
    'top-tier-readiness': topTierReadiness,
    follow_up: [
      `create the governed scaffold with: ${formatCreateCommand(kind, skillName, {
        scaffoldModules: supportsCapabilityModuleScaffold(kind)
      })}`,
      `rerun this blueprint after adjusting the intended boundary: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-blueprint ${kind} ${skillName}${supportsCapabilityModuleScaffold(kind) ? ' --scaffold-modules' : ''}`
    ]
  };
}

function buildSkillBlueprintTopTierBlockers(kind, context = {}) {
  const blockers = [];
  const referencePaths = Array.isArray(context.referencePaths) ? context.referencePaths : [];
  const runtimeProofItems = Array.isArray(context.runtimeProofItems) ? context.runtimeProofItems : [];
  const capabilityModules = Array.isArray(context.capabilityModules) ? context.capabilityModules : [];
  const routePreview = context.routePreview || null;
  const reviewMetadata = context.reviewMetadata || {};
  const parsed = context.parsed || { map: new Map() };

  const topTierReferenceFloor = getTopTierReferenceFloorForKind(kind);
  if (referencePaths.length < topTierReferenceFloor) {
    blockers.push(`top-tier depth still needs ${topTierReferenceFloor - referencePaths.length} more reference file(s)`);
  }
  if (supportsCapabilityModuleScaffold(kind) && capabilityModules.length < 1) {
    blockers.push('capability-module governance scaffold is missing');
  }
  if (parseBoolean(parsed.map.get('user-invocable'), true)) {
    const triggerKeywords = routePreview && routePreview.activation && Array.isArray(routePreview.activation['trigger-keywords'])
      ? routePreview.activation['trigger-keywords']
      : [];
    if (triggerKeywords.length < 2) {
      blockers.push('route surface still needs at least two concrete trigger keywords');
    }
    blockers.push('route fixture evidence must be added after the skill is real');
  }
  if (runtimeProofItems.length < 2) {
    blockers.push('Runtime Proof section still needs at least two concrete proof bullets');
  }
  if (!normalizeString(reviewMetadata['last-reviewed']) || !Number.isInteger(Number(reviewMetadata['review-cycle-days']))) {
    blockers.push('stable review metadata is incomplete');
  }
  if (/^TODO:/i.test(normalizeString(parsed.map.get('description')))) {
    blockers.push('description still contains scaffold placeholder text');
  }
  if (normalizeString(parsed.map.get('status')) !== 'stable') {
    blockers.push("skill still starts as 'draft' and must be hardened before stable promotion");
  }

  return blockers;
}

function buildSkillRetirementRecommendations(skillName, context = {}) {
  const recommendations = [];
  const deleteGovernance = context.deleteGovernance || {
    allowed: false,
    blockers: [],
    history: [],
    'has-delete-evidence': false
  };
  const frontmatter = context.frontmatter || {};
  const status = normalizeString(frontmatter.status);
  const activeRoute = parseBoolean(context.activeRoute, false);
  const nearestPeer = context.nearestPeer || null;
  const capabilityModules = Array.isArray(context.capabilityModules) ? context.capabilityModules : [];

  if (deleteGovernance.allowed) {
    recommendations.push({
      action: 'delete-skill',
      reason: 'all governed delete blockers are clear'
    });
  } else if (status !== 'archived') {
    recommendations.push({
      action: 'archive-skill',
      reason: 'active governance dependencies still exist, so preserve history before any harder retirement move'
    });
  }

  if (nearestPeer && activeRoute) {
    recommendations.push({
      action: 'merge-into-skill',
      target_skill: nearestPeer.skill,
      reason: `active route ownership still overlaps with '${nearestPeer.skill}'`
    });
  }

  if (capabilityModules.length > 0) {
    recommendations.push({
      action: 'remove-capability-module-obligations',
      reason: 'registered capability modules should be intentionally handed off or retired before hard deletion'
    });
  }

  if (!deleteGovernance.allowed && status === 'archived') {
    recommendations.push({
      action: 'clear-delete-blockers',
      reason: 'the skill is already archived but governance references still prevent final deletion'
    });
  }

  return recommendations;
}

function buildSkillRetirementBlockers(skillName, context = {}) {
  const blockers = [];
  const deleteGovernance = context.deleteGovernance || {
    allowed: false,
    blockers: [],
    history: [],
    'has-delete-evidence': false
  };
  const frontmatter = context.frontmatter || {};
  const status = normalizeString(frontmatter.status);
  const activeRoute = parseBoolean(context.activeRoute, false);
  const capabilityModules = Array.isArray(context.capabilityModules) ? context.capabilityModules : [];
  const runtimeProof = context.runtimeProof || null;

  if (activeRoute) {
    blockers.push('skill still owns an active route surface');
  }
  if (status === 'stable') {
    blockers.push("skill is still 'stable'; demote or archive before treating retirement as honest");
  }
  if (capabilityModules.length > 0) {
    blockers.push(`skill still owns ${capabilityModules.length} governed capability module(s)`);
  }
  if (runtimeProof && normalizeString(runtimeProof.level) === 'host-smoked') {
    blockers.push('runtime-proof still claims host-smoked evidence that should be intentionally retired');
  }
  for (const blocker of Array.isArray(deleteGovernance.blockers) ? deleteGovernance.blockers : []) {
    blockers.push(normalizeString(blocker && blocker.message));
  }

  return blockers.filter(Boolean);
}

function buildSkillRetirementBlueprint(projectRoot, options = {}) {
  const skillsRoot = getAuthoritativeSkillsRoot();
  const byName = options && options.name ? resolveSkillDirByName(skillsRoot, options.name) : null;
  const byPath = options && options.path ? resolveSkillDirByRelPath(skillsRoot, options.path) : null;
  const resolved = byName || byPath;
  const identifier = options && (options.name || options.path);

  if (!resolved) fail(`unknown skill '${identifier}'`);
  ensureInsideAuthoritativeRoot(resolved.dir, skillsRoot);

  const skillName = normalizeString(resolved.parsed.map.get('name')) || normalizeString(identifier);
  const frontmatter = Object.fromEntries(resolved.parsed.map.entries());
  const recordIndex = buildSkillRecordIndex(projectRoot);
  const record = recordIndex.get(skillName) || null;
  const activeRoute = hasActiveRouteEntry(projectRoot, skillName);
  const capabilityModules = getCapabilityModuleRatingsForSkill(projectRoot, skillName);
  const topTier = assessTopTierReadiness(projectRoot, skillName);
  const deleteGovernance = summarizeDeleteGovernance(projectRoot, skillName);
  const runtimeProofRegistry = fs.existsSync(getRuntimeProofPath(projectRoot))
    ? readJson(getRuntimeProofPath(projectRoot))
    : { proofs: [] };
  const runtimeProof = (Array.isArray(runtimeProofRegistry.proofs) ? runtimeProofRegistry.proofs : [])
    .find((entry) => normalizeString(entry && entry.skill) === skillName) || null;
  const reviewQueue = readReviewQueue(getBundleRoot(projectRoot));
  const reviewEntry = reviewQueue && Array.isArray(reviewQueue.entries)
    ? reviewQueue.entries.find((entry) => normalizeString(entry && entry.skill) === skillName) || null
    : null;
  const routeQuery = `skill retirement boundary for ${skillName}: retire archive merge delete ${skillName}`;
  const { explain, candidates } = collectAdmissionCandidates(projectRoot, routeQuery);
  const nearestPeer = (candidates || [])
    .filter((candidate) => candidate && candidate.skill !== skillName)
    .map((candidate) => buildCandidateSummary(candidate, recordIndex))[0] || null;

  const blockers = buildSkillRetirementBlockers(skillName, {
    deleteGovernance,
    frontmatter,
    activeRoute,
    capabilityModules,
    runtimeProof
  });
  const recommendations = buildSkillRetirementRecommendations(skillName, {
    deleteGovernance,
    frontmatter,
    activeRoute,
    nearestPeer,
    capabilityModules
  });
  const deletionReadiness = {
    allowed_now: deleteGovernance.allowed,
    'has-delete-evidence': Boolean(deleteGovernance['has-delete-evidence']),
    blocker_count: Array.isArray(deleteGovernance.blockers) ? deleteGovernance.blockers.length : 0,
    blockers: cloneJsonValue(deleteGovernance.blockers || []),
    history: cloneJsonValue(deleteGovernance.history || [])
  };

  return {
    action: 'show-skill-retirement-blueprint',
    skill: skillName,
    kind: normalizeString(frontmatter.kind) || (record ? record.kind : null),
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    frontmatter,
    lifecycle: {
      status: normalizeString(frontmatter.status),
      'active-route': activeRoute,
      'top-tier-ready': Boolean(topTier.ready),
      ...(nearestPeer ? { 'nearest-peer': nearestPeer } : {})
    },
    'capability-modules': capabilityModules,
    'runtime-proof': runtimeProof
      ? {
          level: normalizeString(runtimeProof.level),
          contracts: Array.isArray(runtimeProof.contracts) ? runtimeProof.contracts.length : 0,
          'evidence-tests': Array.isArray(runtimeProof['evidence-tests']) ? runtimeProof['evidence-tests'] : [],
          'host-smoke': runtimeProof['host-smoke'] || null
        }
      : null,
    review: reviewEntry || {
      skill: skillName,
      status: null,
      priority: null,
      overdue: false
    },
    route_selection_reason: explain.selectionReason,
    'delete-governance': deletionReadiness,
    recommendations,
    blockers,
    follow_up: [
      `inspect lifecycle advice with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check ${skillName} "retire ${skillName}"`,
      deleteGovernance.allowed
        ? `execute the governed delete with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete --name ${skillName}`
        : `rerun this retirement blueprint after clearing blockers: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-retirement-blueprint --name ${skillName}`
    ]
  };
}

function materializeScaffoldPlan(targetDir, plan) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of Array.isArray(plan.files) ? plan.files : []) {
    const targetFile = path.join(targetDir, String(file.path || '').replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, String(file.content == null ? '' : file.content), 'utf8');
  }
}

function syncRegistryOnCreate(projectRoot, kind, skillName, options = {}) {
  const registry = readGovernedRegistry(projectRoot);
  registry.skills = Array.isArray(registry.skills) ? registry.skills : [];
  if (!registry.skills.some((entry) => entry.name === skillName)) {
    registry.skills.push({
      name: skillName,
      kind,
      path: buildRegistryPath(kind, skillName),
    });
    registry.skills.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  if (Array.isArray(options.capabilityModules) && options.capabilityModules.length > 0) {
    registry['module-groups'] = Array.isArray(registry['module-groups']) ? registry['module-groups'] : [];
    registry['module-groups'] = registry['module-groups'].filter((group) => group['host-skill'] !== skillName);
    registry['module-groups'].push({
      'host-skill': skillName,
      'host-kind': kind,
      modules: options.capabilityModules.map((module) => ({
        id: module.id,
        path: module.path,
        capability: module.capability
      }))
    });
    registry['module-groups'].sort((a, b) => String(a['host-skill'] || '').localeCompare(String(b['host-skill'] || '')));
  }
  writeGovernedRegistry(projectRoot, registry);
}

function syncRouteFixturesOnCreate(projectRoot, skillName) {
  const fixturesPath = getRouteFixturesPath(projectRoot);
  const fixtures = readJson(fixturesPath);
  fixtures.cases = Array.isArray(fixtures.cases) ? fixtures.cases : [];
  const record = collectAllSkillRecords(projectRoot).find((item) => item.name === skillName);
  if (!record) {
    fail(`unknown skill '${skillName}' while syncing route fixtures`);
  }
  const governedFixture = buildGovernedRouteFixture({
    skill: record.name,
    triggerKeywords: record.triggerKeywords,
    aliases: record.aliases,
    requiresExplicitInvocation: !Array.isArray(record.triggerMode) || !record.triggerMode.includes('auto')
  });
  const existingIndex = fixtures.cases.findIndex((item) => (
    routeFixtureReferencesSkill(item, skillName)
    && isGovernedRouteFixture(item)
    && String(item.name || '').trim() === governedFixture.name
  ));
  if (existingIndex === -1) {
    fixtures.cases.push(governedFixture);
  } else {
    fixtures.cases[existingIndex] = governedFixture;
  }
  writeJson(fixturesPath, fixtures);
}

function syncRouteFixturesForSkill(projectRoot, skillName) {
  syncRouteFixturesOnCreate(projectRoot, skillName);
}

function buildRouteEntry(kind, skillName, options = {}) {
  const config = getPlaceholderRouteConfig(kind);
  if (!config) {
    fail(`cannot build placeholder route for kind '${kind}'`);
  }

  const shared = options.shared || {};
  const priority = Number.isInteger(shared.priority) ? shared.priority : config.priority;
  const supportedHosts = Array.isArray(shared.supportedHosts) && shared.supportedHosts.length > 0
    ? [...shared.supportedHosts]
    : [...HOSTS];
  const triggerKeywords = Array.isArray(shared.triggerKeywords) && shared.triggerKeywords.length > 0
    ? [...shared.triggerKeywords]
    : [skillName];
  const negativeKeywords = Array.isArray(shared.negativeKeywords)
    ? [...shared.negativeKeywords]
    : [];
  const aliases = Array.isArray(shared.aliases)
    ? [...shared.aliases]
    : [];
  const autoChain = Array.isArray(shared.autoChain)
    ? [...shared.autoChain]
    : [];
  const conflictsWith = Array.isArray(shared.conflictsWith)
    ? [...shared.conflictsWith]
    : [];
  const intentTags = Array.isArray(shared.intentTags) && shared.intentTags.length > 0
    ? [...shared.intentTags]
    : [...config.intentTags];
  const requiresExplicitInvocation = typeof shared.requiresExplicitInvocation === 'boolean'
    ? shared.requiresExplicitInvocation
    : true;

  return {
    skill: skillName,
    kind,
    priority,
    namespace: config.namespace,
    'supported-hosts': supportedHosts,
    activation: {
      'intent-tags': intentTags,
      'trigger-keywords': triggerKeywords,
      'negative-keywords': negativeKeywords,
      'requires-explicit-invocation': requiresExplicitInvocation,
    },
    'conflicts-with': conflictsWith,
    'auto-chain': autoChain,
    ...(Array.isArray(options.expertModules) && options.expertModules.length > 0
      ? { 'expert-modules': [...options.expertModules] }
      : {}),
    aliases,
    rationale: {
      'primary-intent': config.primaryIntent,
      'why-this-route': `Placeholder route for ${skillName} until the ${kind} surface is intentionally refined.`,
      'wins-when': [skillName],
      'avoid-when': [],
      'boundary-notes': `New ${kind} skills start with a minimal explicit-only route and should be refined before broader auto-routing.`,
    },
    confidence: {
      'minimum-score': 65,
      'strong-score': 80,
      'very-strong-score': 93,
      'requires-fallback-below-minimum': true,
    },
    fallback: {
      mode: 'do-not-auto-route',
      'clarify-question': `Do you want explicit invocation of ${skillName}?`,
      'default-action': 'wait-for-explicit-invocation',
    },
  };
}

function syncRouteMapOnCreate(projectRoot, kind, skillName, options = {}) {
  const routeMapPath = getRouteMapPath(projectRoot);
  const routeMap = readJson(routeMapPath);
  routeMap.routes = Array.isArray(routeMap.routes) ? routeMap.routes : [];
  if (!routeMap.routes.some((route) => route.skill === skillName)) {
    routeMap.routes.push(buildRouteEntry(kind, skillName, options));
    routeMap.routes.sort((a, b) => String(b.priority || 0) - String(a.priority || 0) || String(a.skill).localeCompare(String(b.skill)));
  }
  writeJson(routeMapPath, routeMap);
}

function syncRouteMapForSkill(projectRoot, skillName, options = {}) {
  const resolved = options.resolved || resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) {
    fail(`unknown skill '${skillName}' while syncing route metadata`);
  }

  const kind = String(resolved.parsed.map.get('kind') || '').trim();
  const routeMapPath = getRouteMapPath(projectRoot);
  const routeMap = readJson(routeMapPath);
  routeMap.routes = Array.isArray(routeMap.routes) ? routeMap.routes : [];
  const record = options.record || collectAllSkillRecords(projectRoot).find((item) => item.name === skillName) || null;
  if (record && !shouldSyncGovernedRouteArtifacts(record)) {
    routeMap.routes = routeMap.routes.filter((route) => route.skill !== skillName);
    writeJson(routeMapPath, routeMap);
    return false;
  }
  const shared = parseRouteSharedMetadata(resolved.parsed);
  const expertModules = getCapabilityModuleIdsForSkill(projectRoot, skillName);
  const routeIndex = routeMap.routes.findIndex((route) => route.skill === skillName);

  if (routeIndex === -1) {
    routeMap.routes.push(buildRouteEntry(kind, skillName, {
      shared,
      expertModules
    }));
  } else {
    const existing = routeMap.routes[routeIndex] || {};
    routeMap.routes[routeIndex] = {
      ...existing,
      skill: skillName,
      kind,
      priority: shared.priority,
      'supported-hosts': [...shared.supportedHosts],
      activation: {
        ...(existing.activation || {}),
        'intent-tags': [...shared.intentTags],
        'trigger-keywords': [...shared.triggerKeywords],
        'negative-keywords': [...shared.negativeKeywords],
        'requires-explicit-invocation': shared.requiresExplicitInvocation
      },
      'conflicts-with': [...shared.conflictsWith],
      'auto-chain': [...shared.autoChain],
      aliases: [...shared.aliases],
      ...(expertModules.length > 0
        ? { 'expert-modules': [...expertModules] }
        : {})
    };
    if (expertModules.length < 1) {
      delete routeMap.routes[routeIndex]['expert-modules'];
    }
  }

  routeMap.routes.sort((a, b) => String(b.priority || 0) - String(a.priority || 0) || String(a.skill).localeCompare(String(b.skill)));
  writeJson(routeMapPath, routeMap);
  return true;
}

function shouldSyncRouteMetadataRecord(record, options = {}) {
  if (!record || !shouldSyncGovernedRouteArtifacts(record)) return false;
  if (record.status === 'stable') return true;
  if (options.includeExperimental && record.status === 'experimental') return true;
  if (options.includeDeprecated && record.status === 'deprecated') return true;
  return false;
}

function syncRouteMetadata(projectRoot, options = {}) {
  const skillRecords = collectAllSkillRecords(projectRoot);
  const skillsRoot = getAuthoritativeSkillsRoot();
  const selected = [];
  const normalizedSkillName = String(options.skillName || '').trim();

  for (const record of skillRecords) {
    if (normalizedSkillName && record.name !== normalizedSkillName) {
      continue;
    }
    if (!normalizedSkillName && !shouldSyncRouteMetadataRecord(record, options)) {
      continue;
    }

    const resolved = resolveSkillDirByName(skillsRoot, record.name);
    if (!resolved) {
      fail(`unknown skill '${record.name}' while syncing route metadata`);
    }

    selected.push({ record, resolved });
  }

  if (selected.length < 1) {
    if (normalizedSkillName) {
      fail(`unknown skill '${normalizedSkillName}' while syncing route metadata`);
    }
    return {
      action: 'sync-route-metadata',
      scope: 'all',
      synced: [],
      follow_up: ['npm run verify:skill-system']
    };
  }

  for (const item of selected) {
    const active = syncRouteMapForSkill(projectRoot, item.record.name, {
      resolved: item.resolved,
      record: item.record
    });
    if (active) {
      syncRouteFixturesForSkill(projectRoot, item.record.name);
    } else {
      syncRouteFixturesOnRemove(projectRoot, item.record.name);
    }
  }
  refreshSystemReadiness(projectRoot, { bestEffort: true });

  return {
    action: 'sync-route-metadata',
    scope: options.skillName ? 'single' : 'all',
    ...(options.skillName ? { skill: options.skillName } : {}),
    synced: selected.map((item) => item.record.name),
    follow_up: ['npm run verify:skill-system']
  };
}

function getCapabilityModuleIdsForSkill(projectRoot, skillName) {
  const registryPath = getRegistryPath(projectRoot);
  if (!fs.existsSync(registryPath)) {
    return [];
  }

  const registry = readGovernedRegistry(projectRoot);
  const groups = Array.isArray(registry['module-groups']) ? registry['module-groups'] : [];
  const group = groups.find((item) => item && item['host-skill'] === skillName);
  return Array.isArray(group && group.modules)
    ? group.modules
      .map((module) => String(module && module.id || '').trim())
      .filter(Boolean)
    : [];
}

function hasActiveRouteEntry(projectRoot, skillName) {
  const routeMapPath = getRouteMapPath(projectRoot);
  if (!fs.existsSync(routeMapPath)) {
    return false;
  }
  const routeMap = readJson(routeMapPath);
  return (Array.isArray(routeMap.routes) ? routeMap.routes : []).some((route) => route && route.skill === skillName);
}

function collectCapabilityModuleMetadata(projectRoot) {
  const registryPath = getRegistryPath(projectRoot);
  if (!fs.existsSync(registryPath)) {
    return new Map();
  }

  const registry = readGovernedRegistry(projectRoot);
  return buildCapabilityModuleMetadataMapFromRegistry(registry);
}

function normalizeCapabilityRatingBucketName(bucketName) {
  const normalized = String(bucketName || '').trim();
  if (!CAPABILITY_RATING_BUCKET_INDEX.has(normalized)) {
    fail(`unsupported capability rating bucket '${bucketName}'; expected one of ${CAPABILITY_RATING_BUCKET_SEQUENCE.join(', ')}`);
  }
  return normalized;
}

function validateCapabilityRatingTransition(moduleId, currentBucket, targetBucket, options = {}) {
  if (currentBucket === targetBucket) {
    fail(`capability module '${moduleId}' is already rated '${targetBucket}'`);
  }

  if (options.allowSkip) {
    return;
  }

  if (!currentBucket) {
    if (targetBucket !== 'thin') {
      fail(`unrated capability module '${moduleId}' can only enter governance at 'thin' without --allow-skip`);
    }
    return;
  }

  const currentIndex = CAPABILITY_RATING_BUCKET_INDEX.get(currentBucket);
  const targetIndex = CAPABILITY_RATING_BUCKET_INDEX.get(targetBucket);
  if (Math.abs(currentIndex - targetIndex) !== 1) {
    fail(`capability module '${moduleId}' can only move one bucket at a time without --allow-skip (${currentBucket} -> ${targetBucket} requested)`);
  }
}

function resolveCapabilityRatingTargets(projectRoot, options = {}) {
  const metadata = collectCapabilityModuleMetadata(projectRoot);
  const skillName = String(options.skillName || '').trim();
  if (skillName) {
    const moduleIds = getCapabilityModuleIdsForSkill(projectRoot, skillName);
    if (moduleIds.length < 1) {
      fail(`skill '${skillName}' has no registered capability modules`);
    }
    return moduleIds.map((moduleId) => ({
      module: moduleId,
      ...(metadata.get(moduleId) || {})
    }));
  }

  const moduleId = String(options.moduleId || '').trim();
  if (!moduleId) {
    fail('set-module-rating requires a capability module id or --skill <skill-name>');
  }

  const moduleMetadata = metadata.get(moduleId);
  if (!moduleMetadata) {
    fail(`unknown capability module '${moduleId}'`);
  }

  return [
    {
      module: moduleId,
      ...moduleMetadata
    }
  ];
}

function syncRatingsOnCreate(projectRoot, skillName, options = {}) {
  const ratings = readJson(getRatingsPath(projectRoot));
  if (Array.isArray(options.capabilityModules) && options.capabilityModules.length > 0) {
    syncCapabilityRatingsForModules(
      ratings,
      options.capabilityModules.map((module) => module.id),
      'thin'
    );
  } else {
    recomputeCapabilityRatingCounts(ratings);
  }
  writeRatings(projectRoot, ratings);
}

function removeFromArray(values, needle) {
  return (Array.isArray(values) ? values : []).filter((item) => item !== needle);
}

function syncRegistryOnRemove(projectRoot, skillName) {
  const registry = readGovernedRegistry(projectRoot);
  registry.skills = removeFromArray(registry.skills, null).filter((entry) => entry && entry.name !== skillName);
  registry['module-groups'] = (Array.isArray(registry['module-groups']) ? registry['module-groups'] : []).filter((group) => group['host-skill'] !== skillName);
  writeGovernedRegistry(projectRoot, registry);
}

function syncAdmissionLedgerOnSkillCreate(projectRoot, skillName, options = {}) {
  const requestId = String(options.requestId || '').trim();
  if (!requestId) {
    return null;
  }
  return resolveAdmissionDecision(projectRoot, requestId, {
    status: 'implemented',
    createdSkill: skillName,
    note: options.note || 'created through governed manage-skill flow'
  });
}

function syncRouteFixturesOnRemove(projectRoot, skillName) {
  const fixturesPath = getRouteFixturesPath(projectRoot);
  const fixtures = readJson(fixturesPath);
  fixtures.cases = (Array.isArray(fixtures.cases) ? fixtures.cases : []).filter((item) => !routeFixtureReferencesSkill(item, skillName));
  writeJson(fixturesPath, fixtures);
}

function syncRouteMapOnRemove(projectRoot, skillName) {
  const routeMapPath = getRouteMapPath(projectRoot);
  const routeMap = readJson(routeMapPath);
  routeMap.routes = (Array.isArray(routeMap.routes) ? routeMap.routes : []).filter((route) => route.skill !== skillName);
  writeJson(routeMapPath, routeMap);
}

function syncRatingsOnRemove(projectRoot, skillName, options = {}) {
  const ratingsPath = getRatingsPath(projectRoot);
  const ratings = readJson(ratingsPath);
  syncCapabilityRatingsForModules(ratings, options.removedModuleIds || [], null);
  writeRatings(projectRoot, ratings);
}

function setCapabilityModuleRating(projectRoot, options = {}) {
  const targetBucket = normalizeCapabilityRatingBucketName(options.bucket);
  const targets = resolveCapabilityRatingTargets(projectRoot, options);
  const actionLabel = options.skillName
    ? `set capability-module ratings for '${options.skillName}'`
    : `set capability-module rating for '${options.moduleId}'`;

  assertGeneratedArtifactsWritable(projectRoot, actionLabel, {
    paths: [
      getRatingsPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getSkillInvestmentBacklogDocFilePath(projectRoot)
    ]
  });

  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    const ratings = readJson(getRatingsPath(projectRoot));
    const previousRatings = targets.map((target) => {
      const previousBucket = getCapabilityRatingBucketForModule(ratings, target.module);
      validateCapabilityRatingTransition(target.module, previousBucket, targetBucket, {
        allowSkip: parseBoolean(options.allowSkip, false)
      });
      return {
        module: target.module,
        previous_rating: previousBucket || 'unrated',
        ...(target['host-skill'] ? { 'host-skill': target['host-skill'] } : {}),
        ...(target['host-kind'] ? { 'host-kind': target['host-kind'] } : {}),
        ...(target.path ? { path: target.path } : {})
      };
    });

    syncCapabilityRatingsForModules(
      ratings,
      targets.map((target) => target.module),
      targetBucket
    );
    writeRatings(projectRoot, ratings);
    refreshSkillInvestmentBacklog(projectRoot, {
      ratingsData: ratings
    });
    const readiness = refreshSystemReadiness(projectRoot, {
      bestEffort: true,
      returnDetails: true
    });

    return {
      action: 'set-module-rating',
      scope: options.skillName ? 'skill' : 'module',
      ...(options.skillName ? { skill: options.skillName } : {}),
      ...(options.moduleId ? { module: options.moduleId } : {}),
      modules: targets.map((target) => target.module),
      rating: targetBucket,
      'previous-ratings': previousRatings,
      ...(parseBoolean(options.allowSkip, false) ? { 'allow-skip': true } : {}),
      ...(readiness && readiness.ok === false
        ? {
            readiness_warning: readiness
          }
        : {}),
      follow_up: [
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function writeRatings(projectRoot, ratings) {
  const skillRecords = collectAllSkillRecords(projectRoot);
  const registryData = readJson(getRegistryPath(projectRoot));
  const bundleRoot = getBundleRoot(projectRoot);
  applyCapabilityRatingsGovernance(ratings, {
    skillRecords,
    registryData,
    bundleRoot,
    moduleMetadata: buildCapabilityModuleMetadataMapFromRegistry(registryData)
  });
  writeJson(getRatingsPath(projectRoot), ratings);
  syncCapabilityRatingsDocFile(bundleRoot, ratings);
}

function readRatings(projectRoot) {
  return readJson(getRatingsPath(projectRoot));
}

function getCapabilityModuleRatingsForSkill(projectRoot, skillName) {
  const moduleIds = getCapabilityModuleIdsForSkill(projectRoot, skillName);
  const ratings = readRatings(projectRoot);
  return getCapabilityModuleRatingsForSkillGoverned(ratings, moduleIds);
}

function buildTopTierAssessmentContext(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const registryData = options.registryData || readJson(getRegistryPath(projectRoot));
  const ratingsData = options.ratingsData || readRatings(projectRoot);
  const skillRecords = Array.isArray(options.skillRecords) ? options.skillRecords : collectAllSkillRecords(projectRoot);
  const reviewQueueData = options.reviewQueueData || buildReviewQueue(bundleRoot, skillRecords);

  return {
    bundleRoot,
    skillRecords,
    registryData,
    routeMapData: options.routeMapData || readJson(getRouteMapPath(projectRoot)),
    routeFixturesData: options.routeFixturesData || readJson(getRouteFixturesPath(projectRoot)),
    runtimeProofData: options.runtimeProofData || (
      fs.existsSync(getRuntimeProofPath(projectRoot))
        ? readJson(getRuntimeProofPath(projectRoot))
        : { proofs: [] }
    ),
    hostSmokeScorecardData: options.hostSmokeScorecardData || (
      fs.existsSync(getHostSmokeScorecardPath(bundleRoot))
        ? readJson(getHostSmokeScorecardPath(bundleRoot))
        : { skills: [] }
    ),
    reviewQueueData,
    ratingsData
  };
}

function assessSingleTopTierReadiness(projectRoot, skillName, options = {}) {
  const context = buildTopTierAssessmentContext(projectRoot, options);
  const record = (Array.isArray(context.skillRecords) ? context.skillRecords : []).find((item) => item && item.name === skillName) || null;
  if (!record) {
    fail(`unknown skill '${skillName}'`);
  }

  const targetStatus = normalizeString(options.targetStatus) || 'stable';
  const assessment = buildStableTopTierAssessment(record, {
    ...context,
    targetStatus
  });
  if (!assessment) {
    fail(`unable to assess top-tier readiness for '${skillName}'`);
  }

  return {
    action: 'assess-top-tier',
    skill: skillName,
    status: assessment.status,
    'target-status': assessment['target-status'],
    kind: assessment.kind,
    ready: assessment.ready,
    priority: assessment.priority,
    'blocker-count': assessment['blocker-count'],
    'blocker-categories': assessment['blocker-categories'],
    'capability-modules': assessment['capability-modules'],
    blockers: assessment.blockers.map((item) => ({
      type: item.type === 'capability-module-rating' ? item.type : 'verification-error',
      ...(item.module ? { module: item.module } : {}),
      ...(item.rating ? { rating: item.rating } : {}),
      ...(item.file ? { file: item.file } : {}),
      ...(Array.isArray(item.categories) ? { categories: item.categories } : {}),
      message: item.message
    })),
    follow_up: assessment.ready
      ? ["set-status stable is allowed once you are ready to promote"]
      : [
          'fix verification blockers first',
          `promote remaining capability modules for '${skillName}' to top-ready`,
          'rerun assess-top-tier after the fixes land'
        ]
  };
}

function assessAllTopTierReadiness(projectRoot, options = {}) {
  const context = buildTopTierAssessmentContext(projectRoot, options);
  const portfolio = buildStableTopTierPortfolio(context.skillRecords, context);
  const upgradeBoard = portfolio['upgrade-board'] || buildStableTopTierUpgradeBoard(portfolio);
  const executionFocus = portfolio['execution-focus'] || buildStableTopTierExecutionFocus(upgradeBoard);

  return {
    action: 'assess-top-tier',
    scope: 'all-stable-skills',
    summary: portfolio.summary,
    'upgrade-board': upgradeBoard,
    'execution-focus': executionFocus,
    total: portfolio.assessments.length,
    returned: portfolio.assessments.length,
    assessments: portfolio.assessments,
    follow_up: portfolio.summary.blocked > 0
      ? [
          'fix critical and high priority blockers first',
          'run the current top-tier wave before broad portfolio rechecks',
          'rerun assess-top-tier --all after the fixes land'
        ]
      : [
          'stable skill portfolio is currently clear under governed top-tier checks'
        ]
  };
}

function assessTopTierReadiness(projectRoot, skillName, options = {}) {
  if (options.all === true || skillName === '--all' || skillName === 'all') {
    return assessAllTopTierReadiness(projectRoot, options);
  }
  return assessSingleTopTierReadiness(projectRoot, skillName, options);
}

function buildSkillHardeningBlueprint(projectRoot, options = {}) {
  const skillsRoot = getAuthoritativeSkillsRoot();
  const byName = options && options.name ? resolveSkillDirByName(skillsRoot, options.name) : null;
  const byPath = options && options.path ? resolveSkillDirByRelPath(skillsRoot, options.path) : null;
  const resolved = byName || byPath;
  const identifier = options && (options.name || options.path);

  if (!resolved) fail(`unknown skill '${identifier}'`);
  ensureInsideAuthoritativeRoot(resolved.dir, skillsRoot);

  const skillName = normalizeString(resolved.parsed.map.get('name')) || normalizeString(identifier);
  const context = buildTopTierAssessmentContext(projectRoot);
  const record = (Array.isArray(context.skillRecords) ? context.skillRecords : [])
    .find((item) => item && item.name === skillName) || null;
  if (!record) {
    fail(`unknown skill '${skillName}'`);
  }

  const assessment = buildStableTopTierAssessment(record, {
    ...context,
    targetStatus: 'stable'
  });
  if (!assessment) {
    fail(`unable to build top-tier hardening blueprint for '${skillName}'`);
  }

  const routeEntry = (Array.isArray(context.routeMapData && context.routeMapData.routes) ? context.routeMapData.routes : [])
    .find((route) => normalizeString(route && route.skill) === skillName) || null;
  const routeFixtureEvidence = summarizeRouteFixtureEvidence(skillName, context.routeFixturesData);
  const reviewEntries = Array.isArray(context.reviewQueueData && context.reviewQueueData.skills)
    ? context.reviewQueueData.skills
    : (Array.isArray(context.reviewQueueData && context.reviewQueueData.entries) ? context.reviewQueueData.entries : []);
  const reviewEntry = reviewEntries.find((entry) => normalizeString(entry && entry.skill) === skillName) || null;
  const runtimeProof = (Array.isArray(context.runtimeProofData && context.runtimeProofData.proofs) ? context.runtimeProofData.proofs : [])
    .find((entry) => normalizeString(entry && entry.skill) === skillName) || null;
  const hostSmoke = (Array.isArray(context.hostSmokeScorecardData && context.hostSmokeScorecardData.skills) ? context.hostSmokeScorecardData.skills : [])
    .find((entry) => normalizeString(entry && entry.skill) === skillName) || null;
  const hardeningPlan = buildStableTopTierHardeningPlan(assessment);
  const currentStatus = normalizeString(record.status);
  const lifecycle = {
    status: currentStatus,
    'target-status': assessment['target-status'],
    'active-route': Boolean(routeEntry),
    'stable-ready': assessment.ready,
    priority: assessment.priority
  };
  const recommendations = assessment.ready
    ? [
        currentStatus === 'stable'
          ? {
              action: 'keep-stable',
              reason: 'the skill already satisfies the governed top-tier gate'
            }
          : {
              action: 'promote-to-stable',
              reason: 'governed top-tier blockers are clear for stable promotion'
            }
      ]
    : [
        {
          action: 'harden-current-skill',
          reason: currentStatus === 'stable'
            ? 'the skill is already stable but still carries governed top-tier debt that should be cleared before further expansion'
            : 'promotion is not honest yet because governed top-tier blockers remain'
        }
      ];

  return {
    action: 'show-skill-hardening-blueprint',
    skill: skillName,
    kind: record.kind,
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    lifecycle,
    review: reviewEntry || {
      skill: skillName,
      status: currentStatus,
      owner: normalizeString(record.owner),
      'review-status': null,
      'next-review-due': null
    },
    'route-surface': routeEntry
      ? {
          active: true,
          namespace: normalizeString(routeEntry.namespace),
          'supported-hosts': normalizeStringList(routeEntry['supported-hosts']),
          activation: cloneJsonValue(routeEntry.activation || {}),
          aliases: normalizeStringList(routeEntry.aliases),
          fallback: cloneJsonValue(routeEntry.fallback || {}),
          'fixture-evidence': routeFixtureEvidence
        }
      : {
          active: false,
          'fixture-evidence': routeFixtureEvidence
        },
    'runtime-proof': runtimeProof
      ? {
          level: normalizeString(runtimeProof.level),
          contracts: Array.isArray(runtimeProof.contracts) ? runtimeProof.contracts.length : 0,
          'evidence-tests': Array.isArray(runtimeProof['evidence-tests']) ? runtimeProof['evidence-tests'] : [],
          'host-smoke-policy': runtimeProof['host-smoke-policy'] || null,
          'host-smoke-status': hostSmoke
            ? {
                level: normalizeString(hostSmoke.level),
                'evidence-status': normalizeString(hostSmoke['evidence-status']),
                'governance-status': normalizeString(hostSmoke['governance-status'])
              }
            : null
        }
      : null,
    'capability-modules': assessment['capability-modules'],
    'promotion-readiness': {
      ready: assessment.ready,
      priority: assessment.priority,
      'blocker-count': assessment['blocker-count'],
      'blocker-categories': assessment['blocker-categories'],
      blockers: cloneJsonValue(assessment.blockers),
      'blocking-family-count': hardeningPlan['blocking-family-count'],
      'blocking-families': hardeningPlan['blocking-families']
    },
    recommendations,
    follow_up: dedupeStrings([
      ...hardeningPlan.follow_up,
      !assessment.ready
        ? `inspect lifecycle advice with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check ${skillName} "promote this skill into the governed stable surface when it is honestly ready"`
        : '',
      assessment.ready && currentStatus !== 'stable'
        ? `execute the governed promotion with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status ${skillName} stable`
        : '',
      assessment.ready && currentStatus === 'stable'
        ? `keep auditing with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${skillName}`
        : '',
      !assessment.ready
        ? `rerun this hardening blueprint after clearing blockers: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint --name ${skillName}`
        : ''
    ])
  };
}

function buildTemplateHardeningBlueprint(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const kind = normalizeString(options.kind);
  if (!kind) {
    fail('show-template-hardening-blueprint requires --kind <template-kind>');
  }
  if (!VALID_KINDS.has(kind)) {
    fail(`unsupported template kind '${kind}'`);
  }

  const templateRecord = collectTemplateRecords(bundleRoot, [])
    .find((record) => normalizeString(record.kind) === kind);
  if (!templateRecord) {
    fail(`unknown canonical template '${kind}'`);
  }

  const blockers = collectTemplateHardeningBlockers(bundleRoot, kind);
  const priority = blockers.some((blocker) => ['review', 'runtime', 'host-metadata', 'structure'].includes(
    Array.isArray(blocker.categories) ? blocker.categories[0] : ''
  )) || blockers.some((blocker) => (Array.isArray(blocker.categories) ? blocker.categories : []).includes('review'))
    ? 'high'
    : (blockers.length > 0 ? 'normal' : 'clear');
  const reviewStatus = normalizeString(templateRecord['review-status']);
  const ready = blockers.length < 1;

  const categoryOrder = ['review', 'metadata', 'references', 'host-metadata', 'runtime', 'lifecycle', 'structure'];
  const titleByCategory = {
    review: 'Template review cadence debt',
    metadata: 'Template frontmatter metadata debt',
    references: 'Template reference floor debt',
    'host-metadata': 'Template host metadata drift',
    runtime: 'Template scripted surface drift',
    lifecycle: 'Template lifecycle drift',
    structure: 'Template structure drift'
  };
  const summaryByCategory = {
    review: 'Refresh canonical review metadata before new descendants inherit stale governance posture.',
    metadata: 'Repair canonical template frontmatter so new scaffolds inherit honest metadata.',
    references: 'Restore the canonical reference floor so future skills start with sufficient depth.',
    'host-metadata': 'Resync template host metadata so host-facing prompts stay aligned with SKILL.md.',
    runtime: 'Repair scripted template runtime contracts before future tool or guard descendants inherit broken stubs.',
    lifecycle: 'Return the template to the expected draft lifecycle surface.',
    structure: 'Repair structural template breakage before any further scaffold usage.'
  };

  const blockingFamilies = categoryOrder
    .map((category) => {
      const familyBlockers = blockers.filter((blocker) => (Array.isArray(blocker.categories) ? blocker.categories : []).includes(category));
      if (familyBlockers.length < 1) {
        return null;
      }

      const followUp = [];
      if (category === 'review') {
        followUp.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js review-template --kind ${kind}`);
      }
      if (category === 'host-metadata') {
        followUp.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-template-host-metadata --kind ${kind}`);
      }
      if (category === 'references' || category === 'metadata' || category === 'runtime' || category === 'lifecycle' || category === 'structure') {
        followUp.push(`review personal-skill-system/templates/skill/${kind}/SKILL.md`);
      }
      if (category === 'runtime') {
        followUp.push(`review personal-skill-system/templates/skill/${kind}/scripts/`);
      }
      followUp.push('npm run verify:skill-system');

      return {
        category,
        priority: category === 'review' || category === 'runtime' || category === 'host-metadata' || category === 'structure' ? 'high' : 'normal',
        title: titleByCategory[category] || 'Template governance debt',
        summary: summaryByCategory[category] || 'Repair this canonical template blocker family before further scaffold evolution.',
        'blocker-count': familyBlockers.length,
        blockers: dedupeStrings(
          familyBlockers
            .map((blocker) => normalizeString(blocker.message))
            .filter(Boolean)
        ),
        follow_up: dedupeStrings(followUp)
      };
    })
    .filter(Boolean);

  return {
    action: 'show-template-hardening-blueprint',
    kind,
    template: templateRecord.name,
    path: `personal-skill-system/templates/skill/${kind}`,
    lifecycle: {
      status: normalizeString(templateRecord.status) || 'draft',
      'target-status': 'draft',
      healthy: ready,
      priority
    },
    review: {
      template: templateRecord.name,
      kind,
      'review-status': reviewStatus || null,
      'last-reviewed': templateRecord['last-reviewed'] || null,
      'review-cycle-days': templateRecord['review-cycle-days'] || null,
      'next-review-due': templateRecord['next-review-due'] || null
    },
    'template-governance': {
      ready,
      priority,
      'blocker-count': blockers.length,
      'blocking-family-count': blockingFamilies.length,
      'blocking-families': blockingFamilies,
      blockers: cloneJsonValue(blockers)
    },
    recommendations: ready
      ? [
          {
            action: 'keep-template-current',
            reason: 'the canonical template currently satisfies governed scaffold expectations'
          }
        ]
      : [
          {
            action: 'harden-template',
            reason: 'future skill evolution will inherit drift until the canonical template is repaired'
          }
        ],
    follow_up: ready
      ? [
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind ${kind}`
        ]
      : dedupeStrings([
          ...blockingFamilies.flatMap((family) => Array.isArray(family.follow_up) ? family.follow_up : []),
          `rerun this template blueprint after clearing blockers: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind ${kind}`
        ])
  };
}

function buildScaffoldUpgradeRecommendations(record, driftStatus, templateBlockers, skillFilePath) {
  const recommendations = [];

  if (driftStatus === 'current') {
    recommendations.push({
      action: 'keep-current-lineage',
      reason: 'the skill already points at the current canonical scaffold lineage'
    });
    return recommendations;
  }

  if (templateBlockers.length > 0) {
    recommendations.push({
      action: 'harden-canonical-template-first',
      reason: 'the canonical template is not currently healthy, so upgrading descendants before repairing it would spread uncertain lineage'
    });
  }

  if (driftStatus === 'missing-lineage') {
    recommendations.push({
      action: 'backfill-lineage',
      reason: 'the skill is missing scaffold lineage metadata, so the first repair is to stamp the current canonical lineage once the descendant still matches the template family'
    });
    recommendations.push({
      action: 'manually-verify-descendant-shape',
      reason: 'because lineage is missing, confirm the skill still belongs to this canonical template family before syncing the metadata forward'
    });
    return recommendations;
  }

  if (driftStatus === 'origin-mismatch') {
    recommendations.push({
      action: 'resolve-template-family-mismatch',
      reason: 'the recorded scaffold origin points at a different canonical family, so repair requires human review before any lineage sync'
    });
    recommendations.push({
      action: 'audit-descendant-surface',
      reason: 'compare SKILL, references, scripts, and host metadata against the current canonical template to decide whether the skill should be migrated, merged, or intentionally left divergent'
    });
    return recommendations;
  }

  if (driftStatus === 'behind-template') {
    recommendations.push({
      action: 'audit-template-delta',
      reason: 'the skill is behind the canonical scaffold version, so inspect template changes before updating descendant lineage'
    });
    recommendations.push({
      action: 'promote-lineage-after-audit',
      reason: 'only sync scaffold lineage after the descendant has been manually reconciled with any relevant canonical SKILL, reference, script, or host-metadata changes'
    });
    return recommendations;
  }

  if (driftStatus === 'ahead-of-template') {
    recommendations.push({
      action: 'investigate-ahead-of-template-state',
      reason: 'the descendant claims a scaffold version newer than the canonical template, which indicates governance drift or an out-of-band template edit'
    });
    recommendations.push({
      action: 'repair-canonical-versioning',
      reason: 'decide whether the canonical template should be advanced or the descendant lineage should be corrected downward after review'
    });
    return recommendations;
  }

  recommendations.push({
    action: 'inspect-scaffold-drift',
    reason: 'review the scaffold upgrade blueprint to decide the next governed repair step'
  });
  recommendations.push({
    action: 'rerun-scaffold-blueprint',
    reason: 'use the governed scaffold upgrade blueprint as the canonical read surface while clearing drift'
  });
  return recommendations;
}

function buildScaffoldUpgradeFollowUp(record, driftStatus, templateBlockers, skillFilePath) {
  const commands = [];
  if (templateBlockers.length > 0) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind ${record.kind}`);
  }

  if (driftStatus === 'missing-lineage') {
    commands.push(`review ${skillFilePath}`);
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage ${record.name}`);
  } else if (driftStatus === 'origin-mismatch') {
    commands.push(`review ${skillFilePath}`);
    commands.push(`review ${path.posix.join(path.posix.dirname(skillFilePath), 'references/')}`);
    if (normalizeString(record.runtime) === 'scripted') {
      commands.push(`review ${path.posix.join(path.posix.dirname(skillFilePath), 'scripts/')}`);
    }
    if (record.hasHostMetadata) {
      commands.push(`review ${path.posix.join(path.posix.dirname(skillFilePath), 'agents/openai.yaml')}`);
    }
  } else if (driftStatus === 'behind-template') {
    commands.push(`review personal-skill-system/templates/skill/${record.kind}/SKILL.md`);
    commands.push(`review ${skillFilePath}`);
    commands.push(`review ${path.posix.join(path.posix.dirname(skillFilePath), 'references/')}`);
    if (normalizeString(record.runtime) === 'scripted') {
      commands.push(`review personal-skill-system/templates/skill/${record.kind}/scripts/`);
      commands.push(`review ${path.posix.join(path.posix.dirname(skillFilePath), 'scripts/')}`);
    }
    if (record.hasHostMetadata) {
      commands.push(`review ${path.posix.join(path.posix.dirname(skillFilePath), 'agents/openai.yaml')}`);
    }
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage ${record.name}`);
  } else if (driftStatus === 'ahead-of-template') {
    commands.push(`review personal-skill-system/templates/skill/${record.kind}/SKILL.md`);
    commands.push(`review ${skillFilePath}`);
  }

  commands.push(`rerun this scaffold upgrade blueprint after the repair: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-scaffold-upgrade-blueprint --name ${record.name}`);
  return dedupeStrings(commands);
}

function buildSkillScaffoldUpgradeBlueprint(projectRoot, options = {}) {
  const skillsRoot = getAuthoritativeSkillsRoot();
  const byName = options && options.name ? resolveSkillDirByName(skillsRoot, options.name) : null;
  const byPath = options && options.path ? resolveSkillDirByRelPath(skillsRoot, options.path) : null;
  const resolved = byName || byPath;
  const identifier = options && (options.name || options.path);

  if (!resolved) fail(`unknown skill '${identifier}'`);
  ensureInsideAuthoritativeRoot(resolved.dir, skillsRoot);

  const skillName = normalizeString(resolved.parsed.map.get('name')) || normalizeString(identifier);
  const record = collectAllSkillRecords(projectRoot).find((item) => item && item.name === skillName) || null;
  if (!record) {
    fail(`unknown skill '${skillName}'`);
  }
  if (!shouldTrackScaffoldLineage(record.kind)) {
    fail(`skill '${skillName}' does not participate in governed scaffold lineage`);
  }

  const bundleRoot = getBundleRoot(projectRoot);
  const templateRecord = collectTemplateRecords(bundleRoot, [])
    .find((item) => normalizeString(item.kind) === normalizeString(record.kind)) || null;
  const templateBlockers = collectTemplateHardeningBlockers(bundleRoot, record.kind);
  const driftStatus = normalizeString(record.scaffoldDriftStatus) || 'current';
  const templateHealthy = templateBlockers.length < 1;
  const skillFilePath = path.relative(projectRoot, resolved.skillFile).split(path.sep).join('/');
  const canonicalTemplatePath = `personal-skill-system/templates/skill/${record.kind}/SKILL.md`;
  const referencePaths = readReferencePaths(fs.readFileSync(resolved.skillFile, 'utf8'));
  const recommendations = buildScaffoldUpgradeRecommendations(record, driftStatus, templateBlockers, skillFilePath);
  const followUp = buildScaffoldUpgradeFollowUp(record, driftStatus, templateBlockers, skillFilePath);
  const blockers = [];

  if (driftStatus === 'missing-lineage') {
    blockers.push({
      category: 'lineage-metadata',
      severity: record.status === 'stable' ? 'high' : 'normal',
      message: 'skill is missing scaffold lineage metadata and must be verified before lineage can be safely stamped'
    });
  } else if (driftStatus === 'origin-mismatch') {
    blockers.push({
      category: 'template-family',
      severity: 'high',
      message: `skill lineage points at '${normalizeString(record.scaffoldOrigin) || 'unknown'}' instead of canonical '${normalizeString(record.canonicalScaffoldOrigin) || `${record.kind}-template`}'`
    });
  } else if (driftStatus === 'behind-template') {
    blockers.push({
      category: 'template-version',
      severity: normalizeString(record.status) === 'stable' ? 'high' : 'normal',
      message: `skill lineage version '${record.scaffoldVersion}' is behind canonical version '${record.canonicalScaffoldVersion}'`
    });
  } else if (driftStatus === 'ahead-of-template') {
    blockers.push({
      category: 'template-version',
      severity: 'high',
      message: `skill lineage version '${record.scaffoldVersion}' is ahead of canonical version '${record.canonicalScaffoldVersion}'`
    });
  }
  for (const blocker of templateBlockers) {
    blockers.push({
      category: 'canonical-template',
      severity: (Array.isArray(blocker.categories) ? blocker.categories : []).includes('review')
        || (Array.isArray(blocker.categories) ? blocker.categories : []).includes('runtime')
        || (Array.isArray(blocker.categories) ? blocker.categories : []).includes('host-metadata')
        || (Array.isArray(blocker.categories) ? blocker.categories : []).includes('structure')
        ? 'high'
        : 'normal',
      message: normalizeString(blocker.message),
      file: normalizeString(blocker.file)
    });
  }

  return {
    action: 'show-skill-scaffold-upgrade-blueprint',
    skill: skillName,
    kind: record.kind,
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    lifecycle: {
      status: normalizeString(record.status),
      runtime: normalizeString(record.runtime),
      'user-invocable': Boolean(record.userInvocable)
    },
    scaffold: {
      'drift-status': driftStatus,
      current: {
        origin: record.scaffoldOrigin || null,
        version: record.scaffoldVersion ?? null
      },
      canonical: {
        origin: record.canonicalScaffoldOrigin || null,
        version: record.canonicalScaffoldVersion ?? null,
        path: canonicalTemplatePath,
        template: templateRecord ? templateRecord.name : `${record.kind}-template`,
        'template-review-status': templateRecord ? normalizeString(templateRecord['review-status']) || null : null,
        'template-healthy': templateHealthy
      }
    },
    descendant: {
      skill: skillName,
      file: skillFilePath,
      references: referencePaths,
      'has-host-metadata': Boolean(record.hasHostMetadata),
      'runtime-proof-items': Array.isArray(record.runtimeProofItems) ? record.runtimeProofItems.length : 0
    },
    blockers,
    recommendations,
    follow_up: followUp
  };
}

function getTemplateDir(projectRoot, kind) {
  return path.join(getBundleRoot(projectRoot), 'templates', 'skill', kind);
}

function resolveTemplateSkillFile(projectRoot, kind) {
  const normalizedKind = normalizeString(kind);
  if (!normalizedKind) {
    fail('template kind is required');
  }
  if (!VALID_KINDS.has(normalizedKind)) {
    fail(`unsupported template kind '${normalizedKind}'`);
  }

  const templateDir = getTemplateDir(projectRoot, normalizedKind);
  const skillFile = path.join(templateDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    fail(`unknown canonical template '${normalizedKind}'`);
  }

  const text = fs.readFileSync(skillFile, 'utf8');
  const parsed = parseFrontmatterMap(text);
  return { kind: normalizedKind, templateDir, skillFile, parsed };
}

function writeTemplateHostMetadata(projectRoot, resolved) {
  const hostMetadataFile = path.join(resolved.templateDir, 'agents', 'openai.yaml');
  writeOpenAiMetadataFile(hostMetadataFile, {
    name: resolved.parsed.map.get('name'),
    title: resolved.parsed.map.get('title'),
    description: resolved.parsed.map.get('description'),
    kind: resolved.parsed.map.get('kind')
  }, {
    preserveExisting: true
  });
}

function syncTemplateHostMetadata(projectRoot, kind) {
  const resolved = resolveTemplateSkillFile(projectRoot, kind);
  writeTemplateHostMetadata(projectRoot, resolved);
  refreshSkillInvestmentBacklog(projectRoot);
  refreshSystemReadiness(projectRoot, { bestEffort: true });

  return {
    action: 'sync-template-host-metadata',
    kind: resolved.kind,
    template: normalizeString(resolved.parsed.map.get('name')) || `${resolved.kind}-template`,
    path: path.relative(projectRoot, path.join(resolved.templateDir, 'agents', 'openai.yaml')).split(path.sep).join('/'),
    follow_up: [
      `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind ${resolved.kind}`,
      'npm run verify:skill-system'
    ]
  };
}

function reviewTemplate(projectRoot, kind, options = {}) {
  const resolved = resolveTemplateSkillFile(projectRoot, kind);
  const reviewedAt = normalizeReviewDate(options.date || new Date().toISOString().slice(0, 10));
  if (!reviewedAt) {
    fail(`invalid review date '${options.date}'`);
  }

  const reviewCycleDays = options.reviewCycleDays == null
    ? null
    : normalizeReviewCycleDays(options.reviewCycleDays);
  if (options.reviewCycleDays != null && reviewCycleDays == null) {
    fail(`invalid review-cycle-days '${options.reviewCycleDays}'`);
  }

  const previousText = fs.readFileSync(resolved.skillFile, 'utf8');
  try {
    resolved.parsed.map.set('last-reviewed', reviewedAt);
    if (reviewCycleDays != null) {
      resolved.parsed.map.set('review-cycle-days', String(reviewCycleDays));
    }
    fs.writeFileSync(resolved.skillFile, renderSkillFile(resolved.parsed), 'utf8');
    refreshSkillInvestmentBacklog(projectRoot);
    refreshSystemReadiness(projectRoot, { bestEffort: true });

    return {
      action: 'review-template',
      kind: resolved.kind,
      template: normalizeString(resolved.parsed.map.get('name')) || `${resolved.kind}-template`,
      reviewed_at: reviewedAt,
      'review-cycle-days': reviewCycleDays != null
        ? reviewCycleDays
        : parseInteger(resolved.parsed.map.get('review-cycle-days'), null),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind ${resolved.kind}`,
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    fs.writeFileSync(resolved.skillFile, previousText, 'utf8');
    throw error;
  }
}

function enforceTopTierReadinessForStable(projectRoot, skillName) {
  const assessment = assessTopTierReadiness(projectRoot, skillName, {
    targetStatus: 'stable'
  });
  if (assessment.ready) {
    return assessment;
  }

  const reasons = assessment.blockers
    .map((item) => String(item.message || '').trim())
    .filter(Boolean);
  fail(`skill '${skillName}' is not ready for stable/top-tier promotion: ${reasons.join('; ')}`);
}

function syncRuntimeProofOnRemove(projectRoot, skillName) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  if (!fs.existsSync(runtimeProofPath)) {
    refreshSkillInvestmentBacklog(projectRoot);
    refreshSystemReadiness(projectRoot);
    return;
  }
  const registry = readJson(runtimeProofPath);
  registry.proofs = (Array.isArray(registry.proofs) ? registry.proofs : []).filter((proof) => proof && proof.skill !== skillName);
  writeRuntimeProofRegistry(projectRoot, registry.proofs, {
    removedSkills: [skillName],
    touchedSkills: [],
    bestEffortReadiness: true
  });
}

function collectAllSkillRecords(projectRoot) {
  const findings = [];
  const bundleRoot = getBundleRoot(projectRoot);
  const { skillRecords } = collectSkillRecords(bundleRoot, findings);
  if (findings.some((item) => item.severity === 'error')) {
    fail(`cannot sync runtime proof while skill records contain structural errors: ${findings.map((item) => item.message).join('; ')}`);
  }
  return skillRecords;
}

function refreshReviewQueue(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillRecords = Array.isArray(options.skillRecords) ? options.skillRecords : collectAllSkillRecords(projectRoot);
  const result = buildReviewQueue(bundleRoot, skillRecords);
  writeJson(getReviewQueueRegistryPath(projectRoot), result);
  return {
    file: getReviewQueueRegistryPath(projectRoot),
    payload: result
  };
}

function refreshReviewGovernanceSurfaces(projectRoot, options = {}) {
  const skillRecords = Array.isArray(options.skillRecords) ? options.skillRecords : collectAllSkillRecords(projectRoot);
  const registryData = options.registryData || readGovernedRegistry(projectRoot);
  const ratings = options.ratingsData ? cloneJsonValue(options.ratingsData) : readRatings(projectRoot);
  const bundleRoot = getBundleRoot(projectRoot);

  applyCapabilityRatingsGovernance(ratings, {
    skillRecords,
    registryData,
    bundleRoot,
    moduleMetadata: buildCapabilityModuleMetadataMapFromRegistry(registryData)
  });
  writeJson(getRatingsPath(projectRoot), ratings);
  syncCapabilityRatingsDocFile(bundleRoot, ratings);

  const reviewQueue = refreshReviewQueue(projectRoot, {
    skillRecords
  });
  const backlog = refreshSkillInvestmentBacklog(projectRoot, {
    skillRecords,
    registryData,
    ratingsData: ratings,
    reviewQueueData: reviewQueue.payload
  });
  const expertSourceFamilyScorecard = refreshExpertSourceFamilyScorecard(projectRoot, {
    registryData
  });
  const readiness = refreshSystemReadiness(projectRoot, {
    bestEffort: true,
    returnDetails: options.returnDetails === true
  });

  return {
    ratings,
    reviewQueue,
    backlog,
    expertSourceFamilyScorecard,
    readiness
  };
}

function refreshSkillInvestmentBacklog(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillRecords = Array.isArray(options.skillRecords) ? options.skillRecords : collectAllSkillRecords(projectRoot);
  const registryData = options.registryData || readGovernedRegistry(projectRoot);
  const ratingsData = options.ratingsData || readJson(getRatingsPath(projectRoot));
  const reviewQueueData = options.reviewQueueData || buildReviewQueue(bundleRoot, skillRecords);
  const opportunityQueueData = options.opportunityQueueData || readOpportunityQueue(projectRoot);
  const admissionLedgerData = options.admissionLedgerData || readAdmissionLedger(projectRoot);
  const evolutionLedgerData = options.evolutionLedgerData || readEvolutionLedger(projectRoot);
  const routeFixturesData = options.routeFixturesData || readJson(getRouteFixturesPath(projectRoot));
  const result = writeSkillInvestmentBacklog(bundleRoot, {
    skillRecords,
    registryData,
    ratingsData,
    reviewQueueData,
    opportunityQueueData,
    admissionLedgerData,
    evolutionLedgerData,
    routeFixturesData
  });
  return {
    file: result.file,
    docFile: result.docFile,
    payload: result.payload
  };
}

function buildCurrentSkillInvestmentBacklog(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillRecords = Array.isArray(options.skillRecords) ? options.skillRecords : collectAllSkillRecords(projectRoot);
  const registryData = options.registryData || readGovernedRegistry(projectRoot);
  const ratingsData = options.ratingsData || readJson(getRatingsPath(projectRoot));
  const reviewQueueData = options.reviewQueueData || buildReviewQueue(bundleRoot, skillRecords);
  const opportunityQueueData = options.opportunityQueueData || readOpportunityQueue(projectRoot);
  const admissionLedgerData = options.admissionLedgerData || readAdmissionLedger(projectRoot);
  const evolutionLedgerData = options.evolutionLedgerData || readEvolutionLedger(projectRoot);
  const routeFixturesData = options.routeFixturesData || readJson(getRouteFixturesPath(projectRoot));
  return buildSkillInvestmentBacklog(bundleRoot, {
    skillRecords,
    registryData,
    ratingsData,
    reviewQueueData,
    opportunityQueueData,
    admissionLedgerData,
    evolutionLedgerData,
    routeFixturesData
  });
}

function refreshExpertSourceFamilyScorecard(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const registryData = options.registryData || readGovernedRegistry(projectRoot);
  const result = writeExpertSourceFamilyScorecard(bundleRoot, registryData, options);
  return {
    file: result.file,
    payload: result.payload
  };
}

function normalizeEvidenceTests(values) {
  return normalizeRuntimeProofEvidenceTests(values);
}

function normalizeScalarObject(value) {
  const normalized = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return normalized;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      normalized[key] = item;
    }
  }
  return normalized;
}

function previewText(value, limit = 400) {
  const text = String(value || '');
  return text.length > limit ? text.slice(0, limit) : text;
}

function captureConsoleOutput(fn) {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';

  process.stdout.write = (chunk, encoding, callback) => {
    stdout += String(chunk);
    if (typeof callback === 'function') callback();
    return true;
  };
  process.stderr.write = (chunk, encoding, callback) => {
    stderr += String(chunk);
    if (typeof callback === 'function') callback();
    return true;
  };

  try {
    const value = fn();
    return { stdout, stderr, value };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

function getValueAtPath(data, dottedPath) {
  if (!dottedPath) return undefined;
  const parts = String(dottedPath).split('.').filter(Boolean);
  let current = data;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function resolveSmokeCwd(bundleRoot, record, command) {
  const mode = String(command.cwd || 'skill-dir').trim();
  if (mode === 'project-root') {
    return path.dirname(bundleRoot);
  }
  if (mode === 'bundle-root') {
    return bundleRoot;
  }
  return path.join(bundleRoot, path.dirname(record.file));
}

function runNodeScriptInProcess(argv, cwd) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const scriptPath = path.resolve(cwd, argv[1]);
  const resolvedModule = require.resolve(scriptPath);

  delete require.cache[resolvedModule];

  try {
    process.chdir(cwd);
    process.argv = [process.execPath, scriptPath, ...argv.slice(2)];
    const captured = captureConsoleOutput(() => {
      const loaded = require(resolvedModule);
      if (loaded && typeof loaded.main === 'function') {
        return loaded.main(process.argv.slice(2));
      }
      return undefined;
    });
    const stdout = captured.stdout || (
      captured.value !== undefined
        ? `${typeof captured.value === 'string' ? captured.value : JSON.stringify(captured.value, null, 2)}\n`
        : ''
    );
    return {
      status: 0,
      signal: null,
      stdout,
      stderr: captured.stderr
    };
  } catch (error) {
    return {
      status: 1,
      signal: null,
      stdout: '',
      stderr: '',
      error
    };
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    delete require.cache[resolvedModule];
  }
}

function runHostSmokeCommand(bundleRoot, record, command) {
  const cwd = resolveSmokeCwd(bundleRoot, record, command);
  const argv = Array.isArray(command.argv) ? [...command.argv] : [];
  if (argv.length < 2) {
    return {
      ...(command.cwd ? { cwd: command.cwd } : {}),
      argv,
      expect: normalizeScalarObject(command.expect),
      status: 'fail',
      observed: {},
      mismatches: ['argv must include at least executable + one arg'],
      error: 'invalid host-smoke argv'
    };
  }

  const timeoutMs = Number.isInteger(command['timeout-ms']) ? command['timeout-ms'] : 10000;
  const startedAt = Date.now();
  let child = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs
  });
  if (child.error && child.error.code === 'EPERM' && argv[0] === 'node' && argv[1] && argv[1].toLowerCase().endsWith('.js')) {
    child = runNodeScriptInProcess(argv, cwd);
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  const stdout = String(child.stdout || '');
  const stderr = String(child.stderr || '');
  const expect = normalizeScalarObject(command.expect);
  const observed = {};
  const mismatches = [];

  let parsedJson = null;
  let jsonParseOk = false;
  try {
    parsedJson = JSON.parse(stdout);
    jsonParseOk = true;
  } catch (error) {
    mismatches.push(`stdout is not valid JSON: ${error.message}`);
  }

  if (jsonParseOk) {
    for (const [key, expectedValue] of Object.entries(expect)) {
      const actualValue = getValueAtPath(parsedJson, key);
      if (typeof actualValue === 'string' || typeof actualValue === 'number' || typeof actualValue === 'boolean') {
        observed[key] = actualValue;
      }
      if (actualValue !== expectedValue) {
        mismatches.push(`expect '${key}'=${JSON.stringify(expectedValue)} but observed ${JSON.stringify(actualValue)}`);
      }
    }
  }

  if (child.error) {
    mismatches.push(`process execution failed: ${child.error.message}`);
  }
  if (child.status !== 0) {
    mismatches.push(`exit code ${child.status}`);
  }
  if (child.signal) {
    mismatches.push(`signal ${child.signal}`);
  }

  const status = mismatches.length === 0 ? 'pass' : 'fail';
  return {
    ...(command.cwd ? { cwd: command.cwd } : {}),
    argv,
    expect,
    ...(command['timeout-ms'] !== undefined ? { 'timeout-ms': command['timeout-ms'] } : {}),
    status,
    'exit-code': child.status,
    signal: child.signal || null,
    'duration-ms': durationMs,
    'json-parse-ok': jsonParseOk,
    observed,
    mismatches,
    ...(stdout ? { 'stdout-preview': previewText(stdout) } : {}),
    ...(stderr ? { 'stderr-preview': previewText(stderr) } : {}),
    ...(child.error ? { error: child.error.message } : {})
  };
}

function buildHostSmokeRunId(host) {
  const now = new Date();
  const iso = now.toISOString();
  const stamp = iso
    .replace(/[:-]/g, '')
    .replace(/\.(\d{3})Z$/, '$1Z')
    .replace('T', 'T');
  return `host-smoke-${stamp}-${host}`;
}

function writeHostSmokeRunArtifact(bundleRoot, payload) {
  const runDir = getHostSmokeRuntimeRunsDir(bundleRoot);
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, `${payload['run-id']}.json`);
  writeJson(file, payload);
  return file;
}

function resolveHostSmoke(record) {
  return resolveRuntimeProofHostSmoke(record);
}

function toPortablePath(baseDir, targetPath) {
  return path.relative(baseDir, targetPath).split(path.sep).join('/');
}

function walkFiles(rootDir, predicate) {
  const results = [];
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return results;
  }

  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && predicate(entry.name, full)) {
        results.push(full);
      }
    }
  }

  return results.sort();
}

function normalizePhrase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactPhrase(value) {
  return normalizePhrase(value).replace(/\s+/g, '');
}

function humanizeSignal(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function trimSignalVerb(value) {
  const normalized = normalizePhrase(humanizeSignal(value));
  return normalized.replace(/^(analyze|evaluate|generate|collect|validate|verify|build|run)\s+/, '');
}

function uniqueStrings(values) {
  const seen = new Set();
  const normalized = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function extractRuntimeSignalNames(runText) {
  const signalNames = [];
  const excluded = new Set(['parseArgs', 'resolveTarget', 'emit']);
  const importPattern = /const\s*\{\s*([^}]+)\s*\}\s*=\s*require\((['"`])[^'"`]+\2\)/g;
  let match;

  while ((match = importPattern.exec(String(runText || ''))) !== null) {
    const importedNames = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    for (const imported of importedNames) {
      const aliasParts = imported.split(':').map((item) => item.trim()).filter(Boolean);
      const localName = aliasParts[aliasParts.length - 1];
      if (!localName || excluded.has(localName)) continue;
      signalNames.push(localName);
    }
  }

  return uniqueStrings(signalNames);
}

function collectJestTestCases(projectRoot) {
  const testRoot = path.join(projectRoot, 'test');
  const testFiles = walkFiles(testRoot, (name) => /\.test\.js$/i.test(name));
  const testCases = [];
  const testPattern = /\b(?:test|it)\s*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

  for (const testFile of testFiles) {
    const text = fs.readFileSync(testFile, 'utf8');
    let match;
    while ((match = testPattern.exec(text)) !== null) {
      const testName = String(match[2] || '').trim();
      if (!testName) continue;
      testCases.push({
        id: `${toPortablePath(projectRoot, testFile)}::${testName}`,
        name: testName,
        compactName: compactPhrase(testName),
        normalizedName: normalizePhrase(testName),
      });
    }
  }

  return testCases;
}

function buildEvidenceSignalVariants(projectRoot, record) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillDir = path.join(bundleRoot, path.dirname(record.file));
  const runPath = path.join(skillDir, 'scripts', 'run.js');
  const variants = [record.name, record.name.replace(/-/g, ' ')];

  if (fs.existsSync(runPath)) {
    const runText = fs.readFileSync(runPath, 'utf8');
    const signalNames = extractRuntimeSignalNames(runText);
    for (const signalName of signalNames) {
      variants.push(signalName);
      const humanized = humanizeSignal(signalName);
      if (humanized) {
        variants.push(humanized);
      }
      const trimmed = trimSignalVerb(signalName);
      if (trimmed && trimmed.split(' ').length >= 2) {
        variants.push(trimmed);
      }
    }
  }

  return uniqueStrings(variants);
}

function suggestEvidenceTests(projectRoot, record, testCases = null) {
  const candidates = Array.isArray(testCases) ? testCases : collectJestTestCases(projectRoot);
  const variants = buildEvidenceSignalVariants(projectRoot, record);
  const ranked = [];

  for (const testCase of candidates) {
    let score = 0;
    const matched = [];

    for (const variant of variants) {
      const compactVariant = compactPhrase(variant);
      const normalizedVariant = normalizePhrase(variant);
      if (compactVariant && testCase.compactName.includes(compactVariant)) {
        score = Math.max(score, 100);
        matched.push(variant);
        continue;
      }
      if (normalizedVariant && normalizedVariant.includes(' ') && testCase.normalizedName.includes(normalizedVariant)) {
        score = Math.max(score, 75);
        matched.push(variant);
      }
    }

    if (score > 0) {
      ranked.push({
        id: testCase.id,
        score,
        matched: uniqueStrings(matched),
      });
    }
  }

  ranked.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return ranked.map((item) => item.id);
}

function resolveEvidenceTests(projectRoot, record, existing, options = {}, testCases = null) {
  const suggestedEvidenceTests = suggestEvidenceTests(projectRoot, record, testCases);
  return resolveRuntimeProofEvidenceTests(existing, options, suggestedEvidenceTests);
}

function shouldHaveRuntimeProofEntry(record) {
  return shouldHaveGovernedRuntimeProofEntry(record);
}

function defaultRuntimeProofLevelForStatus(status) {
  return getDefaultRuntimeProofLevelForStatusGoverned(status);
}

function describeHostSmokedEvidenceFailure(evaluation) {
  return describeRuntimeProofHostSmokedEvidenceFailure(evaluation);
}

function evaluateHostSmokedEvidence(projectRoot, entry, options = {}) {
  const bundleRoot = options.bundleRoot || getBundleRoot(projectRoot);
  const hostSmokeIndex = options.hostSmokeIndex || loadHostSmokeRunIndex(bundleRoot);
  if (!hostSmokeIndex.invalidationIndex) {
    hostSmokeIndex.invalidationIndex = options.invalidationIndex || loadHostSmokeInvalidationIndex(bundleRoot);
  }
  const hostSmoke = normalizeHostSmokeContract(entry && entry['host-smoke']);

  if (!hostSmoke || !hostSmoke.manifest || hostSmoke.commands.length < 1) {
    return {
      ok: false,
      reason: 'invalid-contract',
      hostSmokeIndex
    };
  }

  const evidence = findLatestHostSmokeEvidence(hostSmokeIndex, entry.skill, hostSmoke, {
    invalidationIndex: hostSmokeIndex.invalidationIndex
  });
  if (!evidence.latestMatching) {
    return {
      ok: false,
      reason: evidence.latestAny ? 'contract-drift' : 'missing',
      evidence,
      hostSmokeIndex
    };
  }

  if (!evidence.latestPassing) {
    return {
      ok: false,
      reason: 'failing',
      evidence,
      hostSmokeIndex
    };
  }

  const freshness = evaluateHostSmokeFreshness(evidence.latestPassing, hostSmoke);
  if (freshness.required && freshness.stale) {
    return {
      ok: false,
      reason: 'stale',
      evidence,
      freshness,
      hostSmokeIndex
    };
  }

  return {
    ok: true,
    evidence,
    freshness,
    hostSmokeIndex
  };
}

function reconcileHostSmokedLevel(projectRoot, record, entry, options = {}) {
  if (!entry || entry.level !== 'host-smoked') {
    return {
      downgraded: false,
      reason: null
    };
  }

  const evaluation = evaluateHostSmokedEvidence(projectRoot, entry, options);
  if (evaluation.ok) {
    return {
      downgraded: false,
      reason: null
    };
  }

  const reason = describeHostSmokedEvidenceFailure(evaluation);
  if (options.explicitHostSmoked) {
    fail(`runtime-proof level 'host-smoked' for '${record.name}' requires fresh passing runtime host-smoke evidence that matches the current contract: ${reason}`);
  }

  entry.level = defaultRuntimeProofLevelForStatus(record.status);
  return {
    downgraded: true,
    downgradedFrom: 'host-smoked',
    reason
  };
}

function buildHostSmokePolicy(record, overrides = {}, existing = null) {
  const recordPolicy = deriveHostSmokePolicyFromRecord(record) || {};
  const existingPolicy = normalizeHostSmokePolicy(existing && existing['host-smoke-policy']) || {};
  const tier = normalizeHostSmokeTier(overrides.hostSmokeTier)
    || recordPolicy.tier
    || existingPolicy.tier;
  const targetLevel = normalizeHostSmokeTargetLevel(overrides.hostSmokeTargetLevel)
    || recordPolicy['target-level']
    || existingPolicy['target-level'];
  const freshnessDays = normalizeHostSmokeFreshnessDays(overrides.hostSmokeFreshnessDays)
    ?? normalizeHostSmokeFreshnessDays(record.hostSmokeFreshnessDays)
    ?? normalizeHostSmokeFreshnessDays(existingPolicy['freshness-days']);

  if (!tier || !targetLevel) {
    fail(`host-smoke policy for '${record.name}' is incomplete; declare host-smoke-tier and host-smoke-target-level in SKILL.md`);
  }
  if (tier === 'critical' && targetLevel !== 'host-smoked') {
    fail(`critical host-smoke policy for '${record.name}' must target 'host-smoked'`);
  }
  if (targetLevel === 'host-smoked' && freshnessDays == null) {
    fail(`host-smoke policy for '${record.name}' targeting 'host-smoked' requires host-smoke-freshness-days`);
  }
  if (targetLevel !== 'host-smoked' && freshnessDays != null) {
    fail(`host-smoke-freshness-days for '${record.name}' is only valid when host-smoke-target-level is 'host-smoked'`);
  }

  return {
    tier,
    'target-level': targetLevel,
    ...(freshnessDays != null ? { 'freshness-days': freshnessDays } : {})
  };
}

function buildRuntimeProofEntry(record, overrides = {}, existing = null) {
  try {
    return buildGovernedRuntimeProofEntry(record, overrides, existing);
  } catch (error) {
    fail(String(error && error.message ? error.message : error));
  }
}

function writeRuntimeProofRegistry(projectRoot, proofs, options = {}) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const useMergeWrite = Array.isArray(options.touchedSkills) || Array.isArray(options.removedSkills);
  const mergedProofs = useMergeWrite
    ? mergeRuntimeProofUpdates(projectRoot, proofs, {
        removedSkills: options.removedSkills,
        touchedSkills: options.touchedSkills
      })
    : dedupeRuntimeProofEntries(
        [...(Array.isArray(proofs) ? proofs : [])].sort((a, b) => String(a && a.skill || '').localeCompare(String(b && b.skill || ''))),
        { prefer: 'last' }
      );
  writeJson(runtimeProofPath, buildRuntimeProofRegistryDocument(mergedProofs));
  const scorecard = refreshHostSmokeScorecard(projectRoot, mergedProofs, {
    bestEffortReadiness: options.bestEffortReadiness === true,
    returnDetails: options.returnDetails === true
  });
  if (options.returnDetails === true) {
    return {
      runtimeProofPath,
      scorecard
    };
  }
  return runtimeProofPath;
}

function refreshHostSmokeScorecard(projectRoot, proofs = null, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const nextProofs = Array.isArray(proofs) ? proofs.filter((proof) => proof && proof['host-smoke']) : getHostSmokeProofsFromRegistry(projectRoot);
  const scorecardPath = getHostSmokeScorecardPath(bundleRoot);
  const scorecard = buildHostSmokeScorecard(bundleRoot, nextProofs);
  writeJson(scorecardPath, scorecard);
  refreshSkillInvestmentBacklog(projectRoot);
  const readiness = refreshSystemReadiness(projectRoot, {
    bestEffort: options.bestEffortReadiness === true,
    returnDetails: options.returnDetails === true || options.bestEffortReadiness === true
  });
  if (options.returnDetails === true) {
    return {
      file: scorecardPath,
      payload: scorecard,
      readiness
    };
  }
  return scorecardPath;
}

function refreshSystemReadiness(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const readinessPath = path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json');
  const hostEvolutionPath = path.join(bundleRoot, 'benchmark', 'host-evolution.generated.json');
  try {
    const result = writeSystemReadiness(bundleRoot, options.context || {});
    if (options.returnDetails === true || options.bestEffort === true) {
      return {
        ok: true,
        file: result.file,
        hostEvolution: result.hostEvolution || null,
        degraded: false
      };
    }
    return result.file;
  } catch (error) {
    if (!options.bestEffort) {
      throw error;
    }
    const message = error && error.message ? error.message : String(error);
    const hostEvolutionRelated = message.includes('host-evolution.generated.json') || message.includes('host evolution');
    return {
      ok: false,
      file: readinessPath,
      ...(hostEvolutionRelated ? { hostEvolutionFile: hostEvolutionPath } : {}),
      code: error && error.code ? error.code : 'UNKNOWN',
      message,
      degraded: true
    };
  }
}

function loadHostSmokeInvalidationEntries(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  const index = loadHostSmokeInvalidationIndex(bundleRoot);
  return {
    bundleRoot,
    index,
    entries: Array.isArray(index.entries) ? index.entries.map((entry) => ({ ...entry })) : []
  };
}

function appendHostSmokeInvalidations(projectRoot, entries, options = {}) {
  const { bundleRoot, index, entries: existingEntries } = loadHostSmokeInvalidationEntries(projectRoot);
  const nextEntries = [...existingEntries];
  const seen = new Set(existingEntries.map((entry) => `${entry.skill}::${entry['run-id']}`));
  let appended = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const skill = String(entry && entry.skill || '').trim();
    const runId = String(entry && entry['run-id'] || '').trim();
    if (!skill || !runId) {
      continue;
    }
    const key = `${skill}::${runId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    nextEntries.push({
      skill,
      'run-id': runId,
      reason: String(entry.reason || 'manual-reset').trim(),
      'invalidated-at': String(entry['invalidated-at'] || new Date().toISOString()).trim(),
      ...(entry.host ? { host: String(entry.host).trim() } : {}),
      ...(entry.manifest ? { manifest: String(entry.manifest).trim() } : {}),
      ...(entry.file ? { file: String(entry.file).trim() } : {}),
      ...(entry['invalidated-by'] ? { 'invalidated-by': String(entry['invalidated-by']).trim() } : {}),
      ...(entry.note ? { note: String(entry.note).trim() } : {})
    });
    appended += 1;
  }

  if (appended > 0) {
    writeHostSmokeInvalidationLedger(bundleRoot, nextEntries, options.now);
  } else if (index.errors.length > 0 && !fs.existsSync(getHostSmokeInvalidationPath(bundleRoot))) {
    writeHostSmokeInvalidationLedger(bundleRoot, nextEntries, options.now);
  }

  return {
    appended,
    file: getHostSmokeInvalidationPath(bundleRoot),
    entries: nextEntries
  };
}

function collectHostSmokeContractDriftInvalidations(projectRoot, entry, hostSmokeIndex, options = {}) {
  const bundleRoot = options.bundleRoot || getBundleRoot(projectRoot);
  if (!hostSmokeIndex.invalidationIndex) {
    hostSmokeIndex.invalidationIndex = loadHostSmokeInvalidationIndex(bundleRoot);
  }

  const skill = String(entry && entry.skill || '').trim();
  const contract = normalizeHostSmokeContract(entry && entry['host-smoke']);
  if (!skill || !contract || !contract.manifest || contract.commands.length < 1) {
    return [];
  }

  const evidence = findLatestHostSmokeEvidence(hostSmokeIndex, skill, contract, {
    invalidationIndex: hostSmokeIndex.invalidationIndex
  });
  const invalidatedAt = new Date(Number.isFinite(options.now) ? options.now : Date.now()).toISOString();
  const invalidatedBy = String(options.invalidatedBy || 'manage-skill sync-runtime-proof').trim();
  const note = String(options.note || 'Current host-smoke contract no longer matches this artifact.').trim();

  return (Array.isArray(evidence.activeResults) ? evidence.activeResults : [])
    .filter((artifact) => !hostSmokeContractsEqual(artifact.contract, contract))
    .map((artifact) => ({
      skill,
      'run-id': artifact.runId,
      reason: 'contract-drift',
      'invalidated-at': invalidatedAt,
      host: artifact.host,
      manifest: artifact.manifest,
      file: artifact.file,
      'invalidated-by': invalidatedBy,
      note
    }));
}

function reconcileHostSmoke(projectRoot, selection = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  assertGeneratedArtifactsWritable(
    projectRoot,
    selection.runAll ? 'reconcile host-smoke for all selected skills' : `reconcile host-smoke for '${selection.skillName}'`,
    {
      paths: [
        getRuntimeProofPath(projectRoot),
        getHostSmokeScorecardPath(bundleRoot),
        getHostSmokeInvalidationPath(bundleRoot),
        path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json')
      ]
    }
  );

  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  const proofs = Array.isArray(registry.proofs) ? registry.proofs : [];
  const skillRecords = collectAllSkillRecords(projectRoot);
  const recordByName = new Map(skillRecords.map((record) => [record.name, record]));
  const hostSmokeIndex = loadHostSmokeRunIndex(bundleRoot);
  hostSmokeIndex.invalidationIndex = loadHostSmokeInvalidationIndex(bundleRoot);

  let selectedProofs = [];
  if (selection.runAll) {
    selectedProofs = proofs.filter((proof) => proof && proof['host-smoke']);
  } else {
    const proof = proofs.find((item) => item && item.skill === selection.skillName);
    if (!proof) {
      fail(`runtime-proof registry has no entry for '${selection.skillName}'`);
    }
    selectedProofs = [proof];
  }
  if (selectedProofs.length < 1) {
    fail('no host-smoke-capable runtime-proof entries were selected');
  }

  const activeProofs = cloneJsonValue(proofs);
  const invalidationEntries = [];
  const demotedSkills = [];
  const reports = [];

  for (const proof of selectedProofs) {
    const record = recordByName.get(proof.skill);
    if (!record) {
      fail(`host-smoke reconciliation references unknown skill '${proof.skill}'`);
    }
    const contract = normalizeHostSmokeContract(proof['host-smoke']);
    const evaluation = evaluateHostSmokedEvidence(projectRoot, proof, {
      bundleRoot,
      hostSmokeIndex
    });
    const evidence = evaluation.evidence || findLatestHostSmokeEvidence(hostSmokeIndex, proof.skill, contract, {
      invalidationIndex: hostSmokeIndex.invalidationIndex
    });
    const report = {
      skill: proof.skill,
      level: proof.level,
      ok: evaluation.ok === true,
      status: evaluation.ok ? 'passing' : (evaluation.reason || 'invalid-contract'),
      reason: evaluation.ok ? null : describeHostSmokedEvidenceFailure(evaluation),
      latest_any_run: evidence.latestAny ? evidence.latestAny.runId : null,
      latest_matching_run: evidence.latestMatching ? evidence.latestMatching.runId : null,
      latest_passing_run: evidence.latestPassing ? evidence.latestPassing.runId : null
    };

    if (selection.invalidateDrift && evaluation.reason === 'contract-drift' && evidence.latestAny) {
      const driftArtifacts = collectHostSmokeContractDriftInvalidations(projectRoot, proof, hostSmokeIndex, {
        bundleRoot,
        invalidatedBy: 'manage-skill reconcile-host-smoke'
      });
      invalidationEntries.push(...driftArtifacts);
      report.invalidated_runs = uniqueStrings(driftArtifacts.map((item) => item.runId));
    }

    if (proof.level === 'host-smoked' && !evaluation.ok) {
      const nextLevel = defaultRuntimeProofLevelForStatus(record.status);
      if (proof.level !== nextLevel) {
        const active = activeProofs.find((item) => item && item.skill === proof.skill);
        if (active) {
          active.level = nextLevel;
        }
        demotedSkills.push(proof.skill);
        report.downgraded_to = nextLevel;
      }
    }

    reports.push(report);
  }

  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  try {
    const invalidationResult = invalidationEntries.length > 0
      ? appendHostSmokeInvalidations(projectRoot, invalidationEntries)
      : { appended: 0, file: getHostSmokeInvalidationPath(bundleRoot) };

    if (demotedSkills.length > 0) {
      writeRuntimeProofRegistry(projectRoot, activeProofs, {
        touchedSkills: reports.map((item) => item.skill).filter(Boolean)
      });
    } else {
      refreshHostSmokeScorecard(projectRoot, activeProofs);
    }

    let rerunResult = null;
    if (selection.rerun) {
      rerunResult = runHostSmoke(projectRoot, {
        host: selection.host || 'codex',
        runAll: selection.runAll,
        skillName: selection.runAll ? null : selection.skillName,
        promoteHostSmoked: selection.promoteHostSmoked === true
      });
    }

    return {
      action: 'reconcile-host-smoke',
      scope: selection.runAll ? 'all' : 'single',
      skills: reports.map((item) => item.skill),
      invalidated_runs: invalidationEntries.length,
      invalidation_file: toPortablePath(projectRoot, invalidationResult.file),
      demoted_skills: uniqueStrings(demotedSkills),
      reports,
      ...(rerunResult ? { rerun: rerunResult } : {}),
      follow_up: ['npm run verify:skill-system']
    };
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function writeRuntimeProofEntryLevel(projectRoot, skillName, nextLevel) {
  assertGeneratedArtifactsWritable(projectRoot, `set runtime-proof level for '${skillName}'`, {
    paths: [
      getRuntimeProofPath(projectRoot),
      getHostSmokeScorecardPath(getBundleRoot(projectRoot)),
      path.join(getBundleRoot(projectRoot), 'benchmark', 'system-readiness.generated.json')
    ],
    optionalPaths: [
      path.join(getBundleRoot(projectRoot), 'benchmark', 'system-readiness.generated.json')
    ]
  });
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  const proofs = Array.isArray(registry.proofs) ? registry.proofs : [];
  const proof = proofs.find((item) => item && item.skill === skillName);
  if (!proof) {
    fail(`cannot set runtime-proof level for missing skill '${skillName}'`);
  }
  if (!isKnownRuntimeProofLevel(nextLevel)) {
    fail(`invalid runtime-proof level '${nextLevel}'`);
  }
  proof.level = nextLevel;
  writeRuntimeProofRegistry(projectRoot, proofs, {
    touchedSkills: [skillName],
    bestEffortReadiness: true
  });
}

function runHostSmoke(projectRoot, selection = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  assertGeneratedArtifactsWritable(projectRoot, selection.runAll ? 'run host-smoke for all selected skills' : `run host-smoke for '${selection.skillName}'`, {
    paths: [
      getRuntimeProofPath(projectRoot),
      getHostSmokeScorecardPath(bundleRoot),
      path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json'),
      getHostSmokeRuntimeRunsDir(bundleRoot)
    ],
    optionalPaths: [
      path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json')
    ]
  });
  const host = String(selection.host || 'codex').trim().toLowerCase();
  if (!isKnownSupportedHost(host)) {
    fail(`unsupported host '${host}'`);
  }

  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  const proofs = Array.isArray(registry.proofs) ? registry.proofs : [];
  const skillRecords = collectAllSkillRecords(projectRoot);
  const recordByName = new Map(skillRecords.map((record) => [record.name, record]));

  let selectedProofs = [];
  if (selection.runAll) {
    selectedProofs = proofs.filter((proof) => proof && proof['host-smoke']);
  } else {
    const proof = proofs.find((item) => item && item.skill === selection.skillName);
    if (!proof) {
      fail(`runtime-proof registry has no entry for '${selection.skillName}'`);
    }
    selectedProofs = [proof];
  }

  if (selectedProofs.length < 1) {
    fail('no host-smoke-capable runtime-proof entries were selected');
  }

  const activeProofs = cloneJsonValue(proofs);
  const normalizedSkills = [];
  const results = [];
  const promoteHostSmoked = selection.promoteHostSmoked === true;

  for (const proof of selectedProofs) {
    const record = recordByName.get(proof.skill);
    if (!record) {
      fail(`host-smoke selection references unknown skill '${proof.skill}'`);
    }
    const contract = normalizeHostSmokeContract(proof['host-smoke']);
    if (!contract || !contract.manifest || contract.commands.length < 1) {
      fail(`skill '${proof.skill}' has no executable host-smoke contract in runtime-proof.generated.json`);
    }
    normalizedSkills.push(proof.skill);

    const commandResults = contract.commands.map((command) => runHostSmokeCommand(bundleRoot, record, command));
    const passedCommands = commandResults.filter((command) => command.status === 'pass').length;
    const status = passedCommands === commandResults.length ? 'pass' : 'fail';
    results.push({
      skill: proof.skill,
      kind: proof.kind,
      'level-before': proof.level,
      status,
      manifest: contract.manifest,
      contract,
      'command-count': commandResults.length,
      'passed-commands': passedCommands,
      commands: commandResults
    });

  }

  const payload = {
    'schema-version': HOST_SMOKE_RUN_SCHEMA_VERSION,
    'run-id': buildHostSmokeRunId(host),
    'executed-at': new Date().toISOString(),
    host,
    'source-runtime-proof': 'registry/runtime-proof.generated.json',
    selection: {
      scope: selection.runAll ? 'all' : 'single',
      skills: normalizedSkills
    },
    results
  };
  const artifactFile = writeHostSmokeRunArtifact(bundleRoot, payload);
  const promotedHostSmoked = [];
  const demotedHostSmoked = [];
  let runtimeProofChanged = false;

  if (promoteHostSmoked && results.every((item) => item.status === 'pass')) {
    for (const result of results) {
      const proof = activeProofs.find((item) => item && item.skill === result.skill);
      if (!proof) continue;
      if (proof.level !== 'host-smoked') {
        proof.level = 'host-smoked';
        runtimeProofChanged = true;
      }
      promotedHostSmoked.push(result.skill);
    }
  }

  for (const result of results) {
    const proof = activeProofs.find((item) => item && item.skill === result.skill);
    const record = recordByName.get(result.skill);
    if (!proof || !record) continue;
    if (result.status !== 'pass' && proof.level === 'host-smoked') {
      const nextLevel = defaultRuntimeProofLevelForStatus(record.status);
      if (proof.level !== nextLevel) {
        proof.level = nextLevel;
        runtimeProofChanged = true;
      }
      demotedHostSmoked.push(result.skill);
    }
  }

  let scorecardFile;
  if (runtimeProofChanged) {
    writeRuntimeProofRegistry(projectRoot, activeProofs, {
      touchedSkills: normalizedSkills,
      bestEffortReadiness: true
    });
    scorecardFile = getHostSmokeScorecardPath(bundleRoot);
  } else {
    scorecardFile = refreshHostSmokeScorecard(projectRoot, activeProofs, {
      bestEffortReadiness: true
    });
  }

  return {
    action: 'run-host-smoke',
    host,
    scope: selection.runAll ? 'all' : 'single',
    skills: normalizedSkills,
    status: results.every((item) => item.status === 'pass') ? 'pass' : 'fail',
    promoted_host_smoked: promotedHostSmoked.length > 0,
    requested_host_smoked_promotion: promoteHostSmoked,
    promoted_skills: promotedHostSmoked,
    demoted_skills: uniqueStrings(demotedHostSmoked),
    results: results.map((item) => ({
      skill: item.skill,
      status: item.status,
      commands: item['command-count'],
      passed_commands: item['passed-commands']
    })),
    artifact: toPortablePath(projectRoot, artifactFile),
    scorecard: toPortablePath(projectRoot, scorecardFile),
    follow_up: ['npm run verify:skill-system']
  };
}

function syncRuntimeProofEntry(projectRoot, skillName, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  assertGeneratedArtifactsWritable(projectRoot, `sync runtime-proof for '${skillName}'`, {
    paths: [
      getRuntimeProofPath(projectRoot),
      getHostSmokeScorecardPath(bundleRoot),
      getHostSmokeInvalidationPath(bundleRoot),
      path.join(bundleRoot, 'benchmark', 'host-smoke', 'runtime-runs')
    ]
  });
  const skillRecords = collectAllSkillRecords(projectRoot);
  const record = skillRecords.find((item) => item.name === skillName);
  if (!record) {
    fail(`unknown skill '${skillName}'`);
  }

  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  const proofs = Array.isArray(registry.proofs) ? registry.proofs : [];
  const existing = proofs.find((proof) => proof && proof.skill === skillName) || null;

  if (!shouldHaveRuntimeProofEntry(record)) {
    if (existing) {
      const nextProofs = proofs.filter((proof) => proof && proof.skill !== skillName)
        .sort((a, b) => String(a.skill).localeCompare(String(b.skill)));
      writeRuntimeProofRegistry(projectRoot, nextProofs, {
        removedSkills: [skillName],
        touchedSkills: []
      });
      return {
        action: 'sync-runtime-proof',
        skill: skillName,
        status: 'removed',
        reason: `skill status '${record.status}' with runtime '${record.runtime}' is not on the live scripted runtime-proof surface`,
        path: 'personal-skill-system/registry/runtime-proof.generated.json',
        follow_up: ['npm run verify:skill-system']
      };
    }

    return {
      action: 'sync-runtime-proof',
      skill: skillName,
      status: 'skipped',
      reason: `skill status '${record.status}' with runtime '${record.runtime}' is not on the live scripted runtime-proof surface`,
      path: 'personal-skill-system/registry/runtime-proof.generated.json',
      follow_up: ['npm run verify:skill-system']
    };
  }

  if ((record.runtimeProofItems || []).length < 2) {
    fail(`skill '${skillName}' needs at least two Runtime Proof bullets before runtime-proof sync`);
  }

  const hostSmokeIndex = loadHostSmokeRunIndex(bundleRoot);
  hostSmokeIndex.invalidationIndex = loadHostSmokeInvalidationIndex(bundleRoot);
  const testCases = collectJestTestCases(projectRoot);
  const evidenceResolution = resolveEvidenceTests(projectRoot, record, existing, options, testCases);
  const entry = buildRuntimeProofEntry(record, {
    ...options,
    evidenceTests: evidenceResolution.evidenceTests
  }, existing);
  const hostSmokedResolution = reconcileHostSmokedLevel(projectRoot, record, entry, {
    bundleRoot,
    hostSmokeIndex,
    explicitHostSmoked: options.level === 'host-smoked'
  });
  if (entry.level !== 'declared-only' && entry['evidence-tests'].length < 1) {
    fail(`runtime-proof level '${entry.level}' for '${skillName}' requires at least one evidence test`);
  }

  const driftInvalidations = collectHostSmokeContractDriftInvalidations(projectRoot, entry, hostSmokeIndex, {
    bundleRoot,
    invalidatedBy: 'manage-skill sync-runtime-proof'
  });
  const nextProofs = proofs.filter((proof) => proof && proof.skill !== skillName);
  nextProofs.push(entry);
  nextProofs.sort((a, b) => String(a.skill).localeCompare(String(b.skill)));
  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  try {
    const invalidationResult = driftInvalidations.length > 0
      ? appendHostSmokeInvalidations(projectRoot, driftInvalidations)
      : { appended: 0, file: getHostSmokeInvalidationPath(bundleRoot) };
    const writeResult = writeRuntimeProofRegistry(projectRoot, nextProofs, {
      touchedSkills: [skillName],
      bestEffortReadiness: true,
      returnDetails: true
    });
    const readiness = writeResult && writeResult.scorecard ? writeResult.scorecard.readiness : null;

    return {
      action: 'sync-runtime-proof',
      skill: skillName,
      status: existing ? 'updated' : 'created',
      level: entry.level,
      contracts: entry.contracts.length,
      evidence_tests: entry['evidence-tests'].length,
      evidence_test_source: evidenceResolution.evidenceTestSource,
      invalidated_runs: invalidationResult.appended,
      ...(invalidationResult.appended > 0
        ? {
            invalidation_file: toPortablePath(projectRoot, invalidationResult.file)
          }
        : {}),
      ...(hostSmokedResolution.downgraded
        ? {
            downgraded_from: hostSmokedResolution.downgradedFrom,
            downgrade_reason: hostSmokedResolution.reason
          }
        : {}),
      suggested_evidence_tests: options.suggestEvidenceTests || options.autoEvidenceTests
        ? evidenceResolution.suggestedEvidenceTests
        : undefined,
      ...(readiness && readiness.ok === false
        ? {
            readiness_warning: {
              file: toPortablePath(projectRoot, readiness.file),
              code: readiness.code,
              message: readiness.message
            }
          }
        : {}),
      path: 'personal-skill-system/registry/runtime-proof.generated.json',
      follow_up: ['npm run verify:skill-system']
    };
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function syncAllRuntimeProofEntries(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  assertGeneratedArtifactsWritable(projectRoot, 'sync runtime-proof for all governed scripted skills', {
    paths: [
      getRuntimeProofPath(projectRoot),
      getHostSmokeScorecardPath(bundleRoot),
      getHostSmokeInvalidationPath(bundleRoot),
      path.join(bundleRoot, 'benchmark', 'host-smoke', 'runtime-runs')
    ]
  });
  const skillRecords = collectAllSkillRecords(projectRoot);
  const testCases = collectJestTestCases(projectRoot);
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  const existingBySkill = new Map((Array.isArray(registry.proofs) ? registry.proofs : [])
    .filter((proof) => proof && proof.skill)
    .map((proof) => [proof.skill, proof]));

  const results = [];
  const nextProofs = [];
  const hostSmokeIndex = loadHostSmokeRunIndex(bundleRoot);
  hostSmokeIndex.invalidationIndex = loadHostSmokeInvalidationIndex(bundleRoot);
  const driftInvalidations = [];

  for (const record of skillRecords) {
    const existing = existingBySkill.get(record.name) || null;
    if (!shouldHaveRuntimeProofEntry(record)) {
      if (existing) {
        results.push({
          skill: record.name,
          status: 'removed',
          reason: `skill status '${record.status}' with runtime '${record.runtime}' is not on the live scripted runtime-proof surface`
        });
      }
      continue;
    }

    if ((record.runtimeProofItems || []).length < 2) {
      fail(`skill '${record.name}' needs at least two Runtime Proof bullets before runtime-proof sync`);
    }

    const override = options.overrides && options.overrides[record.name] ? options.overrides[record.name] : {};
    const evidenceResolution = resolveEvidenceTests(projectRoot, record, existing, {
      ...override,
      autoEvidenceTests: options.autoEvidenceTests,
      suggestEvidenceTests: options.suggestEvidenceTests
    }, testCases);
    const entry = buildRuntimeProofEntry(record, {
      ...override,
      evidenceTests: evidenceResolution.evidenceTests
    }, existing);
    const hostSmokedResolution = reconcileHostSmokedLevel(projectRoot, record, entry, {
      bundleRoot,
      hostSmokeIndex,
      explicitHostSmoked: override.level === 'host-smoked'
    });
    if (entry.level !== 'declared-only' && entry['evidence-tests'].length < 1) {
      fail(`runtime-proof level '${entry.level}' for '${record.name}' requires at least one evidence test`);
    }
    const result = {
      skill: record.name,
      status: existing ? 'updated' : 'created',
      level: entry.level,
      contracts: entry.contracts.length,
      evidence_tests: entry['evidence-tests'].length,
      evidence_test_source: evidenceResolution.evidenceTestSource
    };
    if (hostSmokedResolution.downgraded) {
      result.downgraded_from = hostSmokedResolution.downgradedFrom;
      result.downgrade_reason = hostSmokedResolution.reason;
    }
    if (options.suggestEvidenceTests || options.autoEvidenceTests) {
      result.suggested_evidence_tests = evidenceResolution.suggestedEvidenceTests;
    }
    const skillDriftInvalidations = collectHostSmokeContractDriftInvalidations(projectRoot, entry, hostSmokeIndex, {
      bundleRoot,
      invalidatedBy: 'manage-skill sync-runtime-proof'
    });
    if (skillDriftInvalidations.length > 0) {
      result.invalidated_runs = skillDriftInvalidations.length;
      driftInvalidations.push(...skillDriftInvalidations);
    }
    nextProofs.push(entry);
    results.push(result);
  }

  for (const proof of Array.isArray(registry.proofs) ? registry.proofs : []) {
    if (!proof || !proof.skill) continue;
    if (!skillRecords.some((record) => record.name === proof.skill && shouldHaveRuntimeProofEntry(record))) {
      if (!results.some((item) => item.skill === proof.skill && item.status === 'removed')) {
        results.push({
          skill: proof.skill,
          status: 'removed',
          reason: 'entry no longer belongs to the live scripted runtime-proof surface'
        });
      }
    }
  }

  nextProofs.sort((a, b) => String(a.skill).localeCompare(String(b.skill)));
  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  try {
    const invalidationResult = driftInvalidations.length > 0
      ? appendHostSmokeInvalidations(projectRoot, driftInvalidations)
      : { appended: 0, file: getHostSmokeInvalidationPath(bundleRoot) };
    const writeResult = writeRuntimeProofRegistry(projectRoot, nextProofs, {
      bestEffortReadiness: true,
      returnDetails: true
    });
    const readiness = writeResult && writeResult.scorecard ? writeResult.scorecard.readiness : null;

    return {
      action: 'sync-runtime-proof',
      scope: 'all',
      updated: results,
      total_live_entries: nextProofs.length,
      invalidated_runs: invalidationResult.appended,
      ...(invalidationResult.appended > 0
        ? {
            invalidation_file: toPortablePath(projectRoot, invalidationResult.file)
          }
        : {}),
      ...(readiness && readiness.ok === false
        ? {
            readiness_warning: {
              file: toPortablePath(projectRoot, readiness.file),
              code: readiness.code,
              message: readiness.message
            }
          }
        : {}),
      path: 'personal-skill-system/registry/runtime-proof.generated.json',
      follow_up: ['npm run verify:skill-system']
    };
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function syncCapabilityRatingsDoc(projectRoot) {
  const ratings = readJson(getRatingsPath(projectRoot));
  syncCapabilityRatingsDocFile(getBundleRoot(projectRoot), ratings);
}

function syncArchiveOnGeneratedSurfaces(projectRoot, skillName) {
  syncRouteMapOnRemove(projectRoot, skillName);
  syncRouteFixturesOnRemove(projectRoot, skillName);
  syncRatingsOnRemove(projectRoot, skillName);
  syncRuntimeProofOnRemove(projectRoot, skillName);
  const reviewQueue = refreshReviewQueue(projectRoot);
  refreshSkillInvestmentBacklog(projectRoot, {
    reviewQueueData: reviewQueue.payload
  });
}

function syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, options = {}) {
  syncRegistryOnCreate(projectRoot, kind, skillName, options);
  if (options.createPlaceholderRoute) {
    syncRouteMapOnCreate(projectRoot, kind, skillName, {
      shared: options.shared || null,
      expertModules: Array.isArray(options.capabilityModules)
        ? options.capabilityModules.map((module) => module.id)
        : []
    });
    syncRouteFixturesOnCreate(projectRoot, skillName);
  }
  syncRatingsOnCreate(projectRoot, skillName, options);
  syncAdmissionLedgerOnSkillCreate(projectRoot, skillName, options);
  syncOpportunityQueueOnSkillCreate(projectRoot, skillName, options);
  const reviewQueue = refreshReviewQueue(projectRoot);
  refreshSkillInvestmentBacklog(projectRoot, {
    reviewQueueData: reviewQueue.payload
  });
  return {
    readiness: refreshSystemReadiness(projectRoot, { bestEffort: true, returnDetails: true })
  };
}

function deferBlockedSkillCreate(projectRoot, kind, skillName, targetDir, constraint, options = {}) {
  if (!options.requestId && !options.opportunityId) {
    fail('--defer-when-host-blocked requires --request-id or --opportunity-id so the blocked create stays governed');
  }

  const governanceLinks = resolveCreateGovernanceLinks(projectRoot, options);
  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  const portableParent = toPortablePath(projectRoot, constraint.parent);
  const bundleRoot = getBundleRoot(projectRoot);
  const plan = buildScaffoldPlan(projectRoot, kind, skillName, options);
  const pendingRegistry = readPendingScaffoldRegistry(projectRoot);
  const pendingId = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${skillName}`;
  pendingRegistry.entries = Array.isArray(pendingRegistry.entries) ? pendingRegistry.entries : [];
  pendingRegistry.entries = pendingRegistry.entries.filter((entry) => String(entry && entry.skill || '').trim() !== skillName);
  const note = [
    `creation of '${skillName}' is blocked by host-writeability debt`,
    `mode=${constraint.mode}`,
    `code=${constraint.code}`,
    `parent=${portableParent}`,
    'rerun the same create command on a host that can mutate the authoritative skill tree'
  ].join('; ');

    try {
      let admissionEntry = null;
      let opportunityEntry = null;

    if (governanceLinks.requestId) {
      admissionEntry = resolveAdmissionDecision(projectRoot, governanceLinks.requestId, {
        status: 'blocked',
        note
      });
    }
    if (governanceLinks.opportunityId) {
      opportunityEntry = resolveOpportunity(projectRoot, governanceLinks.opportunityId, {
        status: 'blocked',
        admissionRequestId: governanceLinks.requestId || null,
        note
      });
    }

    pendingRegistry.entries.push({
      'pending-id': pendingId,
      kind,
      skill: skillName,
      path: toPortablePath(projectRoot, targetDir),
      status: 'blocked',
      'recorded-at': new Date().toISOString(),
      files: plan.files,
      ...(governanceLinks.requestId ? { 'request-id': governanceLinks.requestId } : {}),
      ...(governanceLinks.opportunityId ? { 'opportunity-id': governanceLinks.opportunityId } : {}),
      ...(plan.capabilityModules.length > 0 ? { 'capability-modules': plan.capabilityModules } : {}),
      ...(plan.createPlaceholderRoute ? { 'create-placeholder-route': true } : {}),
      ...(options.scaffoldModules ? { 'scaffold-modules': true } : {}),
      ...(plan.shared ? { shared: plan.shared } : {}),
      ...(plan.templateLineage ? {
        'template-origin': plan.templateLineage.origin,
        'template-version': plan.templateLineage.version
      } : {}),
      'host-constraint': {
        type: constraint.type,
        mode: constraint.mode,
        code: constraint.code,
        parent: portableParent
      },
      'rerun-command': formatCreateCommand(kind, skillName, {
        ...options,
        requestId: governanceLinks.requestId,
        opportunityId: governanceLinks.opportunityId
      }),
      note
    });
    writePendingScaffoldRegistry(projectRoot, pendingRegistry);
    const reviewQueue = refreshReviewQueue(projectRoot);
    refreshSkillInvestmentBacklog(projectRoot, {
      reviewQueueData: reviewQueue.payload,
      pendingScaffoldData: pendingRegistry
    });

    const readiness = refreshSystemReadiness(projectRoot, {
      bestEffort: true,
      returnDetails: true
    });

    return {
      action: 'create',
      status: 'deferred-host-blocked',
      kind,
      skill: skillName,
      path: toPortablePath(projectRoot, targetDir),
      'host-constraint': {
        type: constraint.type,
        mode: constraint.mode,
        code: constraint.code,
        parent: portableParent
      },
      ...(governanceLinks.requestId ? { 'admission-request-id': governanceLinks.requestId } : {}),
      ...(governanceLinks.opportunityId ? { 'opportunity-id': governanceLinks.opportunityId } : {}),
      ...(admissionEntry ? { 'admission-status': admissionEntry.status } : {}),
      ...(opportunityEntry ? { 'linked-opportunity-status': opportunityEntry.status } : {}),
      'pending-scaffold-id': pendingId,
      ...(!readiness.ok ? { readiness_warning: readiness } : {}),
      follow_up: [
        ...(governanceLinks.requestId ? [`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --request-id ${governanceLinks.requestId}`] : []),
        ...(governanceLinks.opportunityId ? [`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id ${governanceLinks.opportunityId}`] : []),
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --skill ${skillName}`,
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source host-writeability',
        `rerun on a writable host: ${formatCreateCommand(kind, skillName, {
          ...options,
          requestId: governanceLinks.requestId,
          opportunityId: governanceLinks.opportunityId
        })}`
      ]
    };
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function syncGeneratedSurfacesOnRemove(projectRoot, skillName) {
  const removedModuleIds = getCapabilityModuleIdsForSkill(projectRoot, skillName);
  syncRegistryOnRemove(projectRoot, skillName);
  syncRouteMapOnRemove(projectRoot, skillName);
  syncRouteFixturesOnRemove(projectRoot, skillName);
  syncRatingsOnRemove(projectRoot, skillName, { removedModuleIds });
  syncRuntimeProofOnRemove(projectRoot, skillName);
  const reviewQueue = refreshReviewQueue(projectRoot);
  refreshSkillInvestmentBacklog(projectRoot, {
    reviewQueueData: reviewQueue.payload
  });
}

function summarizeDeleteGovernance(projectRoot, skillName) {
  const bundleRoot = getBundleRoot(projectRoot);
  const registryData = readGovernedRegistry(projectRoot);
  const expertSourceIntegrations = summarizeExpertSourceIntegrations(bundleRoot, registryData);
  return buildDeleteDependencySummary(skillName, {
    opportunityEntries: readOpportunityQueue(projectRoot).entries,
    admissionEntries: readAdmissionLedger(projectRoot).entries,
    evolutionEntries: readEvolutionLedger(projectRoot).entries,
    pendingScaffoldEntries: readPendingScaffoldRegistry(projectRoot).entries,
    expertSourceFamilies: expertSourceIntegrations.families
  });
}

function createSkill(kind, skillName, options = {}) {
  const layer = VALID_KINDS.get(kind);
  if (!layer) fail(`unknown kind '${kind}'`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) fail(`invalid skill name '${skillName}'`);
  if (options.scaffoldModules && !supportsCapabilityModuleScaffold(kind)) {
    fail(`capability-module scaffolding is only supported for ${describeCapabilityModuleScaffoldKinds()} skills, not '${kind}'`);
  }

  const projectRoot = getProjectRoot();
  assertGeneratedArtifactsWritable(projectRoot, `create skill '${skillName}'`, {
    paths: [
      getRegistryPath(projectRoot),
      getRouteMapPath(projectRoot),
      getRouteFixturesPath(projectRoot),
      getRatingsPath(projectRoot),
      getReviewQueueRegistryPath(projectRoot),
      getPendingScaffoldRegistryFilePath(projectRoot),
      getSkillOpportunityQueueRegistryPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getSkillInvestmentBacklogDocFilePath(projectRoot),
      getAdmissionLedgerPath(getBundleRoot(projectRoot))
    ]
  });
  const skillsRoot = getAuthoritativeSkillsRoot();
  const targetDir = path.join(skillsRoot, layer, skillName);
  const skillFile = path.join(targetDir, 'SKILL.md');
  ensureInsideAuthoritativeRoot(targetDir, skillsRoot);
  if (fs.existsSync(targetDir) && (fs.existsSync(skillFile) || directoryContainsFiles(targetDir))) {
    fail(`skill already exists at ${targetDir}`);
  }
  const governanceLinks = resolveCreateGovernanceLinks(projectRoot, options);
  const createConstraint = getDirectoryCreateConstraint(projectRoot, targetDir, `create skill '${skillName}'`);
  if (createConstraint) {
    if (options.deferWhenHostBlocked) {
      return deferBlockedSkillCreate(projectRoot, kind, skillName, targetDir, createConstraint, {
        ...options,
        requestId: governanceLinks.requestId,
        opportunityId: governanceLinks.opportunityId
      });
    }
    fail(createConstraint.message);
  }
  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  const plan = buildScaffoldPlan(projectRoot, kind, skillName, options);

  try {
    materializeScaffoldPlan(targetDir, plan);
    const capabilityModules = plan.capabilityModules;
    const createPlaceholderRoute = plan.createPlaceholderRoute;
    const shared = plan.shared;
    const syncResult = syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, {
      createPlaceholderRoute,
      capabilityModules,
      shared,
      requestId: governanceLinks.requestId,
      opportunityId: governanceLinks.opportunityId
    });
    const pendingRegistry = readPendingScaffoldRegistry(projectRoot);
    pendingRegistry.entries = (Array.isArray(pendingRegistry.entries) ? pendingRegistry.entries : [])
      .filter((entry) => String(entry && entry.skill || '').trim() !== skillName);
    writePendingScaffoldRegistry(projectRoot, pendingRegistry);
    const reviewQueue = refreshReviewQueue(projectRoot);
    refreshSkillInvestmentBacklog(projectRoot, {
      reviewQueueData: reviewQueue.payload,
      pendingScaffoldData: pendingRegistry
    });
    const finalReadiness = refreshSystemReadiness(projectRoot, { bestEffort: true, returnDetails: true });
    const degradedReadiness = finalReadiness && finalReadiness.ok === false
      ? finalReadiness
      : syncResult && syncResult.readiness && syncResult.readiness.ok === false
        ? syncResult.readiness
        : null;

    return {
      action: 'create',
      kind,
      skill: skillName,
      path: path.relative(projectRoot, targetDir).split(path.sep).join('/'),
      ...(governanceLinks.requestId ? { 'admission-request-id': governanceLinks.requestId } : {}),
      ...(governanceLinks.opportunityId ? { 'opportunity-id': governanceLinks.opportunityId } : {}),
      ...(capabilityModules.length > 0
        ? { 'scaffolded-capability-modules': capabilityModules.map((module) => module.id) }
        : {}),
      ...(degradedReadiness
        ? {
            degraded_governance: {
              'system-readiness': degradedReadiness
            }
          }
        : {}),
      follow_up: ['npm run verify:skills', 'npm run verify:skill-system'],
    };
  } catch (error) {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function showPendingScaffolds(projectRoot, options = {}) {
  const registry = readPendingScaffoldRegistry(projectRoot);
  const skillFilter = normalizeString(options.skill);
  const statusFilter = normalizeString(options.status);
  const pendingIdFilter = normalizeString(options.pendingId);

  let entries = Array.isArray(registry.entries) ? registry.entries : [];
  if (pendingIdFilter) {
    entries = entries.filter((entry) => normalizeString(entry['pending-id']) === pendingIdFilter);
  }
  if (skillFilter) {
    entries = entries.filter((entry) => normalizeString(entry.skill) === skillFilter);
  }
  if (statusFilter) {
    entries = entries.filter((entry) => normalizePendingScaffoldStatus(entry.status) === statusFilter);
  }

  return {
    action: 'show-pending-scaffolds',
    summary: registry.summary || {},
    total: Array.isArray(registry.entries) ? registry.entries.length : 0,
    returned: entries.length,
    entries
  };
}

function showFutureSkillPipeline(projectRoot, options = {}) {
  const opportunityQueue = readOpportunityQueue(projectRoot);
  const admissionLedger = readAdmissionLedger(projectRoot);
  const pendingRegistry = readPendingScaffoldRegistry(projectRoot);
  const hostEvolution = buildHostEvolutionReport(getBundleRoot(projectRoot), {
    readiness: readCurrentSystemReadiness(projectRoot),
    backlog: buildCurrentSkillInvestmentBacklog(projectRoot),
    pendingScaffoldRegistry: pendingRegistry,
    admissionLedger
  });
  const includeResolved = options.includeResolved === true;
  const stageFilter = normalizeFutureSkillPipelineStage(options.stage);
  const priorityFilter = normalizeString(options.priority);
  const kindFilter = normalizeString(options.kind);
  const skillFilter = normalizeString(options.skill);
  const blockedOnly = options.blockedOnly === true;

  const pipeline = buildFutureSkillPipelineView({
    opportunities: opportunityQueue.entries,
    admissions: admissionLedger.entries,
    pendingScaffolds: pendingRegistry.entries,
    hostEvolution
  }, {
    includeResolved
  });

  let entries = pipeline.entries;
  if (stageFilter) {
    entries = entries.filter((entry) => entry.stage === stageFilter);
  }
  if (priorityFilter) {
    entries = entries.filter((entry) => normalizeString(entry.priority) === priorityFilter);
  }
  if (kindFilter) {
    entries = entries.filter((entry) => normalizeString(entry.kind) === kindFilter);
  }
  if (skillFilter) {
    entries = entries.filter((entry) =>
      normalizeString(entry.skill) === skillFilter
      || normalizeString(entry['target-skill']) === skillFilter
      || normalizeString(entry['thread-id']) === skillFilter
    );
  }
  if (blockedOnly) {
    entries = entries.filter((entry) => entry.blocked === true);
  }

  return {
    action: 'show-future-skill-pipeline',
    summary: pipeline.summary,
    total: pipeline.total,
    returned: entries.length,
    filters: {
      ...(stageFilter ? { stage: stageFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(kindFilter ? { kind: kindFilter } : {}),
      ...(skillFilter ? { skill: skillFilter } : {}),
      ...(blockedOnly ? { blocked: true } : {}),
      ...(includeResolved ? { 'include-resolved': true } : {})
    },
    'host-evolution': {
      status: hostEvolution.status,
      capabilities: hostEvolution.capabilities,
      summary: hostEvolution.summary
    },
    entries
  };
}

function diagnoseHostEvolution(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  const refreshPlan = listDerivedGovernanceRefreshPlan();
  const readinessContext = collectSystemReadinessContext(bundleRoot);
  const readiness = buildSystemReadiness(bundleRoot, readinessContext);
  const backlog = buildCurrentSkillInvestmentBacklog(projectRoot, {
    skillRecords: readinessContext.skillRecords,
    routeFixturesData: {
      cases: readinessContext.routeFixtures
    }
  });
  const payload = buildHostEvolutionReport(bundleRoot, {
    ...readinessContext,
    readiness,
    backlog
  });
  const latestDerivedExport = findLatestDerivedGovernanceExport(
    getDerivedGovernanceSearchRoots(projectRoot),
    {
      fingerprintCombinedHash: buildDerivedGovernanceFingerprint(bundleRoot)['combined-hash'],
      bundleRootName: path.basename(bundleRoot)
    }
  );
  const latestDerivedExportSummary = latestDerivedExport
    ? describeDerivedGovernanceExport(projectRoot, {
      directory: latestDerivedExport.directory,
      manifestPath: latestDerivedExport.manifestPath,
      files: DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS.map((artifactId) => ({ path: DERIVED_GOVERNANCE_ARTIFACT_PATHS[artifactId] }))
    })
    : null;
  return {
    action: 'diagnose-host-evolution',
    status: payload.status,
    'runtime-root': projectRoot,
    'bundle-root': bundleRoot,
    capabilities: payload.capabilities,
    summary: payload.summary,
    'active-constraints': payload['active-constraints'],
    'pending-scaffolds': payload['pending-scaffolds'],
    'blocked-admissions': payload['blocked-admissions'],
    'host-writeability-debt': payload['host-writeability-debt'],
    'refresh-plan': refreshPlan,
    ...(payload.readiness ? { readiness: payload.readiness } : {}),
    ...(latestDerivedExportSummary ? { 'latest-derived-governance-export': latestDerivedExportSummary } : {}),
    follow_up: latestDerivedExportSummary
      ? uniqueSorted([
        ...payload.follow_up,
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js apply-derived-governance-export --latest'
      ])
      : payload.follow_up
  };
}

function exportDerivedGovernance(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const outputDir = path.resolve(options.outputDir || buildDefaultDerivedGovernanceExportDir(projectRoot));
  const result = writeDerivedGovernanceExport(outputDir, bundleRoot);
  const described = describeDerivedGovernanceExport(projectRoot, result);

  return {
    action: 'export-derived-governance',
    artifact: DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
    status: result.payload && result.payload.diagnosis
      ? result.payload.diagnosis.status
      : 'ready',
    'runtime-root': projectRoot,
    'bundle-root': bundleRoot,
    export: described,
    fingerprint: result.payload.fingerprint,
    summary: result.payload.diagnosis ? result.payload.diagnosis.summary : {},
    'refresh-plan': result.payload && result.payload.recovery
      ? result.payload.recovery['refresh-plan']
      : listDerivedGovernanceRefreshPlan(),
    follow_up: [
      `copy ${described.directory} to a writable distribution or install path that targets the same blocked bundle snapshot`,
      `node personal-skill-system/skills/tools/manage-skill/scripts/run.js apply-derived-governance-export ${described.directory}`,
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js diagnose-host-evolution',
      'npm run verify:skill-system'
    ]
  };
}

function refreshDerivedGovernance(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  const refreshPlan = listDerivedGovernanceRefreshPlan();
  try {
    const result = refreshDerivedGovernanceArtifacts(bundleRoot, {
      bestEffort: true
    });
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      const degraded = diagnoseHostEvolution(projectRoot);
      const degradedFiles = result.errors.map((item) => {
        const refreshStep = findDerivedGovernanceRefreshStepByArtifactId(item.id);
        return {
          artifact: item.id,
          file: toPortablePath(projectRoot, item.path),
          code: item.code || 'UNKNOWN',
          ...(refreshStep ? {
            'refresh-step': {
              id: refreshStep.id,
              order: refreshStep.order,
              label: refreshStep.label
            }
          } : {})
        };
      });
      return {
        action: 'refresh-derived-governance',
        status: 'degraded-host-blocked',
        'runtime-root': projectRoot,
        'bundle-root': bundleRoot,
        'refresh-plan': refreshPlan,
        refreshed: result.files.map((item) => {
          const refreshStep = findDerivedGovernanceRefreshStepByArtifactId(item.id);
          return {
            artifact: item.id,
            file: toPortablePath(projectRoot, item.path),
            ...(refreshStep ? {
              'refresh-step': {
                id: refreshStep.id,
                order: refreshStep.order,
                label: refreshStep.label
              }
            } : {})
          };
        }),
        error: {
          code: degradedFiles[0] && degradedFiles[0].code ? degradedFiles[0].code : 'UNKNOWN',
          message: `derived governance refresh completed with ${result.errors.length} blocked artifact(s)`
        },
        degraded_governance: degradedFiles,
        diagnosis: {
          status: degraded.status,
          capabilities: degraded.capabilities,
          summary: degraded.summary,
          'active-constraints': degraded['active-constraints']
        },
        follow_up: uniqueSorted([
          ...(Array.isArray(degraded.follow_up) ? degraded.follow_up : []),
          'node personal-skill-system/skills/tools/manage-skill/scripts/run.js export-derived-governance',
          'npm run verify:skill-system'
        ])
      };
    }
    return {
      action: 'refresh-derived-governance',
      status: 'refreshed',
      'runtime-root': projectRoot,
      'bundle-root': bundleRoot,
      'refresh-plan': refreshPlan,
      refreshed: result.files.map((item) => {
        const refreshStep = findDerivedGovernanceRefreshStepByArtifactId(item.id);
        return {
          artifact: item.id,
          file: toPortablePath(projectRoot, item.path),
          ...(refreshStep ? {
            'refresh-step': {
              id: refreshStep.id,
              order: refreshStep.order,
              label: refreshStep.label
            }
          } : {})
        };
      }),
      summary: {
        refreshed: result.files.length
      },
      follow_up: [
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    const degraded = diagnoseHostEvolution(projectRoot);
    const directDegradedFiles = collectGeneratedArtifactWriteability(bundleRoot)
      .filter((probe) => probe.ok !== true)
      .map((probe) => ({
        artifact: probe.id,
        file: toPortablePath(projectRoot, probe.path),
        code: probe.code || 'UNKNOWN',
        mode: probe.mode
      }));
    const derivedDegradedFiles = Array.isArray(degraded['active-constraints'])
      ? degraded['active-constraints']
          .filter((constraint) => normalizeString(constraint.id))
          .map((constraint) => ({
            artifact: normalizeString(constraint.id),
            file: normalizeString(constraint.path)
              ? `personal-skill-system/${normalizeString(constraint.path).replace(/\\/g, '/')}`
              : null,
            code: normalizeString(constraint.code) || 'UNKNOWN',
            mode: normalizeString(constraint.mode) || null
          }))
      : [];
    const degradedFiles = [];
    const seenDegraded = new Set();
    for (const item of [...directDegradedFiles, ...derivedDegradedFiles]) {
      const artifact = normalizeString(item && item.artifact);
      if (!artifact || seenDegraded.has(artifact)) {
        continue;
      }
      seenDegraded.add(artifact);
      degradedFiles.push(item);
    }
    return {
      action: 'refresh-derived-governance',
      status: 'degraded-host-blocked',
      'runtime-root': projectRoot,
      'bundle-root': bundleRoot,
      'refresh-plan': refreshPlan,
      error: {
        code: error && error.code ? error.code : 'UNKNOWN',
        message: error && error.message ? error.message : String(error)
      },
      degraded_governance: degradedFiles,
      diagnosis: {
        status: degraded.status,
        capabilities: degraded.capabilities,
        summary: degraded.summary,
        'active-constraints': degraded['active-constraints']
      },
      follow_up: uniqueSorted([
        ...(Array.isArray(degraded.follow_up) ? degraded.follow_up : []),
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js export-derived-governance',
        'npm run verify:skill-system'
      ])
    };
  }
}

function applyDerivedGovernanceExport(projectRoot, exportPath, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const currentFingerprint = buildDerivedGovernanceFingerprint(bundleRoot);
  let exportMeta = null;
  if (options.latest) {
    exportMeta = findLatestDerivedGovernanceExport(
      getDerivedGovernanceSearchRoots(projectRoot),
      {
        fingerprintCombinedHash: currentFingerprint['combined-hash'],
        bundleRootName: path.basename(bundleRoot)
      }
    );
    if (!exportMeta) {
      fail('apply-derived-governance-export --latest could not find a matching derived governance export for the current bundle snapshot');
    }
  } else {
    const normalized = normalizeString(exportPath);
    if (!normalized) {
      fail('apply-derived-governance-export requires <export-dir-or-manifest> or --latest');
    }
    exportMeta = readDerivedGovernanceExport(normalized);
  }
  const manifest = exportMeta.payload || {};

  if (manifest.artifact !== DERIVED_GOVERNANCE_EXPORT_ARTIFACT) {
    fail(`unsupported derived governance export artifact '${manifest.artifact || 'unknown'}'`);
  }
  if (manifest['schema-version'] !== DERIVED_GOVERNANCE_EXPORT_SCHEMA_VERSION) {
    fail(`unsupported derived governance export schema-version '${manifest['schema-version']}'`);
  }

  if ((manifest.fingerprint && manifest.fingerprint['combined-hash']) !== currentFingerprint['combined-hash']) {
    fail('derived governance export fingerprint does not match the current bundle snapshot');
  }

  assertGeneratedArtifactsWritable(projectRoot, 'apply derived governance export', {
    paths: DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS.map((artifactId) => path.join(bundleRoot, DERIVED_GOVERNANCE_ARTIFACT_PATHS[artifactId]))
  });

  const synced = [];
  for (const artifactId of DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS) {
    const relativePath = DERIVED_GOVERNANCE_ARTIFACT_PATHS[artifactId];
    const sourceFile = path.join(exportMeta.directory, relativePath);
    if (!fs.existsSync(sourceFile)) {
      fail(`derived governance export is missing '${relativePath}'`);
    }
    const targetFile = path.join(bundleRoot, relativePath);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
    synced.push({
      artifact: artifactId,
      file: toPortablePath(projectRoot, targetFile)
    });
  }

  return {
    action: 'apply-derived-governance-export',
    artifact: DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
    'runtime-root': projectRoot,
    'bundle-root': bundleRoot,
    source: toPortablePath(projectRoot, exportMeta.directory),
    ...(options.latest ? { selection: 'latest-matching-export' } : {}),
    synced,
    fingerprint: currentFingerprint,
    follow_up: [
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js diagnose-host-evolution',
      'npm run verify:skill-system'
    ]
  };
}

function materializePendingScaffold(projectRoot, skillOrPendingId) {
  const needle = normalizeString(skillOrPendingId);
  if (!needle) {
    fail('materialize-pending-scaffold requires <skill-name-or-pending-id>');
  }

  assertGeneratedArtifactsWritable(projectRoot, `materialize pending scaffold '${needle}'`, {
    paths: [
      getRegistryPath(projectRoot),
      getRouteMapPath(projectRoot),
      getRouteFixturesPath(projectRoot),
      getRatingsPath(projectRoot),
      getReviewQueueRegistryPath(projectRoot),
      getPendingScaffoldRegistryFilePath(projectRoot),
      getSkillOpportunityQueueRegistryPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getSkillInvestmentBacklogDocFilePath(projectRoot),
      getAdmissionLedgerPath(getBundleRoot(projectRoot))
    ]
  });

  const registry = readPendingScaffoldRegistry(projectRoot);
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const index = entries.findIndex((entry) =>
    normalizeString(entry['pending-id']) === needle || normalizeString(entry.skill) === needle
  );
  if (index === -1) {
    fail(`unknown pending scaffold '${needle}'`);
  }

  const entry = entries[index];
  const kind = normalizeString(entry.kind);
  const skillName = normalizeString(entry.skill);
  const governanceLinks = resolveCreateGovernanceLinks(projectRoot, {
    requestId: normalizeString(entry['request-id']) || null,
    opportunityId: normalizeString(entry['opportunity-id']) || null
  });
  const layer = VALID_KINDS.get(kind);
  if (!layer) {
    fail(`pending scaffold '${needle}' has unsupported kind '${kind}'`);
  }

  const targetDir = path.join(getAuthoritativeSkillsRoot(), layer, skillName);
  const skillFile = path.join(targetDir, 'SKILL.md');
  if (fs.existsSync(targetDir) && (fs.existsSync(skillFile) || directoryContainsFiles(targetDir))) {
    fail(`skill already exists at ${targetDir}`);
  }

  const createConstraint = getDirectoryCreateConstraint(projectRoot, targetDir, `materialize pending scaffold '${skillName}'`);
  if (createConstraint) {
    fail(createConstraint.message);
  }

  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  try {
    materializeScaffoldPlan(targetDir, {
      files: Array.isArray(entry.files) ? entry.files : []
    });
    const syncResult = syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, {
      createPlaceholderRoute: entry['create-placeholder-route'] === true,
      capabilityModules: Array.isArray(entry['capability-modules']) ? entry['capability-modules'] : [],
      shared: isPlainObject(entry.shared) ? entry.shared : null,
      requestId: governanceLinks.requestId,
      opportunityId: governanceLinks.opportunityId
    });

    registry.entries = entries.filter((_, currentIndex) => currentIndex !== index);
    writePendingScaffoldRegistry(projectRoot, registry);
    const reviewQueue = refreshReviewQueue(projectRoot);
    refreshSkillInvestmentBacklog(projectRoot, {
      reviewQueueData: reviewQueue.payload,
      pendingScaffoldData: registry
    });
    const finalReadiness = refreshSystemReadiness(projectRoot, { bestEffort: true, returnDetails: true });
    const degradedReadiness = finalReadiness && finalReadiness.ok === false
      ? finalReadiness
      : syncResult && syncResult.readiness && syncResult.readiness.ok === false
        ? syncResult.readiness
        : null;

    return {
      action: 'materialize-pending-scaffold',
      skill: skillName,
      kind,
      path: path.relative(projectRoot, targetDir).split(path.sep).join('/'),
      'pending-scaffold-id': normalizeString(entry['pending-id']),
      ...(governanceLinks.requestId ? { 'admission-request-id': governanceLinks.requestId } : {}),
      ...(governanceLinks.opportunityId ? { 'opportunity-id': governanceLinks.opportunityId } : {}),
      ...(Array.isArray(entry['capability-modules']) && entry['capability-modules'].length > 0
        ? { 'scaffolded-capability-modules': entry['capability-modules'].map((module) => module.id) }
        : {}),
      ...(degradedReadiness
        ? {
            degraded_governance: {
              'system-readiness': degradedReadiness
            }
          }
        : {}),
      follow_up: ['npm run verify:skills', 'npm run verify:skill-system']
    };
  } catch (error) {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function syncScaffoldLineage(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillRecords = collectAllSkillRecords(projectRoot);
  const skillsRoot = getAuthoritativeSkillsRoot();
  const selected = [];

  for (const record of skillRecords) {
    if (options.skillName && record.name !== options.skillName) {
      continue;
    }
    if (!shouldTrackScaffoldLineage(record.kind)) {
      continue;
    }

    const templateLineage = readTemplateLineage(bundleRoot, record.kind);
    if (!templateLineage) {
      continue;
    }

    const resolved = resolveSkillDirByName(skillsRoot, record.name);
    if (!resolved) {
      fail(`unknown skill '${record.name}' while syncing scaffold lineage`);
    }

    selected.push({
      record,
      resolved,
      templateLineage
    });
  }

  if (selected.length < 1) {
    if (options.skillName) {
      fail(`no canonical scaffold lineage found for skill '${options.skillName}'`);
    }
    return {
      action: 'sync-scaffold-lineage',
      scope: 'all',
      synced: [],
      unchanged: [],
      follow_up: ['npm run verify:skills', 'npm run verify:skill-system']
    };
  }

  const changed = [];
  const unchanged = [];
  const previousFiles = [];

  try {
    for (const item of selected) {
      const currentOrigin = String(item.resolved.parsed.map.get(SCAFFOLD_ORIGIN_FIELD) || '').trim();
      const currentVersion = parseInteger(item.resolved.parsed.map.get(SCAFFOLD_VERSION_FIELD), null);
      const nextOrigin = item.templateLineage.origin;
      const nextVersion = item.templateLineage.version;

      if (currentOrigin === nextOrigin && currentVersion === nextVersion) {
        unchanged.push(item.record.name);
        continue;
      }

      previousFiles.push({
        file: item.resolved.skillFile,
        text: fs.readFileSync(item.resolved.skillFile, 'utf8')
      });

      item.resolved.parsed.map.set(SCAFFOLD_ORIGIN_FIELD, nextOrigin);
      item.resolved.parsed.map.set(SCAFFOLD_VERSION_FIELD, String(nextVersion));
      fs.writeFileSync(item.resolved.skillFile, renderSkillFile(item.resolved.parsed), 'utf8');

      changed.push({
        skill: item.record.name,
        path: toPortablePath(projectRoot, item.resolved.skillFile),
        previous: {
          origin: currentOrigin || null,
          version: currentVersion
        },
        current: {
          origin: nextOrigin,
          version: nextVersion
        }
      });
    }
  } catch (error) {
    for (const previous of previousFiles.reverse()) {
      fs.writeFileSync(previous.file, previous.text, 'utf8');
    }
    throw error;
  }

  return {
    action: 'sync-scaffold-lineage',
    scope: options.skillName ? 'single' : 'all',
    ...(options.skillName ? { skill: options.skillName } : {}),
    synced: changed,
    unchanged,
    follow_up: ['npm run verify:skills', 'npm run verify:skill-system']
  };
}

function showSkill(skillName) {
  const projectRoot = getProjectRoot();
  const skillsRoot = getAuthoritativeSkillsRoot();
  const resolved = resolveSkillDirByName(skillsRoot, skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);

  return {
    action: 'show',
    skill: skillName,
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    frontmatter: Object.fromEntries(resolved.parsed.map.entries()),
  };
}

function showAdmissionLedger(projectRoot, options = {}) {
  const ledger = readAdmissionLedger(projectRoot);
  const statusFilter = String(options.status || '').trim();
  const skillFilter = String(options.skill || '').trim();
  const requestIdFilter = String(options.requestId || '').trim();

  let entries = ledger.entries;
  if (requestIdFilter) {
    entries = entries.filter((entry) => entry['request-id'] === requestIdFilter);
  }
  if (statusFilter) {
    entries = entries.filter((entry) => entry.status === statusFilter);
  }
  if (skillFilter) {
    entries = entries.filter((entry) =>
      entry['created-skill'] === skillFilter
      || entry.decision.target_skill === skillFilter
      || entry.decision.primary_skill === skillFilter
      || entry.decision.competing_skill === skillFilter
    );
  }

  return {
    action: 'show-admission-ledger',
    summary: ledger.summary || {},
    total: ledger.entries.length,
    returned: entries.length,
    entries
  };
}

function showOpportunityQueue(projectRoot, options = {}) {
  const queue = readOpportunityQueue(projectRoot);
  const statusFilter = normalizeString(options.status);
  const priorityFilter = normalizeString(options.priority);
  const kindFilter = normalizeString(options.kind);
  const horizonFilter = normalizeString(options.horizon);
  const opportunityIdFilter = normalizeString(options.opportunityId);

  let entries = queue.entries;
  if (opportunityIdFilter) {
    entries = entries.filter((entry) => entry['opportunity-id'] === opportunityIdFilter);
  }
  if (statusFilter) {
    entries = entries.filter((entry) => normalizeString(entry.status) === statusFilter);
  }
  if (priorityFilter) {
    entries = entries.filter((entry) => normalizeString(entry.priority) === priorityFilter);
  }
  if (kindFilter) {
    entries = entries.filter((entry) => normalizeString(entry['suggested-kind']) === kindFilter);
  }
  if (horizonFilter) {
    entries = entries.filter((entry) => normalizeString(entry.horizon) === horizonFilter);
  }

  return {
    action: 'show-opportunity-queue',
    summary: queue.summary || {},
    total: queue.entries.length,
    returned: entries.length,
    entries
  };
}

function showReviewQueue(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const read = readReviewQueue(bundleRoot);
  if (read.error) {
    fail(`review queue is unreadable or invalid: ${read.error}`);
  }

  const statusFilter = String(options.status || '').trim();
  const priorityFilter = String(options.priority || '').trim();
  const skillFilter = String(options.skill || '').trim();
  const ownerFilter = String(options.owner || '').trim();
  const overdueOnly = options.overdueOnly === true;

  let entries = Array.isArray(read.data && read.data.skills) ? read.data.skills : [];
  if (skillFilter) {
    entries = entries.filter((entry) => entry.skill === skillFilter);
  }
  if (statusFilter) {
    entries = entries.filter((entry) => entry['review-status'] === statusFilter);
  }
  if (priorityFilter) {
    entries = entries.filter((entry) => entry.priority === priorityFilter);
  }
  if (ownerFilter) {
    entries = entries.filter((entry) => String(entry.owner || '').trim() === ownerFilter);
  }
  if (overdueOnly) {
    entries = entries.filter((entry) => entry['review-status'] === 'overdue');
  }

  return {
    action: 'show-review-queue',
    summary: read.data.summary || {},
    total: Array.isArray(read.data && read.data.skills) ? read.data.skills.length : 0,
    returned: entries.length,
    entries
  };
}

function showExpertSourceFamilies(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const registryData = readGovernedRegistry(projectRoot);
  const integrations = summarizeExpertSourceIntegrations(bundleRoot, registryData);
  const familyScorecard = buildExpertSourceFamilyScorecard(bundleRoot, registryData, { integrations });
  const familyFilter = normalizeString(options.family);
  const sourceFilter = normalizeString(options.source);
  const parseErrorsOnly = options.parseErrorsOnly === true;
  const unmappedOnly = options.unmappedOnly === true;
  const staleOnly = options.staleOnly === true;

  let families = Array.isArray(integrations.families) ? integrations.families : [];
  if (familyFilter) {
    families = families.filter((entry) => normalizeString(entry && entry.family && entry.family.id) === familyFilter);
  }
  if (sourceFilter) {
    families = families.filter((entry) => normalizeString(entry && entry.family && entry.family.source) === sourceFilter);
  }
  if (parseErrorsOnly) {
    families = families.filter((entry) => normalizeString(entry && entry.parseError));
  }
  if (unmappedOnly) {
    families = families.filter((entry) => Array.isArray(entry && entry.unmappedRawSources) && entry.unmappedRawSources.length > 0);
  }
  if (staleOnly) {
    families = families.filter((entry) => Array.isArray(entry && entry.staleMappedSources) && entry.staleMappedSources.length > 0);
  }

  return {
    action: 'show-expert-source-families',
    registry: path.relative(projectRoot, integrations.familiesFile).split(path.sep).join('/'),
    scorecard: path.relative(projectRoot, getExpertSourceFamilyScorecardRegistryPath(projectRoot)).split(path.sep).join('/'),
    summary: familyScorecard.summary || {},
    totals: integrations.totals || {},
    total: Array.isArray(integrations.families) ? integrations.families.length : 0,
    returned: families.length,
    families: families.map((entry) => ({
      id: normalizeString(entry && entry.family && entry.family.id),
      title: normalizeString(entry && entry.family && entry.family.title),
      source: normalizeString(entry && entry.family && entry.family.source),
      label: normalizeString(entry && entry.family && entry.family.label),
      status: normalizeExpertSourceFamilyStatus(entry && entry.family && entry.family.status),
      integrationFile: normalizeString(entry && entry.family && entry.family.integrationFile),
      rawRoot: normalizeString(entry && entry.family && entry.family.rawRoot),
      expectedPortable: entry && entry.family ? entry.family.expectedPortable !== false : true,
      parseError: normalizeOptionalCliValue(entry && entry.parseError),
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
      staleMappedSources: Array.isArray(entry && entry.staleMappedSources) ? entry.staleMappedSources : []
    }))
  };
}

function ensureManifestIncludes(manifest, includePath) {
  const includes = Array.isArray(manifest && manifest.includes) ? [...manifest.includes] : [];
  if (!includes.includes(includePath)) {
    includes.push(includePath);
    includes.sort((left, right) => left.localeCompare(right));
  }
  return {
    ...(manifest || {}),
    includes
  };
}

function ensureManifestExcludes(manifest, includePath) {
  const includes = Array.isArray(manifest && manifest.includes)
    ? manifest.includes.filter((item) => item !== includePath)
    : [];
  return {
    ...(manifest || {}),
    includes
  };
}

function getExpertSourceFamilyById(familiesDoc, familyId) {
  const entries = Array.isArray(familiesDoc && familiesDoc.families) ? familiesDoc.families : [];
  return entries.find((entry) => normalizeString(entry && entry.id) === normalizeString(familyId)) || null;
}

function getExpertSourceFamilyFollowUp(rawRoot) {
  return [
    `review ${path.basename(rawRoot)}/%s/SKILL.md and decide extract-vs-admit`
  ];
}

function buildExpertSourceFamilyConfig(familyId, options = {}) {
  const title = normalizeString(options.title) || familyId.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  const source = normalizeString(options.source) || `${familyId}-integration`;
  const integrationFile = normalizeString(options.integrationFile) || getDefaultExpertSourceIntegrationFile(familyId);
  const rawRoot = normalizeString(options.rawRoot) || getDefaultExpertSourceRawRoot(familyId);
  const rawSourceLabel = normalizeString(options.rawSourceLabel) || `raw ${title.toLowerCase()} source`;
  const label = normalizeString(options.label) || `${title.toLowerCase()} integration`;
  const expectedPortable = options.expectedPortable !== false;
  const status = normalizeExpertSourceFamilyStatus(options.status, 'active');
  return createExpertSourceFamily({
    id: familyId,
    title,
    source,
    label,
    rawSourceLabel,
    integrationFile,
    rawRoot,
    status,
    schemaVersion: EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
    integrationMode: EXPERT_SOURCE_INTEGRATION_MODE,
    expectedPortable,
    parseErrorSummary: `Repair ${label} registry before the next expert-source extraction.`,
    unmappedSummaryTemplate: `Integrate raw ${title.toLowerCase()} source '%s' into governed capability modules.`,
    unmappedReason: 'exists outside governed integration coverage',
    staleReason: `is still mapped by ${source} but the raw source is missing locally`,
    sourceDescription: `${integrationFile} + ${rawRoot}/**/SKILL.md when present`,
    backlogFollowUp: getExpertSourceFamilyFollowUp(rawRoot)
  });
}

function registerExpertSourceFamily(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const familyId = normalizeString(options.familyId || options.id);
  if (!familyId) {
    fail('register-expert-source-family requires --family-id <slug>');
  }
  if (!isValidExpertSourceFamilyId(familyId)) {
    fail(`expert-source family id '${familyId}' must use lowercase letters, digits, and hyphens only`);
  }

  const familyConfig = buildExpertSourceFamilyConfig(familyId, options);
  const title = familyConfig.title;
  const source = familyConfig.source;
  const integrationFile = familyConfig.integrationFile;
  const rawRoot = familyConfig.rawRoot;
  const expectedPortable = familyConfig.expectedPortable !== false;
  const createRawRoot = options.createRawRoot === true;
  const includeInExperimentalPack = options.includeInExperimentalPack !== false;

  const familiesPath = getExpertSourceFamiliesRegistryPath(projectRoot);
  const integrationPath = path.join(bundleRoot, integrationFile);
  const experimentalManifestPath = getExperimentalPackManifestPath(projectRoot);

  const requiredPaths = [
    familiesPath,
    getExpertSourceFamilyScorecardRegistryPath(projectRoot),
    getSkillInvestmentBacklogRegistryPath(projectRoot),
    getSkillInvestmentBacklogDocFilePath(projectRoot)
  ];
  const optionalPaths = [path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json')];
  if (includeInExperimentalPack) {
    requiredPaths.push(experimentalManifestPath);
  }
  if (fs.existsSync(integrationPath)) {
    requiredPaths.push(integrationPath);
  }

  assertGeneratedArtifactsWritable(projectRoot, `register expert-source family '${familyId}'`, {
    paths: requiredPaths,
    optionalPaths
  });

  if (createRawRoot) {
    assertDirectoryCreatable(path.resolve(bundleRoot, rawRoot), `create raw source root for '${familyId}'`);
  }

  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  const previousFamiliesRaw = fs.existsSync(familiesPath) ? readJsonSafe(familiesPath) : null;
  const previousIntegrationExists = fs.existsSync(integrationPath);
  const previousIntegrationRaw = previousIntegrationExists ? readJsonSafe(integrationPath) : null;
  const previousExperimentalManifest = fs.existsSync(experimentalManifestPath) ? readJsonSafe(experimentalManifestPath) : null;
  const rawRootPath = path.resolve(bundleRoot, rawRoot);

  try {
    const familiesDoc = normalizeExpertSourceFamiliesDocument(previousFamiliesRaw || {});
    if ((familiesDoc.families || []).some((entry) => entry.id === familyId)) {
      fail(`expert-source family '${familyId}' is already registered`);
    }
    if ((familiesDoc.families || []).some((entry) => entry.source === source)) {
      fail(`expert-source source '${source}' is already registered`);
    }
    if ((familiesDoc.families || []).some((entry) => entry.integrationFile === integrationFile)) {
      fail(`expert-source integration file '${integrationFile}' is already registered`);
    }

    familiesDoc.families.push({
      ...familyConfig
    });
    writeJson(familiesPath, normalizeExpertSourceFamiliesDocument(familiesDoc));

    if (!previousIntegrationExists) {
      writeJson(integrationPath, buildEmptyExpertSourceIntegration({
        schemaVersion: EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
        integrationMode: EXPERT_SOURCE_INTEGRATION_MODE,
        expectedPortable
      }));
    }

    if (includeInExperimentalPack) {
      if (!previousExperimentalManifest) {
        fail(`experimental pack manifest is unreadable or missing: ${experimentalManifestPath}`);
      }
      const nextManifest = syncExperimentalPackManifest(previousExperimentalManifest, familiesDoc.families);
      writeJson(experimentalManifestPath, nextManifest);
    }

    if (createRawRoot && !fs.existsSync(rawRootPath)) {
      fs.mkdirSync(rawRootPath, { recursive: true });
    }

    refreshSkillInvestmentBacklog(projectRoot);
    const familyScorecard = refreshExpertSourceFamilyScorecard(projectRoot);
    refreshSystemReadiness(projectRoot, {
      bestEffort: true,
      context: {
        expertSourceFamilyScorecard: familyScorecard.payload,
        registryData: readGovernedRegistry(projectRoot)
      }
    });

    return {
      action: 'register-expert-source-family',
      family: familyId,
      source,
      integrationFile,
      rawRoot,
      created: {
        familyRegistry: path.relative(projectRoot, familiesPath).split(path.sep).join('/'),
        integrationRegistry: path.relative(projectRoot, integrationPath).split(path.sep).join('/'),
        ...(createRawRoot ? { rawSourceRoot: path.relative(projectRoot, rawRootPath).split(path.sep).join('/') } : {})
      },
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-expert-source-families --family ${familyId}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source ${source}`,
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    if (previousFamiliesRaw) {
      writeJson(familiesPath, previousFamiliesRaw);
    }
    if (previousIntegrationExists) {
      writeJson(integrationPath, previousIntegrationRaw);
    } else if (fs.existsSync(integrationPath)) {
      fs.rmSync(integrationPath, { force: true });
    }
    if (includeInExperimentalPack && previousExperimentalManifest) {
      writeJson(experimentalManifestPath, previousExperimentalManifest);
    }
    if (createRawRoot && fs.existsSync(rawRootPath) && fs.readdirSync(rawRootPath).length === 0) {
      fs.rmSync(rawRootPath, { recursive: true, force: true });
    }
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function updateExpertSourceFamily(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const familyId = normalizeString(options.familyId || options.id);
  if (!familyId) {
    fail('update-expert-source-family requires --family-id <slug>');
  }

  const familiesPath = getExpertSourceFamiliesRegistryPath(projectRoot);
  const experimentalManifestPath = getExperimentalPackManifestPath(projectRoot);
  const previousFamiliesRaw = fs.existsSync(familiesPath) ? readJsonSafe(familiesPath) : null;
  const familiesDoc = normalizeExpertSourceFamiliesDocument(previousFamiliesRaw || {});
  const currentFamily = getExpertSourceFamilyById(familiesDoc, familyId);
  if (!currentFamily) {
    fail(`unknown expert-source family '${familyId}'`);
  }
  if (options.status && !canArchiveExpertSourceFamily(currentFamily)) {
    const requestedStatus = normalizeExpertSourceFamilyStatus(options.status, currentFamily.status);
    if (requestedStatus === 'archived') {
      fail(`cannot archive default expert-source family '${familyId}'`);
    }
  }

  const nextFamily = buildExpertSourceFamilyConfig(familyId, {
    title: options.title != null ? options.title : currentFamily.title,
    source: options.source != null ? options.source : currentFamily.source,
    integrationFile: options.integrationFile != null ? options.integrationFile : currentFamily.integrationFile,
    rawRoot: options.rawRoot != null ? options.rawRoot : currentFamily.rawRoot,
    rawSourceLabel: options.rawSourceLabel != null ? options.rawSourceLabel : currentFamily.rawSourceLabel,
    label: options.label != null ? options.label : currentFamily.label,
    expectedPortable: options.expectedPortable != null ? options.expectedPortable : currentFamily.expectedPortable,
    status: options.status != null ? options.status : currentFamily.status
  });

  const currentIntegrationPath = path.join(bundleRoot, normalizeString(currentFamily.integrationFile));
  const nextIntegrationPath = path.join(bundleRoot, normalizeString(nextFamily.integrationFile));
  const integrationPathChanged = path.resolve(currentIntegrationPath) !== path.resolve(nextIntegrationPath);
  const sourceChanged = normalizeString(currentFamily.source) !== normalizeString(nextFamily.source);
  const rawRootChanged = normalizeString(currentFamily.rawRoot) !== normalizeString(nextFamily.rawRoot);
  const wasActive = isActiveExpertSourceFamily(currentFamily);
  const isActive = isActiveExpertSourceFamily(nextFamily);

  const requiredPaths = [
    familiesPath,
    getExpertSourceFamilyScorecardRegistryPath(projectRoot),
    getSkillInvestmentBacklogRegistryPath(projectRoot),
    getSkillInvestmentBacklogDocFilePath(projectRoot)
  ];
  const optionalPaths = [path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json')];
  if (fs.existsSync(experimentalManifestPath)) {
    requiredPaths.push(experimentalManifestPath);
  }
  if (fs.existsSync(currentIntegrationPath)) {
    requiredPaths.push(currentIntegrationPath);
  }
  if (integrationPathChanged && fs.existsSync(nextIntegrationPath)) {
    requiredPaths.push(nextIntegrationPath);
  }

  assertGeneratedArtifactsWritable(projectRoot, `update expert-source family '${familyId}'`, {
    paths: requiredPaths,
    optionalPaths
  });

  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  const previousExperimentalManifest = fs.existsSync(experimentalManifestPath) ? readJsonSafe(experimentalManifestPath) : null;
  const previousCurrentIntegrationExists = fs.existsSync(currentIntegrationPath);
  const previousCurrentIntegrationRaw = previousCurrentIntegrationExists ? readJsonSafe(currentIntegrationPath) : null;
  const previousNextIntegrationExists = integrationPathChanged && fs.existsSync(nextIntegrationPath);
  const previousNextIntegrationRaw = previousNextIntegrationExists ? readJsonSafe(nextIntegrationPath) : null;

  try {
    const duplicateSource = (familiesDoc.families || []).some((entry) =>
      normalizeString(entry.id) !== familyId && normalizeString(entry.source) === normalizeString(nextFamily.source)
    );
    if (duplicateSource) {
      fail(`expert-source source '${nextFamily.source}' is already registered`);
    }
    const duplicateIntegration = (familiesDoc.families || []).some((entry) =>
      normalizeString(entry.id) !== familyId && normalizeString(entry.integrationFile) === normalizeString(nextFamily.integrationFile)
    );
    if (duplicateIntegration) {
      fail(`expert-source integration file '${nextFamily.integrationFile}' is already registered`);
    }

    familiesDoc.families = (familiesDoc.families || []).map((entry) =>
      normalizeString(entry && entry.id) === familyId ? { ...nextFamily } : entry
    );
    writeJson(familiesPath, normalizeExpertSourceFamiliesDocument(familiesDoc));

    if (integrationPathChanged) {
      if (!previousCurrentIntegrationExists) {
        fail(`cannot move missing expert-source integration file '${currentFamily.integrationFile}'`);
      }
      if (previousNextIntegrationExists) {
        fail(`target expert-source integration file '${nextFamily.integrationFile}' already exists`);
      }
      fs.renameSync(currentIntegrationPath, nextIntegrationPath);
    } else if (!previousCurrentIntegrationExists) {
      writeJson(currentIntegrationPath, buildEmptyExpertSourceIntegration(nextFamily));
    }

    if (previousExperimentalManifest) {
      const nextManifest = syncExperimentalPackManifest(previousExperimentalManifest, familiesDoc.families);
      writeJson(experimentalManifestPath, nextManifest);
    }

    refreshSkillInvestmentBacklog(projectRoot);
    const familyScorecard = refreshExpertSourceFamilyScorecard(projectRoot);
    refreshSystemReadiness(projectRoot, {
      bestEffort: true,
      context: {
        expertSourceFamilyScorecard: familyScorecard.payload,
        registryData: readGovernedRegistry(projectRoot)
      }
    });

    return {
      action: 'update-expert-source-family',
      family: familyId,
      source: nextFamily.source,
      integrationFile: nextFamily.integrationFile,
      rawRoot: nextFamily.rawRoot,
      status: nextFamily.status,
      changed: {
        ...(sourceChanged ? { source: { from: currentFamily.source, to: nextFamily.source } } : {}),
        ...(integrationPathChanged ? { integrationFile: { from: currentFamily.integrationFile, to: nextFamily.integrationFile } } : {}),
        ...(rawRootChanged ? { rawRoot: { from: currentFamily.rawRoot, to: nextFamily.rawRoot } } : {}),
        ...(normalizeString(currentFamily.title) !== normalizeString(nextFamily.title) ? { title: { from: currentFamily.title, to: nextFamily.title } } : {}),
        ...(normalizeString(currentFamily.label) !== normalizeString(nextFamily.label) ? { label: { from: currentFamily.label, to: nextFamily.label } } : {}),
        ...(normalizeString(currentFamily.rawSourceLabel) !== normalizeString(nextFamily.rawSourceLabel) ? { rawSourceLabel: { from: currentFamily.rawSourceLabel, to: nextFamily.rawSourceLabel } } : {}),
        ...(normalizeExpertSourceFamilyStatus(currentFamily.status) !== normalizeExpertSourceFamilyStatus(nextFamily.status)
          ? { status: { from: normalizeExpertSourceFamilyStatus(currentFamily.status), to: normalizeExpertSourceFamilyStatus(nextFamily.status) } }
          : {})
      },
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-expert-source-families --family ${familyId}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source ${nextFamily.source}`,
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    if (previousFamiliesRaw) {
      writeJson(familiesPath, previousFamiliesRaw);
    }
    if (integrationPathChanged) {
      if (fs.existsSync(nextIntegrationPath) && !previousNextIntegrationExists) {
        fs.renameSync(nextIntegrationPath, currentIntegrationPath);
      } else if (previousCurrentIntegrationExists && previousCurrentIntegrationRaw) {
        writeJson(currentIntegrationPath, previousCurrentIntegrationRaw);
      }
      if (previousNextIntegrationExists && previousNextIntegrationRaw) {
        writeJson(nextIntegrationPath, previousNextIntegrationRaw);
      } else if (integrationPathChanged && fs.existsSync(nextIntegrationPath) && !previousNextIntegrationExists) {
        fs.rmSync(nextIntegrationPath, { force: true });
      }
    } else if (previousCurrentIntegrationExists && previousCurrentIntegrationRaw) {
      writeJson(currentIntegrationPath, previousCurrentIntegrationRaw);
    } else if (!previousCurrentIntegrationExists && fs.existsSync(currentIntegrationPath)) {
      fs.rmSync(currentIntegrationPath, { force: true });
    }
    if (previousExperimentalManifest) {
      writeJson(experimentalManifestPath, previousExperimentalManifest);
    }
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function archiveExpertSourceFamily(projectRoot, familyId, options = {}) {
  const normalizedId = normalizeString(familyId);
  if (!normalizedId) {
    fail('archive-expert-source-family requires <family-id>');
  }
  return updateExpertSourceFamily(projectRoot, {
    familyId: normalizedId,
    status: 'archived',
    ...options
  });
}

function restoreExpertSourceFamily(projectRoot, familyId, options = {}) {
  const normalizedId = normalizeString(familyId);
  if (!normalizedId) {
    fail('restore-expert-source-family requires <family-id>');
  }
  return updateExpertSourceFamily(projectRoot, {
    familyId: normalizedId,
    status: 'active',
    ...options
  });
}

function showSkillInvestmentBacklog(projectRoot, options = {}) {
  const payload = buildCurrentSkillInvestmentBacklog(projectRoot);

  const statusFilter = normalizeString(options.status);
  const priorityFilter = normalizeString(options.priority);
  const categoryFilter = normalizeString(options.category);
  const sourceFilter = normalizeString(options.source);
  const skillFilter = normalizeString(options.skill);

  let items = Array.isArray(payload.items) ? payload.items : [];
  if (statusFilter) {
    items = items.filter((item) => normalizeString(item.status) === statusFilter);
  }
  if (priorityFilter) {
    items = items.filter((item) => normalizeString(item.priority) === priorityFilter);
  }
  if (categoryFilter) {
    items = items.filter((item) => normalizeString(item.category) === categoryFilter);
  }
  if (sourceFilter) {
    items = items.filter((item) => normalizeString(item.source) === sourceFilter);
  }
  if (skillFilter) {
    items = items.filter((item) => normalizeString(item.skill) === skillFilter);
  }

  return {
    action: 'show-investment-backlog',
    summary: payload.summary || {},
    total: Array.isArray(payload.items) ? payload.items.length : 0,
    returned: items.length,
    items
  };
}

function showLifecycleGovernance(projectRoot, options = {}) {
  const skillRecords = collectAllSkillRecords(projectRoot);
  const statusFilter = normalizeString(options.status);
  const kindFilter = normalizeString(options.kind);
  const skillFilter = normalizeString(options.skill);
  const includeStable = options.includeStable === true;

  const entries = skillRecords
    .filter((record) => record && (includeStable ? true : record.status !== 'stable'))
    .map((record) => {
      const assessment = assessSingleTopTierReadiness(projectRoot, record.name);
      const activeRoute = hasActiveRouteEntry(projectRoot, record.name);
      const moduleRatings = getCapabilityModuleRatingsForSkill(projectRoot, record.name);
      const lifecycleClass = record.status === 'stable'
        ? 'stable'
        : (assessment.ready ? 'promotion-ready' : 'needs-hardening');
      const nextAction = record.status === 'stable'
        ? 'keep-stable'
        : (assessment.ready ? 'promote-to-stable' : 'harden-current-skill');

      return {
        skill: record.name,
        kind: record.kind,
        status: record.status,
        'lifecycle-class': lifecycleClass,
        'target-status': assessment['target-status'],
        'active-route': activeRoute,
        'top-tier-ready': assessment.ready,
        priority: assessment.priority,
        'blocker-count': assessment['blocker-count'],
        'blocker-categories': assessment['blocker-categories'],
        'capability-modules': moduleRatings,
        'next-action': nextAction,
        follow_up: dedupeStrings([
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`,
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${record.name}`,
          record.status !== 'stable'
            ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint ${record.name}`
            : '',
          assessment.ready && record.status !== 'stable'
            ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status ${record.name} stable`
            : '',
          !assessment.ready && record.status !== 'stable'
            ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check ${record.name} "promote this active skill into the governed stable surface when it is honestly ready"`
            : ''
        ])
      };
    });

  let filtered = entries;
  if (statusFilter) {
    filtered = filtered.filter((entry) => normalizeString(entry.status) === statusFilter);
  }
  if (kindFilter) {
    filtered = filtered.filter((entry) => normalizeString(entry.kind) === kindFilter);
  }
  if (skillFilter) {
    filtered = filtered.filter((entry) => normalizeString(entry.skill) === skillFilter);
  }

  filtered.sort((left, right) => {
    const leftPriority = String(left.priority || '');
    const rightPriority = String(right.priority || '');
    const leftScore = leftPriority === 'critical' ? 3 : leftPriority === 'high' ? 2 : leftPriority === 'normal' ? 1 : 0;
    const rightScore = rightPriority === 'critical' ? 3 : rightPriority === 'high' ? 2 : rightPriority === 'normal' ? 1 : 0;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    const leftReady = left['top-tier-ready'] === true ? 1 : 0;
    const rightReady = right['top-tier-ready'] === true ? 1 : 0;
    if (leftReady !== rightReady) {
      return leftReady - rightReady;
    }
    return normalizeString(left.skill).localeCompare(normalizeString(right.skill));
  });

  const scopedEntries = skillRecords.filter((record) => record && (includeStable ? true : record.status !== 'stable'));
  const summary = {
    total: scopedEntries.length,
    returned: filtered.length,
    stable: scopedEntries.filter((record) => record.status === 'stable').length,
    experimental: scopedEntries.filter((record) => record.status === 'experimental').length,
    deprecated: scopedEntries.filter((record) => record.status === 'deprecated').length,
    draft: scopedEntries.filter((record) => record.status === 'draft').length,
    archived: scopedEntries.filter((record) => record.status === 'archived').length,
    'promotion-ready': filtered.filter((entry) => entry['lifecycle-class'] === 'promotion-ready').length,
    'needs-hardening': filtered.filter((entry) => entry['lifecycle-class'] === 'needs-hardening').length
  };

  return {
    action: 'show-lifecycle-governance',
    summary,
    returned: filtered.length,
    entries: filtered,
    follow_up: [
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source authoritative-skills',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier --all',
      'npm run verify:skill-system'
    ]
  };
}

function showScaffoldGovernance(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillRecords = collectAllSkillRecords(projectRoot);
  const templateRecords = collectTemplateRecords(bundleRoot, []);
  const kindFilter = normalizeString(options.kind);
  const skillFilter = normalizeString(options.skill);
  const statusFilter = normalizeString(options.status);
  const includeHealthy = options.includeHealthy === true;

  let templates = templateRecords.map((record) => ({
    kind: record.kind,
    name: record.name,
    status: record.status,
    file: record.file,
    'template-version': record['template-version'],
    'review-status': record['review-status'],
    'next-review-due': record['next-review-due'],
    healthy: ['current', 'due-soon'].includes(normalizeString(record['review-status']))
  }));

  if (kindFilter) {
    templates = templates.filter((record) => normalizeString(record.kind) === kindFilter);
  }
  if (statusFilter) {
    templates = templates.filter((record) => normalizeString(record['review-status']) === statusFilter);
  }
  if (!includeHealthy) {
    templates = templates.filter((record) => record.healthy !== true);
  }

  let skills = skillRecords
    .filter((record) => shouldTrackScaffoldLineage(record.kind))
    .map((record) => {
      const currentVersion = Number.isInteger(record.scaffoldVersion) ? record.scaffoldVersion : null;
      const canonicalVersion = Number.isInteger(record.canonicalScaffoldVersion) ? record.canonicalScaffoldVersion : null;
      let driftStatus = 'current';
      if (!record.scaffoldOrigin || currentVersion == null) {
        driftStatus = 'missing-lineage';
      } else if (record.canonicalScaffoldOrigin && record.scaffoldOrigin !== record.canonicalScaffoldOrigin) {
        driftStatus = 'origin-mismatch';
      } else if (canonicalVersion != null && currentVersion < canonicalVersion) {
        driftStatus = 'behind-template';
      } else if (canonicalVersion != null && currentVersion > canonicalVersion) {
        driftStatus = 'ahead-of-template';
      }

      return {
        skill: record.name,
        kind: record.kind,
        status: record.status,
        file: record.file,
        'scaffold-origin': record.scaffoldOrigin,
        'scaffold-version': currentVersion,
        'canonical-origin': record.canonicalScaffoldOrigin,
        'canonical-version': canonicalVersion,
        'drift-status': driftStatus,
        follow_up: driftStatus === 'current'
          ? [
              `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
            ]
          : [
              `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-scaffold-upgrade-blueprint --name ${record.name}`,
              `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
            ]
      };
    });

  if (kindFilter) {
    skills = skills.filter((record) => normalizeString(record.kind) === kindFilter);
  }
  if (skillFilter) {
    skills = skills.filter((record) => normalizeString(record.skill) === skillFilter);
  }
  if (statusFilter) {
    skills = skills.filter((record) => normalizeString(record['drift-status']) === statusFilter);
  }
  if (!includeHealthy) {
    skills = skills.filter((record) => normalizeString(record['drift-status']) !== 'current');
  }

  const summary = {
    templates: {
      total: templateRecords.filter((record) => !kindFilter || normalizeString(record.kind) === kindFilter).length,
      returned: templates.length,
      overdue: templateRecords.filter((record) => (!kindFilter || normalizeString(record.kind) === kindFilter) && normalizeString(record['review-status']) === 'overdue').length,
      'missing-metadata': templateRecords.filter((record) => (!kindFilter || normalizeString(record.kind) === kindFilter) && normalizeString(record['review-status']) === 'missing-metadata').length
    },
    skills: {
      total: skillRecords.filter((record) => shouldTrackScaffoldLineage(record.kind) && (!kindFilter || normalizeString(record.kind) === kindFilter)).length,
      returned: skills.length,
      'behind-template': skills.filter((record) => normalizeString(record['drift-status']) === 'behind-template').length,
      'missing-lineage': skills.filter((record) => normalizeString(record['drift-status']) === 'missing-lineage').length,
      'origin-mismatch': skills.filter((record) => normalizeString(record['drift-status']) === 'origin-mismatch').length,
      'ahead-of-template': skills.filter((record) => normalizeString(record['drift-status']) === 'ahead-of-template').length
    }
  };

  return {
    action: 'show-scaffold-governance',
    summary,
    returned: {
      templates: templates.length,
      skills: skills.length
    },
    templates,
    skills,
    follow_up: [
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source scaffold-lineage',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-scaffold-upgrade-blueprint --name <skill-name>',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage --all',
      'npm run verify:skill-system'
    ]
  };
}

function showTopTierWave(projectRoot, options = {}) {
  const payload = buildCurrentSkillInvestmentBacklog(projectRoot);
  const topTierPortfolio = payload && payload['top-tier-portfolio'] && typeof payload['top-tier-portfolio'] === 'object'
    ? payload['top-tier-portfolio']
    : {};
  const executionFocus = topTierPortfolio['execution-focus'] && typeof topTierPortfolio['execution-focus'] === 'object'
    ? topTierPortfolio['execution-focus']
    : null;
  const assessments = Array.isArray(topTierPortfolio.assessments) ? topTierPortfolio.assessments : [];
  const blockedAssessments = assessments.filter((item) => item && item.ready === false);

  if (!executionFocus) {
    return {
      action: 'show-top-tier-wave',
      summary: {
        blocked: blockedAssessments.length,
        ready: blockedAssessments.length < 1
      },
      returned: 0,
      skills: [],
      follow_up: ['node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier --all']
    };
  }

  const priorityFilter = normalizeString(options.priority);
  const categoryFilter = normalizeString(options.category);
  const waveSkills = new Set(
    (Array.isArray(executionFocus['next-wave']) ? executionFocus['next-wave'] : [])
      .map((item) => normalizeString(item))
      .filter(Boolean)
  );

  let skills = blockedAssessments.filter((item) => waveSkills.has(normalizeString(item.skill)));
  if (priorityFilter) {
    skills = skills.filter((item) => normalizeString(item.priority) === priorityFilter);
  }
  if (categoryFilter) {
    skills = skills.filter((item) => Array.isArray(item['blocker-categories']) && item['blocker-categories'].includes(categoryFilter));
  }

  return {
    action: 'show-top-tier-wave',
    summary: {
      blocked: Number(executionFocus.blocked || 0),
      'next-wave-size': Number(executionFocus['next-wave-size'] || 0),
      'current-priority-lane': executionFocus['current-priority-lane'] || null,
      'current-blocker-family': executionFocus['current-blocker-family'] || null
    },
    'execution-focus': executionFocus,
    returned: skills.length,
    skills,
    follow_up: Array.isArray(executionFocus.follow_up) ? executionFocus.follow_up : []
  };
}

function getDirectUpdateForbiddenMessage(key) {
  return DIRECT_UPDATE_FORBIDDEN_FIELDS.get(normalizeString(key)) || '';
}

function shouldDirectUpdateAffectRouteMetadata(keys) {
  return keys.some((key) => DIRECT_UPDATE_ROUTE_FIELDS.has(normalizeString(key)));
}

function shouldDirectUpdateAffectHostMetadata(keys) {
  return keys.some((key) => DIRECT_UPDATE_HOST_METADATA_FIELDS.has(normalizeString(key)));
}

function shouldDirectUpdateAffectReviewGovernance(keys) {
  return keys.some((key) => DIRECT_UPDATE_REVIEW_FIELDS.has(normalizeString(key)));
}

function updateSkill(skillName, assignments) {
  const projectRoot = getProjectRoot();
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);
  if (assignments.length === 0) fail('update requires at least one --set key=value');

  const parsedAssignments = [];
  for (const assignment of assignments) {
    const idx = assignment.indexOf('=');
    if (idx === -1) fail(`invalid assignment '${assignment}'`);
    const key = assignment.slice(0, idx).trim();
    const value = assignment.slice(idx + 1).trim();
    if (!key) fail(`invalid assignment '${assignment}'`);
    const forbiddenMessage = getDirectUpdateForbiddenMessage(key);
    if (forbiddenMessage) {
      fail(forbiddenMessage);
    }
    parsedAssignments.push({ key, value });
  }

  const updatedKeys = parsedAssignments.map((item) => item.key);
  const shouldSyncRoute = shouldDirectUpdateAffectRouteMetadata(updatedKeys);
  const shouldSyncHostMetadata = shouldDirectUpdateAffectHostMetadata(updatedKeys);
  const shouldRefreshReviewGovernance = shouldDirectUpdateAffectReviewGovernance(updatedKeys);
  const generatedPaths = [];
  const optionalGeneratedPaths = [];

  if (shouldSyncRoute) {
    generatedPaths.push(
      getRouteMapPath(projectRoot),
      getRouteFixturesPath(projectRoot)
    );
  }
  if (shouldRefreshReviewGovernance || shouldSyncRoute) {
    generatedPaths.push(
      getRatingsPath(projectRoot),
      getRatingsDocPath(projectRoot),
      getReviewQueueRegistryPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getSkillInvestmentBacklogDocFilePath(projectRoot),
      getExpertSourceFamilyScorecardRegistryPath(projectRoot)
    );
  }
  if (shouldRefreshReviewGovernance || shouldSyncRoute) {
    optionalGeneratedPaths.push(getSystemReadinessPath(projectRoot));
  }

  if (generatedPaths.length > 0) {
    assertGeneratedArtifactsWritable(projectRoot, `update skill '${skillName}'`, {
      paths: dedupeStrings(generatedPaths),
      optionalPaths: dedupeStrings(optionalGeneratedPaths)
    });
  }

  const previousSkillText = fs.readFileSync(resolved.skillFile, 'utf8');
  const hostMetadataFile = path.join(resolved.dir, 'agents', 'openai.yaml');
  const previousHostMetadataState = shouldSyncHostMetadata
    ? {
        existed: fs.existsSync(hostMetadataFile),
        text: fs.existsSync(hostMetadataFile)
          ? fs.readFileSync(hostMetadataFile, 'utf8')
          : null
      }
    : null;
  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    for (const assignment of parsedAssignments) {
      resolved.parsed.map.set(assignment.key, assignment.value);
    }

    const next = renderSkillFile(resolved.parsed);
    fs.writeFileSync(resolved.skillFile, next, 'utf8');

    if (shouldSyncHostMetadata) {
      writeSkillHostMetadata(resolved.dir, resolved.parsed);
    }

    const skillRecords = collectAllSkillRecords(projectRoot);
    const record = skillRecords.find((item) => item && item.name === skillName) || null;
    if (!record) {
      fail(`unknown skill '${skillName}' after update`);
    }

    if (shouldSyncRoute) {
      if (shouldSyncGovernedRouteArtifacts(record)) {
        syncRouteMapForSkill(projectRoot, skillName, {
          resolved,
          record
        });
        syncRouteFixturesForSkill(projectRoot, skillName);
      } else {
        syncRouteMapOnRemove(projectRoot, skillName);
        syncRouteFixturesOnRemove(projectRoot, skillName);
      }
    }

    if (shouldRefreshReviewGovernance || shouldSyncRoute) {
      refreshReviewGovernanceSurfaces(projectRoot, {
        skillRecords: collectAllSkillRecords(projectRoot),
        returnDetails: false
      });
    } else {
      refreshSystemReadiness(projectRoot, { bestEffort: true });
    }

    return {
      action: 'update',
      skill: skillName,
      updated_fields: assignments,
      follow_up: ['npm run verify:skills', 'npm run verify:skill-system'],
    };
  } catch (error) {
    fs.writeFileSync(resolved.skillFile, previousSkillText, 'utf8');
    if (previousHostMetadataState) {
      if (previousHostMetadataState.existed) {
        fs.mkdirSync(path.dirname(hostMetadataFile), { recursive: true });
        fs.writeFileSync(hostMetadataFile, previousHostMetadataState.text, 'utf8');
      } else if (fs.existsSync(hostMetadataFile)) {
        fs.rmSync(hostMetadataFile, { force: true });
      }
    }
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function markSkillReviewed(skillName, options = {}) {
  const projectRoot = getProjectRoot();
  const allOverdue = options.overdueOnly === true;
  const markAll = options.all === true;
  const targetNames = [];
  const selectionNow = Date.now();

  if (allOverdue || markAll) {
    const skillRecords = collectAllSkillRecords(projectRoot);
    const entries = buildReviewQueue(getBundleRoot(projectRoot), skillRecords, {
      now: selectionNow
    }).skills || [];
    const selectedEntries = allOverdue
      ? entries.filter((entry) => entry['review-status'] === 'overdue')
      : entries;
    for (const entry of selectedEntries) {
      const name = normalizeString(entry && entry.skill);
      if (name) {
        targetNames.push(name);
      }
    }
    if (targetNames.length < 1) {
      return {
        action: 'mark-reviewed',
        scope: allOverdue ? 'overdue' : 'all-governed-skills',
        reviewed: [],
        total_reviewed: 0,
        follow_up: ['npm run verify:skill-system']
      };
    }
  } else {
    const normalizedSkillName = normalizeString(skillName);
    if (!normalizedSkillName) fail(`unknown skill '${skillName}'`);
    targetNames.push(normalizedSkillName);
  }

  const reviewedAt = normalizeReviewDate(options.date || new Date().toISOString().slice(0, 10));
  if (!reviewedAt) {
    fail(`invalid review date '${options.date}'`);
  }

  const requiredPaths = [
    getRatingsPath(projectRoot),
    getRatingsDocPath(projectRoot),
    getReviewQueueRegistryPath(projectRoot),
    getSkillInvestmentBacklogRegistryPath(projectRoot),
    getSkillInvestmentBacklogDocFilePath(projectRoot),
    getExpertSourceFamilyScorecardRegistryPath(projectRoot)
  ];
  assertGeneratedArtifactsWritable(projectRoot, `mark '${skillName}' reviewed`, {
    paths: requiredPaths
  });

  const resolvedTargets = targetNames.map((name) => {
    const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), name);
    if (!resolved) {
      fail(`unknown skill '${name}'`);
    }
    return resolved;
  });

  const previousSkillTexts = new Map(
    resolvedTargets.map((resolved) => [resolved.skillFile, fs.readFileSync(resolved.skillFile, 'utf8')])
  );
  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    const reviewedSkills = [];
    for (const resolved of resolvedTargets) {
      const existingCycle = normalizeReviewCycleDays(resolved.parsed.map.get('review-cycle-days'));
      const reviewCycleDays = options.reviewCycleDays != null
        ? normalizeReviewCycleDays(options.reviewCycleDays)
        : existingCycle;
      if (reviewCycleDays == null) {
        fail(`skill '${resolved.parsed.map.get('name')}' needs a valid review-cycle-days before it can be marked reviewed`);
      }

      resolved.parsed.map.set('last-reviewed', reviewedAt);
      resolved.parsed.map.set('review-cycle-days', String(reviewCycleDays));
      const next = renderSkillFile(resolved.parsed);
      fs.writeFileSync(resolved.skillFile, next, 'utf8');
      reviewedSkills.push({
        skill: String(resolved.parsed.map.get('name') || '').trim(),
        'last-reviewed': reviewedAt,
        'review-cycle-days': reviewCycleDays
      });
    }

    const refreshed = refreshReviewGovernanceSurfaces(projectRoot, {
      returnDetails: true
    });
    const reviewEntriesBySkill = new Map(
      ((refreshed.reviewQueue.payload && refreshed.reviewQueue.payload.skills) || [])
        .map((item) => [item.skill, item])
    );
    const reviewedWithEntries = reviewedSkills.map((item) => ({
      ...item,
      ...(reviewEntriesBySkill.has(item.skill) ? { 'review-entry': reviewEntriesBySkill.get(item.skill) } : {})
    }));

    const payload = {
      action: 'mark-reviewed',
      backlog: refreshed.backlog.payload.summary,
      follow_up: ['npm run verify:skill-system']
    };

    if (reviewedWithEntries.length === 1) {
      const reviewed = reviewedWithEntries[0];
      return {
        ...payload,
        skill: reviewed.skill,
        'last-reviewed': reviewed['last-reviewed'],
        'review-cycle-days': reviewed['review-cycle-days'],
        ...(reviewed['review-entry'] ? { 'review-entry': reviewed['review-entry'] } : {})
      };
    }

    return {
      ...payload,
      scope: allOverdue ? 'overdue' : 'all-governed-skills',
      reviewed: reviewedWithEntries,
      total_reviewed: reviewedWithEntries.length
    };
  } catch (error) {
    for (const [skillFile, previousSkillText] of previousSkillTexts.entries()) {
      fs.writeFileSync(skillFile, previousSkillText, 'utf8');
    }
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function buildOpportunityId(summary) {
  return `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slugifyAdmissionText(summary).slice(0, 48)}`;
}

function recordSkillOpportunity(projectRoot, prompt, options = {}) {
  const summary = normalizeAdmissionText(prompt);
  if (!summary) {
    fail('record-opportunity requires a non-empty summary');
  }

  const suggestedKind = options.kind ? normalizeString(options.kind) : inferRecommendedKindFromAdmission(summary);
  if (suggestedKind && !ALL_SKILL_KINDS.has(String(suggestedKind || '').trim())) {
    fail(`unsupported opportunity kind '${suggestedKind}'`);
  }

  const priority = normalizeOpportunityPriority(options.priority);
  const horizon = normalizeOpportunityHorizon(options.horizon);
  const adjacentSkills = uniqueSorted(Array.isArray(options.adjacentSkills) ? options.adjacentSkills : []);
  const rationale = uniqueSorted(Array.isArray(options.rationale) ? options.rationale : []);
  const opportunityId = buildOpportunityId(summary);

  const queue = appendOpportunityQueueEntry(projectRoot, {
    'opportunity-id': opportunityId,
    summary,
    ...(suggestedKind ? { 'suggested-kind': suggestedKind } : {}),
    priority,
    status: 'open',
    horizon,
    ...(adjacentSkills.length > 0 ? { 'adjacent-skills': adjacentSkills } : {}),
    ...(rationale.length > 0 ? { rationale } : {}),
    'recorded-at': new Date().toISOString()
  });
  refreshSkillInvestmentBacklog(projectRoot, {
    opportunityQueueData: queue
  });
  refreshSystemReadiness(projectRoot, { bestEffort: true });

  return {
    action: 'record-opportunity',
    entry: queue.entries.find((entry) => entry['opportunity-id'] === opportunityId) || null,
    follow_up: [
      `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id ${opportunityId}`,
      'review the generated investment backlog before creating a new skill'
    ]
  };
}

function shouldSyncHostMetadataRecord(record, options = {}) {
  if (!record) return false;
  if (record.status === 'stable') return true;
  if (options.includeExperimental && record.status === 'experimental') return true;
  if (options.includeDeprecated && record.status === 'deprecated') return true;
  return false;
}

function syncHostMetadata(projectRoot, options = {}) {
  const skillRecords = collectAllSkillRecords(projectRoot);
  const skillsRoot = getAuthoritativeSkillsRoot();
  const selected = [];

  for (const record of skillRecords) {
    if (options.skillName && record.name !== options.skillName) {
      continue;
    }
    if (!options.skillName && !shouldSyncHostMetadataRecord(record, options)) {
      continue;
    }

    const resolved = resolveSkillDirByName(skillsRoot, record.name);
    if (!resolved) {
      fail(`unknown skill '${record.name}' while syncing host metadata`);
    }
    selected.push({
      record,
      resolved
    });
  }

  if (selected.length < 1) {
    if (options.skillName) {
      fail(`no eligible skill found for host metadata sync: '${options.skillName}'`);
    }
    return {
      action: 'sync-host-metadata',
      scope: 'all',
      synced: [],
      follow_up: ['npm run verify:skill-system']
    };
  }

  for (const item of selected) {
    writeSkillHostMetadata(item.resolved.dir, item.resolved.parsed);
  }

  return {
    action: 'sync-host-metadata',
    scope: options.skillName ? 'single' : 'all',
    ...(options.skillName ? { skill: options.skillName } : {}),
    synced: selected.map((item) => item.record.name),
    follow_up: ['npm run verify:skill-system']
  };
}

function validateLifecycleTransition(skillName, currentStatus, nextStatus) {
  if (!isWritableSkillStatus(nextStatus)) {
    fail(`unsupported status '${nextStatus}' for '${skillName}'`);
  }
  if (currentStatus === nextStatus) {
    fail(`skill '${skillName}' is already '${nextStatus}'`);
  }
  if (currentStatus === 'archived' && nextStatus === 'draft') {
    fail(`cannot move archived skill '${skillName}' back to draft; restore to experimental, deprecated, or stable instead`);
  }
  if (currentStatus === 'draft' && nextStatus === 'deprecated') {
    fail(`cannot deprecate draft skill '${skillName}' before it has been made live`);
  }
}

function snapshotGeneratedState(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  return {
    registry: cloneJsonValue(readGovernedRegistry(projectRoot)),
    opportunityQueue: cloneJsonValue(readOpportunityQueue(projectRoot)),
    admissionLedger: cloneJsonValue(readAdmissionLedger(projectRoot)),
    evolutionLedger: cloneJsonValue(readEvolutionLedger(projectRoot)),
    reviewQueue: fs.existsSync(getReviewQueueRegistryPath(projectRoot))
      ? cloneJsonValue(readJson(getReviewQueueRegistryPath(projectRoot)))
      : null,
    expertSourceFamilyScorecard: fs.existsSync(getExpertSourceFamilyScorecardRegistryPath(projectRoot))
      ? cloneJsonValue(readJson(getExpertSourceFamilyScorecardRegistryPath(projectRoot)))
      : null,
    pendingScaffolds: fs.existsSync(getPendingScaffoldRegistryFilePath(projectRoot))
      ? cloneJsonValue(readJson(getPendingScaffoldRegistryFilePath(projectRoot)))
      : null,
    skillInvestmentBacklog: fs.existsSync(getSkillInvestmentBacklogRegistryPath(projectRoot))
      ? cloneJsonValue(readJson(getSkillInvestmentBacklogRegistryPath(projectRoot)))
      : null,
    skillInvestmentBacklogDoc: fs.existsSync(getSkillInvestmentBacklogDocFilePath(projectRoot))
      ? fs.readFileSync(getSkillInvestmentBacklogDocFilePath(projectRoot), 'utf8')
      : null,
    runtimeProofExists: fs.existsSync(getRuntimeProofPath(projectRoot)),
    runtimeProof: fs.existsSync(getRuntimeProofPath(projectRoot)) ? cloneJsonValue(readJson(getRuntimeProofPath(projectRoot))) : null,
    routeMap: cloneJsonValue(readJson(getRouteMapPath(projectRoot))),
    routeFixtures: cloneJsonValue(readJson(getRouteFixturesPath(projectRoot))),
    ratings: cloneJsonValue(readJson(getRatingsPath(projectRoot))),
    scorecard: fs.existsSync(getHostSmokeScorecardPath(bundleRoot))
      ? cloneJsonValue(readJson(getHostSmokeScorecardPath(bundleRoot)))
      : null,
    invalidation: fs.existsSync(getHostSmokeInvalidationPath(bundleRoot))
      ? cloneJsonValue(readJson(getHostSmokeInvalidationPath(bundleRoot)))
      : null,
    readiness: fs.existsSync(path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json'))
      ? cloneJsonValue(readJson(path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json')))
      : null,
    hostEvolution: fs.existsSync(path.join(bundleRoot, 'benchmark', 'host-evolution.generated.json'))
      ? cloneJsonValue(readJson(path.join(bundleRoot, 'benchmark', 'host-evolution.generated.json')))
      : null
  };
}

function restoreGeneratedState(projectRoot, snapshot) {
  if (!snapshot) return;

  writeGovernedRegistry(projectRoot, snapshot.registry);
  writeOpportunityQueue(projectRoot, snapshot.opportunityQueue);
  writeAdmissionLedger(projectRoot, snapshot.admissionLedger);
  writeEvolutionLedger(projectRoot, snapshot.evolutionLedger);
  if (snapshot.reviewQueue) {
    writeJson(getReviewQueueRegistryPath(projectRoot), snapshot.reviewQueue);
  } else if (fs.existsSync(getReviewQueueRegistryPath(projectRoot))) {
    fs.rmSync(getReviewQueueRegistryPath(projectRoot), { force: true });
  }
  if (snapshot.expertSourceFamilyScorecard) {
    writeJson(getExpertSourceFamilyScorecardRegistryPath(projectRoot), snapshot.expertSourceFamilyScorecard);
  } else if (fs.existsSync(getExpertSourceFamilyScorecardRegistryPath(projectRoot))) {
    fs.rmSync(getExpertSourceFamilyScorecardRegistryPath(projectRoot), { force: true });
  }
  if (snapshot.pendingScaffolds) {
    writeJson(getPendingScaffoldRegistryFilePath(projectRoot), snapshot.pendingScaffolds);
  } else if (fs.existsSync(getPendingScaffoldRegistryFilePath(projectRoot))) {
    fs.rmSync(getPendingScaffoldRegistryFilePath(projectRoot), { force: true });
  }
  if (snapshot.skillInvestmentBacklog) {
    writeJson(getSkillInvestmentBacklogRegistryPath(projectRoot), snapshot.skillInvestmentBacklog);
  } else if (fs.existsSync(getSkillInvestmentBacklogRegistryPath(projectRoot))) {
    fs.rmSync(getSkillInvestmentBacklogRegistryPath(projectRoot), { force: true });
  }
  if (snapshot.skillInvestmentBacklogDoc != null) {
    fs.writeFileSync(getSkillInvestmentBacklogDocFilePath(projectRoot), snapshot.skillInvestmentBacklogDoc, 'utf8');
  } else if (fs.existsSync(getSkillInvestmentBacklogDocFilePath(projectRoot))) {
    fs.rmSync(getSkillInvestmentBacklogDocFilePath(projectRoot), { force: true });
  }
  writeJson(getRouteMapPath(projectRoot), snapshot.routeMap);
  writeJson(getRouteFixturesPath(projectRoot), snapshot.routeFixtures);
  writeRatings(projectRoot, snapshot.ratings);

  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  if (snapshot.runtimeProofExists && snapshot.runtimeProof) {
    writeJson(runtimeProofPath, snapshot.runtimeProof);
  } else if (fs.existsSync(runtimeProofPath)) {
    fs.rmSync(runtimeProofPath, { force: true });
  }

  const bundleRoot = getBundleRoot(projectRoot);
  const scorecardPath = getHostSmokeScorecardPath(bundleRoot);
  if (snapshot.scorecard) {
    writeJson(scorecardPath, snapshot.scorecard);
  } else if (fs.existsSync(scorecardPath)) {
    fs.rmSync(scorecardPath, { force: true });
  }

  const invalidationPath = getHostSmokeInvalidationPath(bundleRoot);
  if (snapshot.invalidation) {
    writeJson(invalidationPath, snapshot.invalidation);
  } else if (fs.existsSync(invalidationPath)) {
    fs.rmSync(invalidationPath, { force: true });
  }

  const readinessPath = path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json');
  try {
    if (snapshot.readiness) {
      writeJson(readinessPath, snapshot.readiness);
    } else if (fs.existsSync(readinessPath)) {
      fs.rmSync(readinessPath, { force: true });
    }
  } catch (error) {
    if (!(error && error.code === 'EPERM')) {
      throw error;
    }
  }

  const hostEvolutionPath = path.join(bundleRoot, 'benchmark', 'host-evolution.generated.json');
  try {
    if (snapshot.hostEvolution) {
      writeJson(hostEvolutionPath, snapshot.hostEvolution);
    } else if (fs.existsSync(hostEvolutionPath)) {
      fs.rmSync(hostEvolutionPath, { force: true });
    }
  } catch (error) {
    if (!(error && error.code === 'EPERM')) {
      throw error;
    }
  }
}

function restoreGeneratedStateSafely(projectRoot, snapshot, originalError) {
  try {
    restoreGeneratedState(projectRoot, snapshot);
  } catch (restoreError) {
    const originalMessage = originalError && originalError.message ? originalError.message : String(originalError);
    const restoreMessage = restoreError && restoreError.message ? restoreError.message : String(restoreError);
    fail(`${originalMessage}; rollback also failed: ${restoreMessage}`);
  }
}

function resolveEvolutionRequestIfPresent(projectRoot, requestId, resolution = {}) {
  const normalizedId = String(requestId || '').trim();
  if (!normalizedId) {
    return null;
  }
  return resolveEvolutionDecision(projectRoot, normalizedId, {
    status: 'implemented',
    ...resolution
  });
}

function setSkillStatus(skillName, nextStatus, options = {}) {
  const projectRoot = getProjectRoot();
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);

  const currentStatus = String(resolved.parsed.map.get('status') || '').trim();
  const wasArchived = currentStatus === 'archived';
  validateLifecycleTransition(skillName, currentStatus, nextStatus);
  const requiredPaths = [
    getReviewQueueRegistryPath(projectRoot),
    getSkillInvestmentBacklogRegistryPath(projectRoot),
    getSkillInvestmentBacklogDocFilePath(projectRoot),
    getExpertSourceFamilyScorecardRegistryPath(projectRoot),
    getRatingsPath(projectRoot),
    getRuntimeProofPath(projectRoot),
    getHostSmokeScorecardPath(getBundleRoot(projectRoot)),
    getRouteMapPath(projectRoot),
    getRouteFixturesPath(projectRoot)
  ];
  if (options.requestId) {
    requiredPaths.push(getEvolutionLedgerPath(getBundleRoot(projectRoot)));
  }
  assertGeneratedArtifactsWritable(projectRoot, `set status for '${skillName}'`, {
    paths: requiredPaths
  });

  const previousSkillText = fs.readFileSync(resolved.skillFile, 'utf8');
  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    if (nextStatus === 'stable') {
      enforceTopTierReadinessForStable(projectRoot, skillName);
    }

    resolved.parsed.map.set('status', nextStatus);
    const next = renderSkillFile(resolved.parsed);
    fs.writeFileSync(resolved.skillFile, next, 'utf8');

    if (nextStatus === 'archived') {
      syncArchiveOnGeneratedSurfaces(projectRoot, skillName);
    } else {
      const userInvocable = parseBoolean(resolved.parsed.map.get('user-invocable'), false);
      const kind = String(resolved.parsed.map.get('kind') || '').trim();
      if (wasArchived && shouldAppearOnActiveRouteSurface({ userInvocable, kind, status: nextStatus })) {
        if (!hasActiveRouteEntry(projectRoot, skillName)) {
          syncRouteMapForSkill(projectRoot, skillName, { resolved });
        }
        syncRouteFixturesForSkill(projectRoot, skillName);
      }
      updateRatingsSummaryForStatus(projectRoot, skillName, nextStatus);
      syncRuntimeProofForStatusTransition(projectRoot, skillName, nextStatus, options);
      const reviewQueue = refreshReviewQueue(projectRoot);
      refreshSkillInvestmentBacklog(projectRoot, {
        reviewQueueData: reviewQueue.payload
      });
      refreshExpertSourceFamilyScorecard(projectRoot);
      refreshSystemReadiness(projectRoot, { bestEffort: true });
    }

    const resolvedEvolution = resolveEvolutionRequestIfPresent(projectRoot, options.requestId, {
      executedAction: String(options.executedAction || 'set-status').trim(),
      resultStatus: nextStatus,
      ...(options.evolutionResolution || {})
    });

    return {
      action: 'set-status',
      skill: skillName,
      previous_status: currentStatus,
      status: nextStatus,
      ...(options.requestId ? { 'evolution-request-id': options.requestId } : {}),
      ...(resolvedEvolution ? { evolution_resolution: resolvedEvolution } : {}),
      follow_up: [
        'npm run verify:skills',
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    fs.writeFileSync(resolved.skillFile, previousSkillText, 'utf8');
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function updateRatingsSummaryForStatus(projectRoot, skillName, status) {
  const ratings = readJson(getRatingsPath(projectRoot));
  writeRatings(projectRoot, ratings);
}

function syncRuntimeProofForStatusTransition(projectRoot, skillName, status, options = {}) {
  const skillRecords = collectAllSkillRecords(projectRoot);
  const record = skillRecords.find((item) => item.name === skillName);
  if (!record) {
    fail(`unknown skill '${skillName}' after status transition`);
  }

  if (!shouldHaveRuntimeProofEntry(record)) {
    syncRuntimeProofOnRemove(projectRoot, skillName);
    return;
  }

  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  const proofs = Array.isArray(registry.proofs) ? registry.proofs : [];
  const existing = proofs.find((proof) => proof && proof.skill === skillName) || null;

  if ((record.runtimeProofItems || []).length < 2) {
    fail(`skill '${skillName}' needs at least two Runtime Proof bullets before status can move to '${status}'`);
  }

  const level = status === 'stable'
    ? 'declared-and-tested'
    : defaultRuntimeProofLevelForStatus(status);
  const evidenceTests = existing && Array.isArray(existing['evidence-tests'])
    ? existing['evidence-tests']
    : undefined;
  const entry = buildRuntimeProofEntry(record, {
    level,
    ...(evidenceTests ? { evidenceTests } : {})
  }, existing);

  if (entry.level !== 'declared-only' && entry['evidence-tests'].length < 1) {
    fail(`runtime-proof level '${entry.level}' for '${skillName}' requires at least one evidence test before status can move to '${status}'`);
  }

  const nextProofs = proofs.filter((proof) => proof && proof.skill !== skillName);
  nextProofs.push(entry);
  nextProofs.sort((a, b) => String(a.skill).localeCompare(String(b.skill)));
  writeRuntimeProofRegistry(projectRoot, nextProofs);
}

function archiveSkill(skillName, options = {}) {
  const result = setSkillStatus(skillName, 'archived', {
    requestId: options.requestId,
    executedAction: 'archive'
  });
  return {
    action: 'archive',
    skill: skillName,
    previous_status: result.previous_status,
    ...(result['evolution-request-id'] ? { 'evolution-request-id': result['evolution-request-id'] } : {}),
    follow_up: result.follow_up
  };
}

function mergeSkill(skillName, targetSkill, options = {}) {
  const normalizedSource = String(skillName || '').trim();
  const normalizedTarget = String(targetSkill || '').trim();

  if (!normalizedSource || !normalizedTarget) {
    fail('merge requires <skill-name> <target-skill>');
  }
  if (normalizedSource === normalizedTarget) {
    fail(`cannot merge skill '${normalizedSource}' into itself`);
  }
  if (!resolveSkillDirByName(getAuthoritativeSkillsRoot(), normalizedTarget)) {
    fail(`unknown merge target '${normalizedTarget}'`);
  }

  const result = setSkillStatus(normalizedSource, 'archived', {
    requestId: options.requestId,
    executedAction: 'merge',
    evolutionResolution: {
      mergedInto: normalizedTarget,
      note: options.note || `merged into '${normalizedTarget}' through governed manage-skill flow`
    }
  });

  return {
    action: 'merge',
    skill: normalizedSource,
    target_skill: normalizedTarget,
    previous_status: result.previous_status,
    status: 'archived',
    ...(result['evolution-request-id'] ? { 'evolution-request-id': result['evolution-request-id'] } : {}),
    ...(result.evolution_resolution ? { evolution_resolution: result.evolution_resolution } : {}),
    follow_up: [
      `review overlap now owned by '${normalizedTarget}'`,
      'npm run verify:skills',
      'npm run verify:skill-system'
    ]
  };
}

function removeSkill(options) {
  const projectRoot = getProjectRoot();
  const skillsRoot = getAuthoritativeSkillsRoot();
  const byName = options && options.name ? resolveSkillDirByName(skillsRoot, options.name) : null;
  const byPath = options && options.path ? resolveSkillDirByRelPath(skillsRoot, options.path) : null;
  const resolved = byName || byPath;
  const identifier = options && (options.name || options.path);

  if (!resolved) fail(`unknown skill '${identifier}'`);
  ensureInsideAuthoritativeRoot(resolved.dir, skillsRoot);
  const skillName = resolved.parsed.map.get('name') || identifier;
  const deleteGovernance = summarizeDeleteGovernance(projectRoot, skillName);
  if (!deleteGovernance.allowed) {
    fail(`cannot delete skill '${skillName}' because active governance dependencies remain: ${deleteGovernance.blockers.map((item) => item.message).join('; ')}`);
  }
  assertGeneratedArtifactsWritable(projectRoot, `delete skill '${skillName}'`, {
    paths: [
      getRegistryPath(projectRoot),
      getRouteMapPath(projectRoot),
      getRouteFixturesPath(projectRoot),
      getRatingsPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getSkillInvestmentBacklogDocFilePath(projectRoot),
      getRuntimeProofPath(projectRoot),
      getHostSmokeScorecardPath(getBundleRoot(projectRoot)),
      getEvolutionLedgerPath(getBundleRoot(projectRoot))
    ]
  });
  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  try {
    fs.rmSync(resolved.dir, { recursive: true, force: true });
    syncGeneratedSurfacesOnRemove(projectRoot, skillName);
    let resolvedEvolution = resolveEvolutionRequestIfPresent(projectRoot, options && options.requestId, {
      executedAction: 'delete',
      resultStatus: 'deleted'
    });
    if (!resolvedEvolution) {
      const recordedAt = new Date().toISOString();
      const ledger = appendEvolutionLedgerEntry(projectRoot, {
        'request-id': buildEvolutionRequestId(skillName, 'delete skill through governed manage-skill flow'),
        skill: skillName,
        request: 'delete skill through governed manage-skill flow',
        decision: {
          action: 'delete-skill',
          target_status: 'deleted'
        },
        status: 'implemented',
        'executed-action': 'delete',
        'result-status': 'deleted',
        'recorded-at': recordedAt,
        'resolved-at': recordedAt,
        note: 'auto-recorded delete evidence from governed manage-skill flow'
      });
      resolvedEvolution = (Array.isArray(ledger.entries) ? ledger.entries : [])
        .find((entry) => normalizeString(entry && entry.skill) === skillName
          && normalizeString(entry && entry['executed-action']) === 'delete'
          && normalizeString(entry && entry['result-status']) === 'deleted'
          && normalizeString(entry && entry['recorded-at']) === recordedAt) || null;
    }
    refreshSystemReadiness(projectRoot, { bestEffort: true });

    return {
      action: 'delete',
      skill: skillName,
      path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
      'delete-governance': {
        blockers: deleteGovernance.blockers,
        history: deleteGovernance.history,
        'has-delete-evidence': true
      },
      ...(options && options.requestId ? { 'evolution-request-id': options.requestId } : {}),
      ...(resolvedEvolution ? { evolution_resolution: resolvedEvolution } : {}),
      follow_up: ['npm run verify:skills', 'update registry/route-map generated artifacts if needed'],
    };
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function parseListArgument(value) {
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRouteMap(projectRoot) {
  return readJson(getRouteMapPath(projectRoot));
}

function collectAdmissionCandidates(projectRoot, query) {
  const routeMap = readRouteMap(projectRoot);
  const explain = explainRouteSelection(query, routeMap);
  const candidates = Array.isArray(explain.rankedCandidates) ? explain.rankedCandidates : [];
  return {
    explain,
    candidates: candidates.filter((item) => item && item.positiveSignals > 0)
  };
}

function inferRecommendedKindFromAdmission(text) {
  const normalized = normalizeAdmissionText(text);
  const lower = normalized.toLowerCase();
  const hasAny = (signals) => signals.some((signal) => lower.includes(signal) || normalized.includes(signal));

  if (hasAny(['route', 'router', 'dispatch', 'fallback', 'clarify', '路由', '分流', '派发', '澄清'])) return 'router';
  if (hasAny(['workflow', 'pipeline', 'runbook', 'multi-step', 'investigate', 'ship', 'review flow', '工作流', '流程', '排查流程', '交付流程'])) return 'workflow';
  if (hasAny(['tool', 'validator', 'verify', 'scan', 'audit', 'generator', 'check', 'lint', '校验', '扫描', '审计', '生成器', '检查'])) return 'tool';
  if (hasAny(['guard', 'gate', 'policy', 'blocker', 'risk gate', 'pre-merge', 'pre-commit', '闸门', '门禁', '阻断', '风险门'])) return 'guard';
  if (hasAny(['adapter', 'host-specific', 'host specific', 'claude', 'codex', 'gemini', '兼容', '适配', '宿主'])) return 'adapter';
  return 'domain';
}

function inferIntentFromCandidates(candidates) {
  const intents = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const matched = candidate && candidate.semantic && Array.isArray(candidate.semantic.matchedIntents)
      ? candidate.semantic.matchedIntents
      : [];
    for (const item of matched) intents.add(item);
  }
  return [...intents].sort((a, b) => a.localeCompare(b));
}

function buildSkillRecordIndex(projectRoot) {
  const index = new Map();
  for (const record of collectAllSkillRecords(projectRoot)) {
    index.set(record.name, record);
  }
  return index;
}

function buildCandidateSummary(candidate, recordIndex) {
  const record = recordIndex.get(candidate.skill) || null;
  return {
    skill: candidate.skill,
    kind: candidate.kind,
    status: record ? record.status : null,
    confidence: candidate.confidence || null,
    rerankScore: candidate.rerankScore,
    positiveSignals: candidate.positiveSignals,
    reason: candidate.reason,
    matched: candidate.matched,
    semantic: candidate.semantic,
    ...(record ? { file: record.file } : {})
  };
}

function buildEvolutionRequestId(skillName, prompt) {
  return `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slugifyAdmissionText(`${skillName}-${prompt}`).slice(0, 48)}`;
}

function finalizeEvolutionResult(projectRoot, result, options = {}) {
  if (options.record === false) {
    delete result['request-id'];
    return result;
  }

  const recordedAt = new Date().toISOString();
  const ledger = appendEvolutionLedgerEntry(projectRoot, {
    'request-id': result['request-id'],
    skill: result.skill,
    request: result.request,
    decision: result.recommendation,
    status: result.recommendation.action === 'status-already-correct' ? 'advised-noop' : 'open',
    'recorded-at': recordedAt
  });
  refreshSkillInvestmentBacklog(projectRoot, {
    evolutionLedgerData: ledger
  });
  refreshSystemReadiness(projectRoot, { bestEffort: true });
  result['recorded-at'] = recordedAt;
  result.follow_up.push(`recorded in evolution ledger as '${result['request-id']}'`);
  return result;
}

function recommendEvolutionPath(projectRoot, skillName, prompt, options = {}) {
  const normalizedSkill = String(skillName || '').trim();
  const query = normalizeAdmissionText(prompt);
  if (!normalizedSkill) {
    fail('evolution-check requires <skill-name>');
  }
  if (!query) {
    fail('evolution-check requires a non-empty request description');
  }

  const recordIndex = buildSkillRecordIndex(projectRoot);
  const record = recordIndex.get(normalizedSkill) || null;
  if (!record) {
    fail(`unknown skill '${normalizedSkill}'`);
  }

  const lower = query.toLowerCase();
  const assessment = assessTopTierReadiness(projectRoot, normalizedSkill);
  const hasActiveRoute = hasActiveRouteEntry(projectRoot, normalizedSkill);
  const moduleRatings = getCapabilityModuleRatingsForSkill(projectRoot, normalizedSkill);
  const routeQuery = `skill boundary evolution for ${normalizedSkill}: ${query}`;
  const { explain, candidates } = collectAdmissionCandidates(projectRoot, routeQuery);
  const nearestPeer = (candidates || [])
    .filter((candidate) => candidate && candidate.skill !== normalizedSkill)
    .map((candidate) => buildCandidateSummary(candidate, recordIndex))[0] || null;

  const result = {
    action: 'evolution-check',
    'request-id': options.record === false ? null : buildEvolutionRequestId(normalizedSkill, query),
    skill: normalizedSkill,
    kind: record.kind,
    status: record.status,
    request: query,
    'top-tier-ready': assessment.ready,
    'active-route': hasActiveRoute,
    'capability-modules': moduleRatings,
    'nearest-peer': nearestPeer,
    route_selection_reason: explain.selectionReason,
    recommendation: null,
    rationale: [],
    follow_up: []
  };

  const wantsDelete = /\b(delete|remove)\b|删除|移除/.test(lower);
  const wantsArchive = /\barchiv(?:e|ed|ing)\b|归档/.test(lower);
  const wantsDeprecate = /\bdeprecat(?:e|ed|ion)?\b|\bretir(?:e|ed|ing)\b|弃用|退役/.test(lower);
  const wantsStable = /\bstable\b|top-tier|top tier|promot|升稳|晋升/.test(lower);
  const wantsMerge = /\bmerge\b|合并/.test(lower);

  if (wantsDelete) {
    const deleteGovernance = summarizeDeleteGovernance(projectRoot, normalizedSkill);
    result.recommendation = {
      action: 'delete-skill',
      target_status: 'deleted'
    };
    result.rationale.push('the request explicitly asks for removal, so the governed path should end at delete instead of a softer lifecycle move');
    if (!deleteGovernance.allowed) {
      result.rationale.push(...deleteGovernance.blockers.slice(0, 3).map((item) => normalizeString(item && item.message)).filter(Boolean));
    }
    result.follow_up.push(`preview blockers with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-retirement-blueprint --name ${normalizedSkill}`);
    result.follow_up.push(`archive '${normalizedSkill}' first unless you are intentionally deleting without historical preservation`);
    result.follow_up.push(`execute with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete --name ${normalizedSkill}`);
    return finalizeEvolutionResult(projectRoot, result, options);
  }

  if (wantsArchive || (!hasActiveRoute && record.status === 'deprecated')) {
    result.recommendation = {
      action: 'archive-skill',
      target_status: 'archived'
    };
    result.rationale.push('this skill is already off the active surface or the request explicitly asks to preserve history without live routing');
    result.follow_up.push(`execute with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js archive ${normalizedSkill}`);
    return finalizeEvolutionResult(projectRoot, result, options);
  }

  if (wantsDeprecate) {
    result.recommendation = {
      action: 'deprecate-skill',
      target_status: 'deprecated'
    };
    result.rationale.push('the request asks for a live-but-discouraged state, which matches deprecation better than archive or delete');
    result.follow_up.push(`execute with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status ${normalizedSkill} deprecated`);
    return finalizeEvolutionResult(projectRoot, result, options);
  }

  if (wantsStable || record.status === 'experimental') {
    if (assessment.ready) {
      result.recommendation = {
        action: 'promote-to-stable',
        target_status: 'stable'
      };
      result.rationale.push('top-tier blockers are clear and the request is consistent with stable promotion');
      result.follow_up.push(`execute with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status ${normalizedSkill} stable`);
      return finalizeEvolutionResult(projectRoot, result, options);
    }

    result.recommendation = {
      action: 'upgrade-existing-skill',
      target_status: record.status
    };
    result.rationale.push('stable promotion is not honest yet because governed top-tier blockers still exist');
    result.rationale.push(...assessment.blockers.slice(0, 3).map((item) => item.message));
    result.follow_up.push(`inspect blockers with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${normalizedSkill}`);
    result.follow_up.push(`preview governed hardening with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint --name ${normalizedSkill}`);
    return finalizeEvolutionResult(projectRoot, result, options);
  }

  if (wantsMerge && nearestPeer) {
    result.recommendation = {
      action: 'merge-into-skill',
      target_skill: nearestPeer.skill
    };
    result.rationale.push(`the request explicitly mentions merge pressure and the nearest competing route is '${nearestPeer.skill}'`);
    result.follow_up.push(`execute with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js merge ${normalizedSkill} ${nearestPeer.skill}`);
    result.follow_up.push(`review overlap with '${nearestPeer.skill}' before deleting or archiving '${normalizedSkill}'`);
    return finalizeEvolutionResult(projectRoot, result, options);
  }

  if (record.status === 'draft' || record.status === 'experimental' || assessment.ready === false) {
    result.recommendation = {
      action: 'upgrade-existing-skill',
      target_status: record.status
    };
    result.rationale.push('the narrowest useful move is still to deepen or harden the current skill rather than change lifecycle state');
    if (assessment.blockers.length > 0) {
      result.rationale.push(...assessment.blockers.slice(0, 2).map((item) => item.message));
    }
    result.follow_up.push(`inspect current state with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${normalizedSkill}`);
    if (assessment.blockers.length > 0) {
      result.follow_up.push(`inspect promotion blockers with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${normalizedSkill}`);
      result.follow_up.push(`preview governed hardening with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint --name ${normalizedSkill}`);
    }
    return finalizeEvolutionResult(projectRoot, result, options);
  }

  result.recommendation = {
    action: 'status-already-correct',
    target_status: record.status
  };
  result.rationale.push('the current governed state already matches the request better than a lifecycle mutation would');
  result.follow_up.push(`keep iterating in-place on '${normalizedSkill}' instead of changing status`);
  return finalizeEvolutionResult(projectRoot, result, options);
}

function showEvolutionLedger(projectRoot, options = {}) {
  const ledger = readEvolutionLedger(projectRoot);
  const statusFilter = String(options.status || '').trim();
  const skillFilter = String(options.skill || '').trim();
  const requestIdFilter = String(options.requestId || '').trim();

  let entries = ledger.entries;
  if (requestIdFilter) {
    entries = entries.filter((entry) => entry['request-id'] === requestIdFilter);
  }
  if (statusFilter) {
    entries = entries.filter((entry) => entry.status === statusFilter);
  }
  if (skillFilter) {
    entries = entries.filter((entry) =>
      entry.skill === skillFilter
      || entry.decision.target_skill === skillFilter
      || entry['merged-into'] === skillFilter
    );
  }

  return {
    action: 'show-evolution-ledger',
    summary: ledger.summary || {},
    total: ledger.entries.length,
    returned: entries.length,
    entries
  };
}

function finalizeAdmissionResult(projectRoot, result, options = {}) {
  if (options.record === false) {
    delete result['request-id'];
    return result;
  }

  const requiredPaths = [
    getAdmissionLedgerPath(getBundleRoot(projectRoot)),
    getSkillInvestmentBacklogRegistryPath(projectRoot),
    getSkillInvestmentBacklogDocFilePath(projectRoot)
  ];
  if (options.opportunityId) {
    requiredPaths.push(getSkillOpportunityQueueRegistryPath(projectRoot));
  }
  assertGeneratedArtifactsWritable(projectRoot, `record admission decision '${result['request-id']}'`, {
    paths: requiredPaths
  });

  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  const recordedAt = new Date().toISOString();
  try {
    const skillNames = new Set([...buildSkillRecordIndex(projectRoot).keys()]);
    const governedDecision = buildAdmissionDecision(
      result && result.recommendation && result.recommendation.action,
      result && result.recommendation,
      {
        skillNames,
        entrySuggestedKind: result && result.suggested_kind
      }
    );
    result.recommendation = governedDecision;
    const recommendationAction = normalizeAdmissionDecisionAction(governedDecision.action);
    const admissionStatus = recommendationAction === 'status-already-correct'
      ? 'advised-noop'
      : getDefaultAdmissionStatusForDecision(recommendationAction);
    const ledger = appendAdmissionLedgerEntry(projectRoot, {
      'request-id': result['request-id'],
      request: result.request,
      'suggested-kind': result.suggested_kind,
      'inferred-intent-tags': result.inferred_intent_tags,
      ...(options.opportunityId ? { 'opportunity-id': options.opportunityId } : {}),
      decision: governedDecision,
      status: admissionStatus,
      'recorded-at': recordedAt
    });
    const linkedOpportunity = syncOpportunityQueueOnAdmissionDecision(projectRoot, result, options);
    refreshSkillInvestmentBacklog(projectRoot, {
      admissionLedgerData: ledger
    });
    result['recorded-at'] = recordedAt;
    if (options.opportunityId) {
      result['opportunity-id'] = options.opportunityId;
    }
    if (linkedOpportunity) {
      result['linked-opportunity-status'] = linkedOpportunity.status;
    }
    if (recommendationAction === 'create-new-skill') {
      const scaffoldFlags = [];
      if (supportsCapabilityModuleScaffold(result.suggested_kind)) {
        scaffoldFlags.push('--scaffold-modules');
      }
      scaffoldFlags.push('--defer-when-host-blocked');
      scaffoldFlags.push(`--request-id ${result['request-id']}`);
      if (options.opportunityId) {
        scaffoldFlags.push(`--opportunity-id ${options.opportunityId}`);
      }
      result.follow_up.push(`recorded create path: node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${result.suggested_kind} <skill-name> ${scaffoldFlags.join(' ')}`);
    }
    refreshSystemReadiness(projectRoot, { bestEffort: true });
    result.follow_up.push(`recorded in admission ledger as '${result['request-id']}'`);
    return result;
  } catch (error) {
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function syncOpportunityQueueOnSkillCreate(projectRoot, skillName, options = {}) {
  const opportunityId = normalizeString(options.opportunityId);
  if (!opportunityId) {
    return null;
  }
  return resolveOpportunity(projectRoot, opportunityId, {
    status: 'implemented',
    createdSkill: skillName,
    admissionRequestId: options.requestId || null,
    note: `implemented via create ${skillName}`
  });
}

function recommendAdmissionPath(projectRoot, prompt, options = {}) {
  const linkedOpportunity = options.opportunityId
    ? findOpportunityQueueEntry(projectRoot, options.opportunityId).entry
    : null;
  if (
    linkedOpportunity
    && options.record !== false
    && !ACTIVE_OPPORTUNITY_STATUSES.has(normalizeOpportunityStatus(linkedOpportunity.status))
  ) {
    fail(`opportunity '${options.opportunityId}' is already '${normalizeOpportunityStatus(linkedOpportunity.status)}' and cannot be escalated into a new admission request`);
  }
  const opportunitySummary = normalizeAdmissionText(linkedOpportunity && linkedOpportunity.summary);
  const query = normalizeAdmissionText(prompt || opportunitySummary);
  if (!query) {
    fail('admission-check requires a non-empty request description');
  }

  const { explain, candidates } = collectAdmissionCandidates(projectRoot, query);
  const ranked = candidates.length > 0 ? candidates : (Array.isArray(explain.rankedCandidates) ? explain.rankedCandidates : []);
  const top = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const explicitKindIntent = options.kind || normalizeString(linkedOpportunity && linkedOpportunity['suggested-kind']) || null;
  const recommendedKind = explicitKindIntent || inferRecommendedKindFromAdmission(query);
  const suggestedSkillName = suggestSkillNameFromAdmissionRequest(query, recommendedKind);
  const inferredIntentTags = inferIntentFromCandidates(ranked);
  const recordIndex = buildSkillRecordIndex(projectRoot);

  const result = {
    action: 'admission-check',
    'request-id': options.record === false
      ? null
      : `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slugifyAdmissionText(query).slice(0, 48)}`,
    request: query,
    suggested_kind: recommendedKind,
    'suggested-skill-name': suggestedSkillName,
    inferred_intent_tags: inferredIntentTags,
    route_selection_reason: explain.selectionReason,
    selected_skill: explain.selectedSkill,
    fallback: explain.fallback,
    candidates: ranked.slice(0, 5).map((candidate) => buildCandidateSummary(candidate, recordIndex)),
    recommendation: null,
    rationale: [],
    follow_up: []
  };

  if (
    top
    && top.semantic
    && top.semantic.requiresExplicitWithoutInvocation
    && top.positiveSignals >= 2
    && top.matched
    && Array.isArray(top.matched.keywords)
    && top.matched.keywords.length >= 2
  ) {
    result.recommendation = buildAdmissionDecision('reuse-existing-skill', {
      target_skill: top.skill,
      target_kind: top.kind
    });
    result.rationale.push(`existing route '${top.skill}' is already the right owner, even though its live route requires explicit invocation`);
    result.rationale.push('for admission work, explicit-route gating should not be mistaken for missing capability coverage');
    result.follow_up.push(`inspect ${top.skill} first with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${top.skill}`);
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (top && top.confidence && top.confidence.passedMinimum && ['strong', 'very-strong'].includes(top.confidence.band)) {
    result.recommendation = buildAdmissionDecision('reuse-existing-skill', {
      target_skill: top.skill,
      target_kind: top.kind
    });
    result.rationale.push(`existing route '${top.skill}' already wins this request with ${top.confidence.band} confidence`);
    result.rationale.push('prefer deepening the existing route or references before adding a sibling skill');
    result.follow_up.push(`inspect ${top.skill} first with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${top.skill}`);
    if (supportsCapabilityModuleScaffold(top.kind)) {
      result.follow_up.push(`if depth is the gap, promote or scaffold capability modules behind '${top.skill}' instead of forking a new public peer`);
    }
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (
    explicitKindIntent
    && top
    && top.kind !== explicitKindIntent
    && top.confidence
    && ['low', 'minimum'].includes(top.confidence.band)
  ) {
    result.recommendation = buildAdmissionDecision('create-new-skill', {
      suggested_kind: recommendedKind
    });
    result.rationale.push(`the nearest current route '${top.skill}' is only a weak ${top.kind}-shaped overlap, while the requested boundary is '${explicitKindIntent}'`);
    result.rationale.push('when explicit kind intent and weak current ownership disagree, prefer a clean new boundary over forcing the capability into the wrong layer');
    result.follow_up.push(`create the governed scaffold with: ${formatCreateCommand(recommendedKind)}`);
    result.follow_up.push('after scaffolding, define why this boundary should stay separate from the nearest live route');
    result.blueprint = buildSkillBlueprint(projectRoot, recommendedKind, suggestedSkillName, {
      scaffoldModules: supportsCapabilityModuleScaffold(recommendedKind)
    });
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (
    top
    && runnerUp
    && top.confidence
    && top.confidence.marginToRunnerUp != null
    && top.confidence.marginToRunnerUp <= 12
  ) {
    result.recommendation = buildAdmissionDecision('clarify-or-merge-boundary', {
      primary_skill: top.skill,
      competing_skill: runnerUp.skill,
      suggested_kind: recommendedKind
    });
    result.rationale.push(`two existing routes are still close for this request ('${top.skill}' vs '${runnerUp.skill}')`);
    result.rationale.push('tighten boundaries or deepen one surface before introducing another overlapping skill');
    result.follow_up.push(`review route overlap between '${top.skill}' and '${runnerUp.skill}' before creating a new skill`);
    result.follow_up.push('if neither route truly owns the job, then create a new skill only after making the new boundary explicit');
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (top && top.confidence && top.confidence.band === 'minimum') {
    result.recommendation = buildAdmissionDecision('upgrade-existing-skill', {
      target_skill: top.skill,
      target_kind: top.kind,
      suggested_kind: recommendedKind
    });
    result.rationale.push(`existing route '${top.skill}' partially covers the request but only at minimum confidence`);
    result.rationale.push('this usually means the weak point is route depth, references, or capability coverage rather than missing surface area');
    result.follow_up.push(`upgrade '${top.skill}' before creating a new peer unless the boundary is genuinely distinct`);
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  result.recommendation = buildAdmissionDecision('create-new-skill', {
    suggested_kind: recommendedKind
  });
  result.rationale.push(`no current route owns this request strongly enough to justify reuse (selected='${explain.selectedSkill || 'none'}')`);
  result.rationale.push(`the request shape currently looks closest to a '${recommendedKind}' skill`);
  result.follow_up.push(`create the governed scaffold with: ${formatCreateCommand(recommendedKind)}`);
  result.follow_up.push('fill trigger boundaries and references before promoting the new skill into the live route surface');
  result.blueprint = buildSkillBlueprint(projectRoot, recommendedKind, suggestedSkillName, {
    scaffoldModules: supportsCapabilityModuleScaffold(recommendedKind)
  });
  return finalizeAdmissionResult(projectRoot, result, options);
}

function main(argv) {
  const [action, arg1, arg2, ...rest] = argv;
  if (!action) {
    fail('usage: manage-skill <record-opportunity|show-opportunity-queue|show-future-skill-pipeline|resolve-opportunity|admission-check|show-skill-blueprint|show-skill-hardening-blueprint|show-template-hardening-blueprint|show-skill-scaffold-upgrade-blueprint|show-skill-retirement-blueprint|show-admission-ledger|resolve-admission|evolution-check|show-evolution-ledger|resolve-evolution|show-review-queue|review-template|show-investment-backlog|show-lifecycle-governance|show-scaffold-governance|show-top-tier-wave|show-expert-source-families|register-expert-source-family|update-expert-source-family|archive-expert-source-family|restore-expert-source-family|diagnose-host-evolution|refresh-derived-governance|export-derived-governance|apply-derived-governance-export|show-pending-scaffolds|mark-reviewed|assess-top-tier|create|materialize-pending-scaffold|show|update|set-status|set-module-rating|archive|merge|delete|sync-scaffold-lineage|sync-runtime-proof|sync-host-metadata|sync-template-host-metadata|sync-route-metadata|run-host-smoke|reconcile-host-smoke> ...');
  }

  if (action === 'record-opportunity') {
    const projectRoot = getProjectRoot();
    let kind = null;
    let priority = 'normal';
    let horizon = 'next';
    let adjacentSkills = [];
    let rationale = [];
    const promptParts = [];
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--priority' && argsList[i + 1]) {
        priority = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--horizon' && argsList[i + 1]) {
        horizon = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--adjacent' && argsList[i + 1]) {
        adjacentSkills = parseListArgument(argsList[i + 1]);
        i += 1;
        continue;
      }
      if (argsList[i] === '--rationale' && argsList[i + 1]) {
        rationale = parseListArgument(argsList[i + 1]);
        i += 1;
        continue;
      }
      promptParts.push(argsList[i]);
    }
    return recordSkillOpportunity(projectRoot, promptParts.join(' '), {
      kind,
      priority,
      horizon,
      adjacentSkills,
      rationale
    });
  }

  if (action === 'show-opportunity-queue') {
    const projectRoot = getProjectRoot();
    let status = null;
    let priority = null;
    let kind = null;
    let horizon = null;
    let opportunityId = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--priority' && argsList[i + 1]) {
        priority = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--horizon' && argsList[i + 1]) {
        horizon = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--opportunity-id' && argsList[i + 1]) {
        opportunityId = argsList[i + 1];
        i += 1;
      }
    }
    return showOpportunityQueue(projectRoot, {
      status,
      priority,
      kind,
      horizon,
      opportunityId
    });
  }

  if (action === 'show-future-skill-pipeline') {
    const projectRoot = getProjectRoot();
    let stage = null;
    let priority = null;
    let kind = null;
    let skill = null;
    let blockedOnly = false;
    let includeResolved = false;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--stage' && argsList[i + 1]) {
        stage = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--priority' && argsList[i + 1]) {
        priority = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--blocked') {
        blockedOnly = true;
        continue;
      }
      if (argsList[i] === '--include-resolved') {
        includeResolved = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-future-skill-pipeline option '${argsList[i]}'`);
    }
    return showFutureSkillPipeline(projectRoot, {
      stage,
      priority,
      kind,
      skill,
      blockedOnly,
      includeResolved
    });
  }

  if (action === 'resolve-opportunity') {
    const projectRoot = getProjectRoot();
    if (!arg1) {
      fail('resolve-opportunity requires <opportunity-id>');
    }
    let status = 'implemented';
    let createdSkill = null;
    let admissionRequestId = null;
    let note = null;
    const resolutionArgs = [arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < resolutionArgs.length; i += 1) {
      if (resolutionArgs[i] === '--status' && resolutionArgs[i + 1]) {
        status = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--created-skill' && resolutionArgs[i + 1]) {
        createdSkill = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--admission-request-id' && resolutionArgs[i + 1]) {
        admissionRequestId = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--note' && resolutionArgs[i + 1]) {
        note = resolutionArgs[i + 1];
        i += 1;
      }
    }
    return {
      action: 'resolve-opportunity',
      entry: resolveOpportunity(projectRoot, arg1, {
        status,
        createdSkill,
        admissionRequestId,
        note
      })
    };
  }

  if (action === 'admission-check') {
    const projectRoot = getProjectRoot();
    let kind = null;
    let record = true;
    let opportunityId = null;
    const promptParts = [];
    const admissionArgs = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < admissionArgs.length; i += 1) {
      if (admissionArgs[i] === '--kind' && admissionArgs[i + 1]) {
        kind = admissionArgs[i + 1];
        i += 1;
        continue;
      }
      if (admissionArgs[i] === '--opportunity-id' && admissionArgs[i + 1]) {
        opportunityId = admissionArgs[i + 1];
        i += 1;
        continue;
      }
      if (admissionArgs[i] === '--no-record') {
        record = false;
        continue;
      }
      promptParts.push(admissionArgs[i]);
    }
    if (kind && !ALL_SKILL_KINDS.has(String(kind || '').trim())) {
      fail(`unsupported admission-check kind '${kind}'`);
    }
    return recommendAdmissionPath(projectRoot, promptParts.join(' '), { kind, record, opportunityId });
  }
  if (action === 'show-skill-blueprint') {
    const projectRoot = getProjectRoot();
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    let kind = null;
    let skillName = null;
    let scaffoldModules = false;

    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--scaffold-modules') {
        scaffoldModules = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !kind) {
        kind = argsList[i];
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !skillName) {
        skillName = argsList[i];
        continue;
      }
      fail(`unknown show-skill-blueprint option '${argsList[i]}'`);
    }

    if (!kind || !skillName) {
      fail('show-skill-blueprint requires <kind> <skill-name>');
    }
    if (!VALID_KINDS.has(kind)) {
      fail(`unsupported show-skill-blueprint kind '${kind}'`);
    }
    return buildSkillBlueprint(projectRoot, kind, skillName, {
      scaffoldModules: scaffoldModules || supportsCapabilityModuleScaffold(kind)
    });
  }
  if (action === 'show-skill-hardening-blueprint') {
    const projectRoot = getProjectRoot();
    let name = null;
    let relPath = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--name' && argsList[i + 1]) {
        name = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--path' && argsList[i + 1]) {
        relPath = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !name && !relPath) {
        name = argsList[i];
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-skill-hardening-blueprint option '${argsList[i]}'`);
    }
    if (!name && !relPath) {
      fail('show-skill-hardening-blueprint requires <skill-name> or --path <authoritative-relative-path>');
    }
    return buildSkillHardeningBlueprint(projectRoot, { name, path: relPath });
  }
  if (action === 'show-template-hardening-blueprint') {
    const projectRoot = getProjectRoot();
    let kind = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !kind) {
        kind = argsList[i];
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-template-hardening-blueprint option '${argsList[i]}'`);
    }
    return buildTemplateHardeningBlueprint(projectRoot, { kind });
  }
  if (action === 'show-skill-scaffold-upgrade-blueprint') {
    const projectRoot = getProjectRoot();
    let name = null;
    let relPath = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--name' && argsList[i + 1]) {
        name = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--path' && argsList[i + 1]) {
        relPath = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !name && !relPath) {
        name = argsList[i];
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-skill-scaffold-upgrade-blueprint option '${argsList[i]}'`);
    }
    if (!name && !relPath) {
      fail('show-skill-scaffold-upgrade-blueprint requires <skill-name> or --path <authoritative-relative-path>');
    }
    return buildSkillScaffoldUpgradeBlueprint(projectRoot, { name, path: relPath });
  }
  if (action === 'show-skill-retirement-blueprint') {
    const projectRoot = getProjectRoot();
    let name = null;
    let relPath = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--name' && argsList[i + 1]) {
        name = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--path' && argsList[i + 1]) {
        relPath = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !name && !relPath) {
        name = argsList[i];
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-skill-retirement-blueprint option '${argsList[i]}'`);
    }
    if (!name && !relPath) {
      fail('show-skill-retirement-blueprint requires <skill-name> or --path <authoritative-relative-path>');
    }
    return buildSkillRetirementBlueprint(projectRoot, { name, path: relPath });
  }
  if (action === 'show-admission-ledger') {
    const projectRoot = getProjectRoot();
    let status = null;
    let skill = null;
    let requestId = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--request-id' && argsList[i + 1]) {
        requestId = argsList[i + 1];
        i += 1;
      }
    }
    return showAdmissionLedger(projectRoot, { status, skill, requestId });
  }
  if (action === 'resolve-admission') {
    const projectRoot = getProjectRoot();
    if (!arg1) {
      fail('resolve-admission requires <request-id>');
    }
    let status = 'resolved';
    let createdSkill = null;
    let note = null;
    const resolutionArgs = [arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < resolutionArgs.length; i += 1) {
      if (resolutionArgs[i] === '--status' && resolutionArgs[i + 1]) {
        status = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--created-skill' && resolutionArgs[i + 1]) {
        createdSkill = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--note' && resolutionArgs[i + 1]) {
        note = resolutionArgs[i + 1];
        i += 1;
      }
    }
    return {
      action: 'resolve-admission',
      entry: resolveAdmissionDecision(projectRoot, arg1, {
        status,
        createdSkill,
        note
      })
    };
  }
  if (action === 'evolution-check') {
    const projectRoot = getProjectRoot();
    let record = true;
    const promptParts = [];
    const evolutionArgs = [arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < evolutionArgs.length; i += 1) {
      if (evolutionArgs[i] === '--no-record') {
        record = false;
        continue;
      }
      promptParts.push(evolutionArgs[i]);
    }
    return recommendEvolutionPath(projectRoot, arg1, promptParts.join(' '), { record });
  }
  if (action === 'show-evolution-ledger') {
    const projectRoot = getProjectRoot();
    let status = null;
    let skill = null;
    let requestId = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--request-id' && argsList[i + 1]) {
        requestId = argsList[i + 1];
        i += 1;
      }
    }
    return showEvolutionLedger(projectRoot, { status, skill, requestId });
  }
  if (action === 'resolve-evolution') {
    const projectRoot = getProjectRoot();
    if (!arg1) {
      fail('resolve-evolution requires <request-id>');
    }
    let status = 'resolved';
    let executedAction = null;
    let resultStatus = null;
    let mergedInto = null;
    let note = null;
    const resolutionArgs = [arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < resolutionArgs.length; i += 1) {
      if (resolutionArgs[i] === '--status' && resolutionArgs[i + 1]) {
        status = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--executed-action' && resolutionArgs[i + 1]) {
        executedAction = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--result-status' && resolutionArgs[i + 1]) {
        resultStatus = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--merged-into' && resolutionArgs[i + 1]) {
        mergedInto = resolutionArgs[i + 1];
        i += 1;
        continue;
      }
      if (resolutionArgs[i] === '--note' && resolutionArgs[i + 1]) {
        note = resolutionArgs[i + 1];
        i += 1;
      }
    }
    return {
      action: 'resolve-evolution',
      entry: resolveEvolutionDecision(projectRoot, arg1, {
        status,
        executedAction,
        resultStatus,
        mergedInto,
        note
      })
    };
  }
  if (action === 'show-review-queue') {
    const projectRoot = getProjectRoot();
    let status = null;
    let priority = null;
    let skill = null;
    let owner = null;
    let overdueOnly = false;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--priority' && argsList[i + 1]) {
        priority = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--owner' && argsList[i + 1]) {
        owner = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--overdue') {
        overdueOnly = true;
      }
    }
    return showReviewQueue(projectRoot, { status, priority, skill, owner, overdueOnly });
  }
  if (action === 'review-template') {
    const projectRoot = getProjectRoot();
    let kind = null;
    let date = null;
    let reviewCycleDays = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--date' && argsList[i + 1]) {
        date = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--review-cycle-days' && argsList[i + 1]) {
        reviewCycleDays = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !kind) {
        kind = argsList[i];
        continue;
      }
      fail(`unknown review-template option '${argsList[i]}'`);
    }
    return reviewTemplate(projectRoot, kind, { date, reviewCycleDays });
  }
  if (action === 'show-investment-backlog') {
    const projectRoot = getProjectRoot();
    let status = null;
    let priority = null;
    let category = null;
    let source = null;
    let skill = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--priority' && argsList[i + 1]) {
        priority = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--category' && argsList[i + 1]) {
        category = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--source' && argsList[i + 1]) {
        source = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
      }
    }
    return showSkillInvestmentBacklog(projectRoot, { status, priority, category, source, skill });
  }
  if (action === 'show-lifecycle-governance') {
    const projectRoot = getProjectRoot();
    let status = null;
    let kind = null;
    let skill = null;
    let includeStable = false;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--include-stable') {
        includeStable = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-lifecycle-governance option '${argsList[i]}'`);
    }
    return showLifecycleGovernance(projectRoot, { status, kind, skill, includeStable });
  }
  if (action === 'show-scaffold-governance') {
    const projectRoot = getProjectRoot();
    let kind = null;
    let skill = null;
    let status = null;
    let includeHealthy = false;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--kind' && argsList[i + 1]) {
        kind = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--include-healthy') {
        includeHealthy = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-scaffold-governance option '${argsList[i]}'`);
    }
    return showScaffoldGovernance(projectRoot, { kind, skill, status, includeHealthy });
  }
  if (action === 'show-top-tier-wave') {
    const projectRoot = getProjectRoot();
    let priority = null;
    let category = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--priority' && argsList[i + 1]) {
        priority = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--category' && argsList[i + 1]) {
        category = argsList[i + 1];
        i += 1;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      fail(`unknown show-top-tier-wave option '${argsList[i]}'`);
    }
    return showTopTierWave(projectRoot, { priority, category });
  }
  if (action === 'export-derived-governance') {
    const projectRoot = getProjectRoot();
    let outputDir = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--output-dir' && argsList[i + 1]) {
        outputDir = argsList[i + 1];
        i += 1;
      }
    }
    return exportDerivedGovernance(projectRoot, { outputDir });
  }
  if (action === 'apply-derived-governance-export') {
    const projectRoot = getProjectRoot();
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    const latest = argsList.includes('--latest');
    const exportPath = argsList.find((item) => normalizeString(item) && item !== '--latest');
    return applyDerivedGovernanceExport(projectRoot, exportPath, { latest });
  }
  if (action === 'show-expert-source-families') {
    const projectRoot = getProjectRoot();
    let family = null;
    let source = null;
    let parseErrorsOnly = false;
    let unmappedOnly = false;
    let staleOnly = false;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--family' && argsList[i + 1]) {
        family = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--source' && argsList[i + 1]) {
        source = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--parse-errors') {
        parseErrorsOnly = true;
        continue;
      }
      if (argsList[i] === '--unmapped') {
        unmappedOnly = true;
        continue;
      }
      if (argsList[i] === '--stale') {
        staleOnly = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
    }
    return showExpertSourceFamilies(projectRoot, { family, source, parseErrorsOnly, unmappedOnly, staleOnly });
  }
  if (action === 'register-expert-source-family') {
    const projectRoot = getProjectRoot();
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    const options = {};
    for (let i = 0; i < argsList.length; i += 1) {
      if ((argsList[i] === '--family-id' || argsList[i] === '--id') && argsList[i + 1]) {
        options.familyId = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--title' && argsList[i + 1]) {
        options.title = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--source' && argsList[i + 1]) {
        options.source = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--integration-file' && argsList[i + 1]) {
        options.integrationFile = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--raw-root' && argsList[i + 1]) {
        options.rawRoot = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--raw-source-label' && argsList[i + 1]) {
        options.rawSourceLabel = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--label' && argsList[i + 1]) {
        options.label = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--create-raw-root') {
        options.createRawRoot = true;
        continue;
      }
      if (argsList[i] === '--no-experimental-pack') {
        options.includeInExperimentalPack = false;
        continue;
      }
      if (argsList[i] === '--not-portable') {
        options.expectedPortable = false;
        continue;
      }
      fail(`unknown register-expert-source-family option '${argsList[i]}'`);
    }
    return registerExpertSourceFamily(projectRoot, options);
  }
  if (action === 'update-expert-source-family') {
    const projectRoot = getProjectRoot();
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    const options = {};
    for (let i = 0; i < argsList.length; i += 1) {
      if ((argsList[i] === '--family-id' || argsList[i] === '--id') && argsList[i + 1]) {
        options.familyId = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--title' && argsList[i + 1]) {
        options.title = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--source' && argsList[i + 1]) {
        options.source = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--integration-file' && argsList[i + 1]) {
        options.integrationFile = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--raw-root' && argsList[i + 1]) {
        options.rawRoot = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--raw-source-label' && argsList[i + 1]) {
        options.rawSourceLabel = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--label' && argsList[i + 1]) {
        options.label = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--status' && argsList[i + 1]) {
        options.status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--not-portable') {
        options.expectedPortable = false;
        continue;
      }
      if (argsList[i] === '--portable') {
        options.expectedPortable = true;
        continue;
      }
      fail(`unknown update-expert-source-family option '${argsList[i]}'`);
    }
    return updateExpertSourceFamily(projectRoot, options);
  }
  if (action === 'archive-expert-source-family') {
    const projectRoot = getProjectRoot();
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    let familyId = null;
    for (let i = 0; i < argsList.length; i += 1) {
      if ((argsList[i] === '--family-id' || argsList[i] === '--id') && argsList[i + 1]) {
        familyId = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !familyId) {
        familyId = argsList[i];
        continue;
      }
      fail(`unknown archive-expert-source-family option '${argsList[i]}'`);
    }
    return archiveExpertSourceFamily(projectRoot, familyId);
  }
  if (action === 'restore-expert-source-family') {
    const projectRoot = getProjectRoot();
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    let familyId = null;
    for (let i = 0; i < argsList.length; i += 1) {
      if ((argsList[i] === '--family-id' || argsList[i] === '--id') && argsList[i + 1]) {
        familyId = argsList[i + 1];
        i += 1;
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !familyId) {
        familyId = argsList[i];
        continue;
      }
      fail(`unknown restore-expert-source-family option '${argsList[i]}'`);
    }
    return restoreExpertSourceFamily(projectRoot, familyId);
  }
  if (action === 'diagnose-host-evolution') {
    return diagnoseHostEvolution(getProjectRoot());
  }
  if (action === 'refresh-derived-governance') {
    return refreshDerivedGovernance(getProjectRoot());
  }
  if (action === 'show-pending-scaffolds') {
    const projectRoot = getProjectRoot();
    let status = null;
    let skill = null;
    let pendingId = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--status' && argsList[i + 1]) {
        status = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--skill' && argsList[i + 1]) {
        skill = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--pending-id' && argsList[i + 1]) {
        pendingId = argsList[i + 1];
        i += 1;
      }
    }
    return showPendingScaffolds(projectRoot, { status, skill, pendingId });
  }
  if (action === 'mark-reviewed') {
    let date = null;
    let reviewCycleDays = null;
    let overdueOnly = false;
    let runAll = false;
    let skillName = null;
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--date' && argsList[i + 1]) {
        date = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--review-cycle-days' && argsList[i + 1]) {
        reviewCycleDays = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--overdue') {
        overdueOnly = true;
        continue;
      }
      if (argsList[i] === '--all') {
        runAll = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !skillName) {
        skillName = argsList[i];
        continue;
      }
      fail(`unknown mark-reviewed option '${argsList[i]}'`);
    }
    if (!skillName && !overdueOnly && !runAll) {
      fail('mark-reviewed requires <skill-name>, --overdue, or --all');
    }
    return markSkillReviewed(skillName, {
      date,
      reviewCycleDays,
      overdueOnly,
      all: runAll
    });
  }
  if (action === 'assess-top-tier') {
    const argsList = [arg1, arg2, ...rest].filter((item) => item != null);
    let runAll = false;
    let skillName = null;
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--all') {
        runAll = true;
        continue;
      }
      if (isJsonOutputFlag(argsList[i])) {
        continue;
      }
      if (!String(argsList[i]).startsWith('--') && !skillName) {
        skillName = argsList[i];
        continue;
      }
      fail(`unknown assess-top-tier option '${argsList[i]}'`);
    }
    if (!runAll && !skillName) {
      fail('assess-top-tier requires <skill-name> or --all');
    }
    return assessTopTierReadiness(getProjectRoot(), skillName, { all: runAll });
  }

  if (action === 'create') {
    const scaffoldModules = rest.includes('--scaffold-modules') || rest.includes('--scaffold-capability-modules');
    let requestId = null;
    let opportunityId = null;
    let deferWhenHostBlocked = false;
    const unknownArgs = [];
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === '--scaffold-modules' || rest[i] === '--scaffold-capability-modules') {
        continue;
      }
      if (rest[i] === '--defer-when-host-blocked') {
        deferWhenHostBlocked = true;
        continue;
      }
      if (rest[i] === '--request-id' && rest[i + 1]) {
        requestId = rest[i + 1];
        i += 1;
        continue;
      }
      if (rest[i] === '--opportunity-id' && rest[i + 1]) {
        opportunityId = rest[i + 1];
        i += 1;
        continue;
      }
      unknownArgs.push(rest[i]);
    }
    if (unknownArgs.length > 0) {
      fail(`unknown create option(s): ${unknownArgs.join(', ')}`);
    }
    return createSkill(arg1, arg2, { scaffoldModules, requestId, opportunityId, deferWhenHostBlocked });
  }
  if (action === 'materialize-pending-scaffold') {
    return materializePendingScaffold(getProjectRoot(), arg1);
  }
  if (action === 'show') return showSkill(arg1);
  if (action === 'update') {
    const assignments = [];
    const updateArgs = [arg2, ...rest].filter(Boolean);
    for (let i = 0; i < updateArgs.length; i += 1) {
      if (updateArgs[i] === '--set' && updateArgs[i + 1]) {
        assignments.push(updateArgs[i + 1]);
        i += 1;
      }
    }
    return updateSkill(arg1, assignments);
  }
  if (action === 'set-status') {
    if (!arg1 || !arg2) {
      fail(`set-status requires <skill-name> <${[...WRITABLE_SKILL_STATUSES].join('|')}>`);
    }
    let requestId = null;
    const statusArgs = rest.filter(Boolean);
    for (let i = 0; i < statusArgs.length; i += 1) {
      if (statusArgs[i] === '--request-id' && statusArgs[i + 1]) {
        requestId = statusArgs[i + 1];
        i += 1;
      }
    }
    return setSkillStatus(arg1, arg2, { requestId });
  }
  if (action === 'set-module-rating') {
    let skillName = null;
    let allowSkip = false;
    const positionals = [];
    const ratingArgs = [arg1, arg2, ...rest].filter(Boolean);

    for (let i = 0; i < ratingArgs.length; i += 1) {
      if (ratingArgs[i] === '--skill' && ratingArgs[i + 1]) {
        skillName = ratingArgs[i + 1];
        i += 1;
        continue;
      }
      if (ratingArgs[i] === '--allow-skip') {
        allowSkip = true;
        continue;
      }
      positionals.push(ratingArgs[i]);
    }

    if (skillName) {
      if (positionals.length !== 1) {
        fail('set-module-rating --skill requires <skill-name> <thin|strong-but-not-top|top-ready>');
      }
      return setCapabilityModuleRating(getProjectRoot(), {
        skillName,
        bucket: positionals[0],
        allowSkip
      });
    }

    if (positionals.length !== 2) {
      fail('set-module-rating requires <module-id> <thin|strong-but-not-top|top-ready> or --skill <skill-name> <thin|strong-but-not-top|top-ready>');
    }

    return setCapabilityModuleRating(getProjectRoot(), {
      moduleId: positionals[0],
      bucket: positionals[1],
      allowSkip
    });
  }
  if (action === 'archive') {
    let requestId = null;
    const archiveArgs = [arg2, ...rest].filter(Boolean);
    for (let i = 0; i < archiveArgs.length; i += 1) {
      if (archiveArgs[i] === '--request-id' && archiveArgs[i + 1]) {
        requestId = archiveArgs[i + 1];
        i += 1;
      }
    }
    return archiveSkill(arg1, { requestId });
  }
  if (action === 'merge') {
    if (!arg1 || !arg2) {
      fail('merge requires <skill-name> <target-skill>');
    }
    let requestId = null;
    let note = null;
    const mergeArgs = rest.filter(Boolean);
    for (let i = 0; i < mergeArgs.length; i += 1) {
      if (mergeArgs[i] === '--request-id' && mergeArgs[i + 1]) {
        requestId = mergeArgs[i + 1];
        i += 1;
        continue;
      }
      if (mergeArgs[i] === '--note' && mergeArgs[i + 1]) {
        note = mergeArgs[i + 1];
        i += 1;
      }
    }
    return mergeSkill(arg1, arg2, { requestId, note });
  }
  if (action === 'delete') {
    let name = null;
    let relPath = null;
    let requestId = null;
    const deleteArgs = [arg1, arg2, ...rest].filter(Boolean);
    for (let i = 0; i < deleteArgs.length; i += 1) {
      if (deleteArgs[i] === '--name' && deleteArgs[i + 1]) {
        name = deleteArgs[i + 1];
        i += 1;
        continue;
      }
      if (deleteArgs[i] === '--path' && deleteArgs[i + 1]) {
        relPath = deleteArgs[i + 1];
        i += 1;
        continue;
      }
      if (deleteArgs[i] === '--request-id' && deleteArgs[i + 1]) {
        requestId = deleteArgs[i + 1];
        i += 1;
      }
    }
    if (!name && !relPath) {
      fail('delete requires --name <skill-name> or --path <authoritative-relative-path>');
    }
    return removeSkill({ name, path: relPath, requestId });
  }
  if (action === 'sync-scaffold-lineage') {
    const projectRoot = getProjectRoot();
    let skillName = null;
    const syncArgs = [arg1, arg2, ...rest].filter(Boolean);

    for (let i = 0; i < syncArgs.length; i += 1) {
      if (syncArgs[i] === '--skill' && syncArgs[i + 1]) {
        skillName = syncArgs[i + 1];
        i += 1;
        continue;
      }
      if (syncArgs[i] === '--all') {
        skillName = null;
        continue;
      }
    }

    if (!skillName && arg1 && !String(arg1).startsWith('--') && arg1 !== 'all') {
      skillName = arg1;
    }

    return syncScaffoldLineage(projectRoot, {
      skillName
    });
  }
  if (action === 'sync-runtime-proof') {
    const projectRoot = getProjectRoot();
    let level = null;
    let evidenceTests;
    let runAll = false;
    let suggestEvidenceTests = false;
    let autoEvidenceTests = false;
    const syncArgs = [arg2, ...rest].filter(Boolean);

    for (let i = 0; i < syncArgs.length; i += 1) {
      if (syncArgs[i] === '--level' && syncArgs[i + 1]) {
        level = syncArgs[i + 1];
        i += 1;
        continue;
      }
      if (syncArgs[i] === '--evidence-tests' && syncArgs[i + 1]) {
        evidenceTests = parseListArgument(syncArgs[i + 1]);
        i += 1;
        continue;
      }
      if (syncArgs[i] === '--suggest-evidence-tests') {
        suggestEvidenceTests = true;
        continue;
      }
      if (syncArgs[i] === '--auto-evidence-tests') {
        autoEvidenceTests = true;
        suggestEvidenceTests = true;
        continue;
      }
      if (syncArgs[i] === '--all') {
        runAll = true;
      }
    }

    if (arg1 === '--all' || arg1 === 'all') {
      runAll = true;
    }

    if (runAll) {
      return syncAllRuntimeProofEntries(projectRoot, {
        suggestEvidenceTests,
        autoEvidenceTests
      });
    }

    if (!arg1) {
      fail('sync-runtime-proof requires <skill-name> or --all');
    }

    return syncRuntimeProofEntry(projectRoot, arg1, {
      level,
      evidenceTests,
      suggestEvidenceTests,
      autoEvidenceTests
    });
  }
  if (action === 'sync-host-metadata') {
    const projectRoot = getProjectRoot();
    let skillName = null;
    let includeExperimental = false;
    let includeDeprecated = false;
    const syncArgs = [arg1, arg2, ...rest].filter(Boolean);

    for (let i = 0; i < syncArgs.length; i += 1) {
      if (syncArgs[i] === '--skill' && syncArgs[i + 1]) {
        skillName = syncArgs[i + 1];
        i += 1;
        continue;
      }
      if (syncArgs[i] === '--include-experimental') {
        includeExperimental = true;
        continue;
      }
      if (syncArgs[i] === '--include-deprecated') {
        includeDeprecated = true;
        continue;
      }
    }

    if (!skillName && arg1 && !String(arg1).startsWith('--')) {
      skillName = arg1;
    }

    return syncHostMetadata(projectRoot, {
      skillName,
      includeExperimental,
      includeDeprecated
    });
  }
  if (action === 'sync-template-host-metadata') {
    const projectRoot = getProjectRoot();
    let kind = null;
    const syncArgs = [arg1, arg2, ...rest].filter(Boolean);

    for (let i = 0; i < syncArgs.length; i += 1) {
      if (syncArgs[i] === '--kind' && syncArgs[i + 1]) {
        kind = syncArgs[i + 1];
        i += 1;
        continue;
      }
      if (!String(syncArgs[i]).startsWith('--') && !kind) {
        kind = syncArgs[i];
        continue;
      }
      fail(`unknown sync-template-host-metadata option '${syncArgs[i]}'`);
    }

    return syncTemplateHostMetadata(projectRoot, kind);
  }
  if (action === 'sync-route-metadata') {
    const projectRoot = getProjectRoot();
    let skillName = null;
    let includeExperimental = false;
    let includeDeprecated = false;
    const syncArgs = [arg1, arg2, ...rest].filter(Boolean);

    for (let i = 0; i < syncArgs.length; i += 1) {
      if (syncArgs[i] === '--skill' && syncArgs[i + 1]) {
        skillName = syncArgs[i + 1];
        i += 1;
        continue;
      }
      if (syncArgs[i] === '--include-experimental') {
        includeExperimental = true;
        continue;
      }
      if (syncArgs[i] === '--include-deprecated') {
        includeDeprecated = true;
      }
    }

    if (!skillName && arg1 && !String(arg1).startsWith('--')) {
      skillName = arg1;
    }

    return syncRouteMetadata(projectRoot, {
      skillName,
      includeExperimental,
      includeDeprecated
    });
  }
  if (action === 'run-host-smoke') {
    const projectRoot = getProjectRoot();
    let host = 'codex';
    let runAll = false;
    let promoteHostSmoked = false;
    const smokeArgs = [arg2, ...rest].filter(Boolean);

    for (let i = 0; i < smokeArgs.length; i += 1) {
      if (smokeArgs[i] === '--host' && smokeArgs[i + 1]) {
        host = smokeArgs[i + 1];
        i += 1;
        continue;
      }
      if (smokeArgs[i] === '--all') {
        runAll = true;
        continue;
      }
      if (smokeArgs[i] === '--promote-host-smoked') {
        promoteHostSmoked = true;
      }
    }

    if (arg1 === '--all' || arg1 === 'all') {
      runAll = true;
    }

    if (!runAll && !arg1) {
      fail('run-host-smoke requires <skill-name> or --all');
    }

    return runHostSmoke(projectRoot, {
      host,
      runAll,
      skillName: runAll ? null : arg1,
      promoteHostSmoked
    });
  }
  if (action === 'reconcile-host-smoke') {
    const projectRoot = getProjectRoot();
    let host = 'codex';
    let runAll = false;
    let rerun = false;
    let invalidateDrift = false;
    let promoteHostSmoked = false;
    const reconcileArgs = [arg2, ...rest].filter(Boolean);

    for (let i = 0; i < reconcileArgs.length; i += 1) {
      if (reconcileArgs[i] === '--host' && reconcileArgs[i + 1]) {
        host = reconcileArgs[i + 1];
        i += 1;
        continue;
      }
      if (reconcileArgs[i] === '--all') {
        runAll = true;
        continue;
      }
      if (reconcileArgs[i] === '--rerun') {
        rerun = true;
        continue;
      }
      if (reconcileArgs[i] === '--invalidate-drift') {
        invalidateDrift = true;
        continue;
      }
      if (reconcileArgs[i] === '--promote-host-smoked') {
        promoteHostSmoked = true;
      }
    }

    if (arg1 === '--all' || arg1 === 'all') {
      runAll = true;
    }

    if (!runAll && !arg1) {
      fail('reconcile-host-smoke requires <skill-name> or --all');
    }

    return reconcileHostSmoke(projectRoot, {
      host,
      runAll,
      skillName: runAll ? null : arg1,
      rerun,
      invalidateDrift,
      promoteHostSmoked
    });
  }

  fail(`unknown action '${action}'`);
}

if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  main,
  assessTopTierReadiness,
  buildSkillHardeningBlueprint,
  buildTemplateHardeningBlueprint,
  buildSkillScaffoldUpgradeBlueprint,
  buildSkillRetirementBlueprint,
  createSkill,
  materializePendingScaffold,
  showSkill,
  showPendingScaffolds,
  showAdmissionLedger,
  showFutureSkillPipeline,
  showEvolutionLedger,
  showExpertSourceFamilies,
  registerExpertSourceFamily,
  updateExpertSourceFamily,
  archiveExpertSourceFamily,
  restoreExpertSourceFamily,
  updateSkill,
  setSkillStatus,
  setCapabilityModuleRating,
  archiveSkill,
  mergeSkill,
  removeSkill,
  syncScaffoldLineage,
  reviewTemplate,
  recommendAdmissionPath,
  recommendEvolutionPath,
  resolveAdmissionDecision,
  resolveEvolutionDecision,
  syncRuntimeProofEntry,
  syncAllRuntimeProofEntries,
  writeRuntimeProofRegistry,
  syncHostMetadata,
  syncTemplateHostMetadata,
  syncRouteMetadata,
  reconcileHostSmoke,
  collectJestTestCases,
  suggestEvidenceTests,
  diagnoseHostEvolution,
};
