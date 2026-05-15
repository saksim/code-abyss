'use strict';

const fs = require('fs');
const path = require('path');
const {
  getSkillLevelBucketForStatus
} = require('./skill-lifecycle-governance');
const {
  buildReviewQueueEntries
} = require('./skill-review-governance');
const {
  shouldAppearInSkillLevelSummary
} = require('./skill-kind-governance');
const {
  getGovernanceArtifactPath
} = require('./skill-generated-artifact-governance');
const {
  buildExpertSourceTopTierBlockerMap
} = require('./expert-source-integration');

const CAPABILITY_RATING_BUCKET_SEQUENCE = Object.freeze(['thin', 'strong-but-not-top', 'top-ready']);
const CAPABILITY_RATING_BUCKET_INDEX = new Map(
  CAPABILITY_RATING_BUCKET_SEQUENCE.map((bucketName, index) => [bucketName, index])
);
const CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE = Object.freeze(['thin', 'strong-but-not-top']);
const SKILL_LEVEL_SUMMARY_BUCKETS = Object.freeze([
  'top-level-enough-now',
  'strong-uplift-but-not-top-yet',
  'useful-overlay-not-top-level-alone'
]);
const SKILL_LEVEL_SUMMARY_BLOCKING_REVIEW_STATUSES = new Set(['overdue', 'missing-metadata']);
const CAPABILITY_NEXT_BATCH_POLICY_BY_BUCKET = Object.freeze({
  thin: Object.freeze({
    priority: 'upgrade-now',
    'next-step': 'Replace scaffold placeholders, deepen the reference, and add route evidence before promotion.'
  }),
  'strong-but-not-top': Object.freeze({
    priority: 'promote-next',
    'next-step': 'Close the remaining depth and evidence gaps before TOP-ready promotion.'
  })
});
const EMPTY_NEXT_BATCH_LINE = '- `(none; the current bundle is fully promoted in this snapshot)`';
const EMPTY_CAPABILITY_MODULE_SECTION_LINE = '- `(none in this snapshot)`';
const DEFAULT_SKILL_LEVEL_SUMMARY_SOURCE = 'docs/SKILL_TOP_LEVEL_AUDIT_2026-04-20.md';
const CAPABILITY_RATINGS_DOC_RELATIVE_PATH = 'docs/CAPABILITY_MODULE_RATINGS.md';
const STABLE_TOP_TIER_BLOCKER_COUNT_FIELDS = Object.freeze([
  'stable-overdue',
  'stable-missing-metadata',
  'stable-expert-source-blocked',
  'stable-blocked-total'
]);

function getCapabilityRatingsPath(bundleRoot) {
  return getGovernanceArtifactPath(bundleRoot, 'capability-ratings');
}

function getCapabilityRatingsDocPath(bundleRoot) {
  return path.join(bundleRoot, CAPABILITY_RATINGS_DOC_RELATIVE_PATH);
}

function removeValues(values, removals) {
  const items = Array.isArray(values) ? values : [];
  const removalSet = removals instanceof Set
    ? removals
    : new Set(Array.isArray(removals) ? removals : []);
  return items.filter((item) => !removalSet.has(item));
}

function normalizeCapabilityRatingBuckets(ratings) {
  const buckets = ratings['rating-buckets'] || {};
  for (const bucketName of CAPABILITY_RATING_BUCKET_SEQUENCE) {
    buckets[bucketName] = Array.isArray(buckets[bucketName]) ? buckets[bucketName] : [];
  }
  ratings['rating-buckets'] = buckets;
  return buckets;
}

function sortCapabilityRatingBuckets(ratings) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  for (const bucketName of CAPABILITY_RATING_BUCKET_SEQUENCE) {
    buckets[bucketName].sort();
  }
  return buckets;
}

function recomputeCapabilityRatingCounts(ratings) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  ratings.counts = {
    thin: buckets.thin.length,
    'strong-but-not-top': buckets['strong-but-not-top'].length,
    'top-ready': buckets['top-ready'].length,
    total: buckets.thin.length + buckets['strong-but-not-top'].length + buckets['top-ready'].length
  };
  return ratings.counts;
}

function syncCapabilityRatingsForModules(ratings, moduleIds, bucketName) {
  if (!Array.isArray(moduleIds) || moduleIds.length < 1) {
    sortCapabilityRatingBuckets(ratings);
    recomputeCapabilityRatingCounts(ratings);
    return;
  }

  const buckets = normalizeCapabilityRatingBuckets(ratings);
  const moduleSet = new Set(moduleIds);
  for (const currentBucket of CAPABILITY_RATING_BUCKET_SEQUENCE) {
    buckets[currentBucket] = removeValues(buckets[currentBucket], moduleSet);
  }

  if (bucketName && buckets[bucketName]) {
    for (const moduleId of moduleIds) {
      if (!buckets[bucketName].includes(moduleId)) {
        buckets[bucketName].push(moduleId);
      }
    }
  }

  sortCapabilityRatingBuckets(ratings);
  recomputeCapabilityRatingCounts(ratings);
}

function getCapabilityRatingBucketForModule(ratings, moduleId) {
  const buckets = normalizeCapabilityRatingBuckets(ratings);
  for (const bucketName of CAPABILITY_RATING_BUCKET_SEQUENCE) {
    if (buckets[bucketName].includes(moduleId)) {
      return bucketName;
    }
  }
  return null;
}

function normalizeSkillLevelSummary(summary) {
  const nextSummary = summary && typeof summary === 'object' && !Array.isArray(summary)
    ? { ...summary }
    : {};

  if (!nextSummary.source) {
    nextSummary.source = DEFAULT_SKILL_LEVEL_SUMMARY_SOURCE;
  }

  for (const bucketName of SKILL_LEVEL_SUMMARY_BUCKETS) {
    nextSummary[bucketName] = Array.isArray(nextSummary[bucketName])
      ? [...new Set(nextSummary[bucketName].map((item) => String(item || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      : [];
  }

  nextSummary.counts = {
    'top-level-enough-now': nextSummary['top-level-enough-now'].length,
    'strong-uplift-but-not-top-yet': nextSummary['strong-uplift-but-not-top-yet'].length,
    'useful-overlay-not-top-level-alone': nextSummary['useful-overlay-not-top-level-alone'].length,
    'total-skills-rated': nextSummary['top-level-enough-now'].length
      + nextSummary['strong-uplift-but-not-top-yet'].length
      + nextSummary['useful-overlay-not-top-level-alone'].length,
    'stable-overdue': Number(nextSummary.counts && nextSummary.counts['stable-overdue'] || 0),
    'stable-missing-metadata': Number(nextSummary.counts && nextSummary.counts['stable-missing-metadata'] || 0),
    'stable-expert-source-blocked': Number(nextSummary.counts && nextSummary.counts['stable-expert-source-blocked'] || 0),
    'stable-blocked-total': Number(nextSummary.counts && nextSummary.counts['stable-blocked-total'] || 0)
  };

  return nextSummary;
}

function buildReviewEntryMap(skillRecords, options = {}) {
  const reviewEntries = Array.isArray(options.reviewQueueData && options.reviewQueueData.skills)
    ? options.reviewQueueData.skills
    : buildReviewQueueEntries(skillRecords, { now: options.now });

  return new Map(
    reviewEntries.map((entry) => [String(entry && entry.skill || '').trim(), entry])
  );
}

function resolveSkillLevelSummaryBucket(record, reviewEntryMap, options = {}) {
  const bucket = getSkillLevelBucketForStatus(record.status) || null;
  if (bucket !== 'top-level-enough-now') {
    return bucket;
  }

  const reviewEntry = reviewEntryMap.get(String(record && record.name || '').trim()) || null;
  const reviewStatus = String(reviewEntry && reviewEntry['review-status'] || '').trim();
  if (SKILL_LEVEL_SUMMARY_BLOCKING_REVIEW_STATUSES.has(reviewStatus)) {
    return 'strong-uplift-but-not-top-yet';
  }

  const expertSourceBlockersBySkill = options.expertSourceBlockersBySkill instanceof Map
    ? options.expertSourceBlockersBySkill
    : new Map();
  if ((expertSourceBlockersBySkill.get(String(record && record.name || '').trim()) || []).length > 0) {
    return 'strong-uplift-but-not-top-yet';
  }

  return bucket;
}

function summarizeBlockingReviewDebt(skillRecords, options = {}) {
  const reviewEntryMap = buildReviewEntryMap(skillRecords, options);
  let stableOverdue = 0;
  let stableMissingMetadata = 0;
  let stableExpertSourceBlocked = 0;
  const expertSourceBlockersBySkill = options.expertSourceBlockersBySkill instanceof Map
    ? options.expertSourceBlockersBySkill
    : new Map();

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (!record || getSkillLevelBucketForStatus(record.status) !== 'top-level-enough-now') {
      continue;
    }
    const reviewEntry = reviewEntryMap.get(String(record.name || '').trim()) || null;
    const reviewStatus = String(reviewEntry && reviewEntry['review-status'] || '').trim();
    if (reviewStatus === 'overdue') {
      stableOverdue += 1;
    } else if (reviewStatus === 'missing-metadata') {
      stableMissingMetadata += 1;
    }
    if ((expertSourceBlockersBySkill.get(String(record.name || '').trim()) || []).length > 0) {
      stableExpertSourceBlocked += 1;
    }
  }

  return {
    'stable-overdue': stableOverdue,
    'stable-missing-metadata': stableMissingMetadata,
    'stable-expert-source-blocked': stableExpertSourceBlocked,
    'stable-blocked-total': stableOverdue + stableMissingMetadata + stableExpertSourceBlocked
  };
}

function buildSkillLevelSummary(skillRecords, existingSummary, options = {}) {
  const baseSummary = normalizeSkillLevelSummary(existingSummary);
  const summary = {
    source: baseSummary.source,
    'top-level-enough-now': [],
    'strong-uplift-but-not-top-yet': [],
    'useful-overlay-not-top-level-alone': []
  };
  const reviewEntryMap = buildReviewEntryMap(skillRecords, options);

  for (const record of Array.isArray(skillRecords) ? skillRecords : []) {
    if (!shouldAppearInSkillLevelSummary(record)) {
      continue;
    }
    const bucket = resolveSkillLevelSummaryBucket(record, reviewEntryMap, options);
    if (!bucket) {
      continue;
    }
    summary[bucket].push(record.name);
  }

  const normalized = normalizeSkillLevelSummary(summary);
  normalized.counts = {
    ...normalized.counts,
    ...summarizeBlockingReviewDebt(skillRecords, options)
  };
  return normalized;
}

function buildCapabilityModuleMetadataMapFromRegistry(registryData) {
  const groups = Array.isArray(registryData && registryData['module-groups']) ? registryData['module-groups'] : [];
  const metadata = new Map();

  for (const group of groups) {
    const modules = Array.isArray(group && group.modules) ? group.modules : [];
    for (const module of modules) {
      const moduleId = String(module && module.id || '').trim();
      if (!moduleId) continue;
      metadata.set(moduleId, {
        'host-skill': String(group && group['host-skill'] || '').trim(),
        'host-kind': String(group && group['host-kind'] || '').trim(),
        path: String(module && module.path || '').trim(),
        capability: String(module && module.capability || '').trim()
      });
    }
  }

  return metadata;
}

function buildCapabilityRatingsNextBatch(ratingsData, moduleMetadata = new Map()) {
  const buckets = normalizeCapabilityRatingBuckets(ratingsData);
  const nextBatch = [];

  for (const bucketName of CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE) {
    const policy = CAPABILITY_NEXT_BATCH_POLICY_BY_BUCKET[bucketName];
    for (const moduleId of buckets[bucketName]) {
      const metadata = moduleMetadata.get(moduleId) || {};
      nextBatch.push({
        scope: 'capability-module',
        module: moduleId,
        'host-skill': metadata['host-skill'] || '',
        'host-kind': metadata['host-kind'] || '',
        rating: bucketName,
        priority: policy.priority,
        ...(metadata.path ? { path: metadata.path } : {}),
        ...(metadata.capability ? { capability: metadata.capability } : {}),
        'next-step': policy['next-step']
      });
    }
  }

  return nextBatch;
}

function buildCapabilityRatingsNotes(ratingsData, context = {}) {
  const moduleCounts = ratingsData && ratingsData.counts ? ratingsData.counts : {};
  const skillCounts = ratingsData && ratingsData['skill-level-summary'] && ratingsData['skill-level-summary'].counts
    ? ratingsData['skill-level-summary'].counts
    : {};

  const topModules = Number(moduleCounts['top-ready'] || 0);
  const totalModules = Number(moduleCounts.total || 0);
  const topSkills = Number(skillCounts['top-level-enough-now'] || 0);
  const strongSkills = Number(skillCounts['strong-uplift-but-not-top-yet'] || 0);
  const overlaySkills = Number(skillCounts['useful-overlay-not-top-level-alone'] || 0);
  const totalSkills = Number(skillCounts['total-skills-rated'] || 0);

  const allModulesTopReady = topModules === totalModules;
  const allTopLevel = strongSkills === 0 && overlaySkills === 0 && topSkills === totalSkills;
  const reviewDebt = summarizeBlockingReviewDebt(context.skillRecords, context);

  const notes = [
    'This file rates capability modules, not whole skills.',
    allModulesTopReady
      ? `All ${topModules} currently registered capability modules are TOP-ready in the current governed frame.`
      : 'Current capability-module portfolio spans TOP-ready, strong-but-not-top, and thin buckets under the governed frame.',
    allTopLevel
      ? `After the latest uplift round, all ${topSkills} registered host skills are rated top-level enough under the weak-model-uplift standard.`
      : 'Current host skills are split across the top-level, strong-uplift, and overlay buckets under the weak-model-uplift standard.'
  ];

  if (reviewDebt['stable-blocked-total'] > 0) {
    const reasons = [];
    if (reviewDebt['stable-overdue'] > 0) {
      reasons.push(`${reviewDebt['stable-overdue']} overdue review cadence`);
    }
    if (reviewDebt['stable-missing-metadata'] > 0) {
      reasons.push(`${reviewDebt['stable-missing-metadata']} missing review metadata`);
    }
    if (reviewDebt['stable-expert-source-blocked'] > 0) {
      reasons.push(`${reviewDebt['stable-expert-source-blocked']} expert-source governance blocker`);
    }
    notes.push(
      `${reviewDebt['stable-blocked-total']} stable skills are temporarily outside 'top-level-enough-now' because of ${reasons.join(' and ')}.`
    );
  }

  return notes;
}

function applyCapabilityRatingsGovernance(ratingsData, context = {}) {
  const ratings = ratingsData && typeof ratingsData === 'object' && !Array.isArray(ratingsData)
    ? ratingsData
    : {};

  sortCapabilityRatingBuckets(ratings);
  recomputeCapabilityRatingCounts(ratings);

  const expertSourceTopTierState = context.expertSourceTopTierState
    || (context.bundleRoot && context.registryData
      ? buildExpertSourceTopTierBlockerMap(context.bundleRoot, context.registryData, {
          integrations: context.expertSourceIntegrations
        })
      : { blockersBySkill: new Map() });

  if (Array.isArray(context.skillRecords)) {
    ratings['skill-level-summary'] = buildSkillLevelSummary(context.skillRecords, ratings['skill-level-summary'], {
      ...context,
      expertSourceBlockersBySkill: expertSourceTopTierState.blockersBySkill
    });
  } else {
    ratings['skill-level-summary'] = normalizeSkillLevelSummary(ratings['skill-level-summary']);
  }

  const moduleMetadata = context.moduleMetadata instanceof Map
    ? context.moduleMetadata
    : buildCapabilityModuleMetadataMapFromRegistry(context.registryData || {});
  ratings['next-batch'] = buildCapabilityRatingsNextBatch(ratings, moduleMetadata);
  ratings.notes = buildCapabilityRatingsNotes(ratings, {
    ...context,
    expertSourceBlockersBySkill: expertSourceTopTierState.blockersBySkill
  });

  return ratings;
}

function renderCapabilityModuleSection(values) {
  const modules = Array.isArray(values) ? values : [];
  if (modules.length < 1) {
    return EMPTY_CAPABILITY_MODULE_SECTION_LINE;
  }
  return modules.map((moduleId) => `- \`${moduleId}\``).join('\n');
}

function renderCapabilityNextBatchSection(values) {
  const queue = Array.isArray(values) ? values : [];
  if (queue.length < 1) {
    return EMPTY_NEXT_BATCH_LINE;
  }

  return queue.map((item) => {
    const moduleId = String(item && item.module || '').trim() || 'unknown-module';
    const hostSkill = String(item && item['host-skill'] || '').trim() || 'unknown-skill';
    const rating = String(item && item.rating || '').trim() || 'unknown-rating';
    const nextStep = String(item && item['next-step'] || '').trim() || 'fill in the next promotion step';
    return `- \`${moduleId}\` (\`${hostSkill}\`, \`${rating}\`): ${nextStep}`;
  }).join('\n');
}

function buildCapabilityRatingsDocSnapshot(ratingsData) {
  const moduleCounts = ratingsData && ratingsData.counts ? ratingsData.counts : {};
  const skillCounts = ratingsData && ratingsData['skill-level-summary'] && ratingsData['skill-level-summary'].counts
    ? ratingsData['skill-level-summary'].counts
    : {};

  const topSkills = Number(skillCounts['top-level-enough-now'] || 0);
  const strongSkills = Number(skillCounts['strong-uplift-but-not-top-yet'] || 0);
  const overlaySkills = Number(skillCounts['useful-overlay-not-top-level-alone'] || 0);
  const totalSkills = Number(skillCounts['total-skills-rated'] || 0);
  const topModules = Number(moduleCounts['top-ready'] || 0);
  const strongModules = Number(moduleCounts['strong-but-not-top'] || 0);
  const thinModules = Number(moduleCounts.thin || 0);
  const totalModules = Number(moduleCounts.total || 0);

  const allTopLevel = strongSkills === 0 && overlaySkills === 0 && topSkills === totalSkills;
  const allModulesTopReady = topModules === totalModules;

  return {
    counts: {
      topSkills,
      strongSkills,
      overlaySkills,
      totalSkills,
      topModules,
      strongModules,
      thinModules,
      totalModules
    },
    skillVerdict: allTopLevel
      ? 'After the latest uplift round, every currently registered host skill is rated top-level enough under the weak-model-uplift standard.'
      : 'Current host skills are split across the top-level, strong-uplift, and overlay buckets under the weak-model-uplift standard.',
    moduleVerdict: allModulesTopReady
      ? `- all ${topModules} registered capability modules are TOP-ready`
      : `- ${topModules} of ${totalModules} registered capability modules are TOP-ready`,
    hostVerdict: allTopLevel
      ? `- all ${totalSkills} registered host skills are now rated top-level enough`
      : `- ${topSkills} of ${totalSkills} registered host skills are top-level enough right now`,
    nextBatchSection: renderCapabilityNextBatchSection(ratingsData && ratingsData['next-batch']),
    topReadySection: renderCapabilityModuleSection((((ratingsData || {})['rating-buckets'] || {})['top-ready']) || []),
    strongButNotTopSection: renderCapabilityModuleSection((((ratingsData || {})['rating-buckets'] || {})['strong-but-not-top']) || []),
    thinSection: renderCapabilityModuleSection((((ratingsData || {})['rating-buckets'] || {}).thin) || [])
  };
}

function replaceLine(text, pattern, nextLine) {
  if (!pattern.test(text)) {
    return text;
  }
  return text.replace(pattern, `${nextLine}`);
}

function replaceMarkdownSection(text, heading, body) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(## ${escaped}\\n\\n)([\\s\\S]*?)(?=\\n## |\\s*$)`);
  if (!pattern.test(text)) {
    return text;
  }
  return text.replace(pattern, (_, prefix) => `${prefix}${String(body || '').trimEnd()}\n`);
}

function updateCapabilityRatingsDocText(text, ratingsData) {
  const snapshot = buildCapabilityRatingsDocSnapshot(ratingsData);
  let nextText = String(text || '');

  nextText = replaceLine(nextText, /^- TOP-ready modules:\s*\d+$/m, `- TOP-ready modules: ${snapshot.counts.topModules}`);
  nextText = replaceLine(nextText, /^- strong-but-not-top modules:\s*\d+$/m, `- strong-but-not-top modules: ${snapshot.counts.strongModules}`);
  nextText = replaceLine(nextText, /^- thin modules:\s*\d+$/m, `- thin modules: ${snapshot.counts.thinModules}`);
  nextText = replaceLine(nextText, /^- total rated capability modules:\s*\d+$/m, `- total rated capability modules: ${snapshot.counts.totalModules}`);
  nextText = replaceLine(nextText, /^- top-level enough now:\s*\d+$/m, `- top-level enough now: ${snapshot.counts.topSkills}`);
  nextText = replaceLine(nextText, /^- strong uplift, but not top yet:\s*\d+$/m, `- strong uplift, but not top yet: ${snapshot.counts.strongSkills}`);
  nextText = replaceLine(nextText, /^- useful overlay, not top-level alone:\s*\d+$/m, `- useful overlay, not top-level alone: ${snapshot.counts.overlaySkills}`);

  nextText = replaceLine(
    nextText,
    /^(After the latest uplift round,.*|Current host skills are split across the top-level, strong-uplift, and overlay buckets under the weak-model-uplift standard\.)$/m,
    snapshot.skillVerdict
  );
  nextText = replaceLine(
    nextText,
    /^- all \d+ registered capability modules are TOP-ready$/m,
    snapshot.moduleVerdict
  );
  nextText = replaceLine(
    nextText,
    /^- \d+ of \d+ registered capability modules are TOP-ready$/m,
    snapshot.moduleVerdict
  );
  nextText = replaceLine(
    nextText,
    /^- all \d+ registered host skills are now rated top-level enough$/m,
    snapshot.hostVerdict
  );
  nextText = replaceLine(
    nextText,
    /^- \d+ of \d+ registered host skills are top-level enough right now$/m,
    snapshot.hostVerdict
  );

  nextText = replaceMarkdownSection(nextText, 'Next Batch', snapshot.nextBatchSection);
  nextText = replaceMarkdownSection(nextText, 'TOP-ready', snapshot.topReadySection);
  nextText = replaceMarkdownSection(nextText, 'Strong But Not Top', snapshot.strongButNotTopSection);
  nextText = replaceMarkdownSection(nextText, 'Thin', snapshot.thinSection);

  return nextText;
}

function syncCapabilityRatingsDoc(bundleRoot, ratingsData) {
  const docPath = getCapabilityRatingsDocPath(bundleRoot);
  if (!fs.existsSync(docPath)) {
    return null;
  }

  let text = fs.readFileSync(docPath, 'utf8');
  text = updateCapabilityRatingsDocText(text, ratingsData);
  fs.writeFileSync(docPath, text, 'utf8');
  return docPath;
}

function getCapabilityModuleRatingsForSkill(ratings, moduleIds) {
  return (Array.isArray(moduleIds) ? moduleIds : []).map((moduleId) => ({
    module: moduleId,
    rating: getCapabilityRatingBucketForModule(ratings, moduleId) || 'unrated'
  }));
}

function buildCapabilityModuleTopReadyBlockers(ratings, moduleIds) {
  return getCapabilityModuleRatingsForSkill(ratings, moduleIds)
    .filter((item) => item.rating !== 'top-ready')
    .map((item) => ({
      type: 'capability-module-rating',
      module: item.module,
      rating: item.rating,
      message: `capability module '${item.module}' must be rated 'top-ready'`
    }));
}

module.exports = {
  CAPABILITY_RATING_BUCKET_SEQUENCE,
  CAPABILITY_RATING_BUCKET_INDEX,
  CAPABILITY_NEXT_BATCH_BUCKET_SEQUENCE,
  CAPABILITY_NEXT_BATCH_POLICY_BY_BUCKET,
  SKILL_LEVEL_SUMMARY_BUCKETS,
  SKILL_LEVEL_SUMMARY_BLOCKING_REVIEW_STATUSES,
  EMPTY_NEXT_BATCH_LINE,
  EMPTY_CAPABILITY_MODULE_SECTION_LINE,
  DEFAULT_SKILL_LEVEL_SUMMARY_SOURCE,
  CAPABILITY_RATINGS_DOC_RELATIVE_PATH,
  STABLE_TOP_TIER_BLOCKER_COUNT_FIELDS,
  getCapabilityRatingsPath,
  getCapabilityRatingsDocPath,
  normalizeCapabilityRatingBuckets,
  recomputeCapabilityRatingCounts,
  syncCapabilityRatingsForModules,
  getCapabilityRatingBucketForModule,
  normalizeSkillLevelSummary,
  buildSkillLevelSummary,
  summarizeBlockingReviewDebt,
  buildCapabilityModuleMetadataMapFromRegistry,
  buildCapabilityRatingsNextBatch,
  buildCapabilityRatingsNotes,
  applyCapabilityRatingsGovernance,
  renderCapabilityModuleSection,
  renderCapabilityNextBatchSection,
  buildCapabilityRatingsDocSnapshot,
  updateCapabilityRatingsDocText,
  syncCapabilityRatingsDoc,
  getCapabilityModuleRatingsForSkill,
  buildCapabilityModuleTopReadyBlockers
};
