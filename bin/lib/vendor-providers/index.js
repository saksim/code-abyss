'use strict';

const fs = require('fs');
const path = require('path');

const shared = require('./shared');

const BUILTIN_DIR = __dirname;
const BUILTIN_SKIP = new Set(['index.js', 'shared.js']);

function isProviderFile(name) {
  return name.endsWith('.js') && !BUILTIN_SKIP.has(name);
}

function validateProviderContract(provider, sourcePath) {
  if (!provider || typeof provider !== 'object') {
    throw new Error(`vendor provider 无效: ${sourcePath}`);
  }
  if (typeof provider.name !== 'string' || provider.name.trim() === '') {
    throw new Error(`vendor provider 缺少 name: ${sourcePath}`);
  }
  ['validate', 'sync', 'status'].forEach((fn) => {
    if (typeof provider[fn] !== 'function') {
      throw new Error(`vendor provider 缺少 ${fn}(): ${sourcePath}`);
    }
  });
}

function loadProvidersFromDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath)
    .filter(isProviderFile)
    .sort()
    .map((fileName) => {
      const fullPath = path.join(dirPath, fileName);
      delete require.cache[require.resolve(fullPath)];
      const provider = require(fullPath);
      validateProviderContract(provider, fullPath);
      return {
        name: provider.name,
        provider,
        sourcePath: fullPath,
      };
    });
}

function getDynamicProviderDirs(projectRoot) {
  if (!projectRoot) return [];
  return [
    path.join(projectRoot, '.personal-skill-system', 'vendor-providers'),
    path.join(projectRoot, 'vendor-providers'),
  ];
}

function loadVendorProviders(projectRoot = null) {
  const providers = new Map();

  loadProvidersFromDir(BUILTIN_DIR).forEach(({ name, provider }) => {
    providers.set(name, provider);
  });

  getDynamicProviderDirs(projectRoot).forEach((dirPath) => {
    loadProvidersFromDir(dirPath).forEach(({ name, provider }) => {
      providers.set(name, provider);
    });
  });

  return providers;
}

function listVendorProviderNames(projectRoot = null) {
  return [...loadVendorProviders(projectRoot).keys()].sort();
}

function getVendorProvider(providerName = 'git', projectRoot = null) {
  const provider = loadVendorProviders(projectRoot).get(providerName);
  if (!provider) {
    throw new Error(`不支持的 vendor provider: ${providerName}`);
  }
  return provider;
}

module.exports = {
  shared,
  BUILTIN_DIR,
  loadVendorProviders,
  listVendorProviderNames,
  getVendorProvider,
  validateProviderContract,
};
