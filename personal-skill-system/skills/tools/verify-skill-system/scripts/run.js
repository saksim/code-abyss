#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs, resolveTarget, emit } = require('../../lib/runtime');
const { analyzeSkillSystem } = require('../../lib/skill-system');
const { writeSystemReadiness } = require('../../lib/skill-system-readiness');
const { buildHostSmokeScorecard } = require('../../lib/skill-system-host-smoke');
const { parseJsonFile } = require('../../lib/skill-system-common');
const { buildSkillInvestmentBacklog } = require('../../lib/skill-investment-governance');
const { collectSkillRecords } = require('../../lib/skill-system-skills');
const { buildReviewQueue } = require('../../lib/skill-review-governance');

const args = parseArgs(process.argv.slice(2));
const selfSmoke = process.argv.includes('--self-smoke');
const target = resolveTarget(args.target);
const report = selfSmoke
  ? runSelfSmoke(target, args)
  : analyzeSkillSystem(target, args);

emit(report, args);

function runSelfSmoke(targetDir) {
  const workspaceRoot = path.resolve(targetDir, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-system-smoke-'));

  try {
    const bundleCopy = path.join(tempRoot, 'personal-skill-system');
    const testSource = path.join(workspaceRoot, 'test');
    const testCopy = path.join(tempRoot, 'test');
    fs.cpSync(targetDir, bundleCopy, { recursive: true });
    if (fs.existsSync(testSource) && fs.statSync(testSource).isDirectory()) {
      fs.cpSync(testSource, testCopy, { recursive: true });
    }

    refreshGeneratedGovernance(bundleCopy);
    const report = analyzeSkillSystem(bundleCopy);
    report.target = targetDir;
    report.smoke_target = bundleCopy;
    return report;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function refreshGeneratedGovernance(bundleRoot) {
  const findings = [];
  const { skillRecords } = collectSkillRecords(bundleRoot, findings);
  if (findings.some((item) => item.severity === 'error')) {
    throw new Error(`skill record collection failed in self-smoke copy: ${findings.map((item) => item.message).join('; ')}`);
  }

  const runtimeProofPath = path.join(bundleRoot, 'registry', 'runtime-proof.generated.json');
  const runtimeProof = parseJsonFile(runtimeProofPath);
  if (!runtimeProof.data || !Array.isArray(runtimeProof.data.proofs)) {
    throw new Error(`runtime proof registry parse failed in self-smoke copy: ${runtimeProof.error || 'missing proofs'}`);
  }

  const reviewQueuePath = path.join(bundleRoot, 'registry', 'review-queue.generated.json');
  const reviewQueue = buildReviewQueue(bundleRoot, skillRecords);
  fs.writeFileSync(reviewQueuePath, `${JSON.stringify(reviewQueue, null, 2)}\n`, 'utf8');

  const registryData = parseRequiredJson(bundleRoot, 'registry/registry.generated.json');
  const ratingsData = parseRequiredJson(bundleRoot, 'registry/capability-ratings.generated.json');
  const admissionLedgerData = parseRequiredJson(bundleRoot, 'registry/admission-ledger.generated.json');
  const evolutionLedgerData = parseRequiredJson(bundleRoot, 'registry/evolution-ledger.generated.json');
  const opportunityQueueData = parseRequiredJson(bundleRoot, 'registry/skill-opportunity-queue.generated.json');
  const pendingScaffoldData = parseRequiredJson(bundleRoot, 'registry/pending-scaffolds.generated.json');
  const routeFixturesData = parseRequiredJson(bundleRoot, 'registry/route-fixtures.generated.json');

  const scorecardPath = path.join(bundleRoot, 'benchmark', 'host-smoke', 'scorecard.generated.json');
  const scorecard = buildHostSmokeScorecard(bundleRoot, runtimeProof.data.proofs.filter((proof) => proof && proof['host-smoke']));
  fs.writeFileSync(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');

  const backlogPath = path.join(bundleRoot, 'registry', 'skill-investment-backlog.generated.json');
  const backlog = buildSkillInvestmentBacklog(bundleRoot, {
    skillRecords,
    registryData,
    ratingsData,
    reviewQueueData: reviewQueue,
    admissionLedgerData,
    evolutionLedgerData,
    opportunityQueueData,
    pendingScaffoldData,
    routeFixturesData,
    runtimeProofData: runtimeProof.data,
    hostSmokeScorecardData: scorecard
  });
  fs.writeFileSync(backlogPath, `${JSON.stringify(backlog, null, 2)}\n`, 'utf8');

  writeSystemReadiness(bundleRoot);
}

function parseRequiredJson(bundleRoot, relativePath) {
  const parsed = parseJsonFile(path.join(bundleRoot, relativePath));
  if (parsed.error || !parsed.data) {
    throw new Error(`${relativePath} parse failed in self-smoke copy: ${parsed.error || 'missing data'}`);
  }
  return parsed.data;
}
