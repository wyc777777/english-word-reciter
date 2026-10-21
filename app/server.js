// ==================== 英语猜词背诵器 · 本地服务器 ====================
// 用法：node server.js   （或双击 start.bat）
// 功能：1. 托管前端静态文件  2. AI Key 本地配置（密钥不进浏览器——只在后端注入）
//       3. /api/ai/* 代理调用大模型并把返回解析成结构化结果
//
// 设计说明：与「召唤术」一致的本地代理架构 —— API Key 只存在你电脑上的
// assets/api_config.json，前端只跟 localhost 打交道，密钥永不暴露给浏览器。
// 同时内置离线兜底：没配 Key 时也能用本地算法玩（相似度由字符重合度估算）。

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = (process.env.PORT !== undefined && process.env.PORT !== '') ? Number(process.env.PORT) : 4578;
const IS_PACKED = !!process.pkg;                      // 用 pkg 打包成 exe 之后为 true
const IS_ELECTRON = !!process.versions.electron;      // 跑在 Electron 里（独立窗口版）
const APP_DIR = __dirname;                            // app/（打包后是只读的内部快照）
const ROOT = path.join(APP_DIR, 'web');               // 前端静态文件目录
// 数据目录优先级：显式指定 > exe 同级 data/ > 项目 data/
// （Electron 版由主进程指定到用户数据目录，见 app/electron-main.js）
const ASSETS_DIR = process.env.RECITER_DATA_DIR
  ? path.resolve(process.env.RECITER_DATA_DIR)
  : (IS_PACKED ? path.join(path.dirname(process.execPath), 'data') : path.join(APP_DIR, '..', 'data'));
const SEED_DIR = path.join(APP_DIR, 'seed');          // 打包进 exe 的初始数据（词库/资料库，打包前由 tools/prepare-seed.js 生成）
const BOOKS_DIR = path.join(ASSETS_DIR, 'books');
const API_CONFIG_FILE = path.join(ASSETS_DIR, 'api_config.json');
const PROGRESS_FILE = path.join(ASSETS_DIR, 'progress.json');
const SAVES_FILE = path.join(ASSETS_DIR, 'saves.json');
const ROOTS_LIBRARY_FILE = path.join(ASSETS_DIR, 'roots_library.json');

// 打包 / 内嵌运行时：把随包带的词库补齐到 data/books
// 注意是「逐本补齐」而不是「只有当目录不存在时才释放」——
// 这样以后版本里新增了单词书（或修了某本书的内容），老用户更新后也能自动拿到。
if (IS_PACKED || IS_ELECTRON) {
  try {
    const seedBooks = path.join(SEED_DIR, 'books');
    let names = [];
    try { names = fs.readdirSync(seedBooks).filter(f => f.endsWith('.json')); } catch (e) { /* 没带种子也无所谓 */ }
    if (names.length) {
      fs.mkdirSync(BOOKS_DIR, { recursive: true });
      const added = [], updated = [];
      names.forEach(f => {
        const src = path.join(seedBooks, f);
        const dst = path.join(BOOKS_DIR, f);
        const id = f.replace(/\.json$/, '');
        try {
          if (!fs.existsSync(dst)) {
            fs.copyFileSync(src, dst);
            added.push(id);
          } else if (fs.statSync(dst).size !== fs.statSync(src).size) {
            // 内容变了就更新（词库是静态知识，不含用户数据，覆盖是安全的）
            fs.copyFileSync(src, dst);
            updated.push(id);
          }
        } catch (e) { /* 单个词库失败不影响启动 */ }
      });
      const seedLib = path.join(SEED_DIR, 'roots_library.json');
      if (fs.existsSync(seedLib) && !fs.existsSync(ROOTS_LIBRARY_FILE)) fs.copyFileSync(seedLib, ROOTS_LIBRARY_FILE);
      if (added.length) console.log('  已补充内置词库：' + added.join(', '));
      if (updated.length) console.log('  已更新内置词库：' + updated.join(', '));
    }
  } catch (e) { console.error('  初始化数据目录失败：' + e.message); }
}
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ==================== 通用小工具 ====================
function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) { /* 文件损坏就当没有 */ }
  return fallback;
}
function writeJson(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (e) {}
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ==================== API 配置（多 profile，密钥打码）====================
const DEFAULT_API_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

function loadApiConfig() {
  try {
    if (fs.existsSync(API_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(API_CONFIG_FILE, 'utf-8'));
      if (raw.profiles) return raw;
      // 迁移旧格式 -> 多 profile 格式
      if (raw.apiKey !== undefined || raw.apiBaseUrl !== undefined || raw.modelName !== undefined) {
        const migrated = {
          profiles: {
            '默认配置': {
              apiBaseUrl: raw.apiBaseUrl || DEFAULT_API_BASE,
              apiKey: raw.apiKey || '',
              modelName: raw.modelName || DEFAULT_MODEL
            }
          },
          activeProfile: '默认配置'
        };
        fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(migrated, null, 2), 'utf-8');
        return migrated;
      }
    }
  } catch (e) {}
  return { profiles: {}, activeProfile: '' };
}
function getActiveProfileName() {
  const cfg = loadApiConfig();
  const names = Object.keys(cfg.profiles || {});
  if (cfg.activeProfile && cfg.profiles[cfg.activeProfile]) return cfg.activeProfile;
  return names.length > 0 ? names[0] : '';
}
function getActiveProfile() {
  const cfg = loadApiConfig();
  const name = getActiveProfileName();
  return name ? cfg.profiles[name] : null;
}
function getApiKey() { return (getActiveProfile() || {}).apiKey || ''; }
function getApiBase() { return (getActiveProfile() || {}).apiBaseUrl || DEFAULT_API_BASE; }
function getModel() { return (getActiveProfile() || {}).modelName || DEFAULT_MODEL; }

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return k.slice(0, 2) + '****' + k.slice(-2);
  return k.slice(0, 6) + '****' + k.slice(-4);
}

// ==================== 统一 AI 调用 ====================
async function callAI(systemContent, userContent, opts) {
  opts = opts || {};
  const apiKey = getApiKey();
  const apiBase = getApiBase().replace(/\/+$/, '');
  const model = getModel() || DEFAULT_MODEL;
  if (!apiKey) {
    const e = new Error('请先在「设置」中配置 API Key');
    e.status = 500;
    e.noKey = true;
    throw e;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs || 60000);
  try {
    // DeepSeek 新版默认开启思考模式，思考会消耗 token 并拉长响应、可能让结构化输出为空，显式关闭
    const isDeepSeek = /deepseek/i.test(apiBase + model);
    const reqBody = {
      model: model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ],
      temperature: opts.temperature !== undefined ? opts.temperature : 0.7,
      max_tokens: opts.maxTokens || 2048
    };
    if (isDeepSeek) reqBody.thinking = { type: 'disabled' };
    if (opts.json) reqBody.response_format = { type: 'json_object' };

    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(reqBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      const e = new Error('AI API 调用失败: ' + errText.slice(0, 500));
      e.status = response.status;
      throw e;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// 从 AI 返回里抠出 JSON（容错：可能有 ```json 包裹或前后废话）
function parseJsonSafe(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (e) {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (e) {}
  }
  return null;
}

// ==================== 词根资料库（AI 拆解过的词根 / 片段 / 例句，存着复用）====================
// 用「内存单例 + 引用共享」：并发请求各自 set 自己的 key 都落在同一个对象上，
// 避免「各自读文件 → 各自写回」互相覆盖（那会让已经花过 token 的结果白白丢掉）
let ROOTS_LIB = null;
let ROOTS_LIB_MTIME = 0;
function loadRootsLibrary() {
  try {
    const st = fs.statSync(ROOTS_LIBRARY_FILE);
    if (!ROOTS_LIB || st.mtimeMs !== ROOTS_LIB_MTIME) {   // 文件被外部改过就重新载入
      ROOTS_LIB = readJson(ROOTS_LIBRARY_FILE, {});
      ROOTS_LIB_MTIME = st.mtimeMs;
    }
  } catch (e) {
    if (!ROOTS_LIB) ROOTS_LIB = {};
  }
  return ROOTS_LIB;
}
function saveRootsLibrary(c) {
  ROOTS_LIB = c;
  writeJson(ROOTS_LIBRARY_FILE, c);
  try { ROOTS_LIB_MTIME = fs.statSync(ROOTS_LIBRARY_FILE).mtimeMs; } catch (e) { /* ignore */ }
}

// ==================== 路由 ====================
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ method, regex, keys, handler });
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooBig = false;
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) { tooBig = true; req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('请求体过大'));
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

// ---------- API 配置接口 ----------
route('GET', '/api/api-config', (req, res) => {
  const cfg = loadApiConfig();
  const activeName = getActiveProfileName();
  const active = activeName ? cfg.profiles[activeName] : null;
  sendJson(res, 200, {
    profiles: Object.keys(cfg.profiles || {}).map(name => {
      const p = cfg.profiles[name];
      return { name, apiBaseUrl: p.apiBaseUrl || '', modelName: p.modelName || '', hasKey: !!p.apiKey, maskedKey: maskKey(p.apiKey) };
    }),
    activeProfile: activeName,
    apiBaseUrl: (active && active.apiBaseUrl) || DEFAULT_API_BASE,
    modelName: (active && active.modelName) || DEFAULT_MODEL,
    maskedKey: maskKey(active && active.apiKey),
    configured: active ? !!active.apiKey : false,
    source: 'local'
  });
});

route('PUT', '/api/api-config', async (req, res) => {
  try {
    const body = await readBody(req);
    const cfg = loadApiConfig();
    const name = getActiveProfileName();
    if (!name) return sendJson(res, 400, { error: '没有激活的 API 配置，请先创建一个' });
    if (!cfg.profiles) cfg.profiles = {};
    if (!cfg.profiles[name]) cfg.profiles[name] = {};
    if (body.apiBaseUrl !== undefined) cfg.profiles[name].apiBaseUrl = String(body.apiBaseUrl).trim();
    if (body.modelName !== undefined) cfg.profiles[name].modelName = String(body.modelName).trim();
    if (body.apiKey !== undefined && body.apiKey !== '' && !/\*+/.test(String(body.apiKey))) {
      cfg.profiles[name].apiKey = String(body.apiKey).trim();
    }
    fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    sendJson(res, 200, { ok: true, maskedKey: maskKey(cfg.profiles[name].apiKey) });
  } catch (e) { sendJson(res, 500, { error: '保存失败: ' + e.message }); }
});

route('POST', '/api/api-config/profile', async (req, res) => {
  try {
    const body = await readBody(req);
    const cfg = loadApiConfig();
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: '请输入配置名称' });
    if (cfg.profiles[name]) return sendJson(res, 400, { error: '该名称已存在' });
    if (!cfg.profiles) cfg.profiles = {};
    cfg.profiles[name] = {
      apiBaseUrl: String(body.apiBaseUrl || DEFAULT_API_BASE).trim(),
      apiKey: String(body.apiKey || '').trim(),
      modelName: String(body.modelName || DEFAULT_MODEL).trim()
    };
    cfg.activeProfile = name;
    fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    sendJson(res, 200, { ok: true, activeProfile: name });
  } catch (e) { sendJson(res, 500, { error: '创建失败: ' + e.message }); }
});

route('DELETE', '/api/api-config/profile/:name', (req, res, params) => {
  try {
    const cfg = loadApiConfig();
    const name = decodeURIComponent(params.name);
    if (!cfg.profiles || !cfg.profiles[name]) return sendJson(res, 404, { error: '配置不存在' });
    delete cfg.profiles[name];
    if (cfg.activeProfile === name) cfg.activeProfile = Object.keys(cfg.profiles)[0] || '';
    fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    sendJson(res, 200, { ok: true, activeProfile: cfg.activeProfile });
  } catch (e) { sendJson(res, 500, { error: '删除失败: ' + e.message }); }
});

route('PUT', '/api/api-config/active', async (req, res) => {
  try {
    const body = await readBody(req);
    const cfg = loadApiConfig();
    const name = String(body.name || '').trim();
    if (!cfg.profiles || !cfg.profiles[name]) return sendJson(res, 404, { error: '配置不存在' });
    cfg.activeProfile = name;
    fs.writeFileSync(API_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    sendJson(res, 200, { ok: true, activeProfile: name });
  } catch (e) { sendJson(res, 500, { error: '切换失败: ' + e.message }); }
});

// 测试连通性：发一个极短请求
route('POST', '/api/api-config/test', async (req, res) => {
  try {
    const t0 = Date.now();
    const text = await callAI('你是一个连通性测试助手。只回复一个字：好', '请回复：好', { maxTokens: 16, temperature: 0 });
    sendJson(res, 200, { ok: true, reply: (text || '').trim().slice(0, 40), ms: Date.now() - t0 });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
});

// ---------- 词库接口 ----------
route('GET', '/api/books', (req, res) => {
  if (!fs.existsSync(BOOKS_DIR)) return sendJson(res, 200, { books: [] });
  const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.json'));
  const books = files.map(f => {
    const raw = readJson(path.join(BOOKS_DIR, f), null);
    if (!raw) return null;
    return { id: raw.id, name: raw.name, tag: raw.tag, desc: raw.desc, count: raw.count || (raw.words || []).length };
  }).filter(Boolean);
  sendJson(res, 200, { books });
});

route('GET', '/api/books/:id', (req, res, params) => {
  const file = path.join(BOOKS_DIR, String(params.id).replace(/[^\w-]/g, '') + '.json');
  const raw = readJson(file, null);
  if (!raw) return sendJson(res, 404, { error: '词库不存在：' + params.id });
  sendJson(res, 200, raw);
});

// ---------- 学习进度 ----------
route('GET', '/api/progress', (req, res) => {
  sendJson(res, 200, readJson(PROGRESS_FILE, { books: {}, daily: {}, settings: {}, roots: {} }));
});

route('POST', '/api/progress', async (req, res) => {
  try {
    const body = await readBody(req);
    writeJson(PROGRESS_FILE, body);
    sendJson(res, 200, { ok: true });
  } catch (e) { sendJson(res, 500, { error: '保存失败: ' + e.message }); }
});

// ---------- 词根资料库 ----------
route('GET', '/api/roots-library', (req, res) => sendJson(res, 200, loadRootsLibrary()));

// ---------- 词根资料库：导入「跟随单词的知识数据」（片段 / 讲解 / 例句 / 拆解）----------
// 这些都是「以单词/词根为 key」的公共知识，导入只是合并，绝不碰别人的学习进度、生词本、配置
route('POST', '/api/roots-library/import', async (req, res) => {
  try {
    const b = await readBody(req);
    const src = b.items || b.cache || b;
    if (!src || typeof src !== 'object') return sendJson(res, 400, { error: '没有可导入的内容' });
    const lib = loadRootsLibrary();
    const KINDS = ['piece:', 'explain:', 'sent:', 'roots:', 'hint:'];
    const isValid = (key, v) => {
      if (!v || typeof v !== 'object') return false;
      if (key.indexOf('piece:') === 0) return !!v.meaning;
      if (key.indexOf('explain:') === 0) return !!(v.memory || v.usage || v.confusable);
      if (key.indexOf('sent:') === 0) return Array.isArray(v.sentences) && v.sentences.length > 0;
      if (key.indexOf('roots:') === 0) return Array.isArray(v.parts) && v.parts.length > 0;
      if (key.indexOf('hint:') === 0) return Array.isArray(v.hints) && v.hints.some(Boolean);
      return false;
    };
    let added = 0, kept = 0, skipped = 0;
    Object.keys(src).forEach(k => {
      const v = src[k];
      let key = k;
      if (!KINDS.some(p => key.indexOf(p) === 0)) {
        // 兼容旧格式：裸片段名当作 piece:
        if (v && typeof v === 'object' && v.meaning) key = 'piece:' + String(k).toLowerCase();
        else { skipped++; return; }
      }
      if (!isValid(key, v)) { skipped++; return; }
      if (lib[key]) { kept++; return; }    // 本地已有 → 保留原样，不覆盖
      lib[key] = v;
      added++;
    });
    saveRootsLibrary(lib);
    sendJson(res, 200, { ok: true, added, kept, skipped, total: Object.keys(lib).length });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
});

// ---------- 存档系统（3 个槽位）----------
const SAVE_SLOTS = 3;

// 给存档算个摘要，方便在槽位上显示
function summarizeProgress(progress) {
  let seen = 0, mastered = 0, grad = 0;
  const books = (progress && progress.books) || {};
  Object.keys(books).forEach(bid => {
    ['meaning', 'spell'].forEach(m => {
      const words = ((books[bid] || {})[m] || {}).words || {};
      Object.keys(words).forEach(k => {
        const s = words[k];
        if (!s) return;
        if (s.grad) { grad++; seen++; return; }
        if (s.seen) seen++;
        if (s.s >= 4) mastered++;      // 4 = 前端 MASTER_STAGE
      });
    });
  });
  return {
    seen,
    mastered,
    graduated: grad,
    stars: Object.keys((progress && progress.stars) || {}).length
  };
}

function loadSaves() {
  const raw = readJson(SAVES_FILE, null);
  if (!raw || typeof raw !== 'object') return { slots: {} };
  if (!raw.slots) raw.slots = {};
  return raw;
}

route('GET', '/api/saves', (req, res) => {
  const s = loadSaves();
  const slots = [];
  for (let i = 1; i <= SAVE_SLOTS; i++) {
    const it = s.slots[String(i)];
    slots.push(it ? { slot: i, name: it.name || ('存档 ' + i), time: it.time, summary: it.summary || summarizeProgress(it.progress) } : { slot: i, empty: true });
  }
  sendJson(res, 200, { slots });
});

route('POST', '/api/saves/:slot', async (req, res, params) => {
  try {
    const idx = String(params.slot);
    if (!/^[1-9]$/.test(idx) || Number(idx) > SAVE_SLOTS) return sendJson(res, 400, { error: '槽位不存在' });
    const body = await readBody(req);
    if (!body || !body.progress || !body.progress.books) return sendJson(res, 400, { error: '存档数据不完整' });
    const s = loadSaves();
    s.slots[idx] = {
      name: String(body.name || ('存档 ' + idx)).slice(0, 30),
      time: Date.now(),
      summary: summarizeProgress(body.progress),
      progress: body.progress
    };
    writeJson(SAVES_FILE, s);
    sendJson(res, 200, { ok: true, slot: Number(idx), time: s.slots[idx].time, summary: s.slots[idx].summary });
  } catch (e) { sendJson(res, 500, { error: '存档失败: ' + e.message }); }
});

route('GET', '/api/saves/:slot', (req, res, params) => {
  const s = loadSaves();
  const it = s.slots[String(params.slot)];
  if (!it) return sendJson(res, 404, { error: '这个槽位是空的' });
  sendJson(res, 200, { name: it.name, time: it.time, summary: it.summary, progress: it.progress });
});

route('DELETE', '/api/saves/:slot', (req, res, params) => {
  const s = loadSaves();
  const key = String(params.slot);
  if (!s.slots[key]) return sendJson(res, 404, { error: '这个槽位本来就是空的' });
  delete s.slots[key];
  writeJson(SAVES_FILE, s);
  sendJson(res, 200, { ok: true });
});

// ---------- AI：词根拆解 ----------
route('POST', '/api/ai/roots', async (req, res) => {
  try {
    const b = await readBody(req);
    const word = String(b.word || '').trim().toLowerCase();
    if (!word) return sendJson(res, 400, { error: '缺少单词' });
    const cache = loadRootsLibrary();
    const cacheKey = 'roots:' + word;
    // force = 用户觉得原来的拆解不对，主动要求重拆：跳过缓存直接问 AI，新结果覆盖旧的
    if (!b.force) {
      if (cache[cacheKey]) return sendJson(res, 200, Object.assign({ cached: true }, cache[cacheKey]));
      if (cache[word] && cache[word].parts) return sendJson(res, 200, Object.assign({ cached: true }, cache[word]));   // 兼容旧缓存
    }

    const system = [
      '你是英语词源学专家，擅长用词根词缀拆解英语单词，帮助中国学习者记忆。',
      '只输出一个 JSON 对象，不要输出解释、不要代码块、不要多余文字。字段如下：',
      '{"parts":[{"text":"片段字母","type":"prefix|root|suffix|link","meaning":"该片段含义（中文）"}],',
      '"core":"核心词根及其含义，一句话",',
      '"story":"由词根推导词义的助记线索，一句话，中文，不超过 60 字",',
      '"cognates":["同根词1","同根词2","同根词3"]}',
      '要求：parts 按单词拼写顺序拼接后必须等于原单词；没有词根可拆时 parts 只给一项（type 用 root，meaning 说明该词为独立词/来源）；释义用中文。'
    ].join('\n');
    const user = `单词：${word}\n中文释义：${b.meaning || '（未提供）'}`;

    const text = await callAI(system, user, { json: true, temperature: 0.4 });
    const parsed = parseJsonSafe(text);
    if (!parsed || !Array.isArray(parsed.parts)) return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    const result = {
      parts: parsed.parts.slice(0, 8),
      core: parsed.core || '',
      story: parsed.story || '',
      cognates: Array.isArray(parsed.cognates) ? parsed.cognates.slice(0, 6) : []
    };
    cache[cacheKey] = result;
    saveRootsLibrary(cache);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- AI：猜词义判定 ----------
route('POST', '/api/ai/judge-meaning', async (req, res) => {
  try {
    const b = await readBody(req);
    const word = String(b.word || '').trim();
    const guess = String(b.guess || '').trim();
    if (!word || !guess) return sendJson(res, 400, { error: '缺少单词或答案' });

    const system = [
      '你是一位严谨的英语词汇教师，正在给中文母语的学习者评判「猜词义」练习。',
      '学习者看到英文单词和词根提示，需要猜出它的中文释义。你要判断学习者答案与正确释义的语义接近程度。',
      '只输出一个 JSON 对象，不要解释、不要代码块、不要多余文字。字段：',
      '{"score":<0-100 整数，语义接近度>,"correct":<true/false>,"comment":"<一句话中文点评>",',
      '"near":"<学习者答案表达的意思，简短中文>"}',
      '注意：不要输出 hint 或任何形式的提示，学习者会自己决定要不要点「要提示」按钮。',
      '',
      '======== 头号红线：不许剧透 ========',
      '这是猜词游戏。当 correct 为 false 时，comment 与 hint 里绝对不能透露正确释义，包括：',
      '① 不得写出、复述、翻译、或用同义/近义词改写正确释义的任何内容；',
      '② 不得出现「其实是…」「意思是…」「核心（动作/含义）是…」「指的是…」「应该是…」这类句式；',
      '③ 不得出现正确释义的关键词，也不要把它的近义表达塞进点评；',
      '④ 说差距时只能抽象到「偏向了哪个层面」（如：偏向了方式/工具/情绪/人群，或方向完全无关），绝不能说正确方向是什么；',
      '④补充：以下句式一律禁止 —— 「它/目标词/该词/这个词 + 更强调/侧重/偏向/指的是/其实是/表示 + 任何内容」，因为这等于在描述答案。只能说他偏到了哪里，不能说目标在哪。',
      '⑤ 不要给出提示内容，提示由另一套流程在学习者主动请求时才生成。',
      '反例（严禁）："抓住了「绕开、避开」的方向，但没体现「从旁边绕过去」的核心动作" —— 引号里已经在报答案了。',
      '反例（严禁）："你的思路对了一半，它其实指从侧面而不是正面经过"。',
      '正例（合格）："你答的方向偏「方式、途径」这一层，而目标更强调一个具体动作，再想想。"',
      '正例（合格）："方向不太对，和移动有关，但不是速度层面的词。"',
      '例外：correct 为 true 时，comment 可以正常点评（已经答对，不算剧透，但仍然不要粗暴地把释义抄一遍）。',
      '',
      '======== 评分标准 ========',
      '100 = 与正确释义等价（同义表述、更简洁的说法、只差词性）；',
      '85-99 = 抓住核心义项但表述不完整、偏窄或偏宽；',
      '60-84 = 同一语义场但只沾边（上位词、相关动作、相关场景）；',
      '30-59 = 弱相关（同一主题领域但义项不对）；',
      '10-29 = 几乎无关；0-9 = 完全无关或反义。',
      'correct 规则：score>=85 且学习者答的是该词常用核心义项之一才判 true；仅命中生僻义项、反义词、或只是沾边一律判 false。'
    ].join('\n');
    const user = `目标单词：${word}
词根拆解：${b.roots || '（无）'}
正确释义（仅供你打分参考，绝不可出现在 comment / hint 里）：${b.meaning || ''}
学习者第 ${b.attempt || 1} 次尝试，答案：${guess}
${b.history && b.history.length ? '他已经猜过：' + b.history.join('、') : ''}

注意：如果这题没答对，你的 comment 只能评价他答案本身偏在哪一层，不能提示正确方向；hint 也不能泄露答案。`;

    const text = await callAI(system, user, { json: true, temperature: 0.3 });
    const parsed = parseJsonSafe(text);
    if (!parsed) return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    sendJson(res, 200, {
      score,
      correct: !!parsed.correct,
      comment: String(parsed.comment || ''),
      near: String(parsed.near || ''),
      hint: String(parsed.hint || ''),
      by: 'ai'
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- AI：拼写判定 ----------
route('POST', '/api/ai/judge-spell', async (req, res) => {
  try {
    const b = await readBody(req);
    const word = String(b.word || '').trim().toLowerCase();
    const spell = String(b.spell || '').trim().toLowerCase();
    if (!word || !spell) return sendJson(res, 400, { error: '缺少单词或拼写' });
    if (word === spell) return sendJson(res, 200, { correct: true, comment: '拼写完全正确。', by: 'local' });

    const system = [
      '你是英语拼写教练。学习者根据中文释义和词根提示拼写单词，写出的内容与正确单词不完全一致。',
      '只输出 JSON：{"equivalent":<true/false>,"comment":"<一句话中文点评>","tip":"<记忆/纠错提示，一句话>"}',
      'equivalent=true 仅当学习者写法与正确单词是同一词的不同合法形式（英美式拼写、屈折变化、大小写、连字符/空格差异）。',
      'equivalent=false 时要指出具体错在哪一段（例如哪个词根写错、少了字母、字母顺序错），并给出助记提示。',
      '红线：不要写出完整的正确拼写（那等于替他答题），也不要逐字母念出整个单词；只能定位错误位置、说明错因、给记忆线索。'
    ].join('\n');
    const user = `正确单词：${word}\n中文释义：${b.meaning || ''}\n词根拆解：${b.roots || '（无）'}\n学习者拼写：${spell}`;

    const text = await callAI(system, user, { json: true, temperature: 0.3 });
    const parsed = parseJsonSafe(text);
    if (!parsed) return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    sendJson(res, 200, {
      correct: !!parsed.equivalent,
      comment: String(parsed.comment || ''),
      tip: String(parsed.tip || ''),
      by: 'ai'
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- AI：字母片段查词根含义（词根拆解里"没释义的片段"）----------
route('POST', '/api/ai/root-piece', async (req, res) => {
  try {
    const b = await readBody(req);
    const piece = String(b.piece || '').trim().toLowerCase().replace(/[^a-z-]/g, '');
    if (!piece) return sendJson(res, 400, { error: '缺少片段' });
    const word = String(b.word || '').trim().toLowerCase();
    const guard = !!b.guard;              // true = 学习者正在猜这个词的意思，回答不许泄底
    const inWord = b.mode === 'word';     // true = 「结合当前单词」问它在词里的作用；false = 只问片段本身的通用含义

    // 缓存维度分开：防剧透 / 结合了哪个单词。否则先查过一次，结论就会串到别的场景
    const cacheKey = 'piece:' + piece + (guard ? '|guard' : '') + (inWord ? '|w:' + word : '');
    const cache = loadRootsLibrary();
    if (cache[cacheKey]) return sendJson(res, 200, Object.assign({ cached: true }, cache[cacheKey]));

    const guardRule = guard ? [
      '',
      '======== 头号红线：不许剧透 ========',
      `学习者正在猜「${word}」这个词的意思。meaning 和 note 两个字段都只许讲这个片段本身，绝不能透露整个单词的含义。`,
      '禁止（meaning 和 note 都不许出现）：写出 / 复述 / 翻译该词的中文释义；复述词源故事里"含义"那一环（例如"来自拉丁语 xxx，意思是…"）；用近义词点明它什么意思。',
      'note 只能说这个片段和哪个词根同源、拼写怎么演变，不许带出该词整体的意思。',
      '允许：点明片段对应哪个词根及其含义（例如"cap/cept = 拿、抓"）、以及同词根的其他单词。',
      '4) examples 里不要出现学习者正在猜的那个词本身。',
      '判断标准：看完你的回答，学习者仍然要自己把"词根含义"推成"整个单词的意思"。'
    ].join('\n') : '';

    const system = inWord ? [
      '你是英语词源学专家。学习者正在看一个具体单词，想弄清其中某个字母片段「在这个词里」到底起什么作用、表达什么意思。',
      '只输出 JSON：{"piece":"片段","isRoot":<true/false>,"meaning":"<该片段在这个单词里的作用与含义，中文，简短有力>",',
      '"note":"<结合这个单词说明为什么这么拆、怎么记，一句话中文>","examples":["含该片段的真实英文单词1","单词2","单词3"]}',
      '要求：',
      '1) 必须结合给出的这个单词讲：说清这个片段在本词里是词根 / 前缀 / 后缀 / 连接成分，以及它对词义的贡献；',
      '2) 如果它和常见词根是同一族的变体（如 spect/spec、cap/cep/cip、tain/ten/tin），点明对应哪个词根，但重点仍是"在这个词里"的含义；',
      '3) 如果它在别的词里有别的意思，可以简短对比（例如"这里不是常见的 xxx，而是……"）；',
      '4) examples 优先给与当前单词同词根的真实单词。' + guardRule
    ].join('\n') : [
      '你是英语词源学专家。学习者从单词里看到一个字母片段，想知道它在构词上最接近什么含义。',
      '只输出 JSON：{"piece":"片段","isRoot":<true/false>,"meaning":"<该片段最接近的词根/词缀含义，中文，简短有力；若它确实不表意，就说清它是什么成分>",',
      '"note":"<一句话解释来源或记忆方式，中文>","examples":["含该片段的真实英文单词1","单词2","单词3"]}',
      '要求：',
      '1) 如果它是某个常见词根的变体或另一种拼法（如 spect/spec、cap/cep/cip、tain/ten/tin），必须点明对应哪个词根及其含义；',
      '2) 如果它只是连接字母、词干残留或常见词的普通拼写片段，isRoot 给 false，并在 meaning 里说明"它本身不表意，是……的一部分"；',
      '3) examples 必须是真实存在的英文单词，且确实包含该片段。' + guardRule
    ].join('\n');
    const user = inWord
      ? `单词：${word || '（未提供）'}\n学习者不懂的片段：${piece}\n请说明这个片段在「${word || '这个词'}」里的作用与含义。` +
        (guard ? `\n注意：学习者正在猜这个词的意思，你的回答不能让他直接知道答案。` : '')
      : `片段：${piece}\n（它出现在单词：${word || '（未提供）'}）` +
        (guard ? `\n注意：学习者正在猜这个词的意思，你的回答不能让他直接知道答案。` : '');

    const text = await callAI(system, user, { json: true, temperature: 0.4 });
    const parsed = parseJsonSafe(text);
    if (!parsed) return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    const result = {
      piece: String(parsed.piece || piece),
      isRoot: !!parsed.isRoot,
      meaning: String(parsed.meaning || ''),
      note: String(parsed.note || ''),
      mode: inWord ? 'word' : 'piece',
      examples: Array.isArray(parsed.examples) ? parsed.examples.slice(0, 6) : []
    };
    cache[cacheKey] = result;
    saveRootsLibrary(cache);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- AI：两级提示（猜词义时「要提示」按钮）----------
// 提示属于「跟随单词」的知识数据：以 hint:word 存进资料库，可导出分享；同一个词同一级只花一次 token
route('POST', '/api/ai/hint', async (req, res) => {
  try {
    const b = await readBody(req);
    const word = String(b.word || '').trim();
    if (!word) return sendJson(res, 400, { error: '缺少单词' });
    const level = Math.max(1, Math.min(2, Number(b.level) || 1));

    const cacheKey = 'hint:' + word.toLowerCase();
    const cache = loadRootsLibrary();
    const rec = cache[cacheKey];
    if (rec && Array.isArray(rec.hints) && rec.hints[level - 1]) {
      return sendJson(res, 200, { hint: rec.hints[level - 1], level, cached: true });
    }

    const system = [
      '你是英语词汇教师，正在给「猜词义」的学习者两级提示。只输出 JSON：{"hint":"<提示正文>"}',
      '',
      '头号红线：这是猜词游戏，提示是帮他自己想出来，绝对不能报答案。',
      '禁止：写出 / 复述 / 翻译 / 近义改写正确释义；出现「意思是」「指的是」「核心含义是」「其实是」等句式；出现答案词里的任何字，或用它的近义词。',
      '',
      '两级提示的定位：',
      '第 1 级「方向」：极简，只给「它属于哪一类」。一句话，不超过 15 个字。',
      '  可以说：词性 + 笼统的方向/感受（人对某事的作为、一种感受、一个抽象概念…）。',
      '  合格示例：「动词，描述人对某事的一种作为」「形容词，描述一种感受」「抽象名词，和时间有关」。',
      '  严禁示例：「动词，意思是把某人限制住」（直接报答案）。',
      '',
      '第 2 级「场景」：比第 1 级具体，但仍要让他能想出来，不能点破。给三样东西：',
      '  a) 典型场景（谁、什么情况下会用到）；',
      '  b) 常见搭配对象（常和什么一起出现）；',
      '  c) 一个对照（容易被它和哪个常见词搞混，或反方向的感觉是什么）。',
      '  合格示例：「当你很想做某件事、却强迫自己不做时用它，常和情绪、冲动这类词搭配，感觉和"放任"相反」。',
      '',
      '只输出本级那一条提示，不要同时给两段，不要输出任何解释。'
    ].join('\n');
    const user = `单词：${word}
词根：${b.roots || '（无）'}
正确释义（仅供你判断方向，严禁以任何形式透露）：${b.meaning || ''}
学习者已猜过：${(b.history || []).join('、') || '（还没有）'}
现在给出第 ${level} 级提示${level === 1 ? '（方向，极简）' : '（场景，更具体但不报答案）'}。`;
    const text = await callAI(system, user, { json: true, temperature: 0.8 });
    const parsed = parseJsonSafe(text);
    if (!parsed) return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    const hint = String(parsed.hint || '').trim();

    const merged = Object.assign({ hints: [] }, rec || {});
    if (!Array.isArray(merged.hints)) merged.hints = [];
    merged.hints[level - 1] = hint;
    cache[cacheKey] = merged;
    saveRootsLibrary(cache);

    sendJson(res, 200, { hint, level });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- AI：补例句（词库里没例句时）----------
route('POST', '/api/ai/sentences', async (req, res) => {
  try {
    const b = await readBody(req);
    const word = String(b.word || '').trim().toLowerCase();
    if (!word) return sendJson(res, 400, { error: '缺少单词' });

    const cacheKey = 'sent:' + word;
    const cache = loadRootsLibrary();
    if (cache[cacheKey]) return sendJson(res, 200, Object.assign({ cached: true }, cache[cacheKey]));

    const system = [
      '你是英语词典编辑，为中国学习者编写例句。只输出 JSON：',
      '{"sentences":[{"en":"<英文例句>","cn":"<中文翻译>"}]}',
      '要求：给 2 条例句；句子自然地道，能体现该词在该释义下的典型用法；难度适中（考研/雅思水平）；',
      '不要生僻人名地名，不要出现中文，句中要真的用上这个单词（可以变形）。'
    ].join('\n');
    const user = `单词：${word}\n释义：${b.meaning || ''}`;

    const text = await callAI(system, user, { json: true, temperature: 0.8 });
    const parsed = parseJsonSafe(text);
    if (!parsed || !Array.isArray(parsed.sentences)) {
      return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    }
    const result = {
      sentences: parsed.sentences.slice(0, 3)
        .map(s => ({ e: String(s.en || '').trim(), c: String(s.cn || '').trim() }))
        .filter(s => s.e)
    };
    cache[cacheKey] = result;
    saveRootsLibrary(cache);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- AI：综合讲解（答对/看答案后）----------
route('POST', '/api/ai/explain', async (req, res) => {
  try {
    const b = await readBody(req);
    const word = String(b.word || '').trim();
    if (!word) return sendJson(res, 400, { error: '缺少单词' });

    // 讲解结果存进词根资料库，同一个词只花一次 token，之后直接从卡片里读
    const cacheKey = 'explain:' + word.toLowerCase();
    const cache = loadRootsLibrary();
    if (cache[cacheKey]) return sendJson(res, 200, Object.assign({ cached: true }, cache[cacheKey]));

    const system = [
      '你是英语词汇教师，用中文给学习者讲一个单词。只输出 JSON：',
      '{"memory":"<助记法，一句话，最好结合词根或联想>","usage":"<常见搭配/使用场景，一句话>","confusable":"<易混词提醒，一句话；没有就空字符串>"}'
    ].join('\n');
    const user = `单词：${word}\n释义：${b.meaning || ''}\n词根：${b.roots || '（无）'}`;
    const text = await callAI(system, user, { json: true, temperature: 0.6 });
    const parsed = parseJsonSafe(text);
    if (!parsed) return sendJson(res, 500, { error: 'AI 返回无法解析：' + String(text).slice(0, 200) });
    const result = {
      memory: String(parsed.memory || ''),
      usage: String(parsed.usage || ''),
      confusable: String(parsed.confusable || '')
    };
    cache[cacheKey] = result;
    saveRootsLibrary(cache);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message, noKey: !!e.noKey });
  }
});

// ---------- 静态文件 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { error: '拒绝访问' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + rel);
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

// ==================== 服务器 ====================
const server = http.createServer(async (req, res) => {
  // 允许本地多端口/多页面访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (e) { pathname = '/'; }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    try {
      return await r.handler(req, res, params);
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
  sendJson(res, 404, { error: '接口不存在: ' + req.method + ' ' + pathname });
});

// 打开浏览器（跨平台）
function openBrowser(url) {
  if (process.env.AUTO_OPEN === '0') return;
  if (IS_ELECTRON) return;                              // 独立窗口版：外面已经有窗口了，不再开浏览器
  const cmd = process.platform === 'win32' ? 'start "" "' + url + '"'
    : process.platform === 'darwin' ? 'open "' + url + '"'
    : 'xdg-open "' + url + '"';
  try {
    require('child_process').exec(cmd, () => {});
  } catch (e) { /* 打不开就算了，地址已经打印在窗口里 */ }
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const url = 'http://localhost:' + PORT;
    console.log('');
    console.log('  端口 ' + PORT + ' 上已经有一个服务在运行了（可能是你已经开过一个窗口）。');
    console.log('  不再重复启动，正在帮你打开网页： ' + url);
    console.log('  如果那个窗口已经关掉了却还提示端口占用，就把任务管理器里的 node.exe 结束掉再试。');
    console.log('');
    openBrowser(url);
    setTimeout(() => process.exit(0), 800);
    return;
  }
  console.error('启动失败：', err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  const port = server.address() ? server.address().port : PORT;   // PORT=0 时由系统分配，这里取真实端口
  const keyReady = !!getApiKey();
  console.log('');
  console.log('  英语猜词背诵器 已启动');
  console.log('  访问地址： http://localhost:' + port);
  console.log('  AI 配置： ' + (keyReady ? '已配置（' + getActiveProfileName() + ' / ' + getModel() + '）' : '未配置 Key —— 请在网页「设置」里填写，未配置时用本地兜底算法'));
  console.log('  数据目录： ' + ASSETS_DIR);
  console.log('  可用词库： ' + (fs.existsSync(BOOKS_DIR) ? fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.json')).join(', ') : '无（先运行 npm run build-books）'));
  console.log('');
  console.log('  浏览器若没有自动打开，请手动复制上面的访问地址到浏览器。');
  console.log('');
  openBrowser('http://localhost:' + port);
});

// 被打包 / 被 Electron 内嵌时，外部可以拿到 server 实例（例如取真实端口）
module.exports = server;
