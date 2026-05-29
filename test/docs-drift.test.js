'use strict';

const fs = require('fs');
const path = require('path');

describe('docs drift guard', () => {
  const projectRoot = path.join(__dirname, '..');

  test('README 不再写死过时 skill 数量与旧 Codex 入口', () => {
    const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

    expect(readme).not.toContain('56 篇');
    expect(readme).not.toContain('~/.codex/prompts');
  });

  test('CHANGELOG 对历史 skill 数量与旧 Codex 入口显式标注历史语境', () => {
    const changelog = fs.readFileSync(path.join(projectRoot, 'CHANGELOG.md'), 'utf8');

    expect(changelog).not.toContain('— 22 skills 通过\n');
    expect(changelog).toContain('历史口径');
    expect(changelog).toContain('当时的 Codex 安装流程');
  });

  test('DESIGN 不再宣称 Codex 运行时生成 AGENTS.md', () => {
    const design = fs.readFileSync(path.join(projectRoot, 'DESIGN.md'), 'utf8');

    expect(design).not.toContain('Codex 安装时会按所选 style 动态生成');
    expect(design).toContain('skills-only');
  });

  test('docs 路径口径不再把 root skills/ 当作权威来源', () => {
    const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
    const design = fs.readFileSync(path.join(projectRoot, 'DESIGN.md'), 'utf8');
    const onboarding = fs.readFileSync(path.join(projectRoot, 'docs', 'ONBOARDING.md'), 'utf8');
    const docsReadme = fs.readFileSync(path.join(projectRoot, 'docs', 'README.md'), 'utf8');
    const skillAuthoring = fs.readFileSync(path.join(projectRoot, 'docs', 'SKILL_AUTHORING.md'), 'utf8');
    const claude = fs.readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf8');
    const pssReadme = fs.readFileSync(path.join(projectRoot, 'personal-skill-system', 'docs', 'README.md'), 'utf8');
    const checkSurface = fs.readFileSync(path.join(projectRoot, 'personal-skill-system', 'skills', 'tools', 'verify-skill-system', 'references', 'check-surface.md'), 'utf8');
    const corpus = [readme, design, onboarding, docsReadme, skillAuthoring, claude, pssReadme, checkSurface].join('\n');

    expect(corpus).not.toContain('`skills/**/SKILL.md`');
    expect(corpus).not.toContain('`skills/<category>/<name>/SKILL.md`');
    expect(corpus).not.toContain('`skills/<category>/<skill-name>/SKILL.md`');
    expect(corpus).toContain('`personal-skill-system/skills/**/SKILL.md`');
  });

  test('SKILL_AUTHORING points volatile governance enums at the generated reference', () => {
    const skillAuthoring = fs.readFileSync(path.join(projectRoot, 'docs', 'SKILL_AUTHORING.md'), 'utf8');

    expect(skillAuthoring).toContain('SKILL_AUTHORING_GOVERNANCE_REFERENCE.generated.md');
    expect(skillAuthoring).not.toContain('<domain|workflow|tool|guard|router|adapter>');
    expect(skillAuthoring).not.toContain('<draft|experimental|stable|deprecated|archived>');
  });

  test('root skills/ 目录不应再含文件', () => {
    const legacyRoot = path.join(projectRoot, 'skills');
    if (!fs.existsSync(legacyRoot)) {
      expect(fs.existsSync(legacyRoot)).toBe(false);
      return;
    }

    const stack = [legacyRoot];
    const files = [];

    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else {
          files.push(path.relative(projectRoot, full).split(path.sep).join('/'));
        }
      }
    }

    expect(files).toEqual([]);
  });
  test('capability ratings doc summary stays aligned with current generated counts', () => {
    const ratings = JSON.parse(fs.readFileSync(path.join(projectRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
    const ratingsDoc = fs.readFileSync(path.join(projectRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
    const moduleCounts = ratings.counts || {};
    const skillCounts = (ratings['skill-level-summary'] || {}).counts || {};
    const allTopLevel = Number(skillCounts['strong-uplift-but-not-top-yet'] || 0) === 0
      && Number(skillCounts['useful-overlay-not-top-level-alone'] || 0) === 0
      && Number(skillCounts['top-level-enough-now'] || 0) === Number(skillCounts['total-skills-rated'] || 0);
    const expectedHostVerdict = allTopLevel
      ? `- all ${Number(skillCounts['total-skills-rated'] || 0)} registered host skills are now rated top-level enough`
      : `- ${Number(skillCounts['top-level-enough-now'] || 0)} of ${Number(skillCounts['total-skills-rated'] || 0)} registered host skills are top-level enough right now`;

    expect(ratingsDoc).toContain(`- TOP-ready modules: ${Number(moduleCounts['top-ready'] || 0)}`);
    expect(ratingsDoc).toContain(`- total rated capability modules: ${Number(moduleCounts.total || 0)}`);
    expect(ratingsDoc).toContain(`- top-level enough now: ${Number(skillCounts['top-level-enough-now'] || 0)}`);
    expect(ratingsDoc).toContain(expectedHostVerdict);
  });
  test('OpenCode docs stay compatibility-based instead of adding a fake standalone target', () => {
    const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
    const onboarding = fs.readFileSync(path.join(projectRoot, 'docs', 'ONBOARDING.md'), 'utf8');
    const releaseGuide = fs.readFileSync(path.join(projectRoot, 'docs', 'RELEASE_GUIDE.md'), 'utf8');

    expect(readme).toContain('OpenCode does not have a standalone `--target opencode` yet.');
    expect(readme).toContain('successful OpenCode-compatible installation');
    expect(readme).toContain('[docs/RELEASE_GUIDE.md](docs/RELEASE_GUIDE.md)');
    expect(readme).not.toContain('npx personal-skill-system --target opencode -y');
    expect(onboarding).toContain('不要直接对外宣称 `--target opencode`');
    expect(releaseGuide).toContain('do not publish `npx personal-skill-system --target opencode -y`');
  });
});
