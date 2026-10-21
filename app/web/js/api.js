// ==================== 前端 API 封装 ====================
// 前端只跟 localhost 打交道，密钥永远留在后端。
const Api = {
  async request(method, url, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opt);
    } catch (e) {
      throw new Error('连不上本地服务器，请确认 server.js 正在运行');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('请求失败 ' + res.status));
    return data;
  },

  get(url) { return Api.request('GET', url); },
  post(url, body) { return Api.request('POST', url, body); },
  put(url, body) { return Api.request('PUT', url, body); },
  del(url) { return Api.request('DELETE', url); },

  // ---- 词库 ----
  books() { return Api.get('/api/books'); },
  book(id) { return Api.get('/api/books/' + encodeURIComponent(id)); },

  // ---- 进度 ----
  progress() { return Api.get('/api/progress'); },
  saveProgress(data) { return Api.post('/api/progress', data); },

  // ---- AI 配置 ----
  aiConfig() { return Api.get('/api/api-config'); },
  saveAiConfig(body) { return Api.put('/api/api-config', body); },
  newProfile(body) { return Api.post('/api/api-config/profile', body); },
  delProfile(name) { return Api.del('/api/api-config/profile/' + encodeURIComponent(name)); },
  activateProfile(name) { return Api.put('/api/api-config/active', { name }); },
  testConnection() { return Api.post('/api/api-config/test', {}); },

  // ---- AI 能力 ----
  roots(word, meaning, force) { return Api.post('/api/ai/roots', { word, meaning, force: !!force }); },
  judgeMeaning(p) { return Api.post('/api/ai/judge-meaning', p); },
  judgeSpell(p) { return Api.post('/api/ai/judge-spell', p); },
  hint(p) { return Api.post('/api/ai/hint', p); },
  rootPiece(piece, word, guard, mode) {
    return Api.post('/api/ai/root-piece', { piece, word, guard: !!guard, mode: mode === 'word' ? 'word' : 'piece' });
  },
  rootsLibrary() { return Api.get('/api/roots-library'); },
  rootsLibraryImport(items) { return Api.post('/api/roots-library/import', { items }); },
  sentences(word, meaning) { return Api.post('/api/ai/sentences', { word, meaning }); },

  // ---- 存档 ----
  saves() { return Api.get('/api/saves'); },
  saveTo(slot, progress, name) { return Api.post('/api/saves/' + slot, { progress, name }); },
  loadSave(slot) { return Api.get('/api/saves/' + slot); },
  delSave(slot) { return Api.del('/api/saves/' + slot); },
  explain(p) { return Api.post('/api/ai/explain', p); }
};

// ==================== 发音 ====================
const Speech = {
  speak(word) {
    if (!word) return;
    // 优先用有道发音接口（更准），失败则回退到系统 TTS
    try {
      const a = new Audio('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=2');
      a.onerror = () => Speech.fallback(word);
      const p = a.play();
      if (p && p.catch) p.catch(() => Speech.fallback(word));
    } catch (e) { Speech.fallback(word); }
  },
  fallback(word) {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
};

// ==================== 本地兜底：语义接近度估算 ====================
// 没配 API Key 时用字符重合度粗算，保证游戏依然能玩（前端会标注"本地估算"）
const LocalJudge = {
  // 中文答案 vs 正确释义的近似度
  scoreMeaning(guess, meanings) {
    const g = String(guess || '').trim();
    if (!g) return 0;
    const chars = s => Array.from(String(s).replace(/[^\u4e00-\u9fa5]/g, ''));
    const gc = chars(g);
    if (!gc.length) return 0;
    let best = 0;
    meanings.forEach(m => {
      const mc = chars(m);
      if (!mc.length) return;
      const setM = new Set(mc);
      const hit = gc.filter(c => setM.has(c)).length;
      const ratio = (hit / gc.length) * 0.6 + (hit / mc.length) * 0.4;
      best = Math.max(best, ratio);
    });
    return Math.max(0, Math.min(100, Math.round(best * 100)));
  },

  // 机械判定是否算对：任一词项与答案互相包含（都 ≥2 字）→ 直接算对；
  // 否则用字符重合度，达到阈值（默认 75）算对
  meaningPass(guess, meanings, threshold) {
    const need = Number(threshold) || 75;
    const norm = s => String(s || '').replace(/[\s，,。.；;、/|·（）()【】\[\]{}"'“”‘’]/g, '');
    const g = norm(guess);
    if (!g) return { pass: false, score: 0, how: 'empty' };

    const list = Array.isArray(meanings) ? meanings : [meanings];
    const items = [];
    list.forEach(m => {
      String(m || '').split(/[，,。.；;、/|]/).forEach(part => {
        const n = norm(part);
        if (n) items.push(n);
      });
    });

    // 1) 关键词命中：释义的任一义项和你的答案互相包含
    for (const it of items) {
      if (it.length >= 2 && g.length >= 2 && (it.includes(g) || g.includes(it))) {
        return { pass: true, score: 100, how: 'keyword' };
      }
    }
    // 2) 字符重合度兜底
    const score = LocalJudge.scoreMeaning(guess, list);
    return { pass: score >= need, score, how: 'score' };
  },

  // 拼写字母级反馈（Wordle 风格：绿=位置对，黄=字母存在但位置错）
  compareSpell(guess, answer) {
    const g = String(guess || '').toLowerCase();
    const a = String(answer || '').toLowerCase();
    const res = [];
    const pool = [];
    for (let i = 0; i < a.length; i++) {
      if (g[i] === a[i]) res[i] = 'green';
      else { res[i] = 'gray'; pool.push(a[i]); }
    }
    for (let i = 0; i < g.length; i++) {
      if (res[i] === 'green') continue;
      const idx = pool.indexOf(g[i]);
      if (idx >= 0) { res[i] = 'yellow'; pool.splice(idx, 1); }
    }
    return res;
  },

  // 拼写错误的一句话提示（离线版）
  spellTip(guess, answer) {
    const g = String(guess || '').toLowerCase();
    const a = String(answer || '').toLowerCase();
    if (g === a) return '完全正确。';
    const d = LocalJudge.editDistance(g, a);
    if (d === 1 && g.length === a.length) return '只差一个字母，再检查元音部分。';
    if (g.length < a.length) return '短了 ' + (a.length - g.length) + ' 个字母，想想是不是漏了词根或后缀。';
    if (g.length > a.length) return '长了 ' + (g.length - a.length) + ' 个字母，注意有没有多写字母。';
    return '字母顺序或选字母有误，对照词根再看一遍。';
  },

  editDistance(s1, s2) {
    const m = s1.length, n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (s1[i - 1] === s2[j - 1] ? 0 : 1));
      }
    }
    return dp[m][n];
  }
};
