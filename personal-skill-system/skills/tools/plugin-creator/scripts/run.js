#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    name: null,
    parentPath: 'plugins',
    marketplacePath: path.join('.agents', 'plugins', 'marketplace.json'),
    category: 'Productivity',
    withSkills: false,
    withHooks: false,
    withScripts: false,
    withAssets: false,
    withMcp: false,
    withApps: false,
    withMarketplace: false,
    force: false,
    dryRun: false,
    json: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--name' && argv[i + 1]) {
      options.name = argv[++i];
    } else if (arg === '--path' && argv[i + 1]) {
      options.parentPath = argv[++i];
    } else if (arg === '--marketplace-path' && argv[i + 1]) {
      options.marketplacePath = argv[++i];
    } else if (arg === '--category' && argv[i + 1]) {
      options.category = argv[++i];
    } else if (arg === '--with-skills') {
      options.withSkills = true;
    } else if (arg === '--with-hooks') {
      options.withHooks = true;
    } else if (arg === '--with-scripts') {
      options.withScripts = true;
    } else if (arg === '--with-assets') {
      options.withAssets = true;
    } else if (arg === '--with-mcp') {
      options.withMcp = true;
    } else if (arg === '--with-apps') {
      options.withApps = true;
    } else if (arg === '--with-marketplace') {
      options.withMarketplace = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`unknown option '${arg}'`);
    }
  }

  return options;
}

function normalizePluginName(name) {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!normalized) throw new Error('--name is required');
  if (normalized.length > 64) throw new Error('plugin name must be 64 characters or fewer after normalization');
  return normalized;
}

function ensureDir(dir, created, dryRun) {
  if (dryRun) {
    created.planned.push({ type: 'directory', path: dir });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  created.created.push({ type: 'directory', path: dir });
}

function writeJson(file, value, created, options) {
  if (fs.existsSync(file) && !options.force) {
    throw new Error(`refuse to overwrite existing file without --force: ${file}`);
  }
  if (options.dryRun) {
    created.planned.push({ type: 'file', path: file });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  created.created.push({ type: 'file', path: file });
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildPluginManifest(plugin) {
  return {
    name: plugin,
    version: '0.1.0',
    description: '[TODO: plugin description]',
    interface: {
      displayName: '[TODO: Plugin Display Name]',
      shortDescription: '[TODO: Short description]'
    }
  };
}

function normalizeMarketplace(doc) {
  if (!doc) {
    return {
      name: '[TODO: marketplace-name]',
      interface: {
        displayName: '[TODO: Marketplace Display Name]'
      },
      plugins: []
    };
  }
  if (!Array.isArray(doc.plugins)) doc.plugins = [];
  if (!doc.interface || typeof doc.interface !== 'object') {
    doc.interface = { displayName: '[TODO: Marketplace Display Name]' };
  }
  if (!doc.name) doc.name = '[TODO: marketplace-name]';
  return doc;
}

function upsertMarketplace(options, plugin, created) {
  const marketplaceFile = path.resolve(options.marketplacePath);
  const doc = normalizeMarketplace(readJsonIfExists(marketplaceFile));
  const entry = {
    name: plugin,
    source: {
      source: 'local',
      path: `./plugins/${plugin}`
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL'
    },
    category: options.category
  };
  const index = doc.plugins.findIndex((item) => item && item.name === plugin);
  if (index >= 0 && !options.force) {
    throw new Error(`marketplace already contains plugin '${plugin}'; use --force to replace`);
  }
  if (index >= 0) doc.plugins[index] = entry;
  else doc.plugins.push(entry);

  if (options.dryRun) {
    created.planned.push({ type: 'file', path: marketplaceFile });
    return marketplaceFile;
  }
  fs.mkdirSync(path.dirname(marketplaceFile), { recursive: true });
  fs.writeFileSync(marketplaceFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  created.created.push({ type: 'file', path: marketplaceFile });
  return marketplaceFile;
}

function createPlugin(options) {
  const plugin = normalizePluginName(options.name);
  const pluginPath = path.resolve(options.parentPath, plugin);
  const manifestPath = path.join(pluginPath, '.codex-plugin', 'plugin.json');
  const result = {
    'schema-version': 1,
    tool: 'plugin-creator',
    plugin,
    plugin_path: pluginPath,
    manifest_path: manifestPath,
    marketplace_path: options.withMarketplace ? path.resolve(options.marketplacePath) : null,
    dry_run: options.dryRun,
    created: [],
    planned: [],
    warnings: [
      'plugin-creator is Codex-specific unless another host explicitly supports the same plugin contract'
    ]
  };
  const tracker = { created: result.created, planned: result.planned };

  if (fs.existsSync(pluginPath) && !options.force && !options.dryRun) {
    throw new Error(`plugin path already exists; use --force only if replacement is intentional: ${pluginPath}`);
  }

  ensureDir(path.join(pluginPath, '.codex-plugin'), tracker, options.dryRun);
  writeJson(manifestPath, buildPluginManifest(plugin), tracker, options);

  const optionalDirs = [
    [options.withSkills, 'skills'],
    [options.withHooks, 'hooks'],
    [options.withScripts, 'scripts'],
    [options.withAssets, 'assets']
  ];
  for (const [enabled, name] of optionalDirs) {
    if (enabled) ensureDir(path.join(pluginPath, name), tracker, options.dryRun);
  }

  if (options.withMcp) {
    writeJson(path.join(pluginPath, '.mcp.json'), { mcpServers: {} }, tracker, options);
  }
  if (options.withApps) {
    writeJson(path.join(pluginPath, '.app.json'), { apps: [] }, tracker, options);
  }
  if (options.withMarketplace) {
    upsertMarketplace(options, plugin, tracker);
  }

  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('usage: node scripts/run.js --name <plugin-name> [--path plugins] [--with-marketplace] [--dry-run] [--json]\n');
    return;
  }
  const result = createPlugin(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`plugin: ${result.plugin}\n`);
  process.stdout.write(`manifest: ${result.manifest_path}\n`);
  process.stdout.write(`${result.dry_run ? 'planned' : 'created'}: ${(result.dry_run ? result.planned : result.created).length}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  createPlugin,
  normalizePluginName,
  buildPluginManifest,
  normalizeMarketplace
};
