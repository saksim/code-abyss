#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs, resolveTarget, emit } = require('../../lib/runtime');
const { analyzeSkillSystem } = require('../../lib/skill-system');
const {
  refreshDerivedGovernanceArtifacts
} = require('../../lib/skill-system-derived-governance');

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
  refreshDerivedGovernanceArtifacts(bundleRoot);
}
