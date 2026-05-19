'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  collectGeneratedArtifactWriteability,
  probeDirectoryCreateAccess,
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  getPendingScaffoldRegistryPath
} = require('./skill-pending-scaffold-governance');
const {
  getSkillOpportunityQueuePath
} = require('./skill-opportunity-governance');
const {
  getReviewQueuePath
} = require('./skill-review-governance');
const {
  getAdmissionLedgerPath,
  getEvolutionLedgerPath
} = require('./skill-ledger-governance');
const {
  ACTIVE_OPPORTUNITY_STATUSES,
  normalizeFuturePriority,
  normalizeOpportunityStatus: normalizeSharedOpportunityStatus,
  ACTIVE_ADMISSION_STATUSES,
  normalizeAdmissionStatus: normalizeSharedAdmissionStatus,
  ACTIVE_PENDING_SCAFFOLD_STATUSES,
  normalizePendingScaffoldStatus: normalizeSharedPendingScaffoldStatus
} = require('./skill-future-governance');
const {
  getHostSmokeScorecardPath
} = require('./skill-system-host-smoke');
const {
  normalizeHostSmokePolicy,
  getHostWriteabilitySeverity,
  AUTHORITATIVE_SKILL_TREE_CONSTRAINT
} = require('./skill-host-governance');
const {
  isLiveSkillStatus
} = require('./skill-lifecycle-governance');
const {
  MIN_RUNTIME_PROOF_CONTRACTS,
  normalizeEvidenceTests,
  hasRequiredRuntimeProofEvidenceTests,
  dedupeRuntimeProofEntries
} = require('./skill-runtime-proof-governance');
const {
  summarizeExpertSourceIntegrations,
  isActiveExpertSourceFamily,
  buildExpertSourceTopTierBlockerMap
} = require('./expert-source-integration');
const {
  collectTemplateRecords
} = require('./skill-system-templates');
const {
  shouldAppearOnActiveRouteSurface,
  shouldTrackScaffoldLineage,
  getCapabilityModuleScaffoldKinds
} = require('./skill-kind-governance');
const {
  collectSkillRecords
} = require('./skill-system-skills');
const {
  buildStableTopTierPortfolio,
  buildStableTopTierUpgradeBoard,
  buildStableTopTierExecutionFocusFromUpgradeBoard,
  STABLE_TOP_TIER_PRIORITY_ORDER
} = require('./skill-top-tier-governance');

const SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION = 2;
const INVESTMENT_PRIORITIES = ['critical', 'high', 'normal'];
const INVESTMENT_ITEM_STATUSES = new Set([
  'open',
  'planned',
  'in-progress',
  'deferred',
  'blocked',
  'implemented',
  'cancelled',
  'resolved'
]);
const BACKLOG_SOURCES = new Set([
  'skill-opportunity-queue',
  'admission-ledger',
  'evolution-ledger',
  'review-queue',
  'template-scaffolds',
  'scaffold-lineage',
  'pending-scaffolds',
  'top-tier-readiness',
  'proof-governance',
  'host-writeability'
]);

const CAPABILITY_MODULE_SCAFFOLD_KINDS = Object.freeze(getCapabilityModuleScaffoldKinds());
const SKILL_INVESTMENT_BACKLOG_DOC_PATH = 'skills/routers/sage/references/skill-investment-backlog.generated.md';

function normalizeOpportunityStatus(value) {
  return normalizeSharedOpportunityStatus(value);
}

function getSkillInvestmentBacklogPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'skill-investment-backlog.generated.json');
}

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

function readJsonOrFallback(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readHostSmokeScorecard(bundleRoot) {
  return readJsonOrFallback(getHostSmokeScorecardPath(bundleRoot), { skills: [], summary: {} });
}

function readRuntimeProofRegistry(bundleRoot) {
  const registry = readJsonOrFallback(path.join(bundleRoot, 'registry', 'runtime-proof.generated.json'), { proofs: [] });
  return {
    ...registry,
    proofs: dedupeRuntimeProofEntries(registry && registry.proofs, { prefer: 'first' })
  };
}

function readTemplateVersions(bundleRoot) {
  const templateRoot = path.join(bundleRoot, 'templates', 'skill');
  const versions = new Map();
  if (!fs.existsSync(templateRoot)) {
    return versions;
  }

  for (const entry of fs.readdirSync(templateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = path.join(templateRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      continue;
    }
    const text = fs.readFileSync(skillFile, 'utf8');
    const match = text.match(/^template-version:\s*(\d+)\s*$/m);
    if (!match) {
      continue;
    }
    versions.set(entry.name, Number(match[1]));
  }

  return versions;
}

function normalizeScaffoldVersion(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePriority(value) {
  return normalizeFuturePriority(value);
}

function getReviewEntries(reviewQueueData) {
  if (Array.isArray(reviewQueueData && reviewQueueData.skills)) {
    return reviewQueueData.skills;
  }
  if (Array.isArray(reviewQueueData && reviewQueueData.entries)) {
    return reviewQueueData.entries;
  }
  return [];
}

function normalizeRouteFixtureEvidence(fixtures, skillName) {
  return (Array.isArray(fixtures) ? fixtures : []).some((fixture) => {
    const expect = normalizeString(fixture && fixture.expect).toLowerCase();
    if (expect === normalizeString(skillName).toLowerCase() && fixture && fixture.governed !== true) {
      return true;
    }
    const fallbackText = normalizeString(fixture && fixture['expect-fallback-question-contains']).toLowerCase();
    return fallbackText.includes(normalizeString(skillName).toLowerCase());
  });
}

function buildTopTierReadinessItems(topTierPortfolio) {
  const items = [];
  for (const assessment of Array.isArray(topTierPortfolio && topTierPortfolio.assessments) ? topTierPortfolio.assessments : []) {
    if (!assessment || assessment.ready === true) {
      continue;
    }
    const reasons = uniqueSorted(
      (Array.isArray(assessment.blockers) ? assessment.blockers : [])
        .map((blocker) => normalizeString(blocker && blocker.message))
        .filter(Boolean)
    );
    items.push({
      id: `stable-gap-${assessment.skill}`,
      category: 'top-tier-hardening',
      status: 'open',
      priority: normalizeString(assessment.priority) || 'normal',
      source: 'top-tier-readiness',
      skill: assessment.skill,
      kind: assessment.kind,
      summary: `Harden stable skill '${assessment.skill}' until top-tier governance debt clears.`,
      reasons,
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${assessment.skill}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${assessment.skill}`
      ]
    });
  }

  return items;
}

function buildLifecycleHardeningItems(skillRecords) {
  const items = [];

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (!record || !isLiveSkillStatus(record.status) || normalizeString(record.status) === 'stable') {
      continue;
    }

    const normalizedStatus = normalizeString(record.status);
    const priority = normalizedStatus === 'experimental' ? 'high' : 'normal';
    const reasons = [
      `active skill is still '${normalizedStatus}' and has not been promoted into the canonical stable/top-tier surface`
    ];

    items.push({
      id: `lifecycle-hardening-${record.name}`,
      category: 'top-tier-hardening',
      status: 'open',
      priority,
      source: 'authoritative-skills',
      skill: record.name,
      kind: record.kind,
      summary: `Decide whether active skill '${record.name}' should be hardened to stable or intentionally retired.`,
      reasons,
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance --skill ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js evolution-check ${record.name} "promote this active skill into the governed stable surface if it is honestly ready"`
      ]
    });
  }

  return items;
}

function buildProofGovernanceItems(bundleRoot, skillRecords, runtimeProofData = {}, hostSmokeScorecardData = {}) {
  const proofEntries = dedupeRuntimeProofEntries(runtimeProofData && runtimeProofData.proofs, { prefer: 'first' });
  const proofBySkill = new Map(proofEntries.map((entry) => [normalizeString(entry && entry.skill), entry]));
  const hostSmokeEntries = Array.isArray(hostSmokeScorecardData && hostSmokeScorecardData.skills) ? hostSmokeScorecardData.skills : [];
  const hostSmokeBySkill = new Map(hostSmokeEntries.map((entry) => [normalizeString(entry && entry.skill), entry]));
  const items = [];

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (normalizeString(record.status) !== 'stable') {
      continue;
    }
    if (normalizeString(record.runtime) !== 'scripted') {
      continue;
    }

    const proofEntry = proofBySkill.get(record.name) || null;
    if (!proofEntry) {
      items.push({
        id: `proof-${record.name}-runtime-proof-missing`,
        category: 'proof-governance',
        status: 'open',
        priority: 'high',
        source: 'proof-governance',
        skill: record.name,
        kind: record.kind,
        summary: `Add governed runtime proof coverage for '${record.name}'.`,
        reasons: ['runtime-proof:missing'],
        follow_up: [
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof ${record.name}`,
          `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
        ]
      });
      continue;
    }

    const reasons = [];
    const policy = normalizeHostSmokePolicy(proofEntry['host-smoke-policy']);
    const evidenceTests = normalizeEvidenceTests(proofEntry['evidence-tests']);
    if (!hasRequiredRuntimeProofEvidenceTests(proofEntry.level, evidenceTests)) {
      reasons.push('evidence-tests:missing');
    }
    if ((Array.isArray(proofEntry.contracts) ? proofEntry.contracts : []).length < MIN_RUNTIME_PROOF_CONTRACTS) {
      reasons.push('contracts:below-floor');
    }

    if (policy && policy['target-level'] === 'host-smoked') {
      const scorecardEntry = hostSmokeBySkill.get(record.name) || null;
      if (!scorecardEntry) {
        reasons.push('host-smoke-scorecard:missing');
      } else {
        if (normalizeString(scorecardEntry.level) !== 'host-smoked') {
          reasons.push(`host-smoke-level:${normalizeString(scorecardEntry.level) || 'missing'}`);
        }
        if (normalizeString(scorecardEntry['governance-status']) !== 'satisfied') {
          reasons.push(`host-smoke-governance:${normalizeString(scorecardEntry['governance-status']) || 'unknown'}`);
        }
        if (normalizeString(scorecardEntry['evidence-status']) !== 'passing') {
          reasons.push(`host-smoke-evidence:${normalizeString(scorecardEntry['evidence-status']) || 'unknown'}`);
        }
      }
    }

    if (reasons.length < 1) {
      continue;
    }

    items.push({
      id: `proof-${record.name}`,
      category: 'proof-governance',
      status: 'open',
      priority: reasons.some((reason) => reason.startsWith('host-smoke-governance:') || reason.startsWith('host-smoke-level:'))
        ? 'critical'
        : 'high',
      source: 'proof-governance',
      skill: record.name,
      kind: record.kind,
      summary: `Close proof-governance debt for '${record.name}'.`,
      reasons,
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke ${record.name} --host codex`
      ]
    });
  }

  return items;
}

function buildHostWriteabilityItems(bundleRoot) {
  const probes = collectGeneratedArtifactWriteability(bundleRoot);
  const items = [];

  for (const probe of probes) {
    if (probe.ok) {
      continue;
    }

    items.push({
      id: `host-writeability-${probe.id}`,
      category: 'host-writeability',
      status: 'open',
      priority: probe.id === 'expert-source-family-scorecard'
        ? 'high'
        : getHostWriteabilitySeverity(probe.id),
      source: 'host-writeability',
      skill: null,
      kind: null,
      summary: `Restore host write access for '${probe.label}'.`,
      reasons: [
        `artifact:${probe.id}`,
        `mode:${normalizeString(probe.mode)}`,
        `code:${normalizeString(probe.code) || 'UNKNOWN'}`
      ],
      follow_up: [
        'npm run verify:skill-system'
      ]
    });
  }

  const skillCreateProbe = probeDirectoryCreateAccess(path.join(bundleRoot, 'skills', 'domains', `__create-probe__-${Date.now()}`));
  if (!skillCreateProbe.ok) {
    items.push({
      id: 'host-writeability-authoritative-skill-create',
      category: 'host-writeability',
      status: 'open',
      priority: 'high',
      source: 'host-writeability',
      skill: null,
      kind: null,
      summary: "Restore host ability to create authoritative skill directories.",
      reasons: [
        `artifact:${AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id}`,
        'mode:create-child-directory',
        `code:${normalizeString(skillCreateProbe.code) || 'UNKNOWN'}`
      ],
      follow_up: [
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --kind domain "<request>"',
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${CAPABILITY_MODULE_SCAFFOLD_KINDS[0] || 'domain'} <skill-name> --scaffold-modules`
      ]
    });
  }

  return items;
}

function buildScaffoldLineageItems(skillRecords, bundleRoot) {
  const templateVersions = readTemplateVersions(bundleRoot);
  const items = [];

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (!shouldTrackScaffoldLineage(record.kind)) {
      continue;
    }
    const templateVersion = templateVersions.get(record.kind) || null;
    const scaffoldVersion = normalizeScaffoldVersion(record.scaffoldVersion);

    if (templateVersion == null || scaffoldVersion == null || scaffoldVersion >= templateVersion) {
      continue;
    }

    items.push({
      id: `scaffold-drift-${record.name}`,
      category: 'template-upgrade',
      status: 'open',
      priority: normalizeString(record.status) === 'stable' ? 'high' : 'normal',
      source: 'scaffold-lineage',
      skill: record.name,
      kind: record.kind,
      summary: `Refresh '${record.name}' from canonical ${record.kind} scaffold lineage.`,
      reasons: [`scaffold-version:${scaffoldVersion}`, `template-version:${templateVersion}`],
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-scaffold-upgrade-blueprint --name ${record.name}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${record.name}`
      ]
    });
  }

  return items;
}

function buildTemplateGovernanceItems(bundleRoot, now) {
  const templateRecords = collectTemplateRecords(bundleRoot, []);
  const items = [];

  for (const record of templateRecords) {
    const reviewStatus = normalizeString(record['review-status']);
    if (!['overdue', 'missing-metadata'].includes(reviewStatus)) {
      continue;
    }

    const reasons = uniqueSorted([
      `review-status:${reviewStatus}`,
      ...(normalizeString(record['next-review-due']) ? [`next-review-due:${normalizeString(record['next-review-due'])}`] : []),
      ...(record['last-reviewed'] ? [`last-reviewed:${normalizeString(record['last-reviewed'])}`] : []),
      ...(record['review-cycle-days'] != null ? [`review-cycle-days:${record['review-cycle-days']}`] : [])
    ]);

    items.push({
      id: `template-governance-${normalizeString(record.kind)}`,
      category: 'template-governance',
      status: 'open',
      priority: reviewStatus === 'overdue' ? 'high' : 'normal',
      source: 'template-scaffolds',
      skill: null,
      kind: normalizeString(record.kind) || null,
      summary: `Refresh canonical ${normalizeString(record.kind)} template governance metadata.`,
      reasons,
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind ${normalizeString(record.kind)}`,
        'npm run verify:skill-system'
      ]
    });
  }

  return items.sort(compareBacklogItems);
}

function buildPendingScaffoldItems(pendingScaffoldData) {
  const entries = Array.isArray(pendingScaffoldData && pendingScaffoldData.entries) ? pendingScaffoldData.entries : [];
  return entries
    .filter((entry) => ACTIVE_PENDING_SCAFFOLD_STATUSES.has(normalizeSharedPendingScaffoldStatus(entry.status)))
    .map((entry) => ({
      id: `pending-scaffold-${normalizeString(entry['pending-id'])}`,
      category: 'pending-scaffold-materialization',
      status: normalizeSharedPendingScaffoldStatus(entry.status),
      priority: normalizeString(entry.status) === 'blocked' ? 'critical' : 'high',
      source: 'pending-scaffolds',
      skill: normalizeString(entry.skill) || null,
      kind: normalizeString(entry.kind) || null,
      summary: `Materialize pending scaffold '${normalizeString(entry.skill) || 'unknown'}' into the authoritative tree.`,
      reasons: uniqueSorted([
        `status:${normalizeString(entry.status) || 'blocked'}`,
        ...(normalizeString(entry.path) ? [`path:${normalizeString(entry.path)}`] : []),
        ...(normalizeString(entry['host-constraint'] && entry['host-constraint'].code)
          ? [`code:${normalizeString(entry['host-constraint'].code)}`]
          : []),
        ...(normalizeString(entry['host-constraint'] && entry['host-constraint'].mode)
          ? [`mode:${normalizeString(entry['host-constraint'].mode)}`]
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --skill ${normalizeString(entry.skill)}`,
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold ${normalizeString(entry.skill)}`
      ]
    }));
}

function formatTemplate(template, sourceSkill) {
  return normalizeString(template).replace(/%s/g, sourceSkill);
}

function buildExpertSourceIntegrationItems(bundleRoot, context = {}) {
  const integrations = context.expertSourceIntegrations || summarizeExpertSourceIntegrations(bundleRoot, context.registryData || {});
  const items = [];

  for (const summary of Array.isArray(integrations.families) ? integrations.families : []) {
    const family = summary.family || {};
    if (!isActiveExpertSourceFamily(family)) {
      continue;
    }
    const source = normalizeString(family.source);
    if (!source) {
      continue;
    }

    if (summary.parseError) {
      items.push({
        id: `${normalizeString(family.id) || source}-integration-registry-drift`,
        category: 'expert-source-integration',
        status: 'open',
        priority: 'high',
        source,
        skill: null,
        kind: null,
        summary: normalizeString(family.parseErrorSummary) || `Repair ${normalizeString(family.label) || source} registry before the next expert-source extraction.`,
        reasons: [`parse-error:${normalizeString(summary.parseError) || 'unknown'}`],
        follow_up: [
          'npm run verify:skill-system'
        ]
      });
      continue;
    }

    for (const sourceSkill of summary.unmappedRawSources) {
      items.push({
        id: `${normalizeString(family.id) || source}-source-${sourceSkill}`,
        category: 'expert-source-integration',
        status: 'open',
        priority: 'high',
        source,
        skill: null,
        kind: null,
        summary: formatTemplate(family.unmappedSummaryTemplate, sourceSkill),
        reasons: uniqueSorted([
          `raw-source:${sourceSkill}`,
          'state:unmapped',
          ...(summary.rawSourceCatalog.exists && summary.rawSourceCatalog.root
            ? [`root:${path.basename(summary.rawSourceCatalog.root)}`]
            : [])
        ]),
        follow_up: (Array.isArray(family.backlogFollowUp) ? family.backlogFollowUp : []).map((item) =>
          formatTemplate(item, sourceSkill)
        )
      });
    }
  }

  return items;
}

function buildAdmissionItems(admissionLedgerData) {
  const entries = Array.isArray(admissionLedgerData && admissionLedgerData.entries) ? admissionLedgerData.entries : [];
  return entries
    .filter((entry) => ACTIVE_ADMISSION_STATUSES.has(normalizeSharedAdmissionStatus(entry.status)))
    .map((entry) => ({
      id: `admission-${normalizeString(entry['request-id'])}`,
      category: 'new-skill-admission',
      status: normalizeSharedAdmissionStatus(entry.status),
      priority: normalizeString(entry.status) === 'blocked' ? 'critical' : 'high',
      source: 'admission-ledger',
      skill: normalizeString(entry && entry['created-skill']) || null,
      kind: normalizeString(entry && entry['suggested-kind']) || normalizeString(entry && entry.decision && entry.decision.suggested_kind) || null,
      summary: normalizeString(entry && entry.request) || 'Open admission request',
      reasons: uniqueSorted([
        `decision:${normalizeString(entry && entry.decision && entry.decision.action) || 'unknown'}`,
        `status:${normalizeString(entry && entry.status) || 'open'}`,
        ...(Array.isArray(entry && entry['inferred-intent-tags'])
          ? entry['inferred-intent-tags'].map((item) => `intent:${normalizeString(item)}`)
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --request-id ${normalizeString(entry['request-id'])}`
      ]
    }));
}

function buildOpportunityItems(opportunityQueueData) {
  const entries = Array.isArray(opportunityQueueData && opportunityQueueData.entries) ? opportunityQueueData.entries : [];
  return entries
    .filter((entry) => ACTIVE_OPPORTUNITY_STATUSES.has(normalizeOpportunityStatus(entry && entry.status)))
    .map((entry) => ({
      id: `opportunity-${normalizeString(entry['opportunity-id'])}`,
      category: 'future-skill-opportunity',
      status: normalizeOpportunityStatus(entry && entry.status),
      priority: normalizePriority(entry && entry.priority),
      source: 'skill-opportunity-queue',
      skill: normalizeString(entry && entry['created-skill']) || null,
      kind: normalizeString(entry && entry['suggested-kind']) || null,
      summary: normalizeString(entry && entry.summary) || 'Open future skill opportunity',
      reasons: uniqueSorted([
        `horizon:${normalizeString(entry && entry.horizon) || 'next'}`,
        ...(Array.isArray(entry && entry['adjacent-skills'])
          ? entry['adjacent-skills'].map((item) => `adjacent:${normalizeString(item)}`)
          : []),
        ...(Array.isArray(entry && entry.rationale)
          ? entry.rationale.map((item) => `reason:${normalizeString(item)}`)
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id ${normalizeString(entry['opportunity-id'])}`
      ]
    }));
}

function buildEvolutionItems(evolutionLedgerData) {
  const entries = Array.isArray(evolutionLedgerData && evolutionLedgerData.entries) ? evolutionLedgerData.entries : [];
  return entries
    .filter((entry) => normalizeString(entry.status) === 'open')
    .map((entry) => ({
      id: `evolution-${normalizeString(entry['request-id'])}`,
      category: 'existing-skill-evolution',
      status: 'open',
      priority: normalizeString(entry && entry.decision && entry.decision.target_status) === 'stable' ? 'high' : 'normal',
      source: 'evolution-ledger',
      skill: normalizeString(entry && entry.skill) || null,
      kind: null,
      summary: normalizeString(entry && entry.request) || `Open evolution request for '${normalizeString(entry && entry.skill) || 'unknown'}'`,
      reasons: uniqueSorted([
        `decision:${normalizeString(entry && entry.decision && entry.decision.action) || 'unknown'}`,
        ...(normalizeString(entry && entry.decision && entry.decision.target_status)
          ? [`target-status:${normalizeString(entry.decision.target_status)}`]
          : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-evolution-ledger --request-id ${normalizeString(entry['request-id'])}`
      ]
    }));
}

function buildReviewItems(reviewQueueData) {
  const entries = getReviewEntries(reviewQueueData);
  return entries
    .filter((entry) => ['overdue', 'missing-metadata'].includes(normalizeString(entry['review-status'])))
    .map((entry) => ({
      id: `review-${normalizeString(entry.skill)}`,
      category: 'review-cadence',
      status: 'open',
      priority: normalizeString(entry.status) === 'stable' ? 'critical' : 'high',
      source: 'review-queue',
      skill: normalizeString(entry.skill) || null,
      kind: normalizeString(entry.kind) || null,
      summary: `Refresh governed review metadata for '${normalizeString(entry.skill) || 'unknown'}'.`,
      reasons: uniqueSorted([
        `review-status:${normalizeString(entry['review-status'])}`,
        ...(normalizeString(entry['next-review-due']) ? [`next-review-due:${normalizeString(entry['next-review-due'])}`] : [])
      ]),
      follow_up: [
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed ${normalizeString(entry.skill)}`
      ]
    }));
}

function compareBacklogItems(left, right) {
  const priorityIndex = new Map(INVESTMENT_PRIORITIES.map((item, index) => [item, index]));
  const leftPriority = priorityIndex.get(normalizePriority(left && left.priority)) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = priorityIndex.get(normalizePriority(right && right.priority)) ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  return normalizeString(left && left.id).localeCompare(normalizeString(right && right.id));
}

function summarizeBacklogItems(items) {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    normal: 0,
    categories: {},
    sources: {}
  };

  for (const item of Array.isArray(items) ? items : []) {
    const priority = normalizePriority(item.priority);
    const category = normalizeString(item.category) || 'unknown';
    const source = normalizeString(item.source) || 'unknown';
    summary.total += 1;
    summary[priority] += 1;
    summary.categories[category] = Number(summary.categories[category] || 0) + 1;
    summary.sources[source] = Number(summary.sources[source] || 0) + 1;
  }

  return summary;
}

function asCode(value) {
  return `\`${normalizeString(value)}\``;
}

function formatMaybeCode(value) {
  const normalized = normalizeString(value);
  return normalized ? asCode(normalized) : '-';
}

function formatList(values) {
  const items = uniqueSorted(values);
  return items.length > 0 ? items.map(asCode).join(', ') : '-';
}

function buildSkillInvestmentBacklogMarkdown(backlogData) {
  const summary = backlogData && backlogData.summary && typeof backlogData.summary === 'object'
    ? backlogData.summary
    : {};
  const items = Array.isArray(backlogData && backlogData.items) ? backlogData.items : [];
  const sources = backlogData && backlogData.sources && typeof backlogData.sources === 'object'
    ? backlogData.sources
    : {};
  const generatedAt = normalizeString(backlogData && backlogData['generated-at']);

  const lines = [
    '# Skill Investment Backlog',
    '',
    'Generated from `registry/skill-investment-backlog.generated.json`.',
    'Use this as the human-readable portfolio board for current-skill hardening, future-skill intake, lifecycle debt, and host-governance blockers.',
    ''
  ];

  if (generatedAt) {
    lines.push(`Generated at: ${generatedAt}`);
    lines.push('');
  }

  const topTierPortfolio = backlogData && backlogData['top-tier-portfolio'] && typeof backlogData['top-tier-portfolio'] === 'object'
    ? backlogData['top-tier-portfolio']
    : null;
  if (topTierPortfolio) {
    const portfolioSummary = topTierPortfolio.summary || {};
    const upgradeBoard = topTierPortfolio['upgrade-board'] || null;
    const executionFocus = topTierPortfolio['execution-focus'] || null;
    lines.push('## Stable Top-Tier Portfolio');
    lines.push('');
    lines.push(`- stable skills: ${Number(portfolioSummary.total || 0)}`);
    lines.push(`- ready: ${Number(portfolioSummary.ready || 0)}`);
    lines.push(`- blocked: ${Number(portfolioSummary.blocked || 0)}`);
    for (const priority of STABLE_TOP_TIER_PRIORITY_ORDER) {
      lines.push(`- ${priority}: ${Number((portfolioSummary.priorities || {})[priority] || 0)}`);
    }
    lines.push('');

    const blockedAssessments = Array.isArray(topTierPortfolio.assessments)
      ? topTierPortfolio.assessments.filter((item) => item && item.ready === false)
      : [];
    if (blockedAssessments.length > 0) {
      lines.push('### Blocked Stable Skills');
      lines.push('');
      for (const assessment of blockedAssessments) {
        const categories = formatList(assessment['blocker-categories']);
        lines.push(`- ${asCode(assessment.skill)}: priority ${asCode(assessment.priority)}, blockers ${Number(assessment['blocker-count'] || 0)}, categories ${categories}`);
      }
      lines.push('');
    }

    if (upgradeBoard) {
      const boardSummary = upgradeBoard.summary || {};
      lines.push('### Upgrade Board');
      lines.push('');
      lines.push(`- blocked stable skills: ${Number(boardSummary.blocked || 0)}`);
      lines.push(`- next wave: ${formatList(boardSummary['next-wave'])}`);
      lines.push('');

      const lanes = Array.isArray(upgradeBoard.lanes) ? upgradeBoard.lanes : [];
      if (lanes.length > 0) {
        lines.push('#### Priority Lanes');
        lines.push('');
        for (const lane of lanes) {
          lines.push(`- ${asCode(lane.priority)}: ${Number(lane.count || 0)} -> ${formatList(lane.skills)}`);
        }
        lines.push('');
      }

      const groups = Array.isArray(upgradeBoard.groups) ? upgradeBoard.groups : [];
      if (groups.length > 0) {
        lines.push('#### Blocker Families');
        lines.push('');
        for (const group of groups) {
          lines.push(`- ${asCode(group.category)}: ${Number(group.count || 0)} skills -> ${formatList(group.skills)}`);
          lines.push(`  title: ${group.title || '-'}`);
          lines.push(`  summary: ${group.summary || '-'}`);
          lines.push(`  follow-up: ${formatList(group.follow_up)}`);
        }
        lines.push('');
      }
    }

    if (executionFocus) {
      lines.push('### Current Wave');
      lines.push('');
      lines.push(`- blocked stable skills: ${Number(executionFocus.blocked || 0)}`);
      lines.push(`- next wave: ${formatList(executionFocus['next-wave'])}`);
      lines.push(`- next wave size: ${Number(executionFocus['next-wave-size'] || 0)}`);
      if (executionFocus['current-priority-lane']) {
        const lane = executionFocus['current-priority-lane'];
        lines.push(`- current priority lane: ${asCode(lane.priority)} (${Number(lane.count || 0)}) -> ${formatList(lane.skills)}`);
      }
      if (executionFocus['current-blocker-family']) {
        const group = executionFocus['current-blocker-family'];
        lines.push(`- current blocker family: ${asCode(group.category)} (${Number(group.count || 0)}) -> ${formatList(group.skills)}`);
        lines.push(`  title: ${group.title || '-'}`);
        lines.push(`  summary: ${group.summary || '-'}`);
      }
      lines.push(`- follow-up: ${formatList(executionFocus.follow_up)}`);
      lines.push('');
    }
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- total items: ${Number(summary.total || 0)}`);
  lines.push(`- critical: ${Number(summary.critical || 0)}`);
  lines.push(`- high: ${Number(summary.high || 0)}`);
  lines.push(`- normal: ${Number(summary.normal || 0)}`);
  lines.push('');

  const categories = summary.categories && typeof summary.categories === 'object'
    ? Object.entries(summary.categories)
        .filter(([, count]) => Number(count || 0) > 0)
        .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0])))
    : [];
  if (categories.length > 0) {
    lines.push('### Categories');
    lines.push('');
    for (const [category, count] of categories) {
      lines.push(`- ${asCode(category)}: ${Number(count || 0)}`);
    }
    lines.push('');
  }

  const sourceCounts = summary.sources && typeof summary.sources === 'object'
    ? Object.entries(summary.sources)
        .filter(([, count]) => Number(count || 0) > 0)
        .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0) || String(left[0]).localeCompare(String(right[0])))
    : [];
  if (sourceCounts.length > 0) {
    lines.push('### Sources');
    lines.push('');
    for (const [source, count] of sourceCounts) {
      const description = normalizeString(sources[source]);
      lines.push(`- ${asCode(source)}: ${Number(count || 0)}${description ? ` -> ${description}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Active Items');
  lines.push('');
  if (items.length < 1) {
    lines.push('No backlog items.');
    lines.push('');
  } else {
    for (const item of items) {
      lines.push(`### ${normalizeString(item.summary) || normalizeString(item.id)}`);
      lines.push('');
      lines.push(`- id: ${asCode(item.id)}`);
      lines.push(`- priority: ${asCode(item.priority)}`);
      lines.push(`- status: ${asCode(item.status)}`);
      lines.push(`- category: ${asCode(item.category)}`);
      lines.push(`- source: ${asCode(item.source)}`);
      lines.push(`- skill: ${formatMaybeCode(item.skill)}`);
      lines.push(`- kind: ${formatMaybeCode(item.kind)}`);
      lines.push(`- reasons: ${formatList(item.reasons)}`);
      lines.push(`- follow-up: ${formatList(item.follow_up)}`);
      lines.push('');
    }
  }

  lines.push('## Operating Notes');
  lines.push('');
  lines.push('1. treat this file as derived evidence, not the primary write surface');
  lines.push('2. use `manage-skill` to change lifecycle, opportunity, admission, evolution, or scaffold state');
  lines.push('3. regenerate this file whenever the governed backlog JSON changes');

  return lines.join('\n');
}

function getSkillInvestmentBacklogDocPath(bundleRoot) {
  return path.join(bundleRoot, SKILL_INVESTMENT_BACKLOG_DOC_PATH);
}

function buildSkillInvestmentBacklog(bundleRoot, context = {}) {
  let skillRecords = Array.isArray(context.skillRecords) ? context.skillRecords : [];
  if (skillRecords.length < 1) {
    const findings = [];
    const collected = collectSkillRecords(bundleRoot, findings);
    skillRecords = Array.isArray(collected && collected.skillRecords) ? collected.skillRecords : [];
  }
  const registryData = context.registryData || readJsonOrFallback(path.join(bundleRoot, 'registry', 'registry.generated.json'), {});
  const ratingsData = context.ratingsData || readJsonOrFallback(path.join(bundleRoot, 'registry', 'capability-ratings.generated.json'), {});
  const reviewQueueData = context.reviewQueueData || readJsonOrFallback(getReviewQueuePath(bundleRoot), {});
  const admissionLedgerData = context.admissionLedgerData || readJsonOrFallback(getAdmissionLedgerPath(bundleRoot), {});
  const evolutionLedgerData = context.evolutionLedgerData || readJsonOrFallback(getEvolutionLedgerPath(bundleRoot), {});
  const opportunityQueueData = context.opportunityQueueData || readJsonOrFallback(getSkillOpportunityQueuePath(bundleRoot), {});
  const routeFixturesData = context.routeFixturesData || readJsonOrFallback(path.join(bundleRoot, 'registry', 'route-fixtures.generated.json'), {});
  const runtimeProofData = context.runtimeProofData || readRuntimeProofRegistry(bundleRoot);
  const hostSmokeScorecardData = context.hostSmokeScorecardData || readHostSmokeScorecard(bundleRoot);
  const pendingScaffoldData = context.pendingScaffoldData || readJsonOrFallback(getPendingScaffoldRegistryPath(bundleRoot), { entries: [] });
  const expertSourceIntegrations = context.expertSourceIntegrations || summarizeExpertSourceIntegrations(bundleRoot, registryData);
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  const templateGovernanceItems = buildTemplateGovernanceItems(bundleRoot, now);
  const topTierPortfolio = context.topTierPortfolio || buildStableTopTierPortfolio(skillRecords, {
    ...context,
    bundleRoot,
    skillRecords,
    registryData,
    ratingsData,
    reviewQueueData,
    routeFixturesData,
    runtimeProofData,
    hostSmokeScorecardData
  });
  const topTierUpgradeBoard = topTierPortfolio['upgrade-board'] || buildStableTopTierUpgradeBoard(topTierPortfolio);
  const topTierExecutionFocus = topTierPortfolio['execution-focus'] || buildStableTopTierExecutionFocusFromUpgradeBoard(topTierUpgradeBoard);

  const items = [
    ...buildOpportunityItems(opportunityQueueData),
    ...buildAdmissionItems(admissionLedgerData),
    ...buildEvolutionItems(evolutionLedgerData),
    ...buildReviewItems(reviewQueueData),
    ...templateGovernanceItems,
    ...buildScaffoldLineageItems(skillRecords, bundleRoot),
    ...buildPendingScaffoldItems(pendingScaffoldData),
    ...buildLifecycleHardeningItems(skillRecords),
    ...buildTopTierReadinessItems(topTierPortfolio),
    ...buildProofGovernanceItems(bundleRoot, skillRecords, runtimeProofData, hostSmokeScorecardData),
    ...buildHostWriteabilityItems(bundleRoot),
    ...buildExpertSourceIntegrationItems(bundleRoot, {
      registryData,
      expertSourceIntegrations
    })
  ].sort(compareBacklogItems);

  const sourceDescriptions = {
    'skill-opportunity-queue': 'registry/skill-opportunity-queue.generated.json',
    'admission-ledger': 'registry/admission-ledger.generated.json',
    'evolution-ledger': 'registry/evolution-ledger.generated.json',
    'review-queue': 'registry/review-queue.generated.json',
    'template-scaffolds': 'templates/skill/**/SKILL.md',
    'scaffold-lineage': 'templates/skill/**/SKILL.md + skills/**/SKILL.md scaffold metadata',
    'pending-scaffolds': 'registry/pending-scaffolds.generated.json',
    'top-tier-readiness': 'registry/capability-ratings.generated.json + registry/review-queue.generated.json + registry/route-fixtures.generated.json',
    'proof-governance': 'registry/runtime-proof.generated.json + benchmark/host-smoke/scorecard.generated.json',
    'host-writeability': 'live write-access probes across generated governance artifacts and authoritative skill tree',
    'capability-ratings': 'registry/capability-ratings.generated.json',
    'route-fixtures': 'registry/route-fixtures.generated.json',
    'runtime-proof': 'registry/runtime-proof.generated.json',
    'host-smoke-scorecard': 'benchmark/host-smoke/scorecard.generated.json',
    'authoritative-skills': 'skills/**/SKILL.md'
  };
  for (const family of Array.isArray(expertSourceIntegrations.familiesConfig) ? expertSourceIntegrations.familiesConfig : []) {
    const source = normalizeString(family && family.source);
    if (!source) {
      continue;
    }
    sourceDescriptions[source] = normalizeString(family && family.sourceDescription);
  }

  return {
    'schema-version': SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    sources: sourceDescriptions,
    'top-tier-portfolio': {
      summary: topTierPortfolio.summary || {},
      'upgrade-board': topTierUpgradeBoard,
      'execution-focus': topTierExecutionFocus,
      assessments: Array.isArray(topTierPortfolio.assessments)
        ? topTierPortfolio.assessments.map((assessment) => ({
            skill: assessment.skill,
            kind: assessment.kind,
            status: assessment.status,
            ready: assessment.ready,
            priority: assessment.priority,
            'blocker-count': assessment['blocker-count'],
            'blocker-categories': assessment['blocker-categories']
          }))
        : []
    },
    summary: summarizeBacklogItems(items),
    items
  };
}

function writeSkillInvestmentBacklog(bundleRoot, context = {}) {
  const payload = buildSkillInvestmentBacklog(bundleRoot, context);
  const file = getSkillInvestmentBacklogPath(bundleRoot);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const docFile = getSkillInvestmentBacklogDocPath(bundleRoot);
  fs.writeFileSync(docFile, `${buildSkillInvestmentBacklogMarkdown(payload)}\n`, 'utf8');
  return {
    file,
    docFile,
    payload
  };
}

function validateSkillInvestmentBacklog(bundleRoot, findings, context = {}) {
  const file = getSkillInvestmentBacklogPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill investment backlog parse failed: ${parsed.error}`
    });
    return {
      items: [],
      summary: summarizeBacklogItems([])
    };
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(normalizeString(actual['generated-at']));
  const now = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildSkillInvestmentBacklog(bundleRoot, {
    ...context,
    now
  });
  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };

  if (actual['schema-version'] !== SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill investment backlog has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  const sourceMap = actual.sources || {};
  for (const [key, value] of Object.entries(expected.sources || {})) {
    if (normalizeString(sourceMap[key]) !== normalizeString(value)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog source '${key}' is out of sync`
      });
    }
  }

  const seen = new Set();
  for (const item of Array.isArray(actual.items) ? actual.items : []) {
    const id = normalizeString(item && item.id);
    if (!id) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: 'skill investment backlog item is missing id'
      });
      continue;
    }
    if (seen.has(id)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog duplicates id '${id}'`
      });
      continue;
    }
    seen.add(id);

    const sourceValue = normalizeString(item && item.source);
    const allowedSources = new Set(Object.keys(expected.sources || {}));
    if (!allowedSources.has(sourceValue)) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog item '${id}' has unsupported source '${sourceValue}'`
      });
    }

    if (!INVESTMENT_ITEM_STATUSES.has(normalizeString(item && item.status))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog item '${id}' has unsupported status '${normalizeString(item && item.status)}'`
      });
    }

    if (!INVESTMENT_PRIORITIES.includes(normalizeString(item && item.priority))) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `skill investment backlog item '${id}' has unsupported priority '${normalizeString(item && item.priority)}'`
      });
    }
  }

  if (JSON.stringify(comparableActual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'skill investment backlog is out of sync with admission, evolution, review, scaffold, or top-tier governance state'
        : `skill investment backlog is out of sync with admission, evolution, review, scaffold, or top-tier governance state, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  const docFile = getSkillInvestmentBacklogDocPath(bundleRoot);
  if (!fs.existsSync(docFile)) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, docFile),
      message: 'skill investment backlog generated markdown is missing'
    });
  } else {
    const expectedDoc = `${buildSkillInvestmentBacklogMarkdown(expected)}\n`;
    const actualDoc = fs.readFileSync(docFile, 'utf8');
    if (actualDoc !== expectedDoc) {
      const probe = probeArtifactWriteAccess(docFile, { mode: 'rewrite-file' });
      findings.push({
        severity: probe.ok ? 'error' : 'warning',
        file: rel(bundleRoot, docFile),
        message: probe.ok
          ? 'skill investment backlog generated markdown is out of sync with skill-investment-backlog.generated.json'
          : `skill investment backlog generated markdown is out of sync with skill-investment-backlog.generated.json, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
      });
    }
  }

  return {
    items: Array.isArray(expected.items) ? expected.items : [],
    summary: expected.summary || summarizeBacklogItems([])
  };
}

module.exports = {
  SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
  INVESTMENT_PRIORITIES,
  SKILL_INVESTMENT_BACKLOG_DOC_PATH,
  getSkillInvestmentBacklogPath,
  getSkillInvestmentBacklogDocPath,
  buildSkillInvestmentBacklog,
  buildSkillInvestmentBacklogMarkdown,
  writeSkillInvestmentBacklog,
  validateSkillInvestmentBacklog
};
