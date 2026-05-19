'use strict';

const fs = require('fs');
const path = require('path');
const {
  REQUIRED_FRONTMATTER_KEYS,
  MIN_REFERENCE_FILES_BY_KIND,
  rel,
  readUtf8,
  walkSkillFiles,
  parseFrontmatter,
  parseJsonFile,
  listMarkdownFiles,
  getSmokeManifestFile,
  readReferencePaths,
  readBulletSectionItems,
  expectedKindFromPath
} = require('./skill-system-common');
const {
  validateSmokeManifest
} = require('./skill-smoke-manifest-governance');
const {
  isKnownSkillVisibility,
  isKnownSkillTriggerMode,
  isKnownSkillRuntime,
  isKnownSkillExecutor,
  isKnownSkillRiskLevel,
  isKnownSupportedHost
} = require('./skill-frontmatter-governance');
const {
  normalizeHostSmokeTier,
  normalizeHostSmokeTargetLevel,
  normalizeHostSmokeFreshnessDays,
  deriveHostSmokePolicyFromRecord,
  isGovernedRuntimeProofRecord
} = require('./skill-host-governance');
const {
  OPENAI_METADATA_KEYS,
  buildOpenAiMetadata,
  readOpenAiMetadataFile
} = require('./skill-system-host-metadata');
const {
  normalizeReviewDate,
  normalizeReviewCycleDays,
  normalizeReviewOwner,
  deriveReviewSchedule
} = require('./skill-review-governance');
const {
  isKnownSkillStatus,
  isReviewGovernedSkillStatus
} = require('./skill-lifecycle-governance');
const {
  MIN_RUNTIME_PROOF_CONTRACTS
} = require('./skill-runtime-proof-governance');
const {
  SCAFFOLD_ORIGIN_FIELD,
  SCAFFOLD_VERSION_FIELD,
  readTemplateLineage
} = require('./skill-system-templates');
const {
  TOP_TIER_REFERENCE_FLOOR_BY_KIND,
  shouldTrackScaffoldLineage
} = require('./skill-kind-governance');

function normalizeStringList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function getScaffoldDriftStatus(record = {}) {
  const scaffoldOrigin = String(record.scaffoldOrigin || '').trim();
  const scaffoldVersion = Number.isInteger(record.scaffoldVersion) && record.scaffoldVersion > 0
    ? record.scaffoldVersion
    : null;
  const canonicalScaffoldOrigin = String(record.canonicalScaffoldOrigin || '').trim();
  const canonicalScaffoldVersion = Number.isInteger(record.canonicalScaffoldVersion) && record.canonicalScaffoldVersion > 0
    ? record.canonicalScaffoldVersion
    : null;

  if (!scaffoldOrigin || scaffoldVersion == null) {
    return 'missing-lineage';
  }
  if (canonicalScaffoldOrigin && scaffoldOrigin !== canonicalScaffoldOrigin) {
    return 'origin-mismatch';
  }
  if (canonicalScaffoldVersion != null && scaffoldVersion < canonicalScaffoldVersion) {
    return 'behind-template';
  }
  if (canonicalScaffoldVersion != null && scaffoldVersion > canonicalScaffoldVersion) {
    return 'ahead-of-template';
  }
  return 'current';
}

function validateSkillFile(skillFile, targetDir, skillsRoot, findings) {
  const text = readUtf8(skillFile);
  const relative = rel(targetDir, skillFile);
  if (text == null) {
    findings.push({ severity: 'error', file: relative, message: 'skill file is unreadable as utf8 text' });
    return null;
  }
  if (text.includes('\uFFFD')) {
    findings.push({ severity: 'warning', file: relative, message: 'replacement character detected; encoding may have been damaged' });
  }

  const parsed = parseFrontmatter(text);
  if (parsed.error) {
    findings.push({ severity: 'error', file: relative, message: `frontmatter error: ${parsed.error}` });
    return null;
  }

  const data = parsed.data;
  const templateLineage = readTemplateLineage(targetDir, data.kind);
  const scaffoldOrigin = String(data[SCAFFOLD_ORIGIN_FIELD] || '').trim();
  const scaffoldVersion = Number(data[SCAFFOLD_VERSION_FIELD]);
  const normalizedScaffoldOrigin = scaffoldOrigin || null;
  const normalizedScaffoldVersion = Number.isInteger(scaffoldVersion) && scaffoldVersion > 0
    ? scaffoldVersion
    : null;
  const scaffoldDriftStatus = shouldTrackScaffoldLineage(data.kind)
    ? getScaffoldDriftStatus({
        scaffoldOrigin: normalizedScaffoldOrigin,
        scaffoldVersion: normalizedScaffoldVersion,
        canonicalScaffoldOrigin: templateLineage ? templateLineage.origin : null,
        canonicalScaffoldVersion: templateLineage ? templateLineage.version : null
      })
    : null;
  const stableLike = data.status === 'stable';
  const deprecatedLike = data.status === 'deprecated';
  const liveGoverned = isReviewGovernedSkillStatus(data.status);
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!(key in data)) {
      findings.push({ severity: 'error', file: relative, message: `missing frontmatter key '${key}'` });
    }
  }

  if ('visibility' in data && !isKnownSkillVisibility(data.visibility)) {
    findings.push({ severity: 'error', file: relative, message: `visibility '${data.visibility}' is not supported` });
  }

  if ('runtime' in data && !isKnownSkillRuntime(data.runtime)) {
    findings.push({ severity: 'error', file: relative, message: `runtime '${data.runtime}' is not supported` });
  }

  if ('executor' in data && !isKnownSkillExecutor(data.executor)) {
    findings.push({ severity: 'error', file: relative, message: `executor '${data.executor}' is not supported` });
  }

  if ('risk-level' in data && !isKnownSkillRiskLevel(data['risk-level'])) {
    findings.push({ severity: 'error', file: relative, message: `risk-level '${data['risk-level']}' is not supported` });
  }

  if ('status' in data && !isKnownSkillStatus(data.status)) {
    findings.push({ severity: 'error', file: relative, message: `status '${data.status}' is not supported` });
  }

  const triggerModes = Array.isArray(data['trigger-mode']) ? data['trigger-mode'] : [];
  for (const triggerMode of triggerModes) {
    if (!isKnownSkillTriggerMode(triggerMode)) {
      findings.push({ severity: 'error', file: relative, message: `trigger-mode '${triggerMode}' is not supported` });
    }
  }

  const supportedHosts = Array.isArray(data['supported-hosts']) ? data['supported-hosts'] : [];
  for (const host of supportedHosts) {
    if (!isKnownSupportedHost(host)) {
      findings.push({ severity: 'error', file: relative, message: `supported-host '${host}' is not declared in frontmatter governance` });
    }
  }

  const expectedKind = expectedKindFromPath(skillFile, skillsRoot);
  if (expectedKind && data.kind && data.kind !== expectedKind) {
    findings.push({ severity: 'warning', file: relative, message: `kind '${data.kind}' does not match layer expectation '${expectedKind}'` });
  }

  const smokeManifestFile = getSmokeManifestFile(path.dirname(skillFile));
  const smokeManifest = parseJsonFile(smokeManifestFile);

  if (data['user-invocable'] === true) {
    const triggerKeywords = Array.isArray(data['trigger-keywords']) ? data['trigger-keywords'] : [];
    if (triggerKeywords.length === 0 && !(Array.isArray(data['trigger-mode']) && data['trigger-mode'].includes('manual'))) {
      findings.push({ severity: 'warning', file: relative, message: 'public skill has no trigger keywords' });
    }
    if (Array.isArray(data['trigger-mode']) && data['trigger-mode'].includes('auto') && triggerKeywords.length < 2) {
      findings.push({ severity: 'warning', file: relative, message: 'auto-triggered skill has a weak keyword surface' });
    }
    if (typeof data.description === 'string' && !/use when/i.test(data.description)) {
      findings.push({ severity: 'info', file: relative, message: 'description does not contain explicit trigger guidance such as "Use when"' });
    }
    if (stableLike) {
      const concreteKeywords = triggerKeywords.filter((keyword) => !/-signal$|-trigger$/i.test(String(keyword || '')));
      if (concreteKeywords.length < 2) {
        findings.push({ severity: 'warning', file: relative, message: 'stable skill should expose at least two concrete trigger keywords' });
      }
    }
  }

  if (data.runtime === 'scripted') {
    const scriptPath = path.join(path.dirname(skillFile), 'scripts', 'run.js');
    if (!fs.existsSync(scriptPath)) {
      findings.push({ severity: 'error', file: relative, message: 'scripted runtime declared but scripts/run.js is missing' });
    }
    if (stableLike) {
      if (!fs.existsSync(smokeManifestFile)) {
        findings.push({
          severity: 'warning',
          file: relative,
          message: 'stable scripted skill should declare scripts/smoke.json so host-smoked promotion has an executable contract surface'
        });
      } else if (smokeManifest.error) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, smokeManifestFile),
          message: `smoke manifest parse failed: ${smokeManifest.error}`
        });
      } else {
        for (const error of validateSmokeManifest(smokeManifest.data)) {
          findings.push({
            severity: 'error',
            file: rel(targetDir, smokeManifestFile),
            message: error
          });
        }
        const smokeText = JSON.stringify(smokeManifest.data);
        if (/tool-template|guard-template|Replace this stub/i.test(smokeText)) {
          findings.push({
            severity: 'error',
            file: rel(targetDir, smokeManifestFile),
            message: 'stable scripted skill smoke manifest still contains template placeholder content'
          });
        }
      }
    }
    if (stableLike) {
      const proofItems = readBulletSectionItems(text, 'Runtime Proof');
      if (proofItems.length < MIN_RUNTIME_PROOF_CONTRACTS) {
        findings.push({
          severity: 'warning',
          file: relative,
          message: 'stable scripted skill should declare at least two runtime proof bullets in a Runtime Proof section'
        });
      }
    }
  }

  const hostSmokeGoverned = isGovernedRuntimeProofRecord({
    kind: data.kind,
    runtime: data.runtime,
    status: data.status
  });
  const hostSmokeTier = normalizeHostSmokeTier(data['host-smoke-tier']);
  const hostSmokeTargetLevel = normalizeHostSmokeTargetLevel(data['host-smoke-target-level']);
  const hostSmokeFreshnessDays = normalizeHostSmokeFreshnessDays(data['host-smoke-freshness-days']);
  const hostSmokePolicy = hostSmokeGoverned
    ? deriveHostSmokePolicyFromRecord({
        status: data.status,
        hostSmokeTier: data['host-smoke-tier'],
        hostSmokeTargetLevel: data['host-smoke-target-level'],
        hostSmokeFreshnessDays: data['host-smoke-freshness-days']
      })
    : null;

  if (hostSmokeGoverned) {
    const governanceSeverity = stableLike ? 'error' : 'warning';
    if (data['host-smoke-tier'] == null || String(data['host-smoke-tier']).trim() === '') {
      findings.push({
        severity: governanceSeverity,
        file: relative,
        message: `${data.status} scripted ${data.kind} should declare host-smoke-tier`
      });
    } else if (!hostSmokeTier) {
      findings.push({
        severity: 'error',
        file: relative,
        message: `host-smoke-tier '${data['host-smoke-tier']}' is not supported`
      });
    }

    if (data['host-smoke-target-level'] == null || String(data['host-smoke-target-level']).trim() === '') {
      findings.push({
        severity: governanceSeverity,
        file: relative,
        message: `${data.status} scripted ${data.kind} should declare host-smoke-target-level`
      });
    } else if (!hostSmokeTargetLevel) {
      findings.push({
        severity: 'error',
        file: relative,
        message: `host-smoke-target-level '${data['host-smoke-target-level']}' is not supported`
      });
    }

    if (hostSmokeTier === 'critical' && hostSmokeTargetLevel && hostSmokeTargetLevel !== 'host-smoked') {
      findings.push({
        severity: 'error',
        file: relative,
        message: `critical host-smoke policy for '${data.name}' must target 'host-smoked'`
      });
    }

    if (hostSmokeTargetLevel === 'host-smoked') {
      if (hostSmokeFreshnessDays == null) {
        findings.push({
          severity: 'error',
          file: relative,
          message: `host-smoke-target-level 'host-smoked' for '${data.name}' requires host-smoke-freshness-days`
        });
      }

      if (fs.existsSync(smokeManifestFile) && !smokeManifest.error && smokeManifest.data) {
        const manifestFreshness = smokeManifest.data.freshness || null;
        if (!manifestFreshness || manifestFreshness['max-age'] !== hostSmokeFreshnessDays || manifestFreshness.unit !== 'days') {
          findings.push({
            severity: 'error',
            file: rel(targetDir, smokeManifestFile),
            message: `host-smoke freshness for '${data.name}' must match host-smoke-freshness-days using unit 'days'`
          });
        }
      }
    }

    if (hostSmokeFreshnessDays != null && hostSmokeTargetLevel && hostSmokeTargetLevel !== 'host-smoked') {
      findings.push({
        severity: 'warning',
        file: relative,
        message: `host-smoke-freshness-days is ignored unless host-smoke-target-level is 'host-smoked'`
      });
    }
  }

  if (data.runtime === 'knowledge') {
    const scriptPath = path.join(path.dirname(skillFile), 'scripts', 'run.js');
    if (fs.existsSync(scriptPath)) {
      findings.push({ severity: 'warning', file: relative, message: 'knowledge runtime declares no executor but scripts/run.js exists' });
    }
  }

  if (liveGoverned && !data['last-reviewed']) {
    findings.push({ severity: 'warning', file: relative, message: `status '${data.status}' should declare last-reviewed` });
  }

  if (liveGoverned && !data['review-cycle-days']) {
    findings.push({ severity: 'warning', file: relative, message: `status '${data.status}' should declare review-cycle-days` });
  }

  if (data['last-reviewed'] && data['review-cycle-days'] && data.status !== 'archived') {
    const reviewSchedule = deriveReviewSchedule(data['last-reviewed'], data['review-cycle-days']);
    if (reviewSchedule['review-status'] === 'overdue' && reviewSchedule['next-review-due']) {
      findings.push({
        severity: 'warning',
        file: relative,
        message: `review cadence expired on ${reviewSchedule['next-review-due']} for status '${data.status}'`
      });
    }
  }

  for (const refPath of readReferencePaths(text)) {
    if (!fs.existsSync(path.join(path.dirname(skillFile), refPath))) {
      findings.push({ severity: 'warning', file: relative, message: `declared reference '${refPath}' does not exist` });
    }
  }

  const expectedReferenceCount = MIN_REFERENCE_FILES_BY_KIND[data.kind] || 0;
  if (expectedReferenceCount > 0) {
    const referenceDir = path.join(path.dirname(skillFile), 'references');
    const referenceFiles = listMarkdownFiles(referenceDir);
    if (referenceFiles.length < expectedReferenceCount) {
      findings.push({
        severity: 'warning',
        file: relative,
        message: `kind '${data.kind}' only has ${referenceFiles.length} reference files; expected at least ${expectedReferenceCount}`
      });
    }
    const stableReferenceFloor = TOP_TIER_REFERENCE_FLOOR_BY_KIND[data.kind] || expectedReferenceCount;
    if (stableLike && referenceFiles.length < stableReferenceFloor) {
      findings.push({
        severity: 'warning',
        file: relative,
        message: `stable skill only has ${referenceFiles.length} reference files; expected at least ${stableReferenceFloor} for top-tier depth`
      });
    }
  }

  if (stableLike) {
    if (/template scaffold/i.test(String(data.description || ''))) {
      findings.push({ severity: 'error', file: relative, message: 'stable skill still looks like a template scaffold' });
    }
    if (/TODO:/i.test(String(data.description || ''))) {
      findings.push({ severity: 'error', file: relative, message: 'stable skill description still contains TODO placeholder text' });
    }
    if (/-template$/.test(String(data.name || ''))) {
      findings.push({ severity: 'error', file: relative, message: 'stable skill name still looks like a template artifact' });
    }
  }

  if (shouldTrackScaffoldLineage(data.kind)) {
    if (scaffoldDriftStatus === 'missing-lineage') {
      const severity = data.status === 'draft' ? 'warning' : 'info';
      findings.push({
        severity,
        file: relative,
        message: `skill is missing scaffold lineage metadata ('${SCAFFOLD_ORIGIN_FIELD}' and '${SCAFFOLD_VERSION_FIELD}')`
      });
    } else if (templateLineage && scaffoldDriftStatus === 'origin-mismatch') {
      findings.push({
        severity: 'warning',
        file: relative,
        message: `skill scaffold-origin '${scaffoldOrigin}' does not match canonical ${data.kind} template '${templateLineage.origin}'`
      });
    } else if (templateLineage && scaffoldDriftStatus === 'ahead-of-template') {
      findings.push({
        severity: 'error',
        file: relative,
        message: `skill scaffold-version '${scaffoldVersion}' is ahead of canonical ${data.kind} template version '${templateLineage.version}'`
      });
    } else if (templateLineage && scaffoldDriftStatus === 'behind-template') {
      findings.push({
        severity: data.status === 'stable' ? 'warning' : 'info',
        file: relative,
        message: `skill scaffold-version '${scaffoldVersion}' is behind canonical ${data.kind} template version '${templateLineage.version}'`
      });
    }
  }

  const openAiMetadataPath = path.join(path.dirname(skillFile), 'agents', 'openai.yaml');
  const hasHostMetadata = fs.existsSync(openAiMetadataPath);
  if (hasHostMetadata) {
    const parsedOpenAiMetadata = readOpenAiMetadataFile(openAiMetadataPath);
    if (parsedOpenAiMetadata.error) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, openAiMetadataPath),
        message: `agents/openai.yaml parse failed: ${parsedOpenAiMetadata.error}`
      });
    } else {
      const expectedOpenAiMetadata = buildOpenAiMetadata({
        name: data.name,
        title: data.title,
        description: data.description,
        kind: data.kind,
        skillRelPath: rel(skillsRoot, path.dirname(skillFile))
      });
      for (const key of OPENAI_METADATA_KEYS) {
        if (normalizeValue(parsedOpenAiMetadata.data[key]) !== normalizeValue(expectedOpenAiMetadata[key])) {
          findings.push({
            severity: stableLike ? 'error' : 'warning',
            file: rel(targetDir, openAiMetadataPath),
            message: `agents/openai.yaml '${key}' is out of sync with SKILL.md`
          });
        }
      }
    }
  } else if (stableLike) {
    findings.push({
      severity: 'warning',
      file: relative,
      message: 'stable skill is missing agents/openai.yaml host metadata'
    });
  }

  return {
    name: data.name,
    kind: data.kind,
    userInvocable: data['user-invocable'] === true,
    status: data.status,
    owner: normalizeReviewOwner(data.owner, ''),
    runtime: data.runtime,
    priority: Number.isInteger(data.priority) ? data.priority : null,
    supportedHosts: normalizeStringList(data['supported-hosts']),
    triggerMode: normalizeStringList(data['trigger-mode']),
    triggerKeywords: normalizeStringList(data['trigger-keywords']),
    negativeKeywords: normalizeStringList(data['negative-keywords']),
    aliases: normalizeStringList(data.aliases),
    autoChain: normalizeStringList(data['auto-chain']),
    conflictsWith: normalizeStringList(data['conflicts-with']),
    hostSmokeTier: data['host-smoke-tier'],
    hostSmokeTargetLevel: data['host-smoke-target-level'],
    hostSmokeFreshnessDays: data['host-smoke-freshness-days'],
    hostSmokePolicy,
    lastReviewed: normalizeReviewDate(data['last-reviewed']),
    reviewCycleDays: normalizeReviewCycleDays(data['review-cycle-days']),
    scaffoldOrigin: normalizedScaffoldOrigin,
    scaffoldVersion: normalizedScaffoldVersion,
    canonicalScaffoldOrigin: templateLineage ? templateLineage.origin : null,
    canonicalScaffoldVersion: templateLineage ? templateLineage.version : null,
    scaffoldDriftStatus,
    file: relative,
    runtimeProofItems: readBulletSectionItems(text, 'Runtime Proof'),
    hasHostMetadata,
    smokeManifestPath: rel(targetDir, getSmokeManifestFile(path.dirname(skillFile))),
    smokeManifest: parseJsonFile(getSmokeManifestFile(path.dirname(skillFile))).data || null
  };
}

function normalizeValue(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function collectSkillRecords(targetDir, findings) {
  const skillsRoot = path.join(targetDir, 'skills');
  const skillFiles = walkSkillFiles(skillsRoot);
  const skillRecords = [];
  const names = new Set();

  for (const skillFile of skillFiles) {
    const record = validateSkillFile(skillFile, targetDir, skillsRoot, findings);
    if (!record) continue;
    if (names.has(record.name)) {
      findings.push({ severity: 'error', file: record.file, message: `duplicate skill name '${record.name}'` });
      continue;
    }
    names.add(record.name);
    skillRecords.push(record);
  }

  return {
    skillFiles,
    skillRecords
  };
}

module.exports = {
  collectSkillRecords,
  getScaffoldDriftStatus
};
