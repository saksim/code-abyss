'use strict';

const path = require('path');
const { collectSkills } = require('./lib/skill-registry');
const { analyzeSkillSourcePolicy } = require('./lib/skill-source-policy');
const {
  resolveProjectRoot,
  resolveAuthoritativeSkillsDir,
  resolveLegacyRootSkillsDir,
} = require('./lib/skill-paths');

function resolveSkillsDir() {
  const projectRoot = resolveProjectRoot();
  return process.env.SAGE_SKILLS_DIR
    ? path.resolve(process.env.SAGE_SKILLS_DIR)
    : resolveAuthoritativeSkillsDir(projectRoot);
}

function main() {
  const skillsDir = resolveSkillsDir();
  const skills = collectSkills(skillsDir);

  if (!process.env.SAGE_SKILLS_DIR) {
    const projectRoot = resolveProjectRoot();
    const sourcePolicy = analyzeSkillSourcePolicy({
      projectRoot,
      authoritativeSkillsDir: resolveAuthoritativeSkillsDir(projectRoot),
      rootMirrorDir: resolveLegacyRootSkillsDir(projectRoot),
    });

    const errors = sourcePolicy.findings.filter((item) => item.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((item) => item.message).join('\n'));
    }
  }

  console.log(`技能契约验证通过: ${skills.length} skills`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { main, resolveSkillsDir };
