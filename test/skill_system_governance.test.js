'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeSkillSystem } = require('../personal-skill-system/skills/tools/lib/skill-system');
const { validateRouteMap, validateStableRouteEvidence } = require('../personal-skill-system/skills/tools/lib/skill-system-routing');

const manageSkillModulePath = path.join(__dirname, '..', 'personal-skill-system', 'skills', 'tools', 'manage-skill', 'scripts', 'run.js');

describe('skill system governance', () => {
  let tmpDir;

  function copyBundleFixture(repoRoot) {
    fs.cpSync(path.join(__dirname, '..', 'personal-skill-system'), path.join(repoRoot, 'personal-skill-system'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'test'), path.join(repoRoot, 'test'), { recursive: true });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pss-governance-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('analyzeSkillSystem validates canonical template scaffolds', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);

    expect(report.metrics.templateScaffolds).toBe(6);
    expect(report.findings.some((item) => item.message.includes("template 'tool' is missing scripts/smoke.json"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'domain' only has"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'workflow' only has"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'tool' is missing agents/openai.yaml"))).toBe(false);
    expect(report.findings.some((item) => item.message.includes("template 'adapter' only has"))).toBe(false);
  });

  test('analyzeSkillSystem fails when a scripted template loses smoke manifest coverage', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'tool', 'scripts', 'smoke.json'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("scripted template 'tool' is missing scripts/smoke.json"))).toBe(true);
  });

  test('analyzeSkillSystem fails when a canonical template loses required references', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'domain', 'references', 'decision-rules.md'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("template 'domain' only has"))).toBe(true);
  });

  test('analyzeSkillSystem fails when a workflow template drops below the top-tier reference floor', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'workflow', 'references', 'failure-modes.md'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("template 'workflow' only has 2 reference files; expected at least 3"))).toBe(true);
  });

  test('analyzeSkillSystem fails when a canonical template loses host metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'templates', 'skill', 'tool', 'agents', 'openai.yaml'));

    const report = analyzeSkillSystem(target);

    expect(report.status).toBe('fail');
    expect(report.findings.some((item) => item.message.includes("template 'tool' is missing agents/openai.yaml"))).toBe(true);
  });

  test('manage-skill create keeps a copied bundle structurally analyzable', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-governed-skill-${Date.now()}`;
      manageSkill.main(['create', 'workflow', skillName]);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));

      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      const createdRoute = routeMap.routes.find((route) => route.skill === skillName);
      expect(createdRoute.kind).toBe('workflow');
      expect(createdRoute.namespace).toBe('workflow');

      const hostMetadataPath = path.join(repoRoot, 'personal-skill-system', 'skills', 'workflows', skillName, 'agents', 'openai.yaml');
      const hostMetadata = fs.readFileSync(hostMetadataPath, 'utf8');
      expect(hostMetadata).toContain(`display_name: "${skillName.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')} Workflow"`);
      expect(hostMetadata).toContain(`default_prompt: "Use ~/.agents/skills/workflows/${skillName}/SKILL.md as the primary instruction source before acting on ${skillName}."`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create adapter scaffolds a governed internal skill without route drift', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-host-adapter-${Date.now()}`;
      const payload = manageSkill.main(['create', 'adapter', skillName]);
      expect(payload.kind).toBe('adapter');
      expect(payload.path).toBe(`personal-skill-system/skills/adapters/${skillName}`);

      const skillFile = path.join(repoRoot, 'personal-skill-system', 'skills', 'adapters', skillName, 'SKILL.md');
      const skillText = fs.readFileSync(skillFile, 'utf8');
      expect(skillText).toContain('kind: adapter');
      expect(skillText).toContain('user-invocable: false');

      const hostMetadataPath = path.join(repoRoot, 'personal-skill-system', 'skills', 'adapters', skillName, 'agents', 'openai.yaml');
      const hostMetadata = fs.readFileSync(hostMetadataPath, 'utf8');
      expect(hostMetadata).toContain(`default_prompt: "Use ~/.agents/skills/adapters/${skillName}/SKILL.md as the primary instruction source before acting on ${skillName}."`);

      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      expect(registry.skills.some((entry) => entry.name === skillName && entry.kind === 'adapter')).toBe(true);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      expect(routeMap.routes.some((route) => route.skill === skillName)).toBe(false);

      const fixtures = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json'), 'utf8'));
      expect(fixtures.cases.some((entry) => entry.expect === skillName)).toBe(false);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill update rewrites agents/openai.yaml to match the updated SKILL metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['sync-host-metadata', '--skill', 'verify-quality']);
      manageSkill.main([
        'update',
        'verify-quality',
        '--set',
        'title=Quality Gate Tool',
        '--set',
        'description=Harden maintainability and code-health checks for a repository. Use when quality policy or code-health validation is the primary task.'
      ]);

      const hostMetadataPath = path.join(repoRoot, 'personal-skill-system', 'skills', 'tools', 'verify-quality', 'agents', 'openai.yaml');
      const hostMetadata = fs.readFileSync(hostMetadataPath, 'utf8');
      expect(hostMetadata).toContain('display_name: "Quality Gate Tool"');
      expect(hostMetadata).toContain('short_description: "Harden maintainability and code-health checks for a repository."');
      expect(hostMetadata).toContain('default_prompt: "Use ~/.agents/skills/tools/verify-quality/SKILL.md as the primary instruction source before acting on verify-quality."');

      const routeMapPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json');
      const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const route = routeMap.routes.find((item) => item.skill === 'verify-quality');
      expect(route.priority).toBe(90);
      expect(route.activation['trigger-keywords']).toEqual(expect.arrayContaining([
        'verify-quality',
        'quality scan',
        'complexity scan',
        'code smell',
        'quality check',
        'code quality check'
      ]));
      expect(route.aliases).toEqual(expect.arrayContaining(['vq', 'quality-audit']));
      expect(route.activation['requires-explicit-invocation']).toBe(true);

      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const fixture = fixtures.cases.find((item) => item.name === 'placeholder-route-verify-quality');
      expect(fixture).toEqual(expect.objectContaining({
        expect: 'verify-quality',
        governed: true
      }));
      expect(fixture.query).toContain('Run verify-quality');

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'display_name' is out of sync with SKILL.md"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'short_description' is out of sync with SKILL.md"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' priority"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing trigger-keywords"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("governed route fixture 'placeholder-route-verify-quality' is out of sync"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create --scaffold-modules seeds module-group, route expert-modules, and thin capability ratings', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-domain-skill-${Date.now()}`;
      const payload = manageSkill.main(['create', 'domain', skillName, '--scaffold-modules']);

      expect(payload['scaffolded-capability-modules']).toEqual([
        `${skillName}-decision-rules`,
        `${skillName}-deep-reference-index`,
        `${skillName}-boundaries-and-escalations`
      ]);

      const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8'));
      const group = registry['module-groups'].find((item) => item['host-skill'] === skillName);
      expect(group).toBeTruthy();
      expect(group['host-kind']).toBe('domain');
      expect(group.modules.map((item) => item.id)).toEqual(payload['scaffolded-capability-modules']);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      const route = routeMap.routes.find((item) => item.skill === skillName);
      expect(route['expert-modules']).toEqual(payload['scaffolded-capability-modules']);

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      expect(ratings['rating-buckets'].thin).toEqual(expect.arrayContaining(payload['scaffolded-capability-modules']));
      expect(ratings['next-batch']).toEqual(expect.arrayContaining([
        expect.objectContaining({
          scope: 'capability-module',
          module: `${skillName}-decision-rules`,
          'host-skill': skillName,
          rating: 'thin',
          priority: 'upgrade-now'
        }),
        expect.objectContaining({
          scope: 'capability-module',
          module: `${skillName}-deep-reference-index`,
          'host-skill': skillName,
          rating: 'thin',
          priority: 'upgrade-now'
        }),
        expect.objectContaining({
          scope: 'capability-module',
          module: `${skillName}-boundaries-and-escalations`,
          'host-skill': skillName,
          rating: 'thin',
          priority: 'upgrade-now'
        })
      ]));

      const ratingsDoc = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
      expect(ratingsDoc).toContain(`- \`${skillName}-decision-rules\` (\`${skillName}\`, \`thin\`): Replace scaffold placeholders, deepen the reference, and add route evidence before promotion.`);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create rejects capability-module scaffolding for non domain/workflow kinds', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['create', 'tool', `temp-tool-${Date.now()}`, '--scaffold-modules']))
        .toThrow("capability-module scaffolding is only supported for domain and workflow skills");
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check stays read-only while recommending add vs reuse vs upgrade paths', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const registryBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8');
      const routeMapBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8');
      const ledgerBefore = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8');

      const reuse = manageSkill.main(['admission-check', '--no-record', 'we need to create skill crud flows and archive skill records safely']);
      expect(reuse.recommendation.action).toBe('reuse-existing-skill');
      expect(reuse.recommendation.target_skill).toBe('manage-skill');

      const upgrade = manageSkill.main(['admission-check', '--no-record', 'release process needs stronger verification checklist']);
      expect(upgrade.recommendation.action).toBe('upgrade-existing-skill');
      expect(upgrade.recommendation.target_skill).toBe('ship');

      const create = manageSkill.main(['admission-check', '--no-record', '--kind', 'guard', 'we need a new policy gate that blocks unsafe skill deletion during pack release']);
      expect(create.recommendation.action).toBe('create-new-skill');
      expect(create.recommendation.suggested_kind).toBe('guard');

      const registryAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'registry.generated.json'), 'utf8');
      const routeMapAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8');
      const ledgerAfter = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8');
      expect(registryAfter).toBe(registryBefore);
      expect(routeMapAfter).toBe(routeMapBefore);
      expect(ledgerAfter).toBe(ledgerBefore);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill admission-check records create-new-skill decisions in the governed admission ledger', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['admission-check', '--kind', 'guard', 'we need a new policy gate that blocks unsafe skill deletion during pack release']);
      expect(payload['request-id']).toBeTruthy();
      expect(payload['recorded-at']).toBeTruthy();

      const ledger = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'admission-ledger.generated.json'), 'utf8'));
      const entry = ledger.entries.find((item) => item['request-id'] === payload['request-id']);
      expect(entry).toEqual(expect.objectContaining({
        request: 'we need a new policy gate that blocks unsafe skill deletion during pack release',
        status: 'open'
      }));
      expect(entry.decision).toEqual(expect.objectContaining({
        action: 'create-new-skill',
        suggested_kind: 'guard'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill create --request-id closes the governed admission request as implemented', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const admission = manageSkill.main(['admission-check', '--kind', 'workflow', 'we need a repeatable dependency-upgrade workflow']);
      const skillName = `temp-admission-workflow-${Date.now()}`;
      const created = manageSkill.main(['create', 'workflow', skillName, '--request-id', admission['request-id']]);

      expect(created['admission-request-id']).toBe(admission['request-id']);

      const ledgerPayload = manageSkill.main(['show-admission-ledger', '--request-id', admission['request-id']]);
      expect(ledgerPayload.returned).toBe(1);
      expect(ledgerPayload.entries[0]).toEqual(expect.objectContaining({
        'request-id': admission['request-id'],
        status: 'implemented',
        'created-skill': skillName
      }));
      expect(ledgerPayload.entries[0]['resolved-at']).toBeTruthy();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('verify-skill-system fails when implemented admission requests reference missing created skills', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ledgerPath = path.join(target, 'registry', 'admission-ledger.generated.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      'schema-version': 1,
      entries: [
        {
          'request-id': '20260508-missing-skill',
          request: 'we need a missing skill record',
          decision: {
            action: 'create-new-skill',
            suggested_kind: 'tool'
          },
          status: 'implemented',
          'created-skill': 'totally-missing-skill',
          'recorded-at': '2026-05-08T00:00:00Z',
          'resolved-at': '2026-05-08T01:00:00Z'
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/admission-ledger.generated.json'
      && item.message.includes("references unknown created-skill 'totally-missing-skill'")
    )).toBe(true);
  });

  test('manage-skill set-module-rating --skill promotes every module in the host skill and clears next-batch', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const skillName = `temp-workflow-${Date.now()}`;
      const createPayload = manageSkill.main(['create', 'workflow', skillName, '--scaffold-modules']);
      const scaffoldedModules = createPayload['scaffolded-capability-modules'];

      const firstPromotion = manageSkill.main(['set-module-rating', '--skill', skillName, 'strong-but-not-top']);
      expect(firstPromotion.scope).toBe('skill');
      expect(firstPromotion.skill).toBe(skillName);
      expect(firstPromotion.modules).toEqual(scaffoldedModules);

      const secondPromotion = manageSkill.main(['set-module-rating', '--skill', skillName, 'top-ready']);
      expect(secondPromotion.scope).toBe('skill');
      expect(secondPromotion.modules).toEqual(scaffoldedModules);
      expect(secondPromotion.rating).toBe('top-ready');

      const ratings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'capability-ratings.generated.json'), 'utf8'));
      for (const moduleId of scaffoldedModules) {
        expect(ratings['rating-buckets']['top-ready']).toContain(moduleId);
        expect(ratings['rating-buckets']['strong-but-not-top']).not.toContain(moduleId);
        expect(ratings['rating-buckets'].thin).not.toContain(moduleId);
      }
      expect((ratings['next-batch'] || []).some((item) => scaffoldedModules.includes(item.module))).toBe(false);

      const ratingsDoc = fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'docs', 'CAPABILITY_MODULE_RATINGS.md'), 'utf8');
      for (const moduleId of scaffoldedModules) {
        expect(ratingsDoc).toContain(`- \`${moduleId}\``);
      }

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      const createRelatedErrors = report.findings.filter((item) =>
        item.severity === 'error'
        && (item.file.includes(skillName) || item.message.includes(skillName))
      );
      expect(createRelatedErrors).toEqual([]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('archived user-invocable skills do not require active route entries', () => {
    const findings = [];
    const targetDir = 'C:/tmp/personal-skill-system';
    const routeMapPath = 'C:/tmp/personal-skill-system/registry/route-map.generated.json';
    const routeMapData = { routes: [] };
    const registryNames = new Set(['archived-skill']);
    const skillRecords = [
      {
        name: 'archived-skill',
        kind: 'workflow',
        userInvocable: true,
        status: 'archived',
        file: 'skills/workflows/archived-skill/SKILL.md'
      }
    ];
    const moduleNames = new Set();

    validateRouteMap(targetDir, routeMapPath, routeMapData, registryNames, skillRecords, moduleNames, [], findings, (root, file) => file);

    expect(findings).toEqual([]);
  });

  test('route map rejects kind drift between route entry and skill metadata', () => {
    const findings = [];
    const targetDir = 'C:/tmp/personal-skill-system';
    const routeMapPath = 'C:/tmp/personal-skill-system/registry/route-map.generated.json';
    const routeMapData = {
      routes: [
        {
          skill: 'kind-drift-skill',
          kind: 'tool',
          activation: { 'intent-tags': ['execute'], 'trigger-keywords': ['kind-drift-skill'], 'negative-keywords': [] }
        }
      ]
    };
    const registryNames = new Set(['kind-drift-skill']);
    const skillRecords = [
      {
        name: 'kind-drift-skill',
        kind: 'workflow',
        userInvocable: true,
        status: 'stable',
        file: 'skills/workflows/kind-drift-skill/SKILL.md'
      }
    ];
    const moduleNames = new Set();

    validateRouteMap(targetDir, routeMapPath, routeMapData, registryNames, skillRecords, moduleNames, [], findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("declares kind 'tool' but skill metadata says 'workflow'"))).toBe(true);
  });

  test('route map rejects shared route metadata drift from SKILL frontmatter', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'verify-quality');
    route.priority = 77;
    route.activation['trigger-keywords'] = ['verify-quality'];
    route.aliases = [];
    route.activation['requires-explicit-invocation'] = false;
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing trigger-keywords declared in SKILL metadata"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing aliases declared in SKILL metadata"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("route 'verify-quality' requires-explicit-invocation 'false' is out of sync with SKILL trigger-mode"))).toBe(true);
  });

  test('route map rejects expert-module drift from the registered module-group', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'manage-skill');
    delete route['expert-modules'];
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("route 'manage-skill' expert-modules are out of sync with registry.generated.json module-group"))).toBe(true);
  });

  test('stable user-invocable skills require route-fixture evidence', () => {
    const findings = [];
    const fixturesPath = 'C:/tmp/personal-skill-system/registry/route-fixtures.generated.json';
    const fixturesData = { cases: [] };
    const skillRecords = [
      {
        name: 'fixtureless-stable-skill',
        kind: 'domain',
        userInvocable: true,
        status: 'stable',
        file: 'skills/domains/fixtureless-stable-skill/SKILL.md'
      }
    ];

    validateStableRouteEvidence('C:/tmp/personal-skill-system', fixturesPath, fixturesData, skillRecords, findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("stable skill 'fixtureless-stable-skill' has no route fixture evidence"))).toBe(true);
  });

  test('stable user-invocable skills do not count governed placeholder fixtures as top-tier evidence', () => {
    const findings = [];
    const fixturesPath = 'C:/tmp/personal-skill-system/registry/route-fixtures.generated.json';
    const fixturesData = {
      cases: [
        {
          name: 'placeholder-route-fixtureless-stable-skill',
          query: 'Run fixtureless-stable-skill for this request.',
          expect: 'fixtureless-stable-skill',
          'expect-no-fallback': true,
          governed: true
        }
      ]
    };
    const skillRecords = [
      {
        name: 'fixtureless-stable-skill',
        kind: 'domain',
        userInvocable: true,
        status: 'stable',
        file: 'skills/domains/fixtureless-stable-skill/SKILL.md'
      }
    ];

    validateStableRouteEvidence('C:/tmp/personal-skill-system', fixturesPath, fixturesData, skillRecords, findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("stable skill 'fixtureless-stable-skill' has no route fixture evidence"))).toBe(true);
  });

  test('stable scripted skills require runtime proof bullets', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillFile = path.join(target, 'skills', 'tools', 'verify-quality', 'SKILL.md');
    const original = fs.readFileSync(skillFile, 'utf8');
    const weakened = original.replace(/\n## Runtime Proof[\s\S]*?\n## Run\n/, '\n## Run\n');
    fs.writeFileSync(skillFile, weakened, 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('stable scripted skill should declare at least two runtime proof bullets'))).toBe(true);
  });

  test('verify-skill-system fails when capability next-batch misses upgrade candidates', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    ratings['rating-buckets'].thin = ['temp-module'];
    ratings.counts.thin = 1;
    ratings.counts.total += 1;
    ratings['next-batch'] = [];
    fs.writeFileSync(ratingsPath, JSON.stringify(ratings, null, 2) + '\n', 'utf8');

    const registryPath = path.join(target, 'registry', 'registry.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry['module-groups'].push({
      'host-skill': 'manage-skill',
      'host-kind': 'tool',
      modules: [
        {
          id: 'temp-module',
          path: 'skills/tools/manage-skill/references/authoritative-skill-rules.md',
          capability: 'Temporary upgrade candidate.'
        }
      ]
    });
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("capability next-batch is missing upgrade candidate 'temp-module'"))).toBe(true);
  });

  test('verify-skill-system fails when ratings doc next-batch section drifts from generated data', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const docPath = path.join(target, 'docs', 'CAPABILITY_MODULE_RATINGS.md');
    const original = fs.readFileSync(docPath, 'utf8');
    const drifted = original.replace(
      '- `(none; the current bundle is fully promoted in this snapshot)`',
      '- `wrong-module` (`wrong-skill`, `thin`): stale doc entry'
    );
    fs.writeFileSync(docPath, drifted, 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("ratings doc 'Next Batch' section is out of sync with capability-ratings.generated.json"))).toBe(true);
  });

  test('stable scripted skills require runtime-proof registry coverage', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.proofs = registry.proofs.filter((item) => item.skill !== 'verify-quality');
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("stable scripted skill 'verify-quality' is missing from runtime-proof.generated.json"))).toBe(true);
  });

  test('runtime-proof registry contracts must match SKILL runtime proof bullets', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-security');
    proof.contracts[0] = 'mismatched contract text';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof registry contracts for 'verify-security' do not match"))).toBe(true);
  });

  test('runtime-proof evidence tests must point to real test cases', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'pre-merge-gate');
    proof['evidence-tests'] = ['test/personal_skill_system_tools.test.js::nonexistent runtime proof'];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof evidence test 'test/personal_skill_system_tools.test.js::nonexistent runtime proof' for 'pre-merge-gate' was not found in the referenced test file"))).toBe(true);
  });

  test('stable scripted skills require runtime-proof host-smoke metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-quality');
    delete proof['host-smoke'];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' is missing host-smoke metadata"))).toBe(true);
  });

  test('runtime-proof host-smoke metadata must match the skill smoke manifest', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-security');
    proof['host-smoke'].commands[0].expect.tool = 'broken-signal';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof host-smoke metadata for 'verify-security' does not match scripts/smoke.json"))).toBe(true);
  });

  test('host-smoked runtime-proof entries require at least one host smoke command', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-module');
    proof.level = 'host-smoked';
    proof['host-smoke'].commands = [];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-module' marked 'host-smoked' must declare at least one host-smoke command"))).toBe(true);
  });

  test('host-smoked runtime-proof entries require matching executed host-smoke evidence', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runDir = path.join(target, 'benchmark', 'host-smoke', 'runtime-runs');
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-module');
    proof.level = 'host-smoked';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-module' is marked 'host-smoked' but no matching runtime host-smoke artifact exists"))).toBe(true);
  });

  test('executed runtime host-smoke evidence satisfies host-smoked governance', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['run-host-smoke', 'verify-quality', '--host', 'codex', '--promote-host-smoked']);

      const report = analyzeSkillSystem(path.join(repoRoot, 'personal-skill-system'));
      expect(report.findings.some((item) => item.message.includes("verify-quality' is marked 'host-smoked' but no matching runtime host-smoke artifact exists"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("verify-quality' is marked 'host-smoked' but the latest matching runtime host-smoke artifact did not pass"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('verify-skill-system fails when host-smoke scorecard is missing', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    fs.rmSync(path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json'), { force: true });

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('host-smoke scorecard parse failed'))).toBe(true);
  });

  test('verify-skill-system fails when host-smoke scorecard drifts from runtime evidence', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const scorecardPath = path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json');
    const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
    scorecard.summary['host-smoke-capable-skills'] = 999;
    fs.writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('host-smoke scorecard is out of sync'))).toBe(true);
  });

  test('reconcile-host-smoke invalidates drifted artifacts through the governed ledger and clears contract-drift', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['reconcile-host-smoke', 'manage-skill', '--invalidate-drift']);
      expect(payload.action).toBe('reconcile-host-smoke');

      const invalidationPath = path.join(target, 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(Array.isArray(ledger.entries)).toBe(true);
      expect(ledger.entries.some((entry) => entry.skill === 'manage-skill' && entry.reason === 'contract-drift')).toBe(true);
      expect(payload.invalidated_runs).toBeGreaterThanOrEqual(0);

      const scorecardPath = path.join(target, 'benchmark', 'host-smoke', 'scorecard.generated.json');
      const scorecard = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
      const manageSkillEntry = scorecard.skills.find((item) => item.skill === 'manage-skill');
      expect(manageSkillEntry['evidence-status']).toBe('missing');

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime host-smoke artifacts exist for 'manage-skill' but do not match the current host-smoke contract"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes('host-smoke invalidation ledger is out of sync'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-runtime-proof invalidates drifted host-smoke artifacts for the selected skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'manage-skill']);
      expect(payload.action).toBe('sync-runtime-proof');
      expect(payload.skill).toBe('manage-skill');

      const invalidationPath = path.join(target, 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(ledger.entries.some((entry) => entry.skill === 'manage-skill' && entry.reason === 'contract-drift')).toBe(true);
      expect(payload.invalidated_runs).toBeGreaterThanOrEqual(0);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime host-smoke artifacts exist for 'manage-skill' but do not match the current host-smoke contract"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes('host-smoke invalidation ledger is out of sync'))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-runtime-proof --all invalidates drifted host-smoke artifacts bundle-wide', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', '--all']);
      expect(payload.action).toBe('sync-runtime-proof');
      expect(payload.scope).toBe('all');
      expect(payload.invalidated_runs).toBeGreaterThan(0);
      expect(payload.updated).toEqual(expect.arrayContaining([
        expect.objectContaining({
          skill: 'manage-skill'
        })
      ]));

      const invalidationPath = path.join(target, 'benchmark', 'host-smoke', 'invalidation.generated.json');
      const ledger = JSON.parse(fs.readFileSync(invalidationPath, 'utf8'));
      expect(ledger.entries.some((entry) => entry.skill === 'manage-skill' && entry.reason === 'contract-drift')).toBe(true);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime host-smoke artifacts exist for 'manage-skill' but do not match the current host-smoke contract"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('verify-skill-system fails when system readiness artifact drifts from current governance state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const readinessPath = path.join(target, 'benchmark', 'system-readiness.generated.json');
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    readiness.summary['runtime-proof-entries'] = 999;
    fs.writeFileSync(readinessPath, JSON.stringify(readiness, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'benchmark/system-readiness.generated.json'
      && item.message.includes('system readiness is out of sync')
    )).toBe(true);
  });

  test('verify-skill-system fails when a stable skill still owns non-top-ready capability modules', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const ratingsPath = path.join(target, 'registry', 'capability-ratings.generated.json');
    const ratings = JSON.parse(fs.readFileSync(ratingsPath, 'utf8'));
    ratings['rating-buckets']['top-ready'] = ratings['rating-buckets']['top-ready'].filter((item) => item !== 'skill-management-authoritative-crud');
    ratings['rating-buckets']['strong-but-not-top'].push('skill-management-authoritative-crud');
    ratings.counts['top-ready'] -= 1;
    ratings.counts['strong-but-not-top'] += 1;
    fs.writeFileSync(ratingsPath, JSON.stringify(ratings, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) =>
      item.file === 'registry/capability-ratings.generated.json'
      && item.message.includes("stable skill 'manage-skill' has non-top-ready capability modules")
    )).toBe(true);
  });

  test('verify-skill-system warns when generated governance artifacts are not writable on the host', () => {
    const target = path.join(__dirname, '..', 'personal-skill-system');
    const report = analyzeSkillSystem(target);

    expect(report.findings.some((item) => item.message.includes('system readiness artifact is not writable on this host'))).toBe(true);
  });

  test('host-smoked runtime-proof entries fail when the latest passing evidence is older than the declared freshness window', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runDir = path.join(target, 'benchmark', 'host-smoke', 'runtime-runs');
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'stale-verify-quality.json'), JSON.stringify({
      'schema-version': 1,
      'run-id': 'stale-verify-quality',
      'executed-at': '2026-04-01T00:00:00Z',
      host: 'codex',
      'source-runtime-proof': 'registry/runtime-proof.generated.json',
      selection: {
        scope: 'single',
        skills: ['verify-quality']
      },
      results: [
        {
          skill: 'verify-quality',
          kind: 'tool',
          'level-before': 'declared-and-tested',
          status: 'pass',
          manifest: 'skills/tools/verify-quality/scripts/smoke.json',
          contract: {
            manifest: 'skills/tools/verify-quality/scripts/smoke.json',
            freshness: {
              'max-age': 7,
              unit: 'days'
            },
            commands: [
              {
                cwd: 'skill-dir',
                argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
                expect: {
                  tool: 'verify-quality'
                },
                'timeout-ms': 10000
              }
            ]
          },
          'command-count': 1,
          'passed-commands': 1,
          commands: [
            {
              cwd: 'skill-dir',
              argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
              expect: {
                tool: 'verify-quality'
              },
              'timeout-ms': 10000,
              status: 'pass',
              'exit-code': 0,
              signal: null,
              'duration-ms': 15,
              'json-parse-ok': true,
              observed: {
                tool: 'verify-quality'
              },
              mismatches: []
            }
          ]
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-06T00:00:00Z').getTime();
    try {
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' is marked 'host-smoked' but the latest passing runtime host-smoke artifact is older than the declared freshness window"))).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  test('host-smoked runtime-proof entries accept recent passing evidence within the freshness window', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const runDir = path.join(target, 'benchmark', 'host-smoke', 'runtime-runs');
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'fresh-verify-quality.json'), JSON.stringify({
      'schema-version': 1,
      'run-id': 'fresh-verify-quality',
      'executed-at': '2026-05-05T00:00:00Z',
      host: 'codex',
      'source-runtime-proof': 'registry/runtime-proof.generated.json',
      selection: {
        scope: 'single',
        skills: ['verify-quality']
      },
      results: [
        {
          skill: 'verify-quality',
          kind: 'tool',
          'level-before': 'declared-and-tested',
          status: 'pass',
          manifest: 'skills/tools/verify-quality/scripts/smoke.json',
          contract: {
            manifest: 'skills/tools/verify-quality/scripts/smoke.json',
            freshness: {
              'max-age': 7,
              unit: 'days'
            },
            commands: [
              {
                cwd: 'skill-dir',
                argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
                expect: {
                  tool: 'verify-quality'
                },
                'timeout-ms': 10000
              }
            ]
          },
          'command-count': 1,
          'passed-commands': 1,
          commands: [
            {
              cwd: 'skill-dir',
              argv: ['node', 'scripts/run.js', '--target', '.', '--json'],
              expect: {
                tool: 'verify-quality'
              },
              'timeout-ms': 10000,
              status: 'pass',
              'exit-code': 0,
              signal: null,
              'duration-ms': 15,
              'json-parse-ok': true,
              observed: {
                tool: 'verify-quality'
              },
              mismatches: []
            }
          ]
        }
      ]
    }, null, 2) + '\n', 'utf8');

    const originalNow = Date.now;
    Date.now = () => new Date('2026-05-06T00:00:00Z').getTime();
    try {
      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' is marked 'host-smoked' but the latest passing runtime host-smoke artifact is older than the declared freshness window"))).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });

  test('stable scripted skills warn when runtime-proof level is still declared-only', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const registryPath = path.join(target, 'registry', 'runtime-proof.generated.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const proof = registry.proofs.find((item) => item.skill === 'verify-quality');
    proof.level = 'declared-only';
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("stable scripted skill 'verify-quality' is still marked 'declared-only'"))).toBe(true);
    expect(report.findings.some((item) => item.message.includes("runtime proof entry for 'verify-quality' should reference at least one evidence test"))).toBe(false);
  });

  test('stable skills warn when agents/openai.yaml is missing', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const hostMetadataDir = path.join(target, 'skills', 'tools', 'verify-quality', 'agents');
    fs.rmSync(hostMetadataDir, { recursive: true, force: true });

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('stable skill is missing agents/openai.yaml host metadata'))).toBe(true);
  });

  test('existing host metadata must stay in sync with SKILL metadata', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const skillDir = path.join(target, 'skills', 'tools', 'verify-quality');
    const hostMetadataPath = path.join(skillDir, 'agents', 'openai.yaml');
    fs.mkdirSync(path.dirname(hostMetadataPath), { recursive: true });
    fs.writeFileSync(hostMetadataPath, [
      'display_name: "Wrong Name"',
      'short_description: "Wrong description"',
      'default_prompt: "Use ~/.agents/skills/tools/wrong/SKILL.md as the primary instruction source before acting on wrong."',
      ''
    ].join('\n'), 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'display_name' is out of sync with SKILL.md"))).toBe(true);
  });

  test('sync-host-metadata --all backfills stable skills and preserves nested runtime paths', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-host-metadata', '--all']);
      expect(payload.action).toBe('sync-host-metadata');
      expect(payload.scope).toBe('all');
      expect(payload.synced).toEqual(expect.arrayContaining(['verify-quality', 'sage', 'claymorphism']));

      const verifyQualityHostMetadata = fs.readFileSync(path.join(target, 'skills', 'tools', 'verify-quality', 'agents', 'openai.yaml'), 'utf8');
      expect(verifyQualityHostMetadata).toContain('default_prompt: "Use ~/.agents/skills/tools/verify-quality/SKILL.md as the primary instruction source before acting on verify-quality."');

      const claymorphismHostMetadata = fs.readFileSync(path.join(target, 'skills', 'domains', 'frontend-design', 'variants', 'claymorphism', 'agents', 'openai.yaml'), 'utf8');
      expect(claymorphismHostMetadata).toContain('default_prompt: "Use ~/.agents/skills/domains/frontend-design/variants/claymorphism/SKILL.md as the primary instruction source before acting on claymorphism."');

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes('stable skill is missing agents/openai.yaml host metadata'))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("agents/openai.yaml 'default_prompt' is out of sync with SKILL.md"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-route-metadata --all reconciles shared route metadata from SKILL frontmatter', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'verify-quality');
    route.activation['trigger-keywords'] = ['verify-quality'];
    route.aliases = [];
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-route-metadata', '--all']);
      expect(payload.action).toBe('sync-route-metadata');
      expect(payload.scope).toBe('all');
      expect(payload.synced).toEqual(expect.arrayContaining(['verify-quality', 'claymorphism', 'skill-evolution']));

      const refreshedRouteMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const refreshedRoute = refreshedRouteMap.routes.find((item) => item.skill === 'verify-quality');
      expect(refreshedRoute.activation['trigger-keywords']).toEqual(expect.arrayContaining([
        'verify-quality',
        'quality scan',
        'complexity scan'
      ]));
      expect(refreshedRoute.aliases).toEqual(expect.arrayContaining(['vq', 'quality-audit']));

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing trigger-keywords declared in SKILL metadata"))).toBe(false);
      expect(report.findings.some((item) => item.message.includes("route 'verify-quality' is missing aliases declared in SKILL metadata"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-route-metadata refreshes route expert-modules from the registered module-group', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const routeMapPath = path.join(target, 'registry', 'route-map.generated.json');
    const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
    const route = routeMap.routes.find((item) => item.skill === 'manage-skill');
    route['expert-modules'] = [];
    fs.writeFileSync(routeMapPath, JSON.stringify(routeMap, null, 2) + '\n', 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-route-metadata', 'manage-skill']);
      expect(payload.action).toBe('sync-route-metadata');
      expect(payload.scope).toBe('single');
      expect(payload.skill).toBe('manage-skill');

      const refreshedRouteMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      const refreshedRoute = refreshedRouteMap.routes.find((item) => item.skill === 'manage-skill');
      expect(refreshedRoute['expert-modules']).toEqual(['skill-management-authoritative-crud']);

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("route 'manage-skill' expert-modules are out of sync"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('archive removes runtime-proof coverage for the archived scripted skill', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['archive', 'verify-quality']);

      const registryPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

      expect(registry.proofs.some((item) => item.skill === 'verify-quality')).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('set-status restores runtime-proof coverage when an archived scripted skill becomes experimental again', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main(['archive', 'verify-quality']);
      const payload = manageSkill.main(['set-status', 'verify-quality', 'experimental']);
      expect(payload.previous_status).toBe('archived');
      expect(payload.status).toBe('experimental');

      const registryPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'runtime-proof.generated.json');
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const proof = registry.proofs.find((item) => item.skill === 'verify-quality');

      expect(proof).toBeTruthy();
      expect(proof.level).toBe('declared-only');

      const routeMapPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json');
      const routeMap = JSON.parse(fs.readFileSync(routeMapPath, 'utf8'));
      expect(routeMap.routes.some((item) => item.skill === 'verify-quality')).toBe(true);

      const fixturesPath = path.join(repoRoot, 'personal-skill-system', 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const fixture = fixtures.cases.find((item) => item.name === 'placeholder-route-verify-quality' && item.expect === 'verify-quality');
      expect(fixture).toEqual(expect.objectContaining({
        governed: true
      }));
      expect(fixture.query).toContain('Run verify-quality');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-route-metadata rewrites governed route fixtures when trigger metadata changes', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const originalCwd = process.cwd();
    try {
      process.chdir(repoRoot);
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      manageSkill.main([
        'update',
        'verify-quality',
        '--set',
        'trigger-keywords=[verify-quality,maintainability scan,quality gate]',
        '--set',
        'aliases=[vq,quality-audit]'
      ]);

      const fixturesPath = path.join(target, 'registry', 'route-fixtures.generated.json');
      const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
      const fixture = fixtures.cases.find((item) => item.name === 'placeholder-route-verify-quality');

      expect(fixture).toEqual(expect.objectContaining({
        expect: 'verify-quality',
        governed: true
      }));
      expect(fixture.query).toContain('Run verify-quality');

      const report = analyzeSkillSystem(target);
      expect(report.findings.some((item) => item.message.includes("governed route fixture 'placeholder-route-verify-quality' is out of sync"))).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('manage-skill blocks lifecycle transitions when generated governance artifacts are not writable', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(path.join(__dirname, '..'));
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      expect(() => manageSkill.main(['set-status', 'verify-security', 'deprecated']))
        .toThrow(/system-readiness\.generated\.json/);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('sync-runtime-proof tolerates readiness write failure while still syncing runtime-proof and invalidations', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(path.join(__dirname, '..'));
      jest.resetModules();
      const manageSkill = require(manageSkillModulePath);

      const payload = manageSkill.main(['sync-runtime-proof', 'manage-skill']);
      expect(payload.action).toBe('sync-runtime-proof');
      expect(payload.skill).toBe('manage-skill');
      expect(payload.readiness_warning).toEqual(expect.objectContaining({
        code: 'EPERM'
      }));
    } finally {
      process.chdir(originalCwd);
    }
  });
});
