'use strict';

const fs = require('fs');
const path = require('path');
const { EXPECTED_TOP_LEVEL_DIRS, rel } = require('./skill-system-common');
const { analyzePackManifests } = require('./skill-system-packs');
const { collectSkillRecords } = require('./skill-system-skills');
const { validateGeneratedMetadata } = require('./skill-system-registry');
const { analyzeTemplateScaffolds } = require('./skill-system-templates');

function summarizeStatus(findings) {
  if (findings.some(item => item.severity === 'error')) return 'fail';
  if (findings.some(item => item.severity === 'warning')) return 'warn';
  return 'pass';
}

function analyzeTopLevelDirs(targetDir, findings) {
  let count = 0;
  for (const dirName of EXPECTED_TOP_LEVEL_DIRS) {
    const full = path.join(targetDir, dirName);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
      findings.push({ severity: 'error', file: dirName, message: `missing top-level directory '${dirName}'` });
    } else {
      count += 1;
    }
  }
  return count;
}

function analyzeLegacyRootMirror(targetDir, findings) {
  const repoRoot = path.resolve(targetDir, '..');
  const legacyRoot = path.join(repoRoot, 'skills');
  if (!fs.existsSync(legacyRoot) || !fs.statSync(legacyRoot).isDirectory()) {
    return { fileCount: 0, dirCount: 0 };
  }

  const stack = [legacyRoot];
  let fileCount = 0;
  let dirCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirCount += 1;
        stack.push(full);
        continue;
      }
      fileCount += 1;
    }
  }

  if (fileCount > 0) {
    findings.push({
      severity: 'error',
      file: rel(repoRoot, legacyRoot),
      message: `legacy root skills/ mirror still contains ${fileCount} file(s); keep root skills/ retired`
    });
  }

  return { fileCount, dirCount };
}

function analyzeSkillSystem(targetDir) {
  const findings = [];
  const summary = {
    topLevelDirs: analyzeTopLevelDirs(targetDir, findings),
    skillFiles: 0,
    userInvocableSkills: 0,
    registrySkills: 0,
    moduleGroups: 0,
    capabilityModules: 0,
    admissionRequests: 0,
    routeEntries: 0,
    packCount: 0,
    routeFixtures: 0,
    runtimeProofs: 0,
    templateScaffolds: 0,
    legacyRootMirrorFiles: 0,
    legacyRootMirrorDirs: 0
  };

  const legacyRootMirror = analyzeLegacyRootMirror(targetDir, findings);
  summary.legacyRootMirrorFiles = legacyRootMirror.fileCount;
  summary.legacyRootMirrorDirs = legacyRootMirror.dirCount;
  summary.templateScaffolds = analyzeTemplateScaffolds(targetDir, findings);

  const { skillFiles, skillRecords } = collectSkillRecords(targetDir, findings);
  summary.skillFiles = skillFiles.length;
  summary.userInvocableSkills = skillRecords.filter(item => item.userInvocable).length;

  const generated = validateGeneratedMetadata(targetDir, skillRecords, findings);
  summary.registrySkills = generated.registrySkills.length;
  summary.moduleGroups = generated.moduleGroups.length;
  summary.capabilityModules = generated.moduleNames.size;
  summary.admissionRequests = generated.admissionLedger.entries.length;
  summary.routeEntries = generated.routes.length;
  summary.routeFixtures = generated.fixtures.length;
  summary.runtimeProofs = generated.runtimeProof.proofs.length;
  summary.packCount = analyzePackManifests(targetDir, findings, rel);

  return {
    tool: 'verify-skill-system',
    target: targetDir,
    status: summarizeStatus(findings),
    summary: `Audited ${summary.skillFiles} skill files, ${summary.registrySkills} registry entries, ${summary.capabilityModules} capability modules, ${summary.admissionRequests} admission requests, ${summary.routeEntries} route entries, and ${summary.runtimeProofs} runtime proof entries.`,
    findings,
    metrics: summary,
    nextSteps: [
      'fix error-level structural breakage first',
      'treat warning-level drift as governance debt',
      'rerun after any registry or route-map change'
    ]
  };
}

module.exports = {
  analyzeSkillSystem
};
