'use strict';

const {
  listInstallTargets,
  listTargetNames,
  isSupportedTarget,
  getManagedRootRelativeDir,
  formatTargetList,
} = require('../bin/lib/target-registry');

describe('target registry', () => {
  test('安装目标注册表稳定输出', () => {
    expect(listInstallTargets().map((target) => target.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(listTargetNames()).toEqual(['claude', 'codex', 'gemini']);
  });

  test('支持检测与 managed roots 一致', () => {
    expect(isSupportedTarget('claude')).toBe(true);
    expect(isSupportedTarget('dragon-lobster')).toBe(false);
    expect(getManagedRootRelativeDir('claude')).toBe('.claude');
    expect(getManagedRootRelativeDir('agents')).toBe('.agents');
  });

  test('target 列表可复用于 CLI 帮助文案', () => {
    expect(formatTargetList('|')).toBe('claude|codex|gemini');
    expect(formatTargetList('、')).toBe('claude、codex、gemini');
  });
});
