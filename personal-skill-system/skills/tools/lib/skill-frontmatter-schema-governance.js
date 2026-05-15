'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile, probeArtifactWriteAccess } = require('./skill-system-common');
const { SKILL_KIND_ORDER } = require('./skill-kind-governance');
const {
  REQUIRED_FRONTMATTER_KEYS,
  SKILL_VISIBILITY_ORDER,
  SKILL_TRIGGER_MODE_ORDER,
  SKILL_RUNTIME_ORDER,
  SKILL_EXECUTOR_ORDER,
  SKILL_RISK_LEVEL_ORDER,
  SKILL_SUPPORTED_HOSTS_ORDER
} = require('./skill-frontmatter-governance');
const { SKILL_STATUS_ORDER } = require('./skill-lifecycle-governance');

const SKILL_FRONTMATTER_SCHEMA_VERSION = 2;
const SKILL_FRONTMATTER_SCHEMA_SOURCE = 'generated-from-skill-governance';

function cloneArray(values) {
  return Array.isArray(values) ? [...values] : [];
}

function buildSkillFrontmatterSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://code-abyss.local/personal-skill-system/skill.schema.json',
    title: 'Portable Personal Skill Frontmatter Schema',
    type: 'object',
    additionalProperties: false,
    required: cloneArray(REQUIRED_FRONTMATTER_KEYS),
    properties: {
      'schema-version': {
        type: 'integer',
        const: SKILL_FRONTMATTER_SCHEMA_VERSION
      },
      name: {
        $ref: '#/$defs/skillName'
      },
      'template-version': {
        type: 'integer',
        minimum: 1
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 120
      },
      description: {
        type: 'string',
        minLength: 10,
        maxLength: 400
      },
      kind: {
        type: 'string',
        enum: cloneArray(SKILL_KIND_ORDER)
      },
      visibility: {
        type: 'string',
        enum: cloneArray(SKILL_VISIBILITY_ORDER),
        default: 'public'
      },
      'user-invocable': {
        type: 'boolean'
      },
      'trigger-mode': {
        type: 'array',
        items: {
          type: 'string',
          enum: cloneArray(SKILL_TRIGGER_MODE_ORDER)
        },
        minItems: 1,
        uniqueItems: true
      },
      'trigger-keywords': {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 80
        },
        uniqueItems: true,
        default: []
      },
      'negative-keywords': {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 80
        },
        uniqueItems: true,
        default: []
      },
      priority: {
        type: 'integer',
        minimum: 0,
        maximum: 100
      },
      namespace: {
        $ref: '#/$defs/skillName'
      },
      parent: {
        $ref: '#/$defs/skillName'
      },
      'depends-on': {
        type: 'array',
        items: {
          $ref: '#/$defs/skillName'
        },
        uniqueItems: true,
        default: []
      },
      'conflicts-with': {
        type: 'array',
        items: {
          $ref: '#/$defs/skillName'
        },
        uniqueItems: true,
        default: []
      },
      'auto-chain': {
        type: 'array',
        items: {
          $ref: '#/$defs/skillName'
        },
        uniqueItems: true,
        default: []
      },
      runtime: {
        type: 'string',
        enum: cloneArray(SKILL_RUNTIME_ORDER)
      },
      executor: {
        type: 'string',
        enum: cloneArray(SKILL_EXECUTOR_ORDER)
      },
      permissions: {
        type: 'array',
        items: {
          type: 'string'
        },
        uniqueItems: true,
        default: []
      },
      'risk-level': {
        type: 'string',
        enum: cloneArray(SKILL_RISK_LEVEL_ORDER),
        default: 'low'
      },
      'supported-hosts': {
        type: 'array',
        items: {
          type: 'string',
          enum: cloneArray(SKILL_SUPPORTED_HOSTS_ORDER)
        },
        minItems: 1,
        uniqueItems: true
      },
      status: {
        type: 'string',
        enum: cloneArray(SKILL_STATUS_ORDER)
      },
      owner: {
        type: 'string',
        minLength: 1,
        maxLength: 80
      },
      'last-reviewed': {
        type: 'string',
        format: 'date'
      },
      'review-cycle-days': {
        type: 'integer',
        minimum: 1,
        maximum: 3650
      },
      'scaffold-origin': {
        $ref: '#/$defs/skillName'
      },
      'scaffold-version': {
        type: 'integer',
        minimum: 1
      },
      tags: {
        type: 'array',
        items: {
          $ref: '#/$defs/tag'
        },
        uniqueItems: true,
        default: []
      },
      aliases: {
        type: 'array',
        items: {
          $ref: '#/$defs/skillName'
        },
        uniqueItems: true,
        default: []
      }
    },
    $defs: {
      skillName: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 64
      },
      tag: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 40
      }
    }
  };
}

function getSkillFrontmatterSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'skill.schema.json');
}

function writeSkillFrontmatterSchema(bundleRoot) {
  const file = getSkillFrontmatterSchemaPath(bundleRoot);
  const payload = buildSkillFrontmatterSchema();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateSkillFrontmatterSchema(bundleRoot, findings) {
  const file = getSkillFrontmatterSchemaPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill frontmatter schema parse failed: ${parsed.error}`
    });
    return buildSkillFrontmatterSchema();
  }

  const actual = parsed.data || {};
  const expected = buildSkillFrontmatterSchema();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'skill frontmatter schema is out of sync with centralized governance'
        : `skill frontmatter schema is out of sync with centralized governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  return expected;
}

module.exports = {
  SKILL_FRONTMATTER_SCHEMA_VERSION,
  SKILL_FRONTMATTER_SCHEMA_SOURCE,
  buildSkillFrontmatterSchema,
  getSkillFrontmatterSchemaPath,
  writeSkillFrontmatterSchema,
  validateSkillFrontmatterSchema
};
