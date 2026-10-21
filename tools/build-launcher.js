// ==================== 编译主目录启动器 ====================
// 用 Windows 自带的 csc.exe（.NET Framework 4）把 tools/launcher.cs 编译成一个很小的 exe，
// 放在项目根目录，双击即可启动 dist-app 里的桌面应用。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CSC = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
].find(p => fs.existsSync(p));

if (!CSC) {
  console.error('找不到 csc.exe —— 需要 .NET Framework 4（Windows 一般自带）');
  process.exit(1);
}

const OUT = path.join(ROOT, '英语猜词背诵器.exe');
const ICO = path.join(ROOT, 'assets', 'icon', 'word-reciter-pkg.ico');

const args = [
  '/nologo',
  '/target:winexe',                 // 不弹控制台黑窗
  '/codepage:65001',                // 源码是 UTF-8（含中文）
  '/out:' + OUT,
  '/reference:System.Windows.Forms.dll'
];
if (fs.existsSync(ICO)) args.push('/win32icon:' + ICO);
args.push(path.join(ROOT, 'tools', 'launcher.cs'));

try {
  execFileSync(CSC, args, { stdio: 'inherit' });
  console.log('启动器已生成：' + OUT + '（' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB）');
} catch (e) {
  console.error('编译失败（如果 exe 正在运行，先关掉它再试）');
  process.exit(1);
}
