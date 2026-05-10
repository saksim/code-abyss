#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { collectSkillRecords } = require('../../lib/skill-system-skills');
const {
  validateSmokeManifest,
  probeArtifactWriteAccess,
  probeDirectoryCreateAccess,
  readReferencePaths,
  collectGeneratedArtifactWriteability
} = require('../../lib/skill-system-common');
const {
  explainRouteSelection,
  buildGovernedRouteFixture,
  hasRouteFixtureEvidence,
  routeFixtureReferencesSkill
} = require('../../lib/skill-system-routing');
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
const { writeSystemReadiness } = require('../../lib/skill-system-readiness');
const {
  isGovernedRuntimeProofRecord,
  deriveHostSmokePolicyFromRecord,
  normalizeHostSmokePolicy,
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays
} = require('../../lib/skill-system-governance');
const {
  OPENAI_METADATA_KEYS,
  buildOpenAiMetadata,
  readOpenAiMetadataFile,
  writeOpenAiMetadataFile
} = require('../../lib/skill-system-host-metadata');
const {
  getReviewQueuePath,
  buildReviewQueue,
  readReviewQueue,
  normalizeReviewDate,
  normalizeReviewCycleDays
} = require('../../lib/skill-review-governance');
const {
  getSkillInvestmentBacklogPath,
  buildSkillInvestmentBacklog
} = require('../../lib/skill-investment-governance');
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
  readTemplateLineage
} = require('../../lib/skill-system-templates');
const {
  getPendingScaffoldRegistryPath,
  buildPendingScaffoldRegistry,
  normalizePendingScaffoldStatus
} = require('../../lib/skill-pending-scaffold-governance');

const VALID_KINDS = new Map([
  ['router', 'routers'],
  ['domain', 'domains'],
  ['workflow', 'workflows'],
  ['tool', 'tools'],
  ['guard', 'guards'],
  ['adapter', 'adapters'],
]);

const HOSTS = ['codex', 'claude', 'gemini'];
const LIVE_RUNTIME_PROOF_STATUSES = new Set(['stable', 'experimental', 'deprecated']);
const RUNTIME_PROOF_LEVELS = new Set(['declared-only', 'declared-and-tested', 'host-smoked']);
const HOST_SMOKE_RESULT_STATUSES = new Set(['pass', 'fail']);
const VALID_STATUSES = new Set(['draft', 'experimental', 'stable', 'deprecated', 'archived']);
const GENERATED_STATUS_BUCKET_BY_STATUS = new Map([
  ['stable', 'top-level-enough-now'],
  ['experimental', 'strong-uplift-but-not-top-yet'],
  ['deprecated', 'useful-overlay-not-top-level-alone']
]);
const PLACEHOLDER_ROUTE_BY_KIND = {
  domain: {
    priority: 40,
    namespace: 'domain',
    intentTags: ['knowledge'],
    primaryIntent: 'newly created domain placeholder route'
  },
  workflow: {
    priority: 40,
    namespace: 'workflow',
    intentTags: ['execute'],
    primaryIntent: 'newly created workflow placeholder route'
  },
  tool: {
    priority: 40,
    namespace: 'tool',
    intentTags: ['validate'],
    primaryIntent: 'newly created tool placeholder route'
  },
  guard: {
    priority: 40,
    namespace: 'guard',
    intentTags: ['validate', 'release'],
    primaryIntent: 'newly created guard placeholder route'
  },
  adapter: {
    priority: 40,
    namespace: 'adapter',
    intentTags: ['knowledge'],
    primaryIntent: 'newly created adapter placeholder route'
  },
};
const CAPABILITY_MODULE_SCAFFOLD_KINDS = new Set(['domain', 'workflow']);
const CAPABILITY_MODULE_DESCRIPTION_BY_KIND = {
  domain: {
    'decision-rules': 'Capture the domain\'s default judgement rules, tradeoffs, and anti-pattern boundaries.',
    'deep-reference-index': 'Map the deeper subtopics and expansion points behind the domain surface.',
    'boundaries-and-escalations': 'Declare abstention rules, edge conditions, and handoff triggers for adjacent skills.'
  },
  workflow: {
    'entry-and-exit-criteria': 'Define prerequisites, completion signals, and clean handoff exits for the workflow.',
    'verification-checklist': 'Capture the workflow\'s proof checklist and required validation chain.',
    'failure-modes': 'Capture recovery rules, abort conditions, and escalation behavior when the workflow breaks down.'
  }
};
const CAPABILITY_NEXT_BATCH_POLICY_BY_BUCKET = {
  thin: {
    priority: 'upgrade-now',
    'next-step': 'Replace scaffold placeholders, deepen the reference, and add route evidence before promotion.'
  },
  'strong-but-not-top': {
    priority: 'promote-next',
    'next-step': 'Close the remaining depth and evidence gaps before TOP-ready promotion.'
  }
};
const EMPTY_NEXT_BATCH_LINE = '- `(none; the current bundle is fully promoted in this snapshot)`';
const EMPTY_CAPABILITY_MODULE_SECTION_LINE = '- `(none in this snapshot)`';
const CAPABILITY_RATING_BUCKET_SEQUENCE = ['thin', 'strong-but-not-top', 'top-ready'];
const CAPABILITY_RATING_BUCKET_INDEX = new Map(
  CAPABILITY_RATING_BUCKET_SEQUENCE.map((bucketName, index) => [bucketName, index])
);
const ADMISSION_LEDGER_SCHEMA_VERSION = 1;
const EVOLUTION_LEDGER_SCHEMA_VERSION = 1;
const OPPORTUNITY_IMPLEMENTED_CREATE_STATUSES = new Set(['implemented', 'created']);
const STABLE_REFERENCE_FLOOR_BY_KIND = {
  router: 2,
  domain: 3,
  workflow: 3,
  tool: 2,
  guard: 2,
  adapter: 2
};
const EVOLUTION_DECISION_ACTIONS = new Set([
  'status-already-correct',
  'upgrade-existing-skill',
  'promote-to-stable',
  'deprecate-skill',
  'archive-skill',
  'delete-skill',
  'merge-into-skill'
]);
const EVOLUTION_ACTION_DEFAULT_TARGET_STATUS = new Map([
  ['promote-to-stable', 'stable'],
  ['deprecate-skill', 'deprecated'],
  ['archive-skill', 'archived'],
  ['delete-skill', 'deleted']
]);

function fail(message) {
  throw new Error(message);
}

function getProjectRoot() {
  const cwdRoot = path.join(process.cwd(), 'personal-skill-system');
  if (fs.existsSync(cwdRoot) && fs.statSync(cwdRoot).isDirectory()) {
    return process.cwd();
  }
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
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
  const config = PLACEHOLDER_ROUTE_BY_KIND[kind];
  return config ? [...config.intentTags] : [];
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

function getGeneratedWriteRequirements(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  return [
    {
      path: getRegistryPath(projectRoot),
      mode: 'rewrite-file',
      label: 'skill registry'
    },
    {
      path: getRouteMapPath(projectRoot),
      mode: 'rewrite-file',
      label: 'route-map generated registry'
    },
    {
      path: getRouteFixturesPath(projectRoot),
      mode: 'rewrite-file',
      label: 'route-fixtures generated registry'
    },
    {
      path: getRatingsPath(projectRoot),
      mode: 'rewrite-file',
      label: 'capability ratings registry'
    },
    ...collectGeneratedArtifactWriteability(bundleRoot).map((artifact) => ({
      path: artifact.path,
      mode: artifact.mode,
      label: artifact.label
    }))
  ];
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
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json');
}

function getAdmissionLedgerPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json');
}

function getEvolutionLedgerPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'evolution-ledger.generated.json');
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

function getPendingScaffoldRegistryFilePath(projectRoot) {
  return getPendingScaffoldRegistryPath(getBundleRoot(projectRoot));
}

function getRatingsDocPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md');
}

function getRuntimeProofPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
}

function getBundleRoot(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system');
}

const ACTIVE_ADMISSION_STATUSES = new Set(['open', 'planned', 'in-progress', 'blocked', 'deferred']);
const TERMINAL_ADMISSION_STATUSES = new Set(['implemented', 'cancelled', 'resolved', 'advised-reuse', 'advised-noop']);

function normalizeAdmissionStatus(value, fallback = 'open') {
  const normalized = String(value || '').trim();
  if (ACTIVE_ADMISSION_STATUSES.has(normalized) || TERMINAL_ADMISSION_STATUSES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function isActiveAdmissionStatus(value) {
  return ACTIVE_ADMISSION_STATUSES.has(normalizeAdmissionStatus(value));
}

function getHostSmokeProofsFromRegistry(projectRoot) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  return (Array.isArray(registry.proofs) ? registry.proofs : [])
    .filter((proof) => proof && proof['host-smoke']);
}

function normalizeAdmissionLedgerEntries(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const requestId = String(entry['request-id'] || '').trim();
    const request = normalizeAdmissionText(entry.request);
    const decisionAction = String(entry.decision && entry.decision.action || '').trim();
    const recordedAt = String(entry['recorded-at'] || '').trim();
    const key = requestId || `${request}::${recordedAt}`;
    if (!requestId || !request || !decisionAction || seen.has(key)) {
      continue;
    }
    seen.add(key);

    const status = normalizeAdmissionStatus(entry.status || 'open');
    const normalizedEntry = {
      'request-id': requestId,
      request,
      ...(entry['suggested-kind'] ? { 'suggested-kind': String(entry['suggested-kind']).trim() } : {}),
      ...(Array.isArray(entry['inferred-intent-tags'])
        ? { 'inferred-intent-tags': [...new Set(entry['inferred-intent-tags'].map((item) => String(item || '').trim()).filter(Boolean))].sort() }
        : {}),
      ...(entry['opportunity-id'] ? { 'opportunity-id': String(entry['opportunity-id']).trim() } : {}),
      decision: {
        action: decisionAction,
        ...(entry.decision.target_skill ? { target_skill: String(entry.decision.target_skill).trim() } : {}),
        ...(entry.decision.target_kind ? { target_kind: String(entry.decision.target_kind).trim() } : {}),
        ...(entry.decision.primary_skill ? { primary_skill: String(entry.decision.primary_skill).trim() } : {}),
        ...(entry.decision.competing_skill ? { competing_skill: String(entry.decision.competing_skill).trim() } : {}),
        ...(entry.decision.suggested_kind ? { suggested_kind: String(entry.decision.suggested_kind).trim() } : {})
      },
      status,
      'recorded-at': recordedAt,
      ...(entry['created-skill'] ? { 'created-skill': String(entry['created-skill']).trim() } : {}),
      ...(entry.note ? { note: String(entry.note).trim() } : {})
    };
    if (!isActiveAdmissionStatus(status) && entry['resolved-at']) {
      normalizedEntry['resolved-at'] = String(entry['resolved-at']).trim();
    }
    normalized.push(normalizedEntry);
  }

  normalized.sort((left, right) => {
    const leftTime = Date.parse(left['recorded-at']) || 0;
    const rightTime = Date.parse(right['recorded-at']) || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left['request-id'].localeCompare(right['request-id']);
  });

  return normalized;
}

function readAdmissionLedger(projectRoot) {
  const ledgerPath = getAdmissionLedgerPath(projectRoot);
  if (!fs.existsSync(ledgerPath)) {
    return {
      'schema-version': ADMISSION_LEDGER_SCHEMA_VERSION,
      entries: []
    };
  }

  const raw = readJsonSafe(ledgerPath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(`admission ledger is unreadable or invalid: ${ledgerPath}`);
  }

  return {
    'schema-version': ADMISSION_LEDGER_SCHEMA_VERSION,
    entries: normalizeAdmissionLedgerEntries(raw.entries)
  };
}

function writeAdmissionLedger(projectRoot, ledger) {
  const nextLedger = {
    'schema-version': ADMISSION_LEDGER_SCHEMA_VERSION,
    entries: normalizeAdmissionLedgerEntries(ledger && ledger.entries)
  };
  writeJson(getAdmissionLedgerPath(projectRoot), nextLedger);
  return nextLedger;
}

function appendAdmissionLedgerEntry(projectRoot, entry) {
  const ledger = readAdmissionLedger(projectRoot);
  ledger.entries.push(entry);
  return writeAdmissionLedger(projectRoot, ledger);
}

function normalizeEvolutionLedgerEntries(entries) {
  const seen = new Set();
  const normalized = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const requestId = String(entry['request-id'] || '').trim();
    const skill = String(entry.skill || '').trim();
    const request = normalizeAdmissionText(entry.request);
    const decisionAction = String(entry.decision && entry.decision.action || '').trim();
    const recordedAt = String(entry['recorded-at'] || '').trim();
    const key = requestId || `${skill}::${request}::${recordedAt}`;
    if (!requestId || !skill || !request || !decisionAction || seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      'request-id': requestId,
      skill,
      request,
      decision: {
        action: decisionAction,
        ...(entry.decision.target_status ? { target_status: String(entry.decision.target_status).trim() } : {}),
        ...(entry.decision.target_skill ? { target_skill: String(entry.decision.target_skill).trim() } : {}),
        ...(entry.decision.note ? { note: String(entry.decision.note).trim() } : {})
      },
      status: String(entry.status || '').trim() || 'open',
      'recorded-at': recordedAt,
      ...(entry['resolved-at'] ? { 'resolved-at': String(entry['resolved-at']).trim() } : {}),
      ...(entry['executed-action'] ? { 'executed-action': String(entry['executed-action']).trim() } : {}),
      ...(entry['result-status'] ? { 'result-status': String(entry['result-status']).trim() } : {}),
      ...(entry['merged-into'] ? { 'merged-into': String(entry['merged-into']).trim() } : {}),
      ...(entry.note ? { note: String(entry.note).trim() } : {})
    });
  }

  normalized.sort((left, right) => {
    const leftTime = Date.parse(left['recorded-at']) || 0;
    const rightTime = Date.parse(right['recorded-at']) || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left['request-id'].localeCompare(right['request-id']);
  });

  return normalized;
}

function readEvolutionLedger(projectRoot) {
  const ledgerPath = getEvolutionLedgerPath(projectRoot);
  if (!fs.existsSync(ledgerPath)) {
    return {
      'schema-version': EVOLUTION_LEDGER_SCHEMA_VERSION,
      entries: []
    };
  }

  const raw = readJsonSafe(ledgerPath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(`evolution ledger is unreadable or invalid: ${ledgerPath}`);
  }

  return {
    'schema-version': EVOLUTION_LEDGER_SCHEMA_VERSION,
    entries: normalizeEvolutionLedgerEntries(raw.entries)
  };
}

function writeEvolutionLedger(projectRoot, ledger) {
  const nextLedger = {
    'schema-version': EVOLUTION_LEDGER_SCHEMA_VERSION,
    entries: normalizeEvolutionLedgerEntries(ledger && ledger.entries)
  };
  writeJson(getEvolutionLedgerPath(projectRoot), nextLedger);
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
    ...(!['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(nextStatus)
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
  const recommendationAction = normalizeString(result && result.recommendation && result.recommendation.action);
  const admissionRequestId = normalizeString(result && result['request-id']);
  let nextStatus = normalizeOpportunityStatus(existing.status || 'open');
  let note = normalizeString(existing.note);

  if (recommendationAction === 'create-new-skill') {
    nextStatus = 'planned';
    note = `escalated to admission request '${admissionRequestId}' with create-new-skill recommendation`;
  } else if (recommendationAction === 'clarify-or-merge-boundary') {
    nextStatus = 'blocked';
    note = `escalated to admission request '${admissionRequestId}' and blocked on route-boundary clarification`;
  } else if (recommendationAction === 'reuse-existing-skill') {
    nextStatus = 'cancelled';
    note = `resolved by reusing existing skill '${normalizeString(result.recommendation.target_skill) || 'unknown'}' via admission request '${admissionRequestId}'`;
  } else if (recommendationAction === 'upgrade-existing-skill') {
    nextStatus = 'cancelled';
    note = `resolved by upgrading existing skill '${normalizeString(result.recommendation.target_skill) || 'unknown'}' via admission request '${admissionRequestId}'`;
  }

  queue.entries[index] = {
    ...existing,
    status: nextStatus,
    ...(admissionRequestId ? { 'admission-request-id': admissionRequestId } : {}),
    ...(note ? { note } : {}),
    ...(['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(nextStatus)
      ? {}
      : { 'resolved-at': new Date().toISOString() })
  };

  if (['open', 'planned', 'in-progress', 'blocked', 'deferred'].includes(nextStatus)) {
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
    status: String(resolution.status || existing.status || 'resolved').trim() || 'resolved',
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
  const descriptions = CAPABILITY_MODULE_DESCRIPTION_BY_KIND[kind] || {};
  if (descriptions[slug]) {
    return descriptions[slug];
  }
  return `Scaffolded capability module for ${titleFromSlug(slug)} inside ${kind} '${refPath}'.`;
}

function buildCapabilityModuleScaffolds(projectRoot, kind, skillName, skillText, targetDir, outputTargetDir = targetDir) {
  if (!CAPABILITY_MODULE_SCAFFOLD_KINDS.has(kind)) {
    fail(`capability-module scaffolding is only supported for domain and workflow skills, not '${kind}'`);
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
    parsed.map.set('name', skillName);
    parsed.map.set('title', `${slugToTitle(skillName)} ${slugToTitle(kind)}`);
    parsed.map.set('description', `TODO: describe ${skillName}. Use when this ${kind} is the correct primary route.`);
    parsed.map.set('status', 'draft');
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
    const createPlaceholderRoute = kind !== 'router' && kind !== 'adapter' && parseBoolean(parsed.map.get('user-invocable'), true);
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

function materializeScaffoldPlan(targetDir, plan) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of Array.isArray(plan.files) ? plan.files : []) {
    const targetFile = path.join(targetDir, String(file.path || '').replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, String(file.content == null ? '' : file.content), 'utf8');
  }
}

function syncRegistryOnCreate(projectRoot, kind, skillName, options = {}) {
  const registryPath = getRegistryPath(projectRoot);
  const registry = readJson(registryPath);
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
  writeJson(registryPath, registry);
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
  const existingIndex = fixtures.cases.findIndex((item) => routeFixtureReferencesSkill(item, skillName) && String(item.name || '').trim() === governedFixture.name);
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
  const config = PLACEHOLDER_ROUTE_BY_KIND[kind];
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
}

function shouldSyncRouteMetadataRecord(record, options = {}) {
  if (!record || record.status === 'archived') return false;
  if (!record.userInvocable || record.kind === 'router' || record.kind === 'adapter') return false;
  if (record.status === 'stable') return true;
  if (options.includeExperimental && record.status === 'experimental') return true;
  if (options.includeDeprecated && record.status === 'deprecated') return true;
  return false;
}

function syncRouteMetadata(projectRoot, options = {}) {
  const skillRecords = collectAllSkillRecords(projectRoot);
  const skillsRoot = getAuthoritativeSkillsRoot();
  const selected = [];

  for (const record of skillRecords) {
    if (options.skillName && record.name !== options.skillName) {
      continue;
    }
    if (!options.skillName && !shouldSyncRouteMetadataRecord(record, options)) {
      continue;
    }

    const resolved = resolveSkillDirByName(skillsRoot, record.name);
    if (!resolved) {
      fail(`unknown skill '${record.name}' while syncing route metadata`);
    }

    selected.push({ record, resolved });
  }

  if (selected.length < 1) {
    if (options.skillName) {
      fail(`no eligible skill found for route metadata sync: '${options.skillName}'`);
    }
    return {
      action: 'sync-route-metadata',
      scope: 'all',
      synced: [],
      follow_up: ['npm run verify:skill-system']
    };
  }

  for (const item of selected) {
    syncRouteMapForSkill(projectRoot, item.record.name, { resolved: item.resolved });
    syncRouteFixturesForSkill(projectRoot, item.record.name);
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

function recomputeSkillLevelSummary(data) {
  const summary = data['skill-level-summary'] || {};
  const top = Array.isArray(summary['top-level-enough-now']) ? summary['top-level-enough-now'] : [];
  const strong = Array.isArray(summary['strong-uplift-but-not-top-yet']) ? summary['strong-uplift-but-not-top-yet'] : [];
  const overlay = Array.isArray(summary['useful-overlay-not-top-level-alone']) ? summary['useful-overlay-not-top-level-alone'] : [];
  summary.counts = {
    'top-level-enough-now': top.length,
    'strong-uplift-but-not-top-yet': strong.length,
    'useful-overlay-not-top-level-alone': overlay.length,
    'total-skills-rated': top.length + strong.length + overlay.length,
  };
  data['skill-level-summary'] = summary;
}

function normalizeCapabilityRatingBuckets(ratings) {
  const buckets = ratings['rating-buckets'] || {};
  buckets['top-ready'] = Array.isArray(buckets['top-ready']) ? buckets['top-ready'] : [];
  buckets['strong-but-not-top'] = Array.isArray(buckets['strong-but-not-top']) ? buckets['strong-but-not-top'] : [];
  buckets.thin = Array.isArray(buckets.thin) ? buckets.thin : [];
  ratings['rating-buckets'] = buckets;
  return buckets;
}

function recomputeCapabilityRatingCounts(ratings) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  ratings.counts = {
    'top-ready': buckets['top-ready'].length,
    'strong-but-not-top': buckets['strong-but-not-top'].length,
    thin: buckets.thin.length,
    total: buckets['top-ready'].length + buckets['strong-but-not-top'].length + buckets.thin.length
  };
}

function sortCapabilityRatingBuckets(ratings) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  buckets['top-ready'].sort();
  buckets['strong-but-not-top'].sort();
  buckets.thin.sort();
}

function syncCapabilityRatingsForModules(ratings, moduleIds, bucketName) {
  if (!Array.isArray(moduleIds) || moduleIds.length < 1) {
    sortCapabilityRatingBuckets(ratings);
    recomputeCapabilityRatingCounts(ratings);
    return;
  }

  const buckets = normalizeCapabilityRatingBuckets(ratings);
  const moduleSet = new Set(moduleIds);
  buckets['top-ready'] = removeValues(buckets['top-ready'], moduleSet);
  buckets['strong-but-not-top'] = removeValues(buckets['strong-but-not-top'], moduleSet);
  buckets.thin = removeValues(buckets.thin, moduleSet);

  if (bucketName && buckets[bucketName]) {
    for (const moduleId of moduleIds) {
      if (!buckets[bucketName].includes(moduleId)) {
        buckets[bucketName].push(moduleId);
      }
    }
  }

  sortCapabilityRatingBuckets(ratings);
  recomputeCapabilityRatingCounts(ratings);
}

function getCapabilityModuleIdsForSkill(projectRoot, skillName) {
  const registryPath = getRegistryPath(projectRoot);
  if (!fs.existsSync(registryPath)) {
    return [];
  }

  const registry = readJson(registryPath);
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

function getCapabilityRatingBucketForModule(ratings, moduleId) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  for (const bucketName of CAPABILITY_RATING_BUCKET_SEQUENCE) {
    if (buckets[bucketName].includes(moduleId)) {
      return bucketName;
    }
  }
  return null;
}

function collectCapabilityModuleMetadata(projectRoot) {
  const registryPath = getRegistryPath(projectRoot);
  if (!fs.existsSync(registryPath)) {
    return new Map();
  }

  const registry = readJson(registryPath);
  const groups = Array.isArray(registry['module-groups']) ? registry['module-groups'] : [];
  const metadata = new Map();

  for (const group of groups) {
    const modules = Array.isArray(group && group.modules) ? group.modules : [];
    for (const module of modules) {
      const moduleId = String(module && module.id || '').trim();
      if (!moduleId) continue;
      metadata.set(moduleId, {
        'host-skill': String(group && group['host-skill'] || '').trim(),
        'host-kind': String(group && group['host-kind'] || '').trim(),
        path: String(module && module.path || '').trim(),
        capability: String(module && module.capability || '').trim()
      });
    }
  }

  return metadata;
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

function rebuildCapabilityRatingsNextBatch(projectRoot, ratings) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  const metadata = collectCapabilityModuleMetadata(projectRoot);
  const nextBatch = [];

  for (const bucketName of ['thin', 'strong-but-not-top']) {
    const policy = CAPABILITY_NEXT_BATCH_POLICY_BY_BUCKET[bucketName];
    for (const moduleId of Array.isArray(buckets[bucketName]) ? buckets[bucketName] : []) {
      const moduleMetadata = metadata.get(moduleId) || {};
      nextBatch.push({
        scope: 'capability-module',
        module: moduleId,
        'host-skill': moduleMetadata['host-skill'] || '',
        'host-kind': moduleMetadata['host-kind'] || '',
        rating: bucketName,
        priority: policy.priority,
        ...(moduleMetadata.path ? { path: moduleMetadata.path } : {}),
        ...(moduleMetadata.capability ? { capability: moduleMetadata.capability } : {}),
        'next-step': policy['next-step']
      });
    }
  }

  ratings['next-batch'] = nextBatch;
}

function syncRatingsOnCreate(projectRoot, skillName, options = {}) {
  const ratingsPath = getRatingsPath(projectRoot);
  const ratings = readJson(ratingsPath);
  updateRatingsSummaryEntry(ratings, skillName, 'experimental');
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
  const registryPath = getRegistryPath(projectRoot);
  const registry = readJson(registryPath);
  registry.skills = removeFromArray(registry.skills, null).filter((entry) => entry && entry.name !== skillName);
  registry['module-groups'] = (Array.isArray(registry['module-groups']) ? registry['module-groups'] : []).filter((group) => group['host-skill'] !== skillName);
  writeJson(registryPath, registry);
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
  updateRatingsSummaryEntry(ratings, skillName, 'archived');
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
      getRatingsPath(projectRoot)
    ]
  });

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

  return {
    action: 'set-module-rating',
    scope: options.skillName ? 'skill' : 'module',
    ...(options.skillName ? { skill: options.skillName } : {}),
    ...(options.moduleId ? { module: options.moduleId } : {}),
    modules: targets.map((target) => target.module),
    rating: targetBucket,
    'previous-ratings': previousRatings,
    ...(parseBoolean(options.allowSkip, false) ? { 'allow-skip': true } : {}),
    follow_up: [
      'npm run verify:skill-system'
    ]
  };
}

function normalizeRatingsSummary(ratings) {
  const summary = ratings['skill-level-summary'] || {};
  summary['top-level-enough-now'] = Array.isArray(summary['top-level-enough-now']) ? summary['top-level-enough-now'] : [];
  summary['strong-uplift-but-not-top-yet'] = Array.isArray(summary['strong-uplift-but-not-top-yet']) ? summary['strong-uplift-but-not-top-yet'] : [];
  summary['useful-overlay-not-top-level-alone'] = Array.isArray(summary['useful-overlay-not-top-level-alone']) ? summary['useful-overlay-not-top-level-alone'] : [];
  ratings['skill-level-summary'] = summary;
  return summary;
}

function updateRatingsSummaryEntry(ratings, skillName, status) {
  const summary = normalizeRatingsSummary(ratings);
  const projectRoot = getProjectRoot();
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  const kind = resolved ? String(resolved.parsed.map.get('kind') || '').trim() : '';
  const bucket = GENERATED_STATUS_BUCKET_BY_STATUS.get(status) || null;
  for (const key of GENERATED_STATUS_BUCKET_BY_STATUS.values()) {
    summary[key] = removeFromArray(summary[key], skillName);
  }
  if (kind !== 'adapter' && bucket && !summary[bucket].includes(skillName)) {
    summary[bucket].push(skillName);
    summary[bucket].sort();
  }
  recomputeSkillLevelSummary(ratings);
}

function renderCapabilityModuleSection(values) {
  const modules = Array.isArray(values) ? values : [];
  if (modules.length < 1) {
    return EMPTY_CAPABILITY_MODULE_SECTION_LINE;
  }
  return modules.map((moduleId) => `- \`${moduleId}\``).join('\n');
}

function renderCapabilityNextBatchSection(values) {
  const queue = Array.isArray(values) ? values : [];
  if (queue.length < 1) {
    return EMPTY_NEXT_BATCH_LINE;
  }

  return queue.map((item) => {
    const moduleId = String(item && item.module || '').trim() || 'unknown-module';
    const hostSkill = String(item && item['host-skill'] || '').trim() || 'unknown-skill';
    const rating = String(item && item.rating || '').trim() || 'unknown-rating';
    const nextStep = String(item && item['next-step'] || '').trim() || 'fill in the next promotion step';
    return `- \`${moduleId}\` (\`${hostSkill}\`, \`${rating}\`): ${nextStep}`;
  }).join('\n');
}

function replaceMarkdownSection(text, heading, body) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(## ${escaped}\\n\\n)([\\s\\S]*?)(?=\\n## |\\s*$)`);
  if (!pattern.test(text)) {
    return text;
  }
  return text.replace(pattern, (_, prefix) => `${prefix}${String(body || '').trimEnd()}\n`);
}

function writeRatings(projectRoot, ratings) {
  const ratingsPath = getRatingsPath(projectRoot);
  rebuildCapabilityRatingsNextBatch(projectRoot, ratings);
  writeJson(ratingsPath, ratings);
  syncCapabilityRatingsDoc(projectRoot);
}

function readRatings(projectRoot) {
  return readJson(getRatingsPath(projectRoot));
}

function getCapabilityModuleRatingsForSkill(projectRoot, skillName) {
  const moduleIds = getCapabilityModuleIdsForSkill(projectRoot, skillName);
  const ratings = readRatings(projectRoot);
  return moduleIds.map((moduleId) => ({
    module: moduleId,
    rating: getCapabilityRatingBucketForModule(ratings, moduleId) || 'unrated'
  }));
}

function normalizeTextValue(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function buildExpectedStableOpenAiMetadata(projectRoot, record, parsed) {
  const skillsRoot = getAuthoritativeSkillsRoot();
  const absoluteSkillDir = path.join(getBundleRoot(projectRoot), record.file, '..');
  return buildOpenAiMetadata({
    name: record.name,
    title: parsed.map.get('title'),
    description: parsed.map.get('description'),
    kind: record.kind,
    skillRelPath: path.relative(skillsRoot, path.normalize(absoluteSkillDir)).split(path.sep).join('/')
  });
}

function collectTopTierBlockersForSkill(projectRoot, record, options = {}) {
  const blockers = [];
  const bundleRoot = getBundleRoot(projectRoot);
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), record.name);
  if (!resolved) {
    fail(`unknown skill '${record.name}'`);
  }
  const parsed = resolved.parsed;
  const skillDir = path.join(bundleRoot, path.dirname(record.file));
  const skillFile = path.join(bundleRoot, record.file);
  const routeMap = readJson(getRouteMapPath(projectRoot));
  const routeFixtures = readJson(getRouteFixturesPath(projectRoot));
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const runtimeProof = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { proofs: [] };
  const hostSmokeScorecardPath = getHostSmokeScorecardPath(bundleRoot);
  const hostSmokeScorecard = fs.existsSync(hostSmokeScorecardPath)
    ? readJson(hostSmokeScorecardPath)
    : { skills: [] };
  const route = (Array.isArray(routeMap.routes) ? routeMap.routes : []).find((item) => item && item.skill === record.name) || null;
  const fixtures = Array.isArray(routeFixtures.cases) ? routeFixtures.cases : [];
  const stableReferenceFloor = STABLE_REFERENCE_FLOOR_BY_KIND[record.kind] || 0;
  const proofEntry = (Array.isArray(runtimeProof.proofs) ? runtimeProof.proofs : []).find((item) => item && item.skill === record.name) || null;
  const hostSmokeScorecardEntry = (Array.isArray(hostSmokeScorecard.skills) ? hostSmokeScorecard.skills : [])
    .find((item) => item && item.skill === record.name) || null;
  const expectedExplicitInvocation = !Array.isArray(record.triggerMode) || !record.triggerMode.includes('auto');
  const referenceDir = path.join(skillDir, 'references');
  const referenceFiles = fs.existsSync(referenceDir)
    ? fs.readdirSync(referenceDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => entry.name)
    : [];

  if (record.userInvocable) {
    const concreteKeywords = (Array.isArray(record.triggerKeywords) ? record.triggerKeywords : [])
      .filter((keyword) => !/-signal$|-trigger$/i.test(String(keyword || '')));
    if (concreteKeywords.length < 2) {
      blockers.push({
        type: 'trigger-keywords',
        file: record.file,
        message: 'stable skill should expose at least two concrete trigger keywords'
      });
    }
  }

  if (stableReferenceFloor > 0 && referenceFiles.length < stableReferenceFloor) {
    blockers.push({
      type: 'reference-floor',
      file: record.file,
      message: `stable skill only has ${referenceFiles.length} reference files; expected at least ${stableReferenceFloor} for top-tier depth`
    });
  }

  const description = String(parsed.map.get('description') || '');
  if (/template scaffold/i.test(description)) {
    blockers.push({
      type: 'template-description',
      file: record.file,
      message: 'stable skill still looks like a template scaffold'
    });
  }
  if (/TODO:/i.test(description)) {
    blockers.push({
      type: 'todo-description',
      file: record.file,
      message: 'stable skill description still contains TODO placeholder text'
    });
  }
  if (/-template$/.test(String(record.name || ''))) {
    blockers.push({
      type: 'template-name',
      file: record.file,
      message: 'stable skill name still looks like a template artifact'
    });
  }

  if (record.userInvocable && !['router', 'adapter'].includes(record.kind)) {
    if (!route) {
      blockers.push({
        type: 'route-missing',
        file: record.file,
        message: `user-invocable skill '${record.name}' is missing from route-map.generated.json`
      });
    } else {
      const activation = route.activation || {};
      const supportedHosts = uniqueSorted(route['supported-hosts']);
      const triggerKeywords = uniqueSorted(activation['trigger-keywords']);
      const negativeKeywords = uniqueSorted(activation['negative-keywords']);
      const aliases = uniqueSorted(route.aliases);
      const autoChain = uniqueSorted(route['auto-chain']);
      const conflictsWith = uniqueSorted(route['conflicts-with']);

      const requireListSync = (label, actual, expected) => {
        const missing = expected.filter((item) => !actual.includes(item));
        if (missing.length > 0) {
          blockers.push({
            type: `route-${label}`,
            file: 'registry/route-map.generated.json',
            message: `route '${record.name}' is missing ${label} declared in SKILL metadata: ${missing.join(', ')}`
          });
        }
      };

      requireListSync('supported-hosts', supportedHosts, uniqueSorted(record.supportedHosts));
      requireListSync('trigger-keywords', triggerKeywords, uniqueSorted(record.triggerKeywords));
      requireListSync('negative-keywords', negativeKeywords, uniqueSorted(record.negativeKeywords));
      requireListSync('aliases', aliases, uniqueSorted(record.aliases));
      requireListSync('auto-chain entries', autoChain, uniqueSorted(record.autoChain));
      requireListSync('conflicts-with entries', conflictsWith, uniqueSorted(record.conflictsWith));

      if (Boolean(activation['requires-explicit-invocation']) !== expectedExplicitInvocation) {
        blockers.push({
          type: 'route-explicit-mode',
          file: 'registry/route-map.generated.json',
          message: `route '${record.name}' requires-explicit-invocation '${Boolean(activation['requires-explicit-invocation'])}' is out of sync with SKILL trigger-mode`
        });
      }
    }
  }

  if (record.userInvocable && !hasRouteFixtureEvidence(record.name, fixtures, { includeGoverned: false })) {
    blockers.push({
      type: 'route-fixture-evidence',
      file: record.file,
      message: `stable skill '${record.name}' has no route fixture evidence`
    });
  }

  const openAiMetadataPath = path.join(skillDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(openAiMetadataPath)) {
    blockers.push({
      type: 'host-metadata-missing',
      file: record.file,
      message: 'stable skill is missing agents/openai.yaml host metadata'
    });
  } else {
    const parsedMetadata = readOpenAiMetadataFile(openAiMetadataPath);
    if (parsedMetadata.error) {
      blockers.push({
        type: 'host-metadata-parse',
        file: path.relative(bundleRoot, openAiMetadataPath).split(path.sep).join('/'),
        message: `agents/openai.yaml parse failed: ${parsedMetadata.error}`
      });
    } else {
      const expectedMetadata = buildExpectedStableOpenAiMetadata(projectRoot, record, parsed);
      for (const key of OPENAI_METADATA_KEYS) {
        if (normalizeTextValue(parsedMetadata.data[key]) !== normalizeTextValue(expectedMetadata[key])) {
          blockers.push({
            type: `host-metadata-${key}`,
            file: path.relative(bundleRoot, openAiMetadataPath).split(path.sep).join('/'),
            message: `agents/openai.yaml '${key}' is out of sync with SKILL.md`
          });
        }
      }
    }
  }

  if (record.runtime === 'scripted') {
    const scriptPath = path.join(skillDir, 'scripts', 'run.js');
    if (!fs.existsSync(scriptPath)) {
      blockers.push({
        type: 'script-missing',
        file: record.file,
        message: 'scripted runtime declared but scripts/run.js is missing'
      });
    }
    if ((record.runtimeProofItems || []).length < 2) {
      blockers.push({
        type: 'runtime-proof-bullets',
        file: record.file,
        message: 'stable scripted skill should declare at least two runtime proof bullets in a Runtime Proof section'
      });
    }
    if (!record.smokeManifest) {
      blockers.push({
        type: 'smoke-manifest-missing',
        file: record.file,
        message: 'stable scripted skill should declare scripts/smoke.json so host-smoked promotion has an executable contract surface'
      });
    } else {
      for (const error of validateSmokeManifest(record.smokeManifest)) {
        blockers.push({
          type: 'smoke-manifest-invalid',
          file: record.smokeManifestPath,
          message: error
        });
      }
      const smokeText = JSON.stringify(record.smokeManifest);
      if (/tool-template|guard-template|Replace this stub/i.test(smokeText)) {
        blockers.push({
          type: 'smoke-manifest-template',
          file: record.smokeManifestPath,
          message: 'stable scripted skill smoke manifest still contains template placeholder content'
        });
      }
    }

    if (!proofEntry) {
      blockers.push({
        type: 'runtime-proof-missing',
        file: record.file,
        message: `stable scripted skill '${record.name}' is missing from runtime-proof.generated.json`
      });
    } else {
      if ((Array.isArray(proofEntry.contracts) ? proofEntry.contracts : []).length < 2) {
        blockers.push({
          type: 'runtime-proof-contracts',
          file: 'registry/runtime-proof.generated.json',
          message: `runtime proof entry for '${record.name}' should declare at least two contracts`
        });
      }
      if (!Array.isArray(proofEntry['evidence-tests']) || proofEntry['evidence-tests'].length < 1) {
        blockers.push({
          type: 'runtime-proof-evidence',
          file: 'registry/runtime-proof.generated.json',
          message: `runtime-proof level 'declared-and-tested' for '${record.name}' requires at least one evidence test before status can move to 'stable'`
        });
      }
      try {
        buildRuntimeProofEntry(
          { ...record, status: 'stable' },
          {
            level: proofEntry.level,
            evidenceTests: proofEntry['evidence-tests']
          },
          proofEntry
        );
      } catch (error) {
        blockers.push({
          type: 'runtime-proof-contract-drift',
          file: 'registry/runtime-proof.generated.json',
          message: String(error && error.message ? error.message : error)
        });
      }

      const hostSmokePolicy = normalizeHostSmokePolicy(proofEntry['host-smoke-policy']);
      if (hostSmokePolicy && hostSmokePolicy['target-level'] === 'host-smoked') {
        if (!hostSmokeScorecardEntry) {
          blockers.push({
            type: 'host-smoke-scorecard-missing',
            file: 'benchmark/host-smoke/scorecard.generated.json',
            message: `host-smoke scorecard is missing an entry for '${record.name}'`
          });
        } else {
          if (hostSmokeScorecardEntry.level !== 'host-smoked') {
            blockers.push({
              type: 'host-smoke-level',
              file: 'benchmark/host-smoke/scorecard.generated.json',
              message: `critical host-smoke policy for '${record.name}' requires level 'host-smoked'`
            });
          }
          if (hostSmokeScorecardEntry['governance-status'] !== 'satisfied') {
            blockers.push({
              type: 'host-smoke-governance',
              file: 'benchmark/host-smoke/scorecard.generated.json',
              message: `critical host-smoke policy for '${record.name}' is not yet satisfied (${hostSmokeScorecardEntry['governance-status'] || 'unknown'})`
            });
          }
        }
      }
    }
  }

  if (!parsed.map.get('last-reviewed')) {
    blockers.push({
      type: 'last-reviewed',
      file: record.file,
      message: "status 'stable' should declare last-reviewed"
    });
  }
  if (!parsed.map.get('review-cycle-days')) {
    blockers.push({
      type: 'review-cycle-days',
      file: record.file,
      message: "status 'stable' should declare review-cycle-days"
    });
  }
  if (record.lastReviewed && record.reviewCycleDays != null) {
    const reviewedAt = new Date(`${record.lastReviewed}T00:00:00Z`);
    if (!Number.isNaN(reviewedAt.getTime())) {
      const nextDue = new Date(reviewedAt.getTime());
      nextDue.setUTCDate(nextDue.getUTCDate() + record.reviewCycleDays);
      if (Date.now() > nextDue.getTime()) {
        blockers.push({
          type: 'review-cadence-expired',
          file: record.file,
          message: `stable skill review cadence expired on ${nextDue.toISOString().slice(0, 10)}`
        });
      }
    }
  }

  return blockers;
}

function assessTopTierReadiness(projectRoot, skillName) {
  const recordIndex = buildSkillRecordIndex(projectRoot);
  const record = recordIndex.get(skillName) || null;
  if (!record) {
    fail(`unknown skill '${skillName}'`);
  }

  const moduleRatings = getCapabilityModuleRatingsForSkill(projectRoot, skillName);
  const blockingFindings = collectTopTierBlockersForSkill(projectRoot, record, { targetStatus: 'stable' });
  const nonTopModules = moduleRatings.filter((item) => item.rating !== 'top-ready');
  const ready = blockingFindings.length < 1 && nonTopModules.length < 1;

  return {
    action: 'assess-top-tier',
    skill: skillName,
    status: record.status,
    kind: record.kind,
    ready,
    'capability-modules': moduleRatings,
    blockers: [
      ...nonTopModules.map((item) => ({
        type: 'capability-module-rating',
        module: item.module,
        rating: item.rating,
        message: `capability module '${item.module}' must be rated 'top-ready'`
      })),
      ...blockingFindings.map((item) => ({
        type: 'verification-error',
        file: item.file,
        message: item.message
      }))
    ],
    follow_up: ready
      ? ["set-status stable is allowed once you are ready to promote"]
      : [
          'fix verification blockers first',
          `promote remaining capability modules for '${skillName}' to top-ready`,
          'rerun assess-top-tier after the fixes land'
        ]
  };
}

function enforceTopTierReadinessForStable(projectRoot, skillName) {
  const assessment = assessTopTierReadiness(projectRoot, skillName);
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
  writeJson(runtimeProofPath, registry);
  refreshHostSmokeScorecard(projectRoot, registry.proofs);
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

function refreshSkillInvestmentBacklog(projectRoot, options = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
  const skillRecords = Array.isArray(options.skillRecords) ? options.skillRecords : collectAllSkillRecords(projectRoot);
  const registryData = options.registryData || readJson(getRegistryPath(projectRoot));
  const ratingsData = options.ratingsData || readJson(getRatingsPath(projectRoot));
  const reviewQueueData = options.reviewQueueData || readJson(getReviewQueueRegistryPath(projectRoot));
  const opportunityQueueData = options.opportunityQueueData || readOpportunityQueue(projectRoot);
  const admissionLedgerData = options.admissionLedgerData || readAdmissionLedger(projectRoot);
  const evolutionLedgerData = options.evolutionLedgerData || readEvolutionLedger(projectRoot);
  const routeFixturesData = options.routeFixturesData || readJson(getRouteFixturesPath(projectRoot));
  const result = buildSkillInvestmentBacklog(bundleRoot, {
    skillRecords,
    registryData,
    ratingsData,
    reviewQueueData,
    opportunityQueueData,
    admissionLedgerData,
    evolutionLedgerData,
    routeFixturesData
  });
  writeJson(getSkillInvestmentBacklogRegistryPath(projectRoot), result);
  return {
    file: getSkillInvestmentBacklogRegistryPath(projectRoot),
    payload: result
  };
}

function normalizeEvidenceTests(values) {
  const items = Array.isArray(values) ? values : [];
  const normalized = [];
  const seen = new Set();
  for (const raw of items) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function normalizeSmokeCommands(commands) {
  const normalized = [];
  for (const command of Array.isArray(commands) ? commands : []) {
    if (!command || typeof command !== 'object') continue;
    normalized.push({
      ...(command.cwd ? { cwd: command.cwd } : {}),
      argv: [...(Array.isArray(command.argv) ? command.argv : [])],
      expect: { ...(command.expect || {}) },
      ...(command['timeout-ms'] !== undefined ? { 'timeout-ms': command['timeout-ms'] } : {})
    });
  }
  return normalized;
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
  const manifestPath = String(record.smokeManifestPath || '').trim();
  const manifest = record.smokeManifest;

  if (!manifestPath || !manifest) {
    return null;
  }

  const errors = validateSmokeManifest(manifest);
  if (errors.length > 0) {
    fail(`invalid smoke manifest for '${record.name}': ${errors.join('; ')}`);
  }

  return {
    manifest: manifestPath,
    ...(manifest.freshness ? { freshness: { ...manifest.freshness } } : {}),
    commands: normalizeSmokeCommands(manifest.commands)
  };
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

  if (options.evidenceTests !== undefined) {
    return {
      evidenceTests: normalizeEvidenceTests(options.evidenceTests),
      evidenceTestSource: 'explicit',
      suggestedEvidenceTests
    };
  }

  const existingEvidenceTests = normalizeEvidenceTests(existing?.['evidence-tests']);
  if (existingEvidenceTests.length > 0) {
    return {
      evidenceTests: existingEvidenceTests,
      evidenceTestSource: 'existing',
      suggestedEvidenceTests
    };
  }

  if (options.autoEvidenceTests && suggestedEvidenceTests.length > 0) {
    return {
      evidenceTests: suggestedEvidenceTests,
      evidenceTestSource: 'suggested',
      suggestedEvidenceTests
    };
  }

  return {
    evidenceTests: [],
    evidenceTestSource: 'none',
    suggestedEvidenceTests
  };
}

function shouldHaveRuntimeProofEntry(record) {
  return isGovernedRuntimeProofRecord(record);
}

function defaultRuntimeProofLevelForStatus(status) {
  return status === 'stable' ? 'declared-and-tested' : 'declared-only';
}

function describeHostSmokedEvidenceFailure(evaluation) {
  switch (evaluation && evaluation.reason) {
    case 'invalid-contract':
      return 'current host-smoke contract is invalid or incomplete';
    case 'missing':
      return 'no matching runtime host-smoke artifact exists for the current contract';
    case 'contract-drift':
      return 'recorded runtime host-smoke artifacts do not match the current contract';
    case 'failing':
      return 'the latest matching runtime host-smoke artifact did not pass';
    case 'stale':
      return 'the latest passing runtime host-smoke artifact is older than the declared freshness window';
    default:
      return 'host-smoke evidence is not sufficient';
  }
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
  const level = String(overrides.level || existing?.level || defaultRuntimeProofLevelForStatus(record.status)).trim();
  if (!RUNTIME_PROOF_LEVELS.has(level)) {
    fail(`invalid runtime-proof level '${level}' for '${record.name}'`);
  }

  const evidenceTests = normalizeEvidenceTests(
    overrides.evidenceTests !== undefined
      ? overrides.evidenceTests
      : existing?.['evidence-tests']
  );
  const hostSmokePolicy = buildHostSmokePolicy(record, overrides, existing);
  const hostSmoke = record.status === 'stable' || level === 'host-smoked' || hostSmokePolicy['target-level'] !== 'declared-only'
    ? resolveHostSmoke(record)
    : null;

  if (level === 'host-smoked' && (!hostSmoke || !Array.isArray(hostSmoke.commands) || hostSmoke.commands.length < 1)) {
    fail(`runtime-proof level 'host-smoked' for '${record.name}' requires a valid scripts/smoke.json manifest`);
  }
  if (hostSmokePolicy['target-level'] === 'host-smoked') {
    const freshness = hostSmoke && hostSmoke.freshness ? hostSmoke.freshness : null;
    if (!freshness || freshness['max-age'] !== hostSmokePolicy['freshness-days'] || freshness.unit !== 'days') {
      fail(`host-smoke policy for '${record.name}' requires scripts/smoke.json freshness to match host-smoke-freshness-days in days`);
    }
  }

  return {
    skill: record.name,
    kind: record.kind,
    level,
    contracts: [...(record.runtimeProofItems || [])],
    'evidence-tests': evidenceTests,
    'host-smoke-policy': hostSmokePolicy,
    ...(hostSmoke ? { 'host-smoke': hostSmoke } : {})
  };
}

function writeRuntimeProofRegistry(projectRoot, proofs, options = {}) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  writeJson(runtimeProofPath, {
    'schema-version': 1,
    proofs
  });
  const scorecard = refreshHostSmokeScorecard(projectRoot, proofs, {
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
  try {
    const result = writeSystemReadiness(bundleRoot);
    if (options.returnDetails === true || options.bestEffort === true) {
      return {
        ok: true,
        file: result.file
      };
    }
    return result.file;
  } catch (error) {
    if (!options.bestEffort) {
      throw error;
    }
    return {
      ok: false,
      file: readinessPath,
      code: error && error.code ? error.code : 'UNKNOWN',
      message: error && error.message ? error.message : String(error)
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
      writeRuntimeProofRegistry(projectRoot, activeProofs);
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
  if (!RUNTIME_PROOF_LEVELS.has(nextLevel)) {
    fail(`invalid runtime-proof level '${nextLevel}'`);
  }
  proof.level = nextLevel;
  writeRuntimeProofRegistry(projectRoot, proofs, {
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
  if (!HOSTS.includes(host)) {
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
      writeRuntimeProofRegistry(projectRoot, nextProofs);
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
  const docPath = getRatingsDocPath(projectRoot);
  if (!fs.existsSync(docPath)) {
    return;
  }

  const ratings = readJson(getRatingsPath(projectRoot));
  const moduleCounts = ratings.counts || {};
  const skillCounts = ((ratings['skill-level-summary'] || {}).counts) || {};
  const topSkills = Number(skillCounts['top-level-enough-now'] || 0);
  const strongSkills = Number(skillCounts['strong-uplift-but-not-top-yet'] || 0);
  const overlaySkills = Number(skillCounts['useful-overlay-not-top-level-alone'] || 0);
  const totalSkills = Number(skillCounts['total-skills-rated'] || 0);
  const topModules = Number(moduleCounts['top-ready'] || 0);
  const totalModules = Number(moduleCounts.total || 0);

  let text = fs.readFileSync(docPath, 'utf8');
  text = replaceLine(text, /^- TOP-ready modules:\s*\d+$/m, `- TOP-ready modules: ${topModules}`);
  text = replaceLine(text, /^- strong-but-not-top modules:\s*\d+$/m, `- strong-but-not-top modules: ${Number(moduleCounts['strong-but-not-top'] || 0)}`);
  text = replaceLine(text, /^- thin modules:\s*\d+$/m, `- thin modules: ${Number(moduleCounts.thin || 0)}`);
  text = replaceLine(text, /^- total rated capability modules:\s*\d+$/m, `- total rated capability modules: ${totalModules}`);
  text = replaceLine(text, /^- top-level enough now:\s*\d+$/m, `- top-level enough now: ${topSkills}`);
  text = replaceLine(text, /^- strong uplift, but not top yet:\s*\d+$/m, `- strong uplift, but not top yet: ${strongSkills}`);
  text = replaceLine(text, /^- useful overlay, not top-level alone:\s*\d+$/m, `- useful overlay, not top-level alone: ${overlaySkills}`);

  const allTopLevel = strongSkills === 0 && overlaySkills === 0 && topSkills === totalSkills;
  const allModulesTopReady = topModules === totalModules;
  const skillVerdict = allTopLevel
    ? 'After the latest uplift round, every currently registered host skill is rated top-level enough under the weak-model-uplift standard.'
    : 'Current host skills are split across the top-level, strong-uplift, and overlay buckets under the weak-model-uplift standard.';
  const moduleVerdict = allModulesTopReady
    ? `- all ${topModules} registered capability modules are TOP-ready`
    : `- ${topModules} of ${totalModules} registered capability modules are TOP-ready`;
  const hostVerdict = allTopLevel
    ? `- all ${totalSkills} registered host skills are now rated top-level enough`
    : `- ${topSkills} of ${totalSkills} registered host skills are top-level enough right now`;

  text = replaceLine(
    text,
    /^(After the latest uplift round,.*|Current host skills are split across the top-level, strong-uplift, and overlay buckets under the weak-model-uplift standard\.)$/m,
    skillVerdict
  );
  text = replaceLine(
    text,
    /^- all \d+ registered capability modules are TOP-ready$/m,
    moduleVerdict
  );
  text = replaceLine(
    text,
    /^- \d+ of \d+ registered capability modules are TOP-ready$/m,
    moduleVerdict
  );
  text = replaceLine(
    text,
    /^- all \d+ registered host skills are now rated top-level enough$/m,
    hostVerdict
  );
  text = replaceLine(
    text,
    /^- \d+ of \d+ registered host skills are top-level enough right now$/m,
    hostVerdict
  );

  const buckets = normalizeCapabilityRatingBuckets(ratings);
  text = replaceMarkdownSection(text, 'Next Batch', renderCapabilityNextBatchSection(ratings['next-batch']));
  text = replaceMarkdownSection(text, 'TOP-ready', renderCapabilityModuleSection(buckets['top-ready']));
  text = replaceMarkdownSection(text, 'Strong But Not Top', renderCapabilityModuleSection(buckets['strong-but-not-top']));
  text = replaceMarkdownSection(text, 'Thin', renderCapabilityModuleSection(buckets.thin));

  fs.writeFileSync(docPath, text, 'utf8');
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
  refreshSystemReadiness(projectRoot);
}

function deferBlockedSkillCreate(projectRoot, kind, skillName, targetDir, constraint, options = {}) {
  if (!options.requestId && !options.opportunityId) {
    fail('--defer-when-host-blocked requires --request-id or --opportunity-id so the blocked create stays governed');
  }

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

    if (options.requestId) {
      admissionEntry = resolveAdmissionDecision(projectRoot, options.requestId, {
        status: 'blocked',
        note
      });
    }
    if (options.opportunityId) {
      opportunityEntry = resolveOpportunity(projectRoot, options.opportunityId, {
        status: 'blocked',
        admissionRequestId: options.requestId || null,
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
      ...(options.requestId ? { 'request-id': options.requestId } : {}),
      ...(options.opportunityId ? { 'opportunity-id': options.opportunityId } : {}),
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
      'rerun-command': `node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${kind} ${skillName}${options.scaffoldModules ? ' --scaffold-modules' : ''}${options.deferWhenHostBlocked ? ' --defer-when-host-blocked' : ''}${options.requestId ? ` --request-id ${options.requestId}` : ''}${options.opportunityId ? ` --opportunity-id ${options.opportunityId}` : ''}`,
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
      ...(options.requestId ? { 'admission-request-id': options.requestId } : {}),
      ...(options.opportunityId ? { 'opportunity-id': options.opportunityId } : {}),
      ...(admissionEntry ? { 'admission-status': admissionEntry.status } : {}),
      ...(opportunityEntry ? { 'linked-opportunity-status': opportunityEntry.status } : {}),
      'pending-scaffold-id': pendingId,
      ...(!readiness.ok ? { readiness_warning: readiness } : {}),
      follow_up: [
        ...(options.requestId ? [`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --request-id ${options.requestId}`] : []),
        ...(options.opportunityId ? [`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id ${options.opportunityId}`] : []),
        `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --skill ${skillName}`,
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source host-writeability',
        `rerun on a writable host: node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${kind} ${skillName}${options.scaffoldModules ? ' --scaffold-modules' : ''}${options.deferWhenHostBlocked ? ' --defer-when-host-blocked' : ''}${options.requestId ? ` --request-id ${options.requestId}` : ''}${options.opportunityId ? ` --opportunity-id ${options.opportunityId}` : ''}`
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

function createSkill(kind, skillName, options = {}) {
  const layer = VALID_KINDS.get(kind);
  if (!layer) fail(`unknown kind '${kind}'`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) fail(`invalid skill name '${skillName}'`);
  if (options.scaffoldModules && !CAPABILITY_MODULE_SCAFFOLD_KINDS.has(kind)) {
    fail(`capability-module scaffolding is only supported for domain and workflow skills, not '${kind}'`);
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
      getAdmissionLedgerPath(projectRoot)
    ]
  });
  const skillsRoot = getAuthoritativeSkillsRoot();
  const targetDir = path.join(skillsRoot, layer, skillName);
  const skillFile = path.join(targetDir, 'SKILL.md');
  ensureInsideAuthoritativeRoot(targetDir, skillsRoot);
  if (fs.existsSync(targetDir) && (fs.existsSync(skillFile) || directoryContainsFiles(targetDir))) {
    fail(`skill already exists at ${targetDir}`);
  }
  const createConstraint = getDirectoryCreateConstraint(projectRoot, targetDir, `create skill '${skillName}'`);
  if (createConstraint) {
    if (options.deferWhenHostBlocked) {
      return deferBlockedSkillCreate(projectRoot, kind, skillName, targetDir, createConstraint, options);
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
    syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, {
      createPlaceholderRoute,
      capabilityModules,
      shared,
      requestId: options.requestId,
      opportunityId: options.opportunityId
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
    refreshSystemReadiness(projectRoot);

    return {
      action: 'create',
      kind,
      skill: skillName,
      path: path.relative(projectRoot, targetDir).split(path.sep).join('/'),
      ...(options.requestId ? { 'admission-request-id': options.requestId } : {}),
      ...(options.opportunityId ? { 'opportunity-id': options.opportunityId } : {}),
      ...(capabilityModules.length > 0
        ? { 'scaffolded-capability-modules': capabilityModules.map((module) => module.id) }
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
      getAdmissionLedgerPath(projectRoot)
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
    syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, {
      createPlaceholderRoute: entry['create-placeholder-route'] === true,
      capabilityModules: Array.isArray(entry['capability-modules']) ? entry['capability-modules'] : [],
      shared: isPlainObject(entry.shared) ? entry.shared : null,
      requestId: normalizeString(entry['request-id']) || null,
      opportunityId: normalizeString(entry['opportunity-id']) || null
    });

    registry.entries = entries.filter((_, currentIndex) => currentIndex !== index);
    writePendingScaffoldRegistry(projectRoot, registry);
    const reviewQueue = refreshReviewQueue(projectRoot);
    refreshSkillInvestmentBacklog(projectRoot, {
      reviewQueueData: reviewQueue.payload,
      pendingScaffoldData: registry
    });
    refreshSystemReadiness(projectRoot);

    return {
      action: 'materialize-pending-scaffold',
      skill: skillName,
      kind,
      path: path.relative(projectRoot, targetDir).split(path.sep).join('/'),
      'pending-scaffold-id': normalizeString(entry['pending-id']),
      ...(normalizeString(entry['request-id']) ? { 'admission-request-id': normalizeString(entry['request-id']) } : {}),
      ...(normalizeString(entry['opportunity-id']) ? { 'opportunity-id': normalizeString(entry['opportunity-id']) } : {}),
      ...(Array.isArray(entry['capability-modules']) && entry['capability-modules'].length > 0
        ? { 'scaffolded-capability-modules': entry['capability-modules'].map((module) => module.id) }
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
    if (record.kind === 'router' || record.kind === 'adapter') {
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

function showSkillInvestmentBacklog(projectRoot, options = {}) {
  const payload = buildSkillInvestmentBacklog(getBundleRoot(projectRoot), {
    skillRecords: collectAllSkillRecords(projectRoot),
    registryData: readJson(getRegistryPath(projectRoot)),
    ratingsData: readJson(getRatingsPath(projectRoot)),
    reviewQueueData: readJson(getReviewQueueRegistryPath(projectRoot)),
    opportunityQueueData: readOpportunityQueue(projectRoot),
    admissionLedgerData: readAdmissionLedger(projectRoot),
    evolutionLedgerData: readEvolutionLedger(projectRoot),
    routeFixturesData: readJson(getRouteFixturesPath(projectRoot))
  });

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
    if (key === 'status') {
      fail('update cannot modify status directly; use set-status, archive, or delete so generated governance surfaces stay synchronized');
    }
    parsedAssignments.push({ key, value });
  }

  assertGeneratedArtifactsWritable(projectRoot, `update skill '${skillName}'`, {
    paths: [
      getReviewQueueRegistryPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getRouteMapPath(projectRoot),
      getRouteFixturesPath(projectRoot)
    ]
  });

  const previousSkillText = fs.readFileSync(resolved.skillFile, 'utf8');
  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    for (const assignment of parsedAssignments) {
      resolved.parsed.map.set(assignment.key, assignment.value);
    }

    const next = renderSkillFile(resolved.parsed);
    fs.writeFileSync(resolved.skillFile, next, 'utf8');
    writeSkillHostMetadata(resolved.dir, resolved.parsed);
    if (
      parseBoolean(resolved.parsed.map.get('user-invocable'), false)
      && !['router', 'adapter'].includes(String(resolved.parsed.map.get('kind') || '').trim())
    ) {
      syncRouteMapForSkill(projectRoot, skillName, { resolved });
      syncRouteFixturesForSkill(projectRoot, skillName);
    }
    const reviewQueue = refreshReviewQueue(projectRoot);
    refreshSkillInvestmentBacklog(projectRoot, {
      reviewQueueData: reviewQueue.payload
    });
    refreshSystemReadiness(projectRoot, { bestEffort: true });

    return {
      action: 'update',
      skill: skillName,
      updated_fields: assignments,
      follow_up: ['npm run verify:skills', 'npm run verify:skill-system'],
    };
  } catch (error) {
    fs.writeFileSync(resolved.skillFile, previousSkillText, 'utf8');
    restoreGeneratedStateSafely(projectRoot, generatedSnapshot, error);
    throw error;
  }
}

function markSkillReviewed(skillName, options = {}) {
  const projectRoot = getProjectRoot();
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);

  const reviewedAt = normalizeReviewDate(options.date || new Date().toISOString().slice(0, 10));
  if (!reviewedAt) {
    fail(`invalid review date '${options.date}'`);
  }

  const existingCycle = normalizeReviewCycleDays(resolved.parsed.map.get('review-cycle-days'));
  const reviewCycleDays = options.reviewCycleDays != null
    ? normalizeReviewCycleDays(options.reviewCycleDays)
    : existingCycle;
  if (reviewCycleDays == null) {
    fail(`skill '${skillName}' needs a valid review-cycle-days before it can be marked reviewed`);
  }

  const requiredPaths = [
    getReviewQueueRegistryPath(projectRoot),
    getSkillInvestmentBacklogRegistryPath(projectRoot)
  ];
  assertGeneratedArtifactsWritable(projectRoot, `mark '${skillName}' reviewed`, {
    paths: requiredPaths
  });

  const previousSkillText = fs.readFileSync(resolved.skillFile, 'utf8');
  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    resolved.parsed.map.set('last-reviewed', reviewedAt);
    resolved.parsed.map.set('review-cycle-days', String(reviewCycleDays));
    const next = renderSkillFile(resolved.parsed);
    fs.writeFileSync(resolved.skillFile, next, 'utf8');

    const queue = refreshReviewQueue(projectRoot);
    const backlog = refreshSkillInvestmentBacklog(projectRoot, {
      reviewQueueData: queue.payload
    });
    refreshSystemReadiness(projectRoot, { bestEffort: true });
    const entry = (queue.payload.skills || []).find((item) => item.skill === skillName) || null;

    return {
      action: 'mark-reviewed',
      skill: skillName,
      'last-reviewed': reviewedAt,
      'review-cycle-days': reviewCycleDays,
      backlog: backlog.payload.summary,
      ...(entry ? { 'review-entry': entry } : {}),
      follow_up: ['npm run verify:skill-system']
    };
  } catch (error) {
    fs.writeFileSync(resolved.skillFile, previousSkillText, 'utf8');
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
  if (suggestedKind && !VALID_KINDS.has(suggestedKind)) {
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
  if (!VALID_STATUSES.has(nextStatus)) {
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
    registry: cloneJsonValue(readJson(getRegistryPath(projectRoot))),
    opportunityQueue: cloneJsonValue(readOpportunityQueue(projectRoot)),
    admissionLedger: cloneJsonValue(readAdmissionLedger(projectRoot)),
    evolutionLedger: cloneJsonValue(readEvolutionLedger(projectRoot)),
    reviewQueue: fs.existsSync(getReviewQueueRegistryPath(projectRoot))
      ? cloneJsonValue(readJson(getReviewQueueRegistryPath(projectRoot)))
      : null,
    pendingScaffolds: fs.existsSync(getPendingScaffoldRegistryFilePath(projectRoot))
      ? cloneJsonValue(readJson(getPendingScaffoldRegistryFilePath(projectRoot)))
      : null,
    skillInvestmentBacklog: fs.existsSync(getSkillInvestmentBacklogRegistryPath(projectRoot))
      ? cloneJsonValue(readJson(getSkillInvestmentBacklogRegistryPath(projectRoot)))
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
      : null
  };
}

function restoreGeneratedState(projectRoot, snapshot) {
  if (!snapshot) return;

  writeJson(getRegistryPath(projectRoot), snapshot.registry);
  writeOpportunityQueue(projectRoot, snapshot.opportunityQueue);
  writeAdmissionLedger(projectRoot, snapshot.admissionLedger);
  writeEvolutionLedger(projectRoot, snapshot.evolutionLedger);
  if (snapshot.reviewQueue) {
    writeJson(getReviewQueueRegistryPath(projectRoot), snapshot.reviewQueue);
  } else if (fs.existsSync(getReviewQueueRegistryPath(projectRoot))) {
    fs.rmSync(getReviewQueueRegistryPath(projectRoot), { force: true });
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
    getRatingsPath(projectRoot),
    getRuntimeProofPath(projectRoot),
    getHostSmokeScorecardPath(getBundleRoot(projectRoot)),
    getRouteMapPath(projectRoot),
    getRouteFixturesPath(projectRoot)
  ];
  if (options.requestId) {
    requiredPaths.push(getEvolutionLedgerPath(projectRoot));
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
      if (wasArchived && userInvocable && !['router', 'adapter'].includes(kind)) {
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
  updateRatingsSummaryEntry(ratings, skillName, status);
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
  assertGeneratedArtifactsWritable(projectRoot, `delete skill '${options && (options.name || options.path) || 'unknown'}'`, {
    paths: [
      getRegistryPath(projectRoot),
      getRouteMapPath(projectRoot),
      getRouteFixturesPath(projectRoot),
      getRatingsPath(projectRoot),
      getSkillInvestmentBacklogRegistryPath(projectRoot),
      getRuntimeProofPath(projectRoot),
      getHostSmokeScorecardPath(getBundleRoot(projectRoot)),
      ...(options && options.requestId ? [getEvolutionLedgerPath(projectRoot)] : [])
    ]
  });
  const skillsRoot = getAuthoritativeSkillsRoot();
  const byName = options && options.name ? resolveSkillDirByName(skillsRoot, options.name) : null;
  const byPath = options && options.path ? resolveSkillDirByRelPath(skillsRoot, options.path) : null;
  const resolved = byName || byPath;
  const identifier = options && (options.name || options.path);

  if (!resolved) fail(`unknown skill '${identifier}'`);
  ensureInsideAuthoritativeRoot(resolved.dir, skillsRoot);
  const generatedSnapshot = snapshotGeneratedState(projectRoot);
  try {
    fs.rmSync(resolved.dir, { recursive: true, force: true });
    syncGeneratedSurfacesOnRemove(projectRoot, resolved.parsed.map.get('name') || identifier);
    const resolvedEvolution = resolveEvolutionRequestIfPresent(projectRoot, options && options.requestId, {
      executedAction: 'delete',
      resultStatus: 'deleted'
    });
    refreshSystemReadiness(projectRoot, { bestEffort: true });

    return {
      action: 'delete',
      skill: resolved.parsed.map.get('name') || identifier,
      path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
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

function normalizeAdmissionText(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    result.recommendation = {
      action: 'delete-skill',
      target_status: 'deleted'
    };
    result.rationale.push('the request explicitly asks for removal, so the governed path should end at delete instead of a softer lifecycle move');
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
    getAdmissionLedgerPath(projectRoot),
    getSkillInvestmentBacklogRegistryPath(projectRoot)
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
    const ledger = appendAdmissionLedgerEntry(projectRoot, {
      'request-id': result['request-id'],
      request: result.request,
      'suggested-kind': result.suggested_kind,
      'inferred-intent-tags': result.inferred_intent_tags,
      ...(options.opportunityId ? { 'opportunity-id': options.opportunityId } : {}),
      decision: result.recommendation,
      status: result.recommendation && result.recommendation.action === 'create-new-skill' ? 'open' : 'advised-reuse',
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
    if (result.recommendation && result.recommendation.action === 'create-new-skill') {
      const scaffoldFlags = [];
      if (result.suggested_kind === 'domain' || result.suggested_kind === 'workflow') {
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
    && ['implemented', 'cancelled'].includes(normalizeOpportunityStatus(linkedOpportunity.status))
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
  const inferredIntentTags = inferIntentFromCandidates(ranked);
  const recordIndex = buildSkillRecordIndex(projectRoot);

  const result = {
    action: 'admission-check',
    'request-id': options.record === false
      ? null
      : `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${slugifyAdmissionText(query).slice(0, 48)}`,
    request: query,
    suggested_kind: recommendedKind,
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
    result.recommendation = {
      action: 'reuse-existing-skill',
      target_skill: top.skill,
      target_kind: top.kind
    };
    result.rationale.push(`existing route '${top.skill}' is already the right owner, even though its live route requires explicit invocation`);
    result.rationale.push('for admission work, explicit-route gating should not be mistaken for missing capability coverage');
    result.follow_up.push(`inspect ${top.skill} first with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${top.skill}`);
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (top && top.confidence && top.confidence.passedMinimum && ['strong', 'very-strong'].includes(top.confidence.band)) {
    result.recommendation = {
      action: 'reuse-existing-skill',
      target_skill: top.skill,
      target_kind: top.kind
    };
    result.rationale.push(`existing route '${top.skill}' already wins this request with ${top.confidence.band} confidence`);
    result.rationale.push('prefer deepening the existing route or references before adding a sibling skill');
    result.follow_up.push(`inspect ${top.skill} first with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${top.skill}`);
    if (top.kind === 'domain' || top.kind === 'workflow') {
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
    result.recommendation = {
      action: 'create-new-skill',
      suggested_kind: recommendedKind
    };
    result.rationale.push(`the nearest current route '${top.skill}' is only a weak ${top.kind}-shaped overlap, while the requested boundary is '${explicitKindIntent}'`);
    result.rationale.push('when explicit kind intent and weak current ownership disagree, prefer a clean new boundary over forcing the capability into the wrong layer');
    result.follow_up.push(`create the governed scaffold with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${recommendedKind} <skill-name>${recommendedKind === 'domain' || recommendedKind === 'workflow' ? ' --scaffold-modules' : ''}`);
    result.follow_up.push('after scaffolding, define why this boundary should stay separate from the nearest live route');
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (
    top
    && runnerUp
    && top.confidence
    && top.confidence.marginToRunnerUp != null
    && top.confidence.marginToRunnerUp <= 12
  ) {
    result.recommendation = {
      action: 'clarify-or-merge-boundary',
      primary_skill: top.skill,
      competing_skill: runnerUp.skill,
      suggested_kind: recommendedKind
    };
    result.rationale.push(`two existing routes are still close for this request ('${top.skill}' vs '${runnerUp.skill}')`);
    result.rationale.push('tighten boundaries or deepen one surface before introducing another overlapping skill');
    result.follow_up.push(`review route overlap between '${top.skill}' and '${runnerUp.skill}' before creating a new skill`);
    result.follow_up.push('if neither route truly owns the job, then create a new skill only after making the new boundary explicit');
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  if (top && top.confidence && top.confidence.band === 'minimum') {
    result.recommendation = {
      action: 'upgrade-existing-skill',
      target_skill: top.skill,
      target_kind: top.kind,
      suggested_kind: recommendedKind
    };
    result.rationale.push(`existing route '${top.skill}' partially covers the request but only at minimum confidence`);
    result.rationale.push('this usually means the weak point is route depth, references, or capability coverage rather than missing surface area');
    result.follow_up.push(`upgrade '${top.skill}' before creating a new peer unless the boundary is genuinely distinct`);
    return finalizeAdmissionResult(projectRoot, result, options);
  }

  result.recommendation = {
    action: 'create-new-skill',
    suggested_kind: recommendedKind
  };
  result.rationale.push(`no current route owns this request strongly enough to justify reuse (selected='${explain.selectedSkill || 'none'}')`);
  result.rationale.push(`the request shape currently looks closest to a '${recommendedKind}' skill`);
  result.follow_up.push(`create the governed scaffold with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js create ${recommendedKind} <skill-name>${recommendedKind === 'domain' || recommendedKind === 'workflow' ? ' --scaffold-modules' : ''}`);
  result.follow_up.push('fill trigger boundaries and references before promoting the new skill into the live route surface');
  return finalizeAdmissionResult(projectRoot, result, options);
}

function main(argv) {
  const [action, arg1, arg2, ...rest] = argv;
  if (!action) {
    fail('usage: manage-skill <record-opportunity|show-opportunity-queue|resolve-opportunity|admission-check|show-admission-ledger|resolve-admission|evolution-check|show-evolution-ledger|resolve-evolution|show-review-queue|show-investment-backlog|show-pending-scaffolds|mark-reviewed|assess-top-tier|create|materialize-pending-scaffold|show|update|set-status|set-module-rating|archive|merge|delete|sync-scaffold-lineage|sync-runtime-proof|sync-host-metadata|sync-route-metadata|run-host-smoke|reconcile-host-smoke> ...');
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
    if (kind && !VALID_KINDS.has(kind)) {
      fail(`unsupported admission-check kind '${kind}'`);
    }
    return recommendAdmissionPath(projectRoot, promptParts.join(' '), { kind, record, opportunityId });
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
    if (!arg1) {
      fail('mark-reviewed requires <skill-name>');
    }
    let date = null;
    let reviewCycleDays = null;
    const argsList = [arg2, ...rest].filter((item) => item != null);
    for (let i = 0; i < argsList.length; i += 1) {
      if (argsList[i] === '--date' && argsList[i + 1]) {
        date = argsList[i + 1];
        i += 1;
        continue;
      }
      if (argsList[i] === '--review-cycle-days' && argsList[i + 1]) {
        reviewCycleDays = argsList[i + 1];
        i += 1;
      }
    }
    return markSkillReviewed(arg1, { date, reviewCycleDays });
  }
  if (action === 'assess-top-tier') {
    if (!arg1) {
      fail('assess-top-tier requires <skill-name>');
    }
    return assessTopTierReadiness(getProjectRoot(), arg1);
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
      fail('set-status requires <skill-name> <draft|experimental|stable|deprecated|archived>');
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
  createSkill,
  materializePendingScaffold,
  showSkill,
  showPendingScaffolds,
  showAdmissionLedger,
  showEvolutionLedger,
  updateSkill,
  setSkillStatus,
  setCapabilityModuleRating,
  archiveSkill,
  mergeSkill,
  removeSkill,
  syncScaffoldLineage,
  recommendAdmissionPath,
  recommendEvolutionPath,
  resolveAdmissionDecision,
  resolveEvolutionDecision,
  syncRuntimeProofEntry,
  syncAllRuntimeProofEntries,
  syncHostMetadata,
  syncRouteMetadata,
  reconcileHostSmoke,
  collectJestTestCases,
  suggestEvidenceTests,
};
