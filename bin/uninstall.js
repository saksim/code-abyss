#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

function normalizeManifestEntry(entry, defaultRoot) {
  if (typeof entry === 'string') return { root: defaultRoot, path: entry };
  if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
    return { root: entry.root || defaultRoot, path: entry.path };
  }
  throw new Error('invalid manifest entry');
}

function resolveManagedRootDir(targetDir, targetName, rootName = targetName) {
  const homeDir = path.dirname(targetDir);
  if (rootName === targetName) return targetDir;
  if (rootName === 'agents') return path.join(homeDir, '.agents');
  return path.join(homeDir, `.${rootName}`);
}

function cleanupEmptyManagedAncestors(targetPath, stopDir) {
  if (!targetPath || !stopDir) return;

  const boundary = path.resolve(stopDir);
  let current = path.resolve(path.dirname(targetPath));

  while (current !== boundary) {
    if (!current.startsWith(`${boundary}${path.sep}`)) return;
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }

    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return;
    }
    if (!stat.isDirectory()) return;

    let entries;
    try {
      entries = fs.readdirSync(current);
    } catch {
      return;
    }
    if (entries.length > 0) return;

    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

const targetDir = path.dirname(__filename);
const backupDir = path.join(targetDir, '.sage-backup');
const manifestPath = path.join(backupDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('❌ 未找到安装记录 (manifest.json)');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error('❌ manifest.json 解析失败:', error.message);
  process.exit(1);
}

const targetName = manifest.target || path.basename(targetDir).replace(/^\./, '');

console.log(`\n🗑️  卸载 Personal Skill System v${manifest.version}...\n`);

(manifest.installed || []).forEach((entry) => {
  const normalized = normalizeManifestEntry(entry, targetName);
  const installRoot = resolveManagedRootDir(targetDir, targetName, normalized.root);
  const targetPath = path.join(installRoot, normalized.path);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    cleanupEmptyManagedAncestors(targetPath, installRoot);
    console.log(`🗑️  删除: ${normalized.root === targetName ? normalized.path : `${normalized.root}/${normalized.path}`}`);
  }
});

(manifest.backups || []).forEach((entry) => {
  const normalized = normalizeManifestEntry(entry, targetName);
  const backupPath = path.join(backupDir, normalized.root, normalized.path);
  const legacyBackupPath = path.join(backupDir, normalized.path);
  const sourcePath = fs.existsSync(backupPath) ? backupPath : legacyBackupPath;
  const restoreRoot = resolveManagedRootDir(targetDir, targetName, normalized.root);
  const restorePath = path.join(restoreRoot, normalized.path);
  if (fs.existsSync(sourcePath)) {
    fs.mkdirSync(path.dirname(restorePath), { recursive: true });
    fs.renameSync(sourcePath, restorePath);
    console.log(`✅ 恢复: ${normalized.root === targetName ? normalized.path : `${normalized.root}/${normalized.path}`}`);
  }
});

fs.rmSync(backupDir, { recursive: true, force: true });
fs.unlinkSync(__filename);

console.log('\n✅ 卸载完成\n');
