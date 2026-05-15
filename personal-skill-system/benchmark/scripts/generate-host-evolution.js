#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildHostEvolutionReport,
  getHostEvolutionPath
} = require('../../skills/tools/lib/skill-system-host-evolution');

function parseArgs(argv) {
  const args = {
    root: path.resolve(__dirname, '..', '..'),
    output: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') {
      const next = argv[i + 1];
      if (next) {
        args.root = path.resolve(next);
        i += 1;
      }
      continue;
    }
    if (token === '--output') {
      const next = argv[i + 1];
      if (next) {
        args.output = path.resolve(next);
        i += 1;
      }
    }
  }

  args.output = args.output || getHostEvolutionPath(args.root);
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = buildHostEvolutionReport(args.root);

  fs.writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(`Generated host evolution report at ${args.output}\n`);
}

main();
