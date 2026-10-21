// ==================== 生成「更新包」（只含 app.asar，几 MB）====================
// 别人已经装了你的应用，你改完功能后，只要把这个小包发给他，
// 他覆盖掉 resources\app.asar 就完成更新 —— 不用重下几百 MB，学习数据也不会动。
// 用法：npm run update-pack（前提是先 npm run build 打过包）

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ASAR = path.join(ROOT, 'dist-app', '英语猜词背诵器-win32-x64', 'resources', 'app.asar');
const OUT_DIR = path.join(ROOT, 'dist-update');

if (!fs.existsSync(ASAR)) {
  console.error('找不到：' + ASAR);
  console.error('先运行 npm run build 打包应用，再来生成更新包。');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// 用本地日期（toISOString 是 UTC，凌晨打出来的日期会差一天）
const _now = new Date();
const _pad = n => (n < 10 ? '0' : '') + n;
const stamp = _now.getFullYear() + '-' + _pad(_now.getMonth() + 1) + '-' + _pad(_now.getDate());
const name = '更新包-' + stamp;
const stage = path.join(OUT_DIR, name);
fs.mkdirSync(stage, { recursive: true });
fs.copyFileSync(ASAR, path.join(stage, 'app.asar'));

const readme = [
  '英语猜词背诵器 · 更新包',
  '生成日期：' + stamp,
  '',
  '【对方怎么用】三步：',
  '1. 完全退出应用（任务栏里也要确认退干净，否则文件替换不了）',
  '2. 打开你的应用文件夹，进入 resources 目录：',
  '     你的应用目录\\resources\\',
  '   例如：D:\\英语猜词背诵器-分享版\\dist-app\\英语猜词背诵器-win32-x64\\resources\\',
  '3. 用本包里的 app.asar 覆盖掉里面那个 app.asar',
  '',
  '然后重新双击启动，就是新版本了。',
  '',
  '【不会丢的东西】',
  '学习进度、生词本、AI 配置、词根资料都在 data 目录里（和 resources 是两处），',
  '这次替换只动代码（app.asar），data 一点没碰。',
  '',
  '【怎么确认更新成功】',
  '重新打开应用，随便练一题，看有没有新加的功能即可。'
].join('\r\n');
fs.writeFileSync(path.join(stage, '更新说明.txt'), readme, 'utf-8');

const zip = path.join(OUT_DIR, name + '.zip');
execFileSync('powershell', [
  '-NoProfile', '-Command',
  'Compress-Archive -Path "' + path.join(stage, '*') + '" -DestinationPath "' + zip + '" -Force'
], { stdio: 'inherit' });

const size = fs.statSync(zip).size;
console.log('');
console.log('更新包已生成：' + zip);
console.log('  大小：' + (size / 1024).toFixed(0) + ' KB（对方只需下这一个，不用重下整个应用）');
console.log('  内容：app.asar + 更新说明.txt');
console.log('');
console.log('发给对方，让他把 app.asar 覆盖到「应用目录\\resources\\」即可，data 不受影响。');
