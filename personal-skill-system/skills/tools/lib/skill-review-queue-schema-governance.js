'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  REVIEW_QUEUE_SCHEMA_VERSION,
  REVIEW_DUE_SOON_DAYS
} = require('./skill-review-governance');
const {
  REVIEW_GOVERNED_SKILL_STATUSES
} = require('./skill-lifecycle-governance');

const REVIEW_QUEUE_SCHEMA_SOURCE = 'generated-from-skill-governance';
const REVIEW_QUEUE_SCHEMA_ID = 'https://personal-skill-system.local/personal-skill-system/review-queue.schema.json';
const REVIEW_QUEUE_ENTRY_STATUSES = Object.freeze(['scheduled', 'due-soon', 'overdue', 'missing-metadata']);
const REVIEW_QUEUE_PRIORITIES = Object.freeze(['critical', 'high', 'normal']);

function cloneArray(values) {
  return Array.isArray(values) ? [...values] : Array.from(values || []);
}

function buildReviewQueueSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: REVIEW_QUEUE_SCHEMA_ID,
    title: 'Portable Personal Skill Review Queue Schema',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'generated-at',
      'source',
      'thresholds',
      'summary',
      'skills'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: REVIEW_QUEUE_SCHEMA_VERSION
      },
      'generated-at': {
        $ref: '#/$defs/isoDateTime'
      },
      source: {
        type: 'string',
        const: 'skills/**/SKILL.md'
      },
      thresholds: {
        type: 'object',
        additionalProperties: false,
        required: ['due-soon-days'],
        properties: {
          'due-soon-days': {
            type: 'integer',
            const: REVIEW_DUE_SOON_DAYS
          }
        }
      },
      summary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'governed-skills',
          'overdue',
          'due-soon',
          'scheduled',
          'missing-metadata',
          'stable-overdue',
          'stable-missing-metadata'
        ],
        properties: {
          'governed-skills': {
            type: 'integer',
            minimum: 0
          },
          overdue: {
            type: 'integer',
            minimum: 0
          },
          'due-soon': {
            type: 'integer',
            minimum: 0
          },
          scheduled: {
            type: 'integer',
            minimum: 0
          },
          'missing-metadata': {
            type: 'integer',
            minimum: 0
          },
          'stable-overdue': {
            type: 'integer',
            minimum: 0
          },
          'stable-missing-metadata': {
            type: 'integer',
            minimum: 0
          }
        }
      },
      skills: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'skill',
            'kind',
            'status',
            'owner',
            'file',
            'last-reviewed',
            'review-cycle-days',
            'review-status',
            'priority'
          ],
          properties: {
            skill: {
              $ref: '#/$defs/skillName'
            },
            kind: {
              $ref: '#/$defs/nonEmptyString'
            },
            status: {
              type: 'string',
              enum: cloneArray(REVIEW_GOVERNED_SKILL_STATUSES)
            },
            owner: {
              $ref: '#/$defs/nonEmptyString'
            },
            file: {
              $ref: '#/$defs/portablePath'
            },
            'last-reviewed': {
              anyOf: [
                { type: 'null' },
                { type: 'string', format: 'date' }
              ]
            },
            'review-cycle-days': {
              anyOf: [
                { type: 'null' },
                { type: 'integer', minimum: 1, maximum: 3650 }
              ]
            },
            'review-status': {
              type: 'string',
              enum: cloneArray(REVIEW_QUEUE_ENTRY_STATUSES)
            },
            priority: {
              type: 'string',
              enum: cloneArray(REVIEW_QUEUE_PRIORITIES)
            },
            'next-review-due': {
              type: 'string',
              format: 'date'
            },
            'days-until-due': {
              type: 'integer'
            },
            'overdue-days': {
              type: 'integer',
              minimum: 0
            }
          }
        }
      }
    },
    $defs: {
      skillName: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 64
      },
      portablePath: {
        type: 'string',
        pattern: '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$',
        minLength: 1
      },
      nonEmptyString: {
        type: 'string',
        minLength: 1
      },
      isoDateTime: {
        type: 'string',
        format: 'date-time'
      }
    }
  };
}

function getReviewQueueSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'review-queue.schema.json');
}

function writeReviewQueueSchema(bundleRoot) {
  const file = getReviewQueueSchemaPath(bundleRoot);
  const payload = buildReviewQueueSchema();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateReviewQueueSchema(bundleRoot, findings) {
  const file = getReviewQueueSchemaPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `review queue schema parse failed: ${parsed.error}`
    });
    return buildReviewQueueSchema();
  }

  const actual = parsed.data || {};
  const expected = buildReviewQueueSchema();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'review queue schema is out of sync with centralized governance'
        : `review queue schema is out of sync with centralized governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  return expected;
}

module.exports = {
  REVIEW_QUEUE_SCHEMA_SOURCE,
  REVIEW_QUEUE_SCHEMA_ID,
  REVIEW_QUEUE_ENTRY_STATUSES,
  REVIEW_QUEUE_PRIORITIES,
  buildReviewQueueSchema,
  getReviewQueueSchemaPath,
  writeReviewQueueSchema,
  validateReviewQueueSchema
};
