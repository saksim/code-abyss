'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile } = require('./skill-system-common');
const {
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_ARTIFACT_PATHS,
  DERIVED_GOVERNANCE_REFRESH_STEP_ORDER
} = require('./skill-system-derived-governance-contract');
const {
  getGovernanceArtifactPath,
  getDerivedGovernanceFingerprintSourcePaths,
  getDerivedGovernanceExportArtifacts
} = require('./skill-generated-artifact-governance');
const {
  syncSkillCatalog
} = require('./skill-registry-governance');
const {
  syncAuthoringGovernanceReference
} = require('./skill-authoring-governance');
const {
  getCapabilityRatingsDocPath,
  syncCapabilityRatingsDoc,
  applyCapabilityRatingsGovernance
} = require('./skill-capability-ratings-governance');
const {
  writeCapabilityRatingsSchema
} = require('./skill-capability-ratings-schema-governance');
const {
  buildSkillInvestmentBacklog,
  writeSkillInvestmentBacklog
} = require('./skill-investment-governance');
const {
  buildReviewQueue
} = require('./skill-review-governance');
const {
  collectSkillRecords
} = require('./skill-system-skills');
const {
  buildExpertSourceFamilyScorecard
} = require('./expert-source-integration');
const {
  buildHostSmokeScorecard,
  loadHostSmokeRunIndex,
  loadHostSmokeInvalidationIndex,
  findLatestHostSmokeEvidence,
  evaluateHostSmokeFreshness
} = require('./skill-system-host-smoke');
const {
  getAutoPromotedRuntimeProofLevel,
  shouldAutoPromoteRuntimeProofLevel,
  getDefaultRuntimeProofLevelForStatus
} = require('./skill-lifecycle-governance');
const {
  buildSystemReadiness,
  writeSystemReadiness,
} = require('./skill-system-readiness');
const {
  buildHostEvolutionReport
} = require('./skill-system-host-evolution');
const {
  writeSkillFrontmatterSchema
} = require('./skill-frontmatter-schema-governance');
const {
  writeFutureRegistrySchemas
} = require('./skill-future-registry-schema-governance');
const {
  writeSkillInvestmentBacklogSchema
} = require('./skill-investment-backlog-schema-governance');
const {
  writeReviewQueueSchema
} = require('./skill-review-queue-schema-governance');
const {
  writeExpertSourceSchemas
} = require('./skill-expert-source-schema-governance');
const {
  writeReadinessSchemas
} = require('./skill-readiness-schema-governance');

const DERIVED_GOVERNANCE_EXPORT_SCHEMA_VERSION = 1;
const DERIVED_GOVERNANCE_FINGERPRINT_SOURCES = getDerivedGovernanceFingerprintSourcePaths();

function stableHash(value) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(value == null ? null : value))
    .digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function parseRequiredGovernanceJson(bundleRoot, artifactId) {
  const artifactPath = getGovernanceArtifactPath(bundleRoot, artifactId);
  const parsed = parseJsonFile(artifactPath);
  if (parsed.error || !parsed.data) {
    throw new Error(`${artifactPath ? rel(bundleRoot, artifactPath) : artifactId} parse failed in governed refresh: ${parsed.error || 'missing data'}`);
  }
  return parsed.data;
}

function collectGovernedSkillRecords(bundleRoot) {
  const findings = [];
  const { skillRecords } = collectSkillRecords(bundleRoot, findings);
  if (findings.some((item) => item.severity === 'error')) {
    throw new Error(`skill record collection failed in governed refresh: ${findings.map((item) => item.message).join('; ')}`);
  }
  return skillRecords;
}

function normalizeRuntimeProofData(runtimeProofData, skillRecords, bundleRoot = null) {
  const nextData = cloneJson(runtimeProofData);
  if (!nextData || !Array.isArray(nextData.proofs)) {
    throw new Error('runtime proof registry is missing proofs');
  }
  const hostSmokeIndex = bundleRoot ? loadHostSmokeRunIndex(bundleRoot) : null;
  if (hostSmokeIndex && !hostSmokeIndex.invalidationIndex) {
    hostSmokeIndex.invalidationIndex = loadHostSmokeInvalidationIndex(bundleRoot);
  }

  for (const proof of nextData.proofs) {
    if (!proof || !proof.skill) {
      continue;
    }
    const record = skillRecords.find((item) => item.name === proof.skill);
    if (!record || record.status !== 'stable') {
      continue;
    }
    if (shouldAutoPromoteRuntimeProofLevel(proof.level, record.status)) {
      proof.level = getAutoPromotedRuntimeProofLevel(proof.level, record.status);
    }
    if (proof.level === 'host-smoked' && proof['host-smoke'] && hostSmokeIndex) {
      const evidence = findLatestHostSmokeEvidence(hostSmokeIndex, proof.skill, proof['host-smoke'], {
        invalidationIndex: hostSmokeIndex.invalidationIndex
      });
      const freshness = evaluateHostSmokeFreshness(evidence.latestPassing, proof['host-smoke']);
      const hostSmokedSatisfied = !!evidence.latestMatching
        && !!evidence.latestPassing
        && evidence.latestMatching.status === 'pass'
        && (!freshness.required || freshness.stale === false);
      if (!hostSmokedSatisfied) {
        proof.level = getDefaultRuntimeProofLevelForStatus(record.status);
      }
    }
  }

  return nextData;
}

function writeJsonFile(targetFile, value) {
  fs.writeFileSync(targetFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function collectDerivedGovernanceError(error, artifactId, artifactPath) {
  return {
    id: artifactId,
    path: artifactPath,
    code: error && error.code ? error.code : 'UNKNOWN',
    message: error && error.message ? error.message : String(error)
  };
}

function buildDerivedGovernanceState(bundleRoot, context = {}) {
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  const skillRecords = Array.isArray(context.skillRecords)
    ? context.skillRecords
    : collectGovernedSkillRecords(bundleRoot);

  const runtimeProofData = normalizeRuntimeProofData(
    context.runtimeProofData || parseRequiredGovernanceJson(bundleRoot, 'runtime-proof'),
    skillRecords,
    bundleRoot
  );
  const registryData = context.registryData || parseRequiredGovernanceJson(bundleRoot, 'registry');
  const ratingsData = cloneJson(
    context.ratingsData || parseRequiredGovernanceJson(bundleRoot, 'capability-ratings')
  );
  applyCapabilityRatingsGovernance(ratingsData, {
    skillRecords,
    registryData,
    bundleRoot
  });

  const reviewQueueData = context.reviewQueueData || buildReviewQueue(bundleRoot, skillRecords, { now });
  const admissionLedgerData = context.admissionLedgerData || parseRequiredGovernanceJson(bundleRoot, 'admission-ledger');
  const evolutionLedgerData = context.evolutionLedgerData || parseRequiredGovernanceJson(bundleRoot, 'evolution-ledger');
  const opportunityQueueData = context.opportunityQueueData || parseRequiredGovernanceJson(bundleRoot, 'skill-opportunity-queue');
  const pendingScaffoldData = context.pendingScaffoldData || parseRequiredGovernanceJson(bundleRoot, 'pending-scaffolds');
  const routeFixturesData = context.routeFixturesData || parseRequiredGovernanceJson(bundleRoot, 'route-fixtures');
  const expertSourceFamilyScorecardData = context.expertSourceFamilyScorecardData || buildExpertSourceFamilyScorecard(bundleRoot, registryData, { now });
  const hostSmokeScorecardData = context.hostSmokeScorecardData || buildHostSmokeScorecard(
    bundleRoot,
    runtimeProofData.proofs.filter((proof) => proof && proof['host-smoke']),
    { now }
  );
  const backlogData = context.backlogData || buildSkillInvestmentBacklog(bundleRoot, {
    skillRecords,
    registryData,
    ratingsData,
    reviewQueueData,
    admissionLedgerData,
    evolutionLedgerData,
    opportunityQueueData,
    pendingScaffoldData,
    routeFixturesData,
    runtimeProofData,
    hostSmokeScorecardData
  });

  const readinessContext = {
    now,
    skillRecords,
    runtimeProofs: runtimeProofData.proofs,
    routeFixtures: Array.isArray(routeFixturesData.cases) ? routeFixturesData.cases : [],
    reviewQueue: reviewQueueData,
    investmentBacklog: backlogData,
    expertSourceFamilyScorecard: expertSourceFamilyScorecardData,
    hostSmokeScorecard: hostSmokeScorecardData,
    registryData
  };
  const readiness = context.readiness || buildSystemReadiness(bundleRoot, readinessContext);
  const hostEvolutionContext = {
    ...readinessContext,
    readiness,
    pendingScaffoldRegistry: pendingScaffoldData,
    admissionLedger: admissionLedgerData,
    backlog: backlogData
  };
  const hostEvolution = context.hostEvolution || buildHostEvolutionReport(bundleRoot, hostEvolutionContext);

  return {
    now,
    skillRecords,
    runtimeProofData,
    registryData,
    ratingsData,
    reviewQueueData,
    admissionLedgerData,
    evolutionLedgerData,
    opportunityQueueData,
    pendingScaffoldData,
    routeFixturesData,
    expertSourceFamilyScorecardData,
    hostSmokeScorecardData,
    backlogData,
    readinessContext,
    hostEvolutionContext,
    readiness,
    hostEvolution
  };
}

function refreshDerivedGovernanceArtifacts(bundleRoot, context = {}) {
  const state = buildDerivedGovernanceState(bundleRoot, context);
  const files = [];
  const errors = [];
  const bestEffort = context.bestEffort === true;

  function writeArtifact(artifactId, artifactPath, writer) {
    try {
      writer();
      files.push({ id: artifactId, path: artifactPath });
      return true;
    } catch (error) {
      if (!bestEffort) {
        throw error;
      }
      errors.push(collectDerivedGovernanceError(error, artifactId, artifactPath));
      return false;
    }
  }

  let readinessPayload = state.readiness;
  let hostEvolutionPayload = state.hostEvolution;

  const refreshHandlers = {
    'runtime-proof': () => {
      const runtimeProofPath = getGovernanceArtifactPath(bundleRoot, 'runtime-proof');
      writeArtifact('runtime-proof', runtimeProofPath, () => {
        writeJsonFile(runtimeProofPath, state.runtimeProofData);
      });
    },
    'skill-catalog': () => {
      const skillCatalogPath = getGovernanceArtifactPath(bundleRoot, 'skill-catalog');
      writeArtifact('skill-catalog', skillCatalogPath, () => {
        syncSkillCatalog(bundleRoot, state.registryData);
      });
    },
    'authoring-governance-reference': () => {
      const authoringGovernanceReferencePath = getGovernanceArtifactPath(bundleRoot, 'authoring-governance-reference');
      writeArtifact('authoring-governance-reference', authoringGovernanceReferencePath, () => {
        syncAuthoringGovernanceReference(bundleRoot);
      });
    },
    'skill-frontmatter-schema': () => {
      const frontmatterSchemaPath = getGovernanceArtifactPath(bundleRoot, 'skill-frontmatter-schema');
      writeArtifact('skill-frontmatter-schema', frontmatterSchemaPath, () => {
        writeSkillFrontmatterSchema(bundleRoot);
      });
    },
    'future-registry-schemas': () => {
      const schemaResults = writeFutureRegistrySchemas(bundleRoot);
      for (const result of schemaResults) {
        files.push({ id: result.id, path: result.file });
      }
    },
    'skill-investment-backlog-schema': () => {
      const investmentBacklogSchemaPath = getGovernanceArtifactPath(bundleRoot, 'skill-investment-backlog-schema');
      writeArtifact('skill-investment-backlog-schema', investmentBacklogSchemaPath, () => {
        writeSkillInvestmentBacklogSchema(bundleRoot);
      });
    },
    'readiness-schemas': () => {
      const schemaResults = writeReadinessSchemas(bundleRoot);
      for (const result of schemaResults) {
        files.push({ id: result.id, path: result.file });
      }
    },
    'review-queue-schema': () => {
      const reviewQueueSchemaPath = getGovernanceArtifactPath(bundleRoot, 'review-queue-schema');
      writeArtifact('review-queue-schema', reviewQueueSchemaPath, () => {
        writeReviewQueueSchema(bundleRoot);
      });
    },
    'capability-ratings-schema': () => {
      const capabilityRatingsSchemaPath = getGovernanceArtifactPath(bundleRoot, 'capability-ratings-schema');
      writeArtifact('capability-ratings-schema', capabilityRatingsSchemaPath, () => {
        writeCapabilityRatingsSchema(bundleRoot);
      });
    },
    'expert-source-schemas': () => {
      const schemaResults = writeExpertSourceSchemas(bundleRoot);
      for (const result of schemaResults) {
        files.push({ id: result.id, path: result.file });
      }
    },
    'review-queue': () => {
      const reviewQueuePath = getGovernanceArtifactPath(bundleRoot, 'review-queue');
      writeArtifact('review-queue', reviewQueuePath, () => {
        writeJsonFile(reviewQueuePath, state.reviewQueueData);
      });
    },
    'capability-ratings': () => {
      const capabilityRatingsPath = getGovernanceArtifactPath(bundleRoot, 'capability-ratings');
      writeArtifact('capability-ratings', capabilityRatingsPath, () => {
        writeJsonFile(capabilityRatingsPath, state.ratingsData);
      });
      const capabilityRatingsDocPath = getCapabilityRatingsDocPath(bundleRoot);
      writeArtifact('capability-ratings-doc', capabilityRatingsDocPath, () => {
        syncCapabilityRatingsDoc(bundleRoot, state.ratingsData);
      });
    },
    'expert-source-family-scorecard': () => {
      const expertSourceFamilyScorecardPath = getGovernanceArtifactPath(bundleRoot, 'expert-source-family-scorecard');
      writeArtifact('expert-source-family-scorecard', expertSourceFamilyScorecardPath, () => {
        writeJsonFile(expertSourceFamilyScorecardPath, state.expertSourceFamilyScorecardData);
      });
    },
    'host-smoke-scorecard': () => {
      const hostSmokeScorecardPath = getGovernanceArtifactPath(bundleRoot, 'host-smoke-scorecard');
      writeArtifact('host-smoke-scorecard', hostSmokeScorecardPath, () => {
        writeJsonFile(hostSmokeScorecardPath, state.hostSmokeScorecardData);
      });
    },
    'skill-investment-backlog': () => {
      const backlogResult = writeSkillInvestmentBacklog(bundleRoot, {
        skillRecords: state.skillRecords,
        registryData: state.registryData,
        ratingsData: state.ratingsData,
        reviewQueueData: state.reviewQueueData,
        admissionLedgerData: state.admissionLedgerData,
        evolutionLedgerData: state.evolutionLedgerData,
        opportunityQueueData: state.opportunityQueueData,
        pendingScaffoldData: state.pendingScaffoldData,
        routeFixturesData: state.routeFixturesData,
        runtimeProofData: state.runtimeProofData,
        hostSmokeScorecardData: state.hostSmokeScorecardData,
        now: state.now
      });
      files.push({ id: 'skill-investment-backlog', path: backlogResult.file });
      files.push({ id: 'skill-investment-backlog-doc', path: backlogResult.docFile });
    },
    'system-readiness': () => {
      writeArtifact('system-readiness', getGovernanceArtifactPath(bundleRoot, 'system-readiness'), () => {
        const readinessResult = writeSystemReadiness(bundleRoot, {
          ...state.readinessContext,
          pendingScaffoldRegistry: state.pendingScaffoldData,
          admissionLedger: state.admissionLedgerData,
          backlog: state.backlogData
        });
        readinessPayload = readinessResult.payload;
        hostEvolutionPayload = readinessResult.hostEvolution.payload;
        files.push({ id: 'system-readiness', path: readinessResult.file });
        files.push({ id: 'host-evolution', path: readinessResult.hostEvolution.file });
      });
    }
  };

  for (const stepId of DERIVED_GOVERNANCE_REFRESH_STEP_ORDER) {
    const handler = refreshHandlers[stepId];
    if (typeof handler !== 'function') {
      throw new Error(`missing derived-governance refresh handler for step '${stepId}'`);
    }
    handler();
  }

  return {
    ...state,
    readiness: readinessPayload,
    hostEvolution: hostEvolutionPayload,
    files,
    errors
  };
}

function buildDerivedGovernanceFingerprint(bundleRoot) {
  const sourceHashes = {};
  const combined = crypto.createHash('sha1');

  for (const relativePath of DERIVED_GOVERNANCE_FINGERPRINT_SOURCES) {
    const absolutePath = path.join(bundleRoot, relativePath);
    const parsed = parseJsonFile(absolutePath);
    const normalized = parsed.error
      ? { '__parse-error': parsed.error }
      : (parsed.data == null ? null : parsed.data);
    const hash = stableHash(normalized);
    sourceHashes[relativePath] = hash;
    combined.update(relativePath);
    combined.update(':');
    combined.update(hash);
    combined.update('\n');
  }

  return {
    'source-count': DERIVED_GOVERNANCE_FINGERPRINT_SOURCES.length,
    'combined-hash': combined.digest('hex'),
    sources: sourceHashes
  };
}

function buildDerivedGovernanceExport(bundleRoot, context = {}) {
  const state = context.state || buildDerivedGovernanceState(bundleRoot, context);
  const now = Number.isFinite(context.now) ? context.now : state.now;
  const readiness = context.readiness || state.readiness;
  const hostEvolution = context.hostEvolution || state.hostEvolution;
  const fingerprint = buildDerivedGovernanceFingerprint(bundleRoot);
  const exportArtifacts = getDerivedGovernanceExportArtifacts(bundleRoot);
  const derivedArtifactLabels = exportArtifacts.map((item) => item.relativePath).join(' and ');

  const manifest = {
    'schema-version': DERIVED_GOVERNANCE_EXPORT_SCHEMA_VERSION,
    artifact: DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
    'generated-at': new Date(now).toISOString(),
    'bundle-root': path.basename(bundleRoot),
    sources: {
      ...DERIVED_GOVERNANCE_ARTIFACT_PATHS
    },
    fingerprint,
    diagnosis: {
      status: hostEvolution.status,
      capabilities: hostEvolution.capabilities,
      summary: hostEvolution.summary,
      'active-constraints': hostEvolution['active-constraints']
    },
    recovery: {
      'distribution-scope': 'Copy the exported benchmark subtree back into the same blocked bundle snapshot through a writable distribution or install path.',
      warning: 'These derived artifacts are host-specific because host writeability and host-evolution state are part of the payload.',
      'target-runtime-follow-up': [
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js diagnose-host-evolution',
        'npm run verify:skill-system'
      ]
    },
    notes: [
      `Use this export when the current runtime can compute derived governance artifacts but cannot rewrite ${derivedArtifactLabels} in place.`,
      'Do not validate this export against an unrelated writable host, because host-specific writeability signals will differ.',
      'Treat the fingerprint as the guardrail that the export came from the same source bundle snapshot that the distribution path will update.'
    ]
  };

  const exportPayloadByArtifact = {
    'system-readiness': readiness,
    'host-evolution': hostEvolution
  };

  return {
    manifest,
    files: [
      {
        path: 'manifest.json',
        content: `${JSON.stringify(manifest, null, 2)}\n`
      },
      ...exportArtifacts.map((artifact) => ({
        path: artifact.relativePath,
        content: `${JSON.stringify(exportPayloadByArtifact[artifact.id], null, 2)}\n`
      }))
    ]
  };
}

function writeDerivedGovernanceExport(outputDir, bundleRoot, context = {}) {
  const payload = buildDerivedGovernanceExport(bundleRoot, context);
  const resolvedOutputDir = path.resolve(outputDir);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  for (const file of payload.files) {
    const targetFile = path.join(resolvedOutputDir, file.path);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, file.content, 'utf8');
  }

  return {
    directory: resolvedOutputDir,
    manifestPath: path.join(resolvedOutputDir, 'manifest.json'),
    bundleRoot,
    payload: payload.manifest,
    files: payload.files.map((file) => ({
      path: file.path
    }))
  };
}

function readDerivedGovernanceExport(exportDirOrManifestFile) {
  const resolved = path.resolve(exportDirOrManifestFile);
  const manifestPath = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
    ? path.join(resolved, 'manifest.json')
    : resolved;
  const parsed = parseJsonFile(manifestPath);
  if (parsed.error || !parsed.data) {
    throw new Error(`derived governance export parse failed: ${parsed.error || 'missing manifest data'}`);
  }

  return {
    manifestPath,
    directory: path.dirname(manifestPath),
    payload: parsed.data
  };
}

function listDerivedGovernanceExports(searchRoots = []) {
  const candidates = [];
  const visited = new Set();

  for (const root of Array.isArray(searchRoots) ? searchRoots : []) {
    const resolvedRoot = path.resolve(root);
    if (visited.has(resolvedRoot) || !fs.existsSync(resolvedRoot)) {
      continue;
    }
    visited.add(resolvedRoot);

    const rootStat = fs.statSync(resolvedRoot);
    const manifestCandidates = [];
    if (rootStat.isDirectory() && fs.existsSync(path.join(resolvedRoot, 'manifest.json'))) {
      manifestCandidates.push(path.join(resolvedRoot, 'manifest.json'));
    } else if (rootStat.isFile() && path.basename(resolvedRoot) === 'manifest.json') {
      manifestCandidates.push(resolvedRoot);
    } else if (rootStat.isDirectory()) {
      for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const manifestPath = path.join(resolvedRoot, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          manifestCandidates.push(manifestPath);
        }
      }
    }

    for (const manifestPath of manifestCandidates) {
      const parsed = parseJsonFile(manifestPath);
      const payload = parsed.error ? null : parsed.data;
      if (!payload || payload.artifact !== DERIVED_GOVERNANCE_EXPORT_ARTIFACT) {
        continue;
      }
      const generatedAt = new Date(String(payload['generated-at'] || '').trim());
      const generatedAtMs = Number.isNaN(generatedAt.getTime()) ? 0 : generatedAt.getTime();
      const stat = fs.statSync(manifestPath);
      candidates.push({
        directory: path.dirname(manifestPath),
        manifestPath,
        payload,
        'generated-at-ms': generatedAtMs,
        'manifest-mtime-ms': Number(stat.mtimeMs || 0)
      });
    }
  }

  candidates.sort((left, right) => {
    if (right['generated-at-ms'] !== left['generated-at-ms']) {
      return right['generated-at-ms'] - left['generated-at-ms'];
    }
    if (right['manifest-mtime-ms'] !== left['manifest-mtime-ms']) {
      return right['manifest-mtime-ms'] - left['manifest-mtime-ms'];
    }
    return right.directory.localeCompare(left.directory);
  });

  return candidates;
}

function findLatestDerivedGovernanceExport(searchRoots = [], options = {}) {
  const fingerprintCombinedHash = String(options.fingerprintCombinedHash || '').trim();
  const bundleRootName = String(options.bundleRootName || '').trim();
  const candidates = listDerivedGovernanceExports(searchRoots);

  for (const candidate of candidates) {
    if (bundleRootName && String(candidate.payload && candidate.payload['bundle-root'] || '').trim() !== bundleRootName) {
      continue;
    }
    if (fingerprintCombinedHash) {
      const candidateHash = String(candidate.payload && candidate.payload.fingerprint && candidate.payload.fingerprint['combined-hash'] || '').trim();
      if (candidateHash !== fingerprintCombinedHash) {
        continue;
      }
    }
    return candidate;
  }

  return null;
}

function describeDerivedGovernanceExport(baseDir, exportMeta) {
  return {
    directory: rel(baseDir, exportMeta.directory),
    manifest: rel(baseDir, exportMeta.manifestPath),
    files: exportMeta.files.map((item) => item.path)
  };
}

module.exports = {
  DERIVED_GOVERNANCE_EXPORT_SCHEMA_VERSION,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT,
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_ARTIFACT_PATHS,
  buildDerivedGovernanceState,
  refreshDerivedGovernanceArtifacts,
  buildDerivedGovernanceFingerprint,
  buildDerivedGovernanceExport,
  writeDerivedGovernanceExport,
  readDerivedGovernanceExport,
  listDerivedGovernanceExports,
  findLatestDerivedGovernanceExport,
  describeDerivedGovernanceExport
};
