'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  SKILL_KIND_ORDER
} = require('./skill-kind-governance');
const {
  EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION,
  EXPERT_SOURCE_INTEGRATION_MODE,
  EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION,
  EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION,
  EXPERT_SOURCE_FAMILY_STATUS_ORDER,
  EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER
} = require('./skill-expert-source-governance');

const EXPERT_SOURCE_INTEGRATION_SCHEMA_SOURCE = 'generated-from-skill-governance';
const EXPERT_SOURCE_SCHEMA_ID_BASE = 'https://personal-skill-system.local/personal-skill-system';

const EXPERT_SOURCE_SCHEMA_DEFINITIONS = Object.freeze({
  'expert-source-families-schema': {
    path: 'registry/expert-source-families.schema.json',
    label: 'expert-source family schema',
    build: buildExpertSourceFamiliesSchema
  },
  'expert-source-family-scorecard-schema': {
    path: 'registry/expert-source-family-scorecard.schema.json',
    label: 'expert-source family scorecard schema',
    build: buildExpertSourceFamilyScorecardSchema
  },
  'expert-source-integration-schema': {
    path: 'registry/expert-source-integration.schema.json',
    label: 'expert-source integration schema',
    build: buildExpertSourceIntegrationSchema
  }
});

const EXPERT_SOURCE_SCHEMA_ORDER = Object.freeze(Object.keys(EXPERT_SOURCE_SCHEMA_DEFINITIONS));

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
    isoDateTime: {
      type: 'string',
      format: 'date-time'
    },
    stringList: {
      type: 'array',
      uniqueItems: true,
      items: {
        $ref: '#/$defs/nonEmptyString'
      }
    },
    skillNameList: {
      type: 'array',
      uniqueItems: true,
      items: {
        $ref: '#/$defs/skillName'
      }
    }
  };
}

function buildCountSummarySchema(requiredKeys) {
  const properties = Object.fromEntries(
    ['total', ...requiredKeys].map((key) => [key, buildCounterSchema()])
  );
  return {
    type: 'object',
    additionalProperties: false,
    required: ['total', ...requiredKeys],
    properties
  };
}

function buildExpertSourceFamiliesSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${EXPERT_SOURCE_SCHEMA_ID_BASE}/expert-source-families.schema.json`,
    title: 'Portable Personal Skill Expert-Source Family Registry Schema',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'families'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: EXPERT_SOURCE_FAMILIES_SCHEMA_VERSION
      },
      families: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'title',
            'source',
            'label',
            'rawSourceLabel',
            'integrationFile',
            'rawRoot',
            'status',
            'schemaVersion',
            'integrationMode',
            'expectedPortable',
            'parseErrorSummary',
            'unmappedSummaryTemplate',
            'unmappedReason',
            'staleReason',
            'sourceDescription',
            'backlogFollowUp'
          ],
          properties: {
            id: {
              $ref: '#/$defs/registryId'
            },
            title: {
              $ref: '#/$defs/nonEmptyString'
            },
            source: {
              $ref: '#/$defs/registryId'
            },
            label: {
              $ref: '#/$defs/nonEmptyString'
            },
            rawSourceLabel: {
              $ref: '#/$defs/nonEmptyString'
            },
            integrationFile: {
              $ref: '#/$defs/portablePath'
            },
            rawRoot: {
              type: 'string',
              minLength: 1
            },
            status: {
              type: 'string',
              enum: cloneArray(EXPERT_SOURCE_FAMILY_STATUS_ORDER)
            },
            schemaVersion: {
              type: 'integer',
              const: EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION
            },
            integrationMode: {
              type: 'string',
              const: EXPERT_SOURCE_INTEGRATION_MODE
            },
            expectedPortable: {
              type: 'boolean'
            },
            parseErrorSummary: {
              $ref: '#/$defs/nonEmptyString'
            },
            unmappedSummaryTemplate: {
              $ref: '#/$defs/nonEmptyString'
            },
            unmappedReason: {
              $ref: '#/$defs/nonEmptyString'
            },
            staleReason: {
              $ref: '#/$defs/nonEmptyString'
            },
            backlogFollowUp: {
              $ref: '#/$defs/stringList'
            },
            sourceDescription: {
              $ref: '#/$defs/nonEmptyString'
            }
          }
        }
      }
    },
    $defs: {
      ...buildSharedDefs()
    }
  };
}

function buildExpertSourceFamilyScorecardSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${EXPERT_SOURCE_SCHEMA_ID_BASE}/expert-source-family-scorecard.schema.json`,
    title: 'Portable Personal Skill Expert-Source Family Scorecard Schema',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'generated-at',
      'sources',
      'experimental-pack',
      'summary',
      'families'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: EXPERT_SOURCE_FAMILY_SCORECARD_SCHEMA_VERSION
      },
      'generated-at': {
        $ref: '#/$defs/isoDateTime'
      },
      sources: {
        type: 'object',
        additionalProperties: false,
        required: [
          'family-registry',
          'experimental-pack'
        ],
        properties: {
          'family-registry': {
            $ref: '#/$defs/portablePath'
          },
          'experimental-pack': {
            $ref: '#/$defs/portablePath'
          }
        }
      },
      'experimental-pack': {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'parseError',
          'includes'
        ],
        properties: {
          file: {
            $ref: '#/$defs/portablePath'
          },
          parseError: {
            anyOf: [
              { $ref: '#/$defs/nonEmptyString' },
              { type: 'null' }
            ]
          },
          includes: {
            type: 'array',
            uniqueItems: true,
            items: {
              $ref: '#/$defs/portablePath'
            }
          }
        }
      },
      summary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'total-families',
          'active-families',
          'archived-families',
          'families-with-parse-errors',
          'active-families-with-parse-errors',
          'experimental-pack-parse-errors',
          'active-raw-source-skills',
          'active-integrated-source-skills',
          'active-integrated-modules',
          'active-unmapped-raw-sources',
          'active-stale-mapped-sources',
          'active-missing-pack-includes',
          'archived-pack-includes'
        ],
        properties: {
          'total-families': buildCounterSchema(),
          'active-families': buildCounterSchema(),
          'archived-families': buildCounterSchema(),
          'families-with-parse-errors': buildCounterSchema(),
          'active-families-with-parse-errors': buildCounterSchema(),
          'experimental-pack-parse-errors': buildCounterSchema(),
          'active-raw-source-skills': buildCounterSchema(),
          'active-integrated-source-skills': buildCounterSchema(),
          'active-integrated-modules': buildCounterSchema(),
          'active-unmapped-raw-sources': buildCounterSchema(),
          'active-stale-mapped-sources': buildCounterSchema(),
          'active-missing-pack-includes': buildCounterSchema(),
          'archived-pack-includes': buildCounterSchema()
        }
      },
      families: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'title',
            'source',
            'label',
            'status',
            'integrationFile',
            'rawRoot',
            'expectedPortable',
            'parseError',
            'rawRootExists',
            'rawSourceSkills',
            'integratedSourceSkills',
            'integratedModules',
            'unmappedRawSources',
            'staleMappedSources',
            'experimentalPackRequired',
            'experimentalPackIncluded',
            'experimentalPackStatus'
          ],
          properties: {
            id: {
              $ref: '#/$defs/registryId'
            },
            title: {
              $ref: '#/$defs/nonEmptyString'
            },
            source: {
              $ref: '#/$defs/registryId'
            },
            label: {
              $ref: '#/$defs/nonEmptyString'
            },
            status: {
              type: 'string',
              enum: cloneArray(EXPERT_SOURCE_FAMILY_STATUS_ORDER)
            },
            integrationFile: {
              $ref: '#/$defs/portablePath'
            },
            rawRoot: {
              type: 'string',
              minLength: 1
            },
            expectedPortable: {
              type: 'boolean'
            },
            parseError: {
              anyOf: [
                { $ref: '#/$defs/nonEmptyString' },
                { type: 'null' }
              ]
            },
            rawRootExists: {
              type: 'boolean'
            },
            rawSourceSkills: buildCounterSchema(),
            integratedSourceSkills: buildCounterSchema(),
            integratedModules: buildCounterSchema(),
            unmappedRawSources: {
              $ref: '#/$defs/skillNameList'
            },
            staleMappedSources: {
              $ref: '#/$defs/skillNameList'
            },
            experimentalPackRequired: {
              type: 'boolean'
            },
            experimentalPackIncluded: {
              type: 'boolean'
            },
            experimentalPackStatus: {
              type: 'string',
              enum: cloneArray(EXPERT_SOURCE_EXPERIMENTAL_PACK_STATUS_ORDER)
            }
          }
        }
      }
    },
    $defs: {
      ...buildSharedDefs()
    }
  };
}

function buildExpertSourceIntegrationSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${EXPERT_SOURCE_SCHEMA_ID_BASE}/expert-source-integration.schema.json`,
    title: 'Portable Personal Skill Expert-Source Integration Schema',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'integration-mode',
      'portable',
      'module-count',
      'groups',
      'modules',
      'source-index'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: EXPERT_SOURCE_INTEGRATION_SCHEMA_VERSION
      },
      'integration-mode': {
        type: 'string',
        const: EXPERT_SOURCE_INTEGRATION_MODE
      },
      portable: {
        type: 'boolean'
      },
      'module-count': buildCounterSchema(),
      groups: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'kind',
            'name',
            'modules'
          ],
          properties: {
            kind: {
              type: 'string',
              enum: cloneArray(SKILL_KIND_ORDER)
            },
            name: {
              $ref: '#/$defs/skillName'
            },
            modules: {
              $ref: '#/$defs/moduleIdList'
            }
          }
        }
      },
      modules: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'module',
            'host-skill',
            'path',
            'capability',
            'derived-from'
          ],
          properties: {
            module: {
              $ref: '#/$defs/moduleId'
            },
            'host-skill': {
              type: 'object',
              additionalProperties: false,
              required: [
                'kind',
                'name',
                'path'
              ],
              properties: {
                kind: {
                  type: 'string',
                  enum: cloneArray(SKILL_KIND_ORDER)
                },
                name: {
                  $ref: '#/$defs/skillName'
                },
                path: {
                  $ref: '#/$defs/portablePath'
                }
              }
            },
            path: {
              $ref: '#/$defs/portablePath'
            },
            capability: {
              $ref: '#/$defs/nonEmptyString'
            },
            'derived-from': {
              $ref: '#/$defs/skillNameList'
            }
          }
        }
      },
      'source-index': {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'source-skill',
            'modules'
          ],
          properties: {
            'source-skill': {
              $ref: '#/$defs/skillName'
            },
            modules: {
              $ref: '#/$defs/moduleIdList'
            }
          }
        }
      }
    },
    $defs: {
      ...buildSharedDefs(),
      moduleId: {
        type: 'string',
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        minLength: 1,
        maxLength: 120
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

function getExpertSourceSchemaDefinition(schemaArtifactId) {
  return EXPERT_SOURCE_SCHEMA_DEFINITIONS[String(schemaArtifactId || '').trim()] || null;
}

function getExpertSourceSchemaPath(bundleRoot, schemaArtifactId) {
  const definition = getExpertSourceSchemaDefinition(schemaArtifactId);
  return definition ? path.join(bundleRoot, definition.path) : null;
}

function writeExpertSourceSchema(bundleRoot, schemaArtifactId) {
  const definition = getExpertSourceSchemaDefinition(schemaArtifactId);
  if (!definition) {
    throw new Error(`unknown expert-source schema artifact '${schemaArtifactId}'`);
  }
  const file = getExpertSourceSchemaPath(bundleRoot, schemaArtifactId);
  const payload = definition.build();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    id: schemaArtifactId,
    file,
    payload
  };
}

function writeExpertSourceSchemas(bundleRoot) {
  return EXPERT_SOURCE_SCHEMA_ORDER.map((schemaArtifactId) => writeExpertSourceSchema(bundleRoot, schemaArtifactId));
}

function validateExpertSourceSchemas(bundleRoot, findings) {
  const expectedSchemas = {};

  for (const schemaArtifactId of EXPERT_SOURCE_SCHEMA_ORDER) {
    const definition = getExpertSourceSchemaDefinition(schemaArtifactId);
    const file = getExpertSourceSchemaPath(bundleRoot, schemaArtifactId);
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
          ? `${definition.label} is out of sync with centralized expert-source governance`
          : `${definition.label} is out of sync with centralized expert-source governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
      });
    }
  }

  return expectedSchemas;
}

module.exports = {
  EXPERT_SOURCE_INTEGRATION_SCHEMA_SOURCE,
  EXPERT_SOURCE_SCHEMA_DEFINITIONS,
  EXPERT_SOURCE_SCHEMA_ORDER,
  buildExpertSourceFamiliesSchema,
  buildExpertSourceFamilyScorecardSchema,
  buildExpertSourceIntegrationSchema,
  getExpertSourceSchemaPath,
  writeExpertSourceSchema,
  writeExpertSourceSchemas,
  validateExpertSourceSchemas
};
