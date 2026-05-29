'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { analyzeSkillSystem } = require('../personal-skill-system/skills/tools/lib/skill-system');
const {
  buildSkillInvestmentBacklog,
  buildSkillInvestmentBacklogMarkdown
} = require('../personal-skill-system/skills/tools/lib/skill-investment-governance');
const { writeSystemReadiness } = require('../personal-skill-system/skills/tools/lib/skill-system-readiness');
const {
  SYSTEM_READINESS_SCHEMA_VERSION,
  SYSTEM_READINESS_SIGNAL_ORDER,
  SYSTEM_READINESS_SUMMARY_KEYS
} = require('../personal-skill-system/skills/tools/lib/skill-system-readiness');
const { buildReviewQueue } = require('../personal-skill-system/skills/tools/lib/skill-review-governance');
const { collectSkillRecords } = require('../personal-skill-system/skills/tools/lib/skill-system-skills');
const { writeExpertSourceFamilyScorecard } = require('../personal-skill-system/skills/tools/lib/expert-source-integration');
const { validateRouteMap, validateStableRouteEvidence } = require('../personal-skill-system/skills/tools/lib/skill-system-routing');
const {
  ROUTE_FIXTURE_SCHEMA_VERSION,
  buildGovernedRouteFixture,
  buildExpectedGovernedRouteFixtureForRecord,
  findGovernedRouteFixtureForSkill,
  hasRouteFixtureEvidence,
  isGovernedRouteFixture,
  parseRouteFixtureExpectations,
  summarizeRouteFixtureEvidence
} = require('../personal-skill-system/skills/tools/lib/skill-route-fixture-governance');
const {
  PERSONAL_CORE_REQUIRED_INCLUDES,
  EXPERIMENTAL_REQUIRED_INCLUDES,
  syncExperimentalPackManifest
} = require('../personal-skill-system/skills/tools/lib/skill-system-packs');
const {
  EXPERT_SOURCE_FAMILY_STATUS_ORDER,
  ACTIVE_EXPERT_SOURCE_FAMILY_STATUSES,
  EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER,
  DEFAULT_EXPERT_SOURCE_FAMILY_NAME,
  DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE,
  DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT,
  EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES,
  normalizeExpertSourceFamilyStatus,
  isKnownExpertSourceFamilyStatus,
  isActiveExpertSourceFamilyStatus,
  isDefaultExpertSourceFamily,
  canArchiveExpertSourceFamily,
  isValidExpertSourceFamilyId,
  normalizeExpertSourceExperimentalPackStatus,
  isKnownExpertSourceExperimentalPackStatus,
  getDefaultExpertSourceIntegrationFile,
  getDefaultExpertSourceRawRoot,
  getRequiredExperimentalPackExpertSourceIncludes
} = require('../personal-skill-system/skills/tools/lib/skill-expert-source-governance');
const {
  SKILL_KIND_ORDER,
  TEMPLATE_KINDS,
  KIND_TO_LAYER_MAP,
  KIND_BY_LAYER,
  MIN_REFERENCE_FILES_BY_KIND,
  TOP_TIER_REFERENCE_FLOOR_BY_KIND,
  TEMPLATE_REFERENCE_FLOOR_BY_KIND,
  getPlaceholderRouteConfig,
  supportsCapabilityModuleScaffold,
  shouldCreatePlaceholderRoute,
  shouldAppearOnActiveRouteSurface,
  shouldTrackScaffoldLineage,
  supportsGovernedRouteArtifacts,
  shouldSyncGovernedRouteArtifacts,
  participatesInSkillLevelSummary,
  shouldAppearInSkillLevelSummary
} = require('../personal-skill-system/skills/tools/lib/skill-kind-governance');
const {
  SKILL_VISIBILITY_ORDER,
  SKILL_TRIGGER_MODE_ORDER,
  SKILL_RUNTIME_ORDER,
  SKILL_EXECUTOR_ORDER,
  SKILL_RISK_LEVEL_ORDER,
  SKILL_SUPPORTED_HOSTS_ORDER
} = require('../personal-skill-system/skills/tools/lib/skill-frontmatter-governance');
const {
  buildSkillFrontmatterSchema
} = require('../personal-skill-system/skills/tools/lib/skill-frontmatter-schema-governance');
const {
  DEFAULT_SKILL_OWNER,
  REVIEW_CYCLE_DAYS_BY_KIND,
  buildSeedReviewMetadata,
  deriveReviewSchedule
} = require('../personal-skill-system/skills/tools/lib/skill-review-governance');
const {
  buildSkillInvestmentBacklogSchema
} = require('../personal-skill-system/skills/tools/lib/skill-investment-backlog-schema-governance');
const {
  buildReviewQueueSchema
} = require('../personal-skill-system/skills/tools/lib/skill-review-queue-schema-governance');
const {
  buildSystemReadinessSchema,
  buildHostEvolutionSchema
} = require('../personal-skill-system/skills/tools/lib/skill-readiness-schema-governance');
const {
  buildExpertSourceFamiliesSchema,
  buildExpertSourceFamilyScorecardSchema,
  buildExpertSourceIntegrationSchema
} = require('../personal-skill-system/skills/tools/lib/skill-expert-source-schema-governance');
const {
  CAPABILITY_RATINGS_SCHEMA_VERSION,
  buildCapabilityRatingsSchema
} = require('../personal-skill-system/skills/tools/lib/skill-capability-ratings-schema-governance');
const {
  SKILL_STATUS_ORDER,
  WRITABLE_SKILL_STATUSES,
  LIVE_SKILL_STATUSES,
  REVIEW_GOVERNED_SKILL_STATUSES,
  RUNTIME_PROOF_GOVERNED_SKILL_STATUSES,
  SKILL_LEVEL_BUCKET_BY_STATUS,
  RUNTIME_PROOF_LEVELS,
  EVOLUTION_DECISION_ACTIONS,
  EVOLUTION_ACTION_DEFAULT_TARGET_STATUS,
  isKnownSkillStatus,
  isWritableSkillStatus,
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
  isKnownEvolutionAction,
  getDefaultTargetStatusForEvolutionAction
} = require('../personal-skill-system/skills/tools/lib/skill-lifecycle-governance');
const {
  buildSkillCatalogMarkdown
} = require('../personal-skill-system/skills/tools/lib/skill-registry-governance');
const {
  buildAuthoringGovernanceReferenceMarkdown
} = require('../personal-skill-system/skills/tools/lib/skill-authoring-governance');
const {
  STABLE_TOP_TIER_BLOCKER_FIELDS,
  STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER,
  buildStableTopTierUpgradeBoard,
  buildStableTopTierPortfolio,
  buildStableTopTierHardeningPlan,
  resolveStableTopTierPriority
} = require('../personal-skill-system/skills/tools/lib/skill-top-tier-governance');
const {
  HOST_EVOLUTION_SCHEMA_VERSION
} = require('../personal-skill-system/skills/tools/lib/skill-system-host-evolution');
const {
  SMOKE_MANIFEST_SCHEMA_VERSION,
  SMOKE_MANIFEST_COMMAND_CWD_MODES,
  SMOKE_MANIFEST_FRESHNESS_UNITS,
  validateSmokeManifest
} = require('../personal-skill-system/skills/tools/lib/skill-smoke-manifest-governance');
const {
  HOST_SMOKE_POLICY_TIERS,
  HOST_SMOKE_TARGET_LEVELS,
  HOST_SMOKE_RESULT_STATUSES,
  HOST_SMOKE_COMMAND_CWD_MODES,
  HOST_SMOKE_FRESHNESS_UNITS,
  HOST_SMOKE_EVIDENCE_STATUSES,
  HOST_SMOKE_GOVERNANCE_STATUSES,
  HOST_SMOKE_INVALIDATION_REASONS,
  AUTHORITATIVE_SKILL_TREE_CONSTRAINT,
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays,
  normalizeHostSmokePolicy,
  deriveHostSmokePolicyFromRecord,
  isGovernedRuntimeProofRecord,
  getHostWriteabilitySeverity,
  isCriticalHostWriteabilityArtifact
} = require('../personal-skill-system/skills/tools/lib/skill-host-governance');
const {
  FUTURE_SKILL_PRIORITY_ORDER,
  FUTURE_SKILL_HORIZON_ORDER,
  FUTURE_SKILL_REGISTRY_SOURCE,
  OPPORTUNITY_STATUS_ORDER,
  ACTIVE_OPPORTUNITY_STATUSES,
  ADMISSION_DECISION_ACTIONS,
  ADMISSION_DECISION_ACTION_ORDER,
  ADMISSION_STATUS_ORDER,
  ACTIVE_ADMISSION_STATUSES,
  TERMINAL_ADMISSION_STATUSES,
  BLOCKING_ADMISSION_STATUSES,
  getRequiredAdmissionDecisionFields,
  getAllowedAdmissionDecisionFields,
  normalizeAdmissionDecision,
  buildAdmissionDecision,
  collectAdmissionDecisionContractErrors,
  buildAdmissionOpportunityNote,
  PENDING_SCAFFOLD_STATUS_ORDER,
  ACTIVE_PENDING_SCAFFOLD_STATUSES,
  normalizeFuturePriority,
  normalizeFutureHorizon,
  normalizeOpportunityStatus,
  isKnownOpportunityStatus,
  isActiveOpportunityStatus,
  normalizeAdmissionDecisionAction,
  isKnownAdmissionDecisionAction,
  getDefaultAdmissionStatusForDecision,
  getDefaultOpportunityStatusForDecision,
  normalizeAdmissionStatus,
  isKnownAdmissionStatus,
  isActiveAdmissionStatus,
  isTerminalAdmissionStatus,
  isBlockingAdmissionStatus,
  normalizePendingScaffoldStatus,
  isKnownPendingScaffoldStatus,
  isActivePendingScaffoldStatus,
  buildStatusCountSummary
} = require('../personal-skill-system/skills/tools/lib/skill-future-governance');
const {
  SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
  ADMISSION_LEDGER_SCHEMA_VERSION,
  EVOLUTION_LEDGER_SCHEMA_VERSION,
  PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION,
  buildSkillOpportunityQueueSchema,
  buildAdmissionLedgerSchema,
  buildEvolutionLedgerSchema,
  buildPendingScaffoldRegistrySchema
} = require('../personal-skill-system/skills/tools/lib/skill-future-registry-schema-governance');
const {
  FUTURE_SKILL_PIPELINE_STAGE_ORDER,
  ACTIVE_FUTURE_SKILL_PIPELINE_STAGES,
  TERMINAL_FUTURE_SKILL_PIPELINE_STAGES,
  normalizeFutureSkillPipelineStage,
  isKnownFutureSkillPipelineStage,
  isActiveFutureSkillPipelineStage,
  isTerminalFutureSkillPipelineStage,
  getFutureSkillPipelineThreadId,
  buildFutureSkillPipelineView
} = require('../personal-skill-system/skills/tools/lib/skill-future-pipeline-governance');
const {
  GOVERNANCE_ARTIFACT_ORDER,
  WRITEABILITY_TRACKED_GOVERNANCE_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_FINGERPRINT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  getGovernanceArtifactDefinition,
  getGovernanceArtifactRelativePath,
  listGovernanceArtifacts,
  getDerivedGovernanceFingerprintSourcePaths,
  getDerivedGovernanceExportArtifacts,
  getDerivedGovernanceExportArtifactPaths
} = require('../personal-skill-system/skills/tools/lib/skill-generated-artifact-governance');
const {
  CAPABILITY_RATING_BUCKET_SEQUENCE,
  CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE,
  CAPABILITY_RATINGS_DOC_RELATIVE_PATH,
  getCapabilityRatingsDocPath,
  getCapabilityRatingsPath,
  buildCapabilityModuleTopReadyBlockers,
  applyCapabilityRatingsGovernance
} = require('../personal-skill-system/skills/tools/lib/skill-capability-ratings-governance');
const {
  RUNTIME_PROOF_SCHEMA_VERSION,
  MIN_RUNTIME_PROOF_CONTRACTS,
  RUNTIME_PROOF_EVIDENCE_SOURCE_ORDER,
  HOST_SMOKED_EVIDENCE_FAILURE_REASONS,
  normalizeEvidenceTests,
  shouldHaveRuntimeProofEntry,
  defaultRuntimeProofLevelForStatus,
  hasMinimumRuntimeProofContracts,
  needsEvidenceTestsForRuntimeProofLevel,
  hasRequiredRuntimeProofEvidenceTests,
  resolveEvidenceTests,
  buildRuntimeProofRegistryDocument,
  describeHostSmokedEvidenceFailure
} = require('../personal-skill-system/skills/tools/lib/skill-runtime-proof-governance');
const {
  refreshDerivedGovernanceArtifacts
} = require('../personal-skill-system/skills/tools/lib/skill-system-derived-governance');
const {
  DERIVED_GOVERNANCE_ARTIFACT_PATHS,
  DERIVED_GOVERNANCE_REFRESH_STEP_ORDER,
  DERIVED_GOVERNANCE_REFRESH_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_REFRESH_ARTIFACT_PATHS,
  getDerivedGovernanceRefreshStepDefinition,
  listDerivedGovernanceRefreshSteps,
  listDerivedGovernanceRefreshPlan,
  findDerivedGovernanceRefreshStepByArtifactId
} = require('../personal-skill-system/skills/tools/lib/skill-system-derived-governance-contract');
const {
  SKILL_REGISTRY_SCHEMA_VERSION,
  SKILL_REGISTRY_SOURCE,
  buildSkillRegistryDocument
} = require('../personal-skill-system/skills/tools/lib/skill-registry-governance');

const manageSkillModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'manage-skill', 'scripts', 'run.js');
const verifySkillSystemRunnerPath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'verify-skill-system', 'scripts', 'run.js');

describe('skill system governance', () => {
  let tmpDir;

  function copyBundleFixture(repoRoot) {
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });
  }

  function seedTopDeveloperRawFixture(repoRoot) {
    const bundleRoot = path.join(repoRoot, 'personal-skill-system');
    const integrationPath = path.join(bundleRoot, 'registry', 'top-developer-integration.generated.json');
    const integration = JSON.parse(fs.readFileSync(integrationPath, 'utf8'));
    const rawRoot = path.join(repoRoot, 'top_developer');
    const sourceIndex = Array.isArray(integration['source-index']) ? integration['source-index'] : [];
    const sourceSkills = [...new Set(sourceIndex
      .map((entry) => String(entry && entry['source-skill'] || '').trim())
      .filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));

    fs.mkdirSync(rawRoot, { recursive: true });
    for (const sourceSkill of sourceSkills) {
      const sourceDir = path.join(rawRoot, sourceSkill);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), [
        '---',
        `name: ${sourceSkill}`,
        `description: raw expert source fixture for ${sourceSkill}`,
        '---',
        '',
        `# ${sourceSkill}`,
        ''
      ].join('\n'));
    }
  }

  function copyBundleWithTopDeveloper(repoRoot) {
    copyBundleFixture(repoRoot);
    seedTopDeveloperRawFixture(repoRoot);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pss-governance-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function stripScaffoldLineageFromSkill(skillFile) {
    const original = fs.readFileSync(skillFile, 'utf8');
    const next = original
      .replace(/^scaffold-origin: .*\r?\n/m, '')
      .replace(/^scaffold-version: .*\r?\n/m, '');
    fs.writeFileSync(skillFile, next, 'utf8');
  }

  test('analyzeSkillSystem validates canonical template scaffolds', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);

    expect(report.metrics.templateScaffolds).toBe(6);
    expect(report.findings.some((item) => item.message.includes("template 'tool' is missing scripts/smoke.json"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'domain' only has"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'workflow' only has"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'tool' is missing agents/openai.yaml"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'adapter' only has"))).toBe(false);
  });

  test('verify-skill-system fails when a skill uses a non-canonical lifecycle status', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillFile = path.join(target, 'skills', 'tools', 'verify-module', 'SKILL.md');
    const skillText = fs.readFileSync(skillFile, 'utf8').replace('status: stable', 'status: rogue');
    fs.writeFileSync(skillFile, skillText, 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.status).toBe('fail');
    expect(report.findings.some((item) =>
      item.file === 'skills/tools/verify-module/SKILL.md'
      && item.message.includes("status 'rogue' is not supported")
    )).toBe(true);
  });

  test('verify-skill-system exits non-zero when the report status is fail', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillFile = path.join(target, 'skills', 'tools', 'verify-module', 'SKILL.md');
    const skillText = fs.readFileSync(skillFile, 'utf8').replace('status: stable', 'status: rogue');
    fs.writeFileSync(skillFile, skillText, 'utf8');

    const result = spawnSync(process.execPath, [verifySkillSystemRunnerPath, '--target', target, '--json'], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    if (result.error) {
      expect(result.error).toEqual(expect.objectContaining({ code: 'EPERM' }));
      return;
    }

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('fail');
    expect(payload.findings.some((item) =>
      item.file === 'skills/tools/verify-module/SKILL.md'
      && item.message.includes("status 'rogue' is not supported")
    )).toBe(true);
  });

  test('runtime emit marks fail reports with a non-zero process exit code', () => {
    const runtime = require('../personal-skill-system/skills/tools/lib/runtime');
    const originalExitCode = process.exitCode;
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.exitCode = 0;
      runtime.emit({ status: 'fail', tool: 'verify-skill-system' }, { json: true });
      expect(process.exitCode).toBe(1);

      process.exitCode = 0;
      runtime.emit({ status: 'block', tool: 'pre-merge-gate' }, { json: true });
      expect(process.exitCode).toBe(1);

      process.exitCode = 0;
      runtime.emit({ status: 'warn', tool: 'verify-skill-system' }, { json: true });
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = originalExitCode;
      writeSpy.mockRestore();
    }
  });

  test('skill kind governance stays centralized and internally consistent', () => {
    expect(TEMPLATE_KINDS).toEqual(SKILL_KIND_ORDER);

    for (const kind of SKILL_KIND_ORDER) {
      const layer = KIND_TO_LAYER_MAP.get(kind);
      expect(typeof layer).toBe('string');
      expect(KIND_BY_LAYER[layer]).toBe(kind);
      expect(MIN_REFERENCE_FILES_BY_KIND[kind]).toBeGreaterThanOrEqual(2);
      expect(TOP_TIER_REFERENCE_FLOOR_BY_KIND[kind]).toBeGreaterThanOrEqual(MIN_REFERENCE_FILES_BY_KIND[kind]);
      expect(TEMPLATE_REFERENCE_FLOOR_BY_KIND[kind]).toBeGreaterThanOrEqual(MIN_REFERENCE_FILES_BY_KIND[kind]);
    }

    expect(getPlaceholderRouteConfig('router')).toBeNull();
    expect(getPlaceholderRouteConfig('domain')).toEqual(expect.objectContaining({ namespace: 'domain' }));
    expect(getPlaceholderRouteConfig('workflow')).toEqual(expect.objectContaining({ namespace: 'workflow' }));
    expect(getPlaceholderRouteConfig('tool')).toEqual(expect.objectContaining({ namespace: 'tool' }));
    expect(getPlaceholderRouteConfig('guard')).toEqual(expect.objectContaining({ namespace: 'guard' }));
    expect(getPlaceholderRouteConfig('adapter')).toEqual(expect.objectContaining({ namespace: 'adapter' }));

    expect(supportsCapabilityModuleScaffold('domain')).toBe(true);
    expect(supportsCapabilityModuleScaffold('workflow')).toBe(true);
    expect(supportsCapabilityModuleScaffold('tool')).toBe(false);
    expect(supportsCapabilityModuleScaffold('guard')).toBe(false);
    expect(supportsCapabilityModuleScaffold('router')).toBe(false);
    expect(supportsCapabilityModuleScaffold('adapter')).toBe(false);

    expect(shouldCreatePlaceholderRoute('domain', true)).toBe(true);
    expect(shouldCreatePlaceholderRoute('workflow', true)).toBe(true);
    expect(shouldCreatePlaceholderRoute('tool', true)).toBe(true);
    expect(shouldCreatePlaceholderRoute('guard', true)).toBe(true);
    expect(shouldCreatePlaceholderRoute('router', true)).toBe(false);
    expect(shouldCreatePlaceholderRoute('adapter', true)).toBe(false);

    expect(shouldTrackScaffoldLineage('domain')).toBe(true);
    expect(shouldTrackScaffoldLineage('workflow')).toBe(true);
    expect(shouldTrackScaffoldLineage('tool')).toBe(true);
    expect(shouldTrackScaffoldLineage('guard')).toBe(true);
    expect(shouldTrackScaffoldLineage('router')).toBe(false);
    expect(shouldTrackScaffoldLineage('adapter')).toBe(false);

    expect(shouldAppearOnActiveRouteSurface({ userInvocable: true, kind: 'domain', status: 'stable' })).toBe(true);
    expect(shouldAppearOnActiveRouteSurface({ userInvocable: true, kind: 'router', status: 'stable' })).toBe(false);
    expect(shouldAppearOnActiveRouteSurface({ userInvocable: true, kind: 'adapter', status: 'stable' })).toBe(false);
    expect(shouldAppearOnActiveRouteSurface({ userInvocable: true, kind: 'tool', status: 'archived' })).toBe(false);

    expect(supportsGovernedRouteArtifacts('domain')).toBe(true);
    expect(supportsGovernedRouteArtifacts('workflow')).toBe(true);
    expect(supportsGovernedRouteArtifacts('tool')).toBe(true);
    expect(supportsGovernedRouteArtifacts('guard')).toBe(true);
    expect(supportsGovernedRouteArtifacts('router')).toBe(false);
    expect(supportsGovernedRouteArtifacts('adapter')).toBe(false);

    expect(shouldSyncGovernedRouteArtifacts({ userInvocable: true, kind: 'tool', status: 'stable' })).toBe(true);
    expect(shouldSyncGovernedRouteArtifacts({ userInvocable: true, kind: 'router', status: 'stable' })).toBe(false);
    expect(shouldSyncGovernedRouteArtifacts({ userInvocable: false, kind: 'adapter', status: 'stable' })).toBe(false);
    expect(shouldSyncGovernedRouteArtifacts({ userInvocable: true, kind: 'guard', status: 'archived' })).toBe(false);

    expect(participatesInSkillLevelSummary('router')).toBe(true);
    expect(participatesInSkillLevelSummary('domain')).toBe(true);
    expect(participatesInSkillLevelSummary('adapter')).toBe(false);
    expect(shouldAppearInSkillLevelSummary({ kind: 'router', status: 'stable' })).toBe(true);
    expect(shouldAppearInSkillLevelSummary({ kind: 'adapter', status: 'stable' })).toBe(false);
    expect(shouldAppearInSkillLevelSummary({ kind: 'tool', status: 'archived' })).toBe(false);
  });

  test('probeDirectoryCreateAccess treats cleanup failure after mkdir as non-blocking create success', () => {
    const { probeDirectoryCreateAccess } = require('../personal-skill-system/skills/tools/lib/skill-system-common');
    const targetDir = path.join(tmpDir, 'bundle', 'skills', 'domains', '__probe__');
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    const rmSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {
      const error = new Error('mocked cleanup block');
      error.code = 'EPERM';
      throw error;
    });

    try {
      const result = probeDirectoryCreateAccess(targetDir);
      expect(result).toEqual(expect.objectContaining({
        ok: true,
        path: path.resolve(targetDir),
        parent: path.resolve(path.dirname(targetDir)),
        cleanup: expect.objectContaining({
          ok: false,
          code: 'EPERM'
        })
      }));
    } finally {
      rmSpy.mockRestore();
      mkdirSpy.mockRestore();
    }
  });

  test('skill frontmatter schema stays aligned with centralized frontmatter governance', () => {
    const schemaPath = path.join(__dirname, '..', 'personal-skill-system', 'registry', 'skill.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const governedSchema = buildSkillFrontmatterSchema();
    const kindEnum = (((schema.properties || {}).kind || {}).enum || []).slice();
    const visibilityEnum = (((schema.properties || {}).visibility || {}).enum || []).slice();
    const triggerModeEnum = (((((schema.properties || {})['trigger-mode'] || {}).items) || {}).enum || []).slice();
    const runtimeEnum = (((schema.properties || {}).runtime || {}).enum || []).slice();
    const executorEnum = (((schema.properties || {}).executor || {}).enum || []).slice();
    const riskLevelEnum = (((schema.properties || {})['risk-level'] || {}).enum || []).slice();
    const supportedHostsEnum = (((((schema.properties || {})['supported-hosts'] || {}).items) || {}).enum || []).slice();
    const statusEnum = (((schema.properties || {}).status || {}).enum || []).slice();

    expect(kindEnum).toEqual(SKILL_KIND_ORDER);
    expect(visibilityEnum).toEqual(SKILL_VISIBILITY_ORDER);
    expect(triggerModeEnum).toEqual(SKILL_TRIGGER_MODE_ORDER);
    expect(runtimeEnum).toEqual(SKILL_RUNTIME_ORDER);
    expect(executorEnum).toEqual(SKILL_EXECUTOR_ORDER);
    expect(riskLevelEnum).toEqual(SKILL_RISK_LEVEL_ORDER);
    expect(supportedHostsEnum).toEqual(SKILL_SUPPORTED_HOSTS_ORDER);
    expect(statusEnum).toEqual(SKILL_STATUS_ORDER);
    expect(schema).toEqual(governedSchema);

    for (const adapterSkill of [
      path.join(__dirname, '..', 'personal-skill-system', 'skills', 'adapters', 'claude', 'SKILL.md'),
      path.join(__dirname, '..', 'personal-skill-system', 'skills', 'adapters', 'codex', 'SKILL.md'),
      path.join(__dirname, '..', 'personal-skill-system', 'skills', 'adapters', 'gemini', 'SKILL.md')
    ]) {
      const text = fs.readFileSync(adapterSkill, 'utf8');
      expect(text).toContain('kind: adapter');
      expect(text).toContain('visibility: internal');
    }
  });

  test('skill lifecycle governance stays centralized and internally consistent', () => {
    expect(SKILL_STATUS_ORDER).toEqual(['draft', 'experimental', 'stable', 'deprecated', 'archived']);
    expect([...WRITABLE_SKILL_STATUSES]).toEqual(SKILL_STATUS_ORDER);

    for (const status of [...SKILL_STATUS_ORDER, 'deleted']) {
      expect(isKnownSkillStatus(status)).toBe(true);
    }

    expect(isWritableSkillStatus('draft')).toBe(true);
    expect(isWritableSkillStatus('archived')).toBe(true);
    expect(isWritableSkillStatus('deleted')).toBe(false);

    expect([...LIVE_SKILL_STATUSES].sort()).toEqual(['deprecated', 'experimental', 'stable']);
    expect([...REVIEW_GOVERNED_SKILL_STATUSES].sort()).toEqual(['deprecated', 'experimental', 'stable']);
    expect([...RUNTIME_PROOF_GOVERNED_SKILL_STATUSES].sort()).toEqual(['deprecated', 'experimental', 'stable']);

    expect(isReviewGovernedSkillStatus('stable')).toBe(true);
    expect(isReviewGovernedSkillStatus('draft')).toBe(false);
    expect(isRuntimeProofGovernedSkillStatus('deprecated')).toBe(true);
    expect(isRuntimeProofGovernedSkillStatus('archived')).toBe(false);

    expect(getSkillLevelBucketForStatus('stable')).toBe('top-level-enough-now');
    expect(getSkillLevelBucketForStatus('experimental')).toBe('strong-uplift-but-not-top-yet');
    expect(getSkillLevelBucketForStatus('deprecated')).toBe('useful-overlay-not-top-level-alone');
    expect(getSkillLevelBucketForStatus('draft')).toBeNull();
    expect([...SKILL_LEVEL_BUCKET_BY_STATUS.keys()].sort()).toEqual(['deprecated', 'experimental', 'stable']);

    expect(getDefaultRuntimeProofLevelForStatus('stable')).toBe('declared-and-tested');
    expect(getDefaultRuntimeProofLevelForStatus('experimental')).toBe('declared-only');
    expect(getDefaultRuntimeProofLevelForStatus('deleted')).toBe('declared-only');
    expect(getTargetRuntimeProofLevelForStatus('stable')).toBe('declared-and-tested');
    expect([...RUNTIME_PROOF_LEVELS]).toEqual(['declared-only', 'declared-and-tested', 'host-smoked']);
    expect(isKnownRuntimeProofLevel('host-smoked')).toBe(true);
    expect(isKnownRuntimeProofLevel('unsupported-level')).toBe(false);
    expect(compareRuntimeProofLevels('declared-only', 'declared-and-tested')).toBe(-1);
    expect(compareRuntimeProofLevels('host-smoked', 'declared-and-tested')).toBe(1);
    expect(compareRuntimeProofLevels('declared-and-tested', 'declared-and-tested')).toBe(0);
    expect(maxRuntimeProofLevel('declared-only', 'host-smoked')).toBe('host-smoked');
    expect(shouldAutoPromoteRuntimeProofLevel('declared-only', 'stable')).toBe(true);
    expect(shouldAutoPromoteRuntimeProofLevel('declared-and-tested', 'stable')).toBe(false);
    expect(getAutoPromotedRuntimeProofLevel('declared-only', 'stable')).toBe('declared-and-tested');
    expect(getAutoPromotedRuntimeProofLevel('host-smoked', 'stable')).toBe('host-smoked');

    expect(isKnownEvolutionAction('promote-to-stable')).toBe(true);
    expect(isKnownEvolutionAction('unknown-action')).toBe(false);
    expect(EVOLUTION_DECISION_ACTIONS.has('merge-into-skill')).toBe(true);
    expect(getDefaultTargetStatusForEvolutionAction('promote-to-stable')).toBe('stable');
    expect(getDefaultTargetStatusForEvolutionAction('archive-skill')).toBe('archived');
    expect(getDefaultTargetStatusForEvolutionAction('merge-into-skill')).toBeNull();
    expect(EVOLUTION_ACTION_DEFAULT_TARGET_STATUS.get('delete-skill')).toBe('deleted');
  });

  test('host governance stays centralized and internally consistent', () => {
    expect([...HOST_SMOKE_POLICY_TIERS]).toEqual(['critical', 'standard', 'experimental']);
    expect([...HOST_SMOKE_TARGET_LEVELS]).toEqual(['declared-only', 'declared-and-tested', 'host-smoked']);
    expect([...HOST_SMOKE_RESULT_STATUSES]).toEqual(['pass', 'fail']);
    expect([...HOST_SMOKE_COMMAND_CWD_MODES]).toEqual(['skill-dir', 'bundle-root', 'project-root']);
    expect([...HOST_SMOKE_FRESHNESS_UNITS]).toEqual(['hours', 'days']);
    expect([...HOST_SMOKE_EVIDENCE_STATUSES]).toEqual(['passing', 'stale', 'failing', 'missing', 'contract-drift', 'invalid-contract']);
    expect([...HOST_SMOKE_GOVERNANCE_STATUSES]).toEqual(['satisfied', 'not-host-smoked', 'stale', 'failing', 'missing', 'contract-drift', 'invalid-contract']);
    expect([...HOST_SMOKE_INVALIDATION_REASONS]).toEqual(['contract-drift', 'manual-reset', 'superseded']);

    expect(AUTHORITATIVE_SKILL_TREE_CONSTRAINT).toEqual(expect.objectContaining({
      id: 'authoritative-skill-tree',
      label: 'authoritative skill tree create surface',
      mode: 'create-child-directory'
    }));
    expect(getHostWriteabilitySeverity('runtime-proof')).toBe('critical');
    expect(getHostWriteabilitySeverity('host-smoke-scorecard')).toBe('critical');
    expect(getHostWriteabilitySeverity('host-smoke-runtime-runs')).toBe('critical');
    expect(getHostWriteabilitySeverity('system-readiness')).toBe('high');
    expect(getHostWriteabilitySeverity(AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id)).toBe('high');
    expect(getHostWriteabilitySeverity('host-evolution')).toBe('normal');
    expect(isCriticalHostWriteabilityArtifact('runtime-proof')).toBe(true);
    expect(isCriticalHostWriteabilityArtifact('system-readiness')).toBe(false);

    expect(normalizeHostSmokeTier('critical')).toBe('critical');
    expect(normalizeHostSmokeTier('unsupported')).toBeNull();
    expect(normalizeHostSmokeTargetLevel('host-smoked')).toBe('host-smoked');
    expect(normalizeHostSmokeTargetLevel('unsupported')).toBeNull();
    expect(normalizeHostSmokeFreshnessDays(7)).toBe(7);
    expect(normalizeHostSmokeFreshnessDays(0)).toBeNull();
    expect(normalizeHostSmokePolicy({
      tier: 'critical',
      'target-level': 'host-smoked',
      'freshness-days': 7
    })).toEqual({
      tier: 'critical',
      'target-level': 'host-smoked',
      'freshness-days': 7
    });
    expect(deriveHostSmokePolicyFromRecord({ status: 'stable' })).toEqual({
      tier: 'standard',
      'target-level': 'declared-and-tested'
    });
    expect(deriveHostSmokePolicyFromRecord({
      status: 'experimental',
      hostSmokeTier: 'critical',
      hostSmokeTargetLevel: 'host-smoked',
      hostSmokeFreshnessDays: 7
    })).toEqual({
      tier: 'critical',
      'target-level': 'host-smoked',
      'freshness-days': 7
    });

    expect(isGovernedRuntimeProofRecord({ runtime: 'scripted', kind: 'tool', status: 'stable' })).toBe(true);
    expect(isGovernedRuntimeProofRecord({ runtime: 'scripted', kind: 'guard', status: 'experimental' })).toBe(true);
    expect(isGovernedRuntimeProofRecord({ runtime: 'manual', kind: 'tool', status: 'stable' })).toBe(false);
    expect(isGovernedRuntimeProofRecord({ runtime: 'scripted', kind: 'domain', status: 'stable' })).toBe(false);
    expect(isGovernedRuntimeProofRecord({ runtime: 'scripted', kind: 'tool', status: 'draft' })).toBe(false);
  });

  test('future-skill pipeline governance stays centralized and internally consistent', () => {
    expect(FUTURE_SKILL_PIPELINE_STAGE_ORDER).toEqual([
      'opportunity',
      'admission',
      'ready-to-materialize',
      'blocked-on-host',
      'implemented',
      'redirected',
      'cancelled'
    ]);
    expect([...ACTIVE_FUTURE_SKILL_PIPELINE_STAGES].sort()).toEqual([
      'admission',
      'blocked-on-host',
      'opportunity',
      'ready-to-materialize'
    ]);
    expect([...TERMINAL_FUTURE_SKILL_PIPELINE_STAGES].sort()).toEqual([
      'cancelled',
      'implemented',
      'redirected'
    ]);

    expect(normalizeFutureSkillPipelineStage('ADMISSION')).toBe('admission');
    expect(normalizeFutureSkillPipelineStage('unsupported')).toBeNull();
    expect(isKnownFutureSkillPipelineStage('blocked-on-host')).toBe(true);
    expect(isKnownFutureSkillPipelineStage('unsupported')).toBe(false);
    expect(isActiveFutureSkillPipelineStage('ready-to-materialize')).toBe(true);
    expect(isActiveFutureSkillPipelineStage('implemented')).toBe(false);
    expect(isTerminalFutureSkillPipelineStage('redirected')).toBe(true);
    expect(isTerminalFutureSkillPipelineStage('opportunity')).toBe(false);

    expect(getFutureSkillPipelineThreadId('opportunity', { 'opportunity-id': 'opp-1' })).toBe('opportunity:opp-1');
    expect(getFutureSkillPipelineThreadId('admission', { 'request-id': 'req-1', 'opportunity-id': 'opp-1' })).toBe('opportunity:opp-1');
    expect(getFutureSkillPipelineThreadId('pending-scaffold', { 'pending-id': 'pending-1', skill: 'new-skill' })).toBe('skill:new-skill');

    const view = buildFutureSkillPipelineView({
      opportunities: [
        {
          'opportunity-id': 'opp-1',
          summary: 'Need a new governed tool',
          'suggested-kind': 'tool',
          priority: 'high',
          status: 'planned',
          horizon: 'next',
          'recorded-at': '2026-05-18T00:00:00.000Z'
        }
      ],
      admissions: [
        {
          'request-id': 'req-1',
          request: 'Need a new governed tool',
          'opportunity-id': 'opp-1',
          'suggested-kind': 'tool',
          decision: {
            action: 'create-new-skill',
            suggested_kind: 'tool'
          },
          status: 'blocked',
          'recorded-at': '2026-05-18T01:00:00.000Z',
          note: 'blocked on route-boundary clarification'
        }
      ],
      pendingScaffolds: [
        {
          'pending-id': 'pending-1',
          'request-id': 'req-1',
          'opportunity-id': 'opp-1',
          kind: 'tool',
          skill: 'new-governed-tool',
          path: 'skills/tools/new-governed-tool',
          status: 'blocked',
          'recorded-at': '2026-05-18T02:00:00.000Z',
          'host-constraint': {
            code: 'EPERM',
            message: 'authoritative tree is not writable'
          }
        }
      ],
      hostEvolution: {
        'active-constraints': [
          {
            id: 'authoritative-skill-tree'
          }
        ]
      }
    });

    expect(view.summary).toEqual(expect.objectContaining({
      total: 1,
      active: 1,
      blocked: 1,
      stages: expect.objectContaining({
        'blocked-on-host': 1
      }),
      priorities: expect.objectContaining({
        critical: 1
      })
    }));
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]).toEqual(expect.objectContaining({
      'thread-id': 'opportunity:opp-1',
      stage: 'blocked-on-host',
      blocked: true,
      priority: 'critical',
      kind: 'tool',
      skill: 'new-governed-tool',
      'opportunity-id': 'opp-1',
      'request-id': 'req-1',
      'pending-id': 'pending-1'
    }));
    expect(view.entries[0].blockers).toEqual(expect.arrayContaining([
      'authoritative tree is not writable'
    ]));
  });

  test('expert-source governance stays centralized and internally consistent', () => {
    expect(EXPERT_SOURCE_FAMILY_STATUS_ORDER).toEqual(['active', 'archived']);
    expect([...ACTIVE_EXPERT_SOURCE_FAMILY_STATUSES]).toEqual(['active']);
    expect(EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER).toEqual(['aligned', 'missing-active-include', 'archived-still-included', 'not-required']);
    expect(DEFAULT_EXPERT_SOURCE_FAMILY_NAME).toBe('top-developer');
    expect(DEFAULT_EXPERT_SOURCE_FAMILY_INTEGRATION_FILE).toBe('registry/top-developer-integration.generated.json');
    expect(DEFAULT_EXPERT_SOURCE_FAMILY_RAW_ROOT).toBe('../top_developer');

    expect(EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES).toEqual([
      'registry/expert-source-families.generated.json',
      'registry/expert-source-families.schema.json',
      'registry/expert-source-family-scorecard.generated.json',
      'registry/expert-source-family-scorecard.schema.json',
      'registry/expert-source-integration.schema.json',
      'registry/top-developer-integration.generated.json'
    ]);
    expect(EXPERIMENTAL_REQUIRED_INCLUDES).toEqual(EXPERT_SOURCE_EXPERIMENTAL_REQUIRED_INCLUDES);

    expect(normalizeExpertSourceFamilyStatus('ACTIVE')).toBe('active');
    expect(normalizeExpertSourceFamilyStatus('unsupported')).toBe('active');
    expect(normalizeExpertSourceExperimentalPackStatus('ALIGNED')).toBe('aligned');
    expect(normalizeExpertSourceExperimentalPackStatus('unsupported')).toBeNull();
    expect(isKnownExpertSourceFamilyStatus('archived')).toBe(true);
    expect(isKnownExpertSourceFamilyStatus('unsupported')).toBe(false);
    expect(isKnownExpertSourceExperimentalPackStatus('missing-active-include')).toBe(true);
    expect(isKnownExpertSourceExperimentalPackStatus('unsupported')).toBe(false);
    expect(isActiveExpertSourceFamilyStatus('active')).toBe(true);
    expect(isActiveExpertSourceFamilyStatus('archived')).toBe(false);

    expect(isDefaultExpertSourceFamily('top-developer')).toBe(true);
    expect(isDefaultExpertSourceFamily({ id: 'top-developer' })).toBe(true);
    expect(isDefaultExpertSourceFamily('expert-research')).toBe(false);
    expect(canArchiveExpertSourceFamily('top-developer')).toBe(false);
    expect(canArchiveExpertSourceFamily('expert-research')).toBe(true);

    expect(isValidExpertSourceFamilyId('expert-research')).toBe(true);
    expect(isValidExpertSourceFamilyId('Expert-Research')).toBe(false);
    expect(isValidExpertSourceFamilyId('expert_research')).toBe(false);

    expect(getDefaultExpertSourceIntegrationFile('expert-research')).toBe('registry/expert-research-integration.generated.json');
    expect(getDefaultExpertSourceRawRoot('expert-research')).toBe('../expert_research');

    expect(getRequiredExperimentalPackExpertSourceIncludes([
      { id: 'top-developer', status: 'active', integrationFile: 'registry/top-developer-integration.generated.json' },
      { id: 'expert-research', status: 'active', integrationFile: 'registry/expert-research-integration.generated.json' },
      { id: 'archived-family', status: 'archived', integrationFile: 'registry/archived-family-integration.generated.json' }
    ])).toEqual([
      'registry/expert-research-integration.generated.json',
      'registry/expert-source-families.generated.json',
      'registry/expert-source-families.schema.json',
      'registry/expert-source-family-scorecard.generated.json',
      'registry/expert-source-family-scorecard.schema.json',
      'registry/expert-source-integration.schema.json',
      'registry/top-developer-integration.generated.json'
    ]);
  });

  test('experimental pack manifest sync keeps required expert-source surfaces and removes stale managed integrations', () => {
    const synced = syncExperimentalPackManifest({
      name: 'experimental',
      includes: [
        'docs/TOP_DEVELOPER_EMBEDDING.md',
        'registry/legacy-family-integration.generated.json',
        'registry/top-developer-integration.generated.json'
      ]
    }, [
      { id: 'top-developer', status: 'active', integrationFile: 'registry/top-developer-integration.generated.json' },
      { id: 'expert-research', status: 'active', integrationFile: 'registry/expert-research-integration.generated.json' },
      { id: 'legacy-family', status: 'archived', integrationFile: 'registry/legacy-family-integration.generated.json' }
    ]);

    expect(synced.includes).toEqual([
      'docs/TOP_DEVELOPER_EMBEDDING.md',
      'registry/expert-research-integration.generated.json',
      'registry/expert-source-families.generated.json',
      'registry/expert-source-families.schema.json',
      'registry/expert-source-family-scorecard.generated.json',
      'registry/expert-source-family-scorecard.schema.json',
      'registry/expert-source-integration.schema.json',
      'registry/top-developer-integration.generated.json'
    ]);
  });

  test('expert-source schema governance stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'expert-source-families.schema.json'), 'utf8'))).toEqual(
      buildExpertSourceFamiliesSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'expert-source-family-scorecard.schema.json'), 'utf8'))).toEqual(
      buildExpertSourceFamilyScorecardSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'expert-source-integration.schema.json'), 'utf8'))).toEqual(
      buildExpertSourceIntegrationSchema()
    );
  });

  test('readiness schema governance stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(SYSTEM_READINESS_SCHEMA_VERSION).toBe(2);
    expect(SYSTEM_READINESS_SIGNAL_ORDER).toEqual([
      'benchmark',
      'route-evidence',
      'runtime-proof',
      'host-smoke',
      'top-tier-readiness',
      'review-cadence',
      'investment-backlog',
      'expert-source-families',
      'host-writeability'
    ]);
    expect(SYSTEM_READINESS_SUMMARY_KEYS).toEqual(expect.arrayContaining([
      'stable-top-tier-blocked-skills',
      'stable-top-tier-ready-skills',
      'stable-top-tier-critical-skills',
      'stable-top-tier-high-skills',
      'stable-top-tier-normal-skills',
      'stable-top-tier-clear-skills',
      'stable-top-tier-next-wave-size',
      ...STABLE_TOP_TIER_BLOCKER_FIELDS
    ]));
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'benchmark', 'system-readiness.schema.json'), 'utf8'))).toEqual(
      buildSystemReadinessSchema()
    );
    expect(buildSystemReadinessSchema().properties.signals.properties['top-tier-readiness']).toEqual({
      $ref: '#/$defs/topTierReadinessSignal'
    });
    expect(buildSystemReadinessSchema().$defs.topTierReadinessSignal.required).toEqual([
      'status',
      'stable-skills',
      'blocked-stable-skills',
      'ready-stable-skills',
      'priorities',
      'execution-focus',
      ...STABLE_TOP_TIER_BLOCKER_FIELDS
    ]);
    expect(buildHostEvolutionSchema().required).toContain('top-tier-execution-focus');
    expect(buildHostEvolutionSchema().properties.summary.required).toEqual(expect.arrayContaining([
      'top-tier-next-wave-size',
      'top-tier-blocked-stable-skills'
    ]));
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'benchmark', 'host-evolution.schema.json'), 'utf8'))).toEqual(
      buildHostEvolutionSchema()
    );
  });

  test('generated governance artifact catalog stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(GOVERNANCE_ARTIFACT_ORDER.length).toBeGreaterThan(10);
    expect(WRITEABILITY_TRACKED_GOVERNANCE_ARTIFACT_IDS.length).toBeGreaterThan(10);
    expect(DERIVED_GOVERNANCE_FINGERPRINT_ARTIFACT_IDS.length).toBeGreaterThan(5);
    expect(DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS).toEqual(['system-readiness', 'host-evolution']);

    for (const artifactId of GOVERNANCE_ARTIFACT_ORDER) {
      const definition = getGovernanceArtifactDefinition(artifactId);
      expect(definition).toEqual(expect.objectContaining({
        path: expect.any(String),
        mode: expect.any(String),
        label: expect.any(String)
      }));
      expect(getGovernanceArtifactRelativePath(artifactId)).toBe(definition.path);
    }

    const tracked = listGovernanceArtifacts(path.join(__dirname, '..', 'personal-skill-system'), {
      writeabilityTrackedOnly: true
    });
    expect(tracked.map((item) => item.id)).toEqual(WRITEABILITY_TRACKED_GOVERNANCE_ARTIFACT_IDS);

    const fingerprintPaths = getDerivedGovernanceFingerprintSourcePaths();
    expect(fingerprintPaths).toEqual(
      DERIVED_GOVERNANCE_FINGERPRINT_ARTIFACT_IDS.map((artifactId) => getGovernanceArtifactRelativePath(artifactId))
    );
    expect(fingerprintPaths).toEqual(expect.arrayContaining([
      'registry/registry.generated.json',
      'registry/route-map.generated.json',
      'registry/route-fixtures.generated.json',
      'skills/routers/sage/references/skill-catalog.generated.md',
      'skills/routers/sage/references/skill-investment-backlog.generated.md',
      'registry/runtime-proof.generated.json',
      'docs/CAPABILITY_MODULE_RATINGS.md',
      'docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md',
      'registry/capability-ratings.schema.json',
      'registry/expert-source-families.schema.json',
      'registry/expert-source-family-scorecard.schema.json',
      'registry/expert-source-integration.schema.json',
      'registry/review-queue.schema.json',
      'registry/skill-investment-backlog.schema.json',
      'benchmark/summary.generated.json',
      'benchmark/system-readiness.schema.json',
      'benchmark/host-evolution.schema.json',
      'benchmark/host-smoke/scorecard.generated.json'
    ]));

    expect(getDerivedGovernanceExportArtifactPaths()).toEqual({
      'system-readiness': 'benchmark/system-readiness.generated.json',
      'host-evolution': 'benchmark/host-evolution.generated.json'
    });
    expect(getDerivedGovernanceExportArtifacts(bundleRoot).map((item) => item.id)).toEqual(DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS);
    expect(getDerivedGovernanceExportArtifacts(bundleRoot).map((item) => item.relativePath)).toEqual(
      DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS.map((artifactId) => getGovernanceArtifactRelativePath(artifactId))
    );
  });

  test('derived-governance refresh plan stays centralized and internally consistent', () => {
    expect(DERIVED_GOVERNANCE_REFRESH_STEP_ORDER).toEqual([
      'runtime-proof',
      'skill-catalog',
      'authoring-governance-reference',
      'skill-frontmatter-schema',
      'future-registry-schemas',
      'skill-investment-backlog-schema',
      'readiness-schemas',
      'review-queue-schema',
      'capability-ratings-schema',
      'expert-source-schemas',
      'review-queue',
      'capability-ratings',
      'expert-source-family-scorecard',
      'host-smoke-scorecard',
      'skill-investment-backlog',
      'system-readiness'
    ]);

    const steps = listDerivedGovernanceRefreshSteps();
    const plan = listDerivedGovernanceRefreshPlan();
    expect(steps.map((step) => step.id)).toEqual(DERIVED_GOVERNANCE_REFRESH_STEP_ORDER);
    expect(plan.map((step) => step.id)).toEqual(DERIVED_GOVERNANCE_REFRESH_STEP_ORDER);
    expect(plan.map((step) => step.order)).toEqual(plan.map((_, index) => index + 1));

    for (const step of steps) {
      expect(step).toEqual(expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        description: expect.any(String),
        artifacts: expect.any(Array)
      }));
      expect(step.artifacts.length).toBeGreaterThan(0);
      expect(getDerivedGovernanceRefreshStepDefinition(step.id)).toEqual(expect.objectContaining({
        label: step.label,
        artifacts: step.artifacts
      }));
      for (const artifactId of step.artifacts) {
        expect(DERIVED_GOVERNANCE_REFRESH_ARTIFACT_IDS).toContain(artifactId);
        expect(DERIVED_GOVERNANCE_REFRESH_ARTIFACT_PATHS[artifactId]).toBe(getGovernanceArtifactRelativePath(artifactId));
        expect(findDerivedGovernanceRefreshStepByArtifactId(artifactId)).toEqual(expect.objectContaining({
          id: step.id
        }));
      }
    }

    for (const step of plan) {
      expect(step.paths).toEqual(
        step.artifacts.map((artifactId) => ({
          artifact: artifactId,
          path: DERIVED_GOVERNANCE_REFRESH_ARTIFACT_PATHS[artifactId]
        }))
      );
    }

    expect(DERIVED_GOVERNANCE_REFRESH_ARTIFACT_IDS).toEqual(expect.arrayContaining([
      'runtime-proof',
      'skill-catalog',
      'authoring-governance-reference',
      'skill-frontmatter-schema',
      'skill-opportunity-queue-schema',
      'admission-ledger-schema',
      'evolution-ledger-schema',
      'pending-scaffolds-schema',
      'skill-investment-backlog-schema',
      'system-readiness-schema',
      'host-evolution-schema',
      'review-queue-schema',
      'capability-ratings-schema',
      'expert-source-families-schema',
      'expert-source-family-scorecard-schema',
      'expert-source-integration-schema',
      'review-queue',
      'capability-ratings',
      'capability-ratings-doc',
      'expert-source-family-scorecard',
      'host-smoke-scorecard',
      'skill-investment-backlog',
      'skill-investment-backlog-doc',
      'system-readiness',
      'host-evolution'
    ]));

    expect(DERIVED_GOVERNANCE_ARTIFACT_PATHS).toEqual(expect.objectContaining({
      'system-readiness': 'benchmark/system-readiness.generated.json',
      'host-evolution': 'benchmark/host-evolution.generated.json',
      'skill-catalog': 'skills/routers/sage/references/skill-catalog.generated.md',
      'skill-investment-backlog-doc': 'skills/routers/sage/references/skill-investment-backlog.generated.md',
      'capability-ratings-doc': 'docs/CAPABILITY_MODULE_RATINGS.md',
      'authoring-governance-reference': 'docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md'
    }));
  });

  test('skill catalog markdown is generated from the registry source of truth', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');
    const registry = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'registry.generated.json'), 'utf8'));
    const catalogPath = path.join(bundleRoot, 'skills', 'routers', 'sage', 'references', 'skill-catalog.generated.md');
    const catalog = fs.readFileSync(catalogPath, 'utf8');

    expect(fs.existsSync(catalogPath)).toBe(true);
    expect(catalog).toBe(`${buildSkillCatalogMarkdown(registry)}\n`);
    expect(catalog).toContain('Generated from `registry/registry.generated.json`.');
    expect(catalog).toContain('## Tools');
    expect(catalog).toContain('`manage-skill`');
  });

  test('authoring governance reference is generated from the centralized governance modules', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');
    const referencePath = path.join(bundleRoot, 'docs', 'SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md');
    const reference = fs.readFileSync(referencePath, 'utf8');

    expect(fs.existsSync(referencePath)).toBe(true);
    expect(reference).toBe(`${buildAuthoringGovernanceReferenceMarkdown()}\n`);
    expect(reference).toContain('Generated from the governance modules under `personal-skill-system/skills/tools/lib/`.');
    expect(reference).toContain('## Skill Kinds');
    expect(reference).toContain('## Lifecycle');
    expect(reference).toContain('## Review Metadata Seed Policy');
    expect(reference).toContain('default owner for newly scaffolded skills');
    expect(reference).toContain('## Portfolio Surfaces');
    expect(reference).toContain('## Derived-Governance Refresh Plan');
    expect(reference).toContain('| `future-registry-schemas` | Future-skill registry schemas |');
    expect(reference).toContain('| `system-readiness` | System readiness and host evolution |');
    expect(reference).toContain('## Generated Governance Artifacts');
    expect(reference).toContain('`authoring-governance-reference`');
  });

  test('smoke manifest governance is centralized for scripted skill contracts', () => {
    expect(SMOKE_MANIFEST_SCHEMA_VERSION).toBe(1);
    expect([...SMOKE_MANIFEST_COMMAND_CWD_MODES]).toEqual(['skill-dir', 'bundle-root', 'project-root']);
    expect([...SMOKE_MANIFEST_FRESHNESS_UNITS]).toEqual(['hours', 'days']);

    expect(validateSmokeManifest({
      'schema-version': SMOKE_MANIFEST_SCHEMA_VERSION,
      commands: [
        {
          argv: ['node', 'scripts/run.js'],
          expect: { ok: true }
        }
      ]
    })).toEqual([]);

    expect(validateSmokeManifest({
      'schema-version': 99,
      commands: []
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('unsupported schema-version'),
      expect.stringContaining('must declare at least one command')
    ]));
  });

  test('review metadata seed policy stays centralized by kind', () => {
    expect(DEFAULT_SKILL_OWNER).toBe('self');
    expect(REVIEW_CYCLE_DAYS_BY_KIND).toEqual(expect.objectContaining({
      router: 90,
      domain: 60,
      workflow: 60,
      tool: 45,
      guard: 45,
      adapter: 60
    }));

    const seeded = buildSeedReviewMetadata('tool', {
      now: new Date('2026-05-15T12:34:56Z').getTime()
    });
    expect(seeded).toEqual({
      owner: 'self',
      'last-reviewed': '2026-05-15',
      'review-cycle-days': 45
    });
  });

  test('review cadence uses UTC day boundaries before becoming overdue', () => {
    const dueDaySchedule = deriveReviewSchedule('2026-04-17', 30, {
      now: new Date('2026-05-17T12:00:00Z').getTime()
    });
    expect(dueDaySchedule).toEqual(expect.objectContaining({
      'next-review-due': '2026-05-17',
      'review-status': 'due-soon',
      'days-until-due': 0,
      'overdue-days': 0
    }));

    const overdueSchedule = deriveReviewSchedule('2026-04-17', 30, {
      now: new Date('2026-05-18T00:00:00Z').getTime()
    });
    expect(overdueSchedule).toEqual(expect.objectContaining({
      'next-review-due': '2026-05-17',
      'review-status': 'overdue',
      'days-until-due': -1,
      'overdue-days': 1
    }));
  });

  test('skill investment backlog markdown is generated from the backlog source of truth', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');
    const backlog = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'skill-investment-backlog.generated.json'), 'utf8'));
    const backlogPath = path.join(bundleRoot, 'skills', 'routers', 'sage', 'references', 'skill-investment-backlog.generated.md');
    const backlogDoc = fs.readFileSync(backlogPath, 'utf8');

    expect(fs.existsSync(backlogPath)).toBe(true);
    expect(backlogDoc).toBe(`${buildSkillInvestmentBacklogMarkdown(backlog)}\n`);
    expect(backlogDoc).toContain('Generated from `registry/skill-investment-backlog.generated.json`.');
    expect(backlogDoc).toContain('## Summary');
    expect(backlogDoc).toContain('## Active Items');
    expect(backlogDoc).toContain('### Upgrade Board');
    expect(backlogDoc).toContain('### Current Wave');
  });

  test('authoring governance drift downgrades to warning when the generated reference is host-blocked', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const referencePath = path.join(target, 'docs', 'SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md');
    fs.writeFileSync(referencePath, '# drifted\n', 'utf8');

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    jest.resetModules();
    jest.doMock(commonModulePath, () => {
      const actual = jest.requireActual(commonModulePath);
      return {
        ...actual,
        probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
          const normalized = String(targetPath || '').replace(/\\/g, '/');
          if (normalized.endsWith('/docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md') && options.mode === 'rewrite-file') {
            return {
              ok: false,
              mode: options.mode,
              path: targetPath,
              code: 'EPERM',
              message: 'mocked authoring reference write block'
            };
          }
          return actual.probeArtifactWriteAccess(targetPath, options);
        })
      };
    });

    try {
      const { analyzeSkillSystem } = require('../personal-skill-system/skills/tools/lib/skill-system');
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) =>
        item.severity === 'warning'
        && item.file === 'docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md'
        && item.message.includes('authoring governance generated reference is out of sync with centralized governance modules, but the artifact is not writable on this host (EPERM)')
      )).toBe(true);
      expect(report.findings.some((item) =>
        item.severity === 'error'
        && item.file === 'docs/SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md'
        && item.message.includes('authoring governance generated reference is out of sync')
      )).toBe(false);
    } finally {
      jest.dontMock(commonModulePath);
    }
  });

  test('skill investment backlog drift downgrades to warning when backlog artifacts are host-blocked', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const backlogPath = path.join(target, 'registry', 'skill-investment-backlog.generated.json');
    const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    backlog.items.push({
      id: 'rogue-backlog-item',
      category: 'new-skill-admission',
      status: 'open',
      priority: 'high',
      source: 'admission-ledger',
      skill: 'ghost-skill',
      summary: 'rogue drift item'
    });
    fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');

    const backlogDocPath = path.join(target, 'skills', 'routers', 'sage', 'references', 'skill-investment-backlog.generated.md');
    fs.writeFileSync(backlogDocPath, '# drifted backlog doc\n', 'utf8');

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    jest.resetModules();
    jest.doMock(commonModulePath, () => {
      const actual = jest.requireActual(commonModulePath);
      return {
        ...actual,
        probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
          const normalized = String(targetPath || '').replace(/\\/g, '/');
          if (
            (normalized.endsWith('/registry/skill-investment-backlog.generated.json')
              || normalized.endsWith('/skills/routers/sage/references/skill-investment-backlog.generated.md'))
            && options.mode === 'rewrite-file'
          ) {
            return {
              ok: false,
              mode: options.mode,
              path: targetPath,
              code: 'EPERM',
              message: 'mocked backlog write block'
            };
          }
          return actual.probeArtifactWriteAccess(targetPath, options);
        })
      };
    });

    try {
      const { analyzeSkillSystem } = require('../personal-skill-system/skills/tools/lib/skill-system');
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) =>
        item.severity === 'warning'
        && item.file === 'registry/skill-investment-backlog.generated.json'
        && item.message.includes('skill investment backlog is out of sync with admission, evolution, review, scaffold, or top-tier governance state, but the artifact is not writable on this host (EPERM)')
      )).toBe(true);
      expect(report.findings.some((item) =>
        item.severity === 'warning'
        && item.file === 'skills/routers/sage/references/skill-investment-backlog.generated.md'
        && item.message.includes('skill investment backlog generated markdown is out of sync with skill-investment-backlog.generated.json, but the artifact is not writable on this host (EPERM)')
      )).toBe(true);
      expect(report.findings.some((item) =>
        item.severity === 'error'
        && item.file === 'registry/skill-investment-backlog.generated.json'
        && item.message.includes('skill investment backlog is out of sync')
      )).toBe(false);
    } finally {
      jest.dontMock(commonModulePath);
    }
  });

  test('capability ratings governance stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(CAPABILITY_RATING_BUCKET_SEQUENCE).toEqual(['thin', 'strong-but-not-top', 'top-ready']);
    expect(CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE).toEqual(['thin', 'strong-but-not-top']);
    expect(CAPABILITY_RATINGS_DOC_RELATIVE_PATH).toBe('docs/CAPABILITY_MODULE_RATINGS.md');
    expect(getCapabilityRatingsPath(bundleRoot)).toBe(
      path.join(bundleRoot, getGovernanceArtifactRelativePath('capability-ratings'))
    );
    expect(getCapabilityRatingsDocPath(bundleRoot)).toBe(
      path.join(bundleRoot, CAPABILITY_RATINGS_DOC_RELATIVE_PATH)
    );

    expect(buildCapabilityModuleTopReadyBlockers({
      'rating-buckets': {
        thin: ['module-thin'],
        'strong-but-not-top': ['module-strong'],
        'top-ready': ['module-top']
      }
    }, ['module-thin', 'module-strong', 'module-top', 'module-unrated'])).toEqual([
      expect.objectContaining({ module: 'module-thin', rating: 'thin' }),
      expect.objectContaining({ module: 'module-strong', rating: 'strong-but-not-top' }),
      expect.objectContaining({ module: 'module-unrated', rating: 'unrated' })
    ]);

    expect(CAPABILITY_RATINGS_SCHEMA_VERSION).toBe(3);
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'capability-ratings.schema.json'), 'utf8'))).toEqual(
      buildCapabilityRatingsSchema()
    );
    expect(buildCapabilityRatingsSchema().properties['skill-level-summary'].properties.counts.required)
      .toContain('stable-expert-source-blocked');
    expect(buildCapabilityRatingsSchema().properties['skill-level-summary'].properties.counts.required)
      .toContain('stable-runtime-proof-blocked');
  });

  test('capability ratings governance recomputes top-tier blockers from the in-memory rating snapshot', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');
    const ratings = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'capability-ratings.generated.json'), 'utf8'));
    const { skillRecords } = collectSkillRecords(bundleRoot, []);
    const registryData = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'registry.generated.json'), 'utf8'));
    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();

    try {
      applyCapabilityRatingsGovernance(ratings, {
        skillRecords,
        registryData,
        bundleRoot,
        now: Date.now()
      });

      expect(ratings['skill-level-summary'].counts['stable-module-depth-blocked']).toBe(0);
      expect(ratings['skill-level-summary'].counts['stable-runtime-proof-blocked']).toBeGreaterThanOrEqual(1);
      expect(ratings['skill-level-summary'].counts['stable-blocked-total'])
        .toBe(
          ratings['skill-level-summary'].counts['stable-overdue']
          + ratings['skill-level-summary'].counts['stable-missing-metadata']
          + ratings['skill-level-summary'].counts['stable-expert-source-blocked']
          + ratings['skill-level-summary'].counts['stable-route-evidence-blocked']
          + ratings['skill-level-summary'].counts['stable-runtime-proof-blocked']
          + ratings['skill-level-summary'].counts['stable-host-smoke-blocked']
          + ratings['skill-level-summary'].counts['stable-module-depth-blocked']
        );
    } finally {
      Date.now = originalNow;
    }
  });

  test('single-skill hardening plans stay centralized and ordered by blocker family', () => {
    const plan = buildStableTopTierHardeningPlan({
      skill: 'verify-s2-config',
      status: 'stable',
      'target-status': 'stable',
      'host-smoke-policy': {
        tier: 'critical',
        'target-level': 'host-smoked',
        'freshness-days': 7
      },
      ready: false,
      priority: 'critical',
      blockers: [
        {
          type: 'review-cadence-expired',
          message: 'stable skill review cadence expired on 2026-05-17',
          categories: ['review']
        },
        {
          type: 'host-smoke-governance',
          message: "critical host-smoke policy for 'verify-s2-config' is not yet satisfied (not-host-smoked)",
          categories: ['host-smoke']
        }
      ]
    });

    expect(plan).toEqual(expect.objectContaining({
      ready: false,
      priority: 'critical',
      'blocking-family-count': 2
    }));
    expect(plan['blocking-families']).toEqual([
      expect.objectContaining({
        category: 'stable-overdue',
        follow_up: expect.arrayContaining([
          'node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed verify-s2-config'
        ])
      }),
      expect.objectContaining({
        category: 'stable-host-smoke-blocked',
        follow_up: expect.arrayContaining([
          'node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-s2-config --host codex --promote-host-smoked'
        ])
      })
    ]);
    expect(plan.follow_up).toEqual(expect.arrayContaining([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-s2-config',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed verify-s2-config',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-s2-config --host codex --promote-host-smoked'
    ]));
  });

  test('single-skill hardening plans target promotion-grade runtime proof for non-stable skills', () => {
    const plan = buildStableTopTierHardeningPlan({
      skill: 'verify-security',
      status: 'deprecated',
      'target-status': 'stable',
      ready: false,
      priority: 'critical',
      blockers: [
        {
          type: 'runtime-proof-level-floor',
          message: "stable scripted skill 'verify-security' is still marked 'declared-only' below the stable runtime-proof floor 'declared-and-tested'",
          categories: ['runtime-proof']
        }
      ]
    });

    expect(plan['blocking-families']).toEqual([
      expect.objectContaining({
        category: 'stable-runtime-proof-blocked',
        follow_up: expect.arrayContaining([
          'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-security --level declared-and-tested',
          'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-security'
        ])
      })
    ]);
    expect(plan.follow_up).toEqual(expect.arrayContaining([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-security --level declared-and-tested',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-security'
    ]));
  });

  test('future-skill governance stays centralized and internally consistent', () => {
    expect(FUTURE_SKILL_PRIORITY_ORDER).toEqual(['critical', 'high', 'normal']);
    expect(FUTURE_SKILL_HORIZON_ORDER).toEqual(['now', 'next', 'later']);
    expect(FUTURE_SKILL_REGISTRY_SOURCE).toBe('managed-via-manage-skill');
    expect(OPPORTUNITY_STATUS_ORDER).toEqual(['open', 'planned', 'in-progress', 'blocked', 'deferred', 'implemented', 'cancelled']);
    expect([...ACTIVE_OPPORTUNITY_STATUSES]).toEqual(['open', 'planned', 'in-progress', 'blocked', 'deferred']);
    expect(normalizeFuturePriority('HIGH')).toBe('high');
    expect(normalizeFuturePriority('unsupported')).toBe('normal');
    expect(normalizeFutureHorizon('LATER')).toBe('later');
    expect(normalizeFutureHorizon('unsupported')).toBe('next');
    expect(normalizeOpportunityStatus('BLOCKED')).toBe('blocked');
    expect(normalizeOpportunityStatus('unsupported')).toBe('open');
    expect(isKnownOpportunityStatus('implemented')).toBe(true);
    expect(isKnownOpportunityStatus('unsupported')).toBe(false);
    expect(isActiveOpportunityStatus('deferred')).toBe(true);
    expect(isActiveOpportunityStatus('cancelled')).toBe(false);

    expect(ADMISSION_DECISION_ACTIONS.has('create-new-skill')).toBe(true);
    expect(ADMISSION_DECISION_ACTIONS.has('upgrade-existing-skill')).toBe(true);
    expect(ADMISSION_DECISION_ACTION_ORDER).toEqual([
      'create-new-skill',
      'clarify-or-merge-boundary',
      'reuse-existing-skill',
      'upgrade-existing-skill'
    ]);
    expect(ADMISSION_STATUS_ORDER).toEqual(['open', 'planned', 'in-progress', 'blocked', 'deferred', 'implemented', 'cancelled', 'resolved', 'advised-reuse', 'advised-upgrade', 'advised-noop']);
    expect([...ACTIVE_ADMISSION_STATUSES]).toEqual(['open', 'planned', 'in-progress', 'blocked', 'deferred']);
    expect([...TERMINAL_ADMISSION_STATUSES]).toEqual(['implemented', 'cancelled', 'resolved', 'advised-reuse', 'advised-upgrade', 'advised-noop']);
    expect([...BLOCKING_ADMISSION_STATUSES]).toEqual(['blocked']);
    expect(normalizeAdmissionDecisionAction('create-new-skill')).toBe('create-new-skill');
    expect(isKnownAdmissionDecisionAction('reuse-existing-skill')).toBe(true);
    expect(isKnownAdmissionDecisionAction('archive-skill')).toBe(false);
    expect(getDefaultAdmissionStatusForDecision('create-new-skill')).toBe('open');
    expect(getDefaultAdmissionStatusForDecision('reuse-existing-skill')).toBe('advised-reuse');
    expect(getDefaultAdmissionStatusForDecision('upgrade-existing-skill')).toBe('advised-upgrade');
    expect(getDefaultAdmissionStatusForDecision('clarify-or-merge-boundary')).toBe('blocked');
    expect(getDefaultOpportunityStatusForDecision('create-new-skill')).toBe('planned');
    expect(getDefaultOpportunityStatusForDecision('upgrade-existing-skill')).toBe('cancelled');
    expect(getDefaultOpportunityStatusForDecision('clarify-or-merge-boundary')).toBe('blocked');
    expect(getRequiredAdmissionDecisionFields('create-new-skill')).toEqual(['suggested_kind']);
    expect(getAllowedAdmissionDecisionFields('reuse-existing-skill')).toEqual(['target_skill', 'target_kind']);
    expect(normalizeAdmissionDecision({
      action: 'upgrade-existing-skill',
      target_skill: 'ship',
      target_kind: 'workflow',
      suggested_kind: 'tool',
      primary_skill: 'ignored'
    })).toEqual({
      action: 'upgrade-existing-skill',
      target_skill: 'ship',
      target_kind: 'workflow',
      suggested_kind: 'tool'
    });
    expect(buildAdmissionDecision('create-new-skill', { suggested_kind: 'guard' })).toEqual({
      action: 'create-new-skill',
      suggested_kind: 'guard'
    });
    expect(() => buildAdmissionDecision('reuse-existing-skill', { target_kind: 'tool' }))
      .toThrow("admission decision 'reuse-existing-skill' violates centralized contract");
    expect(collectAdmissionDecisionContractErrors({
      action: 'clarify-or-merge-boundary',
      primary_skill: 'review',
      competing_skill: 'review',
      suggested_kind: 'tool'
    }, {
      skillNames: new Set(['review']),
      entrySuggestedKind: 'tool'
    })).toContain("decision 'clarify-or-merge-boundary' should not use the same skill for primary_skill and competing_skill");
    expect(buildAdmissionOpportunityNote('reuse-existing-skill', {
      admissionRequestId: '20260516-sample',
      decision: { action: 'reuse-existing-skill', target_skill: 'manage-skill', target_kind: 'tool' }
    })).toContain("reusing existing skill 'manage-skill'");
    expect(normalizeAdmissionStatus('ADVISED-UPGRADE')).toBe('advised-upgrade');
    expect(normalizeAdmissionStatus('unsupported')).toBe('open');
    expect(isKnownAdmissionStatus('advised-upgrade')).toBe(true);
    expect(isKnownAdmissionStatus('unsupported')).toBe(false);
    expect(isActiveAdmissionStatus('blocked')).toBe(true);
    expect(isTerminalAdmissionStatus('advised-noop')).toBe(true);
    expect(isBlockingAdmissionStatus('blocked')).toBe(true);
    expect(isBlockingAdmissionStatus('open')).toBe(false);

    expect(PENDING_SCAFFOLD_STATUS_ORDER).toEqual(['planned', 'in-progress', 'blocked', 'deferred']);
    expect([...ACTIVE_PENDING_SCAFFOLD_STATUSES]).toEqual(['planned', 'in-progress', 'blocked', 'deferred']);
    expect(normalizePendingScaffoldStatus('DEFERRED')).toBe('deferred');
    expect(normalizePendingScaffoldStatus('unsupported')).toBe('blocked');
    expect(isKnownPendingScaffoldStatus('planned')).toBe(true);
    expect(isKnownPendingScaffoldStatus('unsupported')).toBe(false);
    expect(isActivePendingScaffoldStatus('blocked')).toBe(true);
    expect(buildStatusCountSummary(
      OPPORTUNITY_STATUS_ORDER,
      [{ status: 'open' }, { status: 'blocked' }, { status: 'implemented' }],
      normalizeOpportunityStatus,
      isActiveOpportunityStatus
    )).toEqual({
      total: 3,
      active: 2,
      open: 1,
      planned: 0,
      'in-progress': 0,
      blocked: 1,
      deferred: 0,
      implemented: 1,
      cancelled: 0
    });
  });

  test('future-registry schema governance stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION).toBe(1);
    expect(ADMISSION_LEDGER_SCHEMA_VERSION).toBe(2);
    expect(EVOLUTION_LEDGER_SCHEMA_VERSION).toBe(2);
    expect(PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION).toBe(1);

    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'skill-opportunity-queue.schema.json'), 'utf8'))).toEqual(
      buildSkillOpportunityQueueSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'admission-ledger.schema.json'), 'utf8'))).toEqual(
      buildAdmissionLedgerSchema()
    );
    expect(buildAdmissionLedgerSchema().properties.entries.items.properties.decision.oneOf).toHaveLength(4);
    expect(
      buildAdmissionLedgerSchema().properties.entries.items.properties.decision.oneOf.find((item) =>
        item.properties.action.const === 'create-new-skill'
      )
    ).toEqual(expect.objectContaining({
      required: ['action', 'suggested_kind']
    }));
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'evolution-ledger.schema.json'), 'utf8'))).toEqual(
      buildEvolutionLedgerSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'pending-scaffolds.schema.json'), 'utf8'))).toEqual(
      buildPendingScaffoldRegistrySchema()
    );
  });

  test('skill investment backlog schema governance stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'skill-investment-backlog.schema.json'), 'utf8'))).toEqual(
      buildSkillInvestmentBacklogSchema()
    );
    expect(buildSkillInvestmentBacklogSchema().properties.summary.properties.categories.propertyNames.enum)
      .toContain('template-governance');
    expect(buildSkillInvestmentBacklogSchema().properties.sources.required)
      .toContain('template-scaffolds');
    expect(buildSkillInvestmentBacklogSchema().required)
      .toContain('top-tier-portfolio');
    expect(buildSkillInvestmentBacklogSchema().properties['top-tier-portfolio'].required)
      .toContain('upgrade-board');
    expect(buildSkillInvestmentBacklogSchema().properties['top-tier-portfolio'].required)
      .toContain('execution-focus');
    expect(buildSkillInvestmentBacklogSchema().properties['top-tier-portfolio'].properties['upgrade-board'].properties.summary.properties.groups.required)
      .toEqual(expect.arrayContaining(STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER));
    expect(buildSkillInvestmentBacklogSchema().properties['top-tier-portfolio'].properties['execution-focus'].required)
      .toEqual(expect.arrayContaining([
        'blocked',
        'next-wave',
        'next-wave-size',
        'current-priority-lane',
        'current-blocker-family',
        'follow_up'
      ]));
  });

  test('review queue schema governance stays centralized and internally consistent', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');

    expect(JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'review-queue.schema.json'), 'utf8'))).toEqual(
      buildReviewQueueSchema()
    );
  });

  test('skill registry governance stays centralized and internally consistent', () => {
    const payload = buildSkillRegistryDocument([
      {
        name: 'alpha-skill',
        kind: 'domain',
        path: 'skills/domains/alpha-skill/SKILL.md'
      },
      {
        name: 'alpha-skill',
        kind: 'domain',
        path: 'skills/domains/alpha-skill/SKILL.md'
      }
    ], [
      {
        'host-skill': 'alpha-skill',
        'host-kind': 'domain',
        modules: [
          {
            id: 'alpha-module',
            path: 'skills/domains/alpha-skill/references/alpha.md',
            capability: 'Alpha capability.'
          },
          {
            id: 'alpha-module',
            path: 'skills/domains/alpha-skill/references/alpha.md',
            capability: 'Alpha capability.'
          }
        ]
      }
    ], {
      now: Date.parse('2026-05-13T10:40:00Z')
    });

    expect(payload).toEqual({
      'schema-version': SKILL_REGISTRY_SCHEMA_VERSION,
      'generated-at': '2026-05-13T10:40:00.000Z',
      source: SKILL_REGISTRY_SOURCE,
      summary: {
        skills: 1,
        'module-groups': 1,
        'capability-modules': 1,
        kinds: {
          router: 0,
          domain: 1,
          workflow: 0,
          tool: 0,
          guard: 0,
          adapter: 0
        }
      },
      skills: [
        {
          name: 'alpha-skill',
          kind: 'domain',
          path: 'skills/domains/alpha-skill/SKILL.md'
        }
      ],
      'module-groups': [
        {
          'host-skill': 'alpha-skill',
          'host-kind': 'domain',
          modules: [
            {
              id: 'alpha-module',
              path: 'skills/domains/alpha-skill/references/alpha.md',
              capability: 'Alpha capability.'
            }
          ]
        }
      ]
    });
  });

  test('runtime-proof governance stays centralized and internally consistent', () => {
    expect(RUNTIME_PROOF_SCHEMA_VERSION).toBe(1);
    expect(MIN_RUNTIME_PROOF_CONTRACTS).toBe(2);
    expect(RUNTIME_PROOF_EVIDENCE_SOURCE_ORDER).toEqual(['explicit', 'existing', 'suggested', 'none']);
    expect(HOST_SMOKED_EVIDENCE_FAILURE_REASONS).toEqual([
      'invalid-contract',
      'missing',
      'contract-drift',
      'failing',
      'stale'
    ]);

    expect(normalizeEvidenceTests([' a ', 'a', '', 'b'])).toEqual(['a', 'b']);
    expect(shouldHaveRuntimeProofEntry({ runtime: 'scripted', kind: 'tool', status: 'stable' })).toBe(true);
    expect(shouldHaveRuntimeProofEntry({ runtime: 'scripted', kind: 'domain', status: 'stable' })).toBe(false);
    expect(defaultRuntimeProofLevelForStatus('stable')).toBe('declared-and-tested');
    expect(hasMinimumRuntimeProofContracts(['one', 'two'])).toBe(true);
    expect(hasMinimumRuntimeProofContracts(['one'])).toBe(false);
    expect(needsEvidenceTestsForRuntimeProofLevel('declared-only')).toBe(false);
    expect(needsEvidenceTestsForRuntimeProofLevel('declared-and-tested')).toBe(true);
    expect(hasRequiredRuntimeProofEvidenceTests('declared-only', [])).toBe(true);
    expect(hasRequiredRuntimeProofEvidenceTests('declared-and-tested', [])).toBe(false);
    expect(hasRequiredRuntimeProofEvidenceTests('host-smoked', ['test/file.test.js::works'])).toBe(true);

    expect(resolveEvidenceTests(
      { 'evidence-tests': ['existing.test.js::case'] },
      { evidenceTests: [' explicit.test.js::case '] },
      ['suggested.test.js::case']
    )).toEqual({
      evidenceTests: ['explicit.test.js::case'],
      evidenceTestSource: 'explicit',
      suggestedEvidenceTests: ['suggested.test.js::case']
    });
    expect(resolveEvidenceTests(
      { 'evidence-tests': ['existing.test.js::case'] },
      {},
      ['suggested.test.js::case']
    )).toEqual({
      evidenceTests: ['existing.test.js::case'],
      evidenceTestSource: 'existing',
      suggestedEvidenceTests: ['suggested.test.js::case']
    });
    expect(resolveEvidenceTests(
      null,
      { autoEvidenceTests: true },
      ['suggested.test.js::case']
    )).toEqual({
      evidenceTests: ['suggested.test.js::case'],
      evidenceTestSource: 'suggested',
      suggestedEvidenceTests: ['suggested.test.js::case']
    });
    expect(resolveEvidenceTests(
      null,
      {},
      ['suggested.test.js::case']
    )).toEqual({
      evidenceTests: [],
      evidenceTestSource: 'none',
      suggestedEvidenceTests: ['suggested.test.js::case']
    });

    expect(buildRuntimeProofRegistryDocument([{ skill: 'x' }])).toEqual({
      'schema-version': 1,
      proofs: [{ skill: 'x' }]
    });
    expect(describeHostSmokedEvidenceFailure({ reason: 'stale' })).toContain('older than the declared freshness window');
    expect(describeHostSmokedEvidenceFailure({ reason: 'missing' })).toContain('no matching runtime host-smoke artifact exists');
  });

  test('personal-core pack ships the minimum self-evolving bundle surface', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);

    expect(report.findings.some((item) => item.message.includes('personal-core is missing required self-evolving include'))).toBe(false);

    const manifestPath = path.join(target, 'packs', 'personal-core', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.includes).toEqual(expect.arrayContaining(PERSONAL_CORE_REQUIRED_INCLUDES));
  });

  test('experimental pack ships the minimum expert-source governance surface', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);

    expect(report.findings.some((item) => item.message.includes('experimental is missing required expert-source include'))).toBe(false);

    const manifestPath = path.join(target, 'packs', 'experimental', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.includes).toEqual(expect.arrayContaining(EXPERIMENTAL_REQUIRED_INCLUDES));
  });

  test('analyzeSkillSystem warns when personal-core drops a required self-evolving include', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const manifestPath = path.join(target, 'packs', 'personal-core', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.includes = manifest.includes.filter((item) => item !== 'registry');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);

    expect(report.findings.some((item) =>
      item.file === 'packs/personal-core/manifest.json'
      && item.message.includes("personal-core is missing required self-evolving include 'registry'")
    )).toBe(true);
  });

  test('analyzeSkillSystem tracks unmapped raw expert sources as governed integration debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    const extraSourceDir = path.join(repoRoot, 'top_developer', 'top-future-governance');
    fs.mkdirSync(extraSourceDir, { recursive: true });
    fs.writeFileSync(path.join(extraSourceDir, 'SKILL.md'), [
      '---',
      'name: top-future-governance',
      'description: raw future expert source',
      '---',
      '',
      '# Raw Future Governance',
      ''
    ].join('\n'));

    const refreshedBacklog = buildSkillInvestmentBacklog(target);
    fs.writeFileSync(
      path.join(target, 'registry', 'skill-investment-backlog.generated.json'),
      JSON.stringify(refreshedBacklog, null, 2) + '\n',
      'utf8'
    );
    writeExpertSourceFamilyScorecard(target);
    const now = Date.parse('2026-05-11T05:25:13.517Z');
    const { skillRecords } = collectSkillRecords(target, []);
    const reviewQueue = buildReviewQueue(target, skillRecords, { now });
    fs.writeFileSync(
      path.join(target, 'registry', 'review-queue.generated.json'),
      JSON.stringify(reviewQueue, null, 2) + '\n',
      'utf8'
    );
    writeSystemReadiness(target, { now, reviewQueue });

    const report = analyzeSkillSystem(target);

    expect(report.metrics.rawExpertSourceSkills).toBe(9);
    expect(report.metrics.integratedExpertSourceSkills).toBe(8);
    expect(report.metrics.integratedExpertModules).toBe(42);
    expect(report.metrics.unmappedRawExpertSources).toBe(1);
    expect(report.findings.some((item) =>
      item.message.includes("raw expert source 'top-future-governance' exists outside governed top-developer integration coverage")
    )).toBe(true);
  });

  test('analyzeSkillSystem fails when top-developer source-index drifts from module provenance', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    const integrationPath = path.join(target, 'registry', 'top-developer-integration.generated.json');
    const integration = JSON.parse(fs.readFileSync(integrationPath, 'utf8'));
    const topQa = integration['source-index'].find((entry) => entry['source-skill'] === 'top-qa');
    topQa.modules = topQa.modules.filter((moduleId) => moduleId !== 'review-findings-and-severity');
    fs.writeFileSync(integrationPath, JSON.stringify(integration, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) =>
      item.message.includes("top-developer integration source-index 'top-qa' is out of sync with module provenance")
    )).toBe(true);
  });

  test('analyzeSkillSystem auto-governs a newly registered expert-source family without validator code changes', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    const rawRoot = path.join(repoRoot, 'expert_research');
    fs.mkdirSync(path.join(rawRoot, 'research-skill-gap'), { recursive: true });
    fs.writeFileSync(path.join(rawRoot, 'research-skill-gap', 'SKILL.md'), [
      '---',
      'name: research-skill-gap',
      'description: raw research expert source',
      '---',
      '',
      '# Research Skill Gap',
      ''
    ].join('\n'));

    const familiesPath = path.join(target, 'registry', 'expert-source-families.generated.json');
    const families = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
    families.families.push({
      id: 'expert-research',
      title: 'Expert Research',
      source: 'expert-research-integration',
      label: 'expert-research integration',
      rawSourceLabel: 'raw expert research source',
      integrationFile: 'registry/expert-research-integration.generated.json',
      rawRoot: '../expert_research',
      schemaVersion: 2,
      integrationMode: 'capability-modules',
      expectedPortable: true,
      parseErrorSummary: 'Repair expert-research integration registry before the next expert-source extraction.',
      unmappedSummaryTemplate: "Integrate raw expert research source '%s' into governed capability modules.",
      sourceDescription: 'registry/expert-research-integration.generated.json + ../expert_research/**/SKILL.md when present',
      backlogFollowUp: [
        'review expert_research/%s/SKILL.md and decide extract-vs-admit'
      ]
    });
    fs.writeFileSync(familiesPath, JSON.stringify(families, null, 2) + '\n', 'utf8');

    const researchIntegration = {
      'schema-version': 2,
      'integration-mode': 'capability-modules',
      portable: true,
      'module-count': 1,
      groups: [
        {
          kind: 'tool',
          name: 'manage-skill',
          modules: ['skill-management-authoritative-crud']
        }
      ],
      modules: [
        {
          module: 'skill-management-authoritative-crud',
          'host-skill': {
            kind: 'tool',
            name: 'manage-skill',
            path: 'skills/tools/manage-skill/SKILL.md'
          },
          path: 'skills/tools/manage-skill/references/authoritative-skill-rules.md',
          capability: 'Keep all core skill create/read/update/delete operations inside the authoritative personal-skill-system/skills tree.',
          'derived-from': ['research-skill-gap']
        }
      ],
      'source-index': [
        {
          'source-skill': 'research-skill-gap',
          modules: ['skill-management-authoritative-crud']
        }
      ]
    };
    fs.writeFileSync(
      path.join(target, 'registry', 'expert-research-integration.generated.json'),
      JSON.stringify(researchIntegration, null, 2) + '\n',
      'utf8'
    );

    const refreshedBacklog = buildSkillInvestmentBacklog(target);
    fs.writeFileSync(
      path.join(target, 'registry', 'skill-investment-backlog.generated.json'),
      JSON.stringify(refreshedBacklog, null, 2) + '\n',
      'utf8'
    );
    writeExpertSourceFamilyScorecard(target);
    const now = Date.parse('2026-05-11T06:10:00.000Z');
    const { skillRecords } = collectSkillRecords(target, []);
    const reviewQueue = buildReviewQueue(target, skillRecords, { now });
    fs.writeFileSync(
      path.join(target, 'registry', 'review-queue.generated.json'),
      JSON.stringify(reviewQueue, null, 2) + '\n',
      'utf8'
    );
    writeSystemReadiness(target, { now, reviewQueue });

    const report = analyzeSkillSystem(target);

    expect(report.metrics.expertSourceFamilies).toBe(2);
    expect(report.metrics.rawExpertSourceSkills).toBe(9);
    expect(report.metrics.integratedExpertSourceSkills).toBe(9);
    expect(report.metrics.integratedExpertModules).toBe(43);
    expect(report.metrics.unmappedRawExpertSources).toBe(0);
    expect(report.findings.some((item) => item.message.includes('expert-research integration'))).toBe(false);
  });

  test('analyzeSkillSystem warns when experimental pack misses a registered expert-source integration include', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    const familiesPath = path.join(target, 'registry', 'expert-source-families.generated.json');
    const families = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
    families.families.push({
      id: 'expert-research',
      title: 'Expert Research',
      source: 'expert-research-integration',
      label: 'expert-research integration',
      rawSourceLabel: 'raw expert research source',
      integrationFile: 'registry/expert-research-integration.generated.json',
      rawRoot: '../expert_research',
      schemaVersion: 2,
      integrationMode: 'capability-modules',
      expectedPortable: true,
      parseErrorSummary: 'Repair expert-research integration registry before the next expert-source extraction.',
      unmappedSummaryTemplate: "Integrate raw expert research source '%s' into governed capability modules.",
      sourceDescription: 'registry/expert-research-integration.generated.json + ../expert_research/**/SKILL.md when present',
      backlogFollowUp: [
        'review expert_research/%s/SKILL.md and decide extract-vs-admit'
      ]
    });
    fs.writeFileSync(familiesPath, JSON.stringify(families, null, 2) + '\n', 'utf8');

    fs.writeFileSync(
      path.join(target, 'registry', 'expert-research-integration.generated.json'),
      JSON.stringify({
        'schema-version': 2,
        'integration-mode': 'capability-modules',
        portable: true,
        'module-count': 0,
        groups: [],
        modules: [],
        'source-index': []
      }, null, 2) + '\n',
      'utf8'
    );

    const manifestPath = path.join(target, 'packs', 'experimental', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.includes = manifest.includes.filter((item) => item !== 'registry/expert-research-integration.generated.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);

    expect(report.findings.some((item) =>
      item.file === 'packs/experimental/manifest.json'
      && item.message.includes("experimental is missing registered expert-source integration include 'registry/expert-research-integration.generated.json'")
    )).toBe(true);
  });

  test('manage-skill update-expert-source-family keeps experimental pack aligned across archive restore and integration moves', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main([
        'register-expert-source-family',
        '--family-id', 'expert-research',
        '--title', 'Expert Research',
        '--source', 'expert-research-integration',
        '--integration-file', 'registry/expert-research-integration.generated.json',
        '--raw-root', '../expert_research'
      ]);

      const manifestPath = path.join(target, 'packs', 'experimental', 'manifest.json');
      let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.includes).toContain('registry/expert-research-integration.generated.json');

      manageSkill.main(['archive-expert-source-family', 'expert-research']);
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.includes).not.toContain('registry/expert-research-integration.generated.json');

      manageSkill.main([
        'restore-expert-source-family', 'expert-research'
      ]);
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.includes).toContain('registry/expert-research-integration.generated.json');

      manageSkill.main([
        'update-expert-source-family',
        '--family-id', 'expert-research',
        '--integration-file', 'registry/expert-research-v2-integration.generated.json'
      ]);
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.includes).toContain('registry/expert-research-v2-integration.generated.json');
      expect(manifest.includes).not.toContain('registry/expert-research-integration.generated.json');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('analyzeSkillSystem ignores archived expert-source family pack includes and active totals', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    const rawRoot = path.join(repoRoot, 'expert_research');
    fs.mkdirSync(path.join(rawRoot, 'research-skill-gap'), { recursive: true });
    fs.writeFileSync(path.join(rawRoot, 'research-skill-gap', 'SKILL.md'), [
      '---',
      'name: research-skill-gap',
      'description: raw research expert source',
      '---',
      '',
      '# Research Skill Gap',
      ''
    ].join('\n'));

    const familiesPath = path.join(target, 'registry', 'expert-source-families.generated.json');
    const families = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
    families.families.push({
      id: 'expert-research',
      title: 'Expert Research',
      source: 'expert-research-integration',
      label: 'expert-research integration',
      rawSourceLabel: 'raw expert research source',
      integrationFile: 'registry/expert-research-integration.generated.json',
      rawRoot: '../expert_research',
      status: 'archived',
      schemaVersion: 2,
      integrationMode: 'capability-modules',
      expectedPortable: true,
      parseErrorSummary: 'Repair expert-research integration registry before the next expert-source extraction.',
      unmappedSummaryTemplate: "Integrate raw expert research source '%s' into governed capability modules.",
      sourceDescription: 'registry/expert-research-integration.generated.json + ../expert_research/**/SKILL.md when present',
      backlogFollowUp: [
        'review expert_research/%s/SKILL.md and decide extract-vs-admit'
      ]
    });
    fs.writeFileSync(familiesPath, JSON.stringify(families, null, 2) + '\n', 'utf8');

    fs.writeFileSync(
      path.join(target, 'registry', 'expert-research-integration.generated.json'),
      JSON.stringify({
        'schema-version': 2,
        'integration-mode': 'capability-modules',
        portable: true,
        'module-count': 0,
        groups: [],
        modules: [],
        'source-index': []
      }, null, 2) + '\n',
      'utf8'
    );

    const manifestPath = path.join(target, 'packs', 'experimental', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.includes = manifest.includes.filter((item) => item !== 'registry/expert-research-integration.generated.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);

    expect(report.metrics.expertSourceFamilies).toBe(2);
    expect(report.metrics.rawExpertSourceSkills).toBe(8);
    expect(report.metrics.unmappedRawExpertSources).toBe(0);
    expect(report.findings.some((item) =>
      item.message.includes("experimental is missing registered expert-source integration include 'registry/expert-research-integration.generated.json'")
    )).toBe(false);
  });

  test('analyzeSkillSystem fails when expert-source family scorecard drifts from governed family state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    writeExpertSourceFamilyScorecard(target);
    const scorecardPath = path.join(target, 'registry', 'expert-source-family-scorecard.generated.json');
    const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
    scorecard.summary['active-families'] = 99;
    fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) =>
      item.file === 'registry/expert-source-family-scorecard.generated.json'
      && item.message.includes('expert-source family scorecard is out of sync')
    )).toBe(true);
  });

  test('analyzeSkillSystem fails when a scripted template loses smoke manifest coverage', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'tool', 'scripts', 'smoke.json'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("scripted template 'tool' is missing scripts/smoke.json"))).toBe(true);
  });

  test('analyzeSkillSystem fails when skill frontmatter enums drift from governed values', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillPath = path.join(target, 'skills', 'tools', 'verify-quality', 'SKILL.md');
    const drifted = fs.readFileSync(skillPath, 'utf8')
      .replace('visibility: public', 'visibility: secret')
      .replace('trigger-mode: [manual]', 'trigger-mode: [auto, reactive]')
      .replace('runtime: scripted', 'runtime: magical')
      .replace('executor: node', 'executor: ruby')
      .replace('risk-level: low', 'risk-level: severe')
      .replace('supported-hosts: [codex, claude, gemini]', 'supported-hosts: [codex, cursor]');
    fs.writeFileSync(skillPath, drifted, 'utf8');

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("visibility 'secret' is not supported"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("trigger-mode 'reactive' is not supported"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("runtime 'magical' is not supported"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("executor 'ruby' is not supported"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("risk-level 'severe' is not supported"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("supported-host 'cursor' is not declared in frontmatter governance"))).toBe(true);
  });

  test('analyzeSkillSystem fails when a canonical template loses required references', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'domain', 'references', 'decision-rules.md'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("template 'domain' only has"))).toBe(true);
  });

  test('analyzeSkillSystem fails when a workflow template drops below the top-tier reference floor', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'workflow', 'references', 'failure-modes.md'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("template 'workflow' only has 2 reference files; expected at least 3"))).toBe(true);
  });

  test('analyzeSkillSystem fails when a canonical template loses host metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'tool', 'agents', 'openai.yaml'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("template 'tool' is missing agents/openai.yaml"))).toBe(true);
  });

  test('manage-skill create keeps a copied bundle structurally analyzable', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-governed-skill-${Date.now()}`;
      manageSkill.main(['create', 'workflow', skillName]);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));

      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      const createdRoute = routeMap.routes.find((route) => route.skill === skillName);
      expect(createdRoute.kind).toBe('workflow');
      expect(createdRoute.namespace).toBe('workflow');

      const hostMetadataPath = path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName, 'agents', 'openai.yaml');
      const hostMetadata = fs.readFileSync(hostMetadataPath, 'utf8');
      expect(hostMetadata).toContain(`display_name: "${skillName.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')} Workflow"`);
      expect(hostMetadata).toContain(`default_prompt: "Use ~/.agents/skills/workflows/${skillName}/SKILL.md as the primary instruction source before acting on ${skillName}."`);

      const skillText = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName, 'SKILL.md'), 'utf8');
      expect(skillText).toContain('scaffold-origin: workflow-template');
      expect(skillText).toContain('scaffold-version: 1');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create adapter scaffolds a governed internal skill without route drift', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-host-adapter-${Date.now()}`;
      const payload = manageSkill.main(['create', 'adapter', skillName]);
      expect(payload.kind).toBe('adapter');
      expect(payload.path).toBe(`personal-skill-system/skills/adapters/${skillName}`);

      const skillFile = path.join(repoRoot, 'personal-skill-system', 'skills', 'adapters', skillName, 'SKILL.md');
      const skillText = fs.readFileSync(skillFile, 'utf8');
      expect(skillText).toContain('kind: adapter');
      expect(skillText).toContain('user-invocable: false');
      expect(skillText).toContain('scaffold-origin: adapter-template');
      expect(skillText).toContain('scaffold-version: 1');

      const hostMetadataPath = path.join(repoRoot, 'personal-skill-system', 'skills', 'adapters', skillName, 'agents', 'openai.yaml');
      const hostMetadata = fs.readFileSync(hostMetadataPath, 'utf8');
      expect(hostMetadata).toContain(`default_prompt: "Use ~/.agents/skills/adapters/${skillName}/SKILL.md as the primary instruction source before acting on ${skillName}."`);

      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      expect(registry.skills.some((entry) => entry.name === skillName && entry.kind === 'adapter')).toBe(true);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      expect(routeMap.routes.some((route) => route.skill === skillName)).toBe(false);

      const fixtures = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json'), 'utf8'));
      expect(fixtures.cases.some((entry) => entry.expect === skillName)).toBe(false);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill update rewrites agents/openai.yaml to match the updated SKILL metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['sync-host-metadata', '--skill', 'verify-quality']);
      manageSkill.main([
        'update',
        'verify-quality',
        '--set',
        'title=Quality Gate Tool',
        '--set',
        'description=Harden maintainability and code-health checks for a repository. Use when quality policy or code-health validation is the primary task.'
      ]);

      const hostMetadataPath = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-quality', 'agents', 'openai.yaml');
      const hostMetadata = fs.readFileSync(hostMetadataPath, 'utf8');
      expect(hostMetadata).toContain('display_name: "Quality Gate Tool"');
      expect(hostMetadata).toContain('short_description: "Harden maintainability and code-health checks for a repository."');
      expect(hostMetadata).toContain('default_prompt: "Use ~/.agents/skills/tools/verify-quality/SKILL.md as the primary instruction source before acting on verify-quality."');

      const routeMapPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json');
      const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const route = routeMap.routes.find((item) => item.skill === 'verify-quality');
      expect(route.priority).toBe(90);
      expect(route.activation['trigger-keywords']).toEqual(expect.arrayContaining([
        'verify-quality',
        'quality scan',
        'complexity scan',
        'code smell',
        'quality check',
        'code quality check'
      ]));
      expect(route.aliases).toEqual(expect.arrayContaining(['vq', 'quality-audit']));
      expect(route.activation['requires-explicit-invocation']).toBe(true);

      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const fixture = fixtures.cases.find((item) => item.name === 'placeholder-route-verify-quality');
      expect(fixture).toEqual(expect.objectContaining({
        expect: 'verify-quality',
        governed: true
      }));
      expect(fixture.query).toContain('Run verify-quality');

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'display_name' is out of sync with SKILL.md"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'short_description' is out of sync with SKILL.md"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' priority"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing trigger-keywords"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("governed route fixture 'placeholder-route-verify-quality' is out of sync"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create --scaffold-modules seeds module-group, route expert-modules, and thin capability ratings', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-domain-skill-${Date.now()}`;
      const payload = manageSkill.main(['create', 'domain', skillName, '--scaffold-modules']);

      expect(payload['scaffolded-capability-modules']).toEqual([
        `${skillName}-decision-rules`,
        `${skillName}-deep-reference-index`,
        `${skillName}-boundaries-and-escalations`
      ]);

      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      const group = registry['module-groups'].find((item) => item['host-skill'] === skillName);
      expect(group).toBeTruthy();
      expect(group['host-kind']).toBe('domain');
      expect(group.modules.map((item) => item.id)).toEqual(payload['scaffolded-capability-modules']);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      const route = routeMap.routes.find((item) => item.skill === skillName);
      expect(route['expert-modules']).toEqual(payload['scaffolded-capability-modules']);

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      expect(ratings['rating-buckets'].thin).toEqual(expect.arrayContaining(payload['scaffolded-capability-modules']));
      expect(ratings['next-batch']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          scope: 'capability-module',
          module: `${skillName}-decision-rules`,
          'host-skill': skillName,
          rating: 'thin',
          priority: 'upgrade-now'
        }),
        expect.objectContaining({
          scope: 'capability-module',
          module: `${skillName}-deep-reference-index`,
          'host-skill': skillName,
          rating: 'thin',
          priority: 'upgrade-now'
        }),
        expect.objectContaining({
          scope: 'capability-module',
          module: `${skillName}-boundaries-and-escalations`,
          'host-skill': skillName,
          rating: 'thin',
          priority: 'upgrade-now'
        })
      ]));

      const ratingsDoc = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
      expect(ratingsDoc).toContain(`- \`${skillName}-decision-rules\` (\`${skillName}\`, \`thin\`): Replace scaffold placeholders, deepen the reference, and add route evidence before promotion.`);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('analyzeSkillSystem warns when a scaffolded skill lags behind the canonical template version', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillFile = path.join(target, 'skills', 'workflows', 'review', 'SKILL.md');
    const original = fs.readFileSync(skillFile, 'utf8');
    const withLineage = original
      .replace('title: Review Workflow', 'title: Review Workflow\nscaffold-origin: workflow-template\nscaffold-version: 1');
    fs.writeFileSync(skillFile, withLineage, 'utf8');

    const templateFile = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const template = fs.readFileSync(templateFile, 'utf8').replace('template-version: 1', 'template-version: 2');
    fs.writeFileSync(templateFile, template, 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'skills/workflows/review/SKILL.md'
      && item.message.includes("skill scaffold-version '1' is behind canonical workflow template version '2'")
    )).toBe(true);
  });

  test('sync-scaffold-lineage backfills canonical lineage for one historical skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);
    stripScaffoldLineageFromSkill(path.join(target, 'skills', 'workflows', 'review', 'SKILL.md'));

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-scaffold-lineage', 'review']);
      expect(payload.action).toBe('sync-scaffold-lineage');
      expect(payload.scope).toBe('single');
      expect(payload.skill).toBe('review');
      expect(payload.synced).toEqual([
        expect.objectContaining({
          skill: 'review',
          current: {
            origin: 'workflow-template',
            version: 1
          }
        })
      ]);

      const skillText = fs.readFileSync(path.join(target, 'skills', 'workflows', 'review', 'SKILL.md'), 'utf8');
      expect(skillText).toContain('scaffold-origin: workflow-template');
      expect(skillText).toContain('scaffold-version: 1');

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) =>
        item.file === 'skills/workflows/review/SKILL.md'
        && item.message.includes('missing scaffold lineage metadata')
      )).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('collectSkillRecords exports scaffold lineage metadata for governed consumers', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const findings = [];
    const { skillRecords } = collectSkillRecords(target, findings);
    const review = skillRecords.find((item) => item.name === 'review');

    expect(findings.some((item) => item.severity === 'error')).toBe(false);
    expect(review).toEqual(expect.objectContaining({
      scaffoldOrigin: 'workflow-template',
      scaffoldVersion: 1,
      canonicalScaffoldOrigin: 'workflow-template',
      canonicalScaffoldVersion: 1,
      scaffoldDriftStatus: 'current'
    }));
  });

  test('sync-scaffold-lineage --all backfills historical skills and clears missing-lineage findings', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const filesToStrip = [
      ['skills', 'domains', 'ai', 'SKILL.md'],
      ['skills', 'domains', 'architecture', 'SKILL.md'],
      ['skills', 'domains', 'chart-visualization', 'SKILL.md'],
      ['skills', 'domains', 'data-engineering', 'SKILL.md'],
      ['skills', 'domains', 'development', 'SKILL.md'],
      ['skills', 'domains', 'devops', 'SKILL.md'],
      ['skills', 'domains', 'frontend-design', 'SKILL.md'],
      ['skills', 'domains', 'frontend-design', 'variants', 'claymorphism', 'SKILL.md'],
      ['skills', 'domains', 'frontend-design', 'variants', 'glassmorphism', 'SKILL.md'],
      ['skills', 'domains', 'frontend-design', 'variants', 'liquid-glass', 'SKILL.md'],
      ['skills', 'domains', 'frontend-design', 'variants', 'neubrutalism', 'SKILL.md'],
      ['skills', 'domains', 'infrastructure', 'SKILL.md'],
      ['skills', 'domains', 'mobile', 'SKILL.md'],
      ['skills', 'domains', 'orchestration', 'SKILL.md'],
      ['skills', 'domains', 'security', 'SKILL.md'],
      ['skills', 'guards', 'pre-commit-gate', 'SKILL.md'],
      ['skills', 'guards', 'pre-merge-gate', 'SKILL.md'],
      ['skills', 'tools', 'gen-docs', 'SKILL.md'],
      ['skills', 'tools', 'manage-skill', 'SKILL.md'],
      ['skills', 'tools', 'verify-change', 'SKILL.md'],
      ['skills', 'tools', 'verify-chart-spec', 'SKILL.md'],
      ['skills', 'tools', 'verify-module', 'SKILL.md'],
      ['skills', 'tools', 'verify-quality', 'SKILL.md'],
      ['skills', 'tools', 'verify-s2-config', 'SKILL.md'],
      ['skills', 'tools', 'verify-security', 'SKILL.md'],
      ['skills', 'tools', 'verify-skill-system', 'SKILL.md'],
      ['skills', 'workflows', 'architecture-decision', 'SKILL.md'],
      ['skills', 'workflows', 'bugfix', 'SKILL.md'],
      ['skills', 'workflows', 'investigate', 'SKILL.md'],
      ['skills', 'workflows', 'multi-agent', 'SKILL.md'],
      ['skills', 'workflows', 'review', 'SKILL.md'],
      ['skills', 'workflows', 'ship', 'SKILL.md'],
      ['skills', 'workflows', 'skill-evolution', 'SKILL.md']
    ];
    for (const parts of filesToStrip) {
      stripScaffoldLineageFromSkill(path.join(target, ...parts));
    }

    const before = analyzeSkillSystem(target);
    const beforeMissing = before.findings.filter((item) => item.message.includes('missing scaffold lineage metadata'));
    expect(beforeMissing.length).toBeGreaterThan(0);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-scaffold-lineage', '--all']);
      expect(payload.action).toBe('sync-scaffold-lineage');
      expect(payload.scope).toBe('all');
      expect(payload.synced.length).toBe(beforeMissing.length);
      expect(payload.unchanged).toEqual(['host-governance', 'reliability-governance', 'imagegen', 'plugin-creator']);

      const after = analyzeSkillSystem(target);
      expect(after.findings.some((item) => item.message.includes('missing scaffold lineage metadata'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create rejects capability-module scaffolding for unsupported kinds', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['create', 'tool', `temp-tool-${Date.now()}`, '--scaffold-modules']))
        .toThrow("capability-module scaffolding is only supported for domain and workflow skills, not 'tool'");
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check stays read-only while recommending add vs reuse vs upgrade paths', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const registryBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8');
      const routeMapBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8');
      const ledgerBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8');

      const reuse = manageSkill.main(['admission-check', '--no-record', 'we need to create skill crud flows and archive skill records safely']);
      expect(reuse.recommendation.action).toBe('reuse-existing-skill');
      expect(reuse.recommendation.target_skill).toBe('manage-skill');

      const upgrade = manageSkill.main(['admission-check', '--no-record', 'release process needs stronger verification checklist']);
      expect(upgrade.recommendation.action).toBe('upgrade-existing-skill');
      expect(upgrade.recommendation.target_skill).toBe('ship');

      const create = manageSkill.main(['admission-check', '--no-record', '--kind', 'guard', 'we need a new policy gate that blocks unsafe skill deletion during pack release']);
      expect(create.recommendation.action).toBe('create-new-skill');
      expect(create.recommendation.suggested_kind).toBe('guard');
      expect(create.follow_up).toContain('create the governed scaffold with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js create guard <skill-name>');

      const registryAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8');
      const routeMapAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8');
      const ledgerAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8');
      expect(registryAfter).toBe(registryBefore);
      expect(routeMapAfter).toBe(routeMapBefore);
      expect(ledgerAfter).toBe(ledgerBefore);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check records create-new-skill decisions in the governed admission ledger', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', '--kind', 'guard', 'we need a new policy gate that blocks unsafe skill deletion during pack release']);
      expect(payload['request-id']).toBeTruthy();
      expect(payload['recorded-at']).toBeTruthy();

      const ledger = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8'));
      expect(ledger).toEqual(expect.objectContaining({
        'schema-version': 2,
        source: 'managed-via-manage-skill',
        summary: expect.objectContaining({
          total: expect.any(Number),
          open: expect.any(Number)
        })
      }));
      const entry = ledger.entries.find((item) => item['request-id'] === payload['request-id']);
      expect(entry).toEqual(expect.objectContaining({
        request: 'we need a new policy gate that blocks unsafe skill deletion during pack release',
        status: 'open'
      }));
      expect(entry.decision).toEqual(expect.objectContaining({
        action: 'create-new-skill',
        suggested_kind: 'guard'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check records upgrade-existing-skill as advised-upgrade', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', 'release process needs stronger verification checklist']);
      expect(payload.recommendation.action).toBe('upgrade-existing-skill');

      const ledger = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8'));
      const entry = ledger.entries.find((item) => item['request-id'] === payload['request-id']);
      expect(entry).toEqual(expect.objectContaining({
        status: 'advised-upgrade'
      }));
      expect(entry.decision).toEqual(expect.objectContaining({
        action: 'upgrade-existing-skill',
        target_skill: 'ship'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check records clarify-or-merge-boundary as blocked', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', '--kind', 'tool', 'verify-quality verify-security overlap on one validator request']);
      expect(payload.recommendation.action).toBe('clarify-or-merge-boundary');

      const ledger = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8'));
      const entry = ledger.entries.find((item) => item['request-id'] === payload['request-id']);
      expect(entry).toEqual(expect.objectContaining({
        status: 'blocked'
      }));
      expect(entry.decision).toEqual(expect.objectContaining({
        action: 'clarify-or-merge-boundary'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill evolution-check stays read-only with --no-record while recommending existing-skill lifecycle moves', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const evolutionLedgerBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'evolution-ledger.generated.json'), 'utf8');

      const payload = manageSkill.main(['evolution-check', 'verify-quality', '--no-record', 'this skill should be archived after replacement']);
      expect(payload.recommendation.action).toBe('archive-skill');

      const evolutionLedgerAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'evolution-ledger.generated.json'), 'utf8');
      expect(evolutionLedgerAfter).toBe(evolutionLedgerBefore);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill evolution-check records lifecycle recommendations in the governed evolution ledger', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['evolution-check', 'verify-quality', 'this skill should be archived after replacement']);
      expect(payload['request-id']).toBeTruthy();
      expect(payload['recorded-at']).toBeTruthy();

      const ledger = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'evolution-ledger.generated.json'), 'utf8'));
      expect(ledger).toEqual(expect.objectContaining({
        'schema-version': 2,
        source: 'managed-via-manage-skill',
        summary: expect.objectContaining({
          total: expect.any(Number),
          open: expect.any(Number)
        })
      }));
      const entry = ledger.entries.find((item) => item['request-id'] === payload['request-id']);
      expect(entry).toEqual(expect.objectContaining({
        skill: 'verify-quality',
        status: 'open'
      }));
      expect(entry.decision).toEqual(expect.objectContaining({
        action: 'archive-skill',
        target_status: 'archived'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create --request-id closes the governed admission request as implemented', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const admission = manageSkill.main(['admission-check', '--kind', 'workflow', 'we need a repeatable dependency-upgrade workflow']);
      const skillName = `temp-admission-workflow-${Date.now()}`;
      const created = manageSkill.main(['create', 'workflow', skillName, '--request-id', admission['request-id']]);

      expect(created['admission-request-id']).toBe(admission['request-id']);

      const ledgerPayload = manageSkill.main(['show-admission-ledger', '--request-id', admission['request-id']]);
      expect(ledgerPayload.returned).toBe(1);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        'request-id': admission['request-id'],
        status: 'implemented',
        'created-skill': skillName
      }));
      expect(ledgerPayload.entries[0]['resolved-at']).toBeTruthy();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill set-status --request-id closes the governed evolution request as implemented', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const evolution = manageSkill.main(['evolution-check', 'verify-quality', 'this tool should be deprecated now']);
      const payload = manageSkill.main(['set-status', 'verify-quality', 'deprecated', '--request-id', evolution['request-id']]);
      expect(payload['evolution-request-id']).toBe(evolution['request-id']);

      const ledgerPayload = manageSkill.main(['show-evolution-ledger', '--request-id', evolution['request-id']]);
      expect(ledgerPayload.returned).toBe(1);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        'request-id': evolution['request-id'],
        status: 'implemented',
        'executed-action': 'set-status',
        'result-status': 'deprecated'
      }));
      expect(ledgerPayload.entries[0]['resolved-at']).toBeTruthy();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill merge --request-id closes the governed evolution request with merged-into history', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const evolution = manageSkill.main(['evolution-check', 'verify-quality', 'merge this skill into review']);
      const payload = manageSkill.main(['merge', 'verify-quality', 'review', '--request-id', evolution['request-id']]);
      expect(payload['evolution-request-id']).toBe(evolution['request-id']);

      const ledgerPayload = manageSkill.main(['show-evolution-ledger', '--request-id', evolution['request-id']]);
      expect(ledgerPayload.returned).toBe(1);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        'request-id': evolution['request-id'],
        status: 'implemented',
        'executed-action': 'merge',
        'result-status': 'archived',
        'merged-into': 'review'
      }));
      expect(ledgerPayload.entries[0]['resolved-at']).toBeTruthy();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('verify-skill-system fails when implemented admission requests reference missing created skills', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ledgerPath = path.join(target, 'registry', 'admission-ledger.generated.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      'schema-version': 2,
      'generated-at': '2026-05-08T01:00:00Z',
      source: 'managed-via-manage-skill',
      summary: {
        total: 1,
        active: 0,
        open: 0,
        planned: 0,
        'in-progress': 0,
        blocked: 0,
        deferred: 0,
        implemented: 1,
        cancelled: 0,
        resolved: 0,
        'advised-reuse': 0,
        'advised-upgrade': 0,
        'advised-noop': 0
      },
      entries: [
        {
          'request-id': '20260508-missing-skill',
          request: 'we need a missing skill record',
          decision: {
            action: 'create-new-skill',
            suggested_kind: 'tool'
          },
          status: 'implemented',
          'created-skill': 'totally-missing-skill',
          'recorded-at': '2026-05-08T00:00:00Z',
          'resolved-at': '2026-05-08T01:00:00Z'
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/admission-ledger.generated.json'
      && item.message.includes("references unknown created-skill 'totally-missing-skill'")
    )).toBe(true);
  });

  test('verify-skill-system accepts historical created-skill references when governed delete evidence exists', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ledgerPath = path.join(target, 'registry', 'admission-ledger.generated.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      'schema-version': 2,
      'generated-at': '2026-05-08T01:00:00Z',
      source: 'managed-via-manage-skill',
      summary: {
        total: 1,
        active: 0,
        open: 0,
        planned: 0,
        'in-progress': 0,
        blocked: 0,
        deferred: 0,
        implemented: 1,
        cancelled: 0,
        resolved: 0,
        'advised-reuse': 0,
        'advised-upgrade': 0,
        'advised-noop': 0
      },
      entries: [
        {
          'request-id': '20260508-deleted-skill',
          request: 'we needed a temporary skill record',
          decision: {
            action: 'create-new-skill',
            suggested_kind: 'tool'
          },
          status: 'implemented',
          'created-skill': 'deleted-skill-proof',
          'recorded-at': '2026-05-08T00:00:00Z',
          'resolved-at': '2026-05-08T01:00:00Z'
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const evolutionPath = path.join(target, 'registry', 'evolution-ledger.generated.json');
    fs.writeFileSync(evolutionPath, JSON.stringify({
      'schema-version': 2,
      'generated-at': '2026-05-09T10:05:00Z',
      source: 'managed-via-manage-skill',
      summary: {
        total: 1,
        active: 0,
        open: 0,
        implemented: 1,
        resolved: 0,
        'advised-noop': 0
      },
      entries: [
        {
          'request-id': '20260509-delete-proof',
          skill: 'deleted-skill-proof',
          request: 'delete temporary skill after migration',
          decision: {
            action: 'delete-skill',
            target_status: 'deleted'
          },
          status: 'implemented',
          'executed-action': 'delete',
          'result-status': 'deleted',
          'recorded-at': '2026-05-09T10:00:00Z',
          'resolved-at': '2026-05-09T10:05:00Z'
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/admission-ledger.generated.json'
      && item.message.includes("references unknown created-skill 'deleted-skill-proof'")
    )).toBe(false);
  });

  test('verify-skill-system fails when implemented evolution requests reference impossible outcomes', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ledgerPath = path.join(target, 'registry', 'evolution-ledger.generated.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      'schema-version': 2,
      'generated-at': '2026-05-09T10:05:00Z',
      source: 'managed-via-manage-skill',
      summary: {
        total: 1,
        active: 0,
        open: 0,
        implemented: 1,
        resolved: 0,
        'advised-noop': 0
      },
      entries: [
        {
          'request-id': '20260509-missing-skill',
          skill: 'totally-missing-skill',
          request: 'archive this removed skill',
          decision: {
            action: 'archive-skill',
            target_status: 'archived'
          },
          status: 'implemented',
          'executed-action': 'archive',
          'result-status': 'archived',
          'recorded-at': '2026-05-09T10:00:00Z',
          'resolved-at': '2026-05-09T10:05:00Z'
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/evolution-ledger.generated.json'
      && item.message.includes("implemented evolution ledger entry '20260509-missing-skill' references missing skill 'totally-missing-skill' for non-delete result")
    )).toBe(true);
  });

  test('template review debt appears in the governed investment backlog', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const templateFile = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const original = fs.readFileSync(templateFile, 'utf8');
    const next = original
      .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-01-01')
      .replace(/^review-cycle-days:\s*.*$/m, 'review-cycle-days: 30');
    fs.writeFileSync(templateFile, next, 'utf8');

    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();
    try {
      const backlog = buildSkillInvestmentBacklog(target);
      expect(backlog.sources['template-scaffolds']).toBe('templates/skill/**/SKILL.md');
      expect(backlog.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'template-governance-workflow',
          category: 'template-governance',
          source: 'template-scaffolds',
          kind: 'workflow'
        })
      ]));
      const item = backlog.items.find((entry) => entry.id === 'template-governance-workflow');
      expect(item.reasons).toContain('review-status:overdue');
      expect(item.reasons).toContain('next-review-due:2026-01-31');
    } finally {
      Date.now = originalNow;
    }
  });

  test('analyzeSkillSystem warns when canonical template review cadence expires', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const templateFile = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const original = fs.readFileSync(templateFile, 'utf8');
    const next = original
      .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-01-01')
      .replace(/^review-cycle-days:\s*.*$/m, 'review-cycle-days: 30');
    fs.writeFileSync(templateFile, next, 'utf8');

    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();
    try {
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) =>
        item.file === 'templates/skill/workflow/SKILL.md'
        && item.message.includes("template 'workflow' review cadence expired on 2026-01-31")
      )).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  test('manage-skill set-module-rating --skill promotes every module in the host skill and clears next-batch', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-workflow-${Date.now()}`;
      const createPayload = manageSkill.main(['create', 'workflow', skillName, '--scaffold-modules']);
      const scaffoldedModules = createPayload['scaffolded-capability-modules'];

      const firstPromotion = manageSkill.main(['set-module-rating', '--skill', skillName, 'strong-but-not-top']);
      expect(firstPromotion.scope).toBe('skill');
      expect(firstPromotion.skill).toBe(skillName);
      expect(firstPromotion.modules).toEqual(scaffoldedModules);

      const secondPromotion = manageSkill.main(['set-module-rating', '--skill', skillName, 'top-ready']);
      expect(secondPromotion.scope).toBe('skill');
      expect(secondPromotion.modules).toEqual(scaffoldedModules);
      expect(secondPromotion.rating).toBe('top-ready');

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      for (const moduleId of scaffoldedModules) {
        expect(ratings['rating-buckets']['top-ready']).toContain(moduleId);
        expect(ratings['rating-buckets']['strong-but-not-top']).not.toContain(moduleId);
        expect(ratings['rating-buckets'].thin).not.toContain(moduleId);
      }
      expect((ratings['next-batch'] || []).some((item) => scaffoldedModules.includes(item.module))).toBe(false);

      const ratingsDoc = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
      for (const moduleId of scaffoldedModules) {
        expect(ratingsDoc).toContain(`- \`${moduleId}\``);
      }

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create seeds fresh review metadata instead of copying template review history', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      process.chdir(repoRoot);
      Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = 'seeded-review-skill';
      manageSkill.main(['create', 'domain', skillName]);

      const createdSkillPath = path.join(
        repoRoot,
        'personal-skill-system',
        'skills',
        'domains',
        skillName,
        'SKILL.md'
      );
      const createdSkill = fs.readFileSync(createdSkillPath, 'utf8');
      expect(createdSkill).toContain('owner: self');
      expect(createdSkill).toContain('last-reviewed: 2026-05-15');
      expect(createdSkill).toContain('review-cycle-days: 60');
      expect(createdSkill).not.toContain('last-reviewed: 2026-04-17');
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('archived user-invocable skills do not require active route entries', () => {
    const findings = [];
    const targetDir = 'C:/tmp/personal-skill-system';
    const routeMapPath = 'C:/tmp/personal-skill-system/registry/route-map.generated.json';
    const routeMapData = { routes: [] };
    const registryNames = new Set(['archived-skill']);
    const skillRecords = [
      {
        name: 'archived-skill',
        kind: 'workflow',
        userInvocable: true,
        status: 'archived',
        file: 'skills/workflows/archived-skill/SKILL.md'
      }
    ];
    const moduleNames = new Set();

    validateRouteMap(targetDir, routeMapPath, routeMapData, registryNames, skillRecords, moduleNames, [], findings, (root, file) => file);

    expect(findings).toEqual([]);
  });

  test('route map rejects kind drift between route entry and skill metadata', () => {
    const findings = [];
    const targetDir = 'C:/tmp/personal-skill-system';
    const routeMapPath = 'C:/tmp/personal-skill-system/registry/route-map.generated.json';
    const routeMapData = {
      routes: [
        {
          skill: 'kind-drift-skill',
          kind: 'tool',
          activation: { 'intent-tags': ['execute'], 'trigger-keywords': ['kind-drift-skill'], 'negative-keywords': [] }
        }
      ]
    };
    const registryNames = new Set(['kind-drift-skill']);
    const skillRecords = [
      {
        name: 'kind-drift-skill',
        kind: 'workflow',
        userInvocable: true,
        status: 'stable',
        file: 'skills/workflows/kind-drift-skill/SKILL.md'
      }
    ];
    const moduleNames = new Set();

    validateRouteMap(targetDir, routeMapPath, routeMapData, registryNames, skillRecords, moduleNames, [], findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("declares kind 'tool' but skill metadata says 'workflow'"))).toBe(true);
  });

  test('route map rejects shared route metadata drift from SKILL frontmatter', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'verify-quality');
    route.priority = 77;
    route.activation['trigger-keywords'] = ['verify-quality'];
    route.aliases = [];
    route.activation['requires-explicit-invocation'] = false;
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing trigger-keywords declared in SKILL metadata"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing aliases declared in SKILL metadata"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("route 'verify-quality' requires-explicit-invocation 'false' is out of sync with SKILL trigger-mode"))).toBe(true);
  });

  test('route map rejects expert-module drift from the registered module-group', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'manage-skill');
    delete route['expert-modules'];
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("route 'manage-skill' expert-modules are out of sync with registry.generated.json module-group"))).toBe(true);
  });

  test('stable user-invocable skills require route-fixture evidence', () => {
    const findings = [];
    const fixturesPath = 'C:/tmp/personal-skill-system/registry/route-fixtures.generated.json';
    const fixturesData = { cases: [] };
    const skillRecords = [
      {
        name: 'fixtureless-stable-skill',
        kind: 'domain',
        userInvocable: true,
        status: 'stable',
        file: 'skills/domains/fixtureless-stable-skill/SKILL.md'
      }
    ];

    validateStableRouteEvidence('C:/tmp/personal-skill-system', fixturesPath, fixturesData, skillRecords, findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("stable skill 'fixtureless-stable-skill' has no route fixture evidence"))).toBe(true);
  });

  test('stable user-invocable skills do not count governed placeholder fixtures as top-tier evidence', () => {
    const findings = [];
    const fixturesPath = 'C:/tmp/personal-skill-system/registry/route-fixtures.generated.json';
    const fixturesData = {
      cases: [
        {
          name: 'placeholder-route-fixtureless-stable-skill',
          query: 'Run fixtureless-stable-skill for this request.',
          expect: 'fixtureless-stable-skill',
          'expect-no-fallback': true,
          governed: true
        }
      ]
    };
    const skillRecords = [
      {
        name: 'fixtureless-stable-skill',
        kind: 'domain',
        userInvocable: true,
        status: 'stable',
        file: 'skills/domains/fixtureless-stable-skill/SKILL.md'
      }
    ];

    validateStableRouteEvidence('C:/tmp/personal-skill-system', fixturesPath, fixturesData, skillRecords, findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("stable skill 'fixtureless-stable-skill' has no route fixture evidence"))).toBe(true);
  });

  test('route fixture governance stays centralized for governed placeholders and real-evidence summaries', () => {
    const record = {
      name: 'fixtureless-stable-skill',
      kind: 'domain',
      userInvocable: true,
      status: 'stable',
      triggerKeywords: ['llm', 'agent system'],
      aliases: ['ai-domain']
    };
    const governedFixture = buildGovernedRouteFixture(record);
    const expectedFixture = buildExpectedGovernedRouteFixtureForRecord(record);
    const routeFixturesData = {
      'schema-version': ROUTE_FIXTURE_SCHEMA_VERSION,
      cases: [
        governedFixture,
        {
          name: 'real-fixtureless-stable-skill',
          query: 'Design an llm agent system safety rubric for this prompt stack.',
          expect: 'fixtureless-stable-skill'
        }
      ]
    };

    expect(governedFixture).toEqual(expect.objectContaining({
      name: 'placeholder-route-fixtureless-stable-skill',
      expect: 'fixtureless-stable-skill',
      governed: true,
      'expect-no-fallback': true
    }));
    expect(expectedFixture).toEqual(governedFixture);
    expect(isGovernedRouteFixture(governedFixture)).toBe(true);
    expect(findGovernedRouteFixtureForSkill(routeFixturesData.cases, 'fixtureless-stable-skill')).toEqual(governedFixture);
    expect(hasRouteFixtureEvidence('fixtureless-stable-skill', routeFixturesData.cases, { includeGoverned: false })).toBe(true);
    expect(summarizeRouteFixtureEvidence('fixtureless-stable-skill', routeFixturesData)).toEqual(expect.objectContaining({
      total: 2,
      governed: 1,
      nongoverned: 1,
      'stable-evidence-satisfied': true,
      'real-fixtures': ['real-fixtureless-stable-skill'],
      'governed-fixtures': ['placeholder-route-fixtureless-stable-skill']
    }));
    expect(parseRouteFixtureExpectations({
      name: 'fallback-demo',
      query: 'Do diff analysis before merge.',
      'expect-fallback-mode': 'do-not-auto-route',
      'expect-fallback-question-contains': 'verify-change'
    })).toEqual({
      expectedSkill: null,
      expectedFallbackMode: 'do-not-auto-route',
      expectedFallbackQuestionContains: 'verify-change',
      expectNoFallback: false
    });
  });

  test('stable scripted skills require runtime proof bullets', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillFile = path.join(target, 'skills', 'tools', 'verify-quality', 'SKILL.md');
    const original = fs.readFileSync(skillFile, 'utf8');
    const weakened = original.replace(/\n## Runtime Proof[\s\S]*?\n## Run\n/, '\n## Run\n');
    fs.writeFileSync(skillFile, weakened, 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('stable scripted skill should declare at least two runtime proof bullets'))).toBe(true);
  });

  test('verify-skill-system fails when capability next-batch misses upgrade candidates', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    ratings['rating-buckets'].thin = ['temp-module'];
    ratings.counts.thin = 1;
    ratings.counts.total += 1;
    ratings['next-batch'] = [];
    fs.writeFileSync(ratingsPath, JSON.stringify(ratings, null, 2) + '\n', 'utf8');

    const registryPath = path.join(target, 'registry', 'registry.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry['module-groups'].push({
      'host-skill': 'manage-skill',
      'host-kind': 'tool',
      modules: [
        {
          id: 'temp-module',
          path: 'skills/tools/manage-skill/references/authoritative-skill-rules.md',
          capability: 'Temporary upgrade candidate.'
        }
      ]
    });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("capability next-batch is missing upgrade candidate 'temp-module'"))).toBe(true);
  });

  test('verify-skill-system fails when ratings doc next-batch section drifts from generated data', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const docPath = path.join(target, 'docs', 'CAPABILITY_MODULE_RATINGS.md');
    const original = fs.readFileSync(docPath, 'utf8');
    const drifted = original.replace(
      '- `(none; the current bundle is fully promoted in this snapshot)`',
      '- `wrong-module` (`wrong-skill`, `thin`): stale doc entry'
    );
    fs.writeFileSync(docPath, drifted, 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("ratings doc 'Next Batch' section is out of sync with capability-ratings.generated.json"))).toBe(true);
  });

  test('draft skills do not need skill-level-summary membership', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-draft-skill-${Date.now()}`;
      manageSkill.main(['create', 'tool', skillName]);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) =>
        item.file === 'registry/capability-ratings.generated.json'
        && item.message.includes(`active skill '${skillName}' is missing from skill-level-summary`)
      )).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('stable scripted skills require runtime-proof registry coverage', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.proofs = registry.proofs.filter((item) => item.skill !== 'verify-quality');
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("stable scripted skill 'verify-quality' is missing from runtime-proof.generated.json"))).toBe(true);
  });

  test('runtime-proof registry contracts must match SKILL runtime proof bullets', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-security');
    proof.contracts[0] = 'mismatched contract text';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof registry contracts for 'verify-security' do not match"))).toBe(true);
  });

  test('runtime-proof evidence tests must point to real test cases', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'pre-merge-gate');
    proof['evidence-tests'] = ['test/personal_skill_system_tools.test.js::nonexistent runtime proof'];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof evidence test 'test/personal_skill_system_tools.test.js::nonexistent runtime proof' for 'pre-merge-gate' was not found in the referenced test file"))).toBe(true);
  });

  test('stable scripted skills require runtime-proof host-smoke metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-quality');
    delete proof['host-smoke'];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' is missing host-smoke metadata"))).toBe(true);
  });

  test('runtime-proof host-smoke metadata must match the skill smoke manifest', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-security');
    proof['host-smoke'].commands[0].expect.tool = 'broken-signal';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof host-smoke metadata for 'verify-security' does not match scripts/smoke.json"))).toBe(true);
  });

  test('host-smoked runtime-proof entries require at least one host smoke command', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-module');
    proof.level = 'host-smoked';
    proof['host-smoke'].commands = [];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-module' marked 'host-smoked' must declare at least one host-smoke command"))).toBe(true);
  });

  test('host-smoked runtime-proof entries require matching executed host-smoke evidence', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runDir = path.join(target, 'benchmark', 'host-smoke', 'runtime-runs');
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-module');
    proof.level = 'host-smoked';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-module' is marked 'host-smoked' but no matching runtime host-smoke artifact exists"))).toBe(true);
  });

  test('executed runtime host-smoke evidence satisfies host-smoked governance', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['run-host-smoke', 'verify-quality', '--host', 'codex', '--promote-host-smoked']);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) => item.message.includes("verify-quality' is marked 'host-smoked' but no matching runtime host-smoke artifact exists"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("verify-quality' is marked 'host-smoked' but the latest matching runtime host-smoke artifact did not pass"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('verify-skill-system fails when host-smoke scorecard is missing', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json'), { force: true });

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('host-smoke scorecard parse failed'))).toBe(true);
  });

  test('verify-skill-system fails when host-smoke scorecard drifts from runtime evidence', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const scorecardPath = path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json');
    const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
    scorecard.summary['host-smoke-capable-skills'] = 999;
    fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('host-smoke scorecard is out of sync'))).toBe(true);
  });

  test('reconcile-host-smoke invalidates drifted artifacts through the governed ledger and clears contract-drift', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(target, 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const driftedEntry = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
      driftedEntry['host-smoke'].commands[0].expect.tool = 'manage-skill-drift';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['reconcile-host-smoke', 'manage-skill', '--invalidate-drift']);
      expect(payload.action).toBe('reconcile-host-smoke');

      const invalidationPath = path.join(target, 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(Array.isArray(ledger.entries)).toBe(true);
      expect(ledger.entries.some((entry) => entry.skill === 'manage-skill' && entry.reason === 'contract-drift')).toBe(true);
      expect(payload.invalidated_runs).toBeGreaterThanOrEqual(0);

      const scorecardPath = path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json');
      const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
      const manageSkillEntry = scorecard.skills.find((item) => item.skill === 'manage-skill');
      expect(['missing', 'passing']).toContain(manageSkillEntry['evidence-status']);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime host-smoke artifacts exist for 'manage-skill' but do not match the current host-smoke contract"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes('host-smoke invalidation ledger is out of sync'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-runtime-proof invalidates drifted host-smoke artifacts for the selected skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'manage-skill']);
      expect(payload.action).toBe('sync-runtime-proof');
      expect(payload.skill).toBe('manage-skill');

      const invalidationPath = path.join(target, 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(ledger.entries.some((entry) => entry.skill === 'manage-skill' && entry.reason === 'contract-drift')).toBe(true);
      expect(payload.invalidated_runs).toBeGreaterThanOrEqual(0);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime host-smoke artifacts exist for 'manage-skill' but do not match the current host-smoke contract"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes('host-smoke invalidation ledger is out of sync'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-runtime-proof --all invalidates drifted host-smoke artifacts bundle-wide', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', '--all']);
      expect(payload.action).toBe('sync-runtime-proof');
      expect(payload.scope).toBe('all');
      expect(typeof payload.invalidated_runs).toBe('number');
      expect(payload.invalidated_runs).toBeGreaterThanOrEqual(0);
      expect(payload.updated).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'manage-skill'
        })
      ]));

      const invalidationPath = path.join(target, 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(Array.isArray(ledger.entries)).toBe(true);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime host-smoke artifacts exist for 'manage-skill' but do not match the current host-smoke contract"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('verify-skill-system fails when system readiness artifact drifts from current governance state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const readinessPath = path.join(target, 'benchmark', 'system-readiness.generated.json');
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    readiness.summary['runtime-proof-entries'] = 999;
    fs.writeFileSync(readinessPath, JSON.stringify(readiness, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'benchmark/system-readiness.generated.json'
      && item.message.includes('system readiness is out of sync')
    )).toBe(true);
  });

  test('verify-skill-system fails when a stable skill still owns non-top-ready capability modules', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    ratings['rating-buckets']['top-ready'] = ratings['rating-buckets']['top-ready'].filter((item) => item !== 'skill-management-authoritative-crud');
    ratings['rating-buckets']['strong-but-not-top'].push('skill-management-authoritative-crud');
    ratings.counts['top-ready'] -= 1;
    ratings.counts['strong-but-not-top'] += 1;
    fs.writeFileSync(ratingsPath, JSON.stringify(ratings, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/capability-ratings.generated.json'
      && item.message.includes("stable skill 'manage-skill' has non-top-ready capability modules")
    )).toBe(true);
  });

  test('verify-skill-system fails when a stable skill is blocked by stale expert-source governance', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    fs.rmSync(path.join(repoRoot, 'top_developer', 'top-qa'), { recursive: true, force: true });

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/capability-ratings.generated.json'
      && item.message.includes("stable skill 'review' is blocked by expert-source governance")
    )).toBe(true);
  });

  test('verify-skill-system warns when generated governance artifacts are not writable on the host', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    jest.resetModules();
    jest.doMock(commonModulePath, () => {
      const actual = jest.requireActual(commonModulePath);
      return {
        ...actual,
        collectGeneratedArtifactWriteability: jest.fn(() => ([
          {
            id: 'system-readiness',
            path: path.join(target, 'benchmark', 'system-readiness.generated.json'),
            mode: 'rewrite-file',
            label: 'system readiness artifact',
            ok: false,
            code: 'EPERM'
          }
        ]))
      };
    });

    try {
      const { analyzeSkillSystem } = require('../personal-skill-system/skills/tools/lib/skill-system');
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes('system readiness artifact is not writable on this host'))).toBe(true);
    } finally {
      jest.dontMock(commonModulePath);
    }
  });

  test('verify-skill-system self-smoke passes on a controlled writable copy even when the live host is write-constrained', () => {
    const originalArgv = process.argv;
    const originalWrite = process.stdout.write;
    let stdout = '';

    try {
      jest.resetModules();
      process.argv = [
        'node',
        verifySkillSystemRunnerPath,
        '--target',
        path.join(__dirname, '..', 'personal-skill-system'),
        '--self-smoke',
        '--json'
      ];
      process.stdout.write = (chunk) => {
        stdout += String(chunk);
        return true;
      };

      jest.isolateModules(() => {
        delete require.cache[verifySkillSystemRunnerPath];
        require(verifySkillSystemRunnerPath);
      });

      const payload = JSON.parse(stdout);
      expect(payload.tool).toBe('verify-skill-system');
      expect(['pass', 'warn']).toContain(payload.status);
      expect(typeof payload.smoke_target).toBe('string');
      expect(payload.smoke_target).toContain('verify-skill-system-smoke-');
    } finally {
      jest.resetModules();
      process.argv = originalArgv;
      process.stdout.write = originalWrite;
      delete require.cache[verifySkillSystemRunnerPath];
    }
  });

  test('verify-skill-system runner resolves the bundle root when invoked from the repo root without an explicit bundle target', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const originalWrite = process.stdout.write;
    const originalNow = Date.now;
    let stdout = '';

    try {
      jest.resetModules();
      Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();
      refreshDerivedGovernanceArtifacts(path.join(repoRoot, 'personal-skill-system'));
      process.chdir(repoRoot);
      process.argv = [
        'node',
        verifySkillSystemRunnerPath,
        '--json'
      ];
      process.stdout.write = (chunk) => {
        stdout += String(chunk);
        return true;
      };

      jest.isolateModules(() => {
        delete require.cache[verifySkillSystemRunnerPath];
        require(verifySkillSystemRunnerPath);
      });

      const payload = JSON.parse(stdout);
      expect(payload.tool).toBe('verify-skill-system');
      expect(payload.status).toBe('pass');
      expect(payload.target).toBe(path.join(repoRoot, 'personal-skill-system'));
      expect(Array.isArray(payload.findings)).toBe(true);
      expect(payload.findings).toHaveLength(0);
    } finally {
      jest.resetModules();
      process.argv = originalArgv;
      process.chdir(originalCwd);
      process.stdout.write = originalWrite;
      Date.now = originalNow;
      delete require.cache[verifySkillSystemRunnerPath];
    }
  });

  test('derived-governance refresh centralizes self-smoke artifact reconstruction', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runtimeProofPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    fs.rmSync(path.join(target, 'benchmark', 'host-smoke', 'runtime-runs'), { recursive: true, force: true });
    const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
    const manageSkillProof = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
    manageSkillProof.level = 'declared-only';
    fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    ratings.counts = { total: 0, 'top-ready': 0, 'strong-but-not-top': 0, thin: 0 };
    ratings['next-batch'] = [{ module: 'rogue-module', 'host-skill': 'ghost-skill', rating: 'thin', 'next-step': 'rogue drift' }];
    fs.writeFileSync(ratingsPath, JSON.stringify(ratings, null, 2) + '\n', 'utf8');

    const reviewQueuePath = path.join(target, 'registry', 'review-queue.generated.json');
    fs.writeFileSync(reviewQueuePath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');

    const backlogPath = path.join(target, 'registry', 'skill-investment-backlog.generated.json');
    fs.writeFileSync(backlogPath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');

    const readinessPath = path.join(target, 'benchmark', 'system-readiness.generated.json');
    fs.writeFileSync(readinessPath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');

    const hostEvolutionPath = path.join(target, 'benchmark', 'host-evolution.generated.json');
    fs.writeFileSync(hostEvolutionPath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');

    const result = refreshDerivedGovernanceArtifacts(target);
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'runtime-proof' }),
      expect.objectContaining({ id: 'skill-frontmatter-schema' }),
      expect.objectContaining({ id: 'skill-opportunity-queue-schema' }),
      expect.objectContaining({ id: 'admission-ledger-schema' }),
      expect.objectContaining({ id: 'evolution-ledger-schema' }),
      expect.objectContaining({ id: 'pending-scaffolds-schema' }),
      expect.objectContaining({ id: 'capability-ratings-schema' }),
      expect.objectContaining({ id: 'expert-source-families-schema' }),
      expect.objectContaining({ id: 'expert-source-family-scorecard-schema' }),
      expect.objectContaining({ id: 'expert-source-integration-schema' }),
      expect.objectContaining({ id: 'skill-investment-backlog-schema' }),
      expect.objectContaining({ id: 'system-readiness-schema' }),
      expect.objectContaining({ id: 'host-evolution-schema' }),
      expect.objectContaining({ id: 'review-queue-schema' }),
      expect.objectContaining({ id: 'review-queue' }),
      expect.objectContaining({ id: 'capability-ratings' }),
      expect.objectContaining({ id: 'skill-investment-backlog' }),
      expect.objectContaining({ id: 'system-readiness' }),
      expect.objectContaining({ id: 'host-evolution' })
    ]));

    const refreshedRuntimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
    const refreshedManageSkillProof = refreshedRuntimeProof.proofs.find((item) => item.skill === 'manage-skill');
    expect(refreshedManageSkillProof.level).toBe('declared-and-tested');

    const refreshedFrontmatterSchema = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'skill.schema.json'), 'utf8'));
    expect(refreshedFrontmatterSchema).toEqual(buildSkillFrontmatterSchema());
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'skill-opportunity-queue.schema.json'), 'utf8'))).toEqual(
      buildSkillOpportunityQueueSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'admission-ledger.schema.json'), 'utf8'))).toEqual(
      buildAdmissionLedgerSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'evolution-ledger.schema.json'), 'utf8'))).toEqual(
      buildEvolutionLedgerSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'pending-scaffolds.schema.json'), 'utf8'))).toEqual(
      buildPendingScaffoldRegistrySchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'capability-ratings.schema.json'), 'utf8'))).toEqual(
      buildCapabilityRatingsSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'expert-source-families.schema.json'), 'utf8'))).toEqual(
      buildExpertSourceFamiliesSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'expert-source-family-scorecard.schema.json'), 'utf8'))).toEqual(
      buildExpertSourceFamilyScorecardSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'expert-source-integration.schema.json'), 'utf8'))).toEqual(
      buildExpertSourceIntegrationSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'review-queue.schema.json'), 'utf8'))).toEqual(
      buildReviewQueueSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'registry', 'skill-investment-backlog.schema.json'), 'utf8'))).toEqual(
      buildSkillInvestmentBacklogSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'benchmark', 'system-readiness.schema.json'), 'utf8'))).toEqual(
      buildSystemReadinessSchema()
    );
    expect(JSON.parse(fs.readFileSync(path.join(target, 'benchmark', 'host-evolution.schema.json'), 'utf8'))).toEqual(
      buildHostEvolutionSchema()
    );

    const refreshedRatings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    expect(Number(refreshedRatings.counts.total || 0)).toBeGreaterThan(0);
    expect(Array.isArray(refreshedRatings['rating-buckets']['top-ready'])).toBe(true);
    expect(refreshedRatings['next-batch'].some((item) => item && item.module === 'rogue-module')).toBe(false);

    const refreshedReviewQueue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
    expect(refreshedReviewQueue['schema-version']).toBe(1);

    const refreshedBacklog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    expect(refreshedBacklog['schema-version']).toBe(2);

    const refreshedReadiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    expect(refreshedReadiness['schema-version']).toBe(2);

    const refreshedHostEvolution = JSON.parse(fs.readFileSync(hostEvolutionPath, 'utf8'));
    expect(refreshedHostEvolution['schema-version']).toBe(HOST_EVOLUTION_SCHEMA_VERSION);
  });

  test('derived-governance refresh demotes stale host-smoked runtime proof levels on writable copies', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runtimeProofPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
    const verifyQualityProof = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
    verifyQualityProof.level = 'host-smoked';
    verifyQualityProof['host-smoke'].freshness = { 'max-age': 0, unit: 'days' };
    fs.writeFileSync(runtimeProofPath, `${JSON.stringify(runtimeProof, null, 2)}\n`, 'utf8');
    expect(verifyQualityProof.level).toBe('host-smoked');

    refreshDerivedGovernanceArtifacts(target);

    const refreshedRuntimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
    const refreshedVerifyQualityProof = refreshedRuntimeProof.proofs.find((item) => item.skill === 'verify-quality');
    expect(refreshedVerifyQualityProof.level).toBe('declared-and-tested');
  });

  test('system readiness surfaces host writeability as an explicit readiness signal', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const readinessModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-readiness.js');

    jest.resetModules();
    jest.doMock(commonModulePath, () => {
      const actual = jest.requireActual(commonModulePath);
      return {
        ...actual,
        collectGeneratedArtifactWriteability: jest.fn(() => ([
          {
            id: 'system-readiness',
            path: path.join(target, 'benchmark', 'system-readiness.generated.json'),
            mode: 'rewrite-file',
            label: 'system readiness artifact',
            ok: false,
            code: 'EPERM'
          }
        ])),
        probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
          if (String(options.mode || '') === 'create-file') {
            return {
              ok: true,
              mode: 'create-file',
              path: targetPath
            };
          }
          return actual.probeArtifactWriteAccess(targetPath, options);
        }),
        probeDirectoryCreateAccess: jest.fn(() => ({
          ok: false,
          path: path.join(target, 'skills', 'domains', '__probe__'),
          parent: path.join(target, 'skills', 'domains'),
          code: 'EPERM'
        }))
      };
    });

    try {
      const { buildSystemReadiness, collectSystemReadinessContext } = require(readinessModulePath);
      const payload = buildSystemReadiness(target, {
        ...collectSystemReadinessContext(target)
      });

      expect(payload.signals['host-writeability']).toEqual(expect.objectContaining({
        status: 'attention',
        blocked: 2
      }));
      expect(payload.signals['host-writeability'].artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'authoritative-skill-tree',
          mode: 'create-child-directory',
          code: 'EPERM'
        })
      ]));
    } finally {
      jest.dontMock(commonModulePath);
    }
  });

  test('system readiness ignores authoritative skill create debt when only probe cleanup fails', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const readinessModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-readiness.js');

    jest.resetModules();
    jest.doMock(commonModulePath, () => {
      const actual = jest.requireActual(commonModulePath);
      return {
        ...actual,
        collectGeneratedArtifactWriteability: jest.fn(() => ([
          {
            id: 'system-readiness',
            path: path.join(target, 'benchmark', 'system-readiness.generated.json'),
            mode: 'rewrite-file',
            label: 'system readiness artifact',
            ok: false,
            code: 'EPERM'
          }
        ])),
        probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
          if (String(options.mode || '') === 'create-file') {
            return {
              ok: true,
              mode: 'create-file',
              path: targetPath
            };
          }
          return actual.probeArtifactWriteAccess(targetPath, options);
        }),
        probeDirectoryCreateAccess: jest.fn(() => ({
          ok: true,
          path: path.join(target, 'skills', 'domains', '__probe__'),
          parent: path.join(target, 'skills', 'domains'),
          cleanup: {
            ok: false,
            path: path.join(target, 'skills', 'domains', '.codex-dir-probe-cache'),
            code: 'EPERM',
            message: 'mocked cleanup block'
          }
        }))
      };
    });

    try {
      const { buildSystemReadiness, collectSystemReadinessContext } = require(readinessModulePath);
      const payload = buildSystemReadiness(target, {
        ...collectSystemReadinessContext(target)
      });

      expect(payload.signals['host-writeability']).toEqual(expect.objectContaining({
        status: 'attention',
        blocked: 1
      }));
      expect(payload.signals['host-writeability'].artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'system-readiness',
          code: 'EPERM'
        })
      ]));
      expect(payload.signals['host-writeability'].artifacts).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'authoritative-skill-tree'
        })
      ]));
    } finally {
      jest.dontMock(commonModulePath);
    }
  });

  test('system readiness surfaces centralized stable top-tier blocker taxonomy as a dedicated signal', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const { buildSystemReadiness, collectSystemReadinessContext } = require('../personal-skill-system/skills/tools/lib/skill-system-readiness');
    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();

    try {
      const payload = buildSystemReadiness(target, {
        ...collectSystemReadinessContext(target),
        ratingsData: JSON.parse(fs.readFileSync(path.join(target, 'registry', 'capability-ratings.generated.json'), 'utf8')),
        registryData: JSON.parse(fs.readFileSync(path.join(target, 'registry', 'registry.generated.json'), 'utf8')),
        now: Date.now()
      });

      expect(payload['schema-version']).toBe(2);
      expect(payload.signals['top-tier-readiness'].status).toBe(
        payload.signals['top-tier-readiness']['blocked-stable-skills'] > 0 ? 'attention' : 'ready'
      );
      expect(payload.signals['top-tier-readiness']).toEqual(expect.objectContaining({
        'stable-skills': expect.any(Number),
        'blocked-stable-skills': expect.any(Number),
        'ready-stable-skills': expect.any(Number),
        priorities: expect.objectContaining({
          critical: expect.any(Number),
          high: expect.any(Number),
          normal: expect.any(Number),
          clear: expect.any(Number)
        }),
        'execution-focus': expect.objectContaining({
          blocked: expect.any(Number),
          'next-wave': expect.any(Array),
          'next-wave-size': expect.any(Number),
          follow_up: expect.any(Array)
        })
      }));
      expect(payload.summary['stable-top-tier-blocked-skills'])
        .toBe(payload.signals['top-tier-readiness']['blocked-stable-skills']);
      expect(payload.summary['stable-top-tier-ready-skills'])
        .toBe(payload.signals['top-tier-readiness']['ready-stable-skills']);
      expect(payload.summary['stable-top-tier-critical-skills'])
        .toBe(payload.signals['top-tier-readiness'].priorities.critical);
      expect(payload.summary['stable-top-tier-high-skills'])
        .toBe(payload.signals['top-tier-readiness'].priorities.high);
      expect(payload.summary['stable-top-tier-next-wave-size'])
        .toBe(payload.signals['top-tier-readiness']['execution-focus']['next-wave-size']);

      for (const field of STABLE_TOP_TIER_BLOCKER_FIELDS) {
        expect(payload.signals['top-tier-readiness'][field]).toBe(payload.summary[field]);
        expect(typeof payload.summary[field]).toBe('number');
      }

      expect(payload.notes.some((note) => note.includes('centralized stable-skill blocker taxonomy'))).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  test('stable top-tier priority classification stays centralized and severity-aware', () => {
    expect(resolveStableTopTierPriority([])).toBe('clear');
    expect(resolveStableTopTierPriority([
      {
        type: 'route-fixture-evidence',
        categories: ['route']
      }
    ])).toBe('high');
    expect(resolveStableTopTierPriority([
      {
        type: 'runtime-proof-level-floor',
        categories: ['runtime-proof']
      }
    ])).toBe('critical');
    expect(resolveStableTopTierPriority([
      {
        type: 'reference-floor',
        categories: ['depth']
      }
    ])).toBe('normal');
  });

  test('stable top-tier upgrade board groups blocked skills by priority lane and blocker family', () => {
    const portfolio = {
      assessments: [
        {
          skill: 'verify-quality',
          ready: false,
          priority: 'critical',
          blockers: [
            {
              type: 'host-smoke-governance',
              categories: ['host-smoke']
            }
          ]
        },
        {
          skill: 'ai',
          ready: false,
          priority: 'high',
          blockers: [
            {
              type: 'capability-module-rating',
              categories: ['module-depth']
            }
          ]
        },
        {
          skill: 'devops',
          ready: true,
          priority: 'clear',
          blockers: []
        }
      ]
    };

    const board = buildStableTopTierUpgradeBoard(portfolio);

    expect(board.summary.blocked).toBe(2);
    expect(board.summary.lanes.critical).toBe(1);
    expect(board.summary.lanes.high).toBe(1);
    expect(board.summary['next-wave']).toEqual(['verify-quality']);
    expect(board.lanes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        priority: 'critical',
        skills: ['verify-quality']
      }),
      expect.objectContaining({
        priority: 'high',
        skills: ['ai']
      })
    ]));
    expect(board.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'stable-host-smoke-blocked',
        skills: ['verify-quality']
      }),
      expect.objectContaining({
        category: 'stable-module-depth-blocked',
        skills: ['ai']
      })
    ]));
  });

  test('stable top-tier portfolio centralizes upgrade board and execution focus', () => {
    const bundleRoot = path.join(__dirname, '..', 'personal-skill-system');
    const { skillRecords } = collectSkillRecords(bundleRoot, []);
    const portfolio = buildStableTopTierPortfolio([
      {
        name: 'verify-quality',
        kind: 'tool',
        status: 'stable',
        file: 'skills/tools/verify-quality/SKILL.md'
      },
      {
        name: 'ai',
        kind: 'domain',
        status: 'stable',
        file: 'skills/domains/ai/SKILL.md'
      }
    ], {
      bundleRoot,
      skillRecords,
      registryData: JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'registry.generated.json'), 'utf8')),
      ratingsData: JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'capability-ratings.generated.json'), 'utf8')),
      reviewQueueData: JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'review-queue.generated.json'), 'utf8')),
      routeFixturesData: JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'route-fixtures.generated.json'), 'utf8')),
      runtimeProofData: JSON.parse(fs.readFileSync(path.join(bundleRoot, 'registry', 'runtime-proof.generated.json'), 'utf8')),
      hostSmokeScorecardData: JSON.parse(fs.readFileSync(path.join(bundleRoot, 'benchmark', 'host-smoke', 'scorecard.generated.json'), 'utf8'))
    });

    expect(portfolio).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        categories: expect.any(Object),
        'blocked-by-priority': expect.any(Object)
      }),
      'upgrade-board': expect.objectContaining({
        summary: expect.any(Object)
      }),
      'execution-focus': expect.objectContaining({
        blocked: expect.any(Number),
        'next-wave': expect.any(Array),
        follow_up: expect.any(Array)
      })
    }));
  });

  test('host evolution report surfaces live host writeability and scaffold recovery state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');

    jest.resetModules();
    jest.doMock(commonModulePath, () => {
      const actual = jest.requireActual(commonModulePath);
      return {
        ...actual,
        collectGeneratedArtifactWriteability: jest.fn(() => ([
          {
            id: 'system-readiness',
            path: path.join(target, 'benchmark', 'system-readiness.generated.json'),
            mode: 'rewrite-file',
            label: 'system readiness artifact',
            ok: false,
            code: 'EPERM'
          }
        ])),
        probeDirectoryCreateAccess: jest.fn(() => ({
          ok: false,
          path: path.join(target, 'skills', 'domains', '__probe__'),
          parent: path.join(target, 'skills', 'domains'),
          code: 'EPERM'
        }))
      };
    });

    try {
      const { buildHostEvolutionReport } = require(path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-host-evolution.js'));
      const payload = buildHostEvolutionReport(target);
      expect(payload.status).toBe('attention');
      expect(payload.capabilities['create-authoritative-skill']).toBe('blocked');
      expect(payload.capabilities['rewrite-generated-governance']).toBe('degraded');
      expect(payload.summary['active-constraints']).toBeGreaterThanOrEqual(2);
      expect(payload['top-tier-execution-focus']).toEqual(expect.objectContaining({
        blocked: expect.any(Number),
        'next-wave': expect.any(Array),
        'next-wave-size': expect.any(Number)
      }));
      expect(payload.summary['top-tier-next-wave-size']).toBe(payload['top-tier-execution-focus']['next-wave-size']);
      expect(payload.readiness).toEqual(expect.objectContaining({
        'top-tier-execution-focus': expect.objectContaining({
          blocked: expect.any(Number)
        })
      }));
      expect(payload['active-constraints']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'system-readiness',
          code: 'EPERM'
        }),
        expect.objectContaining({
          id: 'authoritative-skill-tree',
          mode: 'create-child-directory',
          code: 'EPERM'
        })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source host-writeability',
        'npm run verify:skill-system'
      ]));
    } finally {
      jest.dontMock(commonModulePath);
    }
  });

  test('verify-skill-system fails when host evolution report drifts from live host state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    writeSystemReadiness(target);
    const reportPath = path.join(target, 'benchmark', 'host-evolution.generated.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    report.summary['active-constraints'] = 999;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    const audit = analyzeSkillSystem(target);
    expect(audit.findings.some((item) =>
      item.file === 'benchmark/host-evolution.generated.json'
      && item.message.includes('host evolution report is out of sync')
    )).toBe(true);
  });

  test('verify-skill-system fails when review queue drifts from live skill review metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const reviewQueuePath = path.join(target, 'registry', 'review-queue.generated.json');
    const reviewQueue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
    const entry = reviewQueue.skills.find((item) => item.skill === 'manage-skill');
    entry['days-until-due'] = 999;
    entry['next-review-due'] = '2099-01-01';
    fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/review-queue.generated.json'
      && item.message.includes('review queue is out of sync with live governed skill review metadata')
    )).toBe(true);
  });

  test('verify-skill-system fails when skill investment backlog drifts from governed portfolio state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const backlogPath = path.join(target, 'registry', 'skill-investment-backlog.generated.json');
    const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    backlog.items.push({
      id: 'rogue-backlog-item',
      category: 'new-skill-admission',
      status: 'open',
      priority: 'high',
      source: 'admission-ledger',
      skill: 'ghost-skill',
      summary: 'rogue drift item'
    });
    fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/skill-investment-backlog.generated.json'
      && item.message.includes('skill investment backlog is out of sync with admission, evolution, review, scaffold, or top-tier governance state')
    )).toBe(true);
  });

  test('verify-skill-system fails when pending scaffold registry drifts from canonical normalization rules', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const pendingPath = path.join(target, 'registry', 'pending-scaffolds.generated.json');
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    pending.entries.push({
      'pending-id': 'rogue-pending',
      kind: 'domain',
      skill: 'rogue-pending-skill',
      path: 'skills/domains/rogue-pending-skill',
      status: 'blocked',
      'recorded-at': '2026-05-10T00:00:00.000Z',
      files: [{ path: 'SKILL.md', content: 'x' }]
    });
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/pending-scaffolds.generated.json'
      && item.message.includes('pending scaffold registry is out of sync')
    )).toBe(true);
  });

  test('verify-skill-system fails when pending scaffold references an unknown admission request', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const pendingPath = path.join(target, 'registry', 'pending-scaffolds.generated.json');
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    pending.entries.push({
      'pending-id': '20260510-missing-admission-link',
      kind: 'domain',
      skill: 'missing-admission-link',
      path: 'skills/domains/missing-admission-link',
      status: 'blocked',
      'recorded-at': '2026-05-10T00:00:00.000Z',
      'request-id': '20260510-ghost-admission',
      files: [{ path: 'SKILL.md', content: 'x' }]
    });
    pending.summary = {
      ...pending.summary,
      total: Number(pending.summary && pending.summary.total || 0) + 1,
      active: Number(pending.summary && pending.summary.active || 0) + 1,
      blocked: Number(pending.summary && pending.summary.blocked || 0) + 1
    };
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/pending-scaffolds.generated.json'
      && item.message.includes("references unknown request-id '20260510-ghost-admission'")
    )).toBe(true);
  });

  test('verify-skill-system fails when pending scaffold opportunity link disagrees with the linked admission request', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const queuePath = path.join(target, 'registry', 'skill-opportunity-queue.generated.json');
    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    queue.entries.push({
      'opportunity-id': '20260510-linked-opportunity',
      summary: 'linked future skill opportunity',
      'suggested-kind': 'domain',
      priority: 'high',
      status: 'blocked',
      horizon: 'next',
      'recorded-at': '2026-05-10T00:00:00.000Z',
      note: 'blocked on linked admission request'
    });
    queue.summary = {
      ...queue.summary,
      total: Number(queue.summary && queue.summary.total || 0) + 1,
      active: Number(queue.summary && queue.summary.active || 0) + 1,
      blocked: Number(queue.summary && queue.summary.blocked || 0) + 1
    };
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');

    const ledgerPath = path.join(target, 'registry', 'admission-ledger.generated.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    ledger.entries.push({
      'request-id': '20260510-linked-admission',
      request: 'we need a linked governed pending scaffold',
      'suggested-kind': 'domain',
      'opportunity-id': '20260510-linked-opportunity',
      decision: {
        action: 'create-new-skill',
        suggested_kind: 'domain'
      },
      status: 'blocked',
      'recorded-at': '2026-05-10T00:00:00.000Z',
      note: 'blocked on host create constraint'
    });
    ledger.summary = {
      ...ledger.summary,
      total: Number(ledger.summary && ledger.summary.total || 0) + 1,
      active: Number(ledger.summary && ledger.summary.active || 0) + 1,
      blocked: Number(ledger.summary && ledger.summary.blocked || 0) + 1
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');

    const pendingPath = path.join(target, 'registry', 'pending-scaffolds.generated.json');
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    pending.entries.push({
      'pending-id': '20260510-mismatched-link',
      kind: 'domain',
      skill: 'mismatched-link',
      path: 'skills/domains/mismatched-link',
      status: 'blocked',
      'recorded-at': '2026-05-10T00:00:00.000Z',
      'request-id': '20260510-linked-admission',
      'opportunity-id': '20260510-different-opportunity',
      files: [{ path: 'SKILL.md', content: 'x' }]
    });
    pending.summary = {
      ...pending.summary,
      total: Number(pending.summary && pending.summary.total || 0) + 1,
      active: Number(pending.summary && pending.summary.active || 0) + 1,
      blocked: Number(pending.summary && pending.summary.blocked || 0) + 1
    };
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/pending-scaffolds.generated.json'
      && item.message.includes("links opportunity-id '20260510-different-opportunity' but admission request '20260510-linked-admission' is linked to '20260510-linked-opportunity'")
    )).toBe(true);
  });

  test('verify-skill-system expects proof-governance debt in the investment backlog when critical host-smoke claims are unsatisfied', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runtimeProofPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
    const manageProof = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
    manageProof.level = 'declared-and-tested';
    fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

    const scorecardPath = path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json');
    const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
    const manageScore = scorecard.skills.find((item) => item.skill === 'manage-skill');
    manageScore.level = 'declared-and-tested';
    manageScore['governance-status'] = 'missing-evidence';
    manageScore['evidence-status'] = 'missing';
    fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

    const backlogPath = path.join(target, 'registry', 'skill-investment-backlog.generated.json');
    const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
    backlog.items = [];
    backlog.summary = {
      total: 0,
      critical: 0,
      high: 0,
      normal: 0,
      categories: {},
      sources: {}
    };
    fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/skill-investment-backlog.generated.json'
      && item.message.includes('skill investment backlog is out of sync with admission, evolution, review, scaffold, or top-tier governance state')
    )).toBe(true);
  });

  test('verify-skill-system fails when skill opportunity queue contains unknown adjacent skills', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const queuePath = path.join(target, 'registry', 'skill-opportunity-queue.generated.json');
    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    queue.entries.push({
      'opportunity-id': '20260509-rogue-opportunity',
      summary: 'rogue future skill opportunity',
      'suggested-kind': 'domain',
      priority: 'high',
      status: 'open',
      horizon: 'next',
      'adjacent-skills': ['ghost-skill'],
      'recorded-at': '2026-05-09T00:00:00.000Z'
    });
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/skill-opportunity-queue.generated.json'
      && item.message.includes("references unknown adjacent skill 'ghost-skill'")
    )).toBe(true);
  });

  test('verify-skill-system fails when admission ledger references an unknown opportunity id', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ledgerPath = path.join(target, 'registry', 'admission-ledger.generated.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    ledger.entries.push({
      'request-id': '20260509-pack-governance',
      request: 'we need a governed pack-governance domain',
      'suggested-kind': 'domain',
      'opportunity-id': '20260509-missing-opportunity',
      decision: {
        action: 'create-new-skill',
        suggested_kind: 'domain'
      },
      status: 'open',
      'recorded-at': '2026-05-09T00:00:00.000Z'
    });
    ledger.summary = {
      ...ledger.summary,
      total: Number(ledger.summary && ledger.summary.total || 0) + 1,
      active: Number(ledger.summary && ledger.summary.active || 0) + 1,
      open: Number(ledger.summary && ledger.summary.open || 0) + 1
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/admission-ledger.generated.json'
      && item.message.includes("references unknown opportunity-id '20260509-missing-opportunity'")
    )).toBe(true);
  });

  test('verify-skill-system fails when admission ledger decision fields violate the centralized action contract', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ledgerPath = path.join(target, 'registry', 'admission-ledger.generated.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    ledger.entries.push({
      'request-id': '20260516-invalid-admission-contract',
      request: 'we need a new route boundary',
      'suggested-kind': 'guard',
      decision: {
        action: 'reuse-existing-skill',
        target_skill: 'manage-skill',
        target_kind: 'tool',
        suggested_kind: 'guard'
      },
      status: 'advised-reuse',
      'recorded-at': '2026-05-16T00:00:00.000Z'
    });
    ledger.summary = {
      ...ledger.summary,
      total: Number(ledger.summary && ledger.summary.total || 0) + 1,
      'advised-reuse': Number(ledger.summary && ledger.summary['advised-reuse'] || 0) + 1
    };
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/admission-ledger.generated.json'
      && item.message.includes("decision 'reuse-existing-skill' should not set suggested_kind")
    )).toBe(true);
  });

  test('host-smoked runtime-proof entries fail when the latest passing evidence is older than the declared freshness window', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runDir = path.join(target, 'benchmark', 'host-smoke', 'runtime-runs');
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'stale-verify-quality.json'), JSON.stringify({
      'schema-version': 1,
      'run-id': 'stale-verify-quality',
      'executed-at': '2026-04-01T00:00:00Z',
      host: 'codex',
      'source-runtime-proof': 'registry/runtime-proof.generated.json',
      selection: {
        scope: 'single',
        skills: ['verify-quality']
      },
      results: [
        {
          skill: 'verify-quality',
          kind: 'tool',
          'level-before': 'declared-and-tested',
          status: 'pass',
          manifest: 'skills/tools/verify-quality/scripts/smoke.json',
          contract: {
            manifest: 'skills/tools/verify-quality/scripts/smoke.json',
            freshness: {
              'max-age': 7,
              unit: 'days'
            },
            commands: [
              {
                cwd: 'skill-dir',
                argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
                expect: {
                  tool: 'verify-quality'
                },
                'timeout-ms': 10000
              }
            ]
          },
          'command-count': 1,
          'passed-commands': 1,
          commands: [
            {
              cwd: 'skill-dir',
              argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
              expect: {
                tool: 'verify-quality'
              },
              'timeout-ms': 10000,
              status: 'pass',
              'exit-code': 0,
              signal: null,
              'duration-ms': 15,
              'json-parse-ok': true,
              observed: {
                tool: 'verify-quality'
              },
              mismatches: []
            }
          ]
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-06T00:00:00Z').getTime();
    try {
      const runtimeProofPath = path.join(target, 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const verifyQualityProof = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      verifyQualityProof.level = 'host-smoked';
      fs.writeFileSync(runtimeProofPath, `${JSON.stringify(runtimeProof, null, 2)}\n`, 'utf8');
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' is marked 'host-smoked' but the latest passing runtime host-smoke artifact is older than the declared freshness window"))).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  test('host-smoked runtime-proof entries accept recent passing evidence within the freshness window', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runDir = path.join(target, 'benchmark', 'host-smoke', 'runtime-runs');
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'fresh-verify-quality.json'), JSON.stringify({
      'schema-version': 1,
      'run-id': 'fresh-verify-quality',
      'executed-at': '2026-05-05T00:00:00Z',
      host: 'codex',
      'source-runtime-proof': 'registry/runtime-proof.generated.json',
      selection: {
        scope: 'single',
        skills: ['verify-quality']
      },
      results: [
        {
          skill: 'verify-quality',
          kind: 'tool',
          'level-before': 'declared-and-tested',
          status: 'pass',
          manifest: 'skills/tools/verify-quality/scripts/smoke.json',
          contract: {
            manifest: 'skills/tools/verify-quality/scripts/smoke.json',
            freshness: {
              'max-age': 7,
              unit: 'days'
            },
            commands: [
              {
                cwd: 'skill-dir',
                argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
                expect: {
                  tool: 'verify-quality'
                },
                'timeout-ms': 10000
              }
            ]
          },
          'command-count': 1,
          'passed-commands': 1,
          commands: [
            {
              cwd: 'skill-dir',
              argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
              expect: {
                tool: 'verify-quality'
              },
              'timeout-ms': 10000,
              status: 'pass',
              'exit-code': 0,
              signal: null,
              'duration-ms': 15,
              'json-parse-ok': true,
              observed: {
                tool: 'verify-quality'
              },
              mismatches: []
            }
          ]
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-06T00:00:00Z').getTime();
    try {
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' is marked 'host-smoked' but the latest passing runtime host-smoke artifact is older than the declared freshness window"))).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });

  test('stable scripted skills warn when runtime-proof level is still declared-only', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-quality');
    proof.level = 'declared-only';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("stable scripted skill 'verify-quality' is still marked 'declared-only'"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' should reference at least one evidence test"))).toBe(false);
  });

  test('stable skills warn when agents/openai.yaml is missing', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const hostMetadataDir = path.join(target, 'skills', 'tools', 'verify-quality', 'agents');
    fs.rmSync(hostMetadataDir, { recursive: true, force: true });

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('stable skill is missing agents/openai.yaml host metadata'))).toBe(true);
  });

  test('existing host metadata must stay in sync with SKILL metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillDir = path.join(target, 'skills', 'tools', 'verify-quality');
    const hostMetadataPath = path.join(skillDir, 'agents', 'openai.yaml');
    fs.mkdirSync(path.dirname(hostMetadataPath), { recursive: true });
    fs.writeFileSync(hostMetadataPath, [
      'display_name: "Wrong Name"',
      'short_description: "Wrong description"',
      'default_prompt: "Use ~/.agents/skills/tools/wrong/SKILL.md as the primary instruction source before acting on wrong."',
      ''
    ].join('\n'), 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'display_name' is out of sync with SKILL.md"))).toBe(true);
  });

  test('sync-host-metadata --all backfills stable skills and preserves nested runtime paths', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-host-metadata', '--all']);
      expect(payload.action).toBe('sync-host-metadata');
      expect(payload.scope).toBe('all');
      expect(payload.synced).toEqual(expect.arrayContaining(['verify-quality', 'sage', 'claymorphism']));

      const verifyQualityHostMetadata = fs.readFileSync(path.join(target, 'skills', 'tools', 'verify-quality', 'agents', 'openai.yaml'), 'utf8');
      expect(verifyQualityHostMetadata).toContain('default_prompt: "Use ~/.agents/skills/tools/verify-quality/SKILL.md as the primary instruction source before acting on verify-quality."');

      const claymorphismHostMetadata = fs.readFileSync(path.join(target, 'skills', 'domains', 'frontend-design', 'variants', 'claymorphism', 'agents', 'openai.yaml'), 'utf8');
      expect(claymorphismHostMetadata).toContain('default_prompt: "Use ~/.agents/skills/domains/frontend-design/variants/claymorphism/SKILL.md as the primary instruction source before acting on claymorphism."');

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes('stable skill is missing agents/openai.yaml host metadata'))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'default_prompt' is out of sync with SKILL.md"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-route-metadata --all reconciles shared route metadata from SKILL frontmatter', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'verify-quality');
    route.activation['trigger-keywords'] = ['verify-quality'];
    route.aliases = [];
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-route-metadata', '--all']);
      expect(payload.action).toBe('sync-route-metadata');
      expect(payload.scope).toBe('all');
      expect(payload.synced).toEqual(expect.arrayContaining(['verify-quality', 'claymorphism', 'skill-evolution']));

      const refreshedRouteMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const refreshedRoute = refreshedRouteMap.routes.find((item) => item.skill === 'verify-quality');
      expect(refreshedRoute.activation['trigger-keywords']).toEqual(expect.arrayContaining([
        'verify-quality',
        'quality scan',
        'complexity scan'
      ]));
      expect(refreshedRoute.aliases).toEqual(expect.arrayContaining(['vq', 'quality-audit']));

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing trigger-keywords declared in SKILL metadata"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing aliases declared in SKILL metadata"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-route-metadata removes drifted route artifacts for non-routed adapter skills', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);
    const adapterSkill = 'codex-host';

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    routeMap.routes.push({
      skill: adapterSkill,
      kind: 'adapter',
      priority: 40,
      namespace: 'adapter',
      'supported-hosts': ['codex'],
      activation: {
        'intent-tags': ['knowledge'],
        'trigger-keywords': ['codex'],
        'negative-keywords': [],
        'requires-explicit-invocation': true
      },
      'conflicts-with': [],
      'auto-chain': [],
      aliases: []
    });
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const fixturesPath = path.join(target, 'registry', 'route-fixtures.generated.json');
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    fixtures.cases.push({
      name: `placeholder-route-${adapterSkill}`,
      query: `Run ${adapterSkill} for this ${adapterSkill} request.`,
      expect: adapterSkill,
      'expect-no-fallback': true,
      governed: true
    });
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-route-metadata', adapterSkill]);
      expect(payload.action).toBe('sync-route-metadata');
      expect(payload.synced).toEqual([adapterSkill]);

      const refreshedRouteMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      expect(refreshedRouteMap.routes.some((item) => item.skill === adapterSkill)).toBe(false);

      const refreshedFixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      expect(refreshedFixtures.cases.some((item) => item.expect === adapterSkill && item.governed === true)).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('skill-level-summary keeps routers but excludes adapters through centralized kind governance', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const adapterName = `temp-host-adapter-${Date.now()}`;
      manageSkill.main(['create', 'adapter', adapterName]);

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      expect(ratings['skill-level-summary']['top-level-enough-now']).toContain('sage');
      expect(ratings['skill-level-summary']['top-level-enough-now']).not.toContain(adapterName);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) =>
        item.file === 'registry/capability-ratings.generated.json'
        && item.message.includes(`active skill '${adapterName}' is missing from skill-level-summary`)
      )).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('capability ratings demote stable skills with expired review cadence from top-level-enough-now', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillFile = path.join(target, 'skills', 'tools', 'manage-skill', 'SKILL.md');
    const original = fs.readFileSync(skillFile, 'utf8');
    const next = original
      .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-01-01')
      .replace(/^review-cycle-days:\s*.*$/m, 'review-cycle-days: 30');
    fs.writeFileSync(skillFile, next, 'utf8');

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    const { skillRecords } = collectSkillRecords(target, []);
    const registryData = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'registry.generated.json'), 'utf8'));
    applyCapabilityRatingsGovernance(ratings, { skillRecords, registryData, bundleRoot: target });

    expect(ratings['skill-level-summary']['top-level-enough-now']).not.toContain('manage-skill');
    expect(ratings['skill-level-summary']['strong-uplift-but-not-top-yet']).toContain('manage-skill');
    expect(ratings['skill-level-summary'].counts['stable-overdue']).toBeGreaterThanOrEqual(1);
    expect(ratings['skill-level-summary'].counts['stable-blocked-total']).toBeGreaterThanOrEqual(1);
    expect(ratings.notes.some((note) => note.includes("temporarily outside 'top-level-enough-now'"))).toBe(true);
  });

  test('batch mark-reviewed for overdue skills clears live review-driven verify failures', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillEvolutionFile = path.join(target, 'skills', 'workflows', 'skill-evolution', 'SKILL.md');
    const verifySkillSystemFile = path.join(target, 'skills', 'tools', 'verify-skill-system', 'SKILL.md');
    fs.writeFileSync(
      skillEvolutionFile,
      fs.readFileSync(skillEvolutionFile, 'utf8')
        .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-04-18'),
      'utf8'
    );
    fs.writeFileSync(
      verifySkillSystemFile,
      fs.readFileSync(verifySkillSystemFile, 'utf8')
        .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-04-18'),
      'utf8'
    );

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['sync-runtime-proof', 'manage-skill']);
      manageSkill.main(['sync-runtime-proof', '--all']);
      manageSkill.main(['refresh-derived-governance']);
      manageSkill.main(['show-review-queue', '--overdue']);

      Date.now = () => new Date('2026-05-19T00:00:00Z').getTime();
      let report = analyzeSkillSystem(target);
      expect(report.status).toBe('warn');
      expect(report.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          file: 'skills/workflows/skill-evolution/SKILL.md',
          message: expect.stringContaining('review cadence expired')
        })
      ]));

      manageSkill.main(['mark-reviewed', '--overdue', '--date', '2026-05-19']);
      report = analyzeSkillSystem(target);
      expect(report.status).toBe('pass');
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('capability ratings demote stable skills with stale expert-source mappings from top-level-enough-now', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleWithTopDeveloper(repoRoot);

    fs.rmSync(path.join(repoRoot, 'top_developer', 'top-qa'), { recursive: true, force: true });

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    const { skillRecords } = collectSkillRecords(target, []);
    const registryData = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'registry.generated.json'), 'utf8'));
    applyCapabilityRatingsGovernance(ratings, { skillRecords, registryData, bundleRoot: target });

    expect(ratings['skill-level-summary']['top-level-enough-now']).not.toContain('review');
    expect(ratings['skill-level-summary']['strong-uplift-but-not-top-yet']).toContain('review');
    expect(ratings['skill-level-summary'].counts['stable-expert-source-blocked']).toBeGreaterThanOrEqual(1);
    expect(ratings['skill-level-summary'].counts['stable-blocked-total']).toBeGreaterThanOrEqual(1);
    expect(ratings.notes.some((note) => note.includes('expert-source'))).toBe(true);
  });

  test('capability ratings demote stable skills with declared-only runtime proof from top-level-enough-now', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runtimeProofPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
    const proof = runtimeProof.proofs.find((item) => item.skill === 'pre-commit-gate');
    proof.level = 'declared-only';
    fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    const { skillRecords } = collectSkillRecords(target, []);
    const registryData = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'registry.generated.json'), 'utf8'));
    applyCapabilityRatingsGovernance(ratings, { skillRecords, registryData, bundleRoot: target });

    expect(ratings['skill-level-summary']['top-level-enough-now']).not.toContain('pre-commit-gate');
    expect(ratings['skill-level-summary']['strong-uplift-but-not-top-yet']).toContain('pre-commit-gate');
    expect(ratings['skill-level-summary'].counts['stable-runtime-proof-blocked']).toBeGreaterThanOrEqual(1);
    expect(ratings['skill-level-summary'].counts['stable-blocked-total']).toBeGreaterThanOrEqual(1);
    expect(ratings.notes.some((note) => note.includes('runtime-proof blocker'))).toBe(true);
  });

  test('sync-route-metadata refreshes route expert-modules from the registered module-group', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'manage-skill');
    route['expert-modules'] = [];
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-route-metadata', 'manage-skill']);
      expect(payload.action).toBe('sync-route-metadata');
      expect(payload.scope).toBe('single');
      expect(payload.skill).toBe('manage-skill');

      const refreshedRouteMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const refreshedRoute = refreshedRouteMap.routes.find((item) => item.skill === 'manage-skill');
      expect(refreshedRoute['expert-modules']).toEqual(['skill-management-authoritative-crud']);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("route 'manage-skill' expert-modules are out of sync"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('archive removes runtime-proof coverage for the archived scripted skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['archive', 'verify-quality']);

      const registryPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

      expect(registry.proofs.some((item) => item.skill === 'verify-quality')).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('set-status restores runtime-proof coverage when an archived scripted skill becomes experimental again', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['archive', 'verify-quality']);
      const payload = manageSkill.main(['set-status', 'verify-quality', 'experimental']);
      expect(payload.previous_status).toBe('archived');
      expect(payload.status).toBe('experimental');

      const registryPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const proof = registry.proofs.find((item) => item.skill === 'verify-quality');

      expect(proof).toBeTruthy();
      expect(proof.level).toBe('declared-only');

      const routeMapPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json');
      const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      expect(routeMap.routes.some((item) => item.skill === 'verify-quality')).toBe(true);

      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const fixture = fixtures.cases.find((item) => item.name === 'placeholder-route-verify-quality' && item.expect === 'verify-quality');
      expect(fixture).toEqual(expect.objectContaining({
        governed: true
      }));
      expect(fixture.query).toContain('Run verify-quality');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-route-metadata rewrites governed route fixtures when trigger metadata changes', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main([
        'update',
        'verify-quality',
        '--set',
        'trigger-keywords=[verify-quality,maintainability scan,quality gate]',
        '--set',
        'aliases=[vq,quality-audit]'
      ]);

      const fixturesPath = path.join(target, 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const fixture = fixtures.cases.find((item) => item.name === 'placeholder-route-verify-quality');

      expect(fixture).toEqual(expect.objectContaining({
        expect: 'verify-quality',
        governed: true
      }));
      expect(fixture.query).toContain('Run verify-quality');

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("governed route fixture 'placeholder-route-verify-quality' is out of sync"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill blocks lifecycle transitions when required generated governance artifacts are not writable', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);
    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            const normalized = String(targetPath || '').replace(/\\/g, '/');
            if (normalized.endsWith('/registry/route-map.generated.json') && options.mode === 'rewrite-file') {
              return {
                ok: false,
                mode: options.mode,
                path: targetPath,
                code: 'EPERM',
                message: 'mocked route-map write block'
              };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          })
        };
      });
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['set-status', 'verify-quality', 'deprecated']))
        .toThrow(/route-map\.generated\.json/);
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create fails with explicit child-directory host constraint when parent write probe is insufficient', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            if (options.mode === 'create-file') {
              return { ok: true, mode: options.mode, path: targetPath };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          }),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'host-governance'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['create', 'domain', 'temp-host-governance-blocked', '--scaffold-modules']))
        .toThrow(/cannot create skill 'temp-host-governance-blocked' because the authoritative skill tree cannot create child directories on this host/);
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create can defer a host-blocked create into governed admission state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            if (options.mode === 'create-file') {
              return { ok: true, mode: options.mode, path: targetPath };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          }),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'host-governance'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const admission = manageSkill.main(['admission-check', '--kind', 'domain', 'we need a governed host create blocker drill']);
      const payload = manageSkill.main([
        'create',
        'domain',
        'host-create-drill',
        '--scaffold-modules',
        '--defer-when-host-blocked',
        '--request-id',
        admission['request-id']
      ]);

      expect(payload).toEqual(expect.objectContaining({
        action: 'create',
        status: 'deferred-host-blocked',
        kind: 'domain',
        skill: 'host-create-drill',
        'admission-request-id': admission['request-id'],
        'admission-status': 'blocked'
      }));
      expect(payload['pending-scaffold-id']).toBeTruthy();
      expect(payload['host-constraint']).toEqual(expect.objectContaining({
        mode: 'create-child-directory',
        code: 'EPERM'
      }));

      const ledgerPayload = manageSkill.main(['show-admission-ledger', '--request-id', admission['request-id']]);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        'request-id': admission['request-id'],
        status: 'blocked'
      }));
      expect(String(ledgerPayload.entries[0].note || '')).toContain("creation of 'host-create-drill' is blocked by host-writeability debt");

      const pendingPayload = manageSkill.main(['show-pending-scaffolds', '--skill', 'host-create-drill']);
      expect(pendingPayload.total).toBe(1);
      expect(pendingPayload.entries[0]).toEqual(expect.objectContaining({
        skill: 'host-create-drill',
        kind: 'domain',
        status: 'blocked'
      }));
      expect(Array.isArray(pendingPayload.entries[0].files)).toBe(true);
      expect(pendingPayload.entries[0].files.some((item) => item.path === 'SKILL.md')).toBe(true);

      const backlogPayload = manageSkill.main(['show-investment-backlog', '--status', 'blocked']);
      expect(backlogPayload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `admission-${admission['request-id']}`,
          source: 'admission-ledger',
          status: 'blocked',
          priority: 'critical'
        }),
        expect.objectContaining({
          source: 'pending-scaffolds',
          skill: 'host-create-drill',
          status: 'blocked'
        })
      ]));
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill diagnose-host-evolution reports live host constraints and recovery commands', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);
    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          collectGeneratedArtifactWriteability: jest.fn(() => ([
            {
              id: 'system-readiness',
              path: path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json'),
              mode: 'rewrite-file',
              label: 'system readiness artifact',
              ok: false,
              code: 'EPERM'
            }
          ])),
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            if (String(options.mode || '') === 'create-file') {
              return {
                ok: true,
                mode: 'create-file',
                path: targetPath
              };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          }),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', '__probe__'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['diagnose-host-evolution']);

      expect(payload).toEqual(expect.objectContaining({
        action: 'diagnose-host-evolution',
        status: expect.stringMatching(/^(blocked|attention|ready)$/),
        capabilities: expect.objectContaining({
          'create-authoritative-skill': expect.stringMatching(/^(blocked|available)$/),
          'rewrite-generated-governance': expect.stringMatching(/^(blocked|degraded|available)$/)
        }),
        summary: expect.objectContaining({
          'active-constraints': expect.any(Number),
          'host-writeability-backlog-items': expect.any(Number)
        })
      }));
      expect(Array.isArray(payload['active-constraints'])).toBe(true);
      expect(Array.isArray(payload['host-writeability-debt'])).toBe(true);
      expect(Array.isArray(payload['refresh-plan'])).toBe(true);
      expect(payload['refresh-plan'][0]).toEqual(expect.objectContaining({
        id: 'runtime-proof',
        order: 1,
        paths: expect.any(Array)
      }));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source host-writeability'
      ]));
      expect(payload['active-constraints']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'system-readiness',
          code: 'EPERM',
          'refresh-step': expect.objectContaining({
            id: 'system-readiness'
          })
        }),
        expect.objectContaining({
          id: 'authoritative-skill-tree',
          mode: 'create-child-directory'
        })
      ]));
      expect(payload['host-writeability-debt']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'host-writeability-authoritative-skill-create',
          source: 'host-writeability'
        })
      ]));
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill diagnose-host-evolution surfaces the latest matching derived governance export when available', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const exportDir = path.join(repoRoot, '.code-abyss', 'derived-governance-exports', 'ready-export');
      manageSkill.main(['export-derived-governance', '--output-dir', exportDir]);

      const payload = manageSkill.main(['diagnose-host-evolution']);
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js apply-derived-governance-export --latest'
      ]));
      expect(payload['latest-derived-governance-export']).toEqual(expect.objectContaining({
        directory: '.code-abyss/derived-governance-exports/ready-export',
        manifest: '.code-abyss/derived-governance-exports/ready-export/manifest.json'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill refresh-derived-governance refreshes governed artifacts on writable hosts', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['refresh-derived-governance']);

      expect(payload).toEqual(expect.objectContaining({
        action: 'refresh-derived-governance',
        status: 'refreshed',
        summary: expect.objectContaining({
          refreshed: expect.any(Number)
        })
      }));
      expect(payload.summary.refreshed).toBeGreaterThan(0);
      expect(Array.isArray(payload.refreshed)).toBe(true);
      expect(Array.isArray(payload['refresh-plan'])).toBe(true);
      expect(payload.refreshed).toEqual(expect.arrayContaining([
        expect.objectContaining({
          artifact: 'runtime-proof',
          'refresh-step': expect.objectContaining({ id: 'runtime-proof', order: 1 })
        }),
        expect.objectContaining({
          artifact: 'skill-investment-backlog',
          'refresh-step': expect.objectContaining({ id: 'skill-investment-backlog' })
        }),
        expect.objectContaining({
          artifact: 'system-readiness',
          'refresh-step': expect.objectContaining({ id: 'system-readiness' })
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill refresh-derived-governance returns degraded-host-blocked on constrained hosts', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const readinessModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-readiness.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          collectGeneratedArtifactWriteability: jest.fn(() => ([
            {
              id: 'system-readiness',
              label: 'system readiness artifact',
              mode: 'rewrite-file',
              path: path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json'),
              ok: false,
              code: 'EPERM'
            },
            {
              id: 'host-evolution',
              label: 'host evolution report',
              mode: 'create-or-rewrite-file',
              path: path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-evolution.generated.json'),
              ok: false,
              code: 'EPERM'
            }
          ])),
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            const normalized = String(targetPath || '').replace(/\\/g, '/');
            if (normalized.endsWith('/benchmark/system-readiness.generated.json') && options.mode === 'rewrite-file') {
              return {
                ok: false,
                mode: options.mode,
                path: targetPath,
                code: 'EPERM',
                message: 'mocked system-readiness write block'
              };
            }
            if (normalized.endsWith('/benchmark/host-evolution.generated.json') && options.mode === 'create-or-rewrite-file') {
              return {
                ok: false,
                mode: options.mode,
                path: targetPath,
                code: 'EPERM',
                message: 'mocked host-evolution write block'
              };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          })
        };
      });
      jest.doMock(readinessModulePath, () => {
        const actual = jest.requireActual(readinessModulePath);
        return {
          ...actual,
          writeSystemReadiness: jest.fn(() => {
            const error = new Error('mocked system-readiness write block');
            error.code = 'EPERM';
            throw error;
          })
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['refresh-derived-governance']);

      expect(payload).toEqual(expect.objectContaining({
        action: 'refresh-derived-governance',
        status: 'degraded-host-blocked',
        error: expect.objectContaining({
          code: 'EPERM'
        }),
        diagnosis: expect.objectContaining({
          capabilities: expect.any(Object),
          summary: expect.any(Object)
        })
      }));
      expect(Array.isArray(payload.degraded_governance)).toBe(true);
      expect(Array.isArray(payload['refresh-plan'])).toBe(true);
      expect(payload.degraded_governance).toEqual(expect.arrayContaining([
        expect.objectContaining({
          artifact: 'system-readiness',
          code: 'EPERM',
          'refresh-step': expect.objectContaining({ id: 'system-readiness' })
        })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js export-derived-governance',
        'npm run verify:skill-system'
      ]));
    } finally {
      jest.dontMock(readinessModulePath);
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill materialize-pending-scaffold writes the deferred scaffold into the authoritative tree', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            if (options.mode === 'create-file') {
              return { ok: true, mode: options.mode, path: targetPath };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          }),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'host-governance-ready'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      let manageSkill = require(manageSkillModulePath);
      const admission = manageSkill.main(['admission-check', '--kind', 'domain', 'we need a host-ready governed scaffold']);
      manageSkill.main([
        'create',
        'domain',
        'host-governance-ready',
        '--scaffold-modules',
        '--defer-when-host-blocked',
        '--request-id',
        admission['request-id']
      ]);
      jest.dontMock(commonModulePath);
      jest.resetModules();

      manageSkill = require(manageSkillModulePath);
      const payload = manageSkill.main(['materialize-pending-scaffold', 'host-governance-ready']);

      expect(payload).toEqual(expect.objectContaining({
        action: 'materialize-pending-scaffold',
        skill: 'host-governance-ready',
        kind: 'domain',
        'admission-request-id': admission['request-id']
      }));
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'host-governance-ready', 'SKILL.md'))).toBe(true);

      const pendingPayload = manageSkill.main(['show-pending-scaffolds', '--skill', 'host-governance-ready']);
      expect(pendingPayload.returned).toBe(0);

      const ledgerPayload = manageSkill.main(['show-admission-ledger', '--request-id', admission['request-id']]);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        status: 'implemented',
        'created-skill': 'host-governance-ready'
      }));
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create keeps authoritative creation when readiness artifacts are best-effort blocked', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const readinessModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-readiness.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeDirectoryCreateAccess: jest.fn((targetDir) => {
            const normalized = String(targetDir || '').replace(/\\/g, '/');
            if (normalized.includes('/skills/domains/resilient-host-create')) {
              return {
                ok: true,
                path: targetDir,
                parent: path.dirname(targetDir)
              };
            }
            return actual.probeDirectoryCreateAccess(targetDir);
          })
        };
      });
      jest.doMock(readinessModulePath, () => {
        const actual = jest.requireActual(readinessModulePath);
        return {
          ...actual,
          writeSystemReadiness: jest.fn(() => {
            const error = new Error('mocked system-readiness write block');
            error.code = 'EPERM';
            throw error;
          })
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['create', 'domain', 'resilient-host-create', '--scaffold-modules']);

      expect(payload).toEqual(expect.objectContaining({
        action: 'create',
        kind: 'domain',
        skill: 'resilient-host-create',
        degraded_governance: expect.objectContaining({
          'system-readiness': expect.objectContaining({
            ok: false,
            code: 'EPERM',
            degraded: true
          })
        })
      }));
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'resilient-host-create', 'SKILL.md'))).toBe(true);
      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      expect((registry.skills || []).some((item) => item.name === 'resilient-host-create')).toBe(true);
    } finally {
      jest.dontMock(readinessModulePath);
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill materialize-pending-scaffold keeps authoritative materialization when readiness artifacts are best-effort blocked', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const readinessModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-readiness.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            if (options.mode === 'create-file') {
              return { ok: true, mode: options.mode, path: targetPath };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          }),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'resilient-materialize'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      let manageSkill = require(manageSkillModulePath);
      const admission = manageSkill.main(['admission-check', '--kind', 'domain', 'we need resilient materialization']);
      manageSkill.main([
        'create',
        'domain',
        'resilient-materialize',
        '--scaffold-modules',
        '--defer-when-host-blocked',
        '--request-id',
        admission['request-id']
      ]);

      jest.dontMock(commonModulePath);
      jest.resetModules();

      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeDirectoryCreateAccess: jest.fn((targetDir) => {
            const normalized = String(targetDir || '').replace(/\\/g, '/');
            if (normalized.includes('/skills/domains/resilient-materialize')) {
              return {
                ok: true,
                path: targetDir,
                parent: path.dirname(targetDir)
              };
            }
            return actual.probeDirectoryCreateAccess(targetDir);
          })
        };
      });
      jest.doMock(readinessModulePath, () => {
        const actual = jest.requireActual(readinessModulePath);
        return {
          ...actual,
          writeSystemReadiness: jest.fn(() => {
            const error = new Error('mocked host-evolution write block');
            error.code = 'EPERM';
            throw error;
          })
        };
      });

      manageSkill = require(manageSkillModulePath);
      const payload = manageSkill.main(['materialize-pending-scaffold', 'resilient-materialize']);

      expect(payload).toEqual(expect.objectContaining({
        action: 'materialize-pending-scaffold',
        skill: 'resilient-materialize',
        degraded_governance: expect.objectContaining({
          'system-readiness': expect.objectContaining({
            ok: false,
            code: 'EPERM',
            degraded: true
          })
        })
      }));
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'resilient-materialize', 'SKILL.md'))).toBe(true);
      const pendingPayload = manageSkill.main(['show-pending-scaffolds', '--skill', 'resilient-materialize']);
      expect(pendingPayload.returned).toBe(0);
    } finally {
      jest.dontMock(readinessModulePath);
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill diagnose-host-evolution links blocked admissions to pending scaffolds on a constrained host', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            if (options.mode === 'create-file') {
              return { ok: true, mode: options.mode, path: targetPath };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          }),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', 'host-evolution-drill'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const admission = manageSkill.main(['admission-check', '--kind', 'domain', 'we need a host evolution drill']);
      manageSkill.main([
        'create',
        'domain',
        'host-evolution-drill',
        '--scaffold-modules',
        '--defer-when-host-blocked',
        '--request-id',
        admission['request-id']
      ]);

      const payload = manageSkill.main(['diagnose-host-evolution']);

      expect(payload.status).toBe('blocked');
      expect(payload['pending-scaffolds']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'host-evolution-drill',
          status: 'blocked',
          'request-id': admission['request-id']
        })
      ]));
      expect(payload['blocked-admissions']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          'request-id': admission['request-id'],
          status: 'blocked',
          'linked-pending-scaffold': expect.objectContaining({
            skill: 'host-evolution-drill',
            status: 'blocked'
          })
        })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --status blocked',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds'
      ]));
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('sync-runtime-proof tolerates readiness write failure while still syncing runtime-proof and invalidations', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);
    const readinessModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-readiness.js');
    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(readinessModulePath, () => {
        const actual = jest.requireActual(readinessModulePath);
        return {
          ...actual,
          writeSystemReadiness: jest.fn(() => {
            const error = new Error('mocked readiness write block');
            error.code = 'EPERM';
            throw error;
          })
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'manage-skill']);
      expect(payload.action).toBe('sync-runtime-proof');
      expect(payload.skill).toBe('manage-skill');
      expect(payload.readiness_warning).toEqual(expect.objectContaining({
        code: 'EPERM'
      }));
    } finally {
      jest.dontMock(readinessModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill resolves an installed host bundle root when the full personal-skill-system is shipped beside runtime skills', () => {
    const homeRoot = path.join(tmpDir, 'home');
    const agentsRoot = path.join(homeRoot, '.agents');
    fs.mkdirSync(agentsRoot, { recursive: true });
    copyBundleFixture(agentsRoot);

    const originalCwd = process.cwd();
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    try {
      const codexRoot = path.join(homeRoot, '.codex');
      fs.mkdirSync(codexRoot, { recursive: true });
      process.chdir(codexRoot);
      process.env.HOME = homeRoot;
      process.env.USERPROFILE = homeRoot;
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show', 'manage-skill']);
      expect(payload).toEqual(expect.objectContaining({
        action: 'show',
        skill: 'manage-skill',
        path: 'personal-skill-system/skills/tools/manage-skill'
      }));
    } finally {
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
      process.chdir(originalCwd);
    }
  });
});
