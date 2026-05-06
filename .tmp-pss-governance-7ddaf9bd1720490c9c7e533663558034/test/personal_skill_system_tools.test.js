'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateDocs, analyzeModule } = require('../personal-skill-system/skills/tools/lib/doc-module-analysis');
const { analyzeQuality } = require('../personal-skill-system/skills/tools/lib/quality-analysis');
const { analyzeSecurity } = require('../personal-skill-system/skills/tools/lib/security-analysis');
const { analyzeSkillSystem } = require('../personal-skill-system/skills/tools/lib/skill-system');
const { analyzeChange, classifySensitiveChangeSurface, buildChangeRisk } = require('../personal-skill-system/skills/tools/lib/change-analysis');
const { analyzeChartSpec } = require('../personal-skill-system/skills/tools/lib/chart-spec-analysis');
const { analyzeS2Config } = require('../personal-skill-system/skills/tools/lib/s2-config-analysis');
const { evaluatePreCommit, evaluatePreMerge } = require('../personal-skill-system/skills/tools/lib/analyzers');
const {
  chooseRouteFromFixtures,
  explainRouteSelection,
  generateRouteCandidates,
  selectBestRouteCandidate
} = require('../personal-skill-system/skills/tools/lib/skill-system-routing');
const manageSkillModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'manage-skill', 'scripts', 'run.js');

describe('personal skill system tool runtime', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pss-tools-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('generateDocs builds engineering-grade scaffold sections', () => {
    const report = generateDocs(tmpDir, { write: false });

    expect(report.preview['README.md']).toContain('## Public Surface');
    expect(report.preview['README.md']).toContain('## Runtime Signals');
    expect(report.preview['README.md']).toContain('## Verification');
    expect(report.preview['DESIGN.md']).toContain('## Runtime Boundary');
    expect(report.preview['DESIGN.md']).toContain('## Dependencies');
    expect(report.preview['DESIGN.md']).toContain('## Failure Modes');
  });

  test('generateDocs detects languages and entry candidates from the target module', () => {
    const entry = path.join(tmpDir, 'src', 'app.ts');
    const testFile = path.join(tmpDir, 'test', 'app.test.ts');
    const config = path.join(tmpDir, 'package.json');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(entry, 'export const app = true;\n');
    fs.writeFileSync(testFile, 'test("ok", () => expect(true).toBe(true));\n');
    fs.writeFileSync(config, '{"name":"demo"}\n');

    const report = generateDocs(tmpDir, { write: false });

    expect(report.signals.languages).toContain('JavaScript/TypeScript');
    expect(report.preview['README.md']).toContain('code files detected: 1');
    expect(report.preview['README.md']).toContain('test files detected: 1');
  });

  test('analyzeModule returns explicit module completeness findings for missing docs and tests', () => {
    const entry = path.join(tmpDir, 'src', 'app.ts');
    const config = path.join(tmpDir, 'package.json');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, 'export const app = true;\n');
    fs.writeFileSync(config, '{"name":"demo"}\n');

    const report = analyzeModule(tmpDir, {});
    const messages = report.findings.map((item) => item.message);

    expect(report.tool).toBe('verify-module');
    expect(report.summary).toContain('module completeness');
    expect(messages).toContain('README.md is missing');
    expect(messages).toContain('DESIGN.md is missing');
    expect(messages).toContain('code exists but no test-like files were detected');
  });

  test('analyzeQuality detects python-specific maintainability smells', () => {
    const sample = path.join(tmpDir, 'bad.py');
    fs.writeFileSync(sample, [
      'def bad(items=[]):',
      '    try:',
      '        return items',
      '    except:',
      '        return []',
      ''
    ].join('\n'));

    const report = analyzeQuality(tmpDir, {});
    const messages = report.issues.map(item => item.message);

    expect(messages).toContain('mutable default argument detected');
    expect(messages).toContain('bare except clause hides unexpected failures');
  });

  test('analyzeQuality detects async JS and TS contract smells', () => {
    const sample = path.join(tmpDir, 'ui.tsx');
    fs.writeFileSync(sample, [
      'useEffect(async () => {',
      '  await load();',
      '}, []);',
      "items.forEach(async item => await save(item));",
      'const x: any = data;',
      'const y: any = other;',
      'const z: any = third;',
      'new Promise(async (resolve) => { resolve(await load()); });',
      ''
    ].join('\n'));

    const report = analyzeQuality(tmpDir, {});
    const messages = report.issues.map(item => item.message);

    expect(messages).toContain('useEffect should not be declared async directly; wrap async work inside');
    expect(messages).toContain('async work inside forEach is easy to mis-sequence; prefer for...of or Promise.all');
    expect(messages).toContain('async Promise executor hides rejection flow and usually indicates a design smell');
    expect(messages).toContain('heavy use of explicit any (3) weakens local contracts');
  });

  test('analyzeSecurity detects unsafe deserialization and tls bypass', () => {
    const py = path.join(tmpDir, 'loader.py');
    const js = path.join(tmpDir, 'client.js');
    fs.writeFileSync(py, 'import yaml\ncfg = yaml.load(user_input)\n');
    fs.writeFileSync(js, 'https.request(url, { rejectUnauthorized: false })\n');

    const report = analyzeSecurity(tmpDir, {});
    const messages = report.findings.map(item => item.message);

    expect(messages).toContain('yaml.load may deserialize unsafe input');
    expect(messages).toContain('TLS verification appears disabled');
  });

  test('analyzeSecurity links untrusted input to dangerous sinks in one file', () => {
    const sample = path.join(tmpDir, 'handler.js');
    fs.writeFileSync(sample, [
      'app.get("/run", (req, res) => {',
      '  exec(req.query.cmd);',
      '  fs.readFile(req.query.path, () => {});',
      '  fetch(req.query.url);',
      '});',
      ''
    ].join('\n'));

    const report = analyzeSecurity(tmpDir, {});
    const messages = report.findings.map(item => item.message);

    expect(messages).toContain('untrusted input and command-execution primitives appear in the same file; review command-injection path');
    expect(messages).toContain('untrusted path-like input and filesystem operations appear in the same file; review traversal and overwrite risk');
    expect(messages).toContain('untrusted URL-like input and outbound fetch logic appear in the same file; review SSRF boundaries');
  });

  test('change risk helpers flag auth and config surfaces with stronger checks', () => {
    const sensitive = classifySensitiveChangeSurface([
      'src/auth/login.js',
      'config/deploy.yaml'
    ]);

    expect(sensitive).toEqual(expect.arrayContaining(['auth', 'config']));

    const risk = buildChangeRisk(
      { files: ['src/auth/login.js', 'config/deploy.yaml', 'src/api/handler.ts'] },
      { code: 2, doc: 0, test: 0, config: 1, asset: 0, other: 0 },
      ['src', 'config'],
      sensitive
    );

    expect(['medium', 'high', 'critical']).toContain(risk.level);
    expect(risk.recommendedChecks).toEqual(expect.arrayContaining(['verify-security', 'ship']));
  });

  test('analyzeSkillSystem passes on the portable bundle', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('pass');
    expect(report.metrics.skillFiles).toBeGreaterThan(0);
    expect(report.metrics.routeFixtures).toBeGreaterThan(0);
    expect(report.metrics.legacyRootMirrorFiles).toBe(0);
  });

  test('analyzeSkillSystem warns when a stable skill only has template-like trigger depth and no route evidence', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const skillFile = path.join(target, 'skills', 'domains', 'ai', 'SKILL.md');
    const original = fs.readFileSync(skillFile, 'utf8');
    const weakened = original.replace('trigger-keywords: [ai, llm, prompt, rag, agent, eval, 人工智能, 大模型, 提示词, 检索增强, 智能体, 评测, model application, agent system, 模型应用, 智能体系统]', 'trigger-keywords: [ai-signal]');
    fs.writeFileSync(skillFile, weakened, 'utf8');

    const fixturesPath = path.join(target, 'registry', 'route-fixtures.generated.json');
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    fixtures.cases = fixtures.cases.filter((item) => item.expect !== 'ai');
    fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    const messages = report.findings.map((item) => item.message);

    expect(messages).toContain('stable skill should expose at least two concrete trigger keywords');
    expect(messages).toContain("stable skill 'ai' has no route fixture evidence");
  });

  test('analyzeSkillSystem passes with runtime proof contracts on stable scripted skills', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);
    const runtimeProofWarnings = report.findings.filter((item) => item.message.includes('runtime proof bullets'));

    expect(runtimeProofWarnings).toHaveLength(0);
  });

  test('analyzeSkillSystem fails if legacy root skills mirror regains files', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const legacyFile = path.join(repoRoot, 'skills', 'rogue', 'SKILL.md');
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(legacyFile, '# rogue\n');

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.metrics.legacyRootMirrorFiles).toBe(1);
    expect(report.findings.some((item) => item.message.includes('legacy root skills/ mirror still contains'))).toBe(true);
  });

  test('manage-skill performs authoritative CRUD inside personal-skill-system only', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-managed-skill-${Date.now()}`;
      const createPayload = manageSkill.main(['create', 'workflow', skillName]);
      expect(createPayload.path).toBe(`personal-skill-system/skills/workflows/${skillName}`);
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName, 'SKILL.md'))).toBe(true);

      const showPayload = manageSkill.main(['show', skillName]);
      expect(showPayload.frontmatter.name).toBe(skillName);

      const readinessPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json');
      const readinessAfterCreate = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
      expect(readinessAfterCreate['schema-version']).toBe(1);
      expect(readinessAfterCreate.sources['runtime-proof']).toBe('registry/runtime-proof.generated.json');
      expect(readinessAfterCreate.summary['stable-user-invocable-skills']).toBeGreaterThanOrEqual(1);

      manageSkill.main(['archive', skillName]);
      const archivedSkill = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName, 'SKILL.md'), 'utf8');
      expect(archivedSkill).toContain('status: archived');

      const secondSkill = `temp-managed-skill-path-${Date.now()}`;
      manageSkill.main(['create', 'workflow', secondSkill]);
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', secondSkill, 'SKILL.md'))).toBe(true);

      manageSkill.main(['delete', '--path', `workflows/${skillName}`]);
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName))).toBe(false);

      manageSkill.main(['delete', '--path', `workflows/${secondSkill}`]);
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', secondSkill))).toBe(false);

      expect(fs.existsSync(path.join(repoRoot, 'skills'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof creates a declared-only entry for an experimental scripted skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-runtime-proof-${Date.now()}`;
      manageSkill.main(['create', 'tool', skillName]);
      manageSkill.main(['update', skillName, '--set', 'status=experimental']);

      const skillFile = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', skillName, 'SKILL.md');
      const original = fs.readFileSync(skillFile, 'utf8');
      const updated = original.replace(
        /## Runtime Proof[\s\S]*?\n## Run\n/,
        [
          '## Runtime Proof',
          '',
          '- `node scripts/run.js --target ./path --json` returns a structured experimental check report',
          '- explicit smoke tests can be linked later without rewriting the skill contract',
          '',
          '## Run',
          ''
        ].join('\n')
      );
      fs.writeFileSync(skillFile, updated, 'utf8');

      const payload = manageSkill.main(['sync-runtime-proof', skillName]);
      expect(payload.status).toBe('created');
      expect(payload.level).toBe('declared-only');

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === skillName);
      expect(entry.level).toBe('declared-only');
      expect(entry.contracts).toEqual([
        '`node scripts/run.js --target ./path --json` returns a structured experimental check report',
        'explicit smoke tests can be linked later without rewriting the skill contract'
      ]);
      expect(entry['evidence-tests']).toEqual([]);
      expect(entry['host-smoke']).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof carries stable skill smoke manifests into the registry', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'verify-quality']);
      expect(payload.status).toBe('updated');

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      expect(entry['host-smoke']).toEqual({
        manifest: 'skills/tools/verify-quality/scripts/smoke.json',
        commands: [
          {
            cwd: 'skill-dir',
            argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
            expect: { tool: 'verify-quality' },
            'timeout-ms': 10000
          }
        ]
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill run-host-smoke records append-only runtime evidence for a stable scripted skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['run-host-smoke', 'verify-quality', '--host', 'codex']);
      expect(payload.action).toBe('run-host-smoke');
      expect(payload.status).toBe('pass');
      expect(payload.results).toEqual([
        {
          skill: 'verify-quality',
          status: 'pass',
          commands: 1,
          passed_commands: 1
        }
      ]);

      const artifactPath = path.join(repoRoot, payload.artifact);
      expect(fs.existsSync(artifactPath)).toBe(true);

      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      expect(artifact['schema-version']).toBe(1);
      expect(artifact.host).toBe('codex');
      expect(artifact.selection).toEqual({
        scope: 'single',
        skills: ['verify-quality']
      });
      expect(artifact.results[0].skill).toBe('verify-quality');
      expect(artifact.results[0].status).toBe('pass');
      expect(artifact.results[0].commands[0].observed).toEqual({
        tool: 'verify-quality'
      });

      const scorecardPath = path.join(repoRoot, payload.scorecard);
      expect(fs.existsSync(scorecardPath)).toBe(true);

      const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
      expect(scorecard['schema-version']).toBe(1);
      expect(scorecard.summary['host-smoke-capable-skills']).toBeGreaterThanOrEqual(1);
      const verifyQuality = scorecard.skills.find((item) => item.skill === 'verify-quality');
      expect(verifyQuality['evidence-status']).toBe('passing');
      expect(verifyQuality['governance-status']).toBe('satisfied');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill suggests evidence tests from runtime analyzer names', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'verify-security', '--suggest-evidence-tests']);
      expect(payload.status).toBe('updated');
      expect(payload.evidence_test_source).toBe('existing');
      expect(payload.suggested_evidence_tests).toEqual([
        'test/personal_skill_system_tools.test.js::analyzeSecurity detects unsafe deserialization and tls bypass',
        'test/personal_skill_system_tools.test.js::analyzeSecurity links untrusted input to dangerous sinks in one file'
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof can auto-apply suggested evidence tests for a stable scripted skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-auto-evidence-${Date.now()}`;
      manageSkill.main(['create', 'tool', skillName]);
      manageSkill.main([
        'update',
        skillName,
        '--set', 'status=stable',
        '--set', 'description=Experimental quality wrapper. Use when explicit quality validation for a temporary surface is required.',
        '--set', 'trigger-keywords=[temp-auto-evidence,temp-quality-wrapper]'
      ]);

      const skillDir = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', skillName);
      const skillFile = path.join(skillDir, 'SKILL.md');
      const runFile = path.join(skillDir, 'scripts', 'run.js');
      const smokeFile = path.join(skillDir, 'scripts', 'smoke.json');

      fs.writeFileSync(runFile, [
        '#!/usr/bin/env node',
        "'use strict';",
        '',
        "const { parseArgs, resolveTarget, emit } = require('../../lib/runtime');",
        "const { analyzeQuality } = require('../../lib/analyzers');",
        '',
        'const args = parseArgs(process.argv.slice(2));',
        'const target = resolveTarget(args.target);',
        'const report = analyzeQuality(target, args);',
        `report.tool = '${skillName}';`,
        '',
        'emit(report, args);',
        ''
      ].join('\n'), 'utf8');

      fs.writeFileSync(smokeFile, JSON.stringify({
        'schema-version': 1,
        commands: [
          {
            cwd: 'skill-dir',
            argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
            expect: {
              tool: skillName
            },
            'timeout-ms': 10000
          }
        ]
      }, null, 2) + '\n', 'utf8');

      const original = fs.readFileSync(skillFile, 'utf8');
      const updated = original.replace(
        /## Runtime Proof[\s\S]*?\n## Run\n/,
        [
          '## Runtime Proof',
          '',
          '- `node scripts/run.js --target ./src --json` returns a structured quality wrapper report',
          '- quality findings are preserved as explicit issue entries',
          '',
          '## Run',
          ''
        ].join('\n')
      );
      fs.writeFileSync(skillFile, updated, 'utf8');

      const payload = manageSkill.main(['sync-runtime-proof', skillName, '--auto-evidence-tests']);
      expect(payload.status).toBe('created');
      expect(payload.evidence_test_source).toBe('suggested');
      expect(payload.suggested_evidence_tests).toHaveLength(2);
      expect(payload.suggested_evidence_tests).toEqual(expect.arrayContaining([
        'test/personal_skill_system_tools.test.js::analyzeQuality detects python-specific maintainability smells',
        'test/personal_skill_system_tools.test.js::analyzeQuality detects async JS and TS contract smells'
      ]));

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === skillName);
      expect(entry.level).toBe('declared-and-tested');
      expect(entry['evidence-tests']).toEqual(payload.suggested_evidence_tests);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof refuses host-smoked promotion without a valid smoke manifest', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const smokePath = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-security', 'scripts', 'smoke.json');
      fs.rmSync(smokePath);

      expect(() => manageSkill.main(['sync-runtime-proof', 'verify-security', '--level', 'host-smoked']))
        .toThrow("runtime-proof level 'host-smoked' for 'verify-security' requires a valid scripts/smoke.json manifest");
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof --all aligns contracts and removes stray entries', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const qualityEntry = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      qualityEntry.contracts = ['drifted contract', 'other drifted contract'];
      qualityEntry.level = 'host-smoked';
      runtimeProof.proofs.push({
        skill: 'ghost-runtime-proof',
        kind: 'tool',
        level: 'declared-only',
        contracts: ['ghost contract 1', 'ghost contract 2'],
        'evidence-tests': []
      });
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['sync-runtime-proof', '--all']);
      expect(payload.scope).toBe('all');
      expect(payload.updated.some((item) => item.skill === 'ghost-runtime-proof' && item.status === 'removed')).toBe(true);

      const synced = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const syncedQuality = synced.proofs.find((item) => item.skill === 'verify-quality');
      expect(synced.proofs.some((item) => item.skill === 'ghost-runtime-proof')).toBe(false);
      expect(syncedQuality.level).toBe('host-smoked');
      expect(syncedQuality.contracts).toEqual([
        '`node scripts/run.js --target ./src --json` returns a structured quality report with issue entries and severity',
        'language-specific maintainability smells are surfaced as findings rather than only aggregate scores'
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('routing library returns ranked candidates with explainable reasons', () => {
    const routeMap = {
      'default-threshold': 40,
      scoring: {
        'exact-match': 100,
        'alias-match': 80,
        'keyword-hit': 8,
        'negative-hit': -12,
        'namespace-hit': 10,
        'host-unsupported': -100
      },
      routes: [
        {
          skill: 'review',
          kind: 'workflow',
          priority: 90,
          activation: {
            'trigger-keywords': ['review', 'code review'],
            'negative-keywords': [],
            'requires-explicit-invocation': false
          },
          aliases: []
        },
        {
          skill: 'verify-change',
          kind: 'tool',
          priority: 50,
          rationale: {
            'wins-when': ['verify-change', 'diff analysis']
          },
          confidence: {
            'minimum-score': 65,
            'strong-score': 80,
            'very-strong-score': 93,
            'requires-fallback-below-minimum': true
          },
          fallback: {
            mode: 'do-not-auto-route',
            'clarify-question': 'Do you want explicit invocation of verify-change?',
            'default-action': 'wait-for-explicit-invocation'
          },
          activation: {
            'trigger-keywords': ['verify-change', 'diff analysis'],
            'negative-keywords': [],
            'requires-explicit-invocation': true
          },
          aliases: ['vc']
        },
        {
          skill: 'development',
          kind: 'domain',
          priority: 60,
          activation: {
            'trigger-keywords': ['implement', 'refactor'],
            'negative-keywords': [],
            'requires-explicit-invocation': false
          },
          aliases: []
        }
      ]
    };

    const query = 'Run verify-change on this diff and then provide review notes';
    const candidates = generateRouteCandidates(query, routeMap);
    const best = selectBestRouteCandidate(candidates, routeMap);
    const explanation = explainRouteSelection(query, routeMap);

    expect(candidates.length).toBe(3);
    expect(candidates[0]).toHaveProperty('scoreBreakdown');
    expect(candidates[0]).toHaveProperty('rerankScore');
    expect(candidates[0]).toHaveProperty('confidenceAssessment');
    expect(candidates[0]).toHaveProperty('reason');
    expect(explanation.rankedCandidates[0]).toHaveProperty('matched');
    expect(explanation.rankedCandidates[0]).toHaveProperty('semantic');
    expect(explanation.rankedCandidates[0]).toHaveProperty('confidence');
    expect(best.selectedSkill).toBe('verify-change');
    expect(explanation.selectionReason).toContain('explicit invocation precedence');
    expect(explanation.fallback.required).toBe(false);
  });

  test('chooseRouteFromFixtures keeps compatibility while exposing explicit precedence', () => {
    const routeMap = {
      'default-threshold': 40,
      scoring: {
        'exact-match': 100,
        'alias-match': 80,
        'keyword-hit': 8,
        'negative-hit': -12,
        'namespace-hit': 10,
        'host-unsupported': -100
      },
      routes: [
        {
          skill: 'review',
          kind: 'workflow',
          priority: 250,
          activation: {
            'trigger-keywords': ['review'],
            'negative-keywords': [],
            'requires-explicit-invocation': false
          },
          aliases: []
        },
        {
          skill: 'verify-quality',
          kind: 'tool',
          priority: 20,
          activation: {
            'trigger-keywords': ['verify-quality', 'quality scan'],
            'negative-keywords': [],
            'requires-explicit-invocation': true
          },
          aliases: []
        }
      ]
    };

    expect(chooseRouteFromFixtures('Run verify-quality and then do a review summary', routeMap)).toBe('verify-quality');
    expect(chooseRouteFromFixtures('No known skill signal appears in this prompt', routeMap)).toBeNull();
  });

  test('routing library uses confidence threshold to trigger single-question fallback for mixed intent', () => {
    const routeMap = {
      'default-threshold': 40,
      scoring: {
        'exact-match': 100,
        'alias-match': 80,
        'keyword-hit': 8,
        'negative-hit': -12
      },
      routes: [
        {
          skill: 'architecture',
          kind: 'domain',
          priority: 80,
          activation: {
            'intent-tags': ['design'],
            'trigger-keywords': ['architecture', 'service boundary'],
            'negative-keywords': [],
            'requires-explicit-invocation': false
          },
          aliases: ['system-design'],
          'conflicts-with': ['frontend-design'],
          rationale: {
            'wins-when': ['architecture', 'service boundary', 'migration'],
            'avoid-when': ['ui polish', 'visual style']
          },
          confidence: {
            'minimum-score': 101,
            'strong-score': 102,
            'very-strong-score': 103,
            'requires-fallback-below-minimum': true
          },
          fallback: {
            mode: 'ask-one-question',
            'clarify-question': 'Should this route use architecture or frontend-design as the primary skill for this request?',
            'default-action': 'route-to-highest-score-after-clarification',
            'safe-skill': 'frontend-design'
          }
        },
        {
          skill: 'frontend-design',
          kind: 'domain',
          priority: 79,
          activation: {
            'intent-tags': ['design'],
            'trigger-keywords': ['frontend', 'ui', 'ux'],
            'negative-keywords': [],
            'requires-explicit-invocation': false
          },
          aliases: ['ui-design'],
          'conflicts-with': ['architecture'],
          rationale: {
            'wins-when': ['frontend', 'ui', 'ux', 'component design'],
            'avoid-when': ['database schema', 'api migration']
          },
          confidence: {
            'minimum-score': 101,
            'strong-score': 102,
            'very-strong-score': 103,
            'requires-fallback-below-minimum': true
          },
          fallback: {
            mode: 'ask-one-question',
            'clarify-question': 'Should this route use frontend-design or architecture as the primary skill for this request?',
            'default-action': 'route-to-highest-score-after-clarification',
            'safe-skill': 'architecture'
          }
        }
      ]
    };

    const explanation = explainRouteSelection('Need service boundary planning and ui polish in the same request', routeMap);

    expect(explanation.selectedSkill).toBeNull();
    expect(explanation.fallback.required).toBe(true);
    expect(explanation.fallback.mode).toBe('ask-one-question');
    expect(explanation.confidence.score).toBeLessThan(explanation.confidence.minimumScore);
  });

  test('routing library triggers do-not-auto-route fallback for explicit-only validator signals', () => {
    const routeMap = {
      'default-threshold': 40,
      scoring: {
        'exact-match': 100,
        'alias-match': 80,
        'keyword-hit': 8,
        'negative-hit': -12
      },
      routes: [
        {
          skill: 'verify-change',
          kind: 'tool',
          priority: 90,
          activation: {
            'intent-tags': ['validate'],
            'trigger-keywords': ['diff analysis', 'change audit'],
            'negative-keywords': [],
            'requires-explicit-invocation': true
          },
          aliases: ['vc'],
          rationale: {
            'wins-when': ['diff analysis', 'change audit']
          },
          confidence: {
            'minimum-score': 65,
            'strong-score': 80,
            'very-strong-score': 93,
            'requires-fallback-below-minimum': true
          },
          fallback: {
            mode: 'do-not-auto-route',
            'clarify-question': 'Do you want explicit invocation of verify-change?',
            'default-action': 'wait-for-explicit-invocation'
          }
        }
      ]
    };

    const explanation = explainRouteSelection('Please do diff analysis and change audit before merge', routeMap);

    expect(explanation.selectedSkill).toBeNull();
    expect(explanation.fallback.required).toBe(true);
    expect(explanation.fallback.mode).toBe('do-not-auto-route');
    expect(explanation.fallback.clarifyQuestion).toContain('explicit invocation');
  });

  test('analyzeChartSpec catches core G2 misuse patterns', () => {
    const sample = path.join(tmpDir, 'bad-chart.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ width: 640, height: 480 });",
      'chart.source(data);',
      "chart.options({ type: 'interval', transform: { type: 'stackY' }, coordinate: { type: 'transpose' }, encode: { y: ['start', 'end'] } });",
      "chart.options({ type: 'ruleX' });",
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'missing-container',
      'deprecated-source',
      'transform-not-array',
      'transpose-coordinate-type',
      'range-encode-array',
      'hallucinated-mark-type',
      'multiple-options-calls',
      'missing-render'
    ]));
  });

  test('analyzeChartSpec allows legal spaceLayer to view composition', () => {
    const sample = path.join(tmpDir, 'space-layer-ok.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'spaceLayer',",
      '  children: [',
      "    { type: 'view', data: [{ x: 1, y: 2 }], children: [{ type: 'line', encode: { x: 'x', y: 'y' } }] },",
      "    { type: 'line', data: [{ x: 1, y: 2 }], encode: { x: 'x', y: 'y' } },",
      '  ],',
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).not.toContain('nested-view-in-children');
    expect(rules).not.toContain('missing-children-on-composition');
  });

  test('analyzeChartSpec catches interaction dependency and component shape issues', () => {
    const sample = path.join(tmpDir, 'interaction-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'line',",
      '  legend: false,',
      "  interaction: { legendFilter: true, scrollbarFilter: true, sliderWheel: true, tooltip: { items: [{ field: 'value' }] } },",
      '  slider: true,',
      "  scrollbar: { ratio: 0.2 },",
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'legend-filter-without-legend',
      'scrollbar-filter-without-scrollbar',
      'slider-wheel-without-slider',
      'tooltip-items-in-interaction',
      'slider-boolean-top-level',
      'scrollbar-missing-axis-key'
    ]));
  });

  test('analyzeChartSpec validates render API payload requirements', () => {
    const bad = path.join(tmpDir, 'render-bad.ts');
    const good = path.join(tmpDir, 'render-good.ts');
    fs.writeFileSync(bad, "fetch('https://antv-studio.alipay.com/api/gpt-vis', { method: 'POST', body: JSON.stringify({ data: [] }) });\n");
    fs.writeFileSync(good, [
      "fetch('https://antv-studio.alipay.com/api/gpt-vis', {",
      "  method: 'POST',",
      "  body: JSON.stringify({ type: 'line', source: 'chart-visualization-skills', data: [{ time: '2025-01', value: 10 }] }),",
      '});',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const badRules = report.findings.filter(item => item.file === 'render-bad.ts').map(item => item.rule);
    const goodRules = report.findings.filter(item => item.file === 'render-good.ts').map(item => item.rule);

    expect(badRules).toEqual(expect.arrayContaining(['render-api-missing-source', 'render-api-missing-type']));
    expect(goodRules).toHaveLength(0);
  });

  test('analyzeChartSpec catches guide, label transform, and component property drift', () => {
    const sample = path.join(tmpDir, 'annotation-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      "chart.guide().line({ start: ['min', 50], end: ['max', 50] });",
      'chart.options({',
      "  type: 'interval',",
      "  labels: [{ text: 'value', transform: { type: 'overflowHide' } }],",
      "  style: { tooltip: { title: 'name' } },",
      "  slider: { x: { handleFill: 'red' } },",
      "  scrollbar: { x: { fill: 'red', style: { thumbFill: 'red' } } },",
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'deprecated-guide-api',
      'label-transform-not-array',
      'tooltip-in-style-object',
      'slider-invalid-handle-fill-key',
      'scrollbar-invalid-fill-key',
      'component-style-wrapper-misuse'
    ]));
  });

  test('analyzeChartSpec catches range, image, and numeric label drift', () => {
    const sample = path.join(tmpDir, 'mark-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'range',",
      "  data: [{ x0: 20, x1: 40, y0: 50, y1: 80 }],",
      "  encode: { x: 'x0', x1: 'x1', y: 'y0', y1: 'y1' },",
      "  labels: [{ text: 0 }],",
      '});',
      "const imageChart = new Chart({ container: 'container2' });",
      'imageChart.options({',
      "  type: 'image',",
      "  data: [{ url: 'https://example.com/image.png' }],",
      "  encode: { x: 'x', y: 'y' },",
      '});',
      'chart.render();',
      'imageChart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'range-mark-x1-y1-misuse',
      'label-text-numeric-constant',
      'image-mark-missing-src-encode'
    ]));
  });

  test('analyzeChartSpec catches chartIndex, text data, and tooltip placement issues', () => {
    const sample = path.join(tmpDir, 'navigation-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'line',",
      "  interaction: { chartIndex: true },",
      "  tooltip: { crosshairs: true, css: { '.g2-tooltip': { color: '#fff' } } },",
      '});',
      "const textChart = new Chart({ container: 'container2' });",
      'textChart.options({',
      "  type: 'text',",
      "  encode: { x: 'month', y: 'value', text: 'label' },",
      '});',
      'chart.render();',
      'textChart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'chart-index-without-shared-tooltip',
      'tooltip-crosshairs-outside-interaction',
      'tooltip-css-outside-interaction',
      'text-mark-missing-data'
    ]));
  });

  test('analyzeChartSpec catches inline mark field mismatches and tooltip array misuse', () => {
    const sample = path.join(tmpDir, 'field-mismatch-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'view',",
      '  children: [',
      "    { type: 'lineY', data: [{ value: 100 }], encode: { y: 'y' } },",
      "    { type: 'rangeX', data: [{ start: 10, finish: 20 }], encode: { x: 'start', x1: 'end' } },",
      "    { type: 'text', data: [{ x: 'Mar', y: 91, label: 'peak' }], encode: { x: 'x', y: 'y', text: 'name' } },",
      '  ],',
      '});',
      "const tooltipChart = new Chart({ container: 'container2' });",
      'tooltipChart.options({',
      "  type: 'line',",
      "  interaction: [{ type: 'tooltip', items: [{ field: 'value' }] }],",
      '});',
      'chart.render();',
      'tooltipChart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'liney-encode-field-mismatch',
      'rangex-encode-field-mismatch',
      'textmark-encode-text-mismatch',
      'tooltip-items-in-interaction-array'
    ]));
  });

  test('analyzeChartSpec catches missing encode on rangeY and invalid image payloads', () => {
    const sample = path.join(tmpDir, 'range-image-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'rangeY',",
      "  data: [{ y: 54, y1: 72 }],",
      '});',
      "const imageChart = new Chart({ container: 'container2' });",
      'imageChart.options({',
      "  type: 'image',",
      "  encode: { x: 'x', y: 'y', src: btoa(imageData) },",
      '});',
      'chart.render();',
      'imageChart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'rangey-missing-encode',
      'image-mark-btoa-src',
      'image-mark-missing-size'
    ]));
  });

  test('analyzeChartSpec catches chartIndex and tooltip placement misuse', () => {
    const sample = path.join(tmpDir, 'chart-index-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'line',",
      "  interaction: { chartIndex: true },",
      "  tooltip: { crosshairs: true, css: { '.g2-tooltip': { color: '#fff' } } },",
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'chart-index-without-shared-tooltip',
      'tooltip-crosshairs-outside-interaction',
      'tooltip-css-outside-interaction'
    ]));
  });

  test('analyzeChartSpec allows legal chartIndex with shared tooltip', () => {
    const sample = path.join(tmpDir, 'chart-index-good.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'line',",
      "  interaction: { chartIndex: true, tooltip: { shared: true } },",
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).not.toContain('chart-index-without-shared-tooltip');
  });

  test('analyzeChartSpec catches text mark missing inherited or local data', () => {
    const sample = path.join(tmpDir, 'text-data-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'text',",
      "  encode: { x: 'month', y: 'value', text: 'label' },",
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toContain('text-mark-missing-data');
  });

  test('analyzeChartSpec allows text mark inheriting data from parent view', () => {
    const sample = path.join(tmpDir, 'text-data-good.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'view',",
      "  data: [{ month: 'Jan', value: 10, label: 'peak' }],",
      '  children: [',
      "    { type: 'text', encode: { x: 'month', y: 'value', text: 'label' } },",
      '  ],',
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).not.toContain('text-mark-missing-data');
  });

  test('analyzeChartSpec catches lineX lineY and image marks missing core bindings', () => {
    const sample = path.join(tmpDir, 'annotation-bindings-bad.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'view',",
      '  children: [',
      "    { type: 'lineX', data: [{ x: 5 }] },",
      "    { type: 'lineY', data: [{ y: 10 }] },",
      "    { type: 'image', data: [{ x: 'A', y: 1 }], encode: { x: 'x', y: 'y' } },",
      '  ],',
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'linex-missing-encode-x',
      'liney-missing-encode-y',
      'image-mark-missing-src'
    ]));
  });

  test('analyzeChartSpec allows lineX lineY and image marks with correct bindings', () => {
    const sample = path.join(tmpDir, 'annotation-bindings-good.ts');
    fs.writeFileSync(sample, [
      "import { Chart } from '@antv/g2';",
      "const chart = new Chart({ container: 'container' });",
      'chart.options({',
      "  type: 'view',",
      '  children: [',
      "    { type: 'lineX', data: [{ x: 5 }], encode: { x: 'x' } },",
      "    { type: 'lineY', data: [{ y: 10 }], encode: { y: 'y' } },",
      "    { type: 'image', data: [{ icon: 'https://example.com/a.png', x: 'A', y: 1 }], encode: { x: 'x', y: 'y', src: 'icon', size: 24 } },",
      '  ],',
      '});',
      'chart.render();',
      ''
    ].join('\n'));

    const report = analyzeChartSpec(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).not.toContain('linex-missing-encode-x');
    expect(rules).not.toContain('liney-missing-encode-y');
    expect(rules).not.toContain('image-mark-missing-src');
  });

  test('analyzeS2Config catches SheetComponent prop and field-shape issues', () => {
    const sample = path.join(tmpDir, 's2-bad.tsx');
    fs.writeFileSync(sample, [
      "import { SheetComponent } from '@antv/s2-react';",
      "import { PivotSheet } from '@antv/s2';",
      "const dataCfg = { fields: { rows: 'province', columns: ['type'] }, data: [] };",
      'const App = () => <SheetComponent sheetType="pivot" showPagination={true} />;',
      'const sheet = new PivotSheet(container, dataCfg, options);',
      ''
    ].join('\n'));

    const report = analyzeS2Config(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'sheetcomponent-missing-datacfg',
      'sheetcomponent-missing-options',
      's2-fields-rows-not-array',
      's2-pivot-like-fields-missing-values',
      's2-imperative-missing-destroy'
    ]));
  });

  test('analyzeS2Config allows healthy SheetComponent and dataCfg usage', () => {
    const sample = path.join(tmpDir, 's2-good.tsx');
    fs.writeFileSync(sample, [
      "import { SheetComponent } from '@antv/s2-react';",
      "const dataCfg = { data: [], fields: { rows: ['province'], columns: ['type'], values: ['price'] } };",
      "const options = { width: 600, height: 400, pagination: { current: 1, pageSize: 20 } };",
      'const App = () => <SheetComponent sheetType="pivot" dataCfg={dataCfg} options={options} showPagination={true} />;',
      ''
    ].join('\n'));

    const report = analyzeS2Config(tmpDir, {});

    expect(report.findings).toHaveLength(0);
  });

  test('analyzeS2Config catches table sheet inline field mismatch and missing render', () => {
    const sample = path.join(tmpDir, 's2-table-bad.tsx');
    fs.writeFileSync(sample, [
      "import { SheetComponent } from '@antv/s2-react';",
      "import { TableSheet } from '@antv/s2';",
      'const App = () => <SheetComponent sheetType="table" dataCfg={{ data: [], fields: { rows: [\'province\'] } }} options={{ width: 300, height: 200 }} />;',
      "const table = new TableSheet(container, { data: [], fields: { columns: ['a'] } }, options);",
      ''
    ].join('\n'));

    const report = analyzeS2Config(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toEqual(expect.arrayContaining([
      'table-sheet-inline-missing-columns',
      's2-imperative-missing-render',
      's2-imperative-missing-destroy'
    ]));
  });

  test('analyzeS2Config allows table sheet inline columns and imperative cleanup', () => {
    const sample = path.join(tmpDir, 's2-table-good.tsx');
    fs.writeFileSync(sample, [
      "import { SheetComponent } from '@antv/s2-react';",
      "import { TableSheet } from '@antv/s2';",
      'const App = () => <SheetComponent sheetType="table" dataCfg={{ data: [], fields: { columns: [\'province\', \'city\'] } }} options={{ width: 300, height: 200 }} />;',
      "const table = new TableSheet(container, { data: [], fields: { columns: ['a'] } }, options);",
      'table.render();',
      'table.destroy();',
      ''
    ].join('\n'));

    const report = analyzeS2Config(tmpDir, {});

    expect(report.findings).toHaveLength(0);
  });

  test('analyzeS2Config catches showPagination without inline pagination config', () => {
    const sample = path.join(tmpDir, 's2-pagination-bad.tsx');
    fs.writeFileSync(sample, [
      "import { SheetComponent } from '@antv/s2-react';",
      'const App = () => <SheetComponent sheetType="pivot" dataCfg={{ data: [], fields: { rows: [\'province\'], columns: [\'type\'], values: [\'price\'] } }} options={{ width: 300, height: 200 }} showPagination={true} />;',
      ''
    ].join('\n'));

    const report = analyzeS2Config(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).toContain('showpagination-without-pagination');
  });

  test('analyzeS2Config allows showPagination when inline pagination config exists', () => {
    const sample = path.join(tmpDir, 's2-pagination-good.tsx');
    fs.writeFileSync(sample, [
      "import { SheetComponent } from '@antv/s2-react';",
      'const App = () => <SheetComponent sheetType="pivot" dataCfg={{ data: [], fields: { rows: [\'province\'], columns: [\'type\'], values: [\'price\'] } }} options={{ width: 300, height: 200, pagination: { current: 1, pageSize: 20 } }} showPagination={true} />;',
      ''
    ].join('\n'));

    const report = analyzeS2Config(tmpDir, {});
    const rules = report.findings.map(item => item.rule);

    expect(rules).not.toContain('showpagination-without-pagination');
  });

  test('pre-commit gate ignores quality debt outside changed files', () => {
    const changedDoc = path.join(tmpDir, 'README.md');
    const debtCode = path.join(tmpDir, 'lib', 'legacy.js');

    fs.mkdirSync(path.dirname(debtCode), { recursive: true });
    fs.writeFileSync(changedDoc, '# readme\n');
    fs.writeFileSync(debtCode, [
      'function debt(a, b, c, d, e, f, g) {',
      '  if (a) {',
      '    if (b) {',
      '      if (c) {',
      '        if (d) {',
      '          if (e) {',
      '            if (f) {',
      '              if (g) { return 1; }',
      '            }',
      '          }',
      '        }',
      '      }',
      '    }',
      '  }',
      '  return 0;',
      '}',
      ''
    ].join('\n'));

    const report = evaluatePreCommit(tmpDir, { changedFiles: ['README.md'] });

    expect(report.status).toBe('pass');
    expect(report.detail.qualityDebtOutsideChangedFiles).toBeGreaterThan(0);
    expect(report.detail.qualityWarningsInChangedFiles).toBe(0);
  });

  test('pre-commit gate blocks quality warnings inside changed files', () => {
    const changedCode = path.join(tmpDir, 'src', 'risk.js');
    fs.mkdirSync(path.dirname(changedCode), { recursive: true });
    const longBody = Array.from({ length: 70 }, (_, index) => `  const v${index} = ${index};`).join('\n');
    fs.writeFileSync(changedCode, `function risk() {\n${longBody}\n  return true;\n}\n`);

    const report = evaluatePreCommit(tmpDir, { changedFiles: ['src/risk.js'] });

    expect(report.status).toBe('block');
    expect(report.blockers).toContain('quality scan reported warning-level issues in changed files');
    expect(report.detail.qualityWarningsInChangedFiles).toBeGreaterThan(0);
  });

  test('analyzeChange accepts --changed-files fallback when git is unavailable', () => {
    const changedCode = path.join(tmpDir, 'src', 'app.js');
    fs.mkdirSync(path.dirname(changedCode), { recursive: true });
    fs.writeFileSync(changedCode, 'module.exports = 1;\n');

    const report = analyzeChange(tmpDir, { mode: 'working', changedFiles: ['src/app.js'] });

    expect(report.summary).toContain('external-arg');
    expect(report.changedFiles).toContain('src/app.js');
    expect(report.findings.map(item => item.message)).toContain('using externally supplied changed files from --changed-files');
  });

  test('analyzeChange normalizes rename-style changed files and exposes change kinds', () => {
    const changedCode = path.join(tmpDir, 'src', 'new-name.js');
    fs.mkdirSync(path.dirname(changedCode), { recursive: true });
    fs.writeFileSync(changedCode, 'module.exports = 3;\n');

    const report = analyzeChange(tmpDir, { mode: 'working', changedFiles: ['src/old-name.js -> src/new-name.js'] });

    expect(report.changedFiles).toContain('src/new-name.js');
    expect(report.changeKinds.modified).toBe(1);
  });

  test('analyzeChange uses env fallback when git repo is absent', () => {
    const changedCode = path.join(tmpDir, 'src', 'env-app.js');
    const prev = process.env.PSS_CHANGED_FILES;
    fs.mkdirSync(path.dirname(changedCode), { recursive: true });
    fs.writeFileSync(changedCode, 'module.exports = 2;\n');
    process.env.PSS_CHANGED_FILES = 'src/env-app.js';

    try {
      const report = analyzeChange(tmpDir, 'working');

      expect(report.summary).toContain('external-env-no-git');
      expect(report.changedFiles).toContain('src/env-app.js');
      expect(report.findings.map(item => item.message)).toContain('using externally supplied changed files from environment fallback');
    } finally {
      if (prev === undefined) delete process.env.PSS_CHANGED_FILES;
      else process.env.PSS_CHANGED_FILES = prev;
    }
  });

  test('pre-merge gate scopes security blockers to changed files when provided', () => {
    const changedCode = path.join(tmpDir, 'src', 'safe.js');
    const changedTest = path.join(tmpDir, 'src', 'safe.test.js');
    const changedReadme = path.join(tmpDir, 'README.md');
    const legacyRisk = path.join(tmpDir, 'legacy', 'danger.js');
    fs.mkdirSync(path.dirname(changedCode), { recursive: true });
    fs.mkdirSync(path.dirname(legacyRisk), { recursive: true });
    fs.writeFileSync(changedCode, 'export const ok = true;\n');
    fs.writeFileSync(changedTest, 'test("ok", () => expect(true).toBe(true));\n');
    fs.writeFileSync(changedReadme, '# module\n');
    fs.writeFileSync(legacyRisk, 'exec(req.query.cmd);\n');

    const report = evaluatePreMerge(tmpDir, { changedFiles: ['src/safe.js', 'src/safe.test.js', 'README.md'] });

    expect(report.status).toBe('pass');
    expect(report.detail.securityFindingsInChangedFiles).toBe(0);
    expect(report.detail.securityWarningsOutsideChangedFiles).toBeGreaterThan(0);
  });
});
