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
const {
  DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS,
  DERIVED_GOVERNANCE_ARTIFACT_PATHS
} = require('../personal-skill-system/skills/tools/lib/skill-system-derived-governance-contract');
const {
  SYSTEM_READINESS_SCHEMA_VERSION
} = require('../personal-skill-system/skills/tools/lib/skill-system-readiness');
const {
  HOST_EVOLUTION_SCHEMA_VERSION
} = require('../personal-skill-system/skills/tools/lib/skill-system-host-evolution');
const manageSkillModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'manage-skill', 'scripts', 'run.js');

describe('personal skill system tool runtime', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pss-tools-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedTopDeveloperRawFixture(repoRoot) {
    const bundleRoot = path.join(repoRoot, 'personal-skill-system');
    const integrationPath = path.join(bundleRoot, 'registry', 'top-developer-integration.generated.json');
    const integration = JSON.parse(fs.readFileSync(integrationPath, 'utf8'));
    const rawRoot = path.join(repoRoot, 'top_developer');
    const sourceIndex = Array.isArray(integration['source-index']) ? integration['source-index'] : [];
    const sourceSkills = [...new Set(sourceIndex
      .map((entry) => String(entry && entry['source-skill'] || '').trim())
      .filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));

    fs.mkdirSync(rawRoot, { recursive: true });
    for (const sourceSkill of sourceSkills) {
      const sourceDir = path.join(rawRoot, sourceSkill);
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), [
        '---',
        `name: ${sourceSkill}`,
        `description: raw expert source fixture for ${sourceSkill}`,
        '---',
        '',
        `# ${sourceSkill}`,
        ''
      ].join('\n'));
    }
  }

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

    expect(report.metrics.skillFiles).toBeGreaterThan(0);
    expect(report.metrics.routeFixtures).toBeGreaterThan(0);
    expect(report.metrics.legacyRootMirrorFiles).toBe(0);
    expect(report.findings.some((item) => item.message.includes('runtime proof bullets'))).toBe(false);
  });

  test('resolveTarget can recover repo-relative bundle paths from nested skill directories', () => {
    const runtime = require('../personal-skill-system/skills/tools/lib/runtime');
    const originalCwd = process.cwd();
    const nestedDir = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'verify-skill-system');
    try {
      process.chdir(nestedDir);
      const resolved = runtime.resolveTarget('personal-skill-system');
      expect(resolved).toBe(path.join(__dirname, '..', 'personal-skill-system'));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('resolveSkillBundleTarget prefers the governed bundle root from the repo root', () => {
    const runtime = require('../personal-skill-system/skills/tools/lib/runtime');
    const originalCwd = process.cwd();
    const repoRoot = path.join(__dirname, '..');
    try {
      process.chdir(repoRoot);
      const resolved = runtime.resolveSkillBundleTarget('.', {
        scriptPath: path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-skill-system', 'scripts', 'run.js')
      });
      expect(resolved).toBe(path.join(repoRoot, 'personal-skill-system'));
    } finally {
      process.chdir(originalCwd);
    }
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
      const createdSkillText = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName, 'SKILL.md'), 'utf8');
      expect(createdSkillText).toContain('scaffold-origin: workflow-template');
      expect(createdSkillText).toContain('scaffold-version: 1');

      const showPayload = manageSkill.main(['show', skillName]);
      expect(showPayload.frontmatter.name).toBe(skillName);

      const readinessPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json');
      const readinessAfterCreate = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
      expect(readinessAfterCreate['schema-version']).toBe(SYSTEM_READINESS_SCHEMA_VERSION);
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

  test('manage-skill admission-check reuses an existing strong route before adding a sibling skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', 'we need to create skill crud flows and archive skill records safely']);

      expect(payload.action).toBe('admission-check');
      expect(payload.recommendation).toEqual(expect.objectContaining({
        action: 'reuse-existing-skill',
        target_skill: 'manage-skill',
        target_kind: 'tool'
      }));
      expect(payload.candidates[0]).toEqual(expect.objectContaining({
        skill: 'manage-skill',
        kind: 'tool'
      }));
      expect(payload.follow_up[0]).toContain('show manage-skill');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check suggests upgrading an existing weakly matched route before adding a peer', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', 'release process needs stronger verification checklist']);

      expect(payload.action).toBe('admission-check');
      expect(payload.recommendation.action).toBe('upgrade-existing-skill');
      expect(payload.recommendation.target_skill).toBe('ship');
      expect(payload.recommendation.target_kind).toBe('workflow');
      expect(payload.suggested_kind).toBe('tool');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check can recommend a new guarded skill when no current route owns the request', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', '--kind', 'guard', 'we need a new policy gate that blocks unsafe skill deletion during pack release']);

      expect(payload.action).toBe('admission-check');
      expect(payload.recommendation).toEqual(expect.objectContaining({
        action: 'create-new-skill',
        suggested_kind: 'guard'
      }));
      expect(payload.suggested_kind).toBe('guard');
      expect(payload['suggested-skill-name']).toBeTruthy();
      expect(payload.blueprint).toEqual(expect.objectContaining({
        action: 'show-skill-blueprint',
        kind: 'guard',
        skill: payload['suggested-skill-name'],
        'top-tier-readiness': expect.objectContaining({
          blockers: expect.any(Array)
        })
      }));
      expect(payload.follow_up[0]).toBe('create the governed scaffold with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js create guard <skill-name>');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-future-skill-pipeline unifies opportunity, admission, and pending-scaffold host blockage', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const opportunityPath = path.join(target, 'registry', 'skill-opportunity-queue.generated.json');
      const opportunityQueue = JSON.parse(fs.readFileSync(opportunityPath, 'utf8'));
      opportunityQueue.entries.push({
        'opportunity-id': '20260518-future-pipeline-demo',
        summary: 'Need a governed future pipeline demo skill',
        'suggested-kind': 'tool',
        priority: 'high',
        status: 'planned',
        horizon: 'next',
        'recorded-at': '2026-05-18T00:00:00.000Z'
      });
      fs.writeFileSync(opportunityPath, JSON.stringify(opportunityQueue, null, 2) + '\n', 'utf8');

      const admissionPath = path.join(target, 'registry', 'admission-ledger.generated.json');
      const admissionLedger = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
      admissionLedger.entries.push({
        'request-id': '20260518-future-pipeline-demo',
        request: 'Need a governed future pipeline demo skill',
        'suggested-kind': 'tool',
        'opportunity-id': '20260518-future-pipeline-demo',
        decision: {
          action: 'create-new-skill',
          suggested_kind: 'tool'
        },
        status: 'blocked',
        'recorded-at': '2026-05-18T01:00:00.000Z',
        note: 'blocked on boundary clarification'
      });
      fs.writeFileSync(admissionPath, JSON.stringify(admissionLedger, null, 2) + '\n', 'utf8');

      const pendingPath = path.join(target, 'registry', 'pending-scaffolds.generated.json');
      const pendingRegistry = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
      pendingRegistry.entries.push({
        'pending-id': 'pending-future-pipeline-demo',
        kind: 'tool',
        skill: 'future-pipeline-demo',
        path: 'skills/tools/future-pipeline-demo',
        status: 'blocked',
        'recorded-at': '2026-05-18T02:00:00.000Z',
        files: [
          {
            path: 'skills/tools/future-pipeline-demo/SKILL.md',
            content: 'placeholder'
          }
        ],
        'request-id': '20260518-future-pipeline-demo',
        'opportunity-id': '20260518-future-pipeline-demo',
        'rerun-command': 'node personal-skill-system/skills/tools/manage-skill/scripts/run.js materialize-pending-scaffold future-pipeline-demo',
        'host-constraint': {
          code: 'EPERM',
          message: 'authoritative tree is not writable'
        }
      });
      fs.writeFileSync(pendingPath, JSON.stringify(pendingRegistry, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['show-future-skill-pipeline', '--blocked']);

      expect(payload.action).toBe('show-future-skill-pipeline');
      expect(payload.summary).toEqual(expect.objectContaining({
        total: expect.any(Number),
        active: expect.any(Number),
        blocked: expect.any(Number),
        stages: expect.objectContaining({
          'blocked-on-host': expect.any(Number)
        })
      }));
      expect(payload.filters).toEqual({ blocked: true });
      expect(payload['host-evolution']).toEqual(expect.objectContaining({
        status: expect.any(String),
        capabilities: expect.any(Object),
        summary: expect.any(Object)
      }));
      expect(payload.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          'thread-id': 'opportunity:20260518-future-pipeline-demo',
          stage: 'blocked-on-host',
          blocked: true,
          kind: 'tool',
          skill: 'future-pipeline-demo',
          'opportunity-id': '20260518-future-pipeline-demo',
          'request-id': '20260518-future-pipeline-demo',
          'pending-id': 'pending-future-pipeline-demo'
        })
      ]));
      const entry = payload.entries.find((item) => item['thread-id'] === 'opportunity:20260518-future-pipeline-demo');
      expect(entry.blockers).toEqual(expect.arrayContaining([
        'authoritative tree is not writable'
      ]));
      expect(entry.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-opportunity-queue --opportunity-id 20260518-future-pipeline-demo',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-admission-ledger --request-id 20260518-future-pipeline-demo',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-pending-scaffolds --pending-id pending-future-pipeline-demo',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js diagnose-host-evolution'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill read-only governance views accept an explicit --json flag', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const futurePipeline = manageSkill.main(['show-future-skill-pipeline', '--blocked', '--json']);
      expect(futurePipeline.action).toBe('show-future-skill-pipeline');
      expect(futurePipeline.filters).toEqual({ blocked: true });

      const scaffoldGovernance = manageSkill.main(['show-scaffold-governance', '--kind', 'workflow', '--json']);
      expect(scaffoldGovernance.action).toBe('show-scaffold-governance');
      expect(scaffoldGovernance.summary).toEqual(expect.objectContaining({
        templates: expect.any(Object),
        skills: expect.any(Object)
      }));

      const expertFamilies = manageSkill.main(['show-expert-source-families', '--json']);
      expect(expertFamilies.action).toBe('show-expert-source-families');
      expect(Array.isArray(expertFamilies.families)).toBe(true);

      const topTier = manageSkill.main(['assess-top-tier', 'manage-skill', '--json']);
      expect(topTier.action).toBe('assess-top-tier');
      expect(topTier.skill).toBe('manage-skill');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-blueprint previews governed future-skill scaffold and top-tier debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-skill-blueprint', 'domain', 'reliability-governance-v2']);

      expect(payload.action).toBe('show-skill-blueprint');
      expect(payload.kind).toBe('domain');
      expect(payload.skill).toBe('reliability-governance-v2');
      expect(payload.path).toBe('personal-skill-system/skills/domains/reliability-governance-v2');
      expect(payload.template).toEqual(expect.objectContaining({
        source: 'personal-skill-system/templates/skill/domain'
      }));
      expect(payload.frontmatter).toEqual(expect.objectContaining({
        name: 'reliability-governance-v2',
        status: 'draft'
      }));
      expect(payload.files).toEqual(expect.arrayContaining([
        'SKILL.md',
        'agents/openai.yaml'
      ]));
      expect(payload.references.length).toBeGreaterThanOrEqual(3);
      expect(payload['capability-modules'].length).toBeGreaterThanOrEqual(3);
      expect(payload['route-preview']).toEqual(expect.objectContaining({
        skill: 'reliability-governance-v2',
        kind: 'domain'
      }));
      expect(payload['review-metadata']).toEqual(expect.objectContaining({
        owner: expect.any(String),
        'last-reviewed': expect.any(String),
        'review-cycle-days': expect.any(Number)
      }));
      expect(payload['top-tier-readiness']).toEqual(expect.objectContaining({
        references: expect.objectContaining({
          current: expect.any(Number),
          required: expect.any(Number)
        }),
        capability_modules: expect.objectContaining({
          required: true,
          count: expect.any(Number),
          ids: expect.any(Array)
        }),
        runtime_proof: expect.objectContaining({
          'minimum-contracts': 2,
          'needs-more-contracts': expect.any(Boolean)
        }),
        blockers: expect.arrayContaining([
          expect.stringContaining('route fixture evidence must be added')
        ])
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-hardening-blueprint previews governed promotion blockers and repair order', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);
      const verifySecuritySkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-security', 'SKILL.md');
      const verifySecurityText = fs.readFileSync(verifySecuritySkill, 'utf8')
        .replace('status: stable', 'status: deprecated')
        .replace('\n- trust-boundary and dangerous-sink heuristics emit explicit findings when risky patterns co-occur in one file', '');
      fs.writeFileSync(verifySecuritySkill, verifySecurityText, 'utf8');

      const payload = manageSkill.main(['show-skill-hardening-blueprint', 'verify-security']);

      expect(payload.action).toBe('show-skill-hardening-blueprint');
      expect(payload.skill).toBe('verify-security');
      expect(payload.kind).toBe('tool');
      expect(payload.path).toBe('personal-skill-system/skills/tools/verify-security');
      expect(payload.lifecycle).toEqual(expect.objectContaining({
        status: 'deprecated',
        'target-status': 'stable',
        'active-route': true,
        'stable-ready': false,
        priority: 'critical'
      }));
      expect(payload.review).toEqual(expect.objectContaining({
        skill: 'verify-security',
        'review-status': 'scheduled'
      }));
      expect(payload['route-surface']).toEqual(expect.objectContaining({
        active: true,
        'fixture-evidence': expect.objectContaining({
          total: expect.any(Number),
          nongoverned: expect.any(Number),
          'stable-evidence-satisfied': true
        })
      }));
      expect(payload['runtime-proof']).toEqual(expect.objectContaining({
        level: 'declared-and-tested',
        contracts: 2,
        'evidence-tests': expect.any(Array),
        'host-smoke-policy': expect.objectContaining({
          'target-level': 'declared-and-tested'
        })
      }));
      expect(payload['promotion-readiness']).toEqual(expect.objectContaining({
        ready: false,
        priority: 'critical',
        'blocker-categories': expect.arrayContaining(['runtime-proof']),
        'blocking-families': expect.arrayContaining([
          expect.objectContaining({
            category: 'stable-runtime-proof-blocked',
            follow_up: expect.arrayContaining([
              'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-security --level declared-and-tested',
              'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-security'
            ])
          })
        ])
      }));
      expect(payload.recommendations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'harden-current-skill'
        })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-runtime-proof verify-security --level declared-and-tested',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-security'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-hardening-blueprint does not count governed placeholder fixtures as stable evidence', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const fixturesPath = path.join(target, 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      fixtures.cases = fixtures.cases.filter((item) => item.name === 'placeholder-route-verify-quality' || item.expect !== 'verify-quality');
      fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['show-skill-hardening-blueprint', 'verify-quality']);

      expect(payload['route-surface']).toEqual(expect.objectContaining({
        active: true,
        'fixture-evidence': expect.objectContaining({
          total: 1,
          governed: 1,
          nongoverned: 0,
          'stable-evidence-satisfied': false,
          'governed-fixtures': ['placeholder-route-verify-quality']
        })
      }));
      expect(payload['promotion-readiness'].blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'route-fixture-evidence',
          message: "stable skill 'verify-quality' has no route fixture evidence",
          categories: ['route']
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-hardening-blueprint recommends promotable host-smoke commands for stable host-smoke debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);
      manageSkill.writeRuntimeProofRegistry(repoRoot, [
        {
          skill: 'verify-s2-config',
          kind: 'tool',
          level: 'declared-and-tested',
          contracts: [
            '`node scripts/run.js --target ./src --json` returns a structured S2 configuration validation report with finding entries and rule ids',
            'SheetComponent prop misuse, field-shape drift, pagination wiring gaps, and imperative lifecycle mistakes are surfaced as explicit findings rather than silent pass states'
          ],
          'evidence-tests': [
            'test/personal_skill_system_tools.test.js::analyzeS2Config catches SheetComponent prop and field-shape issues'
          ],
          'host-smoke-policy': {
            tier: 'critical',
            'target-level': 'host-smoked',
            'freshness-days': 7
          },
          'host-smoke': {
            manifest: 'skills/tools/verify-s2-config/scripts/smoke.json',
            freshness: {
              'max-age': 7,
              unit: 'days'
            },
            commands: [
              {
                cwd: 'skill-dir',
                argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
                expect: { tool: 'verify-s2-config' },
                'timeout-ms': 10000
              }
            ]
          }
        }
      ], {
        touchedSkills: ['verify-s2-config'],
        bestEffortReadiness: true
      });

      const payload = manageSkill.main(['show-skill-hardening-blueprint', 'verify-s2-config']);

      expect(payload.action).toBe('show-skill-hardening-blueprint');
      expect(payload.skill).toBe('verify-s2-config');
      expect(payload['promotion-readiness']).toEqual(expect.objectContaining({
        ready: false,
        'blocker-categories': expect.arrayContaining(['host-smoke']),
        'blocking-families': expect.arrayContaining([
          expect.objectContaining({
            category: 'stable-host-smoke-blocked',
            follow_up: expect.arrayContaining([
              'node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-s2-config --host codex --promote-host-smoked',
              'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-s2-config'
            ])
          })
        ])
      }));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js run-host-smoke verify-s2-config --host codex --promote-host-smoked',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-s2-config'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-template-hardening-blueprint previews canonical template governance blockers and repair order', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const workflowTemplate = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const staleTemplate = fs.readFileSync(workflowTemplate, 'utf8')
      .replace('last-reviewed: 2026-04-17', 'last-reviewed: 2020-01-01')
      .replace('review-cycle-days: 60', 'review-cycle-days: 30');
    fs.writeFileSync(workflowTemplate, staleTemplate, 'utf8');

    const workflowMetadata = path.join(target, 'templates', 'skill', 'workflow', 'agents', 'openai.yaml');
    fs.writeFileSync(workflowMetadata, [
      'display_name: "Broken Workflow Template"',
      'short_description: "drifted metadata"',
      'default_prompt: "wrong prompt"'
    ].join('\n') + '\n', 'utf8');

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-template-hardening-blueprint', '--kind', 'workflow', '--json']);

      expect(payload.action).toBe('show-template-hardening-blueprint');
      expect(payload.kind).toBe('workflow');
      expect(payload.template).toBe('workflow-template');
      expect(payload.path).toBe('personal-skill-system/templates/skill/workflow');
      expect(payload.lifecycle).toEqual(expect.objectContaining({
        status: 'draft',
        'target-status': 'draft',
        healthy: false
      }));
      expect(payload.review).toEqual(expect.objectContaining({
        kind: 'workflow',
        'review-status': 'overdue',
        'next-review-due': '2020-01-31'
      }));
      expect(payload['template-governance']).toEqual(expect.objectContaining({
        ready: false,
        'blocking-family-count': expect.any(Number),
        'blocking-families': expect.arrayContaining([
          expect.objectContaining({
            category: 'review',
            follow_up: expect.arrayContaining([
              'node personal-skill-system/skills/tools/manage-skill/scripts/run.js review-template --kind workflow'
            ])
          }),
          expect.objectContaining({
            category: 'host-metadata',
            follow_up: expect.arrayContaining([
              'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-template-host-metadata --kind workflow'
            ])
          })
        ])
      }));
      expect(payload.recommendations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'harden-template'
        })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js review-template --kind workflow',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-template-host-metadata --kind workflow'
      ]));
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('manage-skill review-template and sync-template-host-metadata repair canonical template governance drift', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const workflowTemplate = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const staleTemplate = fs.readFileSync(workflowTemplate, 'utf8')
      .replace('last-reviewed: 2026-04-17', 'last-reviewed: 2020-01-01');
    fs.writeFileSync(workflowTemplate, staleTemplate, 'utf8');

    const workflowMetadata = path.join(target, 'templates', 'skill', 'workflow', 'agents', 'openai.yaml');
    fs.writeFileSync(workflowMetadata, [
      'display_name: "Broken Workflow Template"',
      'short_description: "drifted metadata"',
      'default_prompt: "wrong prompt"'
    ].join('\n') + '\n', 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const reviewed = manageSkill.main(['review-template', '--kind', 'workflow', '--date', '2026-05-19', '--review-cycle-days', '45']);
      expect(reviewed.action).toBe('review-template');
      expect(reviewed.kind).toBe('workflow');
      expect(reviewed.reviewed_at).toBe('2026-05-19');
      expect(reviewed['review-cycle-days']).toBe(45);

      const synced = manageSkill.main(['sync-template-host-metadata', '--kind', 'workflow']);
      expect(synced.action).toBe('sync-template-host-metadata');
      expect(synced.kind).toBe('workflow');

      const payload = manageSkill.main(['show-template-hardening-blueprint', '--kind', 'workflow']);
      expect(payload.review).toEqual(expect.objectContaining({
        'review-status': 'scheduled',
        'last-reviewed': '2026-05-19',
        'review-cycle-days': 45
      }));
      expect(payload['template-governance']['blocking-families'].some((family) => family.category === 'host-metadata')).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill evolution-check can recommend archiving an existing skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['evolution-check', 'verify-quality', 'this skill should be archived after replacement']);

      expect(payload.action).toBe('evolution-check');
      expect(payload.skill).toBe('verify-quality');
      expect(payload.recommendation).toEqual(expect.objectContaining({
        action: 'archive-skill',
        target_status: 'archived'
      }));
      expect(payload.follow_up.some((item) => item.includes('archive verify-quality'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill merge archives the source skill and records merged-into governance history', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const evolution = manageSkill.main(['evolution-check', 'verify-quality', 'merge this skill into review']);
      expect(evolution.recommendation.action).toBe('merge-into-skill');
      expect(evolution.recommendation.target_skill).toBe('review');

      const payload = manageSkill.main(['merge', 'verify-quality', 'review', '--request-id', evolution['request-id']]);
      expect(payload.action).toBe('merge');
      expect(payload.skill).toBe('verify-quality');
      expect(payload.target_skill).toBe('review');
      expect(payload.status).toBe('archived');

      const mergedSkill = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-quality', 'SKILL.md'), 'utf8');
      expect(mergedSkill).toContain('status: archived');

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      expect(routeMap.routes.some((route) => route.skill === 'verify-quality')).toBe(false);

      const ledgerPayload = manageSkill.main(['show-evolution-ledger', '--request-id', evolution['request-id']]);
      expect(ledgerPayload.summary).toEqual(expect.objectContaining({
        total: expect.any(Number)
      }));
      expect(ledgerPayload.returned).toBe(1);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        'request-id': evolution['request-id'],
        status: 'implemented',
        'executed-action': 'merge',
        'result-status': 'archived',
        'merged-into': 'review'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill assess-top-tier reports non-top-ready capability modules as promotion blockers', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-domain-${Date.now()}`;
      manageSkill.main(['create', 'domain', skillName, '--scaffold-modules']);
      manageSkill.main([
        'update',
        skillName,
        '--set',
        'description=Domain skill for promotion-gate testing. Use when governed domain routing should own this request.',
        '--set',
        'trigger-keywords=[promotion-gate-domain,promotion-gate-domain-route]'
      ]);

      const payload = manageSkill.main(['assess-top-tier', skillName]);
      expect(payload.action).toBe('assess-top-tier');
      expect(payload.skill).toBe(skillName);
      expect(payload.ready).toBe(false);
      expect(payload.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'capability-module-rating',
          rating: 'thin'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill assess-top-tier rejects stable evidence that only comes from governed placeholder fixtures', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      fixtures.cases = fixtures.cases.filter((item) => item.name === 'placeholder-route-verify-quality' || item.expect !== 'verify-quality');
      fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['assess-top-tier', 'verify-quality']);
      expect(payload.action).toBe('assess-top-tier');
      expect(payload.ready).toBe(false);
      expect(payload.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'verification-error',
          message: expect.stringContaining("stable skill 'verify-quality' has no route fixture evidence")
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-review-queue reports overdue governed skills', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['mark-reviewed', 'manage-skill', '--date', '2026-01-01', '--review-cycle-days', '30']);

      const payload = manageSkill.main(['show-review-queue', '--overdue']);
      expect(payload.action).toBe('show-review-queue');
      expect(payload.summary).toEqual(expect.objectContaining({
        'governed-skills': expect.any(Number)
      }));
      expect(payload.entries.every((entry) => entry['review-status'] === 'overdue')).toBe(true);
      expect(payload.entries.some((entry) => entry.skill === 'manage-skill')).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill mark-reviewed refreshes review queue and clears expired stable cadence blocker', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['mark-reviewed', 'manage-skill', '--date', '2026-01-01', '--review-cycle-days', '30']);
      let assessment = manageSkill.main(['assess-top-tier', 'manage-skill']);
      expect(assessment.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('stable skill review cadence expired')
        })
      ]));

      const payload = manageSkill.main(['mark-reviewed', 'manage-skill', '--date', '2026-05-09', '--review-cycle-days', '30']);
      expect(payload.action).toBe('mark-reviewed');
      expect(payload.skill).toBe('manage-skill');
      expect(payload['review-entry']).toEqual(expect.objectContaining({
        skill: 'manage-skill',
        'review-status': 'scheduled'
      }));

      const reviewQueue = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'review-queue.generated.json'), 'utf8'));
      const queueEntry = reviewQueue.skills.find((entry) => entry.skill === 'manage-skill');
      expect(queueEntry).toEqual(expect.objectContaining({
        'last-reviewed': '2026-05-09',
        'review-cycle-days': 30,
        'review-status': 'scheduled'
      }));

      assessment = manageSkill.main(['assess-top-tier', 'manage-skill']);
      expect(assessment.blockers.some((item) => String(item.message || '').includes('stable skill review cadence expired'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill mark-reviewed refreshes capability ratings when stable review cadence is cleared', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['mark-reviewed', 'manage-skill', '--date', '2026-04-17', '--review-cycle-days', '30']);
      Date.now = () => new Date('2026-05-19T00:00:00Z').getTime();

      let ratings = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'capability-ratings.generated.json'), 'utf8'));
      const overdueBefore = ratings['skill-level-summary'].counts['stable-overdue'];
      expect(overdueBefore).toBeGreaterThanOrEqual(1);
      expect(ratings.notes.some((note) => note.includes('overdue review cadence'))).toBe(true);

      const payload = manageSkill.main(['mark-reviewed', 'manage-skill', '--date', '2026-05-19', '--review-cycle-days', '30']);
      expect(payload.action).toBe('mark-reviewed');
      expect(payload.skill).toBe('manage-skill');

      ratings = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'capability-ratings.generated.json'), 'utf8'));
      expect(ratings['skill-level-summary'].counts['stable-overdue']).toBeLessThan(overdueBefore);
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('manage-skill mark-reviewed --overdue updates every overdue skill in one pass', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillEvolutionFile = path.join(target, 'skills', 'workflows', 'skill-evolution', 'SKILL.md');
      const verifySkillSystemFile = path.join(target, 'skills', 'tools', 'verify-skill-system', 'SKILL.md');
      fs.writeFileSync(
        skillEvolutionFile,
        fs.readFileSync(skillEvolutionFile, 'utf8')
          .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-04-18'),
        'utf8'
      );
      fs.writeFileSync(
        verifySkillSystemFile,
        fs.readFileSync(verifySkillSystemFile, 'utf8')
          .replace(/^last-reviewed:\s*.*$/m, 'last-reviewed: 2026-04-18'),
        'utf8'
      );

      manageSkill.main(['refresh-derived-governance']);

      let queue = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'review-queue.generated.json'), 'utf8'));
      expect(queue.summary['stable-overdue']).toBeGreaterThanOrEqual(2);

      const payload = manageSkill.main(['mark-reviewed', '--overdue', '--date', '2026-05-19']);
      expect(payload.action).toBe('mark-reviewed');
      expect(payload.scope).toBe('overdue');
      expect(payload.total_reviewed).toBeGreaterThanOrEqual(2);
      expect(payload.reviewed).toEqual(expect.arrayContaining([
        expect.objectContaining({ skill: 'skill-evolution' }),
        expect.objectContaining({ skill: 'verify-skill-system' })
      ]));

      queue = JSON.parse(fs.readFileSync(path.join(target, 'registry', 'review-queue.generated.json'), 'utf8'));
      expect(queue.summary['stable-overdue']).toBe(0);
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('top-tier assessment and wave views ignore stale review-queue snapshots', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['mark-reviewed', 'manage-skill', '--date', '2026-04-17', '--review-cycle-days', '30']);

      const reviewQueuePath = path.join(target, 'registry', 'review-queue.generated.json');
      const staleQueue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
      const staleEntry = staleQueue.skills.find((entry) => entry.skill === 'manage-skill');
      staleEntry['review-status'] = 'scheduled';
      staleEntry['next-review-due'] = '2099-01-01';
      staleEntry['days-until-due'] = 99999;
      staleEntry['overdue-days'] = 0;
      fs.writeFileSync(reviewQueuePath, JSON.stringify(staleQueue, null, 2) + '\n', 'utf8');

      Date.now = () => new Date('2026-05-18T00:00:00Z').getTime();

      const assessment = manageSkill.main(['assess-top-tier', 'manage-skill']);
      expect(assessment.ready).toBe(false);
      expect(assessment.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('stable skill review cadence expired on 2026-05-17')
        })
      ]));

      const wave = manageSkill.main(['show-top-tier-wave']);
      expect(wave.skills).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'manage-skill',
          ready: false
        })
      ]));
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('manage-skill assess-top-tier blocks critical host-smoke policies that are not yet satisfied', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const scorecardPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-smoke', 'scorecard.generated.json');
      const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
      const manageSkillEntry = scorecard.skills.find((item) => item.skill === 'manage-skill');
      manageSkillEntry['governance-status'] = 'missing-evidence';
      manageSkillEntry['evidence-status'] = 'missing';
      manageSkillEntry.level = 'declared-and-tested';
      fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['assess-top-tier', 'manage-skill']);
      expect(payload.action).toBe('assess-top-tier');
      expect(payload.ready).toBe(false);
      expect(payload.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'verification-error',
          message: expect.stringContaining("critical host-smoke policy for 'manage-skill' is not yet satisfied")
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill assess-top-tier blocks stable scripted skills below the runtime-proof floor', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const proof = runtimeProof.proofs.find((item) => item.skill === 'pre-commit-gate');
      proof.level = 'declared-only';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['assess-top-tier', 'pre-commit-gate']);
      expect(payload.action).toBe('assess-top-tier');
      expect(payload.ready).toBe(false);
      expect(payload.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'verification-error',
          message: expect.stringContaining("stable scripted skill 'pre-commit-gate' is still marked 'declared-only' below the stable runtime-proof floor")
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill assess-top-tier --all returns a prioritized stable-skill portfolio view', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const proof = runtimeProof.proofs.find((item) => item.skill === 'pre-commit-gate');
      proof.level = 'declared-only';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['assess-top-tier', '--all']);

      expect(payload.action).toBe('assess-top-tier');
      expect(payload.scope).toBe('all-stable-skills');
      expect(payload.summary).toEqual(expect.objectContaining({
        total: expect.any(Number),
        ready: expect.any(Number),
        blocked: expect.any(Number),
        priorities: expect.objectContaining({
          critical: expect.any(Number),
          high: expect.any(Number),
          normal: expect.any(Number),
          clear: expect.any(Number)
        })
      }));
      expect(payload['upgrade-board']).toEqual(expect.objectContaining({
        summary: expect.objectContaining({
          blocked: expect.any(Number),
          lanes: expect.objectContaining({
            critical: expect.any(Number),
            high: expect.any(Number),
            normal: expect.any(Number),
            clear: expect.any(Number)
          }),
          groups: expect.any(Object),
          'next-wave': expect.any(Array)
        }),
        lanes: expect.any(Array),
        groups: expect.any(Array)
      }));
      expect(payload.total).toBe(payload.returned);
      expect(Array.isArray(payload.assessments)).toBe(true);
      expect(payload.assessments.length).toBeGreaterThan(0);
      expect(payload.assessments[0]).toEqual(expect.objectContaining({
        skill: expect.any(String),
        ready: expect.any(Boolean),
        priority: expect.any(String),
        'blocker-count': expect.any(Number),
        'blocker-categories': expect.any(Array),
        blockers: expect.any(Array)
      }));
      expect(payload.assessments.some((item) =>
        item.skill === 'pre-commit-gate'
        && item.ready === false
        && item.priority === 'critical'
      )).toBe(true);
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'fix critical and high priority blockers first',
        'rerun assess-top-tier --all after the fixes land'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-top-tier-wave exposes the current governed stable upgrade wave', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const proof = runtimeProof.proofs.find((item) => item.skill === 'pre-commit-gate');
      proof.level = 'declared-only';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['show-top-tier-wave']);

      expect(payload.action).toBe('show-top-tier-wave');
      expect(payload.summary).toEqual(expect.objectContaining({
        blocked: expect.any(Number),
        'next-wave-size': expect.any(Number),
        'current-priority-lane': expect.anything(),
        'current-blocker-family': expect.anything()
      }));
      expect(payload['execution-focus']).toEqual(expect.objectContaining({
        blocked: expect.any(Number),
        'next-wave': expect.any(Array),
        'next-wave-size': expect.any(Number),
        follow_up: expect.arrayContaining([
          'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-top-tier-wave'
        ])
      }));
      expect(Array.isArray(payload.skills)).toBe(true);
      expect(payload.skills).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'pre-commit-gate',
          ready: false,
          priority: 'critical'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces open admission work in one governed portfolio view', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const admission = manageSkill.main(['admission-check', '--kind', 'guard', 'we need a new policy gate that blocks unsafe skill deletion during pack release']);
      const payload = manageSkill.main(['show-investment-backlog', '--source', 'admission-ledger']);

      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.summary).toEqual(expect.objectContaining({
        total: expect.any(Number)
      }));
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `admission-${admission['request-id']}`,
          source: 'admission-ledger',
          category: 'new-skill-admission',
          priority: 'high'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('show-investment-backlog carries top-tier execution focus in the governed portfolio payload', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const proof = runtimeProof.proofs.find((item) => item.skill === 'pre-commit-gate');
      proof.level = 'declared-only';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'top-tier-readiness']);
      const backlog = manageSkill.main(['show-top-tier-wave']);

      expect(payload.action).toBe('show-investment-backlog');
      const fullBacklog = manageSkill.main(['show-investment-backlog']);
      expect(fullBacklog).toEqual(expect.objectContaining({
        action: 'show-investment-backlog'
      }));

      const derived = manageSkill.main(['show-top-tier-wave']);
      expect(derived['execution-focus']).toEqual(expect.objectContaining({
        blocked: expect.any(Number),
        'next-wave': expect.any(Array)
      }));
      expect(backlog.summary['next-wave-size']).toBe(derived['execution-focus']['next-wave-size']);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog keeps blocked admission work visible as active portfolio debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const admission = manageSkill.main(['admission-check', '--kind', 'domain', 'we need a blocked create backlog proof']);
      manageSkill.main(['resolve-admission', admission['request-id'], '--status', 'blocked', '--note', 'blocked on host create constraint']);

      const payload = manageSkill.main(['show-investment-backlog', '--status', 'blocked']);
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `admission-${admission['request-id']}`,
          source: 'admission-ledger',
          category: 'new-skill-admission',
          status: 'blocked'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces proof-governance debt for critical host-smoke gaps', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const manageProof = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
      const verifyProof = runtimeProof.proofs.find((item) => item.skill === 'verify-skill-system');
      manageProof.level = 'declared-and-tested';
      verifyProof.level = 'declared-and-tested';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const scorecardPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-smoke', 'scorecard.generated.json');
      const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
      for (const item of scorecard.skills) {
        if (item.skill === 'manage-skill' || item.skill === 'verify-skill-system') {
          item.level = 'declared-and-tested';
          item['governance-status'] = 'missing-evidence';
          item['evidence-status'] = 'missing';
        }
      }
      fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'proof-governance']);
      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'proof-manage-skill',
          source: 'proof-governance',
          category: 'proof-governance',
          priority: 'critical'
        }),
        expect.objectContaining({
          id: 'proof-verify-skill-system',
          source: 'proof-governance',
          category: 'proof-governance',
          priority: 'critical'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces host writeability debt for blocked governance artifacts', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          collectGeneratedArtifactWriteability: jest.fn(() => ([
            {
              id: 'system-readiness',
              path: path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json'),
              mode: 'rewrite-file',
              label: 'system readiness artifact',
              ok: false,
              code: 'EPERM'
            }
          ])),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: false,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', '__probe__'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            code: 'EPERM'
          }))
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'host-writeability']);
      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'host-writeability-system-readiness',
          source: 'host-writeability',
          category: 'host-writeability'
        }),
        expect.objectContaining({
          id: 'host-writeability-authoritative-skill-create',
          source: 'host-writeability',
          category: 'host-writeability'
        })
      ]));
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog ignores authoritative create debt when only probe cleanup fails', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          collectGeneratedArtifactWriteability: jest.fn(() => ([
            {
              id: 'system-readiness',
              path: path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json'),
              mode: 'rewrite-file',
              label: 'system readiness artifact',
              ok: false,
              code: 'EPERM'
            }
          ])),
          probeDirectoryCreateAccess: jest.fn(() => ({
            ok: true,
            path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', '__probe__'),
            parent: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains'),
            cleanup: {
              ok: false,
              path: path.join(repoRoot, 'personal-skill-system', 'skills', 'domains', '.codex-dir-probe-cache'),
              code: 'EPERM',
              message: 'mocked cleanup block'
            }
          }))
        };
      });
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'host-writeability']);
      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'host-writeability-system-readiness',
          source: 'host-writeability',
          category: 'host-writeability'
        })
      ]));
      expect(payload.items).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'host-writeability-authoritative-skill-create'
        })
      ]));
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-pending-scaffolds returns empty summary on the baseline bundle', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-pending-scaffolds']);
      expect(payload.action).toBe('show-pending-scaffolds');
      expect(payload.total).toBe(0);
      expect(payload.returned).toBe(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill record-opportunity writes governed future skill opportunities and exposes them via queue view', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const recorded = manageSkill.main([
        'record-opportunity',
        '--kind', 'workflow',
        '--priority', 'high',
        '--horizon', 'next',
        '--adjacent', 'review,ship',
        'we need a governed workflow for periodic portfolio pruning across the skill bundle'
      ]);

      expect(recorded.action).toBe('record-opportunity');
      expect(recorded.entry).toEqual(expect.objectContaining({
        'suggested-kind': 'workflow',
        priority: 'high',
        status: 'open',
        horizon: 'next'
      }));

      const queue = manageSkill.main(['show-opportunity-queue', '--opportunity-id', recorded.entry['opportunity-id']]);
      expect(queue.action).toBe('show-opportunity-queue');
      expect(queue.returned).toBe(1);
      expect(queue.entries[0]).toEqual(expect.objectContaining({
        'opportunity-id': recorded.entry['opportunity-id'],
        summary: 'we need a governed workflow for periodic portfolio pruning across the skill bundle'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill resolve-opportunity stamps resolved-at when the opportunity moves to a terminal status', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const recorded = manageSkill.main([
        'record-opportunity',
        '--kind', 'workflow',
        '--priority', 'high',
        '--horizon', 'next',
        'we need a governed workflow for periodic portfolio pruning across the skill bundle'
      ]);

      const resolved = manageSkill.main([
        'resolve-opportunity',
        recorded.entry['opportunity-id'],
        '--status', 'implemented'
      ]);

      expect(resolved.action).toBe('resolve-opportunity');
      expect(resolved.entry).toEqual(expect.objectContaining({
        'opportunity-id': recorded.entry['opportunity-id'],
        status: 'implemented'
      }));
      expect(resolved.entry['resolved-at']).toBeTruthy();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces open future skill opportunities in the governed portfolio view', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const recorded = manageSkill.main([
        'record-opportunity',
        '--kind', 'domain',
        '--priority', 'critical',
        '--horizon', 'now',
        'we need a future platform-governance skill for shared operating model decisions'
      ]);
      const payload = manageSkill.main(['show-investment-backlog', '--source', 'skill-opportunity-queue']);

      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `opportunity-${recorded.entry['opportunity-id']}`,
          source: 'skill-opportunity-queue',
          category: 'future-skill-opportunity',
          priority: 'critical'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces active experimental skills as lifecycle hardening debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const reviewSkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', 'review', 'SKILL.md');
    const reviewText = fs.readFileSync(reviewSkill, 'utf8').replace('status: stable', 'status: experimental');
    fs.writeFileSync(reviewSkill, reviewText, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'authoritative-skills']);

      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'lifecycle-hardening-review',
          source: 'authoritative-skills',
          category: 'top-tier-hardening',
          skill: 'review',
          status: 'open',
          priority: 'high'
        })
      ]));
      const reviewItem = payload.items.find((item) => item.id === 'lifecycle-hardening-review');
      expect(reviewItem.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-lifecycle-governance --skill review'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-lifecycle-governance surfaces active non-stable skills as promotion-ready or hardening-needed', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const reviewSkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', 'review', 'SKILL.md');
    const reviewText = fs.readFileSync(reviewSkill, 'utf8')
      .replace('status: stable', 'status: experimental')
      .replace(/^last-reviewed:.*\r?\n/m, '');
    fs.writeFileSync(reviewSkill, reviewText, 'utf8');
    const verifySecuritySkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-security', 'SKILL.md');
    const verifySecurityText = fs.readFileSync(verifySecuritySkill, 'utf8').replace('status: stable', 'status: deprecated');
    fs.writeFileSync(verifySecuritySkill, verifySecurityText, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-lifecycle-governance']);

      expect(payload.action).toBe('show-lifecycle-governance');
      expect(payload.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'review',
          kind: 'workflow',
          status: 'experimental',
          'lifecycle-class': 'needs-hardening',
          'target-status': 'stable',
          'top-tier-ready': false,
          'next-action': 'harden-current-skill'
        }),
        expect.objectContaining({
          skill: 'verify-security',
          kind: 'tool',
          status: 'deprecated',
          'lifecycle-class': 'promotion-ready',
          'target-status': 'stable',
          'top-tier-ready': true,
          'next-action': 'promote-to-stable'
        })
      ]));

      const verifySecurity = payload.entries.find((entry) => entry.skill === 'verify-security');
      expect(verifySecurity.follow_up).toEqual(expect.arrayContaining([
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show verify-security',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js assess-top-tier verify-security',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-hardening-blueprint verify-security',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status verify-security stable'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces scaffold-lineage template upgrade debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const workflowTemplate = path.join(repoRoot, 'personal-skill-system', 'templates', 'skill', 'workflow', 'SKILL.md');
    const templateText = fs.readFileSync(workflowTemplate, 'utf8').replace('template-version: 1', 'template-version: 2');
    fs.writeFileSync(workflowTemplate, templateText, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'scaffold-lineage']);

      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'scaffold-drift-review',
          source: 'scaffold-lineage',
          category: 'template-upgrade',
          skill: 'review',
          kind: 'workflow',
          follow_up: expect.arrayContaining([
            'node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-skill-scaffold-upgrade-blueprint --name review'
          ])
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-scaffold-governance unifies template health and scaffold drift', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const workflowTemplate = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const updatedTemplate = fs.readFileSync(workflowTemplate, 'utf8')
      .replace('template-version: 1', 'template-version: 2')
      .replace('last-reviewed: 2026-04-17', 'last-reviewed: 2020-01-01');
    fs.writeFileSync(workflowTemplate, updatedTemplate, 'utf8');

    const reviewSkill = path.join(target, 'skills', 'workflows', 'review', 'SKILL.md');
    const strippedSkill = fs.readFileSync(reviewSkill, 'utf8')
      .replace(/^scaffold-origin:.*\r?\n/m, '')
      .replace(/^scaffold-version:.*\r?\n/m, '');
    fs.writeFileSync(reviewSkill, strippedSkill, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-scaffold-governance', '--kind', 'workflow', '--include-healthy']);

      expect(payload.action).toBe('show-scaffold-governance');
      expect(payload.summary.templates.overdue).toBeGreaterThan(0);
      expect(payload.templates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'workflow',
          'template-version': 2,
          'review-status': 'overdue'
        })
      ]));
      expect(payload.skills).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'review',
          kind: 'workflow',
          'drift-status': 'missing-lineage'
        }),
        expect.objectContaining({
          skill: 'bugfix',
          kind: 'workflow',
          'drift-status': 'behind-template'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-scaffold-upgrade-blueprint explains behind-template upgrade work', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const workflowTemplate = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const updatedTemplate = fs.readFileSync(workflowTemplate, 'utf8')
      .replace('template-version: 1', 'template-version: 2');
    fs.writeFileSync(workflowTemplate, updatedTemplate, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-skill-scaffold-upgrade-blueprint', '--name', 'review', '--json']);

      expect(payload.action).toBe('show-skill-scaffold-upgrade-blueprint');
      expect(payload.skill).toBe('review');
      expect(payload.scaffold).toEqual(expect.objectContaining({
        'drift-status': 'behind-template'
      }));
      expect(payload.recommendations).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'audit-template-delta' }),
        expect.objectContaining({ action: 'promote-lineage-after-audit' })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'review personal-skill-system/templates/skill/workflow/SKILL.md',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage review'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-scaffold-upgrade-blueprint explains missing-lineage repair', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const reviewSkill = path.join(target, 'skills', 'workflows', 'review', 'SKILL.md');
    const strippedSkill = fs.readFileSync(reviewSkill, 'utf8')
      .replace(/^scaffold-origin:.*\r?\n/m, '')
      .replace(/^scaffold-version:.*\r?\n/m, '');
    fs.writeFileSync(reviewSkill, strippedSkill, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-skill-scaffold-upgrade-blueprint', 'review']);

      expect(payload.action).toBe('show-skill-scaffold-upgrade-blueprint');
      expect(payload.scaffold).toEqual(expect.objectContaining({
        'drift-status': 'missing-lineage'
      }));
      expect(payload.recommendations).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'backfill-lineage' }),
        expect.objectContaining({ action: 'manually-verify-descendant-shape' })
      ]));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'review personal-skill-system/skills/workflows/review/SKILL.md',
        'node personal-skill-system/skills/tools/manage-skill/scripts/run.js sync-scaffold-lineage review'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('template-governance backlog follow-up points to the canonical template hardening blueprint', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), target, { recursive: true });

    const workflowTemplate = path.join(target, 'templates', 'skill', 'workflow', 'SKILL.md');
    const staleTemplate = fs.readFileSync(workflowTemplate, 'utf8')
      .replace('last-reviewed: 2026-04-17', 'last-reviewed: 2020-01-01')
      .replace('review-cycle-days: 60', 'review-cycle-days: 30');
    fs.writeFileSync(workflowTemplate, staleTemplate, 'utf8');

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      Date.now = () => new Date('2026-05-15T00:00:00Z').getTime();
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'template-scaffolds']);
      const item = payload.items.find((entry) => entry.id === 'template-governance-workflow');

      expect(item).toEqual(expect.objectContaining({
        category: 'template-governance',
        source: 'template-scaffolds'
      }));
      expect(item.follow_up).toContain('node personal-skill-system/skills/tools/manage-skill/scripts/run.js show-template-hardening-blueprint --kind workflow');
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-top-tier-wave accepts an explicit --json flag', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-top-tier-wave', '--json']);

      expect(payload.action).toBe('show-top-tier-wave');
      expect(Array.isArray(payload.skills)).toBe(true);
      expect(payload.summary).toEqual(expect.objectContaining({
        blocked: expect.any(Number)
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-hardening-blueprint accepts an explicit --json flag', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-skill-hardening-blueprint', 'verify-security', '--json']);

      expect(payload.action).toBe('show-skill-hardening-blueprint');
      expect(payload.skill).toBe('verify-security');
      expect(payload['promotion-readiness']).toEqual(expect.objectContaining({
        ready: expect.any(Boolean)
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill assess-top-tier evaluates non-stable skills against stable promotion blockers', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    const verifySecuritySkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-security', 'SKILL.md');
    const verifySecurityText = fs.readFileSync(verifySecuritySkill, 'utf8').replace('status: stable', 'status: deprecated');
    fs.writeFileSync(verifySecuritySkill, verifySecurityText, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['assess-top-tier', 'verify-security']);

      expect(payload.action).toBe('assess-top-tier');
      expect(payload.skill).toBe('verify-security');
      expect(payload.status).toBe('deprecated');
      expect(payload['target-status']).toBe('stable');
      expect(payload.ready).toBe(true);
      expect(payload.priority).toBe('clear');
      expect(payload['blocker-categories']).toEqual([]);
      expect(payload.blockers).toEqual([]);
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'set-status stable is allowed once you are ready to promote'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-lifecycle-governance accepts filters and explicit --json', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    const verifySecuritySkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-security', 'SKILL.md');
    const verifySecurityText = fs.readFileSync(verifySecuritySkill, 'utf8').replace('status: stable', 'status: deprecated');
    fs.writeFileSync(verifySecuritySkill, verifySecurityText, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-lifecycle-governance', '--skill', 'verify-security', '--status', 'deprecated', '--json']);

      expect(payload.action).toBe('show-lifecycle-governance');
      expect(payload.returned).toBe(1);
      expect(payload.entries).toEqual([
        expect.objectContaining({
          skill: 'verify-security',
          status: 'deprecated'
        })
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill evolution-check points blocked stable-promotion work at the governed hardening blueprint', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    const verifySecuritySkill = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-security', 'SKILL.md');
    const verifySecurityText = fs.readFileSync(verifySecuritySkill, 'utf8').replace('status: stable', 'status: deprecated');
    fs.writeFileSync(verifySecuritySkill, verifySecurityText, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main([
        'evolution-check',
        'verify-security',
        'promote this active skill into the governed stable surface'
      ]);

      expect(payload.action).toBe('evolution-check');
      expect(payload.recommendation).toEqual(expect.objectContaining({
        action: 'promote-to-stable',
        target_status: 'stable'
      }));
      expect(payload.follow_up).toEqual(expect.arrayContaining([
        'execute with: node personal-skill-system/skills/tools/manage-skill/scripts/run.js set-status verify-security stable'
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-investment-backlog surfaces unmapped raw expert sources as integration debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    seedTopDeveloperRawFixture(repoRoot);

    const extraSourceDir = path.join(repoRoot, 'top_developer', 'top-future-governance');
    fs.mkdirSync(extraSourceDir, { recursive: true });
    fs.writeFileSync(path.join(extraSourceDir, 'SKILL.md'), [
      '---',
      'name: top-future-governance',
      'description: raw future expert source',
      '---',
      '',
      '# Raw Future Governance',
      ''
    ].join('\n'));

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'top-developer-integration']);

      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'top-developer-source-top-future-governance',
          source: 'top-developer-integration',
          category: 'expert-source-integration',
          priority: 'high'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create --opportunity-id closes the governed future opportunity as implemented', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const recorded = manageSkill.main([
        'record-opportunity',
        '--kind', 'workflow',
        '--priority', 'high',
        '--horizon', 'next',
        'we need a workflow for skill portfolio pruning and deprecation planning'
      ]);

      const created = manageSkill.main([
        'create',
        'workflow',
        `portfolio-pruning-${Date.now()}`,
        '--opportunity-id',
        recorded.entry['opportunity-id']
      ]);

      expect(created.action).toBe('create');
      expect(created['opportunity-id']).toBe(recorded.entry['opportunity-id']);

      const queue = manageSkill.main(['show-opportunity-queue', '--opportunity-id', recorded.entry['opportunity-id']]);
      expect(queue.entries[0]).toEqual(expect.objectContaining({
        status: 'implemented',
        'created-skill': created.skill
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create --request-id inherits the linked governed opportunity automatically', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const recorded = manageSkill.main([
        'record-opportunity',
        '--kind', 'workflow',
        '--priority', 'high',
        '--horizon', 'next',
        'we need a workflow for linked opportunity inheritance'
      ]);
      const admission = manageSkill.main([
        'admission-check',
        '--kind', 'workflow',
        '--opportunity-id', recorded.entry['opportunity-id']
      ]);

      const created = manageSkill.main([
        'create',
        'workflow',
        `linked-opportunity-inheritance-${Date.now()}`,
        '--request-id',
        admission['request-id']
      ]);

      expect(created.action).toBe('create');
      expect(created['admission-request-id']).toBe(admission['request-id']);
      expect(created['opportunity-id']).toBe(recorded.entry['opportunity-id']);

      const queue = manageSkill.main(['show-opportunity-queue', '--opportunity-id', recorded.entry['opportunity-id']]);
      expect(queue.entries[0]).toEqual(expect.objectContaining({
        status: 'implemented',
        'admission-request-id': admission['request-id'],
        'created-skill': created.skill
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('show-investment-backlog can filter a newly registered expert-source family', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    seedTopDeveloperRawFixture(repoRoot);

    const rawRoot = path.join(repoRoot, 'expert_research');
    fs.mkdirSync(path.join(rawRoot, 'research-gap-two'), { recursive: true });
    fs.writeFileSync(path.join(rawRoot, 'research-gap-two', 'SKILL.md'), [
      '---',
      'name: research-gap-two',
      'description: raw research expert source',
      '---',
      '',
      '# Research Gap Two',
      ''
    ].join('\n'));

    const familiesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-source-families.generated.json');
    const families = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
    families.families.push({
      id: 'expert-research',
      title: 'Expert Research',
      source: 'expert-research-integration',
      label: 'expert-research integration',
      rawSourceLabel: 'raw expert research source',
      integrationFile: 'registry/expert-research-integration.generated.json',
      rawRoot: '../expert_research',
      schemaVersion: 2,
      integrationMode: 'capability-modules',
      expectedPortable: true,
      parseErrorSummary: 'Repair expert-research integration registry before the next expert-source extraction.',
      unmappedSummaryTemplate: "Integrate raw expert research source '%s' into governed capability modules.",
      sourceDescription: 'registry/expert-research-integration.generated.json + ../expert_research/**/SKILL.md when present',
      backlogFollowUp: [
        'review expert_research/%s/SKILL.md and decide extract-vs-admit'
      ]
    });
    fs.writeFileSync(familiesPath, JSON.stringify(families, null, 2) + '\n', 'utf8');

    fs.writeFileSync(
      path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-research-integration.generated.json'),
      JSON.stringify({
        'schema-version': 2,
        'integration-mode': 'capability-modules',
        portable: true,
        'module-count': 0,
        groups: [],
        modules: [],
        'source-index': []
      }, null, 2) + '\n',
      'utf8'
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['show-investment-backlog', '--source', 'expert-research-integration']);

      expect(payload.action).toBe('show-investment-backlog');
      expect(payload.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'expert-research-source-research-gap-two',
          source: 'expert-research-integration',
          category: 'expert-source-integration',
          priority: 'high'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill can register and inspect a governed expert-source family', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const registered = manageSkill.main([
        'register-expert-source-family',
        '--family-id', 'expert-research',
        '--title', 'Expert Research',
        '--create-raw-root'
      ]);

      expect(registered.action).toBe('register-expert-source-family');
      expect(registered.family).toBe('expert-research');
      expect(registered.source).toBe('expert-research-integration');
      expect(registered.integrationFile).toBe('registry/expert-research-integration.generated.json');
      expect(registered.rawRoot).toBe('../expert_research');

      const familiesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-source-families.generated.json');
      const families = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
      expect(families.families).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'expert-research',
          source: 'expert-research-integration',
          integrationFile: 'registry/expert-research-integration.generated.json',
          rawRoot: '../expert_research'
        })
      ]));

      const integrationPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-research-integration.generated.json');
      const integration = JSON.parse(fs.readFileSync(integrationPath, 'utf8'));
      expect(integration).toEqual(expect.objectContaining({
        'schema-version': 2,
        'integration-mode': 'capability-modules',
        portable: true,
        'module-count': 0
      }));

      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'packs', 'experimental', 'manifest.json'), 'utf8'));
      expect(manifest.includes).toContain('registry/expert-research-integration.generated.json');

      expect(fs.existsSync(path.join(repoRoot, 'expert_research'))).toBe(true);

      const shown = manageSkill.main([
        'show-expert-source-families',
        '--family', 'expert-research'
      ]);

      expect(shown.action).toBe('show-expert-source-families');
      expect(shown.returned).toBe(1);
      expect(shown.families[0]).toEqual(expect.objectContaining({
        id: 'expert-research',
        source: 'expert-research-integration',
        status: 'active',
        parseError: null,
        rawRootExists: true,
        rawSourceSkills: 0,
        integratedModules: 0
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill can update an expert-source family and move its integration ledger', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main([
        'register-expert-source-family',
        '--family-id', 'expert-research',
        '--title', 'Expert Research'
      ]);

      const payload = manageSkill.main([
        'update-expert-source-family',
        '--family-id', 'expert-research',
        '--integration-file', 'registry/expert-research-v2.generated.json',
        '--source', 'expert-research-v2',
        '--raw-root', '../expert_research_v2'
      ]);

      expect(payload.action).toBe('update-expert-source-family');
      expect(payload.family).toBe('expert-research');
      expect(payload.integrationFile).toBe('registry/expert-research-v2.generated.json');
      expect(payload.source).toBe('expert-research-v2');
      expect(payload.rawRoot).toBe('../expert_research_v2');

      const familiesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-source-families.generated.json');
      const families = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
      expect(families.families).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'expert-research',
          source: 'expert-research-v2',
          integrationFile: 'registry/expert-research-v2.generated.json',
          rawRoot: '../expert_research_v2',
          status: 'active'
        })
      ]));

      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-research-integration.generated.json'))).toBe(false);
      expect(fs.existsSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-research-v2.generated.json'))).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'packs', 'experimental', 'manifest.json'), 'utf8'));
      expect(manifest.includes).toContain('registry/expert-research-v2.generated.json');
      expect(manifest.includes).not.toContain('registry/expert-research-integration.generated.json');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill can archive an expert-source family and remove its active pack obligation', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main([
        'register-expert-source-family',
        '--family-id', 'expert-research',
        '--title', 'Expert Research'
      ]);

      const archived = manageSkill.main([
        'archive-expert-source-family',
        'expert-research'
      ]);

      expect(archived.action).toBe('update-expert-source-family');
      expect(archived.family).toBe('expert-research');
      expect(archived.status).toBe('archived');

      const shown = manageSkill.main([
        'show-expert-source-families',
        '--family', 'expert-research'
      ]);
      expect(shown.families[0]).toEqual(expect.objectContaining({
        id: 'expert-research',
        status: 'archived'
      }));

      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'packs', 'experimental', 'manifest.json'), 'utf8'));
      expect(manifest.includes).not.toContain('registry/expert-research-integration.generated.json');

      const backlog = manageSkill.main(['show-investment-backlog', '--source', 'expert-research-integration']);
      expect(backlog.items).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill can restore an archived expert-source family and recover active governance surfaces', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main([
        'register-expert-source-family',
        '--family-id', 'expert-research',
        '--title', 'Expert Research'
      ]);
      manageSkill.main(['archive-expert-source-family', 'expert-research']);

      const restored = manageSkill.main(['restore-expert-source-family', 'expert-research']);
      expect(restored.action).toBe('update-expert-source-family');
      expect(restored.family).toBe('expert-research');
      expect(restored.status).toBe('active');

      const shown = manageSkill.main([
        'show-expert-source-families',
        '--family', 'expert-research'
      ]);
      expect(shown.summary).toEqual(expect.objectContaining({
        'active-families': expect.any(Number),
        'archived-families': expect.any(Number)
      }));
      expect(shown.families[0]).toEqual(expect.objectContaining({
        id: 'expert-research',
        status: 'active'
      }));

      const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'packs', 'experimental', 'manifest.json'), 'utf8'));
      expect(manifest.includes).toContain('registry/expert-research-integration.generated.json');

      const familyScorecardPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'expert-source-family-scorecard.generated.json');
      const familyScorecard = JSON.parse(fs.readFileSync(familyScorecardPath, 'utf8'));
      expect(familyScorecard.families).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'expert-research',
          status: 'active',
          experimentalPackStatus: 'aligned'
        })
      ]));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill refuses to archive the default expert-source family through shared governance policy', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    seedTopDeveloperRawFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['archive-expert-source-family', 'top-developer']))
        .toThrow("cannot archive default expert-source family 'top-developer'");
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-retirement-blueprint previews governed delete readiness for an archived skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-retire-${Date.now()}`;
      manageSkill.main(['create', 'workflow', skillName]);
      manageSkill.main(['archive', skillName]);

      const payload = manageSkill.main(['show-skill-retirement-blueprint', '--name', skillName]);

      expect(payload.action).toBe('show-skill-retirement-blueprint');
      expect(payload.skill).toBe(skillName);
      expect(payload.path).toBe(`personal-skill-system/skills/workflows/${skillName}`);
      expect(payload.lifecycle).toEqual(expect.objectContaining({
        status: 'archived',
        'active-route': false
      }));
      expect(payload['delete-governance']).toEqual(expect.objectContaining({
        allowed_now: true,
        blocker_count: 0
      }));
      expect(payload.recommendations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'delete-skill'
        })
      ]));
      expect(payload.follow_up.some((item) => item.includes(`delete --name ${skillName}`))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill show-skill-retirement-blueprint explains active governance blockers before delete', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-retire-blocked-${Date.now()}`;
      manageSkill.main(['create', 'workflow', skillName]);
      manageSkill.main([
        'record-opportunity',
        '--kind', 'workflow',
        '--priority', 'high',
        '--horizon', 'next',
        '--adjacent', skillName,
        'we may need adjacent evolution support later'
      ]);

      const payload = manageSkill.main(['show-skill-retirement-blueprint', skillName]);

      expect(payload.action).toBe('show-skill-retirement-blueprint');
      expect(payload['delete-governance']).toEqual(expect.objectContaining({
        allowed_now: false
      }));
      expect(payload.blockers).toEqual(expect.arrayContaining([
        expect.stringContaining('active skill opportunity')
      ]));
      expect(payload.recommendations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          action: 'archive-skill'
        })
      ]));
      expect(payload.follow_up.some((item) => item.includes('show-skill-retirement-blueprint'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check --opportunity-id escalates a governed future opportunity into a linked admission request', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const recorded = manageSkill.main([
        'record-opportunity',
        '--kind', 'domain',
        '--priority', 'high',
        '--horizon', 'next',
        '--adjacent', 'skill-evolution,infrastructure',
        'we need a sandbox-governance domain for filesystem writeability, host constraints, and execution authority decisions across the bundle'
      ]);

      const admission = manageSkill.main([
        'admission-check',
        '--opportunity-id', recorded.entry['opportunity-id']
      ]);

      expect(admission.action).toBe('admission-check');
      expect(admission['opportunity-id']).toBe(recorded.entry['opportunity-id']);
      expect(admission.recommendation).toEqual(expect.objectContaining({
        action: 'reuse-existing-skill',
        target_skill: 'host-governance',
        target_kind: 'domain'
      }));
      expect(admission['linked-opportunity-status']).toBe('cancelled');
      expect(admission.follow_up.some((item) => item.includes('show host-governance'))).toBe(true);

      const queue = manageSkill.main(['show-opportunity-queue', '--opportunity-id', recorded.entry['opportunity-id']]);
      expect(queue.entries[0]).toEqual(expect.objectContaining({
        status: 'cancelled',
        'admission-request-id': admission['request-id']
      }));

      const ledger = manageSkill.main(['show-admission-ledger', '--request-id', admission['request-id']]);
      expect(ledger.summary).toEqual(expect.objectContaining({
        total: expect.any(Number)
      }));
      expect(ledger.entries[0]).toEqual(expect.objectContaining({
        'request-id': admission['request-id'],
        'opportunity-id': recorded.entry['opportunity-id']
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill delete removes scaffolded capability-module ratings and registry membership', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-workflow-${Date.now()}`;
      const createPayload = manageSkill.main(['create', 'workflow', skillName, '--scaffold-modules']);
      const scaffoldedModules = createPayload['scaffolded-capability-modules'];
      expect(scaffoldedModules).toHaveLength(3);

      manageSkill.main(['delete', '--path', `workflows/${skillName}`]);

      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      expect(registry.skills.some((item) => item.name === skillName)).toBe(false);
      expect((registry['module-groups'] || []).some((item) => item['host-skill'] === skillName)).toBe(false);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      expect(routeMap.routes.some((item) => item.skill === skillName)).toBe(false);

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      for (const moduleId of scaffoldedModules) {
        expect(ratings['rating-buckets'].thin).not.toContain(moduleId);
        expect(ratings['rating-buckets']['top-ready']).not.toContain(moduleId);
        expect(ratings['rating-buckets']['strong-but-not-top']).not.toContain(moduleId);
      }
      expect((ratings['next-batch'] || []).some((item) => scaffoldedModules.includes(item.module))).toBe(false);

      const ratingsDoc = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
      for (const moduleId of scaffoldedModules) {
        expect(ratingsDoc).not.toContain(`\`${moduleId}\``);
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill delete refuses removal while an active opportunity still references the skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-delete-blocked-${Date.now()}`;
      manageSkill.main(['create', 'workflow', skillName]);
      manageSkill.main([
        'record-opportunity',
        '--kind', 'workflow',
        '--priority', 'high',
        '--horizon', 'next',
        '--adjacent', skillName,
        'we may need adjacent evolution support later'
      ]);

      expect(() => manageSkill.main(['delete', '--name', skillName]))
        .toThrow(`cannot delete skill '${skillName}' because active governance dependencies remain: active skill opportunity`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill set-module-rating promotes one capability module and syncs next-batch/doc surfaces', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-domain-${Date.now()}`;
      const createPayload = manageSkill.main(['create', 'domain', skillName, '--scaffold-modules']);
      const [firstModule] = createPayload['scaffolded-capability-modules'];

      const payload = manageSkill.main(['set-module-rating', firstModule, 'strong-but-not-top']);
      expect(payload.action).toBe('set-module-rating');
      expect(payload.scope).toBe('module');
      expect(payload.module).toBe(firstModule);
      expect(payload.rating).toBe('strong-but-not-top');
      expect(payload['previous-ratings']).toEqual([
        expect.objectContaining({
          module: firstModule,
          previous_rating: 'thin',
          'host-skill': skillName,
          'host-kind': 'domain'
        })
      ]);

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      expect(ratings['rating-buckets']['strong-but-not-top']).toContain(firstModule);
      expect(ratings['rating-buckets'].thin).not.toContain(firstModule);
      expect(ratings['next-batch']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          module: firstModule,
          rating: 'strong-but-not-top',
          priority: 'promote-next'
        })
      ]));

      const ratingsDoc = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
      expect(ratingsDoc).toContain(`- \`${firstModule}\` (\`${skillName}\`, \`strong-but-not-top\`): Close the remaining depth and evidence gaps before TOP-ready promotion.`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill set-module-rating refreshes top-tier backlog debt when a stable skill module is downgraded', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      const aiGroup = (registry['module-groups'] || []).find((group) => group['host-skill'] === 'ai');
      expect(aiGroup).toBeTruthy();
      const downgradedModule = aiGroup.modules[0].id;

      const payload = manageSkill.main(['set-module-rating', downgradedModule, 'strong-but-not-top']);
      expect(payload.action).toBe('set-module-rating');
      expect(payload.module).toBe(downgradedModule);
      expect(payload.rating).toBe('strong-but-not-top');

      const backlog = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'skill-investment-backlog.generated.json'), 'utf8'));
      expect(backlog.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: 'top-tier-readiness',
          skill: 'ai',
          category: 'top-tier-hardening'
        })
      ]));
      const aiBacklogItem = backlog.items.find((item) => item.source === 'top-tier-readiness' && item.skill === 'ai');
      expect(backlog['top-tier-portfolio']).toEqual(expect.objectContaining({
        summary: expect.objectContaining({
          blocked: expect.any(Number)
        }),
        'upgrade-board': expect.objectContaining({
          summary: expect.objectContaining({
            blocked: expect.any(Number),
            groups: expect.any(Object)
          }),
          lanes: expect.any(Array),
          groups: expect.any(Array)
        }),
        assessments: expect.arrayContaining([
          expect.objectContaining({
            skill: 'ai',
            priority: expect.any(String)
          })
        ])
      }));
      expect(aiBacklogItem.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining(downgradedModule)
      ]));

      const readiness = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json'), 'utf8'));
      expect(readiness.sources['skill-investment-backlog']).toBe('registry/skill-investment-backlog.generated.json');
      expect(readiness.summary['investment-backlog-items']).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill set-module-rating rejects skipping buckets without explicit override', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-domain-${Date.now()}`;
      const createPayload = manageSkill.main(['create', 'domain', skillName, '--scaffold-modules']);
      const [firstModule] = createPayload['scaffolded-capability-modules'];

      expect(() => manageSkill.main(['set-module-rating', firstModule, 'top-ready']))
        .toThrow(`capability module '${firstModule}' can only move one bucket at a time without --allow-skip`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill reconcile-host-smoke reports drift and can invalidate append-only evidence without deleting run files', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const beforeRunDir = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-smoke', 'runtime-runs');
      const beforeFiles = fs.readdirSync(beforeRunDir).length;

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const driftedEntry = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
      driftedEntry['host-smoke'].commands[0].expect.tool = 'manage-skill-drift';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['reconcile-host-smoke', 'manage-skill', '--invalidate-drift']);
      expect(payload.reports).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'manage-skill',
          status: expect.stringMatching(/^(contract-drift|missing)$/)
        })
      ]));

      const afterFiles = fs.readdirSync(beforeRunDir).length;
      expect(afterFiles).toBe(beforeFiles);

      const invalidationPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(ledger.entries.some((entry) => entry.skill === 'manage-skill')).toBe(true);
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
      manageSkill.main(['set-status', skillName, 'experimental']);

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
      expect(payload.status).toBe('updated');
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
        freshness: {
          'max-age': 7,
          unit: 'days'
        },
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

  test('manage-skill sync-runtime-proof carries verify-skill-system project-root smoke manifests into the registry', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'verify-skill-system']);
      expect(payload.status).toBe('updated');

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === 'verify-skill-system');
      expect(entry['host-smoke']).toEqual({
        manifest: 'skills/tools/verify-skill-system/scripts/smoke.json',
        freshness: {
          'max-age': 7,
          unit: 'days'
        },
        commands: [
          {
            cwd: 'project-root',
            argv: ['node', 'personal-skill-system/skills/tools/verify-skill-system/scripts/run.js', '--target', 'personal-skill-system', '--self-smoke', '--json'],
            expect: { tool: 'verify-skill-system', status: 'pass' },
            'timeout-ms': 15000
          }
        ]
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof auto-promotes a stable governed skill to declared-and-tested when evidence already exists', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      entry.level = 'declared-only';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['sync-runtime-proof', 'verify-quality']);
      expect(payload.status).toBe('updated');
      expect(payload.level).toBe('declared-and-tested');

      const synced = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const syncedEntry = synced.proofs.find((item) => item.skill === 'verify-quality');
      expect(syncedEntry.level).toBe('declared-and-tested');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill rejects raw status edits through generic update', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['update', 'review', '--set', 'status=stable']))
        .toThrow('update cannot modify status directly');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill rejects direct identity and scaffold-lineage edits through generic update', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['update', 'review', '--set', 'name=review-v2']))
        .toThrow('update cannot modify name directly');
      expect(() => manageSkill.main(['update', 'review', '--set', 'kind=tool']))
        .toThrow('update cannot modify kind directly');
      expect(() => manageSkill.main(['update', 'review', '--set', 'scaffold-origin=workflow-template']))
        .toThrow('update cannot modify scaffold-origin directly');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill update removes governed route artifacts when user-invocable becomes false', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const routeMapPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json');
      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      expect(JSON.parse(fs.readFileSync(routeMapPath, 'utf8')).routes.some((route) => route.skill === 'review')).toBe(true);
      expect(JSON.parse(fs.readFileSync(fixturesPath, 'utf8')).cases.some((item) => String(item.expect || '').trim() === 'review')).toBe(true);

      const payload = manageSkill.main(['update', 'review', '--set', 'user-invocable=false']);
      expect(payload.action).toBe('update');

      const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      expect(routeMap.routes.some((route) => route.skill === 'review')).toBe(false);
      expect(fixtures.cases.some((item) => String(item.expect || '').trim() === 'review')).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill rejects runtime-proof and host-smoke contract edits through generic update', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['update', 'verify-quality', '--set', 'host-smoke-freshness-days=14']))
        .toThrow('update cannot modify host-smoke-freshness-days directly');
      expect(() => manageSkill.main(['update', 'verify-quality', '--set', 'runtime=knowledge']))
        .toThrow('update cannot modify runtime directly');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill set-status can deprecate scripted skills while syncing ratings and runtime-proof surfaces', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['set-status', 'verify-quality', 'deprecated']);
      expect(payload.action).toBe('set-status');
      expect(payload.previous_status).toBe('stable');
      expect(payload.status).toBe('deprecated');

      const skillFile = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-quality', 'SKILL.md');
      expect(fs.readFileSync(skillFile, 'utf8')).toContain('status: deprecated');

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const proof = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      expect(proof.level).toBe('declared-only');

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      expect(ratings['skill-level-summary']['top-level-enough-now']).not.toContain('verify-quality');
      expect(ratings['skill-level-summary']['useful-overlay-not-top-level-alone']).toContain('verify-quality');

      const readiness = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json'), 'utf8'));
      expect(readiness['schema-version']).toBe(SYSTEM_READINESS_SCHEMA_VERSION);
      expect(readiness.summary['runtime-proof-entries']).toBeGreaterThan(0);
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

  test('manage-skill run-host-smoke demotes host-smoked level when the latest execution fails', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['run-host-smoke', 'verify-quality', '--host', 'codex', '--promote-host-smoked']);

      const smokePath = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-quality', 'scripts', 'smoke.json');
      const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf8'));
      smoke.commands[0].expect.tool = 'broken-host-smoke-signal';
      fs.writeFileSync(smokePath, JSON.stringify(smoke, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['run-host-smoke', 'verify-quality', '--host', 'codex']);
      expect(payload.status).toBe('fail');
      expect(payload.demoted_skills).toEqual(['verify-quality']);

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      expect(entry.level).toBe('declared-and-tested');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill run-host-smoke tolerates system-readiness EPERM as best-effort debt', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    const commonModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'lib', 'skill-system-common.js');
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      jest.doMock(commonModulePath, () => {
        const actual = jest.requireActual(commonModulePath);
        return {
          ...actual,
          probeArtifactWriteAccess: jest.fn((targetPath, options = {}) => {
            const normalized = String(targetPath || '').replace(/\\/g, '/');
            if (
              normalized.endsWith('/benchmark/system-readiness.generated.json')
              && String(options.mode || '') === 'rewrite-file'
            ) {
              return {
                ok: false,
                mode: 'rewrite-file',
                path: targetPath,
                code: 'EPERM',
                message: 'mocked system-readiness write block'
              };
            }
            return actual.probeArtifactWriteAccess(targetPath, options);
          })
        };
      });

      const manageSkill = require(manageSkillModulePath);
      const payload = manageSkill.main(['run-host-smoke', 'manage-skill', '--host', 'codex', '--promote-host-smoked']);
      expect(payload.action).toBe('run-host-smoke');
      expect(payload.status).toBe('pass');
      expect(payload.promoted_skills).toEqual(['manage-skill']);

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
      expect(entry.level).toBe('host-smoked');
    } finally {
      jest.dontMock(commonModulePath);
      process.chdir(originalCwd);
    }
  });

  test('manage-skill can export derived governance through the CLI action surface', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const exportDir = path.join(repoRoot, '.tmp-derived-governance-export');
      const payload = manageSkill.main(['export-derived-governance', '--output-dir', exportDir]);
      expect(payload.action).toBe('export-derived-governance');
      expect(payload.artifact).toBe('derived-governance-export');
      expect(Array.isArray(payload['refresh-plan'])).toBe(true);
      expect(payload['refresh-plan'][0]).toEqual(expect.objectContaining({
        id: 'runtime-proof',
        order: 1
      }));
      expect(fs.existsSync(path.join(exportDir, 'manifest.json'))).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'manifest.json'), 'utf8'));
      expect(manifest.recovery['refresh-plan']).toEqual(payload['refresh-plan']);
      for (const artifactId of DERIVED_GOVERNANCE_EXPORT_ARTIFACT_IDS) {
        expect(fs.existsSync(path.join(exportDir, ...DERIVED_GOVERNANCE_ARTIFACT_PATHS[artifactId].split('/')))).toBe(true);
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill can apply the latest matching derived governance export without an explicit path', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const exportRoot = path.join(repoRoot, '.code-abyss', 'derived-governance-exports');
      const firstExport = path.join(exportRoot, 'older-export');
      const latestExport = path.join(exportRoot, 'latest-export');

      manageSkill.main(['export-derived-governance', '--output-dir', firstExport]);
      manageSkill.main(['export-derived-governance', '--output-dir', latestExport]);

      const readinessPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'system-readiness.generated.json');
      const hostEvolutionPath = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-evolution.generated.json');
      fs.writeFileSync(readinessPath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');
      fs.writeFileSync(hostEvolutionPath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['apply-derived-governance-export', '--latest']);
      expect(payload.action).toBe('apply-derived-governance-export');
      expect(payload.selection).toBe('latest-matching-export');
      expect(payload.source).toBe('.code-abyss/derived-governance-exports/latest-export');
      expect(payload.synced).toEqual(expect.arrayContaining([
        expect.objectContaining({
          artifact: 'system-readiness',
          file: 'personal-skill-system/benchmark/system-readiness.generated.json'
        }),
        expect.objectContaining({
          artifact: 'host-evolution',
          file: 'personal-skill-system/benchmark/host-evolution.generated.json'
        })
      ]));

      const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
      const hostEvolution = JSON.parse(fs.readFileSync(hostEvolutionPath, 'utf8'));
      expect(readiness['schema-version']).toBe(SYSTEM_READINESS_SCHEMA_VERSION);
      expect(hostEvolution['schema-version']).toBe(HOST_EVOLUTION_SCHEMA_VERSION);
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
      manageSkill.main(['set-status', skillName, 'experimental']);
      manageSkill.main([
        'update',
        skillName,
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

      const payload = manageSkill.main(['sync-runtime-proof', skillName, '--auto-evidence-tests', '--level', 'declared-and-tested']);
      expect(payload.status).toBe('updated');
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

      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      fixtures.cases.push({
        name: `explicit-${skillName}`,
        query: `Run ${skillName} on this temp quality wrapper task.`,
        expect: skillName,
        'expect-no-fallback': true
      });
      fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');

      const promoted = manageSkill.main(['set-status', skillName, 'stable']);
      expect(promoted.status).toBe('stable');

      const runtimeProofAfterPromotion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const promotedEntry = runtimeProofAfterPromotion.proofs.find((item) => item.skill === skillName);
      expect(promotedEntry.level).toBe('declared-and-tested');
      expect(promotedEntry['evidence-tests']).toEqual(payload.suggested_evidence_tests);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill blocks stable promotion when capability modules are not all top-ready', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-workflow-${Date.now()}`;
      manageSkill.main(['create', 'workflow', skillName, '--scaffold-modules']);
      manageSkill.main([
        'update',
        skillName,
        '--set',
        'description=Promotion gate workflow. Use when a governed workflow should own promotion checks.',
        '--set',
        'trigger-keywords=[promotion-gate-workflow,promotion-gate-workflow-route]'
      ]);

      expect(() => manageSkill.main(['set-status', skillName, 'stable']))
        .toThrow(new RegExp(`skill '${skillName}' is not ready for stable/top-tier promotion`));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill blocks stable promotion when stable route evidence is still missing', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-missing-route-evidence-${Date.now()}`;
      manageSkill.main(['create', 'tool', skillName]);
      manageSkill.main(['set-status', skillName, 'experimental']);
      manageSkill.main([
        'update',
        skillName,
        '--set', 'description=Experimental route-evidence gate. Use when explicit validation for route-evidence promotion checks is required.',
        '--set', 'trigger-keywords=[temp-route-evidence,temp-route-evidence-route]'
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
          '- `node scripts/run.js --target ./src --json` returns a structured route-evidence gate report',
          '- quality findings are preserved as explicit issue entries',
          '',
          '## Run',
          ''
        ].join('\n')
      );
      fs.writeFileSync(skillFile, updated, 'utf8');

      manageSkill.main(['sync-runtime-proof', skillName, '--auto-evidence-tests']);

      const assessment = manageSkill.main(['assess-top-tier', skillName]);
      expect(assessment.ready).toBe(false);
      expect(assessment['target-status']).toBe('stable');
      expect(assessment.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('has no route fixture evidence')
        })
      ]));

      expect(() => manageSkill.main(['set-status', skillName, 'stable']))
        .toThrow(new RegExp(`skill '${skillName}' is not ready for stable/top-tier promotion`));
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
      expect(['host-smoked', 'declared-and-tested']).toContain(syncedQuality.level);
      expect(syncedQuality.contracts).toEqual([
        '`node scripts/run.js --target ./src --json` returns a structured quality report with issue entries and severity',
        'language-specific maintainability smells are surfaced as findings rather than only aggregate scores'
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof repairs contract drift after new governance surfaces are added to Runtime Proof', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const runtimeProof = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const proof = runtimeProof.proofs.find((item) => item.skill === 'manage-skill');
      proof.contracts = proof.contracts.filter((item) => !String(item).includes('show-future-skill-pipeline'));
      fs.writeFileSync(runtimeProofPath, JSON.stringify(runtimeProof, null, 2) + '\n', 'utf8');

      const payload = manageSkill.main(['sync-runtime-proof', 'manage-skill']);
      expect(payload.action).toBe('sync-runtime-proof');

      const synced = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const syncedProof = synced.proofs.find((item) => item.skill === 'manage-skill');
      expect(syncedProof.contracts).toContain(
        '`show-future-skill-pipeline` compresses the future-skill control loop into one governed view, linking each thread\'s intake, admission decision, deferred scaffold, and host blockage instead of forcing maintainers to reconstruct state from separate registries'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('runtime-proof writes merge touched skills so later stale writes do not clobber earlier syncs', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const runtimeProofPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const seededRegistry = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      seededRegistry.proofs.find((item) => item.skill === 'verify-security').level = 'declared-only';
      seededRegistry.proofs.find((item) => item.skill === 'verify-s2-config').level = 'declared-and-tested';
      fs.writeFileSync(runtimeProofPath, JSON.stringify(seededRegistry, null, 2) + '\n', 'utf8');
      const staleRegistry = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      const staleProofs = staleRegistry.proofs;

      const syncPayload = manageSkill.main(['sync-runtime-proof', 'verify-security', '--level', 'declared-and-tested']);
      expect(syncPayload.level).toBe('declared-and-tested');

      const afterSync = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      expect(afterSync.proofs.find((item) => item.skill === 'verify-security').level).toBe('declared-and-tested');

      const staleLateWrite = staleProofs.map((proof) =>
        proof.skill === 'verify-s2-config'
          ? { ...proof, level: 'host-smoked' }
          : proof
      );
      manageSkill.writeRuntimeProofRegistry(repoRoot, staleLateWrite, {
        touchedSkills: ['verify-s2-config'],
        bestEffortReadiness: true
      });

      const afterMergedWrite = JSON.parse(fs.readFileSync(runtimeProofPath, 'utf8'));
      expect(afterMergedWrite.proofs.find((item) => item.skill === 'verify-security').level).toBe('declared-and-tested');
      expect(afterMergedWrite.proofs.find((item) => item.skill === 'verify-s2-config').level).toBe('host-smoked');
      expect(afterMergedWrite.proofs.filter((item) => item.skill === 'verify-security')).toHaveLength(1);
      expect(afterMergedWrite.proofs.filter((item) => item.skill === 'verify-s2-config')).toHaveLength(1);
      expect(staleLateWrite.find((item) => item.skill === 'verify-security').level).toBe('declared-only');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof demotes stale host-smoked entries to declared-and-tested', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    const originalNow = Date.now;
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['run-host-smoke', 'verify-quality', '--host', 'codex', '--promote-host-smoked']);

      const runsDir = path.join(repoRoot, 'personal-skill-system', 'benchmark', 'host-smoke', 'runtime-runs');
      const latestRunFile = fs.readdirSync(runsDir)
        .sort()
        .map((name) => path.join(runsDir, name))
        .pop();
      const latestRun = JSON.parse(fs.readFileSync(latestRunFile, 'utf8'));
      const staleNow = new Date(String(latestRun['executed-at']));
      staleNow.setUTCDate(staleNow.getUTCDate() + 8);
      Date.now = () => staleNow.getTime();

      const payload = manageSkill.main(['sync-runtime-proof', 'verify-quality']);
      expect(payload.status).toBe('updated');
      expect(payload.level).toBe('declared-and-tested');
      expect(payload.downgraded_from).toBe('host-smoked');
      expect(payload.downgrade_reason).toContain('older than the declared freshness window');

      const runtimeProof = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json'), 'utf8'));
      const entry = runtimeProof.proofs.find((item) => item.skill === 'verify-quality');
      expect(entry.level).toBe('declared-and-tested');
    } finally {
      Date.now = originalNow;
      process.chdir(originalCwd);
    }
  });

  test('manage-skill sync-runtime-proof keeps investment backlog aligned with refreshed host-smoke scorecard', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['sync-runtime-proof', 'verify-skill-system']);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) =>
        item.file === 'registry/skill-investment-backlog.generated.json'
        && item.message.includes('skill investment backlog is out of sync')
      )).toBe(false);
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
