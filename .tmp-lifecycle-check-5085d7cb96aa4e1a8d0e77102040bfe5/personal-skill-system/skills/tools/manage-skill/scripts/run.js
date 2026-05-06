#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { collectSkillRecords } = require('../../lib/skill-system-skills');
const { validateSmokeManifest } = require('../../lib/skill-system-common');
const {
  normalizeHostSmokeContract,
  getHostSmokeRuntimeRunsDir,
  getHostSmokeScorecardPath,
  HOST_SMOKE_RUN_SCHEMA_VERSION,
  buildHostSmokeScorecard
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

const VALID_KINDS = new Map([
  ['router', 'routers'],
  ['domain', 'domains'],
  ['workflow', 'workflows'],
  ['tool', 'tools'],
  ['guard', 'guards'],
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
};

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

function parseBoolean(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
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

function getRatingsDocPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md');
}

function getRuntimeProofPath(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
}

function getBundleRoot(projectRoot) {
  return path.join(projectRoot, 'personal-skill-system');
}

function getHostSmokeProofsFromRegistry(projectRoot) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  const registry = fs.existsSync(runtimeProofPath)
    ? readJson(runtimeProofPath)
    : { 'schema-version': 1, proofs: [] };
  return (Array.isArray(registry.proofs) ? registry.proofs : [])
    .filter((proof) => proof && proof['host-smoke']);
}

function buildRegistryPath(kind, skillName) {
  return `skills/${VALID_KINDS.get(kind)}/${skillName}/SKILL.md`;
}

function syncRegistryOnCreate(projectRoot, kind, skillName) {
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
  writeJson(registryPath, registry);
}

function syncRouteFixturesOnCreate(projectRoot, skillName) {
  const fixturesPath = getRouteFixturesPath(projectRoot);
  const fixtures = readJson(fixturesPath);
  fixtures.cases = Array.isArray(fixtures.cases) ? fixtures.cases : [];
  const fixtureName = `placeholder-route-${skillName}`;
  if (!fixtures.cases.some((item) => item.name === fixtureName)) {
    fixtures.cases.push({
      name: fixtureName,
      query: `Use ${skillName} for this request.`,
      expect: skillName,
      'expect-no-fallback': true,
    });
  }
  writeJson(fixturesPath, fixtures);
}

function buildRouteEntry(kind, skillName) {
  const config = PLACEHOLDER_ROUTE_BY_KIND[kind];
  if (!config) {
    fail(`cannot build placeholder route for kind '${kind}'`);
  }

  return {
    skill: skillName,
    kind,
    priority: config.priority,
    namespace: config.namespace,
    'supported-hosts': [...HOSTS],
    activation: {
      'intent-tags': [...config.intentTags],
      'trigger-keywords': [skillName],
      'negative-keywords': [],
      'requires-explicit-invocation': true,
    },
    'conflicts-with': [],
    'auto-chain': [],
    aliases: [],
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

function syncRouteMapOnCreate(projectRoot, kind, skillName) {
  const routeMapPath = getRouteMapPath(projectRoot);
  const routeMap = readJson(routeMapPath);
  routeMap.routes = Array.isArray(routeMap.routes) ? routeMap.routes : [];
  if (!routeMap.routes.some((route) => route.skill === skillName)) {
    routeMap.routes.push(buildRouteEntry(kind, skillName));
    routeMap.routes.sort((a, b) => String(b.priority || 0) - String(a.priority || 0) || String(a.skill).localeCompare(String(b.skill)));
  }
  writeJson(routeMapPath, routeMap);
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

function syncRatingsOnCreate(projectRoot, skillName) {
  const ratingsPath = getRatingsPath(projectRoot);
  const ratings = readJson(ratingsPath);
  updateRatingsSummaryEntry(ratings, skillName, 'experimental');
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

function syncRouteFixturesOnRemove(projectRoot, skillName) {
  const fixturesPath = getRouteFixturesPath(projectRoot);
  const fixtures = readJson(fixturesPath);
  fixtures.cases = (Array.isArray(fixtures.cases) ? fixtures.cases : []).filter((item) => item.expect !== skillName && item.name !== `placeholder-route-${skillName}`);
  writeJson(fixturesPath, fixtures);
}

function syncRouteMapOnRemove(projectRoot, skillName) {
  const routeMapPath = getRouteMapPath(projectRoot);
  const routeMap = readJson(routeMapPath);
  routeMap.routes = (Array.isArray(routeMap.routes) ? routeMap.routes : []).filter((route) => route.skill !== skillName);
  writeJson(routeMapPath, routeMap);
}

function syncRatingsOnRemove(projectRoot, skillName) {
  const ratingsPath = getRatingsPath(projectRoot);
  const ratings = readJson(ratingsPath);
  updateRatingsSummaryEntry(ratings, skillName, 'archived');
  writeRatings(projectRoot, ratings);
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
  const bucket = GENERATED_STATUS_BUCKET_BY_STATUS.get(status) || null;
  for (const key of GENERATED_STATUS_BUCKET_BY_STATUS.values()) {
    summary[key] = removeFromArray(summary[key], skillName);
  }
  if (bucket && !summary[bucket].includes(skillName)) {
    summary[bucket].push(skillName);
    summary[bucket].sort();
  }
  recomputeSkillLevelSummary(ratings);
}

function writeRatings(projectRoot, ratings) {
  const ratingsPath = getRatingsPath(projectRoot);
  writeJson(ratingsPath, ratings);
  syncCapabilityRatingsDoc(projectRoot);
}

function syncRuntimeProofOnRemove(projectRoot, skillName) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  if (!fs.existsSync(runtimeProofPath)) {
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

function writeRuntimeProofRegistry(projectRoot, proofs) {
  const runtimeProofPath = getRuntimeProofPath(projectRoot);
  writeJson(runtimeProofPath, {
    'schema-version': 1,
    proofs
  });
  refreshHostSmokeScorecard(projectRoot, proofs);
}

function refreshHostSmokeScorecard(projectRoot, proofs = null) {
  const bundleRoot = getBundleRoot(projectRoot);
  const nextProofs = Array.isArray(proofs) ? proofs.filter((proof) => proof && proof['host-smoke']) : getHostSmokeProofsFromRegistry(projectRoot);
  const scorecardPath = getHostSmokeScorecardPath(bundleRoot);
  const scorecard = buildHostSmokeScorecard(bundleRoot, nextProofs);
  writeJson(scorecardPath, scorecard);
  refreshSystemReadiness(projectRoot);
  return scorecardPath;
}

function refreshSystemReadiness(projectRoot) {
  const bundleRoot = getBundleRoot(projectRoot);
  return writeSystemReadiness(bundleRoot).file;
}

function writeRuntimeProofEntryLevel(projectRoot, skillName, nextLevel) {
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
  writeRuntimeProofRegistry(projectRoot, proofs);
}

function runHostSmoke(projectRoot, selection = {}) {
  const bundleRoot = getBundleRoot(projectRoot);
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

  const normalizedSkills = [];
  const results = [];
  const promoteHostSmoked = selection.promoteHostSmoked === true;
  let activeProofs = proofs;

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

  if (promoteHostSmoked) {
    const failed = results.find((item) => item.status !== 'pass');
    if (failed) {
      fail(`cannot promote '${failed.skill}' to host-smoked because host-smoke execution failed`);
    }
    for (const result of results) {
      writeRuntimeProofEntryLevel(projectRoot, result.skill, 'host-smoked');
    }
    const refreshedRegistry = readJson(getRuntimeProofPath(projectRoot));
    activeProofs = Array.isArray(refreshedRegistry.proofs) ? refreshedRegistry.proofs : [];
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
  const scorecardFile = refreshHostSmokeScorecard(projectRoot, activeProofs);

  return {
    action: 'run-host-smoke',
    host,
    scope: selection.runAll ? 'all' : 'single',
    skills: normalizedSkills,
    status: results.every((item) => item.status === 'pass') ? 'pass' : 'fail',
    promoted_host_smoked: promoteHostSmoked,
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

  const testCases = collectJestTestCases(projectRoot);
  const evidenceResolution = resolveEvidenceTests(projectRoot, record, existing, options, testCases);
  const entry = buildRuntimeProofEntry(record, {
    ...options,
    evidenceTests: evidenceResolution.evidenceTests
  }, existing);
  if (entry.level !== 'declared-only' && entry['evidence-tests'].length < 1) {
    fail(`runtime-proof level '${entry.level}' for '${skillName}' requires at least one evidence test`);
  }

  const nextProofs = proofs.filter((proof) => proof && proof.skill !== skillName);
  nextProofs.push(entry);
  nextProofs.sort((a, b) => String(a.skill).localeCompare(String(b.skill)));
  writeRuntimeProofRegistry(projectRoot, nextProofs);

  return {
    action: 'sync-runtime-proof',
    skill: skillName,
    status: existing ? 'updated' : 'created',
    level: entry.level,
    contracts: entry.contracts.length,
    evidence_tests: entry['evidence-tests'].length,
    evidence_test_source: evidenceResolution.evidenceTestSource,
    suggested_evidence_tests: options.suggestEvidenceTests || options.autoEvidenceTests
      ? evidenceResolution.suggestedEvidenceTests
      : undefined,
    path: 'personal-skill-system/registry/runtime-proof.generated.json',
    follow_up: ['npm run verify:skill-system']
  };
}

function syncAllRuntimeProofEntries(projectRoot, options = {}) {
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
    if (options.suggestEvidenceTests || options.autoEvidenceTests) {
      result.suggested_evidence_tests = evidenceResolution.suggestedEvidenceTests;
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
  writeRuntimeProofRegistry(projectRoot, nextProofs);

  return {
    action: 'sync-runtime-proof',
    scope: 'all',
    updated: results,
    total_live_entries: nextProofs.length,
    path: 'personal-skill-system/registry/runtime-proof.generated.json',
    follow_up: ['npm run verify:skill-system']
  };
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
    /^After the latest uplift round,.*$/m,
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

  fs.writeFileSync(docPath, text, 'utf8');
}

function syncArchiveOnGeneratedSurfaces(projectRoot, skillName) {
  syncRouteMapOnRemove(projectRoot, skillName);
  syncRouteFixturesOnRemove(projectRoot, skillName);
  syncRatingsOnRemove(projectRoot, skillName);
  syncRuntimeProofOnRemove(projectRoot, skillName);
}

function syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, options = {}) {
  syncRegistryOnCreate(projectRoot, kind, skillName);
  if (options.createPlaceholderRoute) {
    syncRouteMapOnCreate(projectRoot, kind, skillName);
    syncRouteFixturesOnCreate(projectRoot, skillName);
  }
  syncRatingsOnCreate(projectRoot, skillName);
  refreshSystemReadiness(projectRoot);
}

function syncGeneratedSurfacesOnRemove(projectRoot, skillName) {
  syncRegistryOnRemove(projectRoot, skillName);
  syncRouteMapOnRemove(projectRoot, skillName);
  syncRouteFixturesOnRemove(projectRoot, skillName);
  syncRatingsOnRemove(projectRoot, skillName);
  syncRuntimeProofOnRemove(projectRoot, skillName);
}

function createSkill(kind, skillName) {
  const layer = VALID_KINDS.get(kind);
  if (!layer) fail(`unknown kind '${kind}'`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) fail(`invalid skill name '${skillName}'`);

  const projectRoot = getProjectRoot();
  const skillsRoot = getAuthoritativeSkillsRoot();
  const templateDir = path.join(projectRoot, 'personal-skill-system', 'templates', 'skill', kind);
  const targetDir = path.join(skillsRoot, layer, skillName);
  const skillFile = path.join(targetDir, 'SKILL.md');
  ensureInsideAuthoritativeRoot(targetDir, skillsRoot);
  if (fs.existsSync(targetDir)) fail(`skill already exists at ${targetDir}`);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(templateDir, targetDir, { recursive: true });

  const parsed = parseFrontmatterMap(fs.readFileSync(skillFile, 'utf8'));
  parsed.map.set('name', skillName);
  parsed.map.set('title', `${slugToTitle(skillName)} ${slugToTitle(kind)}`);
  parsed.map.set('description', `TODO: describe ${skillName}. Use when this ${kind} is the correct primary route.`);
  parsed.map.set('status', 'draft');
  const next = renderSkillFile(parsed);
  fs.writeFileSync(skillFile, next, 'utf8');
  const createPlaceholderRoute = kind !== 'router' && parseBoolean(parsed.map.get('user-invocable'), true);
  syncGeneratedSurfacesOnCreate(projectRoot, kind, skillName, { createPlaceholderRoute });

  return {
    action: 'create',
    kind,
    skill: skillName,
    path: path.relative(projectRoot, targetDir).split(path.sep).join('/'),
    follow_up: ['npm run verify:skills'],
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

function updateSkill(skillName, assignments) {
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);
  if (assignments.length === 0) fail('update requires at least one --set key=value');

  for (const assignment of assignments) {
    const idx = assignment.indexOf('=');
    if (idx === -1) fail(`invalid assignment '${assignment}'`);
    const key = assignment.slice(0, idx).trim();
    const value = assignment.slice(idx + 1).trim();
    if (!key) fail(`invalid assignment '${assignment}'`);
    if (key === 'status') {
      fail('update cannot modify status directly; use set-status, archive, or delete so generated governance surfaces stay synchronized');
    }
    resolved.parsed.map.set(key, value);
  }

  const next = renderSkillFile(resolved.parsed);
  fs.writeFileSync(resolved.skillFile, next, 'utf8');

  return {
    action: 'update',
    skill: skillName,
    updated_fields: assignments,
    follow_up: ['npm run verify:skills'],
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
  return {
    runtimeProofExists: fs.existsSync(getRuntimeProofPath(projectRoot)),
    runtimeProof: fs.existsSync(getRuntimeProofPath(projectRoot)) ? cloneJsonValue(readJson(getRuntimeProofPath(projectRoot))) : null,
    routeMap: cloneJsonValue(readJson(getRouteMapPath(projectRoot))),
    routeFixtures: cloneJsonValue(readJson(getRouteFixturesPath(projectRoot))),
    ratings: cloneJsonValue(readJson(getRatingsPath(projectRoot))),
    scorecard: fs.existsSync(getHostSmokeScorecardPath(getBundleRoot(projectRoot)))
      ? cloneJsonValue(readJson(getHostSmokeScorecardPath(getBundleRoot(projectRoot))))
      : null,
    readiness: fs.existsSync(path.join(getBundleRoot(projectRoot), 'benchmark', 'system-readiness.generated.json'))
      ? cloneJsonValue(readJson(path.join(getBundleRoot(projectRoot), 'benchmark', 'system-readiness.generated.json')))
      : null
  };
}

function restoreGeneratedState(projectRoot, snapshot) {
  if (!snapshot) return;

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

  const readinessPath = path.join(bundleRoot, 'benchmark', 'system-readiness.generated.json');
  if (snapshot.readiness) {
    writeJson(readinessPath, snapshot.readiness);
  } else if (fs.existsSync(readinessPath)) {
    fs.rmSync(readinessPath, { force: true });
  }
}

function setSkillStatus(skillName, nextStatus, options = {}) {
  const projectRoot = getProjectRoot();
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);

  const currentStatus = String(resolved.parsed.map.get('status') || '').trim();
  validateLifecycleTransition(skillName, currentStatus, nextStatus);

  const previousSkillText = fs.readFileSync(resolved.skillFile, 'utf8');
  const generatedSnapshot = snapshotGeneratedState(projectRoot);

  try {
    resolved.parsed.map.set('status', nextStatus);
    const next = renderSkillFile(resolved.parsed);
    fs.writeFileSync(resolved.skillFile, next, 'utf8');

    if (nextStatus === 'archived') {
      syncArchiveOnGeneratedSurfaces(projectRoot, skillName);
    } else {
      updateRatingsSummaryForStatus(projectRoot, skillName, nextStatus);
      syncRuntimeProofForStatusTransition(projectRoot, skillName, nextStatus, options);
      refreshSystemReadiness(projectRoot);
    }

    return {
      action: 'set-status',
      skill: skillName,
      previous_status: currentStatus,
      status: nextStatus,
      follow_up: [
        'npm run verify:skills',
        'npm run verify:skill-system'
      ]
    };
  } catch (error) {
    fs.writeFileSync(resolved.skillFile, previousSkillText, 'utf8');
    restoreGeneratedState(projectRoot, generatedSnapshot);
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

function archiveSkill(skillName) {
  const result = setSkillStatus(skillName, 'archived');
  return {
    action: 'archive',
    skill: skillName,
    previous_status: result.previous_status,
    follow_up: result.follow_up
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
  fs.rmSync(resolved.dir, { recursive: true, force: true });
  syncGeneratedSurfacesOnRemove(projectRoot, resolved.parsed.map.get('name') || identifier);

  return {
    action: 'delete',
    skill: resolved.parsed.map.get('name') || identifier,
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    follow_up: ['npm run verify:skills', 'update registry/route-map generated artifacts if needed'],
  };
}

function parseListArgument(value) {
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function main(argv) {
  const [action, arg1, arg2, ...rest] = argv;
  if (!action) {
    fail('usage: manage-skill <create|show|update|set-status|archive|delete|sync-runtime-proof|run-host-smoke> ...');
  }

  if (action === 'create') return createSkill(arg1, arg2);
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
    return setSkillStatus(arg1, arg2);
  }
  if (action === 'archive') return archiveSkill(arg1);
  if (action === 'delete') {
    let name = null;
    let relPath = null;
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
      }
    }
    if (!name && !relPath) {
      fail('delete requires --name <skill-name> or --path <authoritative-relative-path>');
    }
    return removeSkill({ name, path: relPath });
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
  createSkill,
  showSkill,
  updateSkill,
  setSkillStatus,
  archiveSkill,
  removeSkill,
  syncRuntimeProofEntry,
  syncAllRuntimeProofEntries,
  collectJestTestCases,
  suggestEvidenceTests,
};
