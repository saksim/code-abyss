'use strict';

const fs = require('fs');
const path = require('path');
const {
  getLayerForKind
} = require('./skill-kind-governance');

const OPENAI_METADATA_KEYS = ['display_name', 'short_description', 'default_prompt'];

function slugToTitle(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function deriveShortDescription(description) {
  const normalized = normalizeText(description);
  if (!normalized) {
    return '';
  }

  const withoutTriggerGuidance = normalized.replace(/\s+Use when\b[\s\S]*$/i, '').trim();
  return withoutTriggerGuidance || normalized;
}

function normalizeSkillRelPath(skillRelPath) {
  return String(skillRelPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function buildDefaultPrompt(kind, skillName, options = {}) {
  const layer = getLayerForKind(kind);
  if (!layer) {
    throw new Error(`cannot build host metadata for unsupported kind '${kind}'`);
  }

  const relPath = normalizeSkillRelPath(options.skillRelPath);
  const runtimePath = relPath || `${layer}/${skillName}`;
  return `Use ~/.agents/skills/${runtimePath}/SKILL.md as the primary instruction source before acting on ${skillName}.`;
}

function buildOpenAiMetadata(skill) {
  const name = normalizeText(skill && skill.name);
  const title = normalizeText(skill && skill.title);
  const description = normalizeText(skill && skill.description);
  const kind = normalizeText(skill && skill.kind);
  const skillRelPath = normalizeText(skill && skill.skillRelPath);

  return {
    display_name: title || slugToTitle(name),
    short_description: deriveShortDescription(description),
    default_prompt: buildDefaultPrompt(kind, name, { skillRelPath })
  };
}

function parseSimpleYaml(text) {
  const data = {};
  const order = [];

  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) {
      return { error: `invalid yaml line '${line}'`, data: null, order: [] };
    }

    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    let value = rawValue;

    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      try {
        value = JSON.parse(rawValue);
      } catch (error) {
        return {
          error: `invalid quoted yaml value for '${key}': ${error.message}`,
          data: null,
          order: []
        };
      }
    } else if (rawValue.startsWith('\'') && rawValue.endsWith('\'')) {
      value = rawValue.slice(1, -1);
    }

    data[key] = value;
    order.push(key);
  }

  return { data, order };
}

function readOpenAiMetadataFile(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      error: error && error.message ? error.message : String(error),
      data: null,
      order: []
    };
  }

  return parseSimpleYaml(text);
}

function renderSimpleYaml(data, options = {}) {
  const emitted = new Set();
  const preferredOrder = Array.isArray(options.keyOrder) ? options.keyOrder : [];
  const keys = [];

  for (const key of preferredOrder) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !emitted.has(key)) {
      keys.push(key);
      emitted.add(key);
    }
  }

  for (const key of Object.keys(data)) {
    if (!emitted.has(key)) {
      keys.push(key);
      emitted.add(key);
    }
  }

  const lines = keys.map((key) => `${key}: ${JSON.stringify(String(data[key] == null ? '' : data[key]))}`);
  return `${lines.join('\n')}\n`;
}

function writeOpenAiMetadataFile(filePath, skill, options = {}) {
  const nextData = buildOpenAiMetadata(skill);
  let merged = nextData;
  let keyOrder = OPENAI_METADATA_KEYS;

  if (options.preserveExisting && fs.existsSync(filePath)) {
    const existing = readOpenAiMetadataFile(filePath);
    if (!existing.error && existing.data) {
      merged = { ...existing.data, ...nextData };
      keyOrder = existing.order.length > 0 ? existing.order : OPENAI_METADATA_KEYS;
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderSimpleYaml(merged, { keyOrder }), 'utf8');

  return merged;
}

module.exports = {
  OPENAI_METADATA_KEYS,
  buildOpenAiMetadata,
  buildDefaultPrompt,
  deriveShortDescription,
  normalizeSkillRelPath,
  parseSimpleYaml,
  readOpenAiMetadataFile,
  renderSimpleYaml,
  writeOpenAiMetadataFile
};
