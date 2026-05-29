'use strict';

const fs = require('fs');
const path = require('path');
const { collectInvocableSkills } = require('./skill-registry');
const { resolveAuthoritativeSkillsDir } = require('./skill-paths');

const QUICKSTART_FILE_NAME = 'HOW_TO_USE_SKILLS.md';

const CATEGORY_ORDER = ['domain', 'workflow', 'tool', 'guard'];
const CATEGORY_LABELS = {
  domain: 'Domains',
  workflow: 'Workflows',
  tool: 'Tools',
  guard: 'Guards',
};

const HOST_NOTES = {
  claude: {
    label: 'Claude Code',
    runtimeRoot: '~/.claude',
    skillRoot: '~/.claude/skills',
    commandRoot: '~/.claude/commands',
    bullets: [
      'Keep using Claude Code normally after install.',
      'Every invocable skill is also generated as a slash command under `~/.claude/commands/`.',
      'You can ask naturally, or call a skill directly such as `/review` or `/bugfix`.',
    ],
  },
  codex: {
    label: 'Codex CLI',
    runtimeRoot: '~/.codex',
    skillRoot: '~/.agents/skills',
    commandRoot: null,
    bullets: [
      'Keep using Codex normally after install.',
      'The shared skills runtime is installed under `~/.agents/skills/`.',
      'In Codex, the safest explicit pattern is to name the skill in your request, for example `Use development for this task.`',
    ],
  },
  gemini: {
    label: 'Gemini CLI',
    runtimeRoot: '~/.gemini',
    skillRoot: '~/.gemini/skills',
    commandRoot: '~/.gemini/commands',
    bullets: [
      'Keep using Gemini normally after install.',
      'Generated Gemini command files mirror the invocable skill names under `~/.gemini/commands/`.',
      'You can ask naturally, or use the generated command surface when your Gemini setup exposes it.',
    ],
  },
};

const STARTER_SKILLS = [
  { name: 'development', why: 'Implement or refactor code.' },
  { name: 'bugfix', why: 'Fix a known bug with a minimal patch.' },
  { name: 'investigate', why: 'Find root cause before changing code.' },
  { name: 'review', why: 'Review a diff or PR with findings first.' },
  { name: 'architecture', why: 'Make boundary, API, cache, queue, or migration decisions.' },
  { name: 'verify-change', why: 'Check the current diff for risk and doc drift.' },
  { name: 'verify-quality', why: 'Run a deterministic code quality pass.' },
  { name: 'verify-security', why: 'Run a deterministic security pass.' },
];

const INSTALL_PROMPT_SAMPLES = [
  {
    title: 'Implement or refactor',
    lines: [
      'Use development for this task.',
      'Goal: <one sentence outcome>',
      'Context: <repo / module / file>',
      'Constraints: minimal change; do not touch unrelated files',
      'Deliverable: code + tests',
      'Validation: <exact command>',
    ],
  },
  {
    title: 'Review a change',
    lines: [
      'Use review for this change.',
      'Scope: <PR / diff / directory>',
      'Requirements: findings first; order by severity',
      'Output: concrete risks with file paths',
      'Validation: name missing tests or checks',
    ],
  },
];

function getSkillsDir(projectRoot) {
  return resolveAuthoritativeSkillsDir(projectRoot);
}

function sortSkills(skills) {
  return [...skills].sort((a, b) => {
    const categoryDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    return a.name.localeCompare(b.name);
  });
}

function loadInvocableSkills(projectRoot) {
  return sortSkills(collectInvocableSkills(getSkillsDir(projectRoot)));
}

function splitCsvField(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function normalizeBodyLine(line) {
  return line
    .replace(/^\d+\.\s+/, '')
    .replace(/^-\s+/, '')
    .replace(/`/g, '')
    .trim();
}

function extractSection(body, candidates) {
  const lines = body.split(/\r?\n/);
  const sections = new Map();
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      sections.set(current, []);
      continue;
    }
    if (!current) continue;
    sections.get(current).push(line);
  }

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (sections.has(key)) return sections.get(key);
  }

  return [];
}

function extractUsageBullets(skill) {
  try {
    const body = stripFrontmatter(fs.readFileSync(skill.skillPath, 'utf8'));
    const sectionLines = extractSection(body, [
      'Use This When',
      'Use This Skill When',
      'Purpose',
      'Quick Judgement',
      'Route model',
    ]);

    const bullets = sectionLines
      .map((line) => line.trim())
      .filter((line) => /^(-|\d+\.)\s+/.test(line))
      .map(normalizeBodyLine)
      .filter(Boolean)
      .slice(0, 4);

    if (bullets.length > 0) return bullets;

    return sectionLines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('```'))
      .map(normalizeBodyLine)
      .filter(Boolean)
      .slice(0, 2);
  } catch {
    return [];
  }
}

function countByCategory(skills) {
  const counts = { domain: 0, workflow: 0, tool: 0, guard: 0 };
  for (const skill of skills) {
    if (Object.prototype.hasOwnProperty.call(counts, skill.category)) {
      counts[skill.category] += 1;
    }
  }
  return counts;
}

function formatCountsLine(counts) {
  return `${counts.domain} domains, ${counts.workflow} workflows, ${counts.tool} tools, ${counts.guard} guards`;
}

function formatSkillLine(skill) {
  return `${skill.name.padEnd(22)} ${skill.description}`;
}

function buildPromptTemplate(skill) {
  if (skill.category === 'tool' || skill.category === 'guard') {
    return [
      `Run ${skill.name} for this target.`,
      'Target: <path / PR / diff / spec>',
      'Goal: <what to verify>',
      'Output: <findings or pass/fail with evidence>',
      'Validation: <how to confirm the result>',
    ].join('\n');
  }

  if (skill.name === 'review') {
    return INSTALL_PROMPT_SAMPLES
      .find((sample) => sample.title === 'Review a change')
      .lines
      .join('\n');
  }

  return [
    `Use ${skill.name} for this task.`,
    'Goal: <one sentence outcome>',
    'Context: <repo / module / file / data>',
    'Constraints: <minimal change / compatibility / safety>',
    'Deliverable: <code / config / doc / test>',
    'Validation: <exact command>',
  ].join('\n');
}

function findSkill(projectRoot, requestedName) {
  const query = String(requestedName || '').trim();
  if (!query) return null;
  const skills = loadInvocableSkills(projectRoot);
  return skills.find((skill) => {
    if (skill.name === query) return true;
    return Array.isArray(skill.aliases) && skill.aliases.includes(query);
  }) || null;
}

function renderSkillCatalog(projectRoot) {
  const skills = loadInvocableSkills(projectRoot);
  const counts = countByCategory(skills);
  const lines = [
    `Personal Skill System skills (${skills.length} invocable)`,
    'Use one primary skill per task. Ask `npx personal-skill-system --explain-skill <name>` for details.',
    '',
    `Counts: ${formatCountsLine(counts)}`,
    '',
  ];

  for (const category of CATEGORY_ORDER) {
    const group = skills.filter((skill) => skill.category === category);
    if (group.length === 0) continue;
    lines.push(`${CATEGORY_LABELS[category]} (${group.length})`);
    for (const skill of group) {
      lines.push(`  ${formatSkillLine(skill)}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function renderSkillExplanation(projectRoot, requestedName) {
  const skill = findSkill(projectRoot, requestedName);
  if (!skill) {
    const skills = loadInvocableSkills(projectRoot).map((entry) => entry.name);
    throw new Error(`Unknown skill: ${requestedName}. Try: npx personal-skill-system --list-skills`);
  }

  const usageBullets = extractUsageBullets(skill);
  const aliases = Array.isArray(skill.aliases) ? skill.aliases : [];
  const triggers = splitCsvField(skill.meta && skill.meta['trigger-keywords']).slice(0, 8);
  const source = path.relative(projectRoot, skill.skillPath).split(path.sep).join('/');

  const lines = [
    `${skill.name}`,
    `Category: ${skill.category}`,
    `Runtime: ${skill.runtimeType}`,
    `Description: ${skill.description}`,
  ];

  if (usageBullets.length > 0) {
    lines.push('');
    lines.push('Use it when:');
    usageBullets.forEach((bullet) => lines.push(`- ${bullet}`));
  }

  lines.push('');
  lines.push('Prompt template:');
  lines.push('```text');
  lines.push(buildPromptTemplate(skill));
  lines.push('```');

  if (aliases.length > 0) {
    lines.push('');
    lines.push(`Aliases: ${aliases.join(', ')}`);
  }

  if (triggers.length > 0) {
    lines.push(`Trigger hints: ${triggers.join(', ')}`);
  }

  if (skill.argumentHint) {
    lines.push(`Argument hint: ${skill.argumentHint}`);
  }

  lines.push(`Source: ${source}`);

  return lines.join('\n');
}

function renderStarterSkillList(skillsByName) {
  const lines = [];
  for (const entry of STARTER_SKILLS) {
    const skill = skillsByName.get(entry.name);
    if (!skill) continue;
    lines.push(`- \`${skill.name}\`: ${entry.why}`);
  }
  return lines;
}

function renderHostSection(targetName) {
  const host = HOST_NOTES[targetName] || HOST_NOTES.codex;
  const lines = [`## On ${host.label}`, ''];
  host.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
  lines.push(`- Runtime root: \`${host.runtimeRoot}\``);
  lines.push(`- Skills root: \`${host.skillRoot}\``);
  if (host.commandRoot) {
    lines.push(`- Generated commands: \`${host.commandRoot}\``);
  }
  return lines;
}

function renderSkillQuickstart(projectRoot, targetName) {
  const skills = loadInvocableSkills(projectRoot);
  const counts = countByCategory(skills);
  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
  const starterSkills = renderStarterSkillList(skillsByName);

  const lines = [
    '# How To Use Personal Skill System Skills',
    '',
    'This install does not replace your normal CLI flow. Keep using your host normally.',
    'The practical rule is simple: pick one primary skill, state the goal, state the constraints, name the deliverable, and include validation.',
    '',
    `This runtime currently exposes ${skills.length} invocable skills: ${formatCountsLine(counts)}.`,
    '',
    ...renderHostSection(targetName),
    '',
    '## First 3 prompts',
    '',
    '### 1. Implement or refactor',
    '',
    '```text',
    'Use development for this task.',
    'Goal: <one sentence outcome>',
    'Context: <repo / module / file>',
    'Constraints: minimal change; do not touch unrelated files',
    'Deliverable: code + tests',
    'Validation: <exact command>',
    '```',
    '',
    '### 2. Fix a bug',
    '',
    '```text',
    'Use bugfix for this task.',
    'Issue: <bug or regression>',
    'Expected: <correct behavior>',
    'Constraints: root cause first; minimal patch',
    'Deliverable: fix + regression test',
    'Validation: <repro command> and <test command>',
    '```',
    '',
    '### 3. Review a change',
    '',
    '```text',
    'Use review for this change.',
    'Scope: <PR / diff / directory>',
    'Requirements: findings first; order by severity',
    'Output: concrete risks with file paths',
    'Validation: name missing tests or checks',
    '```',
    '',
    '## Smallest correct entry',
    '',
    ...starterSkills,
    '',
    '## What the skill system can do',
    '',
    '- `domain` skills are the main expertise entry points, for example `development`, `architecture`, `security`.',
    '- `workflow` skills define how to drive the task, for example `bugfix`, `investigate`, `review`.',
    '- `tool` skills run deterministic checks, for example `verify-change`, `verify-quality`, `verify-security`.',
    '- `guard` skills enforce commit or merge gates, for example `pre-commit-gate`, `pre-merge-gate`.',
    '',
    '## Discover more',
    '',
    '- `npx personal-skill-system --list-skills`',
    '- `npx personal-skill-system --explain-skill development`',
    '- `npx personal-skill-system --explain-skill review`',
    '',
    '## Default rule when unsure',
    '',
    'Ask the model to choose one primary skill first. Example:',
    '',
    '```text',
    'Choose the single best skill for this task first, explain why, then execute it.',
    'Goal: <one sentence outcome>',
    'Context: <repo / module / file>',
    'Constraints: <safety / compatibility / no-network / minimal diff>',
    'Deliverable: <code / config / doc / test>',
    'Validation: <exact command>',
    '```',
    '',
  ];

  return lines.join('\n');
}

function getQuickstartInstallPath(targetName) {
  const host = HOST_NOTES[targetName] || HOST_NOTES.codex;
  return `${host.runtimeRoot}/${QUICKSTART_FILE_NAME}`;
}

function getInstallPromptSamples() {
  return INSTALL_PROMPT_SAMPLES.map((sample) => ({
    title: sample.title,
    lines: [...sample.lines],
  }));
}

module.exports = {
  QUICKSTART_FILE_NAME,
  loadInvocableSkills,
  findSkill,
  getInstallPromptSamples,
  getQuickstartInstallPath,
  renderSkillCatalog,
  renderSkillExplanation,
  renderSkillQuickstart,
};
