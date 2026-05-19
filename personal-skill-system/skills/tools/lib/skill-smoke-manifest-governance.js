'use strict';

const path = require('path');

const SMOKE_MANIFEST_SCHEMA_VERSION = 1;
const SMOKE_MANIFEST_COMMAND_CWD_MODES = new Set(['skill-dir', 'bundle-root', 'project-root']);
const SMOKE_MANIFEST_FRESHNESS_UNITS = new Set(['hours', 'days']);

function getSmokeManifestFile(skillDir) {
  return path.join(skillDir, 'scripts', 'smoke.json');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isJsonScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function validateSmokeManifest(data) {
  const errors = [];
  if (!isPlainObject(data)) {
    errors.push('smoke manifest must be a JSON object');
    return errors;
  }

  if (data['schema-version'] !== SMOKE_MANIFEST_SCHEMA_VERSION) {
    errors.push(`smoke manifest has unsupported schema-version '${data['schema-version']}'`);
  }

  if ('freshness' in data) {
    if (!isPlainObject(data.freshness)) {
      errors.push('smoke manifest freshness must be an object when present');
    } else {
      const maxAge = data.freshness['max-age'];
      const unit = data.freshness.unit;
      if (!Number.isInteger(maxAge) || maxAge < 1) {
        errors.push(`smoke manifest freshness.max-age must be a positive integer, got '${maxAge}'`);
      }
      if (!SMOKE_MANIFEST_FRESHNESS_UNITS.has(unit)) {
        errors.push(`smoke manifest freshness.unit must be 'hours' or 'days', got '${unit}'`);
      }
    }
  }

  const commands = Array.isArray(data.commands) ? data.commands : [];
  if (commands.length < 1) {
    errors.push('smoke manifest must declare at least one command');
    return errors;
  }

  commands.forEach((command, index) => {
    const label = `smoke manifest command #${index + 1}`;
    if (!isPlainObject(command)) {
      errors.push(`${label} must be an object`);
      return;
    }

    if ('cwd' in command && !SMOKE_MANIFEST_COMMAND_CWD_MODES.has(command.cwd)) {
      errors.push(`${label} has invalid cwd '${command.cwd}'`);
    }

    const argv = Array.isArray(command.argv) ? command.argv : null;
    if (!argv || argv.length < 2) {
      errors.push(`${label} must declare argv with at least two tokens`);
    } else if (argv.some((item) => typeof item !== 'string' || !item.trim())) {
      errors.push(`${label} argv tokens must be non-empty strings`);
    }

    if ('timeout-ms' in command) {
      const timeoutMs = command['timeout-ms'];
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
        errors.push(`${label} has invalid timeout-ms '${timeoutMs}'`);
      }
    }

    if (!isPlainObject(command.expect) || Object.keys(command.expect).length < 1) {
      errors.push(`${label} must declare a non-empty expect object`);
    } else {
      for (const [key, value] of Object.entries(command.expect)) {
        if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(String(key || ''))) {
          errors.push(`${label} expect key '${key}' must use dot-path friendly tokens`);
          continue;
        }
        if (!isJsonScalar(value)) {
          errors.push(`${label} expect key '${key}' must compare against a scalar JSON value`);
        }
      }
    }
  });

  return errors;
}

module.exports = {
  SMOKE_MANIFEST_SCHEMA_VERSION,
  SMOKE_MANIFEST_COMMAND_CWD_MODES,
  SMOKE_MANIFEST_FRESHNESS_UNITS,
  getSmokeManifestFile,
  validateSmokeManifest
};
