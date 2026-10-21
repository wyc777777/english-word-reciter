// ============================================================
// 词库构建脚本：把有道/新东方原始 JSONL 词库压缩成前端可直接用的精简 JSON
// 用法：node tools/build-books.js
// 数据源：kajweb/dict（公开词库仓库，来源为有道单词书）
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'books');

const SOURCES = [
  { file: '_tmp/kaoyan/KaoYan_2.json', id: 'kaoyan', name: '考研英语词汇', tag: '考研', desc: '有道考研词汇（正序版）' },
  { file: '_tmp/ielts/IELTS_2.json', id: 'ielts', name: '雅思词汇', tag: '雅思', desc: '有道雅思词汇（正序版）' },
  { file: '_tmp/gaozhong/GaoZhong_2.json', id: 'gaozhong', name: '高中英语词汇', tag: '高中', desc: '有道高中词汇（正序版）' }
];

const WS = /\s+/g;
const NL = /\r?\n/;

function clean(s) {
  return String(s || '').replace(WS, ' ').trim();
}

function pickTrans(content) {
  const t = (content.trans || []).map(x => ({ p: clean(x.pos), c: clean(x.tranCn) }))
    .filter(x => x.c && x.c !== 'null');
  const seen = new Set();
  return t.filter(x => {
    const k = x.p + '|' + x.c;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

function pickSentences(content) {
  const arr = (content.sentence && content.sentence.sentences) || [];
  return arr.map(s => ({ e: clean(s.sContent), c: clean(s.sCn) }))
    .filter(s => s.e && s.c).slice(0, 2);
}

function pickRel(content) {
  const rels = (content.relWord && content.relWord.rels) || [];
  const out = [];
  rels.forEach(r => (r.words || []).forEach(w => {
    if (out.length >= 6) return;
    if (w.hwd && clean(w.tran)) out.push({ w: clean(w.hwd), c: clean(w.tran) });
  }));
  return out;
}

function pickSyno(content) {
  const synos = (content.syno && content.synos) || [];
  const out = [];
  synos.forEach(s => (s.hwds || []).forEach(h => {
    if (out.length >= 6) return;
    if (h.w && !out.includes(String(h.w).trim())) out.push(String(h.w).trim());
  }));
  return out;
}

function pickPhrase(content) {
  const arr = (content.phrase && content.phrases) || [];
  return arr.map(p => ({ e: clean(p.pContent), c: clean(p.pCn) }))
    .filter(p => p.e && p.c).slice(0, 6);
}

function build(src) {
  const raw = fs.readFileSync(path.join(ROOT, src.file), 'utf-8');
  const lines = raw.split(NL).filter(Boolean);
  const words = [];
  const seen = new Set();

  lines.forEach(line => {
    let row;
    try { row = JSON.parse(line); } catch (e) { return; }
    const head = clean(row.headWord || (row.content && row.content.word && row.content.word.wordHead));
    if (!head) return;
    if (!/^[a-zA-Z][a-zA-Z-]{1,24}$/.test(head)) return;
    const key = head.toLowerCase();
    if (seen.has(key)) return;

    const c = (row.content && row.content.word && row.content.word.content) || {};
    const item = {
      w: key,
      ph: clean(c.usphone || c.ukphone || c.phone),
      tr: pickTrans(c),
      sen: pickSentences(c),
      rel: pickRel(c),
      sy: pickSyno(c),
      phr: pickPhrase(c)
    };
    if (!item.tr.length) return;
    seen.add(key);
    words.push(item);
  });

  return { id: src.id, name: src.name, tag: src.tag, desc: src.desc, count: words.length, words };
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  // 可以只构建指定的词书：BOOK=gaozhong node tools/build-books.js（多个用逗号隔开）
  const only = (process.env.BOOK || '').split(',').map(s => s.trim()).filter(Boolean);
  SOURCES.filter(s => !only.length || only.includes(s.id)).forEach(src => {
    const p = path.join(ROOT, src.file);
    if (!fs.existsSync(p)) {
      console.log('跳过（源数据不存在）:', src.file);
      return;
    }
    const book = build(src);
    const out = path.join(OUT_DIR, src.id + '.json');
    fs.writeFileSync(out, JSON.stringify(book), 'utf-8');
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log('OK ' + src.name + ': ' + book.count + ' 词 -> data/books/' + src.id + '.json (' + kb + ' KB)');
  });
}

main();
