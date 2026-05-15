'use strict';

const SKILL_VISIBILITY_ORDER = Object.freeze(['public', 'private', 'project', 'internal']);
const SKILL_TRIGGER_MODE_ORDER = Object.freeze(['auto', 'manual']);
const SKILL_RUNTIME_ORDER = Object.freeze(['knowledge', 'scripted', 'hybrid']);
const SKILL_EXECUTOR_ORDER = Object.freeze(['none', 'node', 'python', 'bash', 'powershell']);
const SKILL_RISK_LEVEL_ORDER = Object.freeze(['low', 'medium', 'high', 'critical']);
const SKILL_SUPPORTED_HOSTS_ORDER = Object.freeze(['codex', 'claude', 'gemini']);

const REQUIRED_FRONTMATTER_KEYS = Object.freeze([
  'schema-version',
  'name',
  'description',
  'kind',
  'user-invocable',
  'trigger-mode',
  'priority',
  'runtime',
  'executor',
  'supported-hosts',
  'status'
]);

const SKILL_VISIBILITIES = new Set(SKILL_VISIBILITY_ORDER);
const SKILL_TRIGGER_MODES = new Set(SKILL_TRIGGER_MODE_ORDER);
const SKILL_RUNTIMES = new Set(SKILL_RUNTIME_ORDER);
const SKILL_EXECUTORS = new Set(SKILL_EXECUTOR_ORDER);
const SKILL_RISK_LEVELS = new Set(SKILL_RISK_LEVEL_ORDER);
const SKILL_SUPPORTED_HOSTS = new Set(SKILL_SUPPORTED_HOSTS_ORDER);

function normalizeFrontmatterToken(value) {
  return String(value || '').trim().toLowerCase();
}

function isKnownSkillVisibility(value) {
  return SKILL_VISIBILITIES.has(normalizeFrontmatterToken(value));
}

function isKnownSkillTriggerMode(value) {
  return SKILL_TRIGGER_MODES.has(normalizeFrontmatterToken(value));
}

function isKnownSkillRuntime(value) {
  return SKILL_RUNTIMES.has(normalizeFrontmatterToken(value));
}

function isKnownSkillExecutor(value) {
  return SKILL_EXECUTORS.has(normalizeFrontmatterToken(value));
}

function isKnownSkillRiskLevel(value) {
  return SKILL_RISK_LEVELS.has(normalizeFrontmatterToken(value));
}

function isKnownSupportedHost(value) {
  return SKILL_SUPPORTED_HOSTS.has(normalizeFrontmatterToken(value));
}

module.exports = {
  SKILL_VISIBILITY_ORDER,
  SKILL_TRIGGER_MODE_ORDER,
  SKILL_RUNTIME_ORDER,
  SKILL_EXECUTOR_ORDER,
  SKILL_RISK_LEVEL_ORDER,
  SKILL_SUPPORTED_HOSTS_ORDER,
  REQUIRED_FRONTMATTER_KEYS,
  SKILL_VISIBILITIES,
  SKILL_TRIGGER_MODES,
  SKILL_RUNTIMES,
  SKILL_EXECUTORS,
  SKILL_RISK_LEVELS,
  SKILL_SUPPORTED_HOSTS,
  isKnownSkillVisibility,
  isKnownSkillTriggerMode,
  isKnownSkillRuntime,
  isKnownSkillExecutor,
  isKnownSkillRiskLevel,
  isKnownSupportedHost
};
