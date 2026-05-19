'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseFrontmatter
} = require('./skill-system-common');
const {
  validateSmokeManifest: validateSmokeManifestContract
} = require('./skill-smoke-manifest-governance');
const {
  hasRouteFixtureEvidence,
  buildExpectedGovernedRouteFixtureForRecord,
  findGovernedRouteFixtureForSkill
} = require('./skill-route-fixture-governance');
const {
  getSkillKindDefinition,
  shouldAppearOnActiveRouteSurface
} = require('./skill-kind-governance');
const {
  compareRuntimeProofLevels,
  getTargetRuntimeProofLevelForStatus
} = require('./skill-lifecycle-governance');
const {
  buildRuntimeProofEntry
} = require('./skill-runtime-proof-governance');
const {
  dedupeRuntimeProofEntries
} = require('./skill-runtime-proof-governance');
const {
  OPENAI_METADATA_KEYS,
  buildOpenAiMetadata,
  readOpenAiMetadataFile
} = require('./skill-system-host-metadata');
const {
  buildReviewQueueEntries
} = require('./skill-review-governance');
const {
  normalizeHostSmokePolicy
} = require('./skill-host-governance');
const {
  collectExpertSourceTopTierBlockersForSkill
} = require('./expert-source-integration');
const {
  buildHostSmokeScorecard
} = require('./skill-system-host-smoke');

const STABLE_TOP_TIER_BLOCKER_FIELDS = Object.freeze([
  'stable-overdue',
  'stable-missing-metadata',
  'stable-expert-source-blocked',
  'stable-route-evidence-blocked',
  'stable-runtime-proof-blocked',
  'stable-host-smoke-blocked',
  'stable-module-depth-blocked',
  'stable-blocked-total'
]);
const STABLE_TOP_TIER_PRIORITY_ORDER = Object.freeze(['critical', 'high', 'normal', 'clear']);
const STABLE_TOP_TIER_PRIORITY_SCORE = Object.freeze({
  critical: 3,
  high: 2,
  normal: 1,
  clear: 0
});
const STABLE_TOP_TIER_SUMMARY_CATEGORY_TO_PRIORITY = Object.freeze({
  'stable-overdue': 'critical',
  'stable-missing-metadata': 'critical',
  'stable-runtime-proof-blocked': 'critical',
  'stable-host-smoke-blocked': 'critical',
  'stable-expert-source-blocked': 'high',
  'stable-route-evidence-blocked': 'high',
  'stable-module-depth-blocked': 'high'
});
const STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER = Object.freeze([
  'stable-overdue',
  'stable-missing-metadata',
  'stable-runtime-proof-blocked',
  'stable-host-smoke-blocked',
  'stable-expert-source-blocked',
  'stable-route-evidence-blocked',
  'stable-module-depth-blocked'
]);

const STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_DEFINITIONS = Object.freeze({
  'stable-overdue': Object.freeze({
    title: 'Expired stable review cadence',
    summary: 'Clear overdue stable review debt before other upgrades.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-review-queue',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js mark-reviewed <skill-name>'
    ])
  }),
  'stable-missing-metadata': Object.freeze({
    title: 'Missing stable review metadata',
    summary: 'Restore stable review metadata so governance can age the skill correctly.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-review-queue',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js update <skill-name> --set last-reviewed=<YYYY-MM-DD> --set review-cycle-days=<days>'
    ])
  }),
  'stable-runtime-proof-blocked': Object.freeze({
    title: 'Runtime-proof floor debt',
    summary: 'Raise scripted stable skills to the governed runtime-proof floor.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof <skill-name>',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier <skill-name>'
    ])
  }),
  'stable-host-smoke-blocked': Object.freeze({
    title: 'Host-smoke evidence debt',
    summary: 'Refresh host-smoke evidence for stable skills with critical host policies.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke <skill-name> --host codex',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier <skill-name>'
    ])
  }),
  'stable-expert-source-blocked': Object.freeze({
    title: 'Expert-source integration debt',
    summary: 'Repair expert-source mapping or freshness blockers before promotion.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-expert-source-families --stale',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-expert-source-families --unmapped'
    ])
  }),
  'stable-route-evidence-blocked': Object.freeze({
    title: 'Route evidence debt',
    summary: 'Strengthen real route evidence and metadata sync for stable skills.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-route-metadata <skill-name>',
      'npm run verify:skill-system'
    ])
  }),
  'stable-module-depth-blocked': Object.freeze({
    title: 'Capability module depth debt',
    summary: 'Promote dependent capability modules to top-ready before claiming top-tier.',
    follow_up: Object.freeze([
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-module-rating --skill <skill-name> <thin|strong-but-not-top|top-ready>',
      'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier <skill-name>'
    ])
  })
});

function buildTargetAwareRuntimeProofFollowUp(skillName, assessment = {}) {
  const normalizedSkill = normalizeString(skillName);
  if (!normalizedSkill) {
    return '';
  }

  const currentStatus = normalizeString(assessment.status);
  const targetStatus = normalizeString(assessment['target-status']) || 'stable';
  const targetLevel = getTargetRuntimeProofLevelForStatus(targetStatus);

  if (
    currentStatus
    && targetStatus
    && currentStatus !== targetStatus
    && targetLevel
    && targetLevel !== 'declared-only'
  ) {
    return `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof ${normalizedSkill} --level ${targetLevel}`;
  }

  return `node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof ${normalizedSkill}`;
}

function buildTargetAwareHostSmokeFollowUp(skillName, assessment = {}) {
  const normalizedSkill = normalizeString(skillName);
  if (!normalizedSkill) {
    return '';
  }

  const hostSmokePolicy = normalizeHostSmokePolicy(assessment['host-smoke-policy']) || {};
  const targetLevel = normalizeString(hostSmokePolicy['target-level']);
  const promoteFlag = targetLevel === 'host-smoked' ? ' --promote-host-smoked' : '';
  return `node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke ${normalizedSkill} --host codex${promoteFlag}`;
}

function buildStableTopTierFamilyFollowUp(category, skillName, assessment = {}, definition = {}) {
  const baseCommands = dedupeOrdered(
    (definition.follow_up || [])
      .map((command) => materializeStableTopTierFollowUpCommand(command, skillName))
      .filter(Boolean)
  );

  if (category === 'stable-runtime-proof-blocked') {
    return dedupeOrdered(
      baseCommands.map((command) =>
        /^node personal-skill-system\/skills\/tools\/manage-skill\/scripts\/run\.js sync-runtime-proof /.test(command)
          ? buildTargetAwareRuntimeProofFollowUp(skillName, assessment)
          : command
      )
    );
  }

  if (category === 'stable-host-smoke-blocked') {
    return dedupeOrdered(
      baseCommands.map((command) =>
        /^node personal-skill-system\/skills\/tools\/manage-skill\/scripts\/run\.js run-host-smoke /.test(command)
          ? buildTargetAwareHostSmokeFollowUp(skillName, assessment)
          : command
      )
    );
  }

  return baseCommands;
}

function dedupeOrdered(values) {
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

function readJsonIfPresent(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeTextValue(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function getStableTopTierEvaluationStatus(record, context = {}) {
  const requestedStatus = normalizeString(context && context.targetStatus);
  if (requestedStatus) {
    return requestedStatus;
  }
  return normalizeString(record && record.status);
}

function shouldEvaluateAsStableCandidate(record, context = {}) {
  return getStableTopTierEvaluationStatus(record, context) === 'stable';
}

function buildStableTopTierCandidateRecord(record, context = {}) {
  if (!record) {
    return null;
  }
  const evaluationStatus = getStableTopTierEvaluationStatus(record, context);
  if (!evaluationStatus || evaluationStatus === normalizeString(record.status)) {
    return record;
  }
  return {
    ...record,
    status: evaluationStatus
  };
}

function normalizeStringList(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(normalizeStringList(values))].sort((left, right) => left.localeCompare(right));
}

function createEmptyStableTopTierBlockerCounts() {
  return {
    'stable-overdue': 0,
    'stable-missing-metadata': 0,
    'stable-expert-source-blocked': 0,
    'stable-route-evidence-blocked': 0,
    'stable-runtime-proof-blocked': 0,
    'stable-host-smoke-blocked': 0,
    'stable-module-depth-blocked': 0,
    'stable-blocked-total': 0
  };
}

function getModuleRatingMap(ratingsData = {}) {
  const buckets = (ratingsData && ratingsData['rating-buckets']) || {};
  const ratingMap = new Map();

  for (const [rating, modules] of Object.entries(buckets)) {
    for (const moduleId of Array.isArray(modules) ? modules : []) {
      const normalizedModuleId = normalizeString(moduleId);
      if (normalizedModuleId) {
        ratingMap.set(normalizedModuleId, rating);
      }
    }
  }

  return ratingMap;
}

function buildCapabilityModuleRatings(ratingsData = {}, moduleIds = []) {
  const ratingMap = getModuleRatingMap(ratingsData);
  return (Array.isArray(moduleIds) ? moduleIds : [])
    .map((moduleId) => normalizeString(moduleId))
    .filter(Boolean)
    .map((moduleId) => ({
      module: moduleId,
      rating: ratingMap.get(moduleId) || 'unrated'
    }));
}

function buildCapabilityModuleTopTierBlockers(ratingsData = {}, moduleIds = []) {
  return buildCapabilityModuleRatings(ratingsData, moduleIds)
    .filter((item) => item.rating !== 'top-ready')
    .map((item) => ({
      type: 'capability-module-rating',
      module: item.module,
      rating: item.rating,
      message: `capability module '${item.module}' must be rated 'top-ready'`,
      categories: ['module-depth']
    }));
}

function buildStableTopTierBlockerCategories(blockers = []) {
  return uniqueSorted(
    (Array.isArray(blockers) ? blockers : []).flatMap((blocker) =>
      Array.isArray(blocker && blocker.categories) ? blocker.categories : []
    )
  );
}

function resolveStableTopTierPriority(blockers = []) {
  const normalizedBlockers = Array.isArray(blockers) ? blockers : [];
  if (normalizedBlockers.length < 1) {
    return 'clear';
  }

  const blockerTypes = new Set(
    normalizedBlockers
      .map((blocker) => normalizeString(blocker && blocker.type))
      .filter(Boolean)
  );
  const categories = new Set(buildStableTopTierBlockerCategories(normalizedBlockers));

  if (
    blockerTypes.has('capability-module-rating')
    || blockerTypes.has('review-cadence-expired')
    || blockerTypes.has('review-metadata-missing')
    || blockerTypes.has('last-reviewed')
    || blockerTypes.has('review-cycle-days')
    || categories.has('runtime-proof')
    || categories.has('host-smoke')
    || categories.has('review')
  ) {
    return 'critical';
  }

  if (
    blockerTypes.has('frontmatter-parse')
    || categories.has('expert-source')
    || categories.has('route')
    || categories.has('metadata')
    || categories.has('module-depth')
  ) {
    return 'high';
  }

  return 'normal';
}

function compareStableTopTierAssessmentEntries(left, right) {
  const leftScore = STABLE_TOP_TIER_PRIORITY_SCORE[normalizeString(left && left.priority)] || 0;
  const rightScore = STABLE_TOP_TIER_PRIORITY_SCORE[normalizeString(right && right.priority)] || 0;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  const leftBlockers = Number(left && left['blocker-count'] || 0);
  const rightBlockers = Number(right && right['blocker-count'] || 0);
  if (rightBlockers !== leftBlockers) {
    return rightBlockers - leftBlockers;
  }

  return normalizeString(left && left.skill).localeCompare(normalizeString(right && right.skill));
}

function normalizeStableTopTierPortfolioSummary(summary) {
  const normalized = summary && typeof summary === 'object' ? summary : {};
  return {
    total: Number(normalized.total || 0),
    ready: Number(normalized.ready || 0),
    blocked: Number(normalized.blocked || 0),
    priorities: Object.fromEntries(
      STABLE_TOP_TIER_PRIORITY_ORDER.map((priority) => [priority, Number((normalized.priorities || {})[priority] || 0)])
    )
  };
}

function summarizeStableTopTierPortfolioByCategory(assessments = []) {
  const summary = {
    total: 0,
    blocked: 0,
    categories: Object.fromEntries(STABLE_TOP_TIER_BLOCKER_FIELDS.map((field) => [field, 0])),
    priorities: Object.fromEntries(STABLE_TOP_TIER_PRIORITY_ORDER.map((priority) => [priority, 0])),
    'blocked-by-priority': Object.fromEntries(STABLE_TOP_TIER_PRIORITY_ORDER.map((priority) => [priority, 0]))
  };

  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    summary.total += 1;
    const priority = normalizeString(assessment && assessment.priority);
    if (STABLE_TOP_TIER_PRIORITY_ORDER.includes(priority)) {
      summary.priorities[priority] += 1;
    }
    if (assessment && assessment.ready === false) {
      summary.blocked += 1;
      if (STABLE_TOP_TIER_PRIORITY_ORDER.includes(priority)) {
        summary['blocked-by-priority'][priority] += 1;
      }
    }

    const blockers = Array.isArray(assessment && assessment.blockers) ? assessment.blockers : [];
    const blockerCategories = new Set(
      blockers.flatMap((blocker) => Array.isArray(blocker && blocker.categories) ? blocker.categories : [])
    );
    if (blockers.some((blocker) => normalizeString(blocker && blocker.type) === 'review-cadence-expired')) {
      summary.categories['stable-overdue'] += 1;
    }
    if (blockers.some((blocker) => ['review-metadata-missing', 'last-reviewed', 'review-cycle-days'].includes(normalizeString(blocker && blocker.type)))) {
      summary.categories['stable-missing-metadata'] += 1;
    }
    if (blockerCategories.has('expert-source')) {
      summary.categories['stable-expert-source-blocked'] += 1;
    }
    if (blockerCategories.has('route')) {
      summary.categories['stable-route-evidence-blocked'] += 1;
    }
    if (blockerCategories.has('runtime-proof')) {
      summary.categories['stable-runtime-proof-blocked'] += 1;
    }
    if (blockerCategories.has('host-smoke')) {
      summary.categories['stable-host-smoke-blocked'] += 1;
    }
    if (blockerCategories.has('module-depth')) {
      summary.categories['stable-module-depth-blocked'] += 1;
    }
  }

  summary.categories['stable-blocked-total'] = [
    'stable-overdue',
    'stable-missing-metadata',
    'stable-expert-source-blocked',
    'stable-route-evidence-blocked',
    'stable-runtime-proof-blocked',
    'stable-host-smoke-blocked',
    'stable-module-depth-blocked'
  ].reduce((sum, field) => sum + Number(summary.categories[field] || 0), 0);

  return summary;
}

function assessmentMatchesStableTopTierSummaryCategory(assessment, category) {
  const blockers = Array.isArray(assessment && assessment.blockers) ? assessment.blockers : [];
  const blockerCategories = new Set(
    blockers.flatMap((blocker) => Array.isArray(blocker && blocker.categories) ? blocker.categories : [])
  );

  if (category === 'stable-overdue') {
    return blockers.some((blocker) => normalizeString(blocker && blocker.type) === 'review-cadence-expired');
  }
  if (category === 'stable-missing-metadata') {
    return blockers.some((blocker) => ['review-metadata-missing', 'last-reviewed', 'review-cycle-days'].includes(normalizeString(blocker && blocker.type)));
  }
  if (category === 'stable-expert-source-blocked') {
    return blockerCategories.has('expert-source');
  }
  if (category === 'stable-route-evidence-blocked') {
    return blockerCategories.has('route');
  }
  if (category === 'stable-runtime-proof-blocked') {
    return blockerCategories.has('runtime-proof');
  }
  if (category === 'stable-host-smoke-blocked') {
    return blockerCategories.has('host-smoke');
  }
  if (category === 'stable-module-depth-blocked') {
    return blockerCategories.has('module-depth');
  }
  return false;
}

function buildStableTopTierUpgradeBoard(portfolio = {}) {
  const assessments = Array.isArray(portfolio && portfolio.assessments) ? portfolio.assessments : [];
  const blockedAssessments = assessments.filter((assessment) => assessment && assessment.ready === false);
  const blockedByPriority = Object.fromEntries(
    STABLE_TOP_TIER_PRIORITY_ORDER.map((priority) => [
      priority,
      blockedAssessments
        .filter((assessment) => normalizeString(assessment && assessment.priority) === priority)
        .map((assessment) => normalizeString(assessment && assessment.skill))
        .filter(Boolean)
    ])
  );
  const lanes = STABLE_TOP_TIER_PRIORITY_ORDER
    .map((priority) => ({
      priority,
      count: blockedByPriority[priority].length,
      skills: blockedByPriority[priority]
    }))
    .filter((lane) => lane.count > 0);

  const groups = STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER
    .map((category) => {
      const definition = STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_DEFINITIONS[category] || {};
      const skills = blockedAssessments
        .filter((assessment) => assessmentMatchesStableTopTierSummaryCategory(assessment, category))
        .map((assessment) => normalizeString(assessment && assessment.skill))
        .filter(Boolean);

      return {
        category,
        priority: STABLE_TOP_TIER_SUMMARY_CATEGORY_TO_PRIORITY[category] || 'normal',
        title: normalizeString(definition.title),
        summary: normalizeString(definition.summary),
        count: skills.length,
        skills,
        follow_up: uniqueSorted(definition.follow_up || [])
      };
    })
    .filter((group) => group.count > 0);

  const nextWave = lanes[0] ? lanes[0].skills.slice(0, 5) : [];

  return {
    summary: {
      blocked: blockedAssessments.length,
      lanes: Object.fromEntries(
        STABLE_TOP_TIER_PRIORITY_ORDER.map((priority) => [priority, blockedByPriority[priority].length])
      ),
      groups: Object.fromEntries(
        STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER.map((category) => {
          const group = groups.find((item) => item.category === category);
          return [category, group ? group.count : 0];
        })
      ),
      'next-wave': nextWave
    },
    lanes,
    groups
  };
}

function materializeStableTopTierFollowUpCommand(command, skillName = '') {
  let normalized = normalizeString(command);
  if (!normalized) {
    return '';
  }

  const replacementSkill = normalizeString(skillName);
  if (replacementSkill) {
    normalized = normalized.replace(/<skill-name>/g, replacementSkill);
  }

  return /<[^>]+>/.test(normalized) ? '' : normalized;
}

function compareStableTopTierUpgradeGroups(left, right) {
  const leftScore = STABLE_TOP_TIER_PRIORITY_SCORE[normalizeString(left && left.priority)] || 0;
  const rightScore = STABLE_TOP_TIER_PRIORITY_SCORE[normalizeString(right && right.priority)] || 0;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  const leftCount = Number(left && left.count || 0);
  const rightCount = Number(right && right.count || 0);
  if (rightCount !== leftCount) {
    return rightCount - leftCount;
  }

  const leftCategory = normalizeString(left && left.category);
  const rightCategory = normalizeString(right && right.category);
  return STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER.indexOf(leftCategory)
    - STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER.indexOf(rightCategory);
}

function cloneStableTopTierUpgradeLane(lane) {
  return lane
    ? {
        priority: normalizeString(lane.priority),
        count: Number(lane.count || 0),
        skills: normalizeStringList(lane.skills)
      }
    : null;
}

function cloneStableTopTierUpgradeGroup(group) {
  return group
    ? {
        category: normalizeString(group.category),
        priority: normalizeString(group.priority),
        title: normalizeString(group.title),
        summary: normalizeString(group.summary),
        count: Number(group.count || 0),
        skills: normalizeStringList(group.skills),
        follow_up: normalizeStringList(group.follow_up)
      }
    : null;
}

function buildStableTopTierExecutionFocusFromUpgradeBoard(upgradeBoard = {}) {
  const lanes = Array.isArray(upgradeBoard && upgradeBoard.lanes) ? upgradeBoard.lanes : [];
  const groups = Array.isArray(upgradeBoard && upgradeBoard.groups) ? upgradeBoard.groups : [];
  const nextWave = normalizeStringList(upgradeBoard && upgradeBoard.summary && upgradeBoard.summary['next-wave']);
  const currentPriorityLane = cloneStableTopTierUpgradeLane(lanes.find((lane) => Number(lane && lane.count || 0) > 0) || null);
  const currentBlockerFamily = cloneStableTopTierUpgradeGroup(
    [...groups]
      .filter((group) => Number(group && group.count || 0) > 0)
      .sort(compareStableTopTierUpgradeGroups)[0] || null
  );
  const leadSkill = normalizeString(
    nextWave[0]
    || (currentPriorityLane && currentPriorityLane.skills[0])
    || (currentBlockerFamily && currentBlockerFamily.skills[0])
  );
  const followUp = dedupeOrdered([
    'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier --all',
    'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-top-tier-wave',
    'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-investment-backlog --source top-tier-readiness',
    leadSkill ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${leadSkill}` : '',
    ...((currentBlockerFamily && Array.isArray(currentBlockerFamily.follow_up))
      ? currentBlockerFamily.follow_up.map((command) => materializeStableTopTierFollowUpCommand(command, leadSkill))
      : [])
  ]);

  return {
    blocked: Number(upgradeBoard && upgradeBoard.summary && upgradeBoard.summary.blocked || 0),
    'next-wave': nextWave,
    'next-wave-size': nextWave.length,
    'current-priority-lane': currentPriorityLane,
    'current-blocker-family': currentBlockerFamily,
    follow_up: followUp
  };
}

function buildStableTopTierExecutionFocus(portfolio = {}) {
  return buildStableTopTierExecutionFocusFromUpgradeBoard(
    buildStableTopTierUpgradeBoard(portfolio)
  );
}

function blockerMatchesStableTopTierSummaryCategory(blocker, category) {
  const type = normalizeString(blocker && blocker.type);
  const blockerCategories = new Set(
    Array.isArray(blocker && blocker.categories)
      ? blocker.categories.map((item) => normalizeString(item)).filter(Boolean)
      : []
  );

  if (category === 'stable-overdue') {
    return type === 'review-cadence-expired';
  }
  if (category === 'stable-missing-metadata') {
    return ['review-metadata-missing', 'last-reviewed', 'review-cycle-days'].includes(type);
  }
  if (category === 'stable-expert-source-blocked') {
    return blockerCategories.has('expert-source');
  }
  if (category === 'stable-route-evidence-blocked') {
    return blockerCategories.has('route');
  }
  if (category === 'stable-runtime-proof-blocked') {
    return blockerCategories.has('runtime-proof');
  }
  if (category === 'stable-host-smoke-blocked') {
    return blockerCategories.has('host-smoke');
  }
  if (category === 'stable-module-depth-blocked') {
    return blockerCategories.has('module-depth');
  }
  return false;
}

function buildStableTopTierHardeningPlan(assessment = {}) {
  const normalizedAssessment = assessment && typeof assessment === 'object' ? assessment : {};
  const blockers = Array.isArray(normalizedAssessment.blockers) ? normalizedAssessment.blockers : [];
  const skillName = normalizeString(normalizedAssessment.skill);
  const matchedIndexes = new Set();

  const blockingFamilies = STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER
    .map((category) => {
      const definition = STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_DEFINITIONS[category] || {};
      const familyBlockers = [];

      blockers.forEach((blocker, index) => {
        if (!blockerMatchesStableTopTierSummaryCategory(blocker, category)) {
          return;
        }
        matchedIndexes.add(index);
        familyBlockers.push(blocker);
      });

      if (familyBlockers.length < 1) {
        return null;
      }

      return {
        category,
        priority: STABLE_TOP_TIER_SUMMARY_CATEGORY_TO_PRIORITY[category] || 'normal',
        title: normalizeString(definition.title),
        summary: normalizeString(definition.summary),
        'blocker-count': familyBlockers.length,
        blockers: dedupeOrdered(
          familyBlockers
            .map((blocker) => normalizeTextValue(blocker && blocker.message))
            .filter(Boolean)
        ),
        follow_up: buildStableTopTierFamilyFollowUp(category, skillName, normalizedAssessment, definition)
      };
    })
    .filter(Boolean);

  const unmatchedBlockers = blockers
    .map((blocker, index) => ({ blocker, index }))
    .filter(({ index }) => !matchedIndexes.has(index))
    .map(({ blocker }) => blocker);

  if (unmatchedBlockers.length > 0) {
    blockingFamilies.push({
      category: 'additional-governance-debt',
      priority: normalizeString(normalizedAssessment.priority) || resolveStableTopTierPriority(blockers),
      title: 'Additional governance debt',
      summary: 'Clear remaining blockers not covered by a named top-tier blocker family.',
      'blocker-count': unmatchedBlockers.length,
      blockers: dedupeOrdered(
        unmatchedBlockers
          .map((blocker) => normalizeTextValue(blocker && blocker.message))
          .filter(Boolean)
      ),
      follow_up: dedupeOrdered([
        skillName ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js show ${skillName}` : '',
        skillName ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${skillName}` : ''
      ].filter(Boolean))
    });
  }

  const followUp = normalizedAssessment.ready === true
    ? dedupeOrdered([
        skillName ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${skillName}` : '',
        skillName ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status ${skillName} stable` : ''
      ].filter(Boolean))
    : dedupeOrdered([
        skillName ? `node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier ${skillName}` : '',
        ...blockingFamilies.flatMap((family) => Array.isArray(family.follow_up) ? family.follow_up : [])
      ].filter(Boolean));

  return {
    ready: normalizedAssessment.ready === true,
    priority: normalizeString(normalizedAssessment.priority) || resolveStableTopTierPriority(blockers),
    'blocking-family-count': blockingFamilies.length,
    'blocking-families': blockingFamilies,
    follow_up: followUp
  };
}

function buildReviewEntryMap(skillRecords, options = {}) {
  const reviewEntries = Array.isArray(options.reviewQueueData && options.reviewQueueData.skills)
    ? options.reviewQueueData.skills
    : buildReviewQueueEntries(skillRecords, { now: options.now });

  return new Map(
    reviewEntries.map((entry) => [String(entry && entry.skill || '').trim(), entry])
  );
}

function getModuleIdsByHostSkill(registryData = {}) {
  const map = new Map();
  const groups = Array.isArray(registryData['module-groups']) ? registryData['module-groups'] : [];
  for (const group of groups) {
    const hostSkill = String(group && group['host-skill'] || '').trim();
    if (!hostSkill) {
      continue;
    }
    map.set(
      hostSkill,
      Array.isArray(group && group.modules)
        ? group.modules
            .map((module) => String(module && module.id || '').trim())
            .filter(Boolean)
        : []
    );
  }
  return map;
}

function getTopReadyModuleSet(ratingsData = {}) {
  return new Set((((ratingsData['rating-buckets'] || {})['top-ready']) || []).map((item) => String(item || '').trim()).filter(Boolean));
}

function getRuntimeProofEntryMap(runtimeProofData = {}) {
  return new Map(
    dedupeRuntimeProofEntries(runtimeProofData.proofs, { prefer: 'first' })
      .filter((entry) => entry && entry.skill)
      .map((entry) => [String(entry.skill || '').trim(), entry])
  );
}

function getHostSmokeScorecardEntryMap(hostSmokeScorecardData = {}, runtimeProofData = {}, bundleRoot = null, options = {}) {
  const entries = Array.isArray(hostSmokeScorecardData && hostSmokeScorecardData.skills)
    ? hostSmokeScorecardData.skills
    : (
      bundleRoot
        ? buildHostSmokeScorecard(
            bundleRoot,
            dedupeRuntimeProofEntries(runtimeProofData && runtimeProofData.proofs, { prefer: 'first' }).filter((proof) => proof && proof['host-smoke']),
            options.hostSmokeScorecardOptions || {}
          ).skills
        : []
    );
  return new Map(
    entries
      .filter((entry) => entry && entry.skill)
      .map((entry) => [String(entry.skill || '').trim(), entry])
  );
}

function buildExpectedStableOpenAiMetadata(record, parsed, bundleRoot) {
  const skillDir = path.join(bundleRoot, path.dirname(record.file));
  return buildOpenAiMetadata({
    name: record.name,
    title: parsed.data.title,
    description: parsed.data.description,
    kind: record.kind,
    skillRelPath: path.relative(path.join(bundleRoot, 'skills'), path.normalize(skillDir)).split(path.sep).join('/')
  });
}

function requireListSync(blockers, record, label, actual, expected) {
  const missing = expected.filter((item) => !actual.includes(item));
  if (missing.length > 0) {
    blockers.push({
      type: `route-${label}`,
      file: 'registry/route-map.generated.json',
      message: `route '${record.name}' is missing ${label} declared in SKILL metadata: ${missing.join(', ')}`,
      categories: ['route']
    });
  }
}

function collectStableTopTierBlockers(record, context = {}) {
  const blockers = [];
  if (!record || !shouldEvaluateAsStableCandidate(record, context)) {
    return blockers;
  }
  const candidateRecord = buildStableTopTierCandidateRecord(record, context);

  const bundleRoot = String(context.bundleRoot || '').trim();
  if (!bundleRoot) {
    throw new Error('collectStableTopTierBlockers requires bundleRoot');
  }

  const skillFilePath = path.join(bundleRoot, candidateRecord.file);
  const skillDir = path.join(bundleRoot, path.dirname(candidateRecord.file));
  const skillText = fs.readFileSync(skillFilePath, 'utf8');
  const parsed = parseFrontmatter(skillText);
  if (parsed.error) {
    blockers.push({
      type: 'frontmatter-parse',
      file: candidateRecord.file,
      message: `frontmatter error: ${parsed.error}`,
      categories: ['metadata']
    });
    return blockers;
  }

  const routeMapData = context.routeMapData || readJsonIfPresent(path.join(bundleRoot, 'registry', 'route-map.generated.json'), {});
  const routeFixturesData = context.routeFixturesData || readJsonIfPresent(path.join(bundleRoot, 'registry', 'route-fixtures.generated.json'), {});
  const runtimeProofData = context.runtimeProofData || readJsonIfPresent(path.join(bundleRoot, 'registry', 'runtime-proof.generated.json'), {});
  const registryData = context.registryData || readJsonIfPresent(path.join(bundleRoot, 'registry', 'registry.generated.json'), {});
  const ratingsData = context.ratingsData || readJsonIfPresent(path.join(bundleRoot, 'registry', 'capability-ratings.generated.json'), {});
  const reviewQueueData = context.reviewQueueData || readJsonIfPresent(path.join(bundleRoot, 'registry', 'review-queue.generated.json'), { skills: [] });
  const reviewEntryMap = context.reviewEntryMap instanceof Map
    ? context.reviewEntryMap
    : buildReviewEntryMap(context.skillRecords || [], {
        ...context,
        reviewQueueData
      });
  const runtimeProofEntryMap = context.runtimeProofEntryMap instanceof Map
    ? context.runtimeProofEntryMap
    : getRuntimeProofEntryMap(runtimeProofData);
  const hostSmokeScorecardEntryMap = context.hostSmokeScorecardEntryMap instanceof Map
    ? context.hostSmokeScorecardEntryMap
    : getHostSmokeScorecardEntryMap(
        context.hostSmokeScorecardData || {},
        runtimeProofData,
        bundleRoot,
        context
      );
  const moduleIdsByHostSkill = context.moduleIdsByHostSkill instanceof Map
    ? context.moduleIdsByHostSkill
    : getModuleIdsByHostSkill(registryData);
  const topReadyModuleSet = context.topReadyModuleSet instanceof Set
    ? context.topReadyModuleSet
    : getTopReadyModuleSet(ratingsData);
  const route = (Array.isArray(routeMapData.routes) ? routeMapData.routes : []).find((item) => item && item.skill === candidateRecord.name) || null;
  const fixtures = Array.isArray(routeFixturesData.cases) ? routeFixturesData.cases : [];
  const proofEntry = runtimeProofEntryMap.get(candidateRecord.name) || null;
  const hostSmokeScorecardEntry = hostSmokeScorecardEntryMap.get(candidateRecord.name) || null;
  const expertSourceBlockers = collectExpertSourceTopTierBlockersForSkill(
    bundleRoot,
    registryData,
    candidateRecord.name,
    context.expertSourceTopTierState
      ? { blockerMapState: context.expertSourceTopTierState }
      : {}
  );
  const reviewEntry = reviewEntryMap.get(candidateRecord.name) || null;
  const assessPromotionCandidate = normalizeString(record.status) !== 'stable' && candidateRecord.status === 'stable';

  const stableReferenceFloor = (getSkillKindDefinition(candidateRecord.kind) || {}).topTierReferenceFloor || 0;
  const referenceDir = path.join(skillDir, 'references');
  const referenceFiles = fs.existsSync(referenceDir)
    ? fs.readdirSync(referenceDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => entry.name)
    : [];
  if (stableReferenceFloor > 0 && referenceFiles.length < stableReferenceFloor) {
    blockers.push({
      type: 'reference-floor',
      file: candidateRecord.file,
      message: `stable skill only has ${referenceFiles.length} reference files; expected at least ${stableReferenceFloor} for top-tier depth`,
      categories: ['depth']
    });
  }

  if (candidateRecord.userInvocable) {
    const concreteKeywords = (Array.isArray(candidateRecord.triggerKeywords) ? candidateRecord.triggerKeywords : [])
      .filter((keyword) => !/-signal$|-trigger$/i.test(String(keyword || '')));
    if (concreteKeywords.length < 2) {
      blockers.push({
        type: 'trigger-keywords',
        file: candidateRecord.file,
        message: 'stable skill should expose at least two concrete trigger keywords',
        categories: ['route']
      });
    }
  }

  const description = String(parsed.data.description || '');
  if (/template scaffold/i.test(description)) {
    blockers.push({
      type: 'template-description',
      file: candidateRecord.file,
      message: 'stable skill still looks like a template scaffold',
      categories: ['depth']
    });
  }
  if (/TODO:/i.test(description)) {
    blockers.push({
      type: 'todo-description',
      file: candidateRecord.file,
      message: 'stable skill description still contains TODO placeholder text',
      categories: ['depth']
    });
  }
  if (/-template$/.test(String(candidateRecord.name || ''))) {
    blockers.push({
      type: 'template-name',
      file: candidateRecord.file,
      message: 'stable skill name still looks like a template artifact',
      categories: ['depth']
    });
  }

  for (const blocker of expertSourceBlockers) {
    blockers.push({
      type: blocker.type || 'expert-source-top-tier',
      file: blocker.integrationFile || 'registry/expert-source-family-scorecard.generated.json',
      message: blocker.message || `expert-source blocker detected for '${candidateRecord.name}'`,
      categories: ['expert-source']
    });
  }

  if (shouldAppearOnActiveRouteSurface(candidateRecord)) {
    if (!route) {
      blockers.push({
        type: 'route-missing',
        file: candidateRecord.file,
        message: `user-invocable skill '${candidateRecord.name}' is missing from route-map.generated.json`,
        categories: ['route']
      });
    } else {
      const activation = route.activation || {};
      const expectedExplicitInvocation = !Array.isArray(candidateRecord.triggerMode) || !candidateRecord.triggerMode.includes('auto');
      requireListSync(blockers, candidateRecord, 'supported-hosts', uniqueSorted(route['supported-hosts']), uniqueSorted(candidateRecord.supportedHosts));
      requireListSync(blockers, candidateRecord, 'trigger-keywords', uniqueSorted(activation['trigger-keywords']), uniqueSorted(candidateRecord.triggerKeywords));
      requireListSync(blockers, candidateRecord, 'negative-keywords', uniqueSorted(activation['negative-keywords']), uniqueSorted(candidateRecord.negativeKeywords));
      requireListSync(blockers, candidateRecord, 'aliases', uniqueSorted(route.aliases), uniqueSorted(candidateRecord.aliases));
      requireListSync(blockers, candidateRecord, 'auto-chain entries', uniqueSorted(route['auto-chain']), uniqueSorted(candidateRecord.autoChain));
      requireListSync(blockers, candidateRecord, 'conflicts-with entries', uniqueSorted(route['conflicts-with']), uniqueSorted(candidateRecord.conflictsWith));

      if (Boolean(activation['requires-explicit-invocation']) !== expectedExplicitInvocation) {
        blockers.push({
          type: 'route-explicit-mode',
          file: 'registry/route-map.generated.json',
          message: `route '${candidateRecord.name}' requires-explicit-invocation '${Boolean(activation['requires-explicit-invocation'])}' is out of sync with SKILL trigger-mode`,
          categories: ['route']
        });
      }
    }
  }

  if (candidateRecord.userInvocable && !hasRouteFixtureEvidence(candidateRecord.name, fixtures, { includeGoverned: false })) {
    blockers.push({
      type: 'route-fixture-evidence',
      file: candidateRecord.file,
      message: `stable skill '${candidateRecord.name}' has no route fixture evidence`,
      categories: ['route']
    });
  }

  const expectedGovernedFixture = buildExpectedGovernedRouteFixtureForRecord(candidateRecord);
  if (expectedGovernedFixture) {
    const governedFixture = findGovernedRouteFixtureForSkill(fixtures, candidateRecord.name);
    if (governedFixture) {
      const comparableActual = {
        name: String(governedFixture.name || '').trim(),
        query: String(governedFixture.query || '').trim(),
        expect: String(governedFixture.expect || '').trim(),
        'expect-no-fallback': governedFixture['expect-no-fallback'] === true,
        governed: governedFixture.governed === true
      };
      if (JSON.stringify(comparableActual) !== JSON.stringify(expectedGovernedFixture)) {
        blockers.push({
          type: 'governed-route-fixture-drift',
          file: 'registry/route-fixtures.generated.json',
          message: `governed route fixture '${expectedGovernedFixture.name}' is out of sync with current skill metadata`,
          categories: ['route']
        });
      }
    }
  }

  const openAiMetadataPath = path.join(skillDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(openAiMetadataPath)) {
    blockers.push({
      type: 'host-metadata-missing',
      file: candidateRecord.file,
      message: 'stable skill is missing agents/openai.yaml host metadata',
      categories: ['metadata']
    });
  } else {
    const parsedMetadata = readOpenAiMetadataFile(openAiMetadataPath);
    if (parsedMetadata.error) {
      blockers.push({
        type: 'host-metadata-parse',
        file: path.relative(bundleRoot, openAiMetadataPath).split(path.sep).join('/'),
        message: `agents/openai.yaml parse failed: ${parsedMetadata.error}`,
        categories: ['metadata']
      });
    } else {
      const expectedMetadata = buildExpectedStableOpenAiMetadata(candidateRecord, parsed, bundleRoot);
      for (const key of OPENAI_METADATA_KEYS) {
        if (normalizeTextValue(parsedMetadata.data[key]) !== normalizeTextValue(expectedMetadata[key])) {
          blockers.push({
            type: `host-metadata-${key}`,
            file: path.relative(bundleRoot, openAiMetadataPath).split(path.sep).join('/'),
            message: `agents/openai.yaml '${key}' is out of sync with SKILL.md`,
            categories: ['metadata']
          });
        }
      }
    }
  }

  const ownedModules = moduleIdsByHostSkill.get(candidateRecord.name) || [];
  const weakModules = ownedModules.filter((moduleId) => !topReadyModuleSet.has(moduleId));
  if (weakModules.length > 0) {
    blockers.push({
      type: 'capability-module-rating',
      file: 'registry/capability-ratings.generated.json',
      message: `stable skill '${candidateRecord.name}' has non-top-ready capability modules: ${weakModules.join(', ')}`,
      categories: ['module-depth'],
      modules: weakModules
    });
  }

  if (candidateRecord.runtime === 'scripted') {
    const scriptPath = path.join(skillDir, 'scripts', 'run.js');
    if (!fs.existsSync(scriptPath)) {
      blockers.push({
        type: 'script-missing',
        file: candidateRecord.file,
        message: 'scripted runtime declared but scripts/run.js is missing',
        categories: ['runtime-proof']
      });
    }
    if ((candidateRecord.runtimeProofItems || []).length < 2) {
      blockers.push({
        type: 'runtime-proof-bullets',
        file: candidateRecord.file,
        message: 'stable scripted skill should declare at least two runtime proof bullets in a Runtime Proof section',
        categories: ['runtime-proof']
      });
    }
    if (!candidateRecord.smokeManifest) {
      blockers.push({
        type: 'smoke-manifest-missing',
        file: candidateRecord.file,
        message: 'stable scripted skill should declare scripts/smoke.json so host-smoked promotion has an executable contract surface',
        categories: ['runtime-proof', 'host-smoke']
      });
    } else {
      for (const error of validateSmokeManifestContract(candidateRecord.smokeManifest)) {
        blockers.push({
          type: 'smoke-manifest-invalid',
          file: candidateRecord.smokeManifestPath,
          message: error,
          categories: ['runtime-proof', 'host-smoke']
        });
      }
      const smokeText = JSON.stringify(candidateRecord.smokeManifest);
      if (/tool-template|guard-template|Replace this stub/i.test(smokeText)) {
        blockers.push({
          type: 'smoke-manifest-template',
          file: candidateRecord.smokeManifestPath,
          message: 'stable scripted skill smoke manifest still contains template placeholder content',
          categories: ['runtime-proof', 'host-smoke']
        });
      }
    }

    let proofEntryForAssessment = proofEntry;
    if (assessPromotionCandidate) {
      try {
        proofEntryForAssessment = buildRuntimeProofEntry(
          candidateRecord,
          {
            level: getTargetRuntimeProofLevelForStatus('stable'),
            ...(proofEntry && Array.isArray(proofEntry['evidence-tests'])
              ? { evidenceTests: proofEntry['evidence-tests'] }
              : {})
          },
          proofEntry
        );
      } catch (error) {
        blockers.push({
          type: 'runtime-proof-contract-drift',
          file: 'registry/runtime-proof.generated.json',
          message: String(error && error.message ? error.message : error),
          categories: ['runtime-proof', 'host-smoke']
        });
      }
    }

    if (!proofEntryForAssessment) {
      blockers.push({
        type: 'runtime-proof-missing',
        file: candidateRecord.file,
        message: `stable scripted skill '${candidateRecord.name}' is missing from runtime-proof.generated.json`,
        categories: ['runtime-proof']
      });
    } else {
      const targetLevel = getTargetRuntimeProofLevelForStatus('stable');
      const levelComparison = compareRuntimeProofLevels(String(proofEntryForAssessment.level || '').trim(), targetLevel);
      if (levelComparison != null && levelComparison < 0) {
        blockers.push({
          type: 'runtime-proof-level-floor',
          file: 'registry/runtime-proof.generated.json',
          message: `stable scripted skill '${candidateRecord.name}' is still marked '${String(proofEntryForAssessment.level || '').trim() || 'unknown'}' below the stable runtime-proof floor '${targetLevel}'`,
          categories: ['runtime-proof']
        });
      }
      if ((Array.isArray(proofEntryForAssessment.contracts) ? proofEntryForAssessment.contracts : []).length < 2) {
        blockers.push({
          type: 'runtime-proof-contracts',
          file: 'registry/runtime-proof.generated.json',
          message: `runtime proof entry for '${candidateRecord.name}' should declare at least two contracts`,
          categories: ['runtime-proof']
        });
      }
      if (!Array.isArray(proofEntryForAssessment['evidence-tests']) || proofEntryForAssessment['evidence-tests'].length < 1) {
        blockers.push({
          type: 'runtime-proof-evidence',
          file: 'registry/runtime-proof.generated.json',
          message: `runtime-proof level 'declared-and-tested' for '${candidateRecord.name}' requires at least one evidence test before status can move to 'stable'`,
          categories: ['runtime-proof']
        });
      }
      if (!assessPromotionCandidate && proofEntry) {
        try {
          buildRuntimeProofEntry(
            candidateRecord,
            {
              level: proofEntry.level,
              evidenceTests: proofEntry['evidence-tests']
            },
            proofEntry
          );
        } catch (error) {
          blockers.push({
            type: 'runtime-proof-contract-drift',
            file: 'registry/runtime-proof.generated.json',
            message: String(error && error.message ? error.message : error),
            categories: ['runtime-proof', 'host-smoke']
          });
        }
      }

      const hostSmokePolicy = normalizeHostSmokePolicy(proofEntryForAssessment['host-smoke-policy']);
      if (hostSmokePolicy && hostSmokePolicy['target-level'] === 'host-smoked') {
        if (!hostSmokeScorecardEntry) {
          blockers.push({
            type: 'host-smoke-scorecard-missing',
            file: 'benchmark/host-smoke/scorecard.generated.json',
            message: `host-smoke scorecard is missing an entry for '${candidateRecord.name}'`,
            categories: ['host-smoke']
          });
        } else {
          if (hostSmokeScorecardEntry.level !== 'host-smoked') {
            blockers.push({
              type: 'host-smoke-level',
              file: 'benchmark/host-smoke/scorecard.generated.json',
              message: `critical host-smoke policy for '${candidateRecord.name}' requires level 'host-smoked'`,
              categories: ['host-smoke']
            });
          }
          if (hostSmokeScorecardEntry['governance-status'] !== 'satisfied') {
            blockers.push({
              type: 'host-smoke-governance',
              file: 'benchmark/host-smoke/scorecard.generated.json',
              message: `critical host-smoke policy for '${candidateRecord.name}' is not yet satisfied (${hostSmokeScorecardEntry['governance-status'] || 'unknown'})`,
              categories: ['host-smoke']
            });
          }
        }
      }
    }
  }

  if (!parsed.data['last-reviewed']) {
    blockers.push({
      type: 'last-reviewed',
      file: candidateRecord.file,
      message: "status 'stable' should declare last-reviewed",
      categories: ['review']
    });
  }
  if (!parsed.data['review-cycle-days']) {
    blockers.push({
      type: 'review-cycle-days',
      file: candidateRecord.file,
      message: "status 'stable' should declare review-cycle-days",
      categories: ['review']
    });
  }
  if (reviewEntry) {
    const reviewStatus = String(reviewEntry['review-status'] || '').trim();
    if (reviewStatus === 'overdue') {
      blockers.push({
        type: 'review-cadence-expired',
        file: candidateRecord.file,
        message: `stable skill review cadence expired on ${String(reviewEntry['next-review-due'] || 'unknown-date')}`,
        categories: ['review']
      });
    } else if (reviewStatus === 'missing-metadata') {
      blockers.push({
        type: 'review-metadata-missing',
        file: candidateRecord.file,
        message: `stable skill '${candidateRecord.name}' is missing governed review metadata`,
        categories: ['review']
      });
    }
  }

  return blockers;
}

function summarizeStableTopTierBlockers(skillRecords, context = {}) {
  const counts = createEmptyStableTopTierBlockerCounts();
  const blockersBySkill = new Map();
  const moduleIdsByHostSkill = getModuleIdsByHostSkill(context.registryData || {});
  const topReadyModuleSet = getTopReadyModuleSet(context.ratingsData || {});
  const reviewEntryMap = buildReviewEntryMap(skillRecords, context);
  const runtimeProofEntryMap = getRuntimeProofEntryMap(context.runtimeProofData || {});
  const hostSmokeScorecardEntryMap = getHostSmokeScorecardEntryMap(
    context.hostSmokeScorecardData || {},
    context.runtimeProofData || {},
    context.bundleRoot,
    context
  );

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (!record || record.status !== 'stable') {
      continue;
    }
    const blockers = collectStableTopTierBlockers(record, {
      ...context,
      reviewEntryMap,
      runtimeProofEntryMap,
      hostSmokeScorecardEntryMap,
      moduleIdsByHostSkill,
      topReadyModuleSet
    });
    blockersBySkill.set(record.name, blockers);

    const hasReviewOverdue = blockers.some((item) => item.type === 'review-cadence-expired');
    const hasReviewMissing = blockers.some((item) => item.type === 'review-metadata-missing' || item.type === 'last-reviewed' || item.type === 'review-cycle-days');
    const hasExpertSource = blockers.some((item) => Array.isArray(item.categories) && item.categories.includes('expert-source'));
    const hasRoute = blockers.some((item) => Array.isArray(item.categories) && item.categories.includes('route'));
    const hasRuntimeProof = blockers.some((item) => Array.isArray(item.categories) && item.categories.includes('runtime-proof'));
    const hasHostSmoke = blockers.some((item) => Array.isArray(item.categories) && item.categories.includes('host-smoke'));
    const hasModuleDepth = blockers.some((item) => Array.isArray(item.categories) && item.categories.includes('module-depth'));

    if (hasReviewOverdue) counts['stable-overdue'] += 1;
    if (hasReviewMissing) counts['stable-missing-metadata'] += 1;
    if (hasExpertSource) counts['stable-expert-source-blocked'] += 1;
    if (hasRoute) counts['stable-route-evidence-blocked'] += 1;
    if (hasRuntimeProof) counts['stable-runtime-proof-blocked'] += 1;
    if (hasHostSmoke) counts['stable-host-smoke-blocked'] += 1;
    if (hasModuleDepth) counts['stable-module-depth-blocked'] += 1;
  }

  counts['stable-blocked-total'] = [
    'stable-overdue',
    'stable-missing-metadata',
    'stable-expert-source-blocked',
    'stable-route-evidence-blocked',
    'stable-runtime-proof-blocked',
    'stable-host-smoke-blocked',
    'stable-module-depth-blocked'
  ].reduce((sum, field) => sum + Number(counts[field] || 0), 0);

  return {
    counts,
    blockersBySkill
  };
}

function buildStableTopTierAssessment(record, context = {}) {
  if (!record) {
    return null;
  }

  const candidateRecord = buildStableTopTierCandidateRecord(record, context);
  const moduleIdsByHostSkill = context.moduleIdsByHostSkill instanceof Map
    ? context.moduleIdsByHostSkill
    : getModuleIdsByHostSkill(context.registryData || {});
  const moduleIds = moduleIdsByHostSkill.get(candidateRecord.name) || [];
  const moduleRatings = buildCapabilityModuleRatings(context.ratingsData || {}, moduleIds);
  const moduleBlockers = buildCapabilityModuleTopTierBlockers(context.ratingsData || {}, moduleIds);
  const stableBlockers = collectStableTopTierBlockers(candidateRecord, {
    ...context,
    moduleIdsByHostSkill
  });
  const blockers = [...moduleBlockers, ...stableBlockers];
  const blockerCategories = buildStableTopTierBlockerCategories(blockers);
  const priority = resolveStableTopTierPriority(blockers);
  const ready = blockers.length < 1;

  return {
    skill: record.name,
    kind: record.kind,
    status: record.status,
    'target-status': candidateRecord.status,
    'host-smoke-policy': normalizeHostSmokePolicy(
      ((context.runtimeProofEntryMap instanceof Map
        ? context.runtimeProofEntryMap
        : getRuntimeProofEntryMap(context.runtimeProofData || {}))
        .get(candidateRecord.name) || {}
      )['host-smoke-policy']
    ) || null,
    ready,
    priority,
    'blocker-count': blockers.length,
    'blocker-categories': blockerCategories,
    'capability-modules': moduleRatings,
    blockers: blockers.map((blocker) => ({
      ...blocker,
      ...(Array.isArray(blocker && blocker.categories)
        ? { categories: uniqueSorted(blocker.categories) }
        : {})
    }))
  };
}

function buildStableTopTierPortfolio(skillRecords, context = {}) {
  const moduleIdsByHostSkill = context.moduleIdsByHostSkill instanceof Map
    ? context.moduleIdsByHostSkill
    : getModuleIdsByHostSkill(context.registryData || {});
  const stableRecords = (Array.isArray(skillRecords) ? skillRecords : [])
    .filter((record) => record && record.status === 'stable');
  const assessments = stableRecords
    .map((record) => buildStableTopTierAssessment(record, {
      ...context,
      moduleIdsByHostSkill
    }))
    .filter(Boolean)
    .sort(compareStableTopTierAssessmentEntries);

  const summary = {
    total: assessments.length,
    ready: assessments.filter((item) => item.ready === true).length,
    blocked: assessments.filter((item) => item.ready !== true).length,
    priorities: Object.fromEntries(
      STABLE_TOP_TIER_PRIORITY_ORDER.map((priority) => [
        priority,
        assessments.filter((item) => item.priority === priority).length
      ])
    )
  };
  const categorizedSummary = summarizeStableTopTierPortfolioByCategory(assessments);
  const upgradeBoard = buildStableTopTierUpgradeBoard({ assessments });
  const executionFocus = buildStableTopTierExecutionFocusFromUpgradeBoard(upgradeBoard);

  return {
    summary: {
      ...summary,
      categories: categorizedSummary.categories,
      'blocked-by-priority': categorizedSummary['blocked-by-priority']
    },
    assessments,
    'upgrade-board': upgradeBoard,
    'execution-focus': executionFocus
  };
}

function isStableSkillTopTierReady(skillName, summary) {
  if (!summary || !(summary.blockersBySkill instanceof Map)) {
    return true;
  }
  return (summary.blockersBySkill.get(String(skillName || '').trim()) || []).length < 1;
}

module.exports = {
  STABLE_TOP_TIER_BLOCKER_FIELDS,
  STABLE_TOP_TIER_PRIORITY_ORDER,
  STABLE_TOP_TIER_PRIORITY_SCORE,
  STABLE_TOP_TIER_SUMMARY_CATEGORY_TO_PRIORITY,
  STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_ORDER,
  STABLE_TOP_TIER_UPGRADE_BOARD_CATEGORY_DEFINITIONS,
  createEmptyStableTopTierBlockerCounts,
  buildCapabilityModuleRatings,
  buildCapabilityModuleTopTierBlockers,
  buildStableTopTierBlockerCategories,
  resolveStableTopTierPriority,
  compareStableTopTierAssessmentEntries,
  normalizeStableTopTierPortfolioSummary,
  summarizeStableTopTierPortfolioByCategory,
  assessmentMatchesStableTopTierSummaryCategory,
  buildStableTopTierUpgradeBoard,
  buildStableTopTierExecutionFocusFromUpgradeBoard,
  buildStableTopTierExecutionFocus,
  buildStableTopTierHardeningPlan,
  collectStableTopTierBlockers,
  summarizeStableTopTierBlockers,
  buildStableTopTierAssessment,
  buildStableTopTierPortfolio,
  isStableSkillTopTierReady
};
