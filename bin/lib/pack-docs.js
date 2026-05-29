'use strict';

const fs = require('fs');
const path = require('path');

const MARKERS = {
  readme: {
    start: '<!-- personal-skill-system:packs:readme:start -->',
    end: '<!-- personal-skill-system:packs:readme:end -->',
  },
  contributing: {
    start: '<!-- personal-skill-system:packs:contributing:start -->',
    end: '<!-- personal-skill-system:packs:contributing:end -->',
  },
};

function wrapSnippet(kind, content) {
  const marker = MARKERS[kind];
  return `${marker.start}\n${content.trim()}\n${marker.end}\n`;
}

function hasSnippetBlock(filePath, kind) {
  if (!fs.existsSync(filePath)) return false;
  const marker = MARKERS[kind];
  const current = fs.readFileSync(filePath, 'utf8');
  return current.includes(marker.start) && current.includes(marker.end);
}

function applySnippetToFile(filePath, kind, content) {
  const wrapped = wrapSnippet(kind, content);
  const marker = MARKERS[kind];
  const exists = fs.existsSync(filePath);
  const current = exists ? fs.readFileSync(filePath, 'utf8') : '';

  const blockRe = new RegExp(`${marker.start}[\\s\\S]*?${marker.end}\\n?`, 'm');
  let next;
  let action;

  if (blockRe.test(current)) {
    next = current.replace(blockRe, wrapped);
    action = 'updated';
  } else if (current.trim().length === 0) {
    next = wrapped;
    action = 'created';
  } else {
    const suffix = current.endsWith('\n') ? '\n' : '\n\n';
    next = `${current}${suffix}${wrapped}`;
    action = 'appended';
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return { filePath, action };
}

module.exports = {
  MARKERS,
  wrapSnippet,
  hasSnippetBlock,
  applySnippetToFile,
};
