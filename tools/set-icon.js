// ==================== 给打包好的 exe 写入图标 ====================
// pkg 自带的 --icon 对某些 node 版本会静默失效，所以打包完再用 rcedit 改一次资源。
// 用法：node tools/set-icon.js  （由 npm run pack 自动调用）

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'dist', 'word-reciter.exe');
const ICO = path.join(ROOT, 'assets', 'icon', 'word-reciter.ico');

if (!fs.existsSync(EXE)) { console.error('找不到 exe：' + EXE); process.exit(1); }
if (!fs.existsSync(ICO)) { console.log('没有图标文件，跳过。可先运行：node tools/make-icon.js'); process.exit(0); }

// rcedit 5.x 是 ESM 包，直接用它的命令行程序更省事
const candidates = [
  path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
  path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit.exe')
];
const bin = candidates.find(p => fs.existsSync(p));
if (!bin) { console.log('未找到 rcedit，跳过图标写入（执行 npm install 后即可自动写入）'); process.exit(0); }

try {
  execFileSync(bin, [EXE, '--set-icon', ICO], { stdio: 'inherit' });
  console.log('图标已写入：' + EXE);
} catch (e) {
  console.error('写入图标失败（exe 仍可正常使用）：' + e.message);
}
