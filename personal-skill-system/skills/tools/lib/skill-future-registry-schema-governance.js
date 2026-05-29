'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  FUTURE_SKILL_KINDS,
  FUTURE_SKILL_PRIORITY_ORDER,
  FUTURE_SKILL_HORIZON_ORDER,
  OPPORTUNITY_STATUS_ORDER,
  ADMISSION_DECISION_ACTIONS,
  ADMISSION_DECISION_ACTION_ORDER,
  ADMISSION_DECISION_FIELD_ORDER,
  getAdmissionDecisionFieldDefinition,
  getRequiredAdmissionDecisionFields,
  getAllowedAdmissionDecisionFields,
  ADMISSION_STATUS_ORDER,
  EVOLUTION_LEDGER_STATUS_ORDER,
  PENDING_SCAFFOLD_STATUS_ORDER,
  FUTURE_SKILL_REGISTRY_SOURCE
} = require('./skill-future-governance');
const {
  SKILL_STATUS_ORDER,
  EVOLUTION_DECISION_ACTIONS
} = require('./skill-lifecycle-governance');

const SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION = 1;
const ADMISSION_LEDGER_SCHEMA_VERSION = 2;
const EVOLUTION_LEDGER_SCHEMA_VERSION = 2;
const PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION = 1;
const FUTURE_REGISTRY_SCHEMA_SOURCE = 'generated-from-skill-governance';
const FUTURE_REGISTRY_SCHEMA_ID_BASE = 'https://personal-skill-system.local/personal-skill-system';
const FUTURE_REGISTRY_DECISION_ACTIONS = Object.freeze([...ADMISSION_DECISION_ACTIONS]);
const FUTURE_REGISTRY_EVOLUTION_ACTIONS = Object.freeze([...EVOLUTION_DECISION_ACTIONS]);
const FUTURE_REGISTRY_RESULT_STATUSES = Object.freeze([...SKILL_STATUS_ORDER, 'deleted']);

function cloneArray(values) {
  return Array.isArray(values) ? [...values] : Array.from(values || []);
}

function buildCounterSchema() {
  return {
    type: 'integer',
    minimum: 0
  };
}

function buildSharedDefs() {
  return {
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
    registryId: {
      type: 'string',
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      minLength: 1,
      maxLength: 160
    },
    portablePath: {
      type: 'string',
      pattern: '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$',
      minLength: 1
    },
    tag: {
      type: 'string',
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      minLength: 1,
      maxLength: 80
    },
    isoDateTime: {
      type: 'string',
      format: 'date-time'
    }
  };
}

function buildUniqueStringArray(itemSchema, options = {}) {
  const schema = {
    type: 'array',
    items: itemSchema,
    uniqueItems: true
  };
  if (Number.isInteger(options.minItems)) {
    schema.minItems = options.minItems;
  }
  return schema;
}

function buildCountSummarySchema(countKeys) {
  const required = ['total', 'active', ...countKeys];
  const properties = Object.fromEntries(required.map((key) => [key, buildCounterSchema()]));
  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties
  };
}

function buildAdmissionDecisionFieldSchema(fieldName) {
  const definition = getAdmissionDecisionFieldDefinition(fieldName);
  if (!definition) {
    return { type: 'string' };
  }
  if (definition.type === 'skill-name') {
    return { $ref: '#/$defs/skillName' };
  }
  if (definition.type === 'kind') {
    return {
      type: 'string',
      enum: cloneArray(FUTURE_SKILL_KINDS)
    };
  }
  return { $ref: '#/$defs/nonEmptyString' };
}

function buildAdmissionDecisionVariantSchema(action) {
  const requiredFields = getRequiredAdmissionDecisionFields(action);
  const allowedFields = new Set(getAllowedAdmissionDecisionFields(action));
  const variantProperties = {
    action: {
      type: 'string',
      const: action
    }
  };
  const required = ['action', ...requiredFields];

  for (const fieldName of ADMISSION_DECISION_FIELD_ORDER) {
    if (allowedFields.has(fieldName)) {
      variantProperties[fieldName] = buildAdmissionDecisionFieldSchema(fieldName);
    }
  }

  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties: variantProperties
  };
}

function buildFutureRegistryDocumentSchema(relativeSchemaPath, title, schemaVersion, summarySchema, entrySchema, extraDefs = {}) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${FUTURE_REGISTRY_SCHEMA_ID_BASE}/${path.basename(relativeSchemaPath)}`,
    title,
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'generated-at',
      'source',
      'summary',
      'entries'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: schemaVersion
      },
      'generated-at': {
        $ref: '#/$defs/isoDateTime'
      },
      source: {
        type: 'string',
        const: FUTURE_SKILL_REGISTRY_SOURCE
      },
      summary: summarySchema,
      entries: {
        type: 'array',
        items: entrySchema
      }
    },
    $defs: {
      ...buildSharedDefs(),
      ...extraDefs
    }
  };
}

function buildSkillOpportunityQueueSchema() {
  return buildFutureRegistryDocumentSchema(
    'registry/skill-opportunity-queue.schema.json',
    'Portable Personal Skill Opportunity Queue Schema',
    SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
    buildCountSummarySchema([
      ...cloneArray(OPPORTUNITY_STATUS_ORDER),
      ...cloneArray(FUTURE_SKILL_PRIORITY_ORDER),
      ...cloneArray(FUTURE_SKILL_HORIZON_ORDER)
    ]),
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'opportunity-id',
        'summary',
        'priority',
        'status',
        'horizon',
        'recorded-at'
      ],
      properties: {
        'opportunity-id': {
          $ref: '#/$defs/registryId'
        },
        summary: {
          $ref: '#/$defs/nonEmptyString'
        },
        'suggested-kind': {
          type: 'string',
          enum: cloneArray(FUTURE_SKILL_KINDS)
        },
        priority: {
          type: 'string',
          enum: cloneArray(FUTURE_SKILL_PRIORITY_ORDER)
        },
        status: {
          type: 'string',
          enum: cloneArray(OPPORTUNITY_STATUS_ORDER)
        },
        horizon: {
          type: 'string',
          enum: cloneArray(FUTURE_SKILL_HORIZON_ORDER)
        },
        'adjacent-skills': buildUniqueStringArray({
          $ref: '#/$defs/skillName'
        }),
        rationale: buildUniqueStringArray({
          $ref: '#/$defs/tag'
        }),
        'recorded-at': {
          $ref: '#/$defs/isoDateTime'
        },
        'resolved-at': {
          $ref: '#/$defs/isoDateTime'
        },
        'created-skill': {
          $ref: '#/$defs/skillName'
        },
        'admission-request-id': {
          $ref: '#/$defs/registryId'
        },
        note: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    }
  );
}

function buildAdmissionLedgerSchema() {
  return buildFutureRegistryDocumentSchema(
    'registry/admission-ledger.schema.json',
    'Portable Personal Skill Admission Ledger Schema',
    ADMISSION_LEDGER_SCHEMA_VERSION,
    buildCountSummarySchema(cloneArray(ADMISSION_STATUS_ORDER)),
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'request-id',
        'request',
        'decision',
        'status',
        'recorded-at'
      ],
      properties: {
        'request-id': {
          $ref: '#/$defs/registryId'
        },
        request: {
          $ref: '#/$defs/nonEmptyString'
        },
        'suggested-kind': {
          type: 'string',
          enum: cloneArray(FUTURE_SKILL_KINDS)
        },
        'inferred-intent-tags': buildUniqueStringArray({
          $ref: '#/$defs/tag'
        }),
        'opportunity-id': {
          $ref: '#/$defs/registryId'
        },
        decision: {
          oneOf: ADMISSION_DECISION_ACTION_ORDER.map((action) => buildAdmissionDecisionVariantSchema(action))
        },
        status: {
          type: 'string',
          enum: cloneArray(ADMISSION_STATUS_ORDER)
        },
        'recorded-at': {
          $ref: '#/$defs/isoDateTime'
        },
        'created-skill': {
          $ref: '#/$defs/skillName'
        },
        note: {
          $ref: '#/$defs/nonEmptyString'
        },
        'resolved-at': {
          $ref: '#/$defs/isoDateTime'
        }
      }
    }
  );
}

function buildEvolutionLedgerSchema() {
  return buildFutureRegistryDocumentSchema(
    'registry/evolution-ledger.schema.json',
    'Portable Personal Skill Evolution Ledger Schema',
    EVOLUTION_LEDGER_SCHEMA_VERSION,
    buildCountSummarySchema(cloneArray(EVOLUTION_LEDGER_STATUS_ORDER)),
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'request-id',
        'skill',
        'request',
        'decision',
        'status',
        'recorded-at'
      ],
      properties: {
        'request-id': {
          $ref: '#/$defs/registryId'
        },
        skill: {
          $ref: '#/$defs/skillName'
        },
        request: {
          $ref: '#/$defs/nonEmptyString'
        },
        decision: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: {
              type: 'string',
              enum: cloneArray(FUTURE_REGISTRY_EVOLUTION_ACTIONS)
            },
            target_status: {
              type: 'string',
              enum: cloneArray(FUTURE_REGISTRY_RESULT_STATUSES)
            },
            target_skill: {
              $ref: '#/$defs/skillName'
            },
            note: {
              $ref: '#/$defs/nonEmptyString'
            }
          }
        },
        status: {
          type: 'string',
          enum: cloneArray(EVOLUTION_LEDGER_STATUS_ORDER)
        },
        'recorded-at': {
          $ref: '#/$defs/isoDateTime'
        },
        'resolved-at': {
          $ref: '#/$defs/isoDateTime'
        },
        'executed-action': {
          $ref: '#/$defs/nonEmptyString'
        },
        'result-status': {
          type: 'string',
          enum: cloneArray(FUTURE_REGISTRY_RESULT_STATUSES)
        },
        'merged-into': {
          $ref: '#/$defs/skillName'
        },
        note: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    }
  );
}

function buildPendingScaffoldRegistrySchema() {
  return buildFutureRegistryDocumentSchema(
    'registry/pending-scaffolds.schema.json',
    'Portable Personal Skill Pending Scaffold Registry Schema',
    PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION,
    buildCountSummarySchema(cloneArray(PENDING_SCAFFOLD_STATUS_ORDER)),
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'pending-id',
        'kind',
        'skill',
        'path',
        'status',
        'recorded-at',
        'files'
      ],
      properties: {
        'pending-id': {
          $ref: '#/$defs/registryId'
        },
        kind: {
          type: 'string',
          enum: cloneArray(FUTURE_SKILL_KINDS)
        },
        skill: {
          $ref: '#/$defs/skillName'
        },
        path: {
          $ref: '#/$defs/portablePath'
        },
        status: {
          type: 'string',
          enum: cloneArray(PENDING_SCAFFOLD_STATUS_ORDER)
        },
        'recorded-at': {
          $ref: '#/$defs/isoDateTime'
        },
        files: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'path',
              'content'
            ],
            properties: {
              path: {
                $ref: '#/$defs/portablePath'
              },
              content: {
                type: 'string'
              }
            }
          }
        },
        'request-id': {
          $ref: '#/$defs/registryId'
        },
        'opportunity-id': {
          $ref: '#/$defs/registryId'
        },
        'rerun-command': {
          $ref: '#/$defs/nonEmptyString'
        },
        note: {
          $ref: '#/$defs/nonEmptyString'
        },
        'template-origin': {
          $ref: '#/$defs/nonEmptyString'
        },
        'template-version': {
          type: 'integer',
          minimum: 1
        },
        'host-constraint': {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            type: {
              $ref: '#/$defs/nonEmptyString'
            },
            mode: {
              $ref: '#/$defs/nonEmptyString'
            },
            code: {
              $ref: '#/$defs/nonEmptyString'
            },
            parent: {
              $ref: '#/$defs/portablePath'
            }
          }
        },
        'capability-modules': {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: {
                $ref: '#/$defs/nonEmptyString'
              },
              path: {
                $ref: '#/$defs/portablePath'
              },
              capability: {
                $ref: '#/$defs/nonEmptyString'
              }
            }
          }
        },
        'create-placeholder-route': {
          type: 'boolean'
        },
        'scaffold-modules': {
          type: 'boolean'
        },
        shared: {
          type: 'object'
        }
      }
    }
  );
}

const FUTURE_REGISTRY_SCHEMA_DEFINITIONS = Object.freeze({
  'skill-opportunity-queue-schema': {
    path: 'registry/skill-opportunity-queue.schema.json',
    label: 'skill opportunity queue schema',
    build: buildSkillOpportunityQueueSchema
  },
  'admission-ledger-schema': {
    path: 'registry/admission-ledger.schema.json',
    label: 'admission ledger schema',
    build: buildAdmissionLedgerSchema
  },
  'evolution-ledger-schema': {
    path: 'registry/evolution-ledger.schema.json',
    label: 'evolution ledger schema',
    build: buildEvolutionLedgerSchema
  },
  'pending-scaffolds-schema': {
    path: 'registry/pending-scaffolds.schema.json',
    label: 'pending scaffold schema',
    build: buildPendingScaffoldRegistrySchema
  }
});

const FUTURE_REGISTRY_SCHEMA_ORDER = Object.freeze(Object.keys(FUTURE_REGISTRY_SCHEMA_DEFINITIONS));

function getFutureRegistrySchemaDefinition(schemaArtifactId) {
  return FUTURE_REGISTRY_SCHEMA_DEFINITIONS[String(schemaArtifactId || '').trim()] || null;
}

function getFutureRegistrySchemaPath(bundleRoot, schemaArtifactId) {
  const definition = getFutureRegistrySchemaDefinition(schemaArtifactId);
  return definition ? path.join(bundleRoot, definition.path) : null;
}

function writeFutureRegistrySchema(bundleRoot, schemaArtifactId) {
  const definition = getFutureRegistrySchemaDefinition(schemaArtifactId);
  if (!definition) {
    throw new Error(`unknown future registry schema artifact '${schemaArtifactId}'`);
  }
  const file = getFutureRegistrySchemaPath(bundleRoot, schemaArtifactId);
  const payload = definition.build();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    id: schemaArtifactId,
    file,
    payload
  };
}

function writeFutureRegistrySchemas(bundleRoot) {
  return FUTURE_REGISTRY_SCHEMA_ORDER.map((schemaArtifactId) => writeFutureRegistrySchema(bundleRoot, schemaArtifactId));
}

function validateFutureRegistrySchemas(bundleRoot, findings) {
  const expectedSchemas = {};

  for (const schemaArtifactId of FUTURE_REGISTRY_SCHEMA_ORDER) {
    const definition = getFutureRegistrySchemaDefinition(schemaArtifactId);
    const file = getFutureRegistrySchemaPath(bundleRoot, schemaArtifactId);
    const parsed = parseJsonFile(file);
    const expected = definition.build();
    expectedSchemas[schemaArtifactId] = expected;

    if (parsed.error) {
      findings.push({
        severity: 'error',
        file: rel(bundleRoot, file),
        message: `${definition.label} parse failed: ${parsed.error}`
      });
      continue;
    }

    const actual = parsed.data || {};
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const probe = probeArtifactWriteAccess(file, { mode: 'rewrite-file' });
      findings.push({
        severity: probe.ok ? 'error' : 'warning',
        file: rel(bundleRoot, file),
        message: probe.ok
          ? `${definition.label} is out of sync with centralized future-registry governance`
          : `${definition.label} is out of sync with centralized future-registry governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
      });
    }
  }

  return expectedSchemas;
}

module.exports = {
  SKILL_OPPORTUNITY_QUEUE_SCHEMA_VERSION,
  ADMISSION_LEDGER_SCHEMA_VERSION,
  EVOLUTION_LEDGER_SCHEMA_VERSION,
  PENDING_SCAFFOLD_REGISTRY_SCHEMA_VERSION,
  FUTURE_REGISTRY_SCHEMA_SOURCE,
  FUTURE_REGISTRY_SCHEMA_DEFINITIONS,
  FUTURE_REGISTRY_SCHEMA_ORDER,
  buildSkillOpportunityQueueSchema,
  buildAdmissionLedgerSchema,
  buildEvolutionLedgerSchema,
  buildPendingScaffoldRegistrySchema,
  getFutureRegistrySchemaPath,
  writeFutureRegistrySchema,
  writeFutureRegistrySchemas,
  validateFutureRegistrySchemas
};
