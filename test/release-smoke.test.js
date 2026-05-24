'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const {
  extractTarball,
  resolveTarballInput,
} = require('../bin/release-smoke.js');
const { resolveNpmExecPath } = require('../bin/pack-release-tarball.js');

function encodeOctal(value, width) {
  const raw = value.toString(8);
  return `${raw}`.padStart(width - 1, '0') + '\0';
}

function writeString(buffer, offset, length, value) {
  const src = Buffer.from(value, 'utf8');
  src.copy(buffer, offset, 0, Math.min(src.length, length));
}

function createHeader({ name, type = '0', size = 0, mode = 0o644, prefix = '' }) {
  const header = Buffer.alloc(512, 0);
  writeString(header, 0, 100, name);
  writeString(header, 100, 8, encodeOctal(mode, 8));
  writeString(header, 108, 8, encodeOctal(0, 8));
  writeString(header, 116, 8, encodeOctal(0, 8));
  writeString(header, 124, 12, encodeOctal(size, 12));
  writeString(header, 136, 12, encodeOctal(0, 12));
  writeString(header, 148, 8, '        ');
  writeString(header, 156, 1, type);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  writeString(header, 345, 155, prefix);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function createTarEntry({ pathName, body = '', type = '0' }) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const normalized = String(pathName).replace(/\\/g, '/');
  const slashIndex = normalized.length > 100 ? normalized.lastIndexOf('/', 155) : -1;
  const hasPrefix = slashIndex > 0 && normalized.length - slashIndex - 1 <= 100 && slashIndex <= 155;
  const name = hasPrefix ? normalized.slice(slashIndex + 1) : normalized;
  const prefix = hasPrefix ? normalized.slice(0, slashIndex) : '';
  const header = createHeader({ name, prefix, size: payload.length, type });
  const padding = Buffer.alloc((512 - (payload.length % 512 || 512)) % 512, 0);
  return Buffer.concat([header, payload, padding]);
}

function createPaxRecord(key, value) {
  let record = `${key}=${value}\n`;
  let length = record.length + String(record.length).length + 1;
  let rendered = `${length} ${record}`;
  while (rendered.length !== length) {
    length = record.length + String(length).length + 1;
    rendered = `${length} ${record}`;
  }
  return rendered;
}

function createPaxEntry(pathName, body) {
  const paxPayload = Buffer.from(createPaxRecord('path', pathName), 'utf8');
  return Buffer.concat([
    createTarEntry({ pathName: 'PaxHeader', body: paxPayload, type: 'x' }),
    createTarEntry({ pathName: 'ignored-name.txt', body, type: '0' }),
  ]);
}

describe('release-smoke tarball extraction', () => {
  test('extractTarball handles long npm-style paths without external tar', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-smoke-test-'));
    const tgzPath = path.join(tmpRoot, 'fixture.tgz');
    const extractRoot = path.join(tmpRoot, 'out');
    const longPath = 'package/personal-skill-system/skills/tools/manage-skill/references/very/deep/tree/that/exceeds/the/classic/tar/header/limit/example.txt';
    const archive = Buffer.concat([
      createTarEntry({ pathName: 'package/', type: '5' }),
      createPaxEntry(longPath, 'long-path-ok\n'),
      Buffer.alloc(1024, 0),
    ]);

    fs.writeFileSync(tgzPath, zlib.gzipSync(archive));

    extractTarball(tgzPath, extractRoot);

    expect(fs.readFileSync(path.join(extractRoot, ...longPath.split('/')), 'utf8')).toBe('long-path-ok\n');
  });

  test('resolveTarballInput keeps explicit tgz path and skips packing', async () => {
    const packed = await resolveTarballInput(
      { tgz: '.\\dist\\code-abyss.tgz' },
    );

    expect(packed.source).toBe('explicit');
    expect(packed.tgzPath).toBe(path.resolve('.\\dist\\code-abyss.tgz'));
  });

  test('resolveTarballInput uses newest tarball from an explicit directory', async () => {
    const findLatestTarballFn = jest.fn(() => 'C:\\tmp\\release-smoke\\code-abyss-2.1.2.tgz');
    const packed = await resolveTarballInput(
      { tgzDir: '.\\tmp-release-smoke' },
      {
        findLatestTarballFn,
      },
    );

    expect(findLatestTarballFn).toHaveBeenCalledWith(path.resolve('.\\tmp-release-smoke'));
    expect(packed).toEqual(expect.objectContaining({
      tgzPath: 'C:\\tmp\\release-smoke\\code-abyss-2.1.2.tgz',
      source: 'directory-latest',
    }));
  });

  test('resolveTarballInput can pack a fresh tarball into system temp staging', async () => {
    const cleanup = jest.fn();
    const packFreshTarballFn = jest.fn(() => ({
      tgzPath: 'C:\\tmp\\fresh-pack\\code-abyss-2.1.2.tgz',
      source: 'fresh-pack',
      stageRoot: 'C:\\tmp\\fresh-pack',
      cleanup,
    }));
    const packed = await resolveTarballInput(
      { pack: true },
      {
        tarballSearchRoot: 'D:\\workspace\\code-abyss',
        packFreshTarballFn,
      },
    );

    expect(packFreshTarballFn).toHaveBeenCalledWith({ cwd: 'D:\\workspace\\code-abyss' });
    expect(packed).toEqual(expect.objectContaining({
      tgzPath: 'C:\\tmp\\fresh-pack\\code-abyss-2.1.2.tgz',
      source: 'fresh-pack',
      stageRoot: 'C:\\tmp\\fresh-pack',
      cleanup,
    }));
  });

  test('resolveTarballInput falls back to latest existing tarball in cwd when no path is provided', async () => {
    const packed = await resolveTarballInput(
      { tgz: null },
      {
        tarballSearchRoot: 'D:\\workspace\\code-abyss',
        findLatestTarballFn: jest.fn(() => 'D:\\workspace\\code-abyss\\code-abyss-2.1.2.tgz'),
      },
    );

    expect(packed).toEqual(expect.objectContaining({
      tgzPath: 'D:\\workspace\\code-abyss\\code-abyss-2.1.2.tgz',
      source: 'latest-existing-tarball',
    }));
  });

  test('resolveNpmExecPath falls back when explicit npm path is missing', () => {
    expect(resolveNpmExecPath('Z:\\missing\\npm-cli.js')).toMatch(/npm-cli\.js$/);
  });

  test('resolveNpmExecPath accepts an explicit existing npm path', () => {
    expect(resolveNpmExecPath(process.execPath)).toBe(path.resolve(process.execPath));
  });
});
