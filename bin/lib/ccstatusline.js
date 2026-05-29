'use strict';
const fs = require('fs');
const path = require('path');

function detectCcstatusline(warn) {
  try {
    require('child_process').execSync('npx -y ccstatusline@latest --version', {
      stdio: 'pipe', timeout: 30000
    });
    return true;
  } catch (e) {
    if (warn) warn(`ccstatusline 检测异常: ${e.message}`);
    return false;
  }
}

function deployCcstatuslineConfig(errors, { HOME, PKG_ROOT, ok }) {
  const bundledConfig = path.join(PKG_ROOT, 'config', 'ccstatusline', 'settings.json');
  const configDir = path.join(HOME, '.config', 'ccstatusline');
  const targetConfig = path.join(configDir, 'settings.json');

  if (!fs.existsSync(bundledConfig)) {
    errors.push('config/ccstatusline/settings.json 不存在');
    return;
  }

  fs.mkdirSync(configDir, { recursive: true });

  if (fs.existsSync(targetConfig)) {
    const backupDir = path.join(HOME, '.claude', '.sage-backup');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(targetConfig, path.join(backupDir, 'ccstatusline-settings.json'));
  }

  fs.copyFileSync(bundledConfig, targetConfig);
  ok('ccstatusline/settings.json 已部署 (Personal Skill System 多行美化预设)');
}

async function installCcstatusline(ctx, deps) {
  const { HOME, PKG_ROOT, CCSTATUSLINE_CONFIG, ok, warn, info, fail, c } = deps;
  console.log('');
  info('安装 ccstatusline 状态栏...');
  const errors = [];

  deployCcstatuslineConfig(errors, { HOME, PKG_ROOT, ok });

  ctx.settings.statusLine = CCSTATUSLINE_CONFIG.statusLine;
  ok(`statusLine → ${c.cyn(CCSTATUSLINE_CONFIG.statusLine.command)}`);
  fs.writeFileSync(ctx.settingsPath, JSON.stringify(ctx.settings, null, 2) + '\n');

  if (errors.length > 0) {
    console.log('');
    warn(c.b(`ccstatusline 安装有 ${errors.length} 个问题:`));
    errors.forEach(e => fail(`  ${e}`));
  }

  console.log('');
  warn(`需要 ${c.b('Nerd Font')} 字体才能正确显示 Powerline 图标`);
  info(`推荐: FiraCode Nerd Font / JetBrainsMono Nerd Font`);
  info(`下载: ${c.cyn('https://www.nerdfonts.com/')}`);
  ok('ccstatusline 配置完成');
}

module.exports = { detectCcstatusline, deployCcstatuslineConfig, installCcstatusline };
