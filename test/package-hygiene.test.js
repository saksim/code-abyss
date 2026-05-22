'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const benchmarkDir = path.join(repoRoot, 'personal-skill-system', 'benchmark');

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

describe('package hygiene', () => {
  test('benchmark tree does not retain codex probe artifacts', () => {
    const artifacts = fs.readdirSync(benchmarkDir).filter((name) => (
      name.startsWith('.codex-write-probe-') || name.startsWith('.codex-dir-probe-')
    ));

    expect(artifacts).toEqual([]);
  });

  test('ignore files exclude codex probe artifacts', () => {
    const gitIgnoreLines = readLines(path.join(repoRoot, '.gitignore'));
    const npmIgnoreLines = readLines(path.join(repoRoot, '.npmignore'));

    expect(gitIgnoreLines).toContain('**/.codex-write-probe*');
    expect(gitIgnoreLines).toContain('**/.codex-dir-probe-*');
    expect(npmIgnoreLines).toContain('**/.codex-write-probe*');
    expect(npmIgnoreLines).toContain('**/.codex-dir-probe-*');
  });
});
