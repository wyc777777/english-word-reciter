// 给词库里「没有例句」的单词批量补例句，写回 data/books/*.json
// 复用服务端 /api/ai/sentences（自带 sent:* 资料库 → 同一个词只问一次 AI，断点续跑也不重复花钱）
//
// 用法：
//   node tools/fill-sentences.js                      # 全量（两本词库的所有无例句单词）
//   LIMIT=200 node tools/fill-sentences.js            # 只处理前 200 个
//   BOOKS=kaoyan node tools/fill-sentences.js         # 只跑考研
//   CONC=15 node tools/fill-sentences.js              # 并发数（默认 10）

const fs = require('fs');
const path = require('path');
const http = require('http');

const BOOKS_DIR = path.join(__dirname, '..', 'data', 'books');
const PORT = process.env.PORT || 4578;
const CONC = parseInt(process.env.CONC || '10', 10);
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const ONLY = process.env.BOOKS ? process.env.BOOKS.split(',') : null;

function postJSON(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: 'localhost', port: PORT, path: '/api/ai/sentences',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error('bad json: ' + buf.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.write(data); req.end();
  });
}

const meaningText = item => (item.tr || []).map(t => t.c).join('；');

async function run() {
  const files = fs.readdirSync(BOOKS_DIR)
    .filter(f => f.endsWith('.json') && (!ONLY || ONLY.includes(f.replace('.json', ''))));
  if (!files.length) { console.log('没有找到词库文件'); return; }

  const bookData = {};
  const queue = [];
  for (const f of files) {
    const book = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, f), 'utf8'));
    bookData[f] = book;
    const words = book.words || book;
    words.forEach((w, i) => {
      if (!w.sen || !w.sen.length) queue.push({ f, i, w });
    });
  }
  console.log(`待补充例句：${queue.length} 个（来自 ${files.length} 本词库）`);
  if (queue.length > LIMIT) queue.length = LIMIT;
  console.log(`本次处理：${queue.length} 个，并发 ${CONC}`);

  let done = 0, ok = 0, fail = 0, cached = 0;
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const job = queue[idx++];
      const item = (bookData[job.f].words || bookData[job.f])[job.i];
      try {
        const before = item.sen && item.sen.length;
        const d = await postJSON({ word: item.w, meaning: meaningText(item) });
        if (d && d.sentences && d.sentences.length) {
          item.sen = d.sentences.map(s => ({ e: s.e, c: s.c }));
          ok++;
          if (d.cached) cached++;
        } else fail++;
      } catch (e) {
        fail++;
        if (done % 50 === 0) console.error('  ! ' + job.w + ' 失败: ' + e.message);
      }
      done++;
      if (done % 100 === 0) console.log(`进度 ${done}/${queue.length} 成功 ${ok}（其中资料库已有 ${cached}）失败 ${fail}`);
    }
  }

  const workers = [];
  for (let k = 0; k < CONC; k++) workers.push(worker());
  await Promise.all(workers);

  // 写回词库
  for (const f of files) {
    fs.writeFileSync(path.join(BOOKS_DIR, f), JSON.stringify(bookData[f]));
  }
  console.log(`完成。成功写入 ${ok}（含资料库已有 ${cached}）失败 ${fail}。已写回 ${files.length} 本词库文件。`);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
