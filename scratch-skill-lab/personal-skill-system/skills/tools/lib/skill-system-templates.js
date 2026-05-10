'use strict';

const fs = require('fs');
const path = require('path');
const {
  REQUIRED_FRONTMATTER_KEYS,
  rel,
  readUtf8,
  parseFrontmatter,
  listMarkdownFiles,
  parseJsonFile,
  getSmokeManifestFile,
  validateSmokeManifest,
  readReferencePaths
} = require('./skill-system-common');
const {
  OPENAI_METADATA_KEYS,
  buildOpenAiMetadata,
  readOpenAiMetadataFile
} = require('./skill-system-host-metadata');

const TEMPLATE_KINDS = ['adapter', 'domain', 'guard', 'router', 'tool', 'workflow'];
const SCRIPTED_TEMPLATE_KINDS = new Set(['guard', 'tool']);
const MIN_TEMPLATE_REFERENCES_BY_KIND = {
  adapter: 2,
  router: 2,
  domain: 3,
  workflow: 3,
  tool: 2,
  guard: 2
};
const TEMPLATE_VERSION_FIELD = 'template-version';
const SCAFFOLD_ORIGIN_FIELD = 'scaffold-origin';
const SCAFFOLD_VERSION_FIELD = 'scaffold-version';

function normalizePositiveInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function getTemplateDir(targetDir, kind) {
  return path.join(targetDir, 'templates', 'skill', kind);
}

function readTemplateLineage(targetDir, kind) {
  const templateDir = getTemplateDir(targetDir, kind);
  const skillFile = path.join(templateDir, 'SKILL.md');
  const text = readUtf8(skillFile);
  if (text == null) {
    return null;
  }

  const parsed = parseFrontmatter(text);
  if (parsed.error) {
    return null;
  }

  const origin = String(parsed.data.name || '').trim();
  const version = normalizePositiveInteger(parsed.data[TEMPLATE_VERSION_FIELD]);
  if (!origin || version == null) {
    return null;
  }

  return {
    origin,
    version
  };
}

function validateTemplateScaffold(targetDir, kind, findings) {
  const templateDir = getTemplateDir(targetDir, kind);
  const skillFile = path.join(templateDir, 'SKILL.md');
  const relative = rel(targetDir, skillFile);

  if (!fs.existsSync(templateDir) || !fs.statSync(templateDir).isDirectory()) {
    findings.push({ severity: 'error', file: rel(targetDir, templateDir), message: `missing template scaffold directory for '${kind}'` });
    return false;
  }

  const text = readUtf8(skillFile);
  if (text == null) {
    findings.push({ severity: 'error', file: relative, message: 'template SKILL.md is unreadable as utf8 text' });
    return false;
  }

  const parsed = parseFrontmatter(text);
  if (parsed.error) {
    findings.push({ severity: 'error', file: relative, message: `template frontmatter error: ${parsed.error}` });
    return false;
  }

  const data = parsed.data;
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!(key in data)) {
      findings.push({ severity: 'error', file: relative, message: `template missing frontmatter key '${key}'` });
    }
  }

  if (data.kind !== kind) {
    findings.push({ severity: 'error', file: relative, message: `template kind '${data.kind}' does not match directory '${kind}'` });
  }

  const expectedName = `${kind}-template`;
  if (data.name !== expectedName) {
    findings.push({ severity: 'warning', file: relative, message: `template name should usually be '${expectedName}'` });
  }

  const templateVersion = normalizePositiveInteger(data[TEMPLATE_VERSION_FIELD]);
  if (templateVersion == null) {
    findings.push({
      severity: 'error',
      file: relative,
      message: `template '${kind}' must declare a positive integer '${TEMPLATE_VERSION_FIELD}'`
    });
  }

  if (data.status !== 'draft') {
    findings.push({ severity: 'warning', file: relative, message: `template status should normally stay 'draft', got '${data.status}'` });
  }

  const referenceDir = path.join(templateDir, 'references');
  const referenceFiles = listMarkdownFiles(referenceDir);
  const minTemplateReferences = MIN_TEMPLATE_REFERENCES_BY_KIND[kind] || 2;
  if (referenceFiles.length < minTemplateReferences) {
    findings.push({
      severity: 'error',
      file: relative,
      message: `template '${kind}' only has ${referenceFiles.length} reference files; expected at least ${minTemplateReferences}`
    });
  }

  for (const refPath of readReferencePaths(text)) {
    if (!fs.existsSync(path.join(templateDir, refPath))) {
      findings.push({ severity: 'error', file: relative, message: `template declares missing reference '${refPath}'` });
    }
  }

  const hostMetadataFile = path.join(templateDir, 'agents', 'openai.yaml');
  if (!fs.existsSync(hostMetadataFile)) {
    findings.push({ severity: 'error', file: relative, message: `template '${kind}' is missing agents/openai.yaml` });
  } else {
    const parsedHostMetadata = readOpenAiMetadataFile(hostMetadataFile);
    if (parsedHostMetadata.error) {
      findings.push({
        severity: 'error',
        file: rel(targetDir, hostMetadataFile),
        message: `template host metadata parse failed: ${parsedHostMetadata.error}`
      });
    } else {
      const expectedHostMetadata = buildOpenAiMetadata({
        name: data.name,
        title: data.title,
        description: data.description,
        kind: data.kind
      });
      for (const key of OPENAI_METADATA_KEYS) {
        if (normalizeValue(parsedHostMetadata.data[key]) !== normalizeValue(expectedHostMetadata[key])) {
          findings.push({
            severity: 'error',
            file: rel(targetDir, hostMetadataFile),
            message: `template host metadata '${key}' is out of sync with SKILL.md`
          });
        }
      }
    }
  }

  if (SCRIPTED_TEMPLATE_KINDS.has(kind)) {
    const scriptPath = path.join(templateDir, 'scripts', 'run.js');
    if (!fs.existsSync(scriptPath)) {
      findings.push({ severity: 'error', file: relative, message: `scripted template '${kind}' is missing scripts/run.js` });
    }

    const smokeManifestFile = getSmokeManifestFile(templateDir);
    if (!fs.existsSync(smokeManifestFile)) {
      findings.push({ severity: 'error', file: relative, message: `scripted template '${kind}' is missing scripts/smoke.json` });
    } else {
      const smokeManifest = parseJsonFile(smokeManifestFile);
      if (smokeManifest.error) {
        findings.push({
          severity: 'error',
          file: rel(targetDir, smokeManifestFile),
          message: `template smoke manifest parse failed: ${smokeManifest.error}`
        });
      } else {
        for (const error of validateSmokeManifest(smokeManifest.data)) {
          findings.push({
            severity: 'error',
            file: rel(targetDir, smokeManifestFile),
            message: error
          });
        }
      }
    }
  }

  return true;
}

function normalizeValue(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function analyzeTemplateScaffolds(targetDir, findings) {
  let validCount = 0;
  for (const kind of TEMPLATE_KINDS) {
    if (validateTemplateScaffold(targetDir, kind, findings)) {
      validCount += 1;
    }
  }
  return validCount;
}

module.exports = {
  TEMPLATE_KINDS,
  TEMPLATE_VERSION_FIELD,
  SCAFFOLD_ORIGIN_FIELD,
  SCAFFOLD_VERSION_FIELD,
  readTemplateLineage,
  analyzeTemplateScaffolds
};
