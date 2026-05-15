'use strict';

const fs = require('fs');
const path = require('path');
const { rel, parseJsonFile, probeArtifactWriteAccess } = require('./skill-system-common');
const {
  FUTURE_SKILL_PRIORITY_ORDER
} = require('./skill-future-governance');
const {
  SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
  INVESTMENT_PRIORITIES
} = require('./skill-investment-governance');

const SKILL_INVESTMENT_BACKLOG_SCHEMA_SOURCE = 'generated-from-skill-governance';
const SKILL_INVESTMENT_BACKLOG_SCHEMA_ID = 'https://code-abyss.local/personal-skill-system/skill-investment-backlog.schema.json';
const SKILL_INVESTMENT_BACKLOG_CATEGORIES = Object.freeze([
  'future-skill-opportunity',
  'new-skill-admission',
  'existing-skill-evolution',
  'review-cadence',
  'template-governance',
  'template-upgrade',
  'pending-scaffold-materialization',
  'top-tier-hardening',
  'proof-governance',
  'host-writeability',
  'expert-source-integration'
]);
const SKILL_INVESTMENT_BACKLOG_STATUS_ORDER = Object.freeze([
  'open',
  'planned',
  'in-progress',
  'deferred',
  'blocked',
  'implemented',
  'cancelled',
  'resolved'
]);
const SKILL_INVESTMENT_BACKLOG_CANONICAL_SOURCES = Object.freeze([
  'skill-opportunity-queue',
  'admission-ledger',
  'evolution-ledger',
  'review-queue',
  'template-scaffolds',
  'scaffold-lineage',
  'pending-scaffolds',
  'top-tier-readiness',
  'proof-governance',
  'host-writeability',
  'capability-ratings',
  'route-fixtures',
  'runtime-proof',
  'host-smoke-scorecard',
  'authoritative-skills'
]);

function cloneArray(values) {
  return Array.isArray(values) ? [...values] : Array.from(values || []);
}

function buildCounterSchema() {
  return {
    type: 'integer',
    minimum: 0
  };
}

function buildBacklogSummarySchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'total',
      ...cloneArray(INVESTMENT_PRIORITIES),
      'categories',
      'sources'
    ],
    properties: {
      total: buildCounterSchema(),
      critical: buildCounterSchema(),
      high: buildCounterSchema(),
      normal: buildCounterSchema(),
      categories: {
        type: 'object',
        propertyNames: {
          type: 'string',
          enum: cloneArray(SKILL_INVESTMENT_BACKLOG_CATEGORIES)
        },
        additionalProperties: buildCounterSchema()
      },
      sources: {
        type: 'object',
        propertyNames: {
          $ref: '#/$defs/backlogSourceKey'
        },
        additionalProperties: buildCounterSchema()
      }
    }
  };
}

function buildSkillInvestmentBacklogSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SKILL_INVESTMENT_BACKLOG_SCHEMA_ID,
    title: 'Portable Personal Skill Investment Backlog Schema',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'generated-at',
      'sources',
      'summary',
      'items'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION
      },
      'generated-at': {
        $ref: '#/$defs/isoDateTime'
      },
      sources: {
        type: 'object',
        minProperties: 1,
        propertyNames: {
          $ref: '#/$defs/backlogSourceKey'
        },
        additionalProperties: {
          $ref: '#/$defs/nonEmptyString'
        },
        required: cloneArray(SKILL_INVESTMENT_BACKLOG_CANONICAL_SOURCES)
      },
      summary: buildBacklogSummarySchema(),
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'category',
            'status',
            'priority',
            'source',
            'summary',
            'reasons',
            'follow_up'
          ],
          properties: {
            id: {
              $ref: '#/$defs/backlogItemId'
            },
            category: {
              type: 'string',
              enum: cloneArray(SKILL_INVESTMENT_BACKLOG_CATEGORIES)
            },
            status: {
              type: 'string',
              enum: cloneArray(SKILL_INVESTMENT_BACKLOG_STATUS_ORDER)
            },
            priority: {
              type: 'string',
              enum: cloneArray(FUTURE_SKILL_PRIORITY_ORDER)
            },
            source: {
              $ref: '#/$defs/backlogSourceKey'
            },
            skill: {
              anyOf: [
                { $ref: '#/$defs/skillName' },
                { type: 'null' }
              ]
            },
            kind: {
              anyOf: [
                { $ref: '#/$defs/nonEmptyString' },
                { type: 'null' }
              ]
            },
            summary: {
              $ref: '#/$defs/nonEmptyString'
            },
            reasons: {
              type: 'array',
              items: {
                $ref: '#/$defs/nonEmptyString'
              },
              uniqueItems: true
            },
            follow_up: {
              type: 'array',
              items: {
                $ref: '#/$defs/nonEmptyString'
              }
            }
          }
        }
      }
    },
    $defs: {
      nonEmptyString: {
        type: 'string',
        minLength: 1
      },
      skillName: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 64
      },
      backlogItemId: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 200
      },
      backlogSourceKey: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 120
      },
      isoDateTime: {
        type: 'string',
        format: 'date-time'
      }
    }
  };
}

function getSkillInvestmentBacklogSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'skill-investment-backlog.schema.json');
}

function writeSkillInvestmentBacklogSchema(bundleRoot) {
  const file = getSkillInvestmentBacklogSchemaPath(bundleRoot);
  const payload = buildSkillInvestmentBacklogSchema();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateSkillInvestmentBacklogSchema(bundleRoot, findings) {
  const file = getSkillInvestmentBacklogSchemaPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `skill investment backlog schema parse failed: ${parsed.error}`
    });
    return buildSkillInvestmentBacklogSchema();
  }

  const actual = parsed.data || {};
  const expected = buildSkillInvestmentBacklogSchema();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'skill investment backlog schema is out of sync with centralized governance'
        : `skill investment backlog schema is out of sync with centralized governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  return expected;
}

module.exports = {
  SKILL_INVESTMENT_BACKLOG_SCHEMA_VERSION,
  SKILL_INVESTMENT_BACKLOG_SCHEMA_SOURCE,
  SKILL_INVESTMENT_BACKLOG_CATEGORIES,
  SKILL_INVESTMENT_BACKLOG_STATUS_ORDER,
  SKILL_INVESTMENT_BACKLOG_CANONICAL_SOURCES,
  buildSkillInvestmentBacklogSchema,
  getSkillInvestmentBacklogSchemaPath,
  writeSkillInvestmentBacklogSchema,
  validateSkillInvestmentBacklogSchema
};
