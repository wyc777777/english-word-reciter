// ==================== 生成 exe 图标（.ico）====================
// 用法：node tools/make-icon.js [源图路径]
//   不给参数时，自动取 assets/icon/ 里最新的一张方形 PNG 作为源图
// 依赖：Windows 自带的 System.Drawing（通过 tools/make-icon.ps1 缩放）

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'assets', 'icon');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(ICON_DIR)) fs.mkdirSync(ICON_DIR, { recursive: true });

// 找源图
let src = process.argv[2];
if (!src) {
  const cands = fs.readdirSync(ICON_DIR)
    .filter(f => f.toLowerCase().endsWith('.png') && !/^icon-\d+\.png$/i.test(f))
    .map(f => path.join(ICON_DIR, f))
    .sort();
  if (!cands.length) {
    console.error('没找到源图。请把一张方形 PNG 放进 ' + ICON_DIR + '，或用参数指定路径。');
    process.exit(1);
  }
  src = cands[cands.length - 1];
}
if (!fs.existsSync(src)) { console.error('源图不存在：' + src); process.exit(1); }
console.log('源图：' + src);

// 1) 用 PowerShell 缩放成多尺寸 PNG（圆角 + 透明）
const sizesDir = path.join(ICON_DIR, 'sizes');
execFileSync('powershell', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', path.join(__dirname, 'make-icon.ps1'),
  '-Source', src, '-OutDir', sizesDir
], { stdio: 'inherit' });

// 2) 拼成 .ico（ICO 头 + 目录表 + 各尺寸 PNG 数据）
const pngs = SIZES.map(s => ({ size: s, buf: fs.readFileSync(path.join(sizesDir, 'icon-' + s + '.png')) }));
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);        // reserved
header.writeUInt16LE(1, 2);        // type: 1 = icon
header.writeUInt16LE(count, 4);    // 图像数量

const dir = Buffer.alloc(16 * count);
let offset = 6 + 16 * count;
pngs.forEach((p, i) => {
  const b = i * 16;
  const wh = p.size >= 256 ? 0 : p.size;      // 256 用 0 表示
  dir.writeUInt8(wh, b + 0);
  dir.writeUInt8(wh, b + 1);
  dir.writeUInt8(0, b + 2);                    // 调色板数
  dir.writeUInt8(0, b + 3);                    // 保留
  dir.writeUInt16LE(1, b + 4);                 // 色彩平面
  dir.writeUInt16LE(32, b + 6);                // 位深
  dir.writeUInt32LE(p.buf.length, b + 8);      // 数据大小
  dir.writeUInt32LE(offset, b + 12);           // 数据偏移
  offset += p.buf.length;
});

const out = path.join(ICON_DIR, 'word-reciter.ico');
fs.writeFileSync(out, Buffer.concat([header, dir, ...pngs.map(p => p.buf)]));
console.log('ICO 已生成：' + out + '（' + count + ' 个尺寸，' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB）');
