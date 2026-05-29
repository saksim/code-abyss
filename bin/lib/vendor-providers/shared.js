'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { copyRecursive, rmSafe } = require('../utils');

function runCommand(command, args, workdir = null) {
  const result = spawnSync(command, args, {
    cwd: workdir || undefined,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result.stdout.trim();
}

function runGit(args, workdir = null) {
  return runCommand('git', args, workdir);
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashFile(filePath) {
  return hashBuffer(fs.readFileSync(filePath));
}

function hashDirectory(rootDir) {
  const hash = crypto.createHash('sha256');

  function walk(currentDir, relBase = '') {
    fs.readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => entry.name !== '.git' && entry.name !== '.personal-skill-system-vendor.json')
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        const full = path.join(currentDir, entry.name);
        const rel = path.posix.join(relBase, entry.name);
        if (entry.isDirectory()) {
          hash.update(`dir:${rel}\n`);
          walk(full, rel);
        } else {
          hash.update(`file:${rel}\n`);
          hash.update(fs.readFileSync(full));
        }
      });
  }

  walk(rootDir);
  return hash.digest('hex');
}

function resolveUpstreamPath(projectRoot, targetPath) {
  if (!targetPath) return null;
  return path.isAbsolute(targetPath) ? targetPath : path.join(projectRoot, targetPath);
}

function extractArchive(archivePath, destDir) {
  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    runCommand('unzip', ['-q', archivePath, '-d', destDir]);
    return;
  }
  runCommand('tar', ['-xf', archivePath, '-C', destDir]);
}

function writeVendorMetadata(vendorDir, metadata) {
  fs.writeFileSync(path.join(vendorDir, '.personal-skill-system-vendor.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

module.exports = {
  fs,
  path,
  copyRecursive,
  rmSafe,
  runCommand,
  runGit,
  hashFile,
  hashDirectory,
  resolveUpstreamPath,
  extractArchive,
  writeVendorMetadata,
};
