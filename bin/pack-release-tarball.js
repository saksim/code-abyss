#!/usr/bin/env node
'use strict';

const { createRequire } = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

function findLatestTarball(directory) {
  const matches = fs.readdirSync(directory)
    .filter((name) => /^code-abyss-.*\.tgz$/.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(directory, name),
      mtimeMs: fs.statSync(path.join(directory, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (matches.length === 0) {
    throw new Error(`no code-abyss tarball found in ${directory}`);
  }

  return matches[0].fullPath;
}

function resolveNpmExecPath(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return path.resolve(explicitPath);
  }

  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return path.resolve(process.env.npm_execpath);
  }

  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].map((candidate) => path.resolve(candidate));

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (resolved) {
    return resolved;
  }

  throw new Error('npm_execpath is unavailable; run through npm or pass an explicit tarball to release-smoke');
}

function loadLibNpmPack(npmExecPath) {
  const npmRequire = createRequire(npmExecPath);
  return npmRequire('libnpmpack');
}

async function packReleaseTarball(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const npmExecPath = resolveNpmExecPath(options.npmExecPath);
  const libnpmpack = loadLibNpmPack(npmExecPath);
  const baseDir = options.baseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'code-abyss-release-pack-'));
  const outDir = options.outDir || path.join(baseDir, 'out');
  const cacheDir = options.cacheDir || path.join(baseDir, 'cache');

  if (options.clean !== false) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  await libnpmpack('.', {
    cache: cacheDir,
    dryRun: false,
    foregroundScripts: false,
    ignoreScripts: false,
    packDestination: outDir,
    prefix: projectRoot,
    workspaces: [],
  });

  const tgzPath = findLatestTarball(outDir);

  return {
    tgzPath,
    outDir,
    cacheDir,
    baseDir,
  };
}

async function main() {
  try {
    const result = await packReleaseTarball();
    console.log(result.tgzPath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findLatestTarball,
  resolveNpmExecPath,
  loadLibNpmPack,
  packReleaseTarball,
};
