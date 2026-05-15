'use strict';

const fs = require('fs');
const path = require('path');
const {
  RUNTIME_PROOF_LEVELS
} = require('./skill-lifecycle-governance');
const {
  getGovernanceArtifactPath,
  getGovernanceArtifactRelativePath
} = require('./skill-generated-artifact-governance');
const {
  HOST_SMOKE_RESULT_STATUSES,
  HOST_SMOKE_COMMAND_CWD_MODES,
  HOST_SMOKE_FRESHNESS_UNITS,
  HOST_SMOKE_EVIDENCE_STATUSES,
  HOST_SMOKE_GOVERNANCE_STATUSES,
  HOST_SMOKE_INVALIDATION_REASONS
} = require('./skill-host-governance');

const HOST_SMOKE_RUN_SCHEMA_VERSION = 1;
const HOST_SMOKE_SCORECARD_SCHEMA_VERSION = 1;
const HOST_SMOKE_INVALIDATION_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isJsonScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function normalizeScalarObject(value) {
  if (!isPlainObject(value)) return {};
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    if (!String(key || '').trim()) continue;
    if (!isJsonScalar(item)) continue;
    normalized[key] = item;
  }
  return normalized;
}

function normalizeHostSmokeCommands(commands) {
  return (Array.isArray(commands) ? commands : []).map((command) => ({
    ...(command && command.cwd ? { cwd: command.cwd } : {}),
    argv: Array.isArray(command && command.argv) ? [...command.argv] : [],
    expect: normalizeScalarObject(command && command.expect),
    ...(command && command['timeout-ms'] !== undefined ? { 'timeout-ms': command['timeout-ms'] } : {})
  }));
}

function normalizeHostSmokeContract(hostSmoke) {
  if (!isPlainObject(hostSmoke)) {
    return null;
  }
  const freshness = isPlainObject(hostSmoke.freshness)
    ? {
        maxAge: Number.isInteger(hostSmoke.freshness['max-age']) ? hostSmoke.freshness['max-age'] : null,
        unit: HOST_SMOKE_FRESHNESS_UNITS.has(hostSmoke.freshness.unit) ? hostSmoke.freshness.unit : null
      }
    : null;
  return {
    manifest: String(hostSmoke.manifest || '').trim(),
    commands: normalizeHostSmokeCommands(hostSmoke.commands),
    ...(freshness && freshness.maxAge && freshness.unit
      ? {
          freshness: {
            'max-age': freshness.maxAge,
            unit: freshness.unit
          }
        }
      : {})
  };
}

function hostSmokeContractsEqual(left, right) {
  const normalizedLeft = normalizeHostSmokeContract(left);
  const normalizedRight = normalizeHostSmokeContract(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function getHostSmokeRuntimeRunsDir(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'host-smoke', 'runtime-runs');
}

function getHostSmokeRunSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'host-smoke', 'runtime-run.schema.json');
}

function getHostSmokeScorecardPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'host-smoke-scorecard');
}

function getHostSmokeScorecardSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'host-smoke', 'scorecard.schema.json');
}

function getHostSmokeInvalidationPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'host-smoke-invalidation');
}

function getHostSmokeInvalidationSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'benchmark', 'host-smoke', 'invalidation.schema.json');
}

function portablePath(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function readJsonFile(file) {
  try {
    return {
      data: JSON.parse(fs.readFileSync(file, 'utf8'))
    };
  } catch (error) {
    return {
      error: error.message,
      data: null
    };
  }
}

function parseIsoTimestamp(value) {
  const parsed = new Date(String(value || '').trim());
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function normalizeHostSmokeInvalidationEntry(bundleRoot, entry) {
  if (!isPlainObject(entry)) {
    return null;
  }

  const skill = String(entry.skill || '').trim();
  const runId = String(entry['run-id'] || entry.runId || '').trim();
  const invalidatedAt = parseIsoTimestamp(entry['invalidated-at'] || entry.invalidatedAt);
  const reason = String(entry.reason || '').trim();
  if (!skill || !runId || !invalidatedAt || !HOST_SMOKE_INVALIDATION_REASONS.has(reason)) {
    return null;
  }

  const normalized = {
    skill,
    'run-id': runId,
    reason,
    'invalidated-at': invalidatedAt
  };

  const host = String(entry.host || '').trim();
  if (host) {
    normalized.host = host;
  }

  const manifest = String(entry.manifest || '').trim();
  if (manifest) {
    normalized.manifest = manifest;
  }

  const file = String(entry.file || '').trim();
  if (file) {
    normalized.file = file.includes('\\') ? portablePath(bundleRoot, file) : file;
  }

  const invalidatedBy = String(entry['invalidated-by'] || entry.invalidatedBy || '').trim();
  if (invalidatedBy) {
    normalized['invalidated-by'] = invalidatedBy;
  }

  const note = String(entry.note || '').trim();
  if (note) {
    normalized.note = note;
  }

  return normalized;
}

function loadHostSmokeInvalidationIndex(bundleRoot) {
  const file = getHostSmokeInvalidationPath(bundleRoot);
  const index = {
    file,
    relativeFile: portablePath(bundleRoot, file),
    entries: [],
    bySkill: new Map(),
    byRunId: new Map(),
    errors: []
  };

  if (!fs.existsSync(file)) {
    return index;
  }

  const parsed = readJsonFile(file);
  if (parsed.error) {
    index.errors.push({
      file: index.relativeFile,
      message: `parse failed: ${parsed.error}`
    });
    return index;
  }

  const data = parsed.data || {};
  if (data['schema-version'] !== HOST_SMOKE_INVALIDATION_SCHEMA_VERSION) {
    index.errors.push({
      file: index.relativeFile,
      message: `unsupported schema-version '${data['schema-version']}'`
    });
    return index;
  }

  for (const rawEntry of Array.isArray(data.entries) ? data.entries : []) {
    const entry = normalizeHostSmokeInvalidationEntry(bundleRoot, rawEntry);
    if (!entry) {
      index.errors.push({
        file: index.relativeFile,
        message: 'contains an invalid invalidation entry'
      });
      continue;
    }

    const key = `${entry.skill}::${entry['run-id']}`;
    if (index.byRunId.has(key)) {
      continue;
    }
    index.byRunId.set(key, entry);
    if (!index.bySkill.has(entry.skill)) {
      index.bySkill.set(entry.skill, new Map());
    }
    index.bySkill.get(entry.skill).set(entry['run-id'], entry);
    index.entries.push(entry);
  }

  index.entries.sort((left, right) =>
    right['invalidated-at'].localeCompare(left['invalidated-at'])
    || left.skill.localeCompare(right.skill)
    || left['run-id'].localeCompare(right['run-id'])
  );
  return index;
}

function buildHostSmokeInvalidationLedger(bundleRoot, entries, now = Date.now()) {
  const normalizedEntries = [];
  const seen = new Set();

  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const entry = normalizeHostSmokeInvalidationEntry(bundleRoot, rawEntry);
    if (!entry) {
      continue;
    }
    const key = `${entry.skill}::${entry['run-id']}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalizedEntries.push(entry);
  }

  normalizedEntries.sort((left, right) =>
    left.skill.localeCompare(right.skill)
    || left['run-id'].localeCompare(right['run-id'])
  );

  return {
    'schema-version': HOST_SMOKE_INVALIDATION_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    entries: normalizedEntries
  };
}

function writeHostSmokeInvalidationLedger(bundleRoot, entries, now = Date.now()) {
  const file = getHostSmokeInvalidationPath(bundleRoot);
  const payload = buildHostSmokeInvalidationLedger(bundleRoot, entries, now);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

function isHostSmokeArtifactInvalidated(invalidationIndex, skillName, runId) {
  if (!invalidationIndex || !(invalidationIndex.bySkill instanceof Map)) {
    return false;
  }
  const skillEntries = invalidationIndex.bySkill.get(String(skillName || '').trim());
  if (!(skillEntries instanceof Map)) {
    return false;
  }
  return skillEntries.has(String(runId || '').trim());
}

function normalizeHostSmokeRunCommand(command) {
  if (!isPlainObject(command)) return null;
  const normalized = {
    ...(command.cwd && HOST_SMOKE_COMMAND_CWD_MODES.has(command.cwd) ? { cwd: command.cwd } : {}),
    argv: Array.isArray(command.argv) ? [...command.argv] : [],
    expect: normalizeScalarObject(command.expect),
    status: HOST_SMOKE_RESULT_STATUSES.has(command.status) ? command.status : 'fail',
    ...(command['timeout-ms'] !== undefined ? { 'timeout-ms': command['timeout-ms'] } : {}),
    ...(command['exit-code'] !== undefined ? { 'exit-code': command['exit-code'] } : {}),
    ...(command.signal !== undefined ? { signal: command.signal } : {}),
    ...(command['duration-ms'] !== undefined ? { 'duration-ms': command['duration-ms'] } : {}),
    ...(command['json-parse-ok'] !== undefined ? { 'json-parse-ok': command['json-parse-ok'] === true } : {}),
    observed: normalizeScalarObject(command.observed),
    mismatches: Array.isArray(command.mismatches) ? command.mismatches.map((item) => String(item || '').trim()).filter(Boolean) : [],
    ...(command['stdout-preview'] ? { 'stdout-preview': String(command['stdout-preview']) } : {}),
    ...(command['stderr-preview'] ? { 'stderr-preview': String(command['stderr-preview']) } : {}),
    ...(command.error ? { error: String(command.error) } : {})
  };
  return normalized;
}

function normalizeHostSmokeRunResult(result) {
  if (!isPlainObject(result)) return null;
  const contract = normalizeHostSmokeContract(result.contract);
  const commands = (Array.isArray(result.commands) ? result.commands : [])
    .map(normalizeHostSmokeRunCommand)
    .filter(Boolean);

  return {
    skill: String(result.skill || '').trim(),
    kind: String(result.kind || '').trim(),
    'level-before': String(result['level-before'] || '').trim(),
    status: HOST_SMOKE_RESULT_STATUSES.has(result.status) ? result.status : 'fail',
    manifest: String(result.manifest || contract?.manifest || '').trim(),
    contract,
    'command-count': Number.isInteger(result['command-count']) ? result['command-count'] : commands.length,
    'passed-commands': Number.isInteger(result['passed-commands'])
      ? result['passed-commands']
      : commands.filter((command) => command.status === 'pass').length,
    commands
  };
}

function parseHostSmokeRunFile(bundleRoot, file) {
  const parsed = readJsonFile(file);
  if (parsed.error) {
    return {
      error: `parse failed: ${parsed.error}`,
      file
    };
  }

  const data = parsed.data || {};
  if (data['schema-version'] !== HOST_SMOKE_RUN_SCHEMA_VERSION) {
    return {
      error: `unsupported schema-version '${data['schema-version']}'`,
      file
    };
  }

  const runId = String(data['run-id'] || '').trim();
  if (!runId) {
    return {
      error: 'missing run-id',
      file
    };
  }

  const executedAt = parseIsoTimestamp(data['executed-at']);
  if (!executedAt) {
    return {
      error: `invalid executed-at '${data['executed-at']}'`,
      file
    };
  }

  const host = String(data.host || '').trim();
  if (!host) {
    return {
      error: 'missing host',
      file
    };
  }

  const selection = isPlainObject(data.selection) ? data.selection : {};
  const results = (Array.isArray(data.results) ? data.results : [])
    .map(normalizeHostSmokeRunResult)
    .filter(Boolean);
  if (results.length < 1) {
    return {
      error: 'runtime host-smoke run must contain at least one result',
      file
    };
  }

  return {
    runId,
    executedAt,
    host,
    file,
    relativeFile: portablePath(bundleRoot, file),
    sourceRuntimeProof: String(data['source-runtime-proof'] || '').trim(),
    selection: {
      scope: String(selection.scope || '').trim(),
      skills: Array.isArray(selection.skills) ? selection.skills.map((item) => String(item || '').trim()).filter(Boolean) : []
    },
    results
  };
}

function loadHostSmokeRunIndex(bundleRoot) {
  const runDir = getHostSmokeRuntimeRunsDir(bundleRoot);
  const index = {
    runs: [],
    bySkill: new Map(),
    errors: [],
    runDir
  };

  if (!fs.existsSync(runDir) || !fs.statSync(runDir).isDirectory()) {
    return index;
  }

  const files = fs.readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(runDir, entry.name))
    .sort();

  for (const file of files) {
    const parsed = parseHostSmokeRunFile(bundleRoot, file);
    if (parsed.error) {
      index.errors.push({
        file: portablePath(bundleRoot, file),
        message: parsed.error
      });
      continue;
    }
    index.runs.push(parsed);
    for (const result of parsed.results) {
      if (!result.skill) {
        index.errors.push({
          file: parsed.relativeFile,
          message: `run '${parsed.runId}' contains a result with no skill name`
        });
        continue;
      }
      if (!index.bySkill.has(result.skill)) {
        index.bySkill.set(result.skill, []);
      }
      index.bySkill.get(result.skill).push({
        ...result,
        runId: parsed.runId,
        host: parsed.host,
        executedAt: parsed.executedAt,
        file: parsed.relativeFile
      });
    }
  }

  index.runs.sort((left, right) => right.executedAt.localeCompare(left.executedAt) || right.runId.localeCompare(left.runId));
  for (const results of index.bySkill.values()) {
    results.sort((left, right) => right.executedAt.localeCompare(left.executedAt) || right.runId.localeCompare(left.runId));
  }

  return index;
}

function findLatestHostSmokeEvidence(index, skillName, contract, options = {}) {
  const allResults = index && index.bySkill instanceof Map ? (index.bySkill.get(skillName) || []) : [];
  const invalidationIndex = options.invalidationIndex || null;
  const results = allResults.filter((item) => !isHostSmokeArtifactInvalidated(invalidationIndex, skillName, item.runId));
  const latestAny = results[0] || null;
  const latestMatching = results.find((item) => hostSmokeContractsEqual(item.contract, contract)) || null;
  const latestPassing = results.find((item) => item.status === 'pass' && hostSmokeContractsEqual(item.contract, contract)) || null;

  return {
    allResults,
    activeResults: results,
    latestAny,
    latestMatching,
    latestPassing
  };
}

function getFreshnessWindowMs(freshness) {
  if (!freshness || typeof freshness !== 'object' || Array.isArray(freshness)) {
    return null;
  }
  const maxAge = Number.isInteger(freshness['max-age']) ? freshness['max-age'] : null;
  const unit = HOST_SMOKE_FRESHNESS_UNITS.has(freshness.unit) ? freshness.unit : null;
  if (!maxAge || !unit) {
    return null;
  }
  if (unit === 'hours') {
    return maxAge * 60 * 60 * 1000;
  }
  return maxAge * 24 * 60 * 60 * 1000;
}

function evaluateHostSmokeFreshness(latestPassing, contract, now = Date.now()) {
  const freshness = contract && contract.freshness ? contract.freshness : null;
  const windowMs = getFreshnessWindowMs(freshness);
  if (!windowMs) {
    return {
      required: false,
      fresh: true,
      stale: false,
      ageMs: null,
      maxAgeMs: null
    };
  }
  if (!latestPassing) {
    return {
      required: true,
      fresh: false,
      stale: true,
      ageMs: null,
      maxAgeMs: windowMs
    };
  }

  const executedAt = new Date(String(latestPassing.executedAt || '').trim());
  if (Number.isNaN(executedAt.getTime())) {
    return {
      required: true,
      fresh: false,
      stale: true,
      ageMs: null,
      maxAgeMs: windowMs
    };
  }

  const ageMs = Math.max(0, now - executedAt.getTime());
  return {
    required: true,
    fresh: ageMs <= windowMs,
    stale: ageMs > windowMs,
    ageMs,
    maxAgeMs: windowMs
  };
}

function normalizeHostSmokeProofEntry(proof) {
  if (!isPlainObject(proof)) {
    return null;
  }
  return {
    skill: String(proof.skill || '').trim(),
    kind: String(proof.kind || '').trim(),
    level: String(proof.level || '').trim(),
    contract: normalizeHostSmokeContract(proof['host-smoke'])
  };
}

function toHostSmokeArtifactRef(result) {
  if (!result) {
    return null;
  }
  return {
    'run-id': String(result.runId || '').trim(),
    'executed-at': String(result.executedAt || '').trim(),
    host: String(result.host || '').trim(),
    status: HOST_SMOKE_RESULT_STATUSES.has(result.status) ? result.status : 'fail',
    file: String(result.file || '').trim()
  };
}

function classifyHostSmokeEvidenceStatus(contract, evidence, freshness) {
  if (!contract || !contract.manifest || contract.commands.length < 1) {
    return 'invalid-contract';
  }
  if (!evidence.latestAny) {
    return 'missing';
  }
  if (!evidence.latestMatching) {
    return 'contract-drift';
  }
  if (evidence.latestMatching.status !== 'pass') {
    return 'failing';
  }
  if (freshness.required && freshness.stale) {
    return 'stale';
  }
  return 'passing';
}

function classifyHostSmokeGovernanceStatus(level, evidenceStatus) {
  if (level !== 'host-smoked') {
    return 'not-host-smoked';
  }
  switch (evidenceStatus) {
    case 'passing':
      return 'satisfied';
    case 'stale':
      return 'stale';
    case 'failing':
      return 'failing';
    case 'missing':
      return 'missing';
    case 'contract-drift':
      return 'contract-drift';
    default:
      return 'invalid-contract';
  }
}

function emptyCountMap(keys) {
  const counts = {};
  for (const key of keys) {
    counts[key] = 0;
  }
  return counts;
}

function buildHostSmokeSkillScorecardEntry(proof, index, now = Date.now()) {
  const normalized = normalizeHostSmokeProofEntry(proof) || {
    skill: '',
    kind: '',
    level: '',
    contract: null
  };
  const contract = normalized.contract;
  const invalidationIndex = index && index.invalidationIndex ? index.invalidationIndex : null;
  const evidence = contract
    ? findLatestHostSmokeEvidence(index, normalized.skill, contract, { invalidationIndex })
    : { latestAny: null, latestMatching: null, latestPassing: null };
  const freshness = evaluateHostSmokeFreshness(evidence.latestPassing, contract, now);
  const evidenceStatus = classifyHostSmokeEvidenceStatus(contract, evidence, freshness);
  const governanceStatus = classifyHostSmokeGovernanceStatus(normalized.level, evidenceStatus);
  const latestAny = toHostSmokeArtifactRef(evidence.latestAny);
  const latestMatching = toHostSmokeArtifactRef(evidence.latestMatching);
  const latestPassing = toHostSmokeArtifactRef(evidence.latestPassing);

  return {
    skill: normalized.skill,
    kind: normalized.kind,
    level: RUNTIME_PROOF_LEVELS.has(normalized.level) ? normalized.level : 'declared-only',
    manifest: String(contract && contract.manifest || '').trim(),
    'command-count': contract ? contract.commands.length : 0,
    ...(contract && contract.freshness ? { freshness: contract.freshness } : {}),
    'freshness-status': freshness,
    'evidence-status': HOST_SMOKE_EVIDENCE_STATUSES.has(evidenceStatus) ? evidenceStatus : 'invalid-contract',
    'governance-status': HOST_SMOKE_GOVERNANCE_STATUSES.has(governanceStatus) ? governanceStatus : 'invalid-contract',
    'latest-any-matches-contract': latestAny ? !!(latestMatching && latestAny['run-id'] === latestMatching['run-id']) : null,
    'latest-any': latestAny,
    'latest-matching': latestMatching,
    'latest-passing': latestPassing
  };
}

function buildHostSmokeScorecard(bundleRoot, proofs, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const index = options.index || loadHostSmokeRunIndex(bundleRoot);
  if (!index.invalidationIndex) {
    index.invalidationIndex = loadHostSmokeInvalidationIndex(bundleRoot);
  }
  const scorecardSkills = (Array.isArray(proofs) ? proofs : [])
    .map((proof) => buildHostSmokeSkillScorecardEntry(proof, index, now))
    .filter((entry) => entry.skill)
    .sort((left, right) => left.skill.localeCompare(right.skill));

  const summary = {
    'host-smoke-capable-skills': scorecardSkills.length,
    levels: emptyCountMap([...RUNTIME_PROOF_LEVELS]),
    'evidence-status': emptyCountMap(['passing', 'stale', 'failing', 'missing', 'contract-drift', 'invalid-contract']),
    'governance-status': emptyCountMap(['satisfied', 'not-host-smoked', 'stale', 'failing', 'missing', 'contract-drift', 'invalid-contract'])
  };

  for (const entry of scorecardSkills) {
    summary.levels[entry.level] += 1;
    summary['evidence-status'][entry['evidence-status']] += 1;
    summary['governance-status'][entry['governance-status']] += 1;
  }

  return {
    'schema-version': HOST_SMOKE_SCORECARD_SCHEMA_VERSION,
    'generated-at': new Date(now).toISOString(),
    'source-runtime-proof': getGovernanceArtifactRelativePath('runtime-proof'),
    'runtime-run-dir': portablePath(bundleRoot, getHostSmokeRuntimeRunsDir(bundleRoot)),
    'run-count': index.runs.length,
    'artifact-error-count': index.errors.length + (((index.invalidationIndex && index.invalidationIndex.errors) || []).length),
    ...(index.runs[0]
      ? {
          'latest-run': {
            'run-id': index.runs[0].runId,
            'executed-at': index.runs[0].executedAt,
            host: index.runs[0].host,
            file: index.runs[0].relativeFile
          }
        }
      : {}),
    summary,
    'artifact-errors': [...index.errors, ...((index.invalidationIndex && index.invalidationIndex.errors) || [])].map((item) => ({
      file: String(item.file || '').trim(),
      message: String(item.message || '').trim()
    })),
    skills: scorecardSkills
  };
}

module.exports = {
  HOST_SMOKE_RUN_SCHEMA_VERSION,
  HOST_SMOKE_SCORECARD_SCHEMA_VERSION,
  HOST_SMOKE_INVALIDATION_SCHEMA_VERSION,
  HOST_SMOKE_INVALIDATION_REASONS,
  normalizeHostSmokeCommands,
  normalizeHostSmokeContract,
  hostSmokeContractsEqual,
  getHostSmokeRuntimeRunsDir,
  getHostSmokeRunSchemaPath,
  getHostSmokeScorecardPath,
  getHostSmokeScorecardSchemaPath,
  getHostSmokeInvalidationPath,
  getHostSmokeInvalidationSchemaPath,
  loadHostSmokeRunIndex,
  loadHostSmokeInvalidationIndex,
  buildHostSmokeInvalidationLedger,
  writeHostSmokeInvalidationLedger,
  isHostSmokeArtifactInvalidated,
  findLatestHostSmokeEvidence,
  getFreshnessWindowMs,
  evaluateHostSmokeFreshness,
  buildHostSmokeScorecard
};
