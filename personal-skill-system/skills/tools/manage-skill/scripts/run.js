#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const VALID_KINDS = new Map([
  ['router', 'routers'],
  ['domain', 'domains'],
  ['workflow', 'workflows'],
  ['tool', 'tools'],
  ['guard', 'guards'],
]);

function fail(message) {
  throw new Error(message);
}

function getProjectRoot() {
  const cwdRoot = path.join(process.cwd(), 'personal-skill-system');
  if (fs.existsSync(cwdRoot) && fs.statSync(cwdRoot).isDirectory()) {
    return process.cwd();
  }
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}

function getAuthoritativeSkillsRoot() {
  return path.join(getProjectRoot(), 'personal-skill-system', 'skills');
}

function splitFrontmatter(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return null;
  return {
    head: normalized.slice(4, end),
    body: normalized.slice(end + 5),
  };
}

function parseFrontmatterMap(text) {
  const parts = splitFrontmatter(text);
  if (!parts) fail('invalid SKILL.md frontmatter');
  const map = new Map();
  for (const line of parts.head.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map.set(key, value);
  }
  return { parts, map };
}

function renderFrontmatter(map) {
  return [...map.entries()].map(([key, value]) => `${key}: ${value}`).join('\n');
}

function slugToTitle(slug) {
  return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function resolveSkillDirByName(skillsRoot, skillName) {
  if (!fs.existsSync(skillsRoot)) {
    fail(`authoritative skills root is missing: ${skillsRoot}`);
  }
  const stack = [skillsRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === 'references' || entry.name === 'scripts') continue;
      const skillFile = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const text = fs.readFileSync(skillFile, 'utf8');
        const parts = splitFrontmatter(text);
        if (!parts) {
          stack.push(full);
          continue;
        }
        const parsed = parseFrontmatterMap(text);
        const currentName = parsed.map.get('name');
        if (currentName === skillName) {
          return { dir: full, skillFile, parsed };
        }
      }
      stack.push(full);
    }
  }
  return null;
}

function resolveSkillDirByRelPath(skillsRoot, relPath) {
  const normalized = String(relPath || '').replace(/\//g, path.sep);
  const targetDir = path.join(skillsRoot, normalized);
  const skillFile = path.join(targetDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    return null;
  }
  const text = fs.readFileSync(skillFile, 'utf8');
  const parsed = parseFrontmatterMap(text);
  return { dir: targetDir, skillFile, parsed };
}

function ensureInsideAuthoritativeRoot(targetPath, skillsRoot) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(skillsRoot);
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    fail(`refuse to operate outside authoritative skill root: ${resolvedTarget}`);
  }
}

function createSkill(kind, skillName) {
  const layer = VALID_KINDS.get(kind);
  if (!layer) fail(`unknown kind '${kind}'`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)) fail(`invalid skill name '${skillName}'`);

  const projectRoot = getProjectRoot();
  const skillsRoot = getAuthoritativeSkillsRoot();
  const templateDir = path.join(projectRoot, 'personal-skill-system', 'templates', 'skill', kind);
  const targetDir = path.join(skillsRoot, layer, skillName);
  const skillFile = path.join(targetDir, 'SKILL.md');
  ensureInsideAuthoritativeRoot(targetDir, skillsRoot);
  if (fs.existsSync(targetDir)) fail(`skill already exists at ${targetDir}`);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(templateDir, targetDir, { recursive: true });

  const parsed = parseFrontmatterMap(fs.readFileSync(skillFile, 'utf8'));
  parsed.map.set('name', skillName);
  parsed.map.set('title', `${slugToTitle(skillName)} ${slugToTitle(kind)}`);
  parsed.map.set('description', `TODO: describe ${skillName}. Use when this ${kind} is the correct primary route.`);
  parsed.map.set('status', 'draft');
  const next = `---\n${renderFrontmatter(parsed.map)}\n---${parsed.parts.body}`;
  fs.writeFileSync(skillFile, next, 'utf8');

  return {
    action: 'create',
    kind,
    skill: skillName,
    path: path.relative(projectRoot, targetDir).split(path.sep).join('/'),
    follow_up: ['npm run verify:skills'],
  };
}

function showSkill(skillName) {
  const projectRoot = getProjectRoot();
  const skillsRoot = getAuthoritativeSkillsRoot();
  const resolved = resolveSkillDirByName(skillsRoot, skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);

  return {
    action: 'show',
    skill: skillName,
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    frontmatter: Object.fromEntries(resolved.parsed.map.entries()),
  };
}

function updateSkill(skillName, assignments) {
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);
  if (assignments.length === 0) fail('update requires at least one --set key=value');

  for (const assignment of assignments) {
    const idx = assignment.indexOf('=');
    if (idx === -1) fail(`invalid assignment '${assignment}'`);
    const key = assignment.slice(0, idx).trim();
    const value = assignment.slice(idx + 1).trim();
    if (!key) fail(`invalid assignment '${assignment}'`);
    resolved.parsed.map.set(key, value);
  }

  const next = `---\n${renderFrontmatter(resolved.parsed.map)}\n---${resolved.parsed.parts.body}`;
  fs.writeFileSync(resolved.skillFile, next, 'utf8');

  return {
    action: 'update',
    skill: skillName,
    updated_fields: assignments,
    follow_up: ['npm run verify:skills'],
  };
}

function archiveSkill(skillName) {
  const resolved = resolveSkillDirByName(getAuthoritativeSkillsRoot(), skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);
  resolved.parsed.map.set('status', 'archived');
  const next = `---\n${renderFrontmatter(resolved.parsed.map)}\n---${resolved.parsed.parts.body}`;
  fs.writeFileSync(resolved.skillFile, next, 'utf8');

  return {
    action: 'archive',
    skill: skillName,
    follow_up: ['npm run verify:skills'],
  };
}

function removeSkill(skillName) {
  const projectRoot = getProjectRoot();
  const skillsRoot = getAuthoritativeSkillsRoot();
  const resolved = resolveSkillDirByName(skillsRoot, skillName) || resolveSkillDirByRelPath(skillsRoot, skillName);
  if (!resolved) fail(`unknown skill '${skillName}'`);
  ensureInsideAuthoritativeRoot(resolved.dir, skillsRoot);
  fs.rmSync(resolved.dir, { recursive: true, force: true });

  return {
    action: 'delete',
    skill: skillName,
    path: path.relative(projectRoot, resolved.dir).split(path.sep).join('/'),
    follow_up: ['npm run verify:skills', 'update registry/route-map generated artifacts if needed'],
  };
}

function main(argv) {
  const [action, arg1, arg2, ...rest] = argv;
  if (!action) {
    fail('usage: manage-skill <create|show|update|archive|delete> ...');
  }

  if (action === 'create') return createSkill(arg1, arg2);
  if (action === 'show') return showSkill(arg1);
  if (action === 'update') {
    const assignments = [];
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === '--set' && rest[i + 1]) {
        assignments.push(rest[i + 1]);
        i += 1;
      }
    }
    return updateSkill(arg1, assignments);
  }
  if (action === 'archive') return archiveSkill(arg1);
  if (action === 'delete') return removeSkill(arg1);

  fail(`unknown action '${action}'`);
}

if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  main,
  createSkill,
  showSkill,
  updateSkill,
  archiveSkill,
  removeSkill,
};
