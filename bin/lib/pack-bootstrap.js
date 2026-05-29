'use strict';

const fs = require('fs');
const path = require('path');

const {
  applySnippetToFile,
  hasSnippetBlock,
} = require('./pack-docs');
const { listTargetNames } = require('./target-registry');

function renderReadmeSnippet(lock) {
  const lines = [
    '## AI Pack Bootstrap',
    '',
    'This repository declares Personal Skill System packs in `.personal-skill-system/packs.lock.json`.',
    '',
  ];

  listTargetNames().forEach((host) => {
    const cfg = lock.hosts[host];
    lines.push(`- ${host}: required=[${cfg.required.join(', ') || 'none'}], optional=[${cfg.optional.join(', ') || 'none'}], optional_policy=${cfg.optional_policy}`);
  });

  const installCommands = listTargetNames().map((host) => `npx personal-skill-system --target ${host} -y`);
  lines.push(
    '',
    'Recommended install:',
    '',
    '```bash',
    ...installCommands,
    '```',
    ''
  );
  return lines.join('\n');
}

function renderContributingSnippet(lock) {
  const targetNames = listTargetNames();
  return [
    '## AI Tooling',
    '',
    'This repository uses `.personal-skill-system/packs.lock.json` to declare AI packs.',
    '',
    '- Update the lock with `npm run packs:update -- [flags]`.',
    '- Validate it with `npm run packs:check`.',
    `- Re-run \`npx personal-skill-system --target ${targetNames.join('|')} -y\` after pack changes.`,
    '',
    `Current host policies: ${targetNames.map((host) => `${host}=${lock.hosts[host].optional_policy}`).join(', ')}`,
    '',
  ].join('\n');
}

function writeBootstrapSnippets(projectRoot, lock) {
  const snippetDir = path.join(projectRoot, '.personal-skill-system', 'snippets');
  fs.mkdirSync(snippetDir, { recursive: true });
  fs.writeFileSync(path.join(snippetDir, 'README.packs.md'), `${renderReadmeSnippet(lock)}\n`);
  fs.writeFileSync(path.join(snippetDir, 'CONTRIBUTING.packs.md'), `${renderContributingSnippet(lock)}\n`);
  return snippetDir;
}

function applyBootstrapDocs(projectRoot, lock, mode = 'all') {
  const operations = [
    { filePath: path.join(projectRoot, 'README.md'), kind: 'readme', content: renderReadmeSnippet(lock) },
    { filePath: path.join(projectRoot, 'CONTRIBUTING.md'), kind: 'contributing', content: renderContributingSnippet(lock) },
  ];

  const results = [];
  operations.forEach((op) => {
    if (mode === 'markers-only' && !hasSnippetBlock(op.filePath, op.kind)) {
      results.push({ filePath: op.filePath, action: 'skipped' });
      return;
    }
    results.push(applySnippetToFile(op.filePath, op.kind, op.content));
  });

  return results;
}

function syncProjectBootstrapArtifacts(projectRoot, lock) {
  const snippetDir = writeBootstrapSnippets(projectRoot, lock);
  const docs = applyBootstrapDocs(projectRoot, lock, 'markers-only');
  return { snippetDir, docs };
}

module.exports = {
  renderReadmeSnippet,
  renderContributingSnippet,
  writeBootstrapSnippets,
  applyBootstrapDocs,
  syncProjectBootstrapArtifacts,
};
