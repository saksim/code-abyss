'use strict';

const fs = require('fs');
const path = require('path');
const {
  rel,
  parseJsonFile,
  probeArtifactWriteAccess
} = require('./skill-system-common');
const {
  SYSTEM_READINESS_SCHEMA_VERSION,
  SYSTEM_READINESS_STATUS_ORDER,
  SYSTEM_READINESS_SIGNAL_ORDER,
  SYSTEM_READINESS_HOST_SMOKE_SOURCE_KEYS,
  SYSTEM_READINESS_SUMMARY_KEYS,
  SYSTEM_READINESS_NOTES_MIN_ITEMS,
  SYSTEM_READINESS_BENCHMARK_SUMMARY_STATUS_ORDER
} = require('./skill-system-readiness');
const {
  STABLE_TOP_TIER_BLOCKER_FIELDS
} = require('./skill-top-tier-governance');
const {
  HOST_EVOLUTION_SCHEMA_VERSION,
  HOST_EVOLUTION_CAPABILITY_VALUE_ORDER,
  HOST_EVOLUTION_NOTES_MIN_ITEMS
} = require('./skill-system-host-evolution');
const {
  GOVERNED_RUNTIME_PROOF_KIND_ORDER,
  HOST_SMOKE_POLICY_TIERS,
  HOST_SMOKE_TARGET_LEVELS,
  HOST_SMOKE_EVIDENCE_STATUSES,
  HOST_SMOKE_GOVERNANCE_STATUSES,
  HOST_WRITEABILITY_SEVERITY_ORDER
} = require('./skill-host-governance');

const READINESS_SCHEMA_SOURCE = 'generated-from-skill-governance';
const READINESS_SCHEMA_ID_BASE = 'https://personal-skill-system.local/personal-skill-system/benchmark';

const READINESS_SCHEMA_DEFINITIONS = Object.freeze({
  'system-readiness-schema': {
    path: 'benchmark/system-readiness.schema.json',
    label: 'system readiness schema',
    build: buildSystemReadinessSchema
  },
  'host-evolution-schema': {
    path: 'benchmark/host-evolution.schema.json',
    label: 'host evolution schema',
    build: buildHostEvolutionSchema
  }
});

const READINESS_SCHEMA_ORDER = Object.freeze(Object.keys(READINESS_SCHEMA_DEFINITIONS));

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
    portablePath: {
      type: 'string',
      pattern: '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$',
      minLength: 1
    },
    isoDateTime: {
      type: 'string',
      format: 'date-time'
    },
    readinessStatus: {
      type: 'string',
      enum: cloneArray(SYSTEM_READINESS_STATUS_ORDER)
    },
    hostWriteabilitySeverity: {
      type: 'string',
      enum: cloneArray(HOST_WRITEABILITY_SEVERITY_ORDER)
    },
    hostWriteabilityArtifact: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label', 'mode', 'code'],
      properties: {
        id: {
          $ref: '#/$defs/nonEmptyString'
        },
        label: {
          $ref: '#/$defs/nonEmptyString'
        },
        mode: {
          $ref: '#/$defs/nonEmptyString'
        },
        code: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    },
    hostSmokePolicySummary: {
      type: 'object',
      additionalProperties: false,
      required: ['tiers', 'statuses'],
      properties: {
        tiers: {
          type: 'object',
          additionalProperties: false,
          required: cloneArray(HOST_SMOKE_POLICY_TIERS).sort(),
          properties: Object.fromEntries(
            cloneArray(HOST_SMOKE_POLICY_TIERS).sort().map((tier) => [tier, buildCounterSchema()])
          )
        },
        statuses: {
          type: 'object',
          additionalProperties: false,
          required: cloneArray(SYSTEM_READINESS_STATUS_ORDER),
          properties: Object.fromEntries(
            cloneArray(SYSTEM_READINESS_STATUS_ORDER).map((status) => [status, buildCounterSchema()])
          )
        }
      }
    },
    hostSmokePolicyEntry: {
      type: 'object',
      additionalProperties: false,
      required: [
        'skill',
        'kind',
        'tier',
        'status',
        'level',
        'target-level',
        'requires-freshness',
        'evidence-status',
        'governance-status'
      ],
      properties: {
        skill: {
          type: 'string',
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        },
        kind: {
          type: 'string',
          enum: cloneArray(GOVERNED_RUNTIME_PROOF_KIND_ORDER)
        },
        tier: {
          type: 'string',
          enum: cloneArray(HOST_SMOKE_POLICY_TIERS).sort()
        },
        status: {
          $ref: '#/$defs/readinessStatus'
        },
        level: {
          type: 'string',
          enum: cloneArray(HOST_SMOKE_TARGET_LEVELS).sort()
        },
        'target-level': {
          type: 'string',
          enum: cloneArray(HOST_SMOKE_TARGET_LEVELS).sort()
        },
        'requires-freshness': {
          type: 'boolean'
        },
        'max-freshness-days': {
          type: 'integer',
          minimum: 1
        },
        'evidence-status': {
          type: 'string',
          enum: cloneArray(HOST_SMOKE_EVIDENCE_STATUSES).sort()
        },
        'governance-status': {
          type: 'string',
          enum: cloneArray(HOST_SMOKE_GOVERNANCE_STATUSES).sort()
        }
      }
    },
    hostEvolutionConstraint: {
      type: 'object',
      additionalProperties: true,
      required: ['id', 'label', 'mode', 'code', 'path', 'severity'],
      properties: {
        id: {
          $ref: '#/$defs/nonEmptyString'
        },
        label: {
          $ref: '#/$defs/nonEmptyString'
        },
        mode: {
          $ref: '#/$defs/nonEmptyString'
        },
        code: {
          $ref: '#/$defs/nonEmptyString'
        },
        path: {
          $ref: '#/$defs/nonEmptyString'
        },
        severity: {
          $ref: '#/$defs/hostWriteabilitySeverity'
        }
      }
    },
    pendingScaffold: {
      type: 'object',
      additionalProperties: true,
      required: ['pending-id', 'skill', 'kind', 'status'],
      properties: {
        'pending-id': {
          $ref: '#/$defs/nonEmptyString'
        },
        skill: {
          $ref: '#/$defs/nonEmptyString'
        },
        kind: {
          $ref: '#/$defs/nonEmptyString'
        },
        status: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    },
    blockedAdmission: {
      type: 'object',
      additionalProperties: true,
      required: ['request-id', 'request', 'status'],
      properties: {
        'request-id': {
          $ref: '#/$defs/nonEmptyString'
        },
        request: {
          $ref: '#/$defs/nonEmptyString'
        },
        status: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    },
    topTierExecutionLane: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['priority', 'count', 'skills'],
      properties: {
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'normal', 'clear']
        },
        count: buildCounterSchema(),
        skills: {
          type: 'array',
          items: {
            $ref: '#/$defs/nonEmptyString'
          }
        }
      }
    },
    topTierExecutionGroup: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['category', 'priority', 'title', 'summary', 'count', 'skills', 'follow_up'],
      properties: {
        category: {
          $ref: '#/$defs/nonEmptyString'
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'normal', 'clear']
        },
        title: {
          $ref: '#/$defs/nonEmptyString'
        },
        summary: {
          $ref: '#/$defs/nonEmptyString'
        },
        count: buildCounterSchema(),
        skills: {
          type: 'array',
          items: {
            $ref: '#/$defs/nonEmptyString'
          }
        },
        follow_up: {
          type: 'array',
          items: {
            $ref: '#/$defs/nonEmptyString'
          }
        }
      }
    },
    topTierExecutionFocus: {
      type: 'object',
      additionalProperties: false,
      required: [
        'blocked',
        'next-wave',
        'next-wave-size',
        'current-priority-lane',
        'current-blocker-family',
        'follow_up'
      ],
      properties: {
        blocked: buildCounterSchema(),
        'next-wave': {
          type: 'array',
          items: {
            $ref: '#/$defs/nonEmptyString'
          }
        },
        'next-wave-size': buildCounterSchema(),
        'current-priority-lane': {
          $ref: '#/$defs/topTierExecutionLane'
        },
        'current-blocker-family': {
          $ref: '#/$defs/topTierExecutionGroup'
        },
        follow_up: {
          type: 'array',
          items: {
            $ref: '#/$defs/nonEmptyString'
          }
        }
      }
    }
  };
}

function buildSystemReadinessSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${READINESS_SCHEMA_ID_BASE}/system-readiness.schema.json`,
    title: 'Personal Skill System Readiness',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'generated-at',
      'sources',
      'status',
      'signals',
      'host-smoke-policy',
      'summary',
      'notes'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: SYSTEM_READINESS_SCHEMA_VERSION
      },
      'generated-at': {
        $ref: '#/$defs/isoDateTime'
      },
      sources: {
        type: 'object',
        additionalProperties: false,
        required: cloneArray(SYSTEM_READINESS_HOST_SMOKE_SOURCE_KEYS),
        properties: {
          'benchmark-summary': {
            type: 'string',
            pattern: '^benchmark\\/summary\\.generated\\.json$'
          },
          'host-smoke-scorecard': {
            type: 'string',
            pattern: '^benchmark\\/host-smoke\\/scorecard\\.generated\\.json$'
          },
          'runtime-proof': {
            type: 'string',
            pattern: '^registry\\/runtime-proof\\.generated\\.json$'
          },
          'route-fixtures': {
            type: 'string',
            pattern: '^registry\\/route-fixtures\\.generated\\.json$'
          },
          'review-queue': {
            type: 'string',
            pattern: '^registry\\/review-queue\\.generated\\.json$'
          },
          'skill-opportunity-queue': {
            type: 'string',
            pattern: '^registry\\/skill-opportunity-queue\\.generated\\.json$'
          },
          'expert-source-family-scorecard': {
            type: 'string',
            pattern: '^registry\\/expert-source-family-scorecard\\.generated\\.json$'
          },
          'pending-scaffolds': {
            type: 'string',
            pattern: '^registry\\/pending-scaffolds\\.generated\\.json$'
          },
          'skill-investment-backlog': {
            type: 'string',
            pattern: '^registry\\/skill-investment-backlog\\.generated\\.json$'
          }
        }
      },
      status: {
        $ref: '#/$defs/readinessStatus'
      },
      signals: {
        type: 'object',
        additionalProperties: false,
        required: cloneArray(SYSTEM_READINESS_SIGNAL_ORDER),
        properties: {
          benchmark: {
            $ref: '#/$defs/benchmarkSignal'
          },
          'route-evidence': {
            $ref: '#/$defs/routeEvidenceSignal'
          },
          'runtime-proof': {
            $ref: '#/$defs/runtimeProofSignal'
          },
          'host-smoke': {
            $ref: '#/$defs/hostSmokeSignal'
          },
          'top-tier-readiness': {
            $ref: '#/$defs/topTierReadinessSignal'
          },
          'review-cadence': {
            $ref: '#/$defs/reviewCadenceSignal'
          },
          'investment-backlog': {
            $ref: '#/$defs/investmentBacklogSignal'
          },
          'expert-source-families': {
            $ref: '#/$defs/expertSourceFamiliesSignal'
          },
          'host-writeability': {
            $ref: '#/$defs/hostWriteabilitySignal'
          }
        }
      },
      'host-smoke-policy': {
        type: 'array',
        items: {
          $ref: '#/$defs/hostSmokePolicyEntry'
        }
      },
      summary: {
        type: 'object',
        additionalProperties: false,
        required: cloneArray(SYSTEM_READINESS_SUMMARY_KEYS),
        properties: Object.fromEntries(
          cloneArray(SYSTEM_READINESS_SUMMARY_KEYS).map((key) => [key, buildCounterSchema()])
        )
      },
      notes: {
        type: 'array',
        minItems: SYSTEM_READINESS_NOTES_MIN_ITEMS,
        items: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    },
    $defs: {
      ...buildSharedDefs(),
      benchmarkSignal: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'file', 'summary_status', 'run_count'],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          file: {
            type: 'string',
            pattern: '^benchmark\\/summary\\.generated\\.json$'
          },
          summary_status: {
            type: 'string',
            enum: cloneArray(SYSTEM_READINESS_BENCHMARK_SUMMARY_STATUS_ORDER)
          },
          run_count: buildCounterSchema()
        }
      },
      routeEvidenceSignal: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'stable_skills', 'covered_skills'],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          stable_skills: buildCounterSchema(),
          covered_skills: buildCounterSchema()
        }
      },
      runtimeProofSignal: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'live_scripted_skills', 'runtime_proof_entries'],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          live_scripted_skills: buildCounterSchema(),
          runtime_proof_entries: buildCounterSchema()
        }
      },
      hostSmokeSignal: {
        type: 'object',
        additionalProperties: false,
        required: [
          'status',
          'host_smoke_capable_skills',
          'satisfied',
          'passing',
          'missing',
          'failing',
          'stale',
          'contract_drift',
          'policy'
        ],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          host_smoke_capable_skills: buildCounterSchema(),
          satisfied: buildCounterSchema(),
          passing: buildCounterSchema(),
          missing: buildCounterSchema(),
          failing: buildCounterSchema(),
          stale: buildCounterSchema(),
          contract_drift: buildCounterSchema(),
          policy: {
            $ref: '#/$defs/hostSmokePolicySummary'
          }
        }
      },
      topTierReadinessSignal: {
        type: 'object',
        additionalProperties: false,
        required: [
          'status',
          'stable-skills',
          'blocked-stable-skills',
          'ready-stable-skills',
          'priorities',
          'execution-focus',
          ...cloneArray(STABLE_TOP_TIER_BLOCKER_FIELDS)
        ],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          'stable-skills': buildCounterSchema(),
          'blocked-stable-skills': buildCounterSchema(),
          'ready-stable-skills': buildCounterSchema(),
          priorities: {
            type: 'object',
            additionalProperties: false,
            required: ['critical', 'high', 'normal', 'clear'],
            properties: {
              critical: buildCounterSchema(),
              high: buildCounterSchema(),
              normal: buildCounterSchema(),
              clear: buildCounterSchema()
            }
          },
          'execution-focus': {
            $ref: '#/$defs/topTierExecutionFocus'
          },
          ...Object.fromEntries(
            cloneArray(STABLE_TOP_TIER_BLOCKER_FIELDS).map((field) => [field, buildCounterSchema()])
          )
        }
      },
      reviewCadenceSignal: {
        type: 'object',
        additionalProperties: false,
        required: [
          'status',
          'governed-skills',
          'overdue',
          'due-soon',
          'scheduled',
          'missing-metadata',
          'stable-overdue',
          'stable-missing-metadata'
        ],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          'governed-skills': buildCounterSchema(),
          overdue: buildCounterSchema(),
          'due-soon': buildCounterSchema(),
          scheduled: buildCounterSchema(),
          'missing-metadata': buildCounterSchema(),
          'stable-overdue': buildCounterSchema(),
          'stable-missing-metadata': buildCounterSchema()
        }
      },
      investmentBacklogSignal: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'total', 'critical', 'high', 'normal'],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          total: buildCounterSchema(),
          critical: buildCounterSchema(),
          high: buildCounterSchema(),
          normal: buildCounterSchema()
        }
      },
      expertSourceFamiliesSignal: {
        type: 'object',
        additionalProperties: false,
        required: [
          'status',
          'total-families',
          'active-families',
          'archived-families',
          'active-parse-errors',
          'active-unmapped-raw-sources',
          'active-stale-mapped-sources',
          'active-missing-pack-includes'
        ],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          'total-families': buildCounterSchema(),
          'active-families': buildCounterSchema(),
          'archived-families': buildCounterSchema(),
          'active-parse-errors': buildCounterSchema(),
          'active-unmapped-raw-sources': buildCounterSchema(),
          'active-stale-mapped-sources': buildCounterSchema(),
          'active-missing-pack-includes': buildCounterSchema()
        }
      },
      hostWriteabilitySignal: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'total', 'writable', 'blocked', 'critical', 'high', 'normal', 'artifacts'],
        properties: {
          status: {
            $ref: '#/$defs/readinessStatus'
          },
          total: buildCounterSchema(),
          writable: buildCounterSchema(),
          blocked: buildCounterSchema(),
          critical: buildCounterSchema(),
          high: buildCounterSchema(),
          normal: buildCounterSchema(),
          artifacts: {
            type: 'array',
            items: {
              $ref: '#/$defs/hostWriteabilityArtifact'
            }
          }
        }
      }
    }
  };
}

function buildHostEvolutionSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${READINESS_SCHEMA_ID_BASE}/host-evolution.schema.json`,
    title: 'Personal Skill System Host Evolution',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema-version',
      'generated-at',
      'sources',
      'status',
      'capabilities',
      'summary',
      'active-constraints',
      'pending-scaffolds',
      'blocked-admissions',
      'host-writeability-debt',
      'top-tier-execution-focus',
      'follow_up',
      'notes'
    ],
    properties: {
      'schema-version': {
        type: 'integer',
        const: HOST_EVOLUTION_SCHEMA_VERSION
      },
      'generated-at': {
        $ref: '#/$defs/isoDateTime'
      },
      sources: {
        type: 'object',
        additionalProperties: false,
        required: [
          'system-readiness',
          'skill-investment-backlog',
          'pending-scaffolds',
          'admission-ledger'
        ],
        properties: {
          'system-readiness': {
            type: 'string',
            pattern: '^benchmark\\/system-readiness\\.generated\\.json$'
          },
          'skill-investment-backlog': {
            type: 'string',
            pattern: '^registry\\/skill-investment-backlog\\.generated\\.json$'
          },
          'pending-scaffolds': {
            type: 'string',
            pattern: '^registry\\/pending-scaffolds\\.generated\\.json$'
          },
          'admission-ledger': {
            type: 'string',
            pattern: '^registry\\/admission-ledger\\.generated\\.json$'
          }
        }
      },
      status: {
        $ref: '#/$defs/readinessStatus'
      },
      capabilities: {
        type: 'object',
        additionalProperties: false,
        required: [
          'create-authoritative-skill',
          'materialize-pending-scaffold',
          'rewrite-generated-governance'
        ],
        properties: {
          'create-authoritative-skill': {
            type: 'string',
            enum: ['available', 'blocked']
          },
          'materialize-pending-scaffold': {
            type: 'string',
            enum: ['available', 'blocked', 'idle']
          },
          'rewrite-generated-governance': {
            type: 'string',
            enum: cloneArray(HOST_EVOLUTION_CAPABILITY_VALUE_ORDER)
          }
        }
      },
      summary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'active-constraints',
          'blocked-governance-artifacts',
          'pending-scaffolds',
          'blocked-admissions',
          'host-writeability-backlog-items',
          'top-tier-next-wave-size',
          'top-tier-blocked-stable-skills'
        ],
        properties: {
          'active-constraints': buildCounterSchema(),
          'blocked-governance-artifacts': buildCounterSchema(),
          'pending-scaffolds': buildCounterSchema(),
          'blocked-admissions': buildCounterSchema(),
          'host-writeability-backlog-items': buildCounterSchema(),
          'top-tier-next-wave-size': buildCounterSchema(),
          'top-tier-blocked-stable-skills': buildCounterSchema()
        }
      },
      'active-constraints': {
        type: 'array',
        items: {
          $ref: '#/$defs/hostEvolutionConstraint'
        }
      },
      'pending-scaffolds': {
        type: 'array',
        items: {
          $ref: '#/$defs/pendingScaffold'
        }
      },
      'blocked-admissions': {
        type: 'array',
        items: {
          $ref: '#/$defs/blockedAdmission'
        }
      },
      'host-writeability-debt': {
        type: 'array',
        items: {
          type: 'object'
        }
      },
      'top-tier-execution-focus': {
        $ref: '#/$defs/topTierExecutionFocus'
      },
      readiness: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['status', 'generated-at', 'host-writeability', 'top-tier-execution-focus'],
        properties: {
          status: {
            type: ['string', 'null']
          },
          'generated-at': {
            type: ['string', 'null']
          },
          'host-writeability': {
            type: ['object', 'null']
          },
          'top-tier-execution-focus': {
            anyOf: [
              {
                $ref: '#/$defs/topTierExecutionFocus'
              },
              {
                type: 'null'
              }
            ]
          }
        }
      },
      follow_up: {
        type: 'array',
        items: {
          $ref: '#/$defs/nonEmptyString'
        }
      },
      notes: {
        type: 'array',
        minItems: HOST_EVOLUTION_NOTES_MIN_ITEMS,
        items: {
          $ref: '#/$defs/nonEmptyString'
        }
      }
    },
    $defs: {
      ...buildSharedDefs()
    }
  };
}

function getReadinessSchemaDefinition(schemaArtifactId) {
  return READINESS_SCHEMA_DEFINITIONS[String(schemaArtifactId || '').trim()] || null;
}

function getReadinessSchemaPath(bundleRoot, schemaArtifactId) {
  const definition = getReadinessSchemaDefinition(schemaArtifactId);
  return definition ? path.join(bundleRoot, definition.path) : null;
}

function writeReadinessSchema(bundleRoot, schemaArtifactId) {
  const definition = getReadinessSchemaDefinition(schemaArtifactId);
  if (!definition) {
    throw new Error(`unknown readiness schema artifact '${schemaArtifactId}'`);
  }

  const file = getReadinessSchemaPath(bundleRoot, schemaArtifactId);
  const payload = definition.build();
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    id: schemaArtifactId,
    file,
    payload
  };
}

function writeReadinessSchemas(bundleRoot) {
  return READINESS_SCHEMA_ORDER.map((schemaArtifactId) => writeReadinessSchema(bundleRoot, schemaArtifactId));
}

function validateReadinessSchemas(bundleRoot, findings) {
  const expectedSchemas = {};

  for (const schemaArtifactId of READINESS_SCHEMA_ORDER) {
    const definition = getReadinessSchemaDefinition(schemaArtifactId);
    const file = getReadinessSchemaPath(bundleRoot, schemaArtifactId);
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
          ? `${definition.label} is out of sync with centralized readiness governance`
          : `${definition.label} is out of sync with centralized readiness governance, but the artifact is not writable on this host (${probe.code || 'UNKNOWN'})`
      });
    }
  }

  return expectedSchemas;
}

module.exports = {
  READINESS_SCHEMA_SOURCE,
  READINESS_SCHEMA_DEFINITIONS,
  READINESS_SCHEMA_ORDER,
  buildSystemReadinessSchema,
  buildHostEvolutionSchema,
  getReadinessSchemaPath,
  writeReadinessSchema,
  writeReadinessSchemas,
  validateReadinessSchemas
};
