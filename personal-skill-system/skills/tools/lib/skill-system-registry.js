'use strict';

const fs = require('fs');
const path = require('path');
const { parseJsonFile, rel, validateSmokeManifest, probeArtifactWriteAccess } = require('./skill-system-common');
const {
  loadHostSmokeRunIndex,
  loadHostSmokeInvalidationIndex,
  findLatestHostSmokeEvidence,
  evaluateHostSmokeFreshness,
  normalizeHostSmokeContract: normalizeIndexedHostSmokeContract,
  getHostSmokeScorecardPath,
  buildHostSmokeScorecard,
  buildHostSmokeInvalidationLedger,
  getHostSmokeInvalidationPath
} = require('./skill-system-host-smoke');
const { validateRouteMap, validateRouteFixtures, validateGovernedRouteFixtures, validateStableRouteEvidence } = require('./skill-system-routing');
const {
  validateBenchmarkSummary,
  validateSystemReadiness
} = require('./skill-system-readiness');
const {
  isGovernedRuntimeProofRecord,
  normalizeHostSmokePolicy,
  hostSmokePoliciesEqual
} = require('./skill-system-governance');

function validateRegistryEntries(targetDir, registryPath, registryData, skillRecords, findings) {
  const registrySkills = Array.isArray(registryData && registryData.skills) ? registryData.skills : [];
  const registryNames = new Set();

  for (const entry of registrySkills) {
    registryNames.add(entry.name);
    if (!entry.path || !fs.existsSync(path.join(targetDir, entry.path))) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `registry points to missing skill path for '${entry.name}'` });
    }
  }

  for (const record of skillRecords) {
    if (!registryNames.has(record.name)) {
      findings.push({ severity: 'error', file: record.file, message: `skill '${record.name}' is missing from registry.generated.json` });
    }
  }

  return {
    registrySkills,
    registryNames
  };
}

function validateAdmissionLedger(targetDir, skillRecords, findings) {
  const ledgerPath = path.join(targetDir, 'registry', 'admission-ledger.generated.json');
  const parsed = parseJsonFile(ledgerPath);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, ledgerPath),
      message: `admission ledger parse failed: ${parsed.error}`
    });
    return { entries: [] };
  }

  const data = parsed.data || {};
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const requestIds = new Set();
  const skillNames = new Set((Array.isArray(skillRecords) ? skillRecords : []).map((record) => record.name));

  if (data['schema-version'] !== 1) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, ledgerPath),
      message: `admission ledger has unsupported schema-version '${data['schema-version']}'`
    });
  }

  for (const entry of entries) {
    const requestId = String(entry && entry['request-id'] || '').trim();
    const request = String(entry && entry.request || '').trim();
    const recordedAt = String(entry && entry['recorded-at'] || '').trim();
    const decisionAction = String(entry && entry.decision && entry.decision.action || '').trim();
    const status = String(entry && entry.status || '').trim();

    if (!requestId) {
      findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: 'admission ledger entry is missing request-id' });
      continue;
    }
    if (requestIds.has(requestId)) {
      findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `admission ledger duplicates request-id '${requestId}'` });
      continue;
    }
    requestIds.add(requestId);

    if (!request) {
      findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `admission ledger entry '${requestId}' is missing request text` });
    }
    if (!decisionAction) {
      findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `admission ledger entry '${requestId}' is missing decision.action` });
    }
    if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
      findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `admission ledger entry '${requestId}' has invalid recorded-at` });
    }
    if (entry && entry['resolved-at'] && Number.isNaN(Date.parse(String(entry['resolved-at'])))) {
      findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `admission ledger entry '${requestId}' has invalid resolved-at` });
    }
    if (status === 'implemented') {
      const createdSkill = String(entry && entry['created-skill'] || '').trim();
      if (!createdSkill) {
        findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `implemented admission ledger entry '${requestId}' is missing created-skill` });
      } else if (!skillNames.has(createdSkill)) {
        findings.push({ severity: 'error', file: rel(targetDir, ledgerPath), message: `implemented admission ledger entry '${requestId}' references unknown created-skill '${createdSkill}'` });
      }
    }
    if (decisionAction === 'create-new-skill' && status === 'open') {
      findings.push({ severity: 'warning', file: rel(targetDir, ledgerPath), message: `admission request '${requestId}' still recommends creating a new skill and remains open` });
    }
  }

  return { entries };
}

function validateModuleGroups(targetDir, registryPath, registryData, registryNames, findings) {
  const moduleGroups = Array.isArray(registryData && registryData['module-groups']) ? registryData['module-groups'] : [];
  const moduleNames = new Set();

  for (const group of moduleGroups) {
    if (!registryNames.has(group['host-skill'])) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `module group references unknown host skill '${group['host-skill']}'` });
      continue;
    }
    const modules = Array.isArray(group.modules) ? group.modules : [];
    for (const module of modules) {
      if (moduleNames.has(module.id)) {
        findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `duplicate capability module id '${module.id}'` });
        continue;
      }
      moduleNames.add(module.id);
      if (!module.path || !fs.existsSync(path.join(targetDir, module.path))) {
        findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `capability module '${module.id}' points to a missing file` });
      }
    }
  }

  return {
    moduleGroups,
    moduleNames
  };
}

function validateCapabilityRatings(targetDir, skillRecords, moduleNames, findings) {
  const ratingsPath = path.join(targetDir, 'registry', 'capability-ratings.generated.json');
  const ratings = parseJsonFile(ratingsPath);
  if (ratings.error) {
    findings.push({ severity: 'warning', file: rel(targetDir, ratingsPath), message: `capability ratings parse failed: ${ratings.error}` });
    return { ratingsPath, ratedModules: new Set(), moduleRatingsBySkill: new Map() };
  }

  const data = ratings.data || {};
  const buckets = data['rating-buckets'] || {};
  const ratedModules = new Set();
  const moduleRatingsBySkill = new Map();
  const moduleGroups = new Map(
    (Array.isArray(parseJsonFile(path.join(targetDir, 'registry', 'registry.generated.json')).data?.['module-groups'])
      ? parseJsonFile(path.join(targetDir, 'registry', 'registry.generated.json')).data['module-groups']
      : []
    ).map((group) => [
      String(group && group['host-skill'] || '').trim(),
      Array.isArray(group && group.modules)
        ? group.modules
            .map((module) => String(module && module.id || '').trim())
            .filter(Boolean)
        : []
    ])
  );
  for (const bucketName of ['top-ready', 'strong-but-not-top', 'thin']) {
    for (const moduleId of Array.isArray(buckets[bucketName]) ? buckets[bucketName] : []) {
      if (ratedModules.has(moduleId)) {
        findings.push({ severity: 'error', file: rel(targetDir, ratingsPath), message: `capability module '${moduleId}' is duplicated across rating buckets` });
        continue;
      }
      ratedModules.add(moduleId);
      if (!moduleNames.has(moduleId)) {
        findings.push({ severity: 'error', file: rel(targetDir, ratingsPath), message: `capability ratings reference unknown module '${moduleId}'` });
      }
    }
  }

  for (const record of skillRecords.filter((item) => item.status === 'stable')) {
    const ownedModules = moduleGroups.get(record.name) || [];
    if (ownedModules.length < 1) {
      continue;
    }
    const nonTopModules = ownedModules
      .map((moduleId) => {
        if ((Array.isArray(buckets['top-ready']) ? buckets['top-ready'] : []).includes(moduleId)) {
          return { module: moduleId, rating: 'top-ready' };
        }
        if ((Array.isArray(buckets['strong-but-not-top']) ? buckets['strong-but-not-top'] : []).includes(moduleId)) {
          return { module: moduleId, rating: 'strong-but-not-top' };
        }
        if ((Array.isArray(buckets.thin) ? buckets.thin : []).includes(moduleId)) {
          return { module: moduleId, rating: 'thin' };
        }
        return { module: moduleId, rating: 'unrated' };
      })
      .filter((item) => item.rating !== 'top-ready');

    moduleRatingsBySkill.set(record.name, ownedModules);

    if (nonTopModules.length > 0) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `stable skill '${record.name}' has non-top-ready capability modules: ${nonTopModules.map((item) => `${item.module} (${item.rating})`).join(', ')}`
      });
    }
  }

  for (const moduleId of moduleNames) {
    if (!ratedModules.has(moduleId)) {
      findings.push({ severity: 'warning', file: rel(targetDir, ratingsPath), message: `capability module '${moduleId}' is missing from capability ratings` });
    }
  }

  const counts = data.counts || {};
  if (Number(counts.total || 0) !== ratedModules.size) {
    findings.push({ severity: 'warning', file: rel(targetDir, ratingsPath), message: `capability ratings total (${counts.total || 0}) does not match rated module count (${ratedModules.size})` });
  }

  validateSkillLevelSummary(targetDir, ratingsPath, data, skillRecords, findings);
  validateCapabilityNextBatch(targetDir, ratingsPath, data, moduleNames, findings);
  validateCapabilityRatingsDoc(targetDir, ratingsPath, data, findings);

  return {
    ratingsPath,
    ratedModules,
    moduleRatingsBySkill
  };
}

function validateSkillLevelSummary(targetDir, ratingsPath, ratingsData, skillRecords, findings) {
  const summary = ratingsData['skill-level-summary'];
  if (!summary) {
    findings.push({ severity: 'warning', file: rel(targetDir, ratingsPath), message: 'capability ratings are missing skill-level-summary' });
    return;
  }

  const activeSkills = skillRecords.filter((record) => record.status !== 'archived' && record.kind !== 'adapter');
  const activeNames = new Set(activeSkills.map((record) => record.name));
  const bucketNames = [
    'top-level-enough-now',
    'strong-uplift-but-not-top-yet',
    'useful-overlay-not-top-level-alone',
  ];
  const seen = new Map();
  const membership = new Map();

  for (const bucketName of bucketNames) {
    const values = Array.isArray(summary[bucketName]) ? summary[bucketName] : [];
    for (const skillName of values) {
      if (seen.has(skillName)) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, ratingsPath),
          message: `skill-level-summary duplicates skill '${skillName}' in '${bucketName}' and '${seen.get(skillName)}'`
        });
        continue;
      }
      seen.set(skillName, bucketName);
      membership.set(skillName, bucketName);
      if (!activeNames.has(skillName)) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, ratingsPath),
          message: `skill-level-summary references unknown or archived skill '${skillName}'`
        });
      }
    }
  }

  for (const record of activeSkills) {
    if (!membership.has(record.name)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `active skill '${record.name}' is missing from skill-level-summary`
      });
      continue;
    }
    if (record.status === 'stable' && membership.get(record.name) !== 'top-level-enough-now') {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `stable skill '${record.name}' must be rated in 'top-level-enough-now'`
      });
    }
  }

  if (summary.source) {
    const sourcePath = path.join(targetDir, summary.source);
    if (!fs.existsSync(sourcePath)) {
      findings.push({
        severity: 'warning',
        file: rel(targetDir, ratingsPath),
        message: `skill-level-summary source '${summary.source}' does not exist`
      });
    }
  }

  const countFields = summary.counts || {};
  for (const bucketName of bucketNames) {
    const values = Array.isArray(summary[bucketName]) ? summary[bucketName] : [];
    const declared = Number(countFields[bucketName] || 0);
    if (declared !== values.length) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `skill-level-summary count for '${bucketName}' is ${declared}, expected ${values.length}`
      });
    }
  }

  const declaredTotal = Number(countFields['total-skills-rated'] || 0);
  if (declaredTotal !== activeSkills.length) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, ratingsPath),
      message: `skill-level-summary total (${declaredTotal}) does not match active skill count (${activeSkills.length})`
    });
  }
}

function extractDocCount(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`- ${escaped}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function extractMarkdownSectionLines(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`## ${escaped}\\n\\n([\\s\\S]*?)(?=\\n## |\\s*$)`));
  if (!match) {
    return null;
  }
  return match[1]
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function validateCapabilityNextBatch(targetDir, ratingsPath, ratingsData, moduleNames, findings) {
  const buckets = ratingsData['rating-buckets'] || {};
  const nextBatch = Array.isArray(ratingsData['next-batch']) ? ratingsData['next-batch'] : [];
  const expectedModuleIds = new Set([
    ...(Array.isArray(buckets['thin']) ? buckets['thin'] : []),
    ...(Array.isArray(buckets['strong-but-not-top']) ? buckets['strong-but-not-top'] : [])
  ]);
  const seenModules = new Set();

  for (const entry of nextBatch) {
    const moduleId = String(entry && entry.module || '').trim();
    if (!moduleId) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: 'capability next-batch entry is missing module id'
      });
      continue;
    }
    if (seenModules.has(moduleId)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `capability next-batch duplicates module '${moduleId}'`
      });
      continue;
    }
    seenModules.add(moduleId);

    if (!moduleNames.has(moduleId)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `capability next-batch references unknown module '${moduleId}'`
      });
    }

    if (!expectedModuleIds.has(moduleId)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `capability next-batch should only include thin or strong-but-not-top modules, but '${moduleId}' is not in an upgrade bucket`
      });
    }
  }

  for (const moduleId of expectedModuleIds) {
    if (!seenModules.has(moduleId)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, ratingsPath),
        message: `capability next-batch is missing upgrade candidate '${moduleId}'`
      });
    }
  }
}

function validateCapabilityRatingsDoc(targetDir, ratingsPath, ratingsData, findings) {
  const docPath = path.join(targetDir, 'docs', 'CAPABILITY_MODULE_RATINGS.md');
  if (!fs.existsSync(docPath)) {
    findings.push({ severity: 'warning', file: rel(targetDir, ratingsPath), message: 'CAPABILITY_MODULE_RATINGS.md is missing' });
    return;
  }

  const text = fs.readFileSync(docPath, 'utf8');
  const counts = ratingsData.counts || {};
  const skillSummary = ratingsData['skill-level-summary'] || {};
  const skillCounts = skillSummary.counts || {};
  const checks = [
    ['TOP-ready modules', Number(counts['top-ready'] || 0)],
    ['strong-but-not-top modules', Number(counts['strong-but-not-top'] || 0)],
    ['thin modules', Number(counts.thin || 0)],
    ['total rated capability modules', Number(counts.total || 0)],
    ['top-level enough now', Number(skillCounts['top-level-enough-now'] || 0)],
    ['strong uplift, but not top yet', Number(skillCounts['strong-uplift-but-not-top-yet'] || 0)],
    ['useful overlay, not top-level alone', Number(skillCounts['useful-overlay-not-top-level-alone'] || 0)],
  ];

  for (const [label, expected] of checks) {
    const actual = extractDocCount(text, label);
    if (actual == null) {
      findings.push({
        severity: 'warning',
        file: rel(targetDir, docPath),
        message: `ratings doc is missing summary line '${label}'`
      });
      continue;
    }
    if (actual !== expected) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, docPath),
        message: `ratings doc says '${label}: ${actual}' but generated data says '${expected}'`
      });
    }
  }

  const nextBatchLines = extractMarkdownSectionLines(text, 'Next Batch');
  if (!nextBatchLines) {
    findings.push({
      severity: 'warning',
      file: rel(targetDir, docPath),
      message: "ratings doc is missing 'Next Batch' section"
    });
  } else {
    const generatedNextBatch = Array.isArray(ratingsData['next-batch']) ? ratingsData['next-batch'] : [];
    const expectedNextBatchLines = generatedNextBatch.length < 1
      ? ['- `(none; the current bundle is fully promoted in this snapshot)`']
      : generatedNextBatch.map((entry) => {
          const moduleId = String(entry && entry.module || '').trim() || 'unknown-module';
          const hostSkill = String(entry && entry['host-skill'] || '').trim() || 'unknown-skill';
          const rating = String(entry && entry.rating || '').trim() || 'unknown-rating';
          const nextStep = String(entry && entry['next-step'] || '').trim() || 'fill in the next promotion step';
          return `- \`${moduleId}\` (\`${hostSkill}\`, \`${rating}\`): ${nextStep}`;
        });
    if (JSON.stringify(nextBatchLines) !== JSON.stringify(expectedNextBatchLines)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, docPath),
        message: "ratings doc 'Next Batch' section is out of sync with capability-ratings.generated.json"
      });
    }
  }
}

function parseTestIdentifier(testId) {
  const value = String(testId || '').trim();
  const marker = '.test.js::';
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return {
    file: value.slice(0, idx + marker.length - 2),
    testName: value.slice(idx + marker.length)
  };
}

function normalizeHostSmokeCommands(commands) {
  return (Array.isArray(commands) ? commands : []).map((command) => ({
    ...(command && command.cwd ? { cwd: command.cwd } : {}),
    argv: Array.isArray(command && command.argv) ? [...command.argv] : [],
    expect: command && typeof command.expect === 'object' && !Array.isArray(command.expect) ? { ...command.expect } : {},
    ...(command && command['timeout-ms'] !== undefined ? { 'timeout-ms': command['timeout-ms'] } : {})
  }));
}

function normalizeHostSmokeContract(hostSmoke) {
  if (!hostSmoke || typeof hostSmoke !== 'object' || Array.isArray(hostSmoke)) {
    return null;
  }
  const freshness = hostSmoke.freshness && typeof hostSmoke.freshness === 'object' && !Array.isArray(hostSmoke.freshness)
    ? {
        'max-age': hostSmoke.freshness['max-age'],
        unit: hostSmoke.freshness.unit
      }
    : null;
  return {
    manifest: String(hostSmoke.manifest || '').trim(),
    ...(freshness ? { freshness } : {}),
    commands: normalizeHostSmokeCommands(hostSmoke.commands)
  };
}

function validateRuntimeHostSmokeEvidence(targetDir, registryPath, proof, findings, hostSmokeIndex) {
  const skillName = String(proof && proof.skill || '').trim();
  const hostSmoke = normalizeIndexedHostSmokeContract(proof && proof['host-smoke']);
  if (!skillName || !hostSmoke) {
    return;
  }

  const evidence = findLatestHostSmokeEvidence(hostSmokeIndex, skillName, hostSmoke, {
    invalidationIndex: hostSmokeIndex.invalidationIndex
  });
  if (proof.level === 'host-smoked') {
    if (!evidence.latestMatching) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' is marked 'host-smoked' but no matching runtime host-smoke artifact exists`
      });
      return;
    }

    if (!evidence.latestPassing) {
      findings.push({
        severity: 'error',
        file: evidence.latestMatching.file,
        message: `runtime proof entry for '${skillName}' is marked 'host-smoked' but the latest matching runtime host-smoke artifact did not pass`
      });
      return;
    }

    const freshness = evaluateHostSmokeFreshness(evidence.latestPassing, hostSmoke);
    if (freshness.required && freshness.stale) {
      findings.push({
        severity: 'error',
        file: evidence.latestPassing.file,
        message: `runtime proof entry for '${skillName}' is marked 'host-smoked' but the latest passing runtime host-smoke artifact is older than the declared freshness window`
      });
      return;
    }
  }

  if (evidence.latestAny && !evidence.latestMatching) {
    findings.push({
      severity: 'info',
      file: evidence.latestAny.file,
      message: `runtime host-smoke artifacts exist for '${skillName}' but do not match the current host-smoke contract`
    });
  }
}

function validateRuntimeProofRegistry(targetDir, skillRecords, findings) {
  const registryPath = path.join(targetDir, 'registry', 'runtime-proof.generated.json');
  const schemaPath = path.join(targetDir, 'registry', 'runtime-proof.schema.json');
  const runtimeProof = parseJsonFile(registryPath);
  const schema = parseJsonFile(schemaPath);
  const hostSmokeIndex = loadHostSmokeRunIndex(targetDir);
  hostSmokeIndex.invalidationIndex = loadHostSmokeInvalidationIndex(targetDir);

  if (schema.error) {
    findings.push({ severity: 'error', file: rel(targetDir, schemaPath), message: `runtime proof schema parse failed: ${schema.error}` });
  }
  if (runtimeProof.error) {
    findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `runtime proof registry parse failed: ${runtimeProof.error}` });
    return { proofs: [], registeredSkills: new Set() };
  }

  const schemaData = schema.data || {};
  const registryData = runtimeProof.data || {};
  const proofs = Array.isArray(registryData.proofs) ? registryData.proofs : [];
  const governedRuntimeProofRecords = skillRecords.filter((record) => isGovernedRuntimeProofRecord(record));
  const stableScriptedRecords = governedRuntimeProofRecords.filter((record) => record.status === 'stable');
  const stableScriptedNames = new Set(stableScriptedRecords.map((record) => record.name));
  const governedRuntimeProofNames = new Set(governedRuntimeProofRecords.map((record) => record.name));
  const knownKinds = new Set(['tool', 'guard']);
  const knownLevels = new Set(['declared-only', 'declared-and-tested', 'host-smoked']);
  const registeredSkills = new Set();
  const allowKinds = new Set(((((schemaData.properties || {}).proofs || {}).items || {}).properties || {}).kind?.enum || []);
  const allowLevels = new Set(((((schemaData.properties || {}).proofs || {}).items || {}).properties || {}).level?.enum || []);

  for (const error of hostSmokeIndex.errors) {
    findings.push({
      severity: 'warning',
      file: error.file,
      message: `runtime host-smoke artifact issue: ${error.message}`
    });
  }

  if (registryData['schema-version'] !== 1) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, registryPath),
      message: `runtime proof registry has unsupported schema-version '${registryData['schema-version']}'`
    });
  }

  for (const proof of proofs) {
    const skillName = String(proof && proof.skill || '').trim();
    if (!skillName) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: 'runtime proof entry is missing skill name' });
      continue;
    }

    if (registeredSkills.has(skillName)) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `runtime proof registry duplicates skill '${skillName}'` });
      continue;
    }
    registeredSkills.add(skillName);

    const record = skillRecords.find((item) => item.name === skillName);
    if (!record) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `runtime proof registry references unknown skill '${skillName}'` });
      continue;
    }

    if (!isGovernedRuntimeProofRecord(record)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof registry should only contain governed scripted tools and guards, but '${skillName}' is status '${record.status}' with runtime '${record.runtime}'`
      });
    }

    if (!knownKinds.has(proof.kind) || (allowKinds.size > 0 && !allowKinds.has(proof.kind))) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `runtime proof entry for '${skillName}' has invalid kind '${proof.kind}'` });
    }

    if (proof.kind && record.kind && proof.kind !== record.kind) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' declares kind '${proof.kind}' but skill metadata says '${record.kind}'`
      });
    }

    if (!knownLevels.has(proof.level) || (allowLevels.size > 0 && !allowLevels.has(proof.level))) {
      findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `runtime proof entry for '${skillName}' has invalid level '${proof.level}'` });
    }

    const contracts = Array.isArray(proof.contracts) ? proof.contracts : [];
    const evidenceTests = Array.isArray(proof['evidence-tests']) ? proof['evidence-tests'] : [];
    const hostSmoke = normalizeHostSmokeContract(proof['host-smoke']);
    const hostSmokePolicy = normalizeHostSmokePolicy(proof['host-smoke-policy']);
    const expectedHostSmokePolicy = normalizeHostSmokePolicy(record.hostSmokePolicy);
    if (contracts.length < 2) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' should declare at least two contracts`
      });
    }

    if (proof.level !== 'declared-only' && evidenceTests.length < 1) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' should reference at least one evidence test`
      });
    }

    if (!hostSmokePolicy) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' is missing host-smoke-policy metadata`
      });
    } else {
      if (expectedHostSmokePolicy && !hostSmokePoliciesEqual(hostSmokePolicy, expectedHostSmokePolicy)) {
        findings.push({
          severity: 'error',
          file: record.file,
          message: `runtime proof host-smoke policy for '${skillName}' does not match SKILL frontmatter governance metadata`
        });
      }
      if (hostSmokePolicy.tier === 'critical' && hostSmokePolicy['target-level'] !== 'host-smoked') {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof host-smoke policy for '${skillName}' marks the skill critical without targeting 'host-smoked'`
        });
      }
      if (hostSmokePolicy['target-level'] === 'host-smoked' && !Number.isInteger(hostSmokePolicy['freshness-days'])) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof host-smoke policy for '${skillName}' must declare freshness-days when targeting 'host-smoked'`
        });
      }
      if (hostSmokePolicy['target-level'] !== 'host-smoked' && Number.isInteger(hostSmokePolicy['freshness-days'])) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof host-smoke policy for '${skillName}' should not declare freshness-days unless targeting 'host-smoked'`
        });
      }
    }

    if (record.status === 'stable' && proof.level === 'declared-only') {
      findings.push({
        severity: 'warning',
        file: rel(targetDir, registryPath),
        message: `stable scripted skill '${skillName}' is still marked 'declared-only' in runtime-proof.generated.json`
      });
    }

    const normalizedContracts = contracts.map((item) => String(item || '').trim()).filter(Boolean);
    const normalizedSkillContracts = (record.runtimeProofItems || []).map((item) => String(item || '').trim()).filter(Boolean);
    if (normalizedContracts.length && normalizedSkillContracts.length) {
      if (normalizedContracts.length !== normalizedSkillContracts.length ||
        normalizedContracts.some((item, index) => item !== normalizedSkillContracts[index])) {
        findings.push({
          severity: 'error',
          file: record.file,
          message: `runtime proof registry contracts for '${skillName}' do not match the Runtime Proof bullets declared in SKILL.md`
        });
      }
    }

    if (record.status === 'stable' && record.runtime === 'scripted') {
      if (!record.smokeManifest) {
        findings.push({
          severity: 'warning',
          file: record.file,
          message: `stable scripted skill '${skillName}' is missing scripts/smoke.json`
        });
      } else {
        for (const error of validateSmokeManifest(record.smokeManifest)) {
          findings.push({
            severity: 'error',
            file: record.smokeManifestPath,
            message: error
          });
        }
      }
    }

    const normalizedSkillHostSmoke = record.smokeManifest
      ? {
          manifest: record.smokeManifestPath,
          ...(record.smokeManifest.freshness ? { freshness: { ...record.smokeManifest.freshness } } : {}),
          commands: normalizeHostSmokeCommands(record.smokeManifest.commands)
        }
      : null;
    const shouldCarryHostSmokeMetadata = !!normalizedSkillHostSmoke
      && (
        record.status === 'stable'
        || (hostSmokePolicy && hostSmokePolicy['target-level'] !== 'declared-only')
      );

    if (shouldCarryHostSmokeMetadata) {
      if (!hostSmoke) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof entry for '${skillName}' is missing host-smoke metadata`
        });
      } else if (
        hostSmoke.manifest !== normalizedSkillHostSmoke.manifest
        || JSON.stringify(hostSmoke.commands) !== JSON.stringify(normalizedSkillHostSmoke.commands)
      ) {
        findings.push({
          severity: 'error',
          file: record.smokeManifestPath,
          message: `runtime proof host-smoke metadata for '${skillName}' does not match scripts/smoke.json`
        });
      }
    } else if (!normalizedSkillHostSmoke && hostSmoke) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' declares host-smoke metadata but the skill has no scripts/smoke.json`
      });
    }

    if (proof.level === 'host-smoked' && (!hostSmoke || hostSmoke.commands.length < 1)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof entry for '${skillName}' marked 'host-smoked' must declare at least one host-smoke command`
      });
    }

    if (hostSmoke) {
      validateRuntimeHostSmokeEvidence(targetDir, registryPath, proof, findings, hostSmokeIndex);
    }

    for (const testId of evidenceTests) {
      const parsed = parseTestIdentifier(testId);
      if (!parsed) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof evidence test '${testId}' for '${skillName}' must use 'path::test name' format`
        });
        continue;
      }

      const absoluteTestPath = path.resolve(path.resolve(targetDir, '..'), parsed.file);
      if (!fs.existsSync(absoluteTestPath)) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof evidence test '${parsed.file}' for '${skillName}' does not exist`
        });
        continue;
      }

      const testText = fs.readFileSync(absoluteTestPath, 'utf8');
      const escapedName = parsed.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const testPattern = new RegExp(`\\b(?:test|it)\\s*\\(\\s*['"\`]${escapedName}['"\`]`);
      if (!testPattern.test(testText)) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, registryPath),
          message: `runtime proof evidence test '${testId}' for '${skillName}' was not found in the referenced test file`
        });
      }
    }
  }

  for (const record of governedRuntimeProofRecords) {
    if (!registeredSkills.has(record.name)) {
      findings.push({
        severity: 'error',
        file: record.file,
        message: record.status === 'stable'
          ? `stable scripted skill '${record.name}' is missing from runtime-proof.generated.json`
          : `governed scripted skill '${record.name}' is missing from runtime-proof.generated.json`
      });
    }
  }

  for (const skillName of registeredSkills) {
    if (!governedRuntimeProofNames.has(skillName)) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, registryPath),
        message: `runtime proof registry contains '${skillName}' but it is not a current governed scripted skill`
      });
    }
  }

  validateHostSmokeScorecard(targetDir, registryPath, proofs, findings, hostSmokeIndex);
  validateHostSmokeInvalidationLedger(targetDir, findings, hostSmokeIndex);

  return {
    proofs,
    registeredSkills
  };
}

function validateHostSmokeScorecard(targetDir, registryPath, proofs, findings, hostSmokeIndex) {
  const scorecardPath = getHostSmokeScorecardPath(targetDir);
  const parsed = parseJsonFile(scorecardPath);
  const expectedProofs = (Array.isArray(proofs) ? proofs : []).filter((proof) => proof && proof['host-smoke']);

  if (parsed.error) {
    findings.push({
      severity: 'warning',
      file: rel(targetDir, scorecardPath),
      message: `host-smoke scorecard parse failed: ${parsed.error}`
    });
    return;
  }

  const actualGeneratedAt = new Date(String((parsed.data || {})['generated-at'] || '').trim());
  const expectedNow = Number.isNaN(actualGeneratedAt.getTime()) ? Date.now() : actualGeneratedAt.getTime();
  const expected = buildHostSmokeScorecard(targetDir, expectedProofs, { index: hostSmokeIndex, now: expectedNow });
  const actual = parsed.data || {};

  if (actual['schema-version'] !== expected['schema-version']) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, scorecardPath),
      message: `host-smoke scorecard has unsupported schema-version '${actual['schema-version']}'`
    });
  }

  if (actual['source-runtime-proof'] !== expected['source-runtime-proof']) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, scorecardPath),
      message: 'host-smoke scorecard source-runtime-proof does not match the canonical runtime-proof registry path'
    });
  }

  if (actual['runtime-run-dir'] !== expected['runtime-run-dir']) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, scorecardPath),
      message: 'host-smoke scorecard runtime-run-dir does not match the canonical host-smoke runtime-runs path'
    });
  }

  const comparableActual = {
    ...actual,
    'generated-at': expected['generated-at']
  };
  const comparableExpected = {
    ...expected
  };

  if (JSON.stringify(comparableActual) !== JSON.stringify(comparableExpected)) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, scorecardPath),
      message: 'host-smoke scorecard is out of sync with runtime-proof entries or executed runtime host-smoke evidence'
    });
  }
}

function validateHostSmokeInvalidationLedger(targetDir, findings, hostSmokeIndex) {
  const invalidationPath = getHostSmokeInvalidationPath(targetDir);
  const invalidationIndex = hostSmokeIndex && hostSmokeIndex.invalidationIndex
    ? hostSmokeIndex.invalidationIndex
    : loadHostSmokeInvalidationIndex(targetDir);

  for (const error of invalidationIndex.errors || []) {
    findings.push({
      severity: 'error',
      file: String(error.file || '').trim(),
      message: `host-smoke invalidation ledger issue: ${String(error.message || '').trim()}`
    });
  }

  if (!fs.existsSync(invalidationPath)) {
    return;
  }

  const parsed = parseJsonFile(invalidationPath);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, invalidationPath),
      message: `host-smoke invalidation ledger parse failed: ${parsed.error}`
    });
    return;
  }

  const actual = parsed.data || {};
  const actualGeneratedAt = new Date(String(actual['generated-at'] || '').trim());
  const expectedGeneratedAt = Number.isNaN(actualGeneratedAt.getTime())
    ? new Date().toISOString()
    : actualGeneratedAt.toISOString();
  const expected = buildHostSmokeInvalidationLedger(targetDir, invalidationIndex.entries, actualGeneratedAt.getTime());
  const comparableActual = {
    ...actual,
    'generated-at': expectedGeneratedAt
  };
  const comparableExpected = {
    ...expected,
    'generated-at': expectedGeneratedAt
  };

  if (JSON.stringify(comparableActual) !== JSON.stringify(comparableExpected)) {
    findings.push({
      severity: 'error',
      file: rel(targetDir, invalidationPath),
      message: 'host-smoke invalidation ledger is out of sync with governed evidence invalidation state'
    });
  }
}

function validateGeneratedArtifactWriteability(targetDir, findings) {
  const probes = [
    {
      path: path.join(targetDir, 'registry', 'admission-ledger.generated.json'),
      mode: 'rewrite-file',
      label: 'admission ledger registry'
    },
    {
      path: path.join(targetDir, 'registry', 'runtime-proof.generated.json'),
      mode: 'rewrite-file',
      label: 'runtime-proof registry'
    },
    {
      path: path.join(targetDir, 'benchmark', 'host-smoke', 'scorecard.generated.json'),
      mode: 'rewrite-file',
      label: 'host-smoke scorecard'
    },
    {
      path: path.join(targetDir, 'benchmark', 'host-smoke', 'invalidation.generated.json'),
      mode: 'create-file',
      label: 'host-smoke invalidation ledger'
    },
    {
      path: path.join(targetDir, 'benchmark', 'system-readiness.generated.json'),
      mode: 'rewrite-file',
      label: 'system readiness artifact'
    },
    {
      path: path.join(targetDir, 'benchmark', 'host-smoke', 'runtime-runs'),
      mode: 'write-dir',
      label: 'host-smoke runtime-runs directory'
    }
  ];

  for (const probe of probes) {
    const result = probeArtifactWriteAccess(probe.path, { mode: probe.mode });
    if (result.ok) {
      continue;
    }

    findings.push({
      severity: 'warning',
      file: rel(targetDir, probe.path),
      message: `${probe.label} is not writable on this host (${result.code || 'UNKNOWN'}); generated governance surfaces cannot be refreshed reliably`
    });
  }
}

function validateGeneratedMetadata(targetDir, skillRecords, findings) {
  const registryPath = path.join(targetDir, 'registry', 'registry.generated.json');
  const routeMapPath = path.join(targetDir, 'registry', 'route-map.generated.json');
  const routeFixturesPath = path.join(targetDir, 'registry', 'route-fixtures.generated.json');

  const registry = parseJsonFile(registryPath);
  const routeMap = parseJsonFile(routeMapPath);
  const routeFixtures = parseJsonFile(routeFixturesPath);
  const admissionLedger = validateAdmissionLedger(targetDir, skillRecords, findings);

  if (registry.error) {
    findings.push({ severity: 'error', file: rel(targetDir, registryPath), message: `registry parse failed: ${registry.error}` });
  }
  if (routeMap.error) {
    findings.push({ severity: 'error', file: rel(targetDir, routeMapPath), message: `route map parse failed: ${routeMap.error}` });
  }
  if (routeFixtures.error) {
    findings.push({ severity: 'warning', file: rel(targetDir, routeFixturesPath), message: `route fixtures parse failed: ${routeFixtures.error}` });
  }

  const { registrySkills, registryNames } = validateRegistryEntries(targetDir, registryPath, registry.data, skillRecords, findings);
  const { moduleGroups, moduleNames } = validateModuleGroups(targetDir, registryPath, registry.data, registryNames, findings);
  const capabilityRatings = validateCapabilityRatings(targetDir, skillRecords, moduleNames, findings);
  const routes = validateRouteMap(targetDir, routeMapPath, routeMap.data, registryNames, skillRecords, moduleNames, moduleGroups, findings, rel);
  const fixtures = validateRouteFixtures(targetDir, routeFixturesPath, routeFixtures.data, routeMap.data, registryNames, findings, rel);
  validateGovernedRouteFixtures(targetDir, routeFixturesPath, routeFixtures.data, skillRecords, findings, rel);
  validateStableRouteEvidence(targetDir, routeFixturesPath, routeFixtures.data, skillRecords, findings, rel);
  const runtimeProof = validateRuntimeProofRegistry(targetDir, skillRecords, findings);
  validateBenchmarkSummary(targetDir, findings);
  validateSystemReadiness(targetDir, findings, {
    skillRecords,
    runtimeProofs: runtimeProof.proofs,
    routeFixtures: fixtures
  });
  validateGeneratedArtifactWriteability(targetDir, findings);

  return {
    registrySkills,
    moduleGroups,
    moduleNames,
    capabilityRatings,
    runtimeProof,
    admissionLedger,
    routes,
    fixtures
  };
}

module.exports = {
  validateGeneratedMetadata
};
