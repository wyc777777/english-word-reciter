// ==================== 学习进度 / 间隔重复 / 今日队列 ====================
// 重要设计：猜词义(meaning) 与 拼单词(spell) 是**两套完全独立的系统**。
//   各自的词库选择、各自的学习进度、各自的今日队列，互不干扰。
//   进度结构：progress.books[词库id][模式].words[单词] = { s, ok, bad, due, seen, last }
//   队列结构：progress.modes[模式] = { bookId, day, qi, queue:[{w,type}] }

const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30];   // 阶段 -> 间隔天数
const MASTER_STAGE = 4;                            // 到达该阶段视为「已掌握」
const MAX_REVIEW_PER_DAY = 60;                     // 每天复习阶段最多安排多少到期词
const MODES = ['meaning', 'spell'];

const Store = {
  progress: null,
  booksMeta: [],
  words: [],          // 当前模式词库的全部单词（精简结构，内存缓存）
  wordMap: {},
  bookId: '',         // 当前内存里装的是哪本词库
  mode: 'meaning',    // 当前模式
  queue: [],          // 当前模式的今日队列
  qi: 0,
  saveTimer: null,
  _wordCache: {},     // 另一个系统的词库单词表（今日页要同时看两套，按需加载）

  // ---------- 初始化 ----------
  async init() {
    const p = await Api.progress();
    this.progress = Object.assign({ books: {}, daily: {}, settings: {}, modes: {}, stars: {} }, p || {});
    ['books', 'daily', 'settings', 'modes', 'stars'].forEach(k => { if (!this.progress[k]) this.progress[k] = {}; });
    this.migrateData();

    const s = this.progress.settings;
    s.mode = MODES.indexOf(s.mode) >= 0 ? s.mode : 'meaning';
    s.dailyNew = Number(s.dailyNew) || 15;                       // 「猜词义」每日新词量
    if (s.spellEnabled === undefined) s.spellEnabled = false;    // 「拼单词」默认关闭，需在设置里开启
    s.spellDailyNew = Number(s.spellDailyNew) || 10;             // 「拼单词」每日新词量
    s.rootsDisplay = s.rootsDisplay || 'always';
    if (s.rootsAuto === undefined) s.rootsAuto = true;
    s.autoSpeak = !!s.autoSpeak;

    const meta = await Api.books();
    this.booksMeta = meta.books || [];
    if (!this.booksMeta.length) throw new Error('没有可用词库，请先运行：node tools/build-books.js');

    const fallback = this.booksMeta[0].id;
    if (!s.bookByMode) s.bookByMode = {};
    MODES.forEach(m => {
      const id = s.bookByMode[m];
      if (!id || !this.booksMeta.some(b => b.id === id)) s.bookByMode[m] = fallback;
    });

    this.mode = s.mode;
    if (!this.modeEnabled(this.mode)) { this.mode = 'meaning'; s.mode = 'meaning'; }   // 拼单词没开就回到猜词义
    await this.ensureBookLoaded(this.mode);
    this.qi = 0;
    if (!this.restoreQueue(this.mode)) this.buildQueue();
    return this;
  },

  // 老版本数据结构迁移（单一进度 -> 两套独立进度）
  migrateData() {
    const P = this.progress;
    Object.keys(P.books).forEach(id => {
      const b = P.books[id] || {};
      if (b.words) {                     // 旧的共用进度，归到猜词义那边
        if (!b.meaning) b.meaning = { words: b.words };
        delete b.words;
      }
      MODES.forEach(m => {
        if (!b[m]) b[m] = { words: {} };
        if (!b[m].words) b[m].words = {};
      });
    });
    Object.keys(P.daily).forEach(k => {
      const d = P.daily[k] || {};
      if (d.new !== undefined || d.review !== undefined) {
        P.daily[k] = {
          meaning: { new: d.new || 0, review: d.review || 0, correct: d.correct || 0, total: d.total || 0 },
          spell: { new: 0, review: 0, correct: 0, total: 0 }
        };
      } else {
        MODES.forEach(m => {
          if (!d[m]) d[m] = { new: 0, review: 0, correct: 0, total: 0 };
        });
      }
    });
    const s = P.settings;
    if (!s.bookByMode) s.bookByMode = {};
    if (s.bookId) {
      MODES.forEach(m => { if (!s.bookByMode[m]) s.bookByMode[m] = s.bookId; });
    }
  },

  // ---------- 模式 ----------
  async setMode(mode) {
    if (MODES.indexOf(mode) < 0) return;
    if (mode === this.mode && this.queue.length) return;
    this.persistQueue();                 // 先把当前模式的进度存好
    this.mode = mode;
    this.progress.settings.mode = mode;
    await this.ensureBookLoaded(mode);   // 两个模式可能用不同词库
    this.queue = [];
    this.qi = 0;
    if (!this.restoreQueue(mode)) this.buildQueue();
    this.save();
  },

  bookIdOf(mode) { return this.progress.settings.bookByMode[mode || this.mode]; },

  // 「拼单词」可以在设置里关闭（默认关）；「猜词义」永远开着
  modeEnabled(mode) {
    const m = mode || this.mode;
    if (m === 'spell') return !!this.progress.settings.spellEnabled;
    return true;
  },
  // 设置里的每日新词量（不包含当天临时追加）
  baseLimit(mode) {
    const s = this.progress.settings;
    const m = mode || this.mode;
    const v = m === 'spell' ? (Number(s.spellDailyNew) || 10) : (Number(s.dailyNew) || 15);
    return Math.max(5, Math.min(100, v));
  },
  // 今日额度 = 基础设置 + 当天追加的。
  // 另外把「已经学掉的」和「队列里还没做的新词」都算进来，保证：
  //   已学 + 待做 ≤ 额度
  // 这样进度条分母不会卡在 20/20，也不会出现"当前第 32 个 / 一共 31 个"这种矛盾。
  dailyLimit(mode) {
    const m = mode || this.mode;
    const base = this.baseLimit(m);
    const t = this.today(m);
    const done = t.new || 0;
    const pending = (m === this.mode)
      ? this.queue.slice(this.qi).filter(x => x && x.type === 'new').length
      : 0;
    const extra = Math.max(t.extra || 0, done - base, done + pending - base);
    return base + extra;
  },

  // 切换（某模式的）词库
  async setBook(bookId, mode) {
    const m = mode || this.mode;
    if (!this.booksMeta.some(b => b.id === bookId)) return;
    this.progress.settings.bookByMode[m] = bookId;
    this._wordCache = {};                  // 换书后另一套系统的词表缓存失效
    // 该模式换书 = 重新开始今天的队列（进度数据仍保留在各自词库下）
    this.progress.modes[m] = null;
    if (m === this.mode) {
      this.bookId = '';
      await this.ensureBookLoaded(m);
      this.queue = [];
      this.qi = 0;
      this.buildQueue();
    }
    this.save();
  },

  async ensureBookLoaded(mode) {
    const id = this.bookIdOf(mode);
    if (this.bookId === id && this.words.length) return;
    const data = await Api.book(id);
    this.words = data.words || [];
    this.wordMap = {};
    this.words.forEach(w => { this.wordMap[w.w] = w; });
    this.bookId = id;
  },

  // 取某个系统的词库单词表：当前系统直接用内存里的，别的系统按需加载并缓存
  async wordsFor(mode) {
    const m = mode || this.mode;
    const id = this.bookIdOf(m);
    if (id === this.bookId && this.words.length) return this.words;
    if (!this._wordCache) this._wordCache = {};
    if (!this._wordCache[id]) {
      const data = await Api.book(id);
      this._wordCache[id] = data.words || [];
    }
    return this._wordCache[id];
  },

  // ---------- 基础读写 ----------
  todayKey(d) {
    const t = d || new Date();
    const p = n => (n < 10 ? '0' : '') + n;
    return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
  },
  // 时间戳 -> 日期键（复习到期按「天」算，不按精确时刻）
  dayKeyOf(ts) { return ts ? this.todayKey(new Date(ts)) : ''; },
  // 时间戳 -> 当天 0 点（安排复习日期时统一从 0 点起算）
  dayStart(ts) {
    const d = ts ? new Date(ts) : new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },
  modeData(mode) {
    const m = mode || this.mode;
    const id = this.bookIdOf(m);
    if (!this.progress.books[id]) this.progress.books[id] = {};
    const b = this.progress.books[id];
    if (!b[m]) b[m] = { words: {} };
    if (!b[m].words) b[m].words = {};
    return b[m];
  },
  today(mode) {
    const k = this.todayKey();
    if (!this.progress.daily[k]) this.progress.daily[k] = {};
    const d = this.progress.daily[k];
    const m = mode || this.mode;
    // extra = 当天点「再来 10 个」临时加出来的额度（只算今天，跨天自动归零）
    if (!d[m]) d[m] = { new: 0, review: 0, correct: 0, total: 0, extra: 0 };
    if (d[m].extra === undefined) d[m].extra = 0;
    return d[m];
  },
  state(w, mode) { return this.modeData(mode).words[w] || null; },
  ensure(w, mode) {
    const words = this.modeData(mode).words;
    if (!words[w]) words[w] = { s: 0, ok: 0, bad: 0, due: 0, seen: 0, last: 0 };
    return words[w];
  },
  isMastered(w, mode) {
    const s = this.state(w, mode);
    return !!s && (s.grad === 1 || s.s >= MASTER_STAGE);
  },
  isDue(w, mode) {
    const s = this.state(w, mode);
    if (!s || s.grad || !s.seen || !s.due) return false;
    // 按「天」比较：约好明天复习，那么过了今晚 0 点就算到期（不是 24 小时之后）
    return this.dayKeyOf(s.due) <= this.todayKey();
  },
  isNew(w, mode) {
    const s = this.state(w, mode);
    return !s || (s.seen === 0 && !s.grad);
  },
  isGraduated(w, mode) { const s = this.state(w, mode); return !!s && s.grad === 1; },

  // ---------- 生词本（收藏，跨两个系统共用）----------
  isStarred(w) { return !!(this.progress.stars && this.progress.stars[w]); },
  toggleStar(w) {
    if (!this.progress.stars) this.progress.stars = {};
    if (this.progress.stars[w]) delete this.progress.stars[w];
    else this.progress.stars[w] = Date.now();
    this.save();
    return this.isStarred(w);
  },
  // 生词本跟随单词本身，不跟词书绑定：换词书后同一个词依然在生词本里
  starredWords() {
    const s = this.progress.stars || {};
    return Object.keys(s).sort((a, b) => s[b] - s[a]);
  },
  starCount() { return Object.keys(this.progress.stars || {}).length; },

  // ---------- 今日队列 ----------
  buildQueue() {
    // 「拼单词」没开启：这个系统今天不排任何题
    if (!this.modeEnabled()) { this.queue = []; this.qi = 0; this.persistQueue(); return []; }

    // 到期复习词：越早该复习的排越前
    const due = this.words.filter(w => this.isDue(w.w))
      .sort((a, b) => this.state(a.w).due - this.state(b.w).due)
      .slice(0, MAX_REVIEW_PER_DAY);

    // 今日还能加多少新词（dailyNew 是「今天最多学几个新词」）
    const remainNew = Math.max(0, this.dailyLimit() - this.today().new);   // 各系统算各系统的限额
    const fresh = this.words.filter(w => this.isNew(w.w));   // 新词 = 从没出现过（seen===0）
    shuffle(fresh);
    // 选今天要学的新词：不同词根轮着来，同一个词根今天最多挑 5 个
    const picked = selectNewByRoot(fresh.map(x => x.w), remainNew);
    const newPart = groupByRoot(picked);   // 再把同词根的词排在一起

    // 两段式：先「复习阶段」把到期的全过完，再进「学习阶段」学今天的新词
    const queue = [];
    due.forEach(w => queue.push({ w: w.w, type: 'review' }));
    newPart.forEach(w => queue.push({ w, type: 'new' }));

    this.queue = queue;
    this.qi = 0;
    this.persistQueue();
    return queue;
  },
  persistQueue() {
    if (!this.progress) return;
    this.progress.modes[this.mode] = {
      bookId: this.bookIdOf(this.mode),
      day: this.todayKey(),
      qi: this.qi,
      queue: this.queue.map(q => ({ w: q.w, type: q.type }))
    };
  },
  restoreQueue(mode) {
    if (!this.modeEnabled(mode)) return false;   // 这个系统没开启：今天不留旧队列
    const rec = this.progress.modes[mode];
    if (!rec || rec.day !== this.todayKey()) return false;
    if (rec.bookId !== this.bookIdOf(mode)) return false;
    const q = (rec.queue || []).filter(x => x && x.w && this.wordMap[x.w]);
    if (!q.length) return false;
    this.queue = q;
    this.qi = Math.min(Math.max(0, rec.qi || 0), q.length);
    return true;
  },
  current() {
    if (this.qi < 0 || this.qi >= this.queue.length) return null;
    return this.queue[this.qi];
  },
  // qi 永远指向"当前正在做的那题"，next() 才是往后走一格
  next() {
    this.qi += 1;
    this.persistQueue();
    return this.current();
  },
  addExtra(n) {
    // 已经做过的部分先从队列里丢掉，否则每次追加都会让队列越堆越长
    if (this.qi > 0) { this.queue = this.queue.slice(this.qi); this.qi = 0; }

    const fresh = this.words.filter(w => this.isNew(w.w));
    shuffle(fresh);
    const picked = fresh.slice(0, n);
    picked.forEach(w => this.queue.push({ w: w.w, type: 'new' }));

    // 加了几个词，就把「今天」的额度也抬高几个，进度条分母才会跟着变（明天自动回到原设置）
    if (picked.length) {
      const t = this.today();
      const base = this.baseLimit();
      const eff = Math.max(t.extra || 0, (t.new || 0) - base);   // 学超了的部分也算进已有额度
      t.extra = eff + picked.length;
    }
    this.persistQueue();
    this.save();
    return fresh.length;
  },

  // 重建队列后，把某个词重新对准当前指针 —— 保证「正在做的那题」不会被换掉
  focusOn(word, type) {
    if (!word) return;
    const at = Math.max(0, Math.min(this.qi, this.queue.length));
    const i = this.queue.findIndex(q => q.w === word);
    const item = i >= 0 ? this.queue.splice(i, 1)[0] : { w: word, type: type || 'review' };
    const pos = Math.min(at, this.queue.length);
    this.queue.splice(pos, 0, item);
    this.qi = pos;
    this.persistQueue();
  },

  // ---------- 评分 / 复习计划 ----------
  // rating: 'again'(不熟 → 明天) | 'tomorrow'(不太熟 → 3 天后) | 'know'(牢记 → 不再出现)
  rate(word, rating, isNew) {
    const st = this.ensure(word);
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    st.seen += 1;
    st.last = now;

    if (rating === 'know') {            // 牢记：毕业，从队列里彻底消失
      st.ok += 1;
      st.grad = 1;
      st.s = INTERVAL_DAYS.length - 1;
      st.due = 0;
    } else if (rating === 'again') {    // 不熟：明天再来（明天 0 点起就到复习队列）
      st.bad += 1;
      st.grad = 0;
      st.s = Math.max(0, Math.min(st.s, 1));
      st.due = this.dayStart(now) + 1 * DAY;
    } else {                            // 不太熟：3 天后再来
      st.ok += 1;
      st.grad = 0;
      st.s = Math.min(INTERVAL_DAYS.length - 1, st.s + 1);
      st.due = this.dayStart(now) + 3 * DAY;
    }

    const t = this.today();
    if (isNew) t.new += 1; else t.review += 1;
    t.total += 1;
    if (rating !== 'again') t.correct += 1;
    this.save();
  },

  // 记录「今天遇见过这个词」，供「今日」页列出当天练过的词
  markTodaySeen(w, mode) {
    const t = this.today(mode);
    if (!Array.isArray(t.words)) t.words = [];
    if (w && t.words.indexOf(w) < 0) t.words.push(w);
  },

  markAttempt(w, correct) {
    const st = this.ensure(w);
    if (correct) st.ok += 1; else st.bad += 1;
    this.save();
  },

  // ---------- 统计 ----------
  stats(mode) {
    const m = mode || this.mode;
    const words = this.modeData(m).words;
    let mastered = 0, learning = 0, due = 0;
    this.words.forEach(w => {
      const s = words[w.w];
      if (!s) return;
      if (s.grad) { mastered++; return; }        // 点过「牢记」的算掌握，且不再进队列
      if (!s.seen) return;
      if (s.s >= MASTER_STAGE) mastered++; else learning++;
      if (this.isDue(w.w, m)) due++;            // 与新口径一致：按「天」算到期
    });
    const t = this.today(m);
    return {
      mode: m,
      total: this.words.length,
      mastered, learning,
      untouched: this.words.length - mastered - learning,
      starred: this.starCount(),
      due, todayNew: t.new, todayReview: t.review,
      goal: this.dailyLimit(),
      accuracy: t.total ? Math.round((t.correct / t.total) * 100) : 0,
      queueLeft: Math.max(0, this.queue.length - this.qi)
    };
  },
  streak() {
    let n = 0;
    const d = new Date();
    for (let i = 0; i < 400; i++) {
      const k = this.todayKey(d);
      const rec = this.progress.daily[k];
      const active = rec && MODES.some(m => rec[m] && ((rec[m].new || 0) + (rec[m].review || 0)) > 0);
      if (active) n++;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return n;
  },

  // ---------- 持久化 ----------
  save() {
    try { localStorage.setItem('wgr-progress', JSON.stringify(this.progress)); } catch (e) {}
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      Api.saveProgress(this.progress).catch(() => {});
    }, 250);
  },
  // 立刻写服务端并等待完成（读档等场景必须顺序落盘）
  async saveNow() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try { await Api.saveProgress(this.progress); } catch (e) {}
  },
  // 关页面/切后台时立刻落盘，避免丢掉最后一题的成绩
  flush() {
    if (!this.progress) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try {
      const body = JSON.stringify(this.progress);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/progress', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      }
    } catch (e) { /* 尽力而为 */ }
  },
  replaceAll(data) {
    if (!data || !data.books) throw new Error('文件格式不正确');
    this.progress = data;
    if (!this.progress.settings) this.progress.settings = {};
    if (!this.progress.modes) this.progress.modes = {};
    this.save();
  },
  resetBook(mode) {
    const m = mode || this.mode;
    const id = this.bookIdOf(m);
    if (!this.progress.books[id]) this.progress.books[id] = {};
    this.progress.books[id][m] = { words: {} };
    this.progress.modes[m] = null;
    // 今日计数也要一起清零，否则「今日新词」会残留、队列也跟着变短
    const d = this.today(m);
    d.new = 0; d.review = 0; d.correct = 0; d.total = 0; d.extra = 0;
    if (m === this.mode) { this.queue = []; this.qi = 0; this.buildQueue(); }
    this.save();
  },

  // 重置「两套系统」：猜词义 + 拼单词（各自词库）的学习进度与今日计数一起清零
  // 注意：两套系统日常仍然各自独立，只有这个操作会一起清
  resetAll() {
    MODES.forEach(m => {
      const id = this.bookIdOf(m);
      if (!this.progress.books[id]) this.progress.books[id] = {};
      this.progress.books[id][m] = { words: {} };
      this.progress.modes[m] = null;
      const d = this.today(m);
      d.new = 0; d.review = 0; d.correct = 0; d.total = 0; d.extra = 0;
    });
    this.queue = [];
    this.qi = 0;
    this.buildQueue();
    this.save();
  },

  // 「已经很懂了」：把词直接标为牢记，并从队列里换一个没学过的新词补进来（队列长度不变）
  skipAsKnown(word) {
    if (!word) return null;
    const wasNew = this.isNew(word);
    const st = this.ensure(word);
    st.seen += 1;
    st.last = Date.now();
    st.ok += 1;
    st.grad = 1;
    st.s = INTERVAL_DAYS.length - 1;
    st.due = 0;

    const t = this.today();
    if (wasNew) t.new += 1; else t.review += 1;
    t.total += 1;
    t.correct += 1;

    let addedWord = null;
    const i = this.queue.findIndex(q => q.w === word);
    if (i >= 0) {
      this.queue.splice(i, 1);                                  // 把这道题挪出队列
      const inQueue = new Set(this.queue.map(q => q.w));
      const fresh = this.words.filter(x => this.isNew(x.w) && !inQueue.has(x.w));
      shuffle(fresh);
      if (fresh.length) {                                        // 换一个没学过的新词进来
        addedWord = fresh[0].w;
        this.queue.splice(Math.min(i, this.queue.length), 0, { w: addedWord, type: 'new' });
      }
      this.qi = Math.min(i, this.queue.length);                  // 指针停在新换进来的这道题上
    }
    this.persistQueue();
    this.save();
    return addedWord;
  }
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// 取一个单词的「主词根」作为分组依据（只认真正的词根，不认前后缀，避免 -tion 类全挤一起）
function rootKeyOf(word) {
  try {
    const R = (typeof Roots !== 'undefined') ? Roots : null;
    if (!R || typeof R.splitWord !== 'function') return '';
    const { parts } = R.splitWord(word);
    const roots = (parts || []).filter(p => p.type === 'r' && p.known && p.text.length >= 3);
    return roots.length ? roots[0].text : '';
  } catch (e) { return ''; }
}

// 选今天要学的新词：按词根轮询抽取，同一个词根今天最多 MAX 个（避免一天全是同根词）
function selectNewByRoot(freshWords, n) {
  const MAX = 5;
  const groups = new Map();
  const loose = [];
  freshWords.forEach(w => {
    const k = rootKeyOf(w);
    if (!k) { loose.push(w); return; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  });
  const pools = [];
  groups.forEach(list => pools.push(list.slice(0, MAX)));   // 每个词根最多取 5 个
  pools.push(loose);
  pools.forEach(p => shuffle(p));
  shuffle(pools);

  const out = [];
  let more = true;
  while (out.length < n && more) {
    more = false;
    for (const p of pools) {
      if (!p.length) continue;
      out.push(p.shift());
      more = true;
      if (out.length >= n) break;
    }
  }
  return out;
}

// 把新词按词根聚成小组：同词根的一组最多 MAX 个连续；
// 孤词 / 超出的同根词当散词，调度时穿插开，保证同词根不会连成一大串
function groupByRoot(words) {
  const MAX = 5;
  const buckets = new Map();
  const chunks = [];
  words.forEach(w => {
    const k = rootKeyOf(w);
    if (!k) { chunks.push({ key: null, words: [w] }); return; }   // 没词根：单独一块
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(w);
  });
  buckets.forEach((list, key) => {
    if (list.length < 2) { chunks.push({ key: null, words: list }); return; }   // 孤词算散词
    chunks.push({ key, words: list.slice(0, MAX) });                            // 同词根一组，最多 5 个
    for (let i = MAX; i < list.length; i++) chunks.push({ key: null, words: [list[i]] });   // 超出的散开
  });

  shuffle(chunks);
  const out = [];
  let last = null;
  const pending = chunks.slice();
  while (pending.length) {
    let i = pending.findIndex(c => c.key === null || c.key !== last);   // 同词根的块不紧挨
    if (i < 0) i = 0;
    const c = pending.splice(i, 1)[0];
    out.push(...c.words);
    last = c.key;
  }
  return out;
}
