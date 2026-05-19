'use strict';

const {
  FUTURE_SKILL_PRIORITY_ORDER,
  normalizeFuturePriority,
  normalizeOpportunityStatus,
  isActiveOpportunityStatus,
  normalizeAdmissionStatus,
  isActiveAdmissionStatus,
  isBlockingAdmissionStatus,
  normalizePendingScaffoldStatus,
  isActivePendingScaffoldStatus,
  normalizeAdmissionDecisionAction
} = require('./skill-future-governance');
const {
  AUTHORITATIVE_SKILL_TREE_CONSTRAINT
} = require('./skill-host-governance');

const FUTURE_SKILL_PIPELINE_STAGE_DEFINITIONS = Object.freeze({
  opportunity: {
    active: true,
    terminal: false
  },
  admission: {
    active: true,
    terminal: false
  },
  'ready-to-materialize': {
    active: true,
    terminal: false
  },
  'blocked-on-host': {
    active: true,
    terminal: false
  },
  implemented: {
    active: false,
    terminal: true
  },
  redirected: {
    active: false,
    terminal: true
  },
  cancelled: {
    active: false,
    terminal: true
  }
});

const FUTURE_SKILL_PIPELINE_STAGE_ORDER = Object.freeze(
  Object.keys(FUTURE_SKILL_PIPELINE_STAGE_DEFINITIONS)
);
const FUTURE_SKILL_PIPELINE_STAGES = new Set(FUTURE_SKILL_PIPELINE_STAGE_ORDER);
const ACTIVE_FUTURE_SKILL_PIPELINE_STAGES = new Set(
  FUTURE_SKILL_PIPELINE_STAGE_ORDER.filter((stage) => FUTURE_SKILL_PIPELINE_STAGE_DEFINITIONS[stage].active)
);
const TERMINAL_FUTURE_SKILL_PIPELINE_STAGES = new Set(
  FUTURE_SKILL_PIPELINE_STAGE_ORDER.filter((stage) => FUTURE_SKILL_PIPELINE_STAGE_DEFINITIONS[stage].terminal)
);
const FUTURE_SKILL_PIPELINE_STAGE_INDEX = new Map(
  FUTURE_SKILL_PIPELINE_STAGE_ORDER.map((stage, index) => [stage, index])
);
const FUTURE_SKILL_PIPELINE_PRIORITY_INDEX = new Map(
  FUTURE_SKILL_PRIORITY_ORDER.map((priority, index) => [priority, index])
);

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function uniqueOrdered(values) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeFutureSkillPipelineStage(value, fallback = null) {
  const normalized = normalizeString(value).toLowerCase();
  return FUTURE_SKILL_PIPELINE_STAGES.has(normalized) ? normalized : fallback;
}

function isKnownFutureSkillPipelineStage(value) {
  return FUTURE_SKILL_PIPELINE_STAGES.has(normalizeFutureSkillPipelineStage(value, ''));
}

function isActiveFutureSkillPipelineStage(value) {
  return ACTIVE_FUTURE_SKILL_PIPELINE_STAGES.has(normalizeFutureSkillPipelineStage(value, ''));
}

function isTerminalFutureSkillPipelineStage(value) {
  return TERMINAL_FUTURE_SKILL_PIPELINE_STAGES.has(normalizeFutureSkillPipelineStage(value, ''));
}

function getFutureSkillPipelineThreadId(entryType, entry) {
  const opportunityId = normalizeString(entry && entry['opportunity-id']);
  if (opportunityId) {
    return `opportunity:${opportunityId}`;
  }

  const requestId = normalizeString(entry && entry['request-id']);
  if (requestId) {
    return `request:${requestId}`;
  }

  const skill = normalizeString(entry && entry.skill);
  if (skill) {
    return `skill:${skill}`;
  }

  const pendingId = normalizeString(entry && entry['pending-id']);
  if (pendingId) {
    return `pending:${pendingId}`;
  }

  if (entryType === 'opportunity') {
    return `opportunity:${normalizeString(entry && entry.summary) || 'unknown'}`;
  }
  if (entryType === 'admission') {
    return `request:${normalizeString(entry && entry.request) || 'unknown'}`;
  }
  return `pending:${Date.now()}`;
}

function ensureThread(threadMap, threadId) {
  if (!threadMap.has(threadId)) {
    threadMap.set(threadId, {
      'thread-id': threadId,
      opportunity: null,
      admission: null,
      'pending-scaffold': null
    });
  }
  return threadMap.get(threadId);
}

function hasAuthoritativeSkillTreeConstraint(hostEvolution) {
  return Array.isArray(hostEvolution && hostEvolution['active-constraints'])
    && hostEvolution['active-constraints'].some((entry) =>
      normalizeString(entry && entry.id) === AUTHORITATIVE_SKILL_TREE_CONSTRAINT.id
    );
}

function toTimestamp(value) {
  const timestamp = Date.parse(normalizeString(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function deriveThreadStage(thread, context = {}) {
  const pending = thread['pending-scaffold'];
  if (pending && isActivePendingScaffoldStatus(pending.status)) {
    const pendingStatus = normalizePendingScaffoldStatus(pending.status);
    if (
      pendingStatus === 'blocked'
      || normalizeString(pending && pending['host-constraint'] && pending['host-constraint'].code)
      || hasAuthoritativeSkillTreeConstraint(context.hostEvolution)
    ) {
      return 'blocked-on-host';
    }
    return 'ready-to-materialize';
  }

  const admission = thread.admission;
  if (admission && isActiveAdmissionStatus(admission.status)) {
    return 'admission';
  }

  const opportunity = thread.opportunity;
  if (opportunity && isActiveOpportunityStatus(opportunity.status)) {
    return 'opportunity';
  }

  if (admission) {
    const status = normalizeAdmissionStatus(admission.status);
    if (status === 'implemented' || normalizeString(admission['created-skill'])) {
      return 'implemented';
    }
    if (status === 'advised-reuse' || status === 'advised-upgrade' || status === 'advised-noop' || status === 'resolved') {
      return 'redirected';
    }
    if (status === 'cancelled') {
      return 'cancelled';
    }
  }

  if (opportunity) {
    const status = normalizeOpportunityStatus(opportunity.status);
    if (status === 'implemented' || normalizeString(opportunity['created-skill'])) {
      return 'implemented';
    }
    if (status === 'cancelled') {
      return 'cancelled';
    }
  }

  return 'cancelled';
}

function deriveThreadStatus(thread, stage) {
  if (stage === 'blocked-on-host' || stage === 'ready-to-materialize') {
    return normalizePendingScaffoldStatus(thread['pending-scaffold'] && thread['pending-scaffold'].status);
  }
  if (stage === 'admission' || stage === 'redirected') {
    return normalizeAdmissionStatus(thread.admission && thread.admission.status);
  }
  if (stage === 'opportunity' || stage === 'cancelled') {
    return normalizeOpportunityStatus(thread.opportunity && thread.opportunity.status);
  }
  if (stage === 'implemented') {
    const admissionStatus = normalizeAdmissionStatus(thread.admission && thread.admission.status);
    if (admissionStatus === 'implemented') {
      return admissionStatus;
    }
    return normalizeOpportunityStatus(thread.opportunity && thread.opportunity.status);
  }
  return '';
}

function deriveThreadPriority(thread, stage, blocked) {
  if (blocked) {
    return 'critical';
  }
  const opportunityPriority = normalizeFuturePriority(thread.opportunity && thread.opportunity.priority, '');
  if (opportunityPriority && FUTURE_SKILL_PIPELINE_PRIORITY_INDEX.has(opportunityPriority)) {
    return opportunityPriority;
  }
  if (stage === 'admission' || stage === 'ready-to-materialize') {
    return 'high';
  }
  return 'normal';
}

function deriveThreadKind(thread) {
  return normalizeString(
    (thread['pending-scaffold'] && thread['pending-scaffold'].kind)
    || (thread.admission && thread.admission['suggested-kind'])
    || (thread.admission && thread.admission.decision && thread.admission.decision.suggested_kind)
    || (thread.opportunity && thread.opportunity['suggested-kind'])
    || (thread.admission && thread.admission.decision && thread.admission.decision.target_kind)
  ) || null;
}

function deriveThreadSkill(thread) {
  return normalizeString(
    (thread['pending-scaffold'] && thread['pending-scaffold'].skill)
    || (thread.admission && thread.admission['created-skill'])
    || (thread.opportunity && thread.opportunity['created-skill'])
  ) || null;
}

function deriveThreadTargetSkill(thread) {
  return normalizeString(thread.admission && thread.admission.decision && thread.admission.decision.target_skill) || null;
}

function deriveThreadSummary(thread) {
  return normalizeString(
    (thread.opportunity && thread.opportunity.summary)
    || (thread.admission && thread.admission.request)
    || (thread['pending-scaffold'] && thread['pending-scaffold'].note)
    || (thread['pending-scaffold'] && thread['pending-scaffold'].skill && `materialize governed scaffold '${thread['pending-scaffold'].skill}'`)
  ) || 'governed future-skill work item';
}

function deriveThreadRecordedAt(thread) {
  const values = [
    normalizeString(thread.opportunity && thread.opportunity['recorded-at']),
    normalizeString(thread.admission && thread.admission['recorded-at']),
    normalizeString(thread['pending-scaffold'] && thread['pending-scaffold']['recorded-at'])
  ].filter(Boolean);
  if (values.length < 1) {
    return null;
  }
  return values.sort((left, right) => toTimestamp(left) - toTimestamp(right))[0];
}

function deriveThreadUpdatedAt(thread) {
  const values = [
    normalizeString(thread.opportunity && thread.opportunity['resolved-at']),
    normalizeString(thread.opportunity && thread.opportunity['recorded-at']),
    normalizeString(thread.admission && thread.admission['resolved-at']),
    normalizeString(thread.admission && thread.admission['recorded-at']),
    normalizeString(thread['pending-scaffold'] && thread['pending-scaffold']['recorded-at'])
  ].filter(Boolean);
  if (values.length < 1) {
    return null;
  }
  return values.sort((left, right) => toTimestamp(right) - toTimestamp(left))[0];
}

function buildThreadBlockers(thread, stage, context = {}) {
  const blockers = [];
  const opportunity = thread.opportunity;
  const admission = thread.admission;
  const pending = thread['pending-scaffold'];

  if (stage === 'blocked-on-host') {
    const hostConstraint = pending && pending['host-constraint'];
    const constraintMessage = normalizeString(hostConstraint && hostConstraint.message);
    if (constraintMessage) {
      blockers.push(constraintMessage);
    } else if (hasAuthoritativeSkillTreeConstraint(context.hostEvolution)) {
      blockers.push('the authoritative skill tree is blocked on the current host');
    } else if (normalizeString(pending && pending.note)) {
      blockers.push(normalizeString(pending.note));
    } else {
      blockers.push('pending scaffold is blocked until a writable host materializes it');
    }
  }

  if (stage === 'admission' && admission && isBlockingAdmissionStatus(admission.status)) {
    blockers.push(
      normalizeString(admission.note)
      || `admission request '${normalizeString(admission['request-id']) || 'unknown'}' remains blocked`
    );
  }

  if (stage === 'opportunity' && opportunity && normalizeOpportunityStatus(opportunity.status) === 'blocked') {
    blockers.push(
      normalizeString(opportunity.note)
      || `opportunity '${normalizeString(opportunity['opportunity-id']) || 'unknown'}' remains blocked`
    );
  }

  return uniqueOrdered(blockers);
}

function buildThreadFollowUp(thread, stage) {
  const commands = [];
  const opportunityId = normalizeString(thread.opportunity && thread.opportunity['opportunity-id']);
  const requestId = normalizeString(thread.admission && thread.admission['request-id']);
  const pendingId = normalizeString(thread['pending-scaffold'] && thread['pending-scaffold']['pending-id']);
  const skill = normalizeString(thread['pending-scaffold'] && thread['pending-scaffold'].skill);
  const kind = normalizeString((thread['pending-scaffold'] && thread['pending-scaffold'].kind) || deriveThreadKind(thread));

  if (opportunityId) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id ${opportunityId}`);
  }
  if (requestId) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --request-id ${requestId}`);
  }
  if (pendingId) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --pending-id ${pendingId}`);
  } else if (skill) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --skill ${skill}`);
  }

  if (stage === 'opportunity' && opportunityId) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js admission-check --opportunity-id ${opportunityId}`);
  }

  if (stage === 'admission' && kind) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-blueprint ${kind} <skill-name>`);
  }

  if (stage === 'ready-to-materialize' && skill) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold ${skill}`);
  }

  if (stage === 'blocked-on-host') {
    commands.push('node personal-skill-system/skills/tools/manage-skill/scripts/run.js diagnose-host-evolution');
    if (skill) {
      commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold ${skill}`);
    }
  }

  if (stage === 'implemented' && deriveThreadSkill(thread)) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${deriveThreadSkill(thread)}`);
  }

  if (stage === 'redirected' && deriveThreadTargetSkill(thread)) {
    commands.push(`node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${deriveThreadTargetSkill(thread)}`);
  }

  return uniqueOrdered(commands);
}

function serializeOpportunity(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  return {
    'opportunity-id': normalizeString(entry['opportunity-id']),
    summary: normalizeString(entry.summary),
    'suggested-kind': normalizeString(entry['suggested-kind']) || null,
    priority: normalizeFuturePriority(entry.priority),
    status: normalizeOpportunityStatus(entry.status),
    horizon: normalizeString(entry.horizon) || null,
    'recorded-at': normalizeString(entry['recorded-at']) || null,
    ...(normalizeString(entry['resolved-at']) ? { 'resolved-at': normalizeString(entry['resolved-at']) } : {}),
    ...(normalizeString(entry['created-skill']) ? { 'created-skill': normalizeString(entry['created-skill']) } : {}),
    ...(normalizeString(entry['admission-request-id']) ? { 'admission-request-id': normalizeString(entry['admission-request-id']) } : {}),
    ...(normalizeString(entry.note) ? { note: normalizeString(entry.note) } : {})
  };
}

function serializeAdmission(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  return {
    'request-id': normalizeString(entry['request-id']),
    request: normalizeString(entry.request),
    status: normalizeAdmissionStatus(entry.status),
    'suggested-kind': normalizeString(entry['suggested-kind']) || null,
    ...(normalizeString(entry['opportunity-id']) ? { 'opportunity-id': normalizeString(entry['opportunity-id']) } : {}),
    decision: cloneJson(entry.decision || {}),
    'recorded-at': normalizeString(entry['recorded-at']) || null,
    ...(normalizeString(entry['resolved-at']) ? { 'resolved-at': normalizeString(entry['resolved-at']) } : {}),
    ...(normalizeString(entry['created-skill']) ? { 'created-skill': normalizeString(entry['created-skill']) } : {}),
    ...(normalizeString(entry.note) ? { note: normalizeString(entry.note) } : {})
  };
}

function serializePendingScaffold(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  return {
    'pending-id': normalizeString(entry['pending-id']),
    kind: normalizeString(entry.kind),
    skill: normalizeString(entry.skill),
    path: normalizeString(entry.path) || null,
    status: normalizePendingScaffoldStatus(entry.status),
    'recorded-at': normalizeString(entry['recorded-at']) || null,
    ...(normalizeString(entry['request-id']) ? { 'request-id': normalizeString(entry['request-id']) } : {}),
    ...(normalizeString(entry['opportunity-id']) ? { 'opportunity-id': normalizeString(entry['opportunity-id']) } : {}),
    ...(normalizeString(entry['rerun-command']) ? { 'rerun-command': normalizeString(entry['rerun-command']) } : {}),
    ...(normalizeString(entry.note) ? { note: normalizeString(entry.note) } : {}),
    ...(entry['host-constraint'] && typeof entry['host-constraint'] === 'object' && !Array.isArray(entry['host-constraint'])
      ? { 'host-constraint': cloneJson(entry['host-constraint']) }
      : {})
  };
}

function finalizeThread(thread, context = {}, options = {}) {
  const stage = deriveThreadStage(thread, context);
  const active = isActiveFutureSkillPipelineStage(stage);
  if (options.includeResolved !== true && !active) {
    return null;
  }

  const status = deriveThreadStatus(thread, stage);
  const blocked = stage === 'blocked-on-host'
    || (stage === 'admission' && isBlockingAdmissionStatus(status))
    || (stage === 'opportunity' && normalizeOpportunityStatus(status) === 'blocked');
  const entry = {
    'thread-id': normalizeString(thread['thread-id']),
    stage,
    status,
    active,
    blocked,
    priority: deriveThreadPriority(thread, stage, blocked),
    summary: deriveThreadSummary(thread),
    ...(deriveThreadKind(thread) ? { kind: deriveThreadKind(thread) } : {}),
    ...(deriveThreadSkill(thread) ? { skill: deriveThreadSkill(thread) } : {}),
    ...(deriveThreadTargetSkill(thread) ? { 'target-skill': deriveThreadTargetSkill(thread) } : {}),
    ...(thread.opportunity && normalizeString(thread.opportunity['opportunity-id'])
      ? { 'opportunity-id': normalizeString(thread.opportunity['opportunity-id']) }
      : {}),
    ...(thread.admission && normalizeString(thread.admission['request-id'])
      ? { 'request-id': normalizeString(thread.admission['request-id']) }
      : {}),
    ...(thread['pending-scaffold'] && normalizeString(thread['pending-scaffold']['pending-id'])
      ? { 'pending-id': normalizeString(thread['pending-scaffold']['pending-id']) }
      : {}),
    ...(deriveThreadRecordedAt(thread) ? { 'recorded-at': deriveThreadRecordedAt(thread) } : {}),
    ...(deriveThreadUpdatedAt(thread) ? { 'updated-at': deriveThreadUpdatedAt(thread) } : {}),
    blockers: buildThreadBlockers(thread, stage, context),
    follow_up: buildThreadFollowUp(thread, stage),
    ...(serializeOpportunity(thread.opportunity) ? { opportunity: serializeOpportunity(thread.opportunity) } : {}),
    ...(serializeAdmission(thread.admission) ? { admission: serializeAdmission(thread.admission) } : {}),
    ...(serializePendingScaffold(thread['pending-scaffold']) ? { 'pending-scaffold': serializePendingScaffold(thread['pending-scaffold']) } : {})
  };

  return entry;
}

function sortFutureSkillPipelineEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }
    if (left.blocked !== right.blocked) {
      return left.blocked ? -1 : 1;
    }
    const leftPriority = FUTURE_SKILL_PIPELINE_PRIORITY_INDEX.get(normalizeFuturePriority(left.priority, 'normal'));
    const rightPriority = FUTURE_SKILL_PIPELINE_PRIORITY_INDEX.get(normalizeFuturePriority(right.priority, 'normal'));
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    const leftStage = FUTURE_SKILL_PIPELINE_STAGE_INDEX.get(left.stage);
    const rightStage = FUTURE_SKILL_PIPELINE_STAGE_INDEX.get(right.stage);
    if (leftStage !== rightStage) {
      return leftStage - rightStage;
    }
    const leftUpdated = toTimestamp(left['updated-at']);
    const rightUpdated = toTimestamp(right['updated-at']);
    if (leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }
    return String(left['thread-id'] || '').localeCompare(String(right['thread-id'] || ''));
  });
}

function summarizeFutureSkillPipeline(entries) {
  const summary = {
    total: 0,
    active: 0,
    blocked: 0,
    stages: {},
    priorities: {}
  };

  for (const stage of FUTURE_SKILL_PIPELINE_STAGE_ORDER) {
    summary.stages[stage] = 0;
  }
  for (const priority of FUTURE_SKILL_PRIORITY_ORDER) {
    summary.priorities[priority] = 0;
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    summary.total += 1;
    if (entry.active) {
      summary.active += 1;
    }
    if (entry.blocked) {
      summary.blocked += 1;
    }
    summary.stages[entry.stage] += 1;
    summary.priorities[normalizeFuturePriority(entry.priority, 'normal')] += 1;
  }

  return summary;
}

function buildFutureSkillPipelineView(context = {}, options = {}) {
  const threadMap = new Map();

  for (const entry of Array.isArray(context.opportunities) ? context.opportunities : []) {
    const thread = ensureThread(threadMap, getFutureSkillPipelineThreadId('opportunity', entry));
    if (!thread.opportunity || toTimestamp(entry['recorded-at']) >= toTimestamp(thread.opportunity['recorded-at'])) {
      thread.opportunity = cloneJson(entry);
    }
  }

  for (const entry of Array.isArray(context.admissions) ? context.admissions : []) {
    const thread = ensureThread(threadMap, getFutureSkillPipelineThreadId('admission', entry));
    if (!thread.admission || toTimestamp(entry['recorded-at']) >= toTimestamp(thread.admission['recorded-at'])) {
      thread.admission = cloneJson(entry);
    }
  }

  for (const entry of Array.isArray(context.pendingScaffolds) ? context.pendingScaffolds : []) {
    const thread = ensureThread(threadMap, getFutureSkillPipelineThreadId('pending-scaffold', entry));
    if (!thread['pending-scaffold'] || toTimestamp(entry['recorded-at']) >= toTimestamp(thread['pending-scaffold']['recorded-at'])) {
      thread['pending-scaffold'] = cloneJson(entry);
    }
  }

  const entries = sortFutureSkillPipelineEntries(
    [...threadMap.values()]
      .map((thread) => finalizeThread(thread, context, options))
      .filter(Boolean)
  );

  return {
    summary: summarizeFutureSkillPipeline(entries),
    total: entries.length,
    entries
  };
}

module.exports = {
  FUTURE_SKILL_PIPELINE_STAGE_DEFINITIONS,
  FUTURE_SKILL_PIPELINE_STAGE_ORDER,
  FUTURE_SKILL_PIPELINE_STAGES,
  ACTIVE_FUTURE_SKILL_PIPELINE_STAGES,
  TERMINAL_FUTURE_SKILL_PIPELINE_STAGES,
  normalizeFutureSkillPipelineStage,
  isKnownFutureSkillPipelineStage,
  isActiveFutureSkillPipelineStage,
  isTerminalFutureSkillPipelineStage,
  getFutureSkillPipelineThreadId,
  buildFutureSkillPipelineView
};
