'use strict';

const path = require('path');

function resolveProjectRoot(baseDir = __dirname) {
  return path.resolve(baseDir, '..', '..');
}

function resolveAuthoritativeSkillSystemDir(projectRoot = resolveProjectRoot()) {
  return path.join(projectRoot, 'personal-skill-system');
}

function resolveAuthoritativeSkillsDir(projectRoot = resolveProjectRoot()) {
  return path.join(resolveAuthoritativeSkillSystemDir(projectRoot), 'skills');
}

function resolveLegacyRootSkillsDir(projectRoot = resolveProjectRoot()) {
  return path.join(projectRoot, 'skills');
}

module.exports = {
  resolveProjectRoot,
  resolveAuthoritativeSkillSystemDir,
  resolveAuthoritativeSkillsDir,
  resolveLegacyRootSkillsDir,
};
