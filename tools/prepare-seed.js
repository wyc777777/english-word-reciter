// ==================== 打包前准备种子数据 ====================
// 把 data/ 里「随包分发」的内容（词库、词根资料库）复制到 app/seed/，
// 这样打包 exe 时会一起带上；用户第一次运行 exe 时释放到他自己的 data/ 目录。
// 注意：绝不复制 progress.json / saves.json / api_config.json（那是用户私有数据）。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const SEED = path.join(ROOT, 'app', 'seed');

fs.rmSync(SEED, { recursive: true, force: true });
fs.mkdirSync(path.join(SEED, 'books'), { recursive: true });

let books = 0;
try {
  fs.readdirSync(path.join(DATA, 'books'))
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      fs.copyFileSync(path.join(DATA, 'books', f), path.join(SEED, 'books', f));
      books++;
    });
} catch (e) {
  console.error('读取 data/books 失败：' + e.message);
  console.error('（先运行 node tools/build-books.js 生成词库）');
  process.exit(1);
}

const lib = path.join(DATA, 'roots_library.json');
let hasLib = false;
if (fs.existsSync(lib)) { fs.copyFileSync(lib, path.join(SEED, 'roots_library.json')); hasLib = true; }

console.log('种子数据已准备：' + books + ' 本词库' + (hasLib ? ' + 词根资料库' : '') + ' -> ' + SEED);
