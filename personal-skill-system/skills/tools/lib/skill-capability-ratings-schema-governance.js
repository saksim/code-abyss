'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  CAPABILITY_RATING_BUCKET_SEQUENCE,
  CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE,
  SKILL_LEVEL_SUMMARY_BUCKETS
} = require('./skill-capability-ratings-governance');

const CAPABILITY_RATINGS_SCHEMA_VERSION = 2;
const CAPABILITY_RATINGS_SCHEMA_SOURCE = 'generated-from-skill-governance';
const CAPABILITY_RATINGS_SCHEMA_ID = 'https://code-abyss.local/personal-skill-system/capability-ratings.schema.json';

function cloneArray(values) {
  return Array.isArray(values) ? [...values] : Array.from(values || []);
}

function buildCounterSchema() {
  return {
    type: 'integer',
    minimum: 0
  };
}

function buildCapabilityRatingsSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: CAPABILITY_RATINGS_SCHEMA_ID,
    title: 'Portable Personal Skill Capability Ratings Schema',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'scope',
      'rating-buckets',
      'counts',
      'skill-level-summary',
      'next-batch',
      'notes'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: CAPABILITY_RATINGS_SCHEMA_VERSION
      },
      scope: {
        type: 'string',
        const: 'capability-modules'
      },
      'rating-buckets': {
        type: 'object',
        additionalProperties: false,
        required: cloneArray(CAPABILITY_RATING_BUCKET_SEQUENCE),
        properties: {
          thin: {
            $ref: '#/$defs/moduleIdList'
          },
          'strong-but-not-top': {
            $ref: '#/$defs/moduleIdList'
          },
          'top-ready': {
            $ref: '#/$defs/moduleIdList'
          }
        }
      },
      counts: {
        type: 'object',
        additionalProperties: false,
        required: [
          ...cloneArray(CAPABILITY_RATING_BUCKET_SEQUENCE),
          'total'
        ],
        properties: {
          thin: buildCounterSchema(),
          'strong-but-not-top': buildCounterSchema(),
          'top-ready': buildCounterSchema(),
          total: buildCounterSchema()
        }
      },
      'skill-level-summary': {
        type: 'object',
        additionalProperties: false,
        required: [
          'source',
          ...cloneArray(SKILL_LEVEL_SUMMARY_BUCKETS),
          'counts'
        ],
        properties: {
          source: {
            $ref: '#/$defs/portablePath'
          },
          'top-level-enough-now': {
            $ref: '#/$defs/skillNameList'
          },
          'strong-uplift-but-not-top-yet': {
            $ref: '#/$defs/skillNameList'
          },
          'useful-overlay-not-top-level-alone': {
            $ref: '#/$defs/skillNameList'
          },
          counts: {
            type: 'object',
            additionalProperties: false,
            required: [
              ...cloneArray(SKILL_LEVEL_SUMMARY_BUCKETS),
              'total-skills-rated',
              'stable-overdue',
              'stable-missing-metadata',
              'stable-expert-source-blocked',
              'stable-blocked-total'
            ],
            properties: {
              'top-level-enough-now': buildCounterSchema(),
              'strong-uplift-but-not-top-yet': buildCounterSchema(),
              'useful-overlay-not-top-level-alone': buildCounterSchema(),
              'total-skills-rated': buildCounterSchema(),
              'stable-overdue': buildCounterSchema(),
              'stable-missing-metadata': buildCounterSchema(),
              'stable-expert-source-blocked': buildCounterSchema(),
              'stable-blocked-total': buildCounterSchema()
            }
          }
        }
      },
      'next-batch': {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'scope',
            'module',
            'host-skill',
            'host-kind',
            'rating',
            'priority',
            'next-step'
          ],
          properties: {
            scope: {
              type: 'string',
              const: 'capability-module'
            },
            module: {
              $ref: '#/$defs/moduleId'
            },
            'host-skill': {
              $ref: '#/$defs/skillName'
            },
            'host-kind': {
              $ref: '#/$defs/nonEmptyString'
            },
            rating: {
              type: 'string',
              enum: cloneArray(CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE)
            },
            priority: {
              type: 'string',
              enum: ['upgrade-now', 'promote-next']
            },
            path: {
              $ref: '#/$defs/portablePath'
            },
            capability: {
              $ref: '#/$defs/nonEmptyString'
            },
            'next-step': {
              $ref: '#/$defs/nonEmptyString'
            }
          }
        }
      },
      notes: {
        type: 'array',
        minItems: 1,
        items: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    },
    $defs: {
      nonEmptyString: {
        type: 'string',
        minLength: 1
      },
      portablePath: {
        type: 'string',
        pattern: '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$',
        minLength: 1
      },
      skillName: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 64
      },
      moduleId: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 120
      },
      skillNameList: {
        type: 'array',
        uniqueItems: true,
        items: {
          $ref: '#/$defs/skillName'
        }
      },
      moduleIdList: {
        type: 'array',
        uniqueItems: true,
        items: {
          $ref: '#/$defs/moduleId'
        }
      }
    }
  };
}

function getCapabilityRatingsSchemaPath(bundleRoot) {
  return path.join(bundleRoot, 'registry', 'capability-ratings.schema.json');
}

function writeCapabilityRatingsSchema(bundleRoot) {
  const file = getCapabilityRatingsSchemaPath(bundleRoot);
  const payload = buildCapabilityRatingsSchema();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    file,
    payload
  };
}

function validateCapabilityRatingsSchema(bundleRoot, findings) {
  const file = getCapabilityRatingsSchemaPath(bundleRoot);
  const parsed = parseJsonFile(file);
  if (parsed.error) {
    findings.push({
      severity: 'error',
      file: rel(bundleRoot, file),
      message: `capability ratings schema parse failed: ${parsed.error}`
    });
    return buildCapabilityRatingsSchema();
  }

  const actual = parsed.data || {};
  const expected = buildCapabilityRatingsSchema();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
    findings.push({
      severity: probe.ok ? 'error' : 'warning',
      file: rel(bundleRoot, file),
      message: probe.ok
        ? 'capability ratings schema is out of sync with centralized governance'
        : `capability ratings schema is out of sync with centralized governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
    });
  }

  return expected;
}

module.exports = {
  CAPABILITY_RATINGS_SCHEMA_VERSION,
  CAPABILITY_RATINGS_SCHEMA_SOURCE,
  buildCapabilityRatingsSchema,
  getCapabilityRatingsSchemaPath,
  writeCapabilityRatingsSchema,
  validateCapabilityRatingsSchema
};
