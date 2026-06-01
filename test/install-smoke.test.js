'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { rmSafe } = require('../bin/lib/utils');
const gstackFixture = path.join(__dirname, 'fixtures', 'gstack-codex-source');

function readBackupManifest(runtimeDir) {
  return JSON.parse(fs.readFileSync(path.join(runtimeDir, '.sage-backup', 'manifest.json'), 'utf8'));
}

function cleanupHomeRoot(tmpHome) {
  if (!fs.existsSync(tmpHome)) return;
  for (const entry of fs.readdirSync(tmpHome)) {
    try {
      rmSafe(path.join(tmpHome, entry));
    } catch {}
  }
  try {
    fs.rmdirSync(tmpHome);
  } catch {}
}

function isSpawnBlocked(result) {
  return !!(result && result.status == null && result.error && result.error.code === 'EPERM');
}

function bailIfSpawnBlocked(result) {
  if (!isSpawnBlocked(result)) return false;
  expect(result.error).toEqual(expect.objectContaining({ code: 'EPERM' }));
  return true;
}

function copyPublishableBundle(sourceRoot, destRoot) {
  [
    'bin',
    'config',
    'output-styles',
    'packs',
    'personal-skill-system',
  ].forEach((entry) => {
    fs.cpSync(path.join(sourceRoot, entry), path.join(destRoot, entry), { recursive: true });
  });

  [
    'package.json',
    'README.md',
    'LICENSE',
  ].forEach((entry) => {
    fs.copyFileSync(path.join(sourceRoot, entry), path.join(destRoot, entry));
  });
}

function runBundleInstall(bundleRoot, homeRoot, target, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(bundleRoot, 'bin', 'install.js'), '--target', target, '-y'], {
    cwd: bundleRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

function runBundleUninstall(bundleRoot, homeRoot, target, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(bundleRoot, 'bin', 'install.js'), '--uninstall', target], {
    cwd: bundleRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      USERPROFILE: homeRoot,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

describe('install cli styles', () => {
  test('--list-styles 列出可用风格', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'install.js'), '--list-styles'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });

    if (bailIfSpawnBlocked(result)) return;
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('abyss-cultivator');
    expect(result.stdout).toContain('scholar-classic');
  });

  test('--list-skills 列出可用 skill', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'install.js'), '--list-skills'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });

    if (bailIfSpawnBlocked(result)) return;
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Personal Skill System skills');
    expect(result.stdout).toContain('development');
    expect(result.stdout).toContain('review');
    expect(result.stdout).toContain('verify-security');
  });

  test('--explain-skill 输出具体用法', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'install.js'), '--explain-skill', 'review'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });

    if (bailIfSpawnBlocked(result)) return;
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skill: review');
    expect(result.stdout).toContain('Prompt template:');
    expect(result.stdout).toContain('Use review for this change.');
  });
});

describe('claude install smoke', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-claude-home-'));
  });

  afterEach(() => {
    cleanupHomeRoot(tmpHome);
  });

  function runInstall(args) {
    return spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'install.js'), ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
      },
      encoding: 'utf8',
    });
  }

  test('安装 Claude 时生成 commands 与 settings.json', () => {
    const result = runInstall(['--target', 'claude', '-y']);
    if (bailIfSpawnBlocked(result)) return;
    const claudeDir = path.join(tmpHome, '.claude');

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'personal-skill-system', 'registry', 'registry.generated.json'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'commands', 'gen-docs.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'commands', 'review.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'HOW_TO_USE_SKILLS.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'skills', 'gstack', 'review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, '.sage-uninstall.js'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'personal-skill-system', 'benchmark', 'host-evolution.generated.json'))).toBe(true);
    expect(result.stdout).toContain('Self-evolution:');
    expect(result.stdout).toContain('Self-evolution artifact:');
    expect(readBackupManifest(claudeDir).host_evolution).toEqual(expect.objectContaining({
      action: 'diagnose-host-evolution',
      status: expect.any(String),
      artifact: expect.any(String)
    }));
  });

  test('安装 Claude 时支持 --style 切换 outputStyle', () => {
    const result = runInstall(['--target', 'claude', '--style', 'scholar-classic', '-y']);
    if (bailIfSpawnBlocked(result)) return;
    const claudeDir = path.join(tmpHome, '.claude');
    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));

    expect(result.status).toBe(0);
    expect(settings.outputStyle).toBe('scholar-classic');
  });
  test('Claude uninstall removes generated commands directory', () => {
    const claudeDir = path.join(tmpHome, '.claude');

    const install = runInstall(['--target', 'claude', '-y']);
    if (bailIfSpawnBlocked(install)) return;
    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(claudeDir, 'commands', 'review.md'))).toBe(true);

    const uninstall = runInstall(['--uninstall', 'claude']);
    if (bailIfSpawnBlocked(uninstall)) return;
    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(false);
  });

  test('Claude auto install works from a publishable bundle without node_modules', () => {
    const repoRoot = path.join(__dirname, '..');
    const bundleRoot = path.join(tmpHome, 'publishable-bundle');
    const isolatedHome = path.join(tmpHome, 'isolated-home');
    fs.mkdirSync(bundleRoot, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    copyPublishableBundle(repoRoot, bundleRoot);

    const install = runBundleInstall(bundleRoot, isolatedHome, 'claude', {
      PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
    });
    if (bailIfSpawnBlocked(install)) return;

    const claudeDir = path.join(isolatedHome, '.claude');
    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(claudeDir, 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'commands', 'review.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'personal-skill-system', 'registry', 'registry.generated.json'))).toBe(true);

    const uninstall = runBundleUninstall(bundleRoot, isolatedHome, 'claude', {
      PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
    });
    if (bailIfSpawnBlocked(uninstall)) return;

    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(claudeDir, 'commands'))).toBe(false);
    expect(fs.existsSync(path.join(claudeDir, 'personal-skill-system'))).toBe(false);
  });
});

describe('codex install smoke', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-codex-home-'));
  });

  afterEach(() => {
    cleanupHomeRoot(tmpHome);
  });

  function runInstall(args) {
    return spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'install.js'), ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
      },
      encoding: 'utf8',
    });
  }

  test('安装 Codex 时生成 AGENTS.md + skills 且不写 settings.json', () => {
    const result = runInstall(['--target', 'codex', '-y']);
    if (bailIfSpawnBlocked(result)) return;
    const codexDir = path.join(tmpHome, '.codex');
    const codexConfig = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
    const manifest = readBackupManifest(codexDir);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(codexDir, 'HOW_TO_USE_SKILLS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, '.agents', 'personal-skill-system', 'registry', 'registry.generated.json'))).toBe(true);
    expect(fs.existsSync(path.join(codexDir, 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(codexDir, 'bin', 'lib'))).toBe(true);
    expect(fs.existsSync(path.join(codexDir, 'config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(codexDir, 'instruction.md'))).toBe(true);
    expect(codexConfig).toContain('model_instructions_file = "./instruction.md"');
    expect(fs.existsSync(path.join(tmpHome, '.agents', 'personal-skill-system', 'benchmark', 'host-evolution.generated.json'))).toBe(true);
    expect(result.stdout).toContain('Self-evolution:');
    expect(result.stdout).toContain('Self-evolution artifact:');
    expect(manifest.host_evolution).toEqual(expect.objectContaining({
      action: 'diagnose-host-evolution',
      status: expect.any(String),
      artifact: expect.any(String)
    }));
    expect(manifest.installed).toEqual(expect.arrayContaining([
      expect.objectContaining({ root: 'codex', path: 'AGENTS.md' }),
      expect.objectContaining({ root: 'codex', path: 'config.toml' })
    ]));
    expect(fs.existsSync(path.join(codexDir, 'settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(codexDir, 'prompts'))).toBe(false);
    const agentsMd = fs.readFileSync(path.join(codexDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('宿命深渊');
  });

  test('安装 Codex 时会清理旧 prompts 残留', () => {
    const codexDir = path.join(tmpHome, '.codex');
    fs.mkdirSync(path.join(codexDir, 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(codexDir, 'prompts', 'old.md'), 'legacy\n');

    const result = runInstall(['--target', 'codex', '-y']);
    if (bailIfSpawnBlocked(result)) return;

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'prompts'))).toBe(false);
    expect(result.stdout).toContain('移除 legacy prompts/');
  });

  test('安装 Codex 时支持 --style 切换风格', () => {
    const result = runInstall(['--target', 'codex', '--style', 'scholar-classic', '-y']);
    if (bailIfSpawnBlocked(result)) return;
    const codexDir = path.join(tmpHome, '.codex');

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(true);
    const agentsMd = fs.readFileSync(path.join(codexDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('墨渊书阁');
  });

  test('安装 Codex 时会迁移旧 settings.json，卸载后恢复', () => {
    const codexDir = path.join(tmpHome, '.codex');
    const originalConfig = 'sandbox_mode = "workspace-write"\n';
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, 'settings.json'), '{"legacy":true}\n');
    fs.writeFileSync(path.join(codexDir, 'AGENTS.md'), '# legacy agents\n');
    fs.writeFileSync(path.join(codexDir, 'config.toml'), originalConfig);

    const install = runInstall(['--target', 'codex', '-y']);
    if (bailIfSpawnBlocked(install)) return;

    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'settings.json'))).toBe(false);
    expect(install.stdout).toContain('移除 legacy settings.json');
    expect(fs.existsSync(path.join(codexDir, 'skills'))).toBe(true);
    expect(fs.readFileSync(path.join(codexDir, 'AGENTS.md'), 'utf8')).not.toContain('# legacy agents');
    expect(fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8')).toContain('model_instructions_file = "./instruction.md"');

    const uninstall = runInstall(['--uninstall', 'codex']);
    if (bailIfSpawnBlocked(uninstall)) return;
    expect(uninstall.status).toBe(0);
    expect(fs.readFileSync(path.join(codexDir, 'settings.json'), 'utf8')).toContain('legacy');
    expect(fs.readFileSync(path.join(codexDir, 'AGENTS.md'), 'utf8')).toContain('# legacy agents');
    expect(fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8')).toBe(originalConfig);
    expect(fs.existsSync(path.join(codexDir, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, '.agents', 'skills'))).toBe(false);
  });

  test('安装 Codex 后卸载会移除生成的 AGENTS.md', () => {
    const codexDir = path.join(tmpHome, '.codex');

    const install = runInstall(['--target', 'codex', '-y']);
    if (bailIfSpawnBlocked(install)) return;
    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(true);

    const uninstall = runInstall(['--uninstall', 'codex']);
    if (bailIfSpawnBlocked(uninstall)) return;
    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(codexDir, 'config.toml'))).toBe(false);
    expect(fs.existsSync(path.join(codexDir, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, '.agents', 'skills'))).toBe(false);
  });

  test('Codex 独立卸载脚本也会回收空的 .agents/skills 目录', () => {
    const codexDir = path.join(tmpHome, '.codex');

    const install = runInstall(['--target', 'codex', '-y']);
    if (bailIfSpawnBlocked(install)) return;
    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(tmpHome, '.agents', 'skills', 'gstack'))).toBe(true);

    const uninstall = spawnSync(process.execPath, [path.join(codexDir, '.sage-uninstall.js')], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      },
      encoding: 'utf8',
    });
    if (bailIfSpawnBlocked(uninstall)) return;

    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(codexDir, 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, '.agents', 'skills'))).toBe(false);
    expect(fs.existsSync(path.join(codexDir, '.sage-uninstall.js'))).toBe(false);
  });

  test('Codex auto install works from a publishable bundle without node_modules', () => {
    const repoRoot = path.join(__dirname, '..');
    const bundleRoot = path.join(tmpHome, 'publishable-bundle');
    const isolatedHome = path.join(tmpHome, 'isolated-home');
    fs.mkdirSync(bundleRoot, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    copyPublishableBundle(repoRoot, bundleRoot);

    const result = runBundleInstall(bundleRoot, isolatedHome, 'codex', {
      PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
    });
    if (bailIfSpawnBlocked(result)) return;

    const codexDir = path.join(isolatedHome, '.codex');
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(codexDir, 'config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(isolatedHome, '.agents', 'personal-skill-system', 'registry', 'registry.generated.json'))).toBe(true);

    const uninstall = runBundleUninstall(bundleRoot, isolatedHome, 'codex', {
      PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
    });
    if (bailIfSpawnBlocked(uninstall)) return;

    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(codexDir, 'config.toml'))).toBe(false);
    expect(fs.existsSync(path.join(isolatedHome, '.agents', 'personal-skill-system'))).toBe(false);
  });
});


describe('gemini install smoke', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-gemini-home-'));
  });

  afterEach(() => {
    cleanupHomeRoot(tmpHome);
  });

  function runInstall(args) {
    return spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'install.js'), ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
      },
      encoding: 'utf8',
    });
  }

  test('安装 Gemini 时生成 GEMINI.md、skills、commands 与 settings.json', () => {
    const result = runInstall(['--target', 'gemini', '-y']);
    if (bailIfSpawnBlocked(result)) return;
    const geminiDir = path.join(tmpHome, '.gemini');
    const reviewSkill = fs.readFileSync(path.join(geminiDir, 'skills', 'gstack', 'review', 'SKILL.md'), 'utf8');

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(geminiDir, 'GEMINI.md'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'HOW_TO_USE_SKILLS.md'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'personal-skill-system', 'registry', 'registry.generated.json'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'commands', 'gen-docs.toml'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'commands', 'review.toml'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'skills', 'gstack', 'review', 'SKILL.md'))).toBe(true);
    expect(reviewSkill).toContain('~/.gemini/skills/gstack/review/checklist.md');
    expect(reviewSkill).not.toContain('~/.claude/skills/gstack');
    expect(fs.existsSync(path.join(geminiDir, 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, '.sage-uninstall.js'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'personal-skill-system', 'benchmark', 'host-evolution.generated.json'))).toBe(true);
    expect(result.stdout).toContain('Self-evolution:');
    expect(result.stdout).toContain('Self-evolution artifact:');
    expect(readBackupManifest(geminiDir).host_evolution).toEqual(expect.objectContaining({
      action: 'diagnose-host-evolution',
      status: expect.any(String),
      artifact: expect.any(String)
    }));
  });

  test('安装 Gemini 时支持 --style 切换 GEMINI.md', () => {
    const result = runInstall(['--target', 'gemini', '--style', 'scholar-classic', '-y']);
    if (bailIfSpawnBlocked(result)) return;
    const geminiDir = path.join(tmpHome, '.gemini');
    const content = fs.readFileSync(path.join(geminiDir, 'GEMINI.md'), 'utf8');

    expect(result.status).toBe(0);
    expect(content).toContain('# 墨渊书阁 · 输出之道');
  });
  test('Gemini uninstall removes generated commands directory', () => {
    const geminiDir = path.join(tmpHome, '.gemini');

    const install = runInstall(['--target', 'gemini', '-y']);
    if (bailIfSpawnBlocked(install)) return;
    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(geminiDir, 'commands', 'review.toml'))).toBe(true);

    const uninstall = runInstall(['--uninstall', 'gemini']);
    if (bailIfSpawnBlocked(uninstall)) return;
    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(geminiDir, 'commands'))).toBe(false);
  });

  test('Gemini auto install works from a publishable bundle without node_modules', () => {
    const repoRoot = path.join(__dirname, '..');
    const bundleRoot = path.join(tmpHome, 'publishable-bundle');
    const isolatedHome = path.join(tmpHome, 'isolated-home');
    fs.mkdirSync(bundleRoot, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    copyPublishableBundle(repoRoot, bundleRoot);

    const install = runBundleInstall(bundleRoot, isolatedHome, 'gemini', {
      PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
    });
    if (bailIfSpawnBlocked(install)) return;

    const geminiDir = path.join(isolatedHome, '.gemini');
    expect(install.status).toBe(0);
    expect(fs.existsSync(path.join(geminiDir, 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'commands', 'review.toml'))).toBe(true);
    expect(fs.existsSync(path.join(geminiDir, 'personal-skill-system', 'registry', 'registry.generated.json'))).toBe(true);

    const uninstall = runBundleUninstall(bundleRoot, isolatedHome, 'gemini', {
      PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE: gstackFixture,
    });
    if (bailIfSpawnBlocked(uninstall)) return;

    expect(uninstall.status).toBe(0);
    expect(fs.existsSync(path.join(geminiDir, 'commands'))).toBe(false);
    expect(fs.existsSync(path.join(geminiDir, 'personal-skill-system'))).toBe(false);
  });
});
