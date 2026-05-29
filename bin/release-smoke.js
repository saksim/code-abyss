#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const pkg = require(path.join(__dirname, '..', 'package.json'));
const { listTargetNames } = require(path.join(__dirname, 'lib', 'target-registry.js'));
const { packReleaseTarball } = require(path.join(__dirname, 'pack-release-tarball.js'));

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'gstack-codex-source');

const TARGET_ASSERTIONS = Object.freeze({
  claude: {
    presentAfterInstall: [
      '.claude/CLAUDE.md',
      '.claude/settings.json',
      '.claude/commands/review.md',
      '.claude/personal-skill-system/registry/registry.generated.json',
      '.claude/.sage-uninstall.js',
    ],
    missingAfterUninstall: [
      '.claude/CLAUDE.md',
      '.claude/commands',
      '.claude/personal-skill-system',
      '.claude/.sage-backup',
    ],
  },
  codex: {
    presentAfterInstall: [
      '.codex/AGENTS.md',
      '.codex/config.toml',
      '.codex/instruction.md',
      '.agents/personal-skill-system/registry/registry.generated.json',
      '.codex/.sage-uninstall.js',
    ],
    missingAfterUninstall: [
      '.codex/AGENTS.md',
      '.codex/config.toml',
      '.agents/personal-skill-system',
      '.codex/.sage-backup',
    ],
  },
  gemini: {
    presentAfterInstall: [
      '.gemini/GEMINI.md',
      '.gemini/settings.json',
      '.gemini/commands/review.toml',
      '.gemini/personal-skill-system/registry/registry.generated.json',
      '.gemini/.sage-uninstall.js',
    ],
    missingAfterUninstall: [
      '.gemini/GEMINI.md',
      '.gemini/commands',
      '.gemini/personal-skill-system',
      '.gemini/.sage-backup',
    ],
  },
});

function parseArgs(argv) {
  const parsed = {
    tgz: null,
    tgzDir: null,
    targets: null,
    homeRoot: null,
    fixture: DEFAULT_FIXTURE,
    pack: false,
    keep: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tgz' && argv[i + 1]) parsed.tgz = argv[++i];
    else if (arg === '--tgz-dir' && argv[i + 1]) parsed.tgzDir = argv[++i];
    else if (arg === '--targets' && argv[i + 1]) parsed.targets = argv[++i];
    else if (arg === '--home-root' && argv[i + 1]) parsed.homeRoot = argv[++i];
    else if (arg === '--fixture' && argv[i + 1]) parsed.fixture = argv[++i];
    else if (arg === '--pack') parsed.pack = true;
    else if (arg === '--keep') parsed.keep = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node bin/release-smoke.js [options]

Options:
  --tgz <path>        Smoke a specific personal-skill-system tarball
  --tgz-dir <path>    Smoke the newest personal-skill-system tarball in a specific directory
  --pack              Pack a fresh tarball into a system temp directory before smoke
  --targets <list>    Comma-separated targets, default: ${listTargetNames().join(',')}
  --home-root <path>  Directory used for isolated smoke homes
  --fixture <path>    Override PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE fixture path
  --keep              Keep the probe directory even on success
  --help, -h          Show this help

If neither --tgz nor --tgz-dir is provided, the newest personal-skill-system-*.tgz in the current directory is used.
Use --pack when you want the smoke to prove a freshly packed tarball.`);
}

function resolveTargets(input) {
  const supported = new Set(listTargetNames());
  const requested = input
    ? input.split(',').map((value) => value.trim()).filter(Boolean)
    : listTargetNames();

  if (requested.length === 0) {
    throw new Error('no targets selected');
  }

  requested.forEach((target) => {
    if (!supported.has(target)) {
      throw new Error(`unsupported target: ${target}`);
    }
  });

  return requested;
}

function findLatestTarball(cwd) {
  const matches = fs.readdirSync(cwd)
    .filter((name) => /^personal-skill-system-.*\.tgz$/.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(cwd, name),
      mtimeMs: fs.statSync(path.join(cwd, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (matches.length === 0) {
    throw new Error('no personal-skill-system-*.tgz found in the current directory, run npm pack or pass --tgz');
  }

  return matches[0].fullPath;
}

function resolveTarballInput(options, dependencies = {}) {
  const tarballSearchRoot = dependencies.tarballSearchRoot || process.cwd();
  const findLatestTarballFn = dependencies.findLatestTarballFn || findLatestTarball;
  const packFreshTarballFn = dependencies.packFreshTarballFn || packFreshTarball;

  if (options.tgz) {
    return {
      tgzPath: path.resolve(options.tgz),
      source: 'explicit',
      cleanup() {},
    };
  }

  if (options.tgzDir) {
    return {
      tgzPath: findLatestTarballFn(path.resolve(options.tgzDir)),
      source: 'directory-latest',
      cleanup() {},
    };
  }

  if (options.pack) {
    return packFreshTarballFn({ cwd: tarballSearchRoot });
  }

  return {
    tgzPath: findLatestTarballFn(tarballSearchRoot),
    source: 'latest-existing-tarball',
    cleanup() {},
  };
}
async function packFreshTarball(options = {}, dependencies = {}) {
  const projectRoot = path.resolve(options.cwd || process.cwd());
  const result = await packReleaseTarball({
    projectRoot,
    npmExecPath: dependencies.npmExecPath,
    baseDir: dependencies.baseDir,
    outDir: dependencies.outDir,
    cacheDir: dependencies.cacheDir,
    settleMs: dependencies.settleMs,
  });

  return {
    tgzPath: result.tgzPath,
    source: 'fresh-pack',
    stageRoot: result.baseDir,
    cleanup() {
      removeTree(result.baseDir);
    },
  };
}

function assertPaths(root, relPaths, shouldExist, label) {
  relPaths.forEach((relPath) => {
    const fullPath = path.join(root, relPath);
    const exists = fs.existsSync(fullPath);
    if (shouldExist && !exists) {
      throw new Error(`${label}: expected path to exist after step: ${relPath}`);
    }
    if (!shouldExist && exists) {
      throw new Error(`${label}: expected path to be removed after step: ${relPath}`);
    }
  });
}

function isZeroBlock(block) {
  for (let i = 0; i < block.length; i += 1) {
    if (block[i] !== 0) return false;
  }
  return true;
}

function decodeTarString(buffer) {
  const nulIndex = buffer.indexOf(0);
  const slice = nulIndex === -1 ? buffer : buffer.subarray(0, nulIndex);
  return slice.toString('utf8').trim();
}

function parseTarNumber(buffer) {
  if (buffer.length === 0) return 0;
  if ((buffer[0] & 0x80) !== 0) {
    let value = 0n;
    for (const byte of buffer) {
      value = (value << 8n) | BigInt(byte);
    }
    value &= ~(1n << BigInt((buffer.length * 8) - 1));
    return Number(value);
  }

  const raw = decodeTarString(buffer).replace(/\0/g, '').trim();
  if (!raw) return 0;
  return Number.parseInt(raw, 8);
}

function buildTarEntryPath(header) {
  const name = decodeTarString(header.subarray(0, 100));
  const prefix = decodeTarString(header.subarray(345, 500));
  return prefix ? `${prefix}/${name}` : name;
}

function parsePaxPayload(buffer) {
  const result = {};
  let offset = 0;

  while (offset < buffer.length) {
    const spaceIndex = buffer.indexOf(0x20, offset);
    if (spaceIndex === -1) break;
    const length = Number.parseInt(buffer.subarray(offset, spaceIndex).toString('utf8'), 10);
    if (!Number.isFinite(length) || length <= 0) break;

    const record = buffer.subarray(offset, offset + length).toString('utf8');
    const body = record.slice(record.indexOf(' ') + 1).replace(/\n$/, '');
    const equalsIndex = body.indexOf('=');
    if (equalsIndex !== -1) {
      const key = body.slice(0, equalsIndex);
      const value = body.slice(equalsIndex + 1);
      result[key] = value;
    }
    offset += length;
  }

  return result;
}

function normalizeArchivePath(entryPath) {
  const normalized = String(entryPath || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized) {
    throw new Error('tar entry is missing a path');
  }
  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`absolute tar entry paths are not supported: ${normalized}`);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) {
    throw new Error(`path traversal is not allowed in tar entries: ${normalized}`);
  }
  return parts.join('/');
}

function extractTarGzBuffer(tgzBuffer, extractRoot) {
  const archive = zlib.gunzipSync(tgzBuffer);
  let offset = 0;
  let globalPax = {};
  let entryPax = null;
  let longPath = null;
  let longLinkPath = null;

  fs.mkdirSync(extractRoot, { recursive: true });

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (isZeroBlock(header)) break;

    const size = parseTarNumber(header.subarray(124, 136));
    const typeflag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    const body = archive.subarray(bodyStart, bodyEnd);
    const advance = 512 + Math.ceil(size / 512) * 512;

    if (typeflag === 'g') {
      globalPax = { ...globalPax, ...parsePaxPayload(body) };
      offset += advance;
      continue;
    }

    if (typeflag === 'x') {
      entryPax = parsePaxPayload(body);
      offset += advance;
      continue;
    }

    if (typeflag === 'L') {
      longPath = decodeTarString(body);
      offset += advance;
      continue;
    }

    if (typeflag === 'K') {
      longLinkPath = decodeTarString(body);
      offset += advance;
      continue;
    }

    const pax = { ...globalPax, ...(entryPax || {}) };
    const entryPath = normalizeArchivePath(pax.path || longPath || buildTarEntryPath(header));
    const destination = path.join(extractRoot, ...entryPath.split('/'));

    if (typeflag === '5') {
      fs.mkdirSync(destination, { recursive: true });
    } else if (typeflag === '0' || typeflag === '7') {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, body);
    } else if (typeflag === '2') {
      const linkTarget = pax.linkpath || longLinkPath || decodeTarString(header.subarray(157, 257));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(linkTarget, destination);
    } else {
      throw new Error(`unsupported tar entry type '${typeflag}' for ${entryPath}`);
    }

    entryPax = null;
    longPath = null;
    longLinkPath = null;
    offset += advance;
  }
}

function extractTarball(tgzPath, extractRoot) {
  extractTarGzBuffer(fs.readFileSync(tgzPath), extractRoot);
  const packageRoot = path.join(extractRoot, 'package');
  if (!fs.existsSync(packageRoot)) {
    throw new Error(`tarball did not unpack to ${packageRoot}`);
  }
  return packageRoot;
}

function buildEnv(homeRoot, fixturePath) {
  const env = {
    ...process.env,
    HOME: homeRoot,
    USERPROFILE: homeRoot,
    APPDATA: path.join(homeRoot, 'AppData', 'Roaming'),
  };

  fs.mkdirSync(env.APPDATA, { recursive: true });

  if (fixturePath && fs.existsSync(fixturePath)) {
    env.PERSONAL_SKILL_SYSTEM_GSTACK_SOURCE = fixturePath;
  }

  return env;
}

async function invokeInstallCli(packageRoot, env, args) {
  const installPath = path.join(packageRoot, 'bin', 'install.js');
  const previousArgv = process.argv.slice();
  const previousCwd = process.cwd();
  const previousEnv = {};
  const envKeys = Object.keys(env);
  const previousExit = process.exit;

  envKeys.forEach((key) => {
    previousEnv[key] = process.env[key];
    process.env[key] = env[key];
  });

  try {
    process.chdir(packageRoot);
    process.argv = [process.execPath, installPath, ...args];
    delete require.cache[require.resolve(installPath)];
    const installModule = require(installPath);
    process.exit = (code) => {
      const error = new Error(`install cli exited ${code}`);
      error.exitCode = code;
      throw error;
    };

    await installModule.main();
  } catch (error) {
    const code = error && typeof error.exitCode === 'number' ? error.exitCode : null;
    throw new Error(code == null ? error.message : `install cli exited ${code}: ${error.message}`);
  } finally {
    process.exit = previousExit;
    process.argv = previousArgv;
    process.chdir(previousCwd);
    envKeys.forEach((key) => {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    });
  }
}

async function smokeTarget({ tgzPath, target, probeRoot, fixturePath }) {
  const targetRoot = path.join(probeRoot, target);
  const homeRoot = path.join(targetRoot, 'home');
  const extractRoot = path.join(targetRoot, 'pkg');
  removeTree(targetRoot);
  fs.mkdirSync(homeRoot, { recursive: true });

  const packageRoot = extractTarball(tgzPath, extractRoot);
  const env = buildEnv(homeRoot, fixturePath);
  await invokeInstallCli(packageRoot, env, ['--target', target, '-y']);
  assertPaths(homeRoot, TARGET_ASSERTIONS[target].presentAfterInstall, true, `${target} install`);

  await invokeInstallCli(packageRoot, env, ['--uninstall', target]);
  assertPaths(homeRoot, TARGET_ASSERTIONS[target].missingAfterUninstall, false, `${target} uninstall`);

  return {
    target,
    installExit: 0,
    uninstallExit: 0,
    homeRoot,
  };
}

function removeTree(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(options.targets);
  const probeRoot = options.homeRoot
    ? path.resolve(options.homeRoot)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'personal-skill-system-release-smoke-'));
  const fixturePath = options.fixture ? path.resolve(options.fixture) : null;
  const failures = [];
  let tarball = null;
  let cleanupTarball = false;

  try {
    tarball = await resolveTarballInput(options);
    console.log(`release-smoke: ${pkg.name}@${pkg.version}`);
    console.log(`tarball: ${tarball.tgzPath}`);
    console.log(`tarball-source: ${tarball.source}`);
    if (tarball.stageRoot) {
      console.log(`tarball-stage: ${tarball.stageRoot}`);
    }
    console.log(`targets: ${targets.join(', ')}`);
    console.log(`probe-root: ${probeRoot}`);
    if (fixturePath && fs.existsSync(fixturePath)) {
      console.log(`fixture: ${fixturePath}`);
    }

    for (const target of targets) {
      try {
        const report = await smokeTarget({ tgzPath: tarball.tgzPath, target, probeRoot, fixturePath });
        console.log(`[pass] ${report.target} install=${report.installExit} uninstall=${report.uninstallExit}`);
      } catch (error) {
        failures.push({ target, message: error.message });
        console.error(`[fail] ${target}: ${error.message}`);
      }
    }

    if (failures.length === 0) {
      console.log(`release-smoke: all ${targets.length} target(s) passed`);
      if (!options.keep && !options.homeRoot) removeTree(probeRoot);
      cleanupTarball = !options.keep;
      return 0;
    }

    console.error(`release-smoke: ${failures.length} target(s) failed`);
    failures.forEach((failure) => {
      console.error(`- ${failure.target}: ${failure.message}`);
    });
    console.error(`probe-root kept for debugging: ${probeRoot}`);
    if (tarball.stageRoot) {
      console.error(`tarball-stage kept for debugging: ${tarball.stageRoot}`);
    }
    return 1;
  } finally {
    if (cleanupTarball && tarball) {
      tarball.cleanup();
    }
  }
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      if (typeof exitCode === 'number' && exitCode !== 0) {
        process.exit(exitCode);
      }
    })
    .catch((error) => {
      console.error(`release-smoke failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  parseArgs,
  resolveTargets,
  findLatestTarball,
  resolveTarballInput,
  packFreshTarball,
  parsePaxPayload,
  extractTarGzBuffer,
  extractTarball,
  invokeInstallCli,
  main,
};
