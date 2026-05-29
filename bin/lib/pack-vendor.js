'use strict';

const { getPack } = require('./pack-registry');
const { shared, getVendorProvider } = require('./vendor-providers');

function getPackVendorDir(projectRoot, packName) {
  return shared.path.join(projectRoot, '.personal-skill-system', 'vendor', packName);
}

function ensurePackUpstream(projectRoot, packName) {
  const pack = getPack(projectRoot, packName);
  if (!pack.upstream) {
    throw new Error(`pack ${packName} 未声明 upstream`);
  }
  const upstream = {
    provider: pack.upstream.provider || 'git',
    ...pack.upstream,
  };
  getVendorProvider(upstream.provider, projectRoot).validate(upstream);
  return upstream;
}

function syncPackVendor(projectRoot, packName) {
  const upstream = ensurePackUpstream(projectRoot, packName);
  const vendorDir = getPackVendorDir(projectRoot, packName);
  shared.fs.mkdirSync(shared.path.dirname(vendorDir), { recursive: true });
  const provider = getVendorProvider(upstream.provider, projectRoot);
  return provider.sync({ projectRoot, upstream, vendorDir, shared, packName });
}

function removePackVendor(projectRoot, packName) {
  const vendorDir = getPackVendorDir(projectRoot, packName);
  if (!shared.fs.existsSync(vendorDir)) {
    return { pack: packName, removed: false, vendorDir };
  }
  shared.fs.rmSync(vendorDir, { recursive: true, force: true });
  return { pack: packName, removed: true, vendorDir };
}

function readVendorMetadata(projectRoot, packName) {
  const vendorDir = getPackVendorDir(projectRoot, packName);
  const metaPath = shared.path.join(vendorDir, '.personal-skill-system-vendor.json');
  if (!shared.fs.existsSync(metaPath)) return null;
  return JSON.parse(shared.fs.readFileSync(metaPath, 'utf8'));
}

function getPackVendorStatus(projectRoot, packName) {
  const upstream = ensurePackUpstream(projectRoot, packName);
  const vendorDir = getPackVendorDir(projectRoot, packName);
  const provider = upstream.provider || 'git';
  const exists = shared.fs.existsSync(vendorDir);

  if (!exists) {
    return {
      pack: packName,
      provider,
      vendorDir,
      exists: false,
      dirty: false,
      drifted: false,
      currentCommit: null,
      targetCommit: upstream.commit || null,
      sourceExists: false,
      metadata: null,
    };
  }

  const metadata = readVendorMetadata(projectRoot, packName);
  return getVendorProvider(provider, projectRoot).status({ projectRoot, upstream, vendorDir, shared, packName, metadata });
}

module.exports = {
  getPackVendorDir,
  ensurePackUpstream,
  syncPackVendor,
  removePackVendor,
  readVendorMetadata,
  getPackVendorStatus,
  resolveUpstreamPath: shared.resolveUpstreamPath,
  hashDirectory: shared.hashDirectory,
  hashFile: shared.hashFile,
};
