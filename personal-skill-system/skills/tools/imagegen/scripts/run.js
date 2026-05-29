#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    prompt: '',
    mode: null,
    input: null,
    assetType: null,
    transparent: false,
    projectBound: false,
    output: null,
    host: process.env.CODE_ABYSS_HOST || process.env.AI_HOST || 'unknown',
    json: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prompt' && argv[i + 1]) {
      options.prompt = argv[++i];
    } else if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[++i];
    } else if (arg === '--input' && argv[i + 1]) {
      options.input = argv[++i];
    } else if (arg === '--asset-type' && argv[i + 1]) {
      options.assetType = argv[++i];
    } else if (arg === '--transparent') {
      options.transparent = true;
    } else if (arg === '--project-bound') {
      options.projectBound = true;
    } else if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i];
    } else if (arg === '--host' && argv[i + 1]) {
      options.host = argv[++i];
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

function slugify(text) {
  return String(text || 'generated-image')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'generated-image';
}

function inferMode(options) {
  if (options.mode) return options.mode;
  return options.input ? 'edit' : 'generate';
}

function classifyUseCase(options, mode) {
  const haystack = `${options.assetType || ''} ${options.prompt || ''}`.toLowerCase();
  if (options.transparent) return 'background-extraction';
  if (mode === 'edit') return 'precise-object-edit';
  if (/product|mockup|packaging/.test(haystack)) return 'product-mockup';
  if (/hero|landing|banner/.test(haystack)) return 'ads-marketing';
  if (/sprite|game|character/.test(haystack)) return 'stylized-concept';
  if (/diagram|infographic|chart/.test(haystack)) return 'infographic-diagram';
  if (/logo|icon/.test(haystack)) return 'logo-brand';
  return 'raster-generation';
}

function buildOutputPath(options) {
  if (options.output) return options.output;
  if (!options.projectBound) return null;
  const ext = options.transparent ? '.png' : '.png';
  return path.join('assets', 'generated', `${slugify(options.prompt)}${ext}`).replace(/\\/g, '/');
}

function buildPlan(options) {
  const mode = inferMode(options);
  if (!['generate', 'edit'].includes(mode)) {
    throw new Error("--mode must be 'generate' or 'edit'");
  }

  const prompt = options.prompt || 'sample generated image';
  const inputExists = options.input ? fs.existsSync(path.resolve(options.input)) : null;
  const warnings = [];

  if (mode === 'edit' && !options.input) {
    warnings.push('edit mode needs an input image visible to the active host');
  }
  if (options.input && inputExists === false) {
    warnings.push(`input image was not found: ${options.input}`);
  }
  if (options.transparent) {
    warnings.push('transparent output requires native alpha support or a validated background-removal workflow');
  }
  if (!options.projectBound && !options.output) {
    warnings.push('preview-only output may remain in host-managed storage unless project-bound persistence is requested');
  }

  const outputPath = buildOutputPath(options);
  const useCase = classifyUseCase({ ...options, prompt }, mode);

  return {
    'schema-version': 1,
    tool: 'imagegen',
    mode,
    use_case: useCase,
    host: options.host,
    execution: {
      performs_generation: false,
      requires_host_image_capability: true,
      recommended_path: options.host === 'codex'
        ? 'use the active Codex image tool when available, then persist project-bound assets into the workspace'
        : 'use the host-supported image runtime or an approved pack/API bridge, then persist project-bound assets into the workspace'
    },
    asset_policy: {
      asset_type: options.assetType || 'unspecified',
      project_bound: Boolean(options.projectBound || outputPath),
      output_path: outputPath,
      overwrite_policy: 'do not overwrite existing assets unless explicitly requested'
    },
    prompt_spec: {
      primary_request: prompt,
      input_image: options.input,
      transparent_background: options.transparent,
      constraints: options.transparent
        ? ['preserve subject edges', 'validate alpha channel before use', 'no watermark']
        : ['no watermark', 'preserve explicit user constraints']
    },
    warnings
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('usage: node scripts/run.js --prompt <text> [--mode generate|edit] [--input file] [--project-bound] [--transparent] [--json]\n');
    return;
  }
  const plan = buildPlan(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  process.stdout.write(`imagegen plan: ${plan.mode} ${plan.use_case}\n`);
  process.stdout.write(`requires host image capability: ${plan.execution.requires_host_image_capability}\n`);
  if (plan.asset_policy.output_path) {
    process.stdout.write(`planned output: ${plan.asset_policy.output_path}\n`);
  }
  if (plan.warnings.length) {
    process.stdout.write(`warnings: ${plan.warnings.join('; ')}\n`);
  }
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
  buildPlan,
  buildOutputPath,
  classifyUseCase,
  inferMode,
  slugify
};
