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

    expect(['pass', 'warn']).toContain(report.status);
    expect(report.metrics.templateScaffolds).toBe(5);
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

      expect(['pass', 'warn']).toContain(report.status);
      expect(report.findings.filter((item) => item.severity === 'error')).toEqual([]);

      const routeMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'personal-skill-system', 'registry', 'route-map.generated.json'), 'utf8'));
      const createdRoute = routeMap.routes.find((route) => route.skill === skillName);
      expect(createdRoute.kind).toBe('workflow');
      expect(createdRoute.namespace).toBe('workflow');
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

    validateRouteMap(targetDir, routeMapPath, routeMapData, registryNames, skillRecords, moduleNames, findings, (root, file) => file);

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

    validateRouteMap(targetDir, routeMapPath, routeMapData, registryNames, skillRecords, moduleNames, findings, (root, file) => file);

    expect(findings.some((item) => item.message.includes("declares kind 'tool' but skill metadata says 'workflow'"))).toBe(true);
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

  test('verify-skill-system fails when system readiness artifact drifts from current governance state', () => {
    const repoRoot = path.join(tmpDir, 'repo');
    const target = path.join(repoRoot, 'personal-skill-system');
    copyBundleFixture(repoRoot);

    const readinessPath = path.join(target, 'benchmark', 'system-readiness.generated.json');
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    readiness.summary['runtime-proof-entries'] = 999;
    fs.writeFileSync(readinessPath, JSON.stringify(readiness, null, 2) + '\n', 'utf8');

    const report = analyzeSkillSystem(target);
    expect(report.findings.some((item) => item.message.includes('system readiness is out of sync'))).toBe(true);
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
});
