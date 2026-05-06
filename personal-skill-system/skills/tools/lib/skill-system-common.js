'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FRONTMATTER_KEYS = [
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
];

const EXPECTED_TOP_LEVEL_DIRS = [
  'docs',
  'registry',
  'skills',
  'packs',
  'templates'
];

const MIN_REFERENCE_FILES_BY_KIND = {
  router: 2,
  domain: 2,
  workflow: 2,
  tool: 2,
  guard: 2
};

const KIND_BY_LAYER = {
  routers: 'router',
  domains: 'domain',
  workflows: 'workflow',
  tools: 'tool',
  guards: 'guard'
};

const SMOKE_CWD_MODES = new Set(['skill-dir', 'bundle-root']);

function rel(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function readUtf8(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function walkSkillFiles(root) {
  const results = [];

  function visit(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(full);
      }
    }
  }

  visit(root);
  return results.sort();
}

function parseScalar(raw) {
  const value = String(raw || '').trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return value;
}

function parseFrontmatter(text) {
  if ((!text || !text.startsWith('---\n')) && !text.startsWith('---\r\n')) {
    return { error: 'missing opening frontmatter fence' };
  }

  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { error: 'invalid opening frontmatter fence' };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { error: 'missing closing frontmatter fence' };
  }

  const data = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) {
      return { error: `invalid frontmatter line '${line}'` };
    }
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1);
    data[key] = parseScalar(rawValue);
  }

  return { data };
}

function parseJsonFile(file) {
  const text = readUtf8(file);
  if (text == null) {
    return { error: 'file unreadable', data: null };
  }
  try {
    return { data: JSON.parse(text) };
  } catch (error) {
    return { error: error.message, data: null };
  }
}

function probeArtifactWriteAccess(targetPath, options = {}) {
  const mode = String(options.mode || 'rewrite-file').trim();
  const resolvedPath = path.resolve(targetPath);

  if (mode === 'rewrite-file') {
    if (!fs.existsSync(resolvedPath)) {
      return {
        ok: false,
        mode,
        path: resolvedPath,
        code: 'ENOENT',
        message: 'file does not exist'
      };
    }

    try {
      const fd = fs.openSync(resolvedPath, 'r+');
      fs.closeSync(fd);
      return {
        ok: true,
        mode,
        path: resolvedPath
      };
    } catch (error) {
      return {
        ok: false,
        mode,
        path: resolvedPath,
        code: error && error.code ? error.code : 'UNKNOWN',
        message: error && error.message ? error.message : String(error)
      };
    }
  }

  if (mode === 'create-file') {
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      return {
        ok: false,
        mode,
        path: resolvedPath,
        container: parentDir,
        code: 'ENOENT',
        message: 'parent directory does not exist'
      };
    }

    try {
      fs.accessSync(parentDir, fs.constants.W_OK);
      return {
        ok: true,
        mode,
        path: resolvedPath,
        container: parentDir
      };
    } catch (error) {
      return {
        ok: false,
        mode,
        path: resolvedPath,
        container: parentDir,
        code: error && error.code ? error.code : 'UNKNOWN',
        message: error && error.message ? error.message : String(error)
      };
    }
  }

  if (mode === 'write-dir') {
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      return {
        ok: false,
        mode,
        path: resolvedPath,
        code: 'ENOENT',
        message: 'directory does not exist'
      };
    }

    try {
      fs.accessSync(resolvedPath, fs.constants.W_OK);
      return {
        ok: true,
        mode,
        path: resolvedPath
      };
    } catch (error) {
      return {
        ok: false,
        mode,
        path: resolvedPath,
        code: error && error.code ? error.code : 'UNKNOWN',
        message: error && error.message ? error.message : String(error)
      };
    }
  }

  throw new Error(`unsupported artifact write probe mode '${mode}'`);
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map(entry => entry.name)
    .sort();
}

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

  if (data['schema-version'] !== 1) {
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
      if (unit !== 'hours' && unit !== 'days') {
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

    if ('cwd' in command && !SMOKE_CWD_MODES.has(command.cwd)) {
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

function readReferencePaths(text) {
  const lines = String(text || '').split(/\r?\n/);
  const refs = [];
  let inReferences = false;

  for (const line of lines) {
    if (/^##\s+Read These References\b/.test(line.trim())) {
      inReferences = true;
      continue;
    }
    if (inReferences && /^##\s+/.test(line.trim())) {
      break;
    }
    if (!inReferences) continue;

    const match = line.match(/^- `([^`]+)`/);
    if (match) refs.push(match[1]);
  }

  return refs.filter(ref => !ref.startsWith('http'));
}

function readBulletSectionItems(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === `## ${heading}`) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(trimmed)) {
      break;
    }
    if (!inSection) continue;

    const match = trimmed.match(/^-\s+(.*)$/);
    if (match && match[1].trim()) {
      items.push(match[1].trim());
    }
  }

  return items;
}

function expectedKindFromPath(skillFile, skillsRoot) {
  const relPath = rel(skillsRoot, skillFile);
  const parts = relPath.split('/');
  return KIND_BY_LAYER[parts[0]] || null;
}

module.exports = {
  REQUIRED_FRONTMATTER_KEYS,
  EXPECTED_TOP_LEVEL_DIRS,
  MIN_REFERENCE_FILES_BY_KIND,
  rel,
  readUtf8,
  walkSkillFiles,
  parseFrontmatter,
  parseJsonFile,
  probeArtifactWriteAccess,
  listMarkdownFiles,
  getSmokeManifestFile,
  validateSmokeManifest,
  readReferencePaths,
  readBulletSectionItems,
  expectedKindFromPath
};
