// ==================== 练习核心：猜词义 / 拼单词 ====================
const Practice = {
  mode: 'meaning',      // meaning | spell
  cur: null,            // { item, type }
  guesses: [],          // [{ text, score, comment }]
  attempts: 0,
  revealed: false,
  aiRoots: null,        // AI 拆解结果（本地拆不出时补全）
  hintLevel: 0,
  egLevel: 0,           // 看例句的档位：0 没看 / 1 只有英文 / 2 中英都给
  spelledTiles: [],
  lookupMode: false,     // true = 从词库/生词本点进来的卡片，不推进练习队列

  init() {
    $('#btn-submit').addEventListener('click', () => Practice.submit(false));        // AI 提交
    $('#btn-submit-local').addEventListener('click', () => Practice.submit(true));    // 机械提交（不花 token）
    $('#answer').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      Practice.submit(!!e.ctrlKey);      // 回车 = AI 提交；Ctrl+Enter = 机械提交
    });
    $('#btn-giveup').addEventListener('click', () => Practice.showWordCard(true));
    $('#btn-skip').addEventListener('click', () => { Practice.next(); });
    $('#btn-hint').addEventListener('click', () => Practice.hint());
    $('#btn-eg').addEventListener('click', () => Practice.showExample());
    $('#btn-know-it').addEventListener('click', () => Practice.knowIt());
    $('#btn-ai-roots').addEventListener('click', () => Practice.rerootByAI());
    $('#wm-close').addEventListener('click', () => Practice.closeLookup());
    $('#btn-speak').addEventListener('click', () => Speech.speak(Practice.cur && Practice.cur.item.w));
    $('#btn-toggle-roots').addEventListener('click', () => {
      const row = $('#wc-roots');
      row.classList.toggle('hidden');
      $('#btn-toggle-roots').textContent = row.classList.contains('hidden') ? '显示词根' : '隐藏词根';
    });

    // ---- 单词详情卡（答对/看答案后弹出）----
    $('#wm-speak').addEventListener('click', () => Speech.speak(Practice.cur && Practice.cur.item.w));
    $('#wm-explain').addEventListener('click', () => Practice.explain());
    $('#wm-ai-roots').addEventListener('click', () => Practice.aiRootsManual());
    $('#wm-star').addEventListener('click', () => Practice.toggleStar());
    $$('#word-modal .wm-btn').forEach(b => {
      b.addEventListener('click', () => Practice.finishCard(b.dataset.act));
    });

    // 片段查词根：两种问法
    $('#btn-root-piece').addEventListener('click', () => Practice.queryPiece('piece'));
    $('#btn-root-piece-word').addEventListener('click', () => Practice.queryPiece('word'));
    $('#root-piece-input').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      Practice.queryPiece(e.shiftKey ? 'word' : 'piece');   // Shift+回车 = 结合本词问
    });
    // 点词根行里的片段：查过的直接给结论，没查过的填进查询框
    document.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('.root-piece.link');
      if (!el) return;
      const piece = (el.dataset.piece || el.textContent.trim()).toLowerCase();
      const archived = Roots.PieceArchive.get(piece);
      if (archived) {
        $('#root-piece-input').value = piece;
        Practice.renderPieceResult(archived, true);
        return;
      }
      Practice.preparePiece(piece);
    });
    $('#btn-extra').addEventListener('click', () => {
      const n = Store.addExtra(10);
      if (!n) return UI.toast('这本词库已经全部学过了');
      Practice.showCurrent();
      UI.toast('已追加新词，今日额度变成 ' + Store.dailyLimit() + ' 个');
    });
    $$('.mode-btn').forEach(b => {
      b.addEventListener('click', () => Practice.setMode(b.dataset.mode));
    });
    $('#btn-shuffle').addEventListener('click', () => {
      Store.buildQueue();
      Practice.showCurrent();
      UI.toast('已重新编排「' + Practice.modeName() + '」的今日词表');
    });
  },

  modeName(m) {
    return (m || Practice.mode) === 'meaning' ? '猜词义' : '拼单词';
  },

  // 只刷新模式相关 UI（启动时用，不重建队列）
  applyModeUI() {
    $$('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === Practice.mode);
      if (b.dataset.mode === 'spell') b.classList.toggle('off', !Store.modeEnabled('spell'));   // 没开启就灰掉
    });
    const input = $('#answer');
    input.value = '';
    if (Practice.mode === 'meaning') {
      input.placeholder = '输入中文意思…';
      $('#input-hint').textContent = '说出这个词的意思，AI 会判断你猜得有多准（回车提交）';
    } else {
      input.placeholder = '拼出这个单词…';
      $('#input-hint').textContent = '根据中文释义和词根提示拼出单词（回车提交）';
    }
    Practice.syncBookSelect();
  },

  syncBookSelect() {
    const sel = $('#book-select');
    if (sel) sel.value = Store.bookIdOf(Practice.mode);
  },

  // 切换系统：猜词义 ↔ 拼单词（各自独立词库、进度、队列）
  async setMode(mode) {
    if (mode === Practice.mode || Practice._switching) return;
    if (!Store.modeEnabled(mode)) return UI.toast('「拼单词」还没开启：去「设置 → 学习设置」里打开它', true);
    Practice._switching = true;
    try {
      Practice.mode = mode;
      Practice.applyModeUI();
      await Store.setMode(mode);
      Practice.showCurrent();
      Settings.fillBookSelects();
      BooksView.render();
      StatsView.render();
      UI.toast('已切到「' + Practice.modeName() + '」系统，它有自己独立的词库与进度');
    } finally {
      Practice._switching = false;
    }
  },

  // ---------- 加载下一个词 ----------
  next() {
    const q = Store.next();
    if (!q) return Practice.showEmpty();
    Practice.startQuestion({ item: Store.wordMap[q.w], type: q.type });
  },

  // 显示当前队列位置上的词（不推进）—— 切换系统后接着上次的位置继续
  showCurrent() {
    const q = Store.current();
    if (!q) return Practice.showEmpty();
    Practice.startQuestion({ item: Store.wordMap[q.w], type: q.type });
  },

  // 清空并隐藏结果卡：换题时调用，避免上一题的评分/拼写反馈/提示残留在里面
  resetResultCard() {
    const card = $('#result-card');
    if (!card) return;
    UI.hide(card);
    UI.hide($('#score-row'));
    UI.hide($('#spell-tiles'));
    UI.hide($('#spell-result'));
    UI.hide($('#rs-hint'));
    $('#rs-score').textContent = '0';
    $('#rs-verdict').innerHTML = '';
    $('#rs-comment').textContent = '';
    $('#spell-tiles').innerHTML = '';
    $('#sp-verdict').innerHTML = '';
    $('#sp-comment').textContent = '';
    $('#rs-hint').innerHTML = '';
  },

  showEmpty() {
    Practice.cur = null;
    $('.word-card').classList.add('hidden');
    $('.input-card').classList.add('hidden');
    UI.hide($('#result-card')); UI.hide($('#history-card')); UI.hide($('#word-modal'));
    const box = $('#practice-empty');
    const off = !Store.modeEnabled(Practice.mode);          // 拼单词没开启时，空态不能说「都背完了」
    const p = box && box.querySelector('p');
    if (p) p.textContent = off ? '「拼单词」还没开启，去「设置」里打开它才有题做' : '今天的词都背完啦 🎉';
    UI.toggle($('#btn-extra'), !off);
    UI.show(box);
    Practice.updateStrip();
  },

  startQuestion(entry) {
    if (!entry || !entry.item) return Practice.showEmpty();
    UI.hide($('#practice-empty'));
    $('.word-card').classList.remove('hidden');
    $('.input-card').classList.remove('hidden');

    Practice.cur = entry;
    Store.markTodaySeen(entry.item.w);      // 记进「今日」列表
    Practice.guesses = [];
    Practice.attempts = 0;
    Practice.revealed = false;
    Practice.aiRoots = null;
    Practice.hintLevel = 0;
    Practice.spelledTiles = [];
    Practice.egLevel = 0;                       // 每道题都重新从「没看例句」开始
    $('#answer').value = '';
    $('#root-piece-input').value = '';
    UI.hide($('#root-piece-result'));
    UI.hide($('#wc-eg'));
    Practice.resetResultCard();
    UI.hide($('#history-card'));
    UI.hide($('#word-modal'));
    Practice.render();
    if (Store.progress.settings.autoSpeak && Practice.mode === 'meaning') {
      Speech.speak(entry.item.w);
    }
    Practice.maybeAiRoots(entry.item);
    $('#answer').focus();
  },

  // ---------- 渲染题目 ----------
  render() {
    const cur = Practice.cur;
    if (!cur) return;
    const item = cur.item;
    const st = Store.state(item.w);
    Practice.syncEgButton();     // 「看例句」按钮只在猜词义模式出现，文案跟着档位走

    // 角标：按「今日进度」显示 —— 新词的分母用每日限额，复习的分母用今天要复习的总数
    const t = Store.today();
    const limit = Store.dailyLimit();
    if (cur.type === 'new') {
      const n = (t.new || 0) + 1;                    // 今天已学的新词数 + 当前这道（不封顶，显示真实进度）
      $('#wc-index').textContent = '今日新词 ' + n + '/' + Math.max(limit, n);
    } else {
      const q = Store.queue || [];
      const qi = Math.max(0, Math.min(Store.qi, q.length));
      const rDone = q.slice(0, qi).filter(x => x && x.type === 'review').length;
      const rTotal = q.filter(x => x && x.type === 'review').length;
      $('#wc-index').textContent = '今日复习 ' + Math.min(rDone + 1, rTotal) + '/' + rTotal;
    }
    const tag = $('#wc-tag');
    if (cur.type === 'review') { tag.textContent = '复习'; tag.className = 'chip review'; }
    else if (st && st.s >= MASTER_STAGE) { tag.textContent = '已掌握'; tag.className = 'chip mastered'; }
    else { tag.textContent = '新词'; tag.className = 'chip'; }

    // 单词区
    const wordEl = $('#wc-word');
    if (Practice.mode === 'spell') {
      wordEl.innerHTML = '<span class="blank">' + Practice.maskWord(item.w) + '</span>';
    } else {
      wordEl.textContent = item.w;
    }
    $('#wc-ph').textContent = Practice.mode === 'spell' ? '' : (item.ph ? '/' + item.ph + '/' : '');

    // 中文释义提示（拼写模式）
    const prompt = $('#wc-prompt');
    if (Practice.mode === 'spell') {
      prompt.classList.remove('hidden');
      prompt.textContent = UI.meaningText(item);
    } else {
      prompt.classList.add('hidden');
    }

    Practice.renderRoots();
    Practice.updateStrip();
  },

  maskWord(w) {
    const reveal = Practice.hintLevel;
    return Array.from(w).map((c, i) => (i < reveal || !/[a-z]/.test(c) ? c : '_')).join(' ');
  },

  renderRoots() {
    const cur = Practice.cur;
    if (!cur) return;
    const w = cur.item.w;
    const row = $('#wc-roots');

    // AI 拆解优先：当前这道题的，或者以前拆过存进档案的（跟着单词走）
    const ai = Practice.aiRoots || (Roots.ExplodeArchive ? Roots.ExplodeArchive.get(w) : null);
    let parts = null;
    if (ai && ai.parts && ai.parts.length) {
      parts = ai.parts.map(p => ({ text: p.text, type: p.type, meaning: p.meaning, known: true }));
    } else {
      const local = Roots.splitWord(w);
      if (local.knownCount > 0) parts = local.parts;
    }
    if (!parts) {
      row.innerHTML = '';
      row.classList.add('hidden');
      delete row.dataset.spoiler;
      $('#btn-toggle-roots').classList.add('hidden');
      return;
    }

    // 拼单词时：词根提示要是能直接拼出答案，就等于透题，直接藏掉
    if (Practice.mode === 'spell' && Practice.isRootSpoiler(w, parts)) {
      row.innerHTML = '<span class="sub">这个词本身就是一个词根，显示出来等于报答案，所以先藏起来 —— 想不出可以点「要提示」看首字母。</span>';
      row.classList.remove('hidden');
      row.dataset.spoiler = '1';
      $('#btn-toggle-roots').classList.add('hidden');
      return;
    }

    row.innerHTML = UI.rootPieces(parts);
    delete row.dataset.spoiler;
    Practice.applyRootsDisplay();
  },

  // 按设置切换词根显隐（保存设置时即时生效，不重排队列、不重置当前题）
  applyRootsDisplay() {
    const row = $('#wc-roots');
    if (!row || !row.innerHTML || row.dataset.spoiler) return;
    const btn = $('#btn-toggle-roots');
    const disp = Store.progress.settings.rootsDisplay || 'always';
    if (disp === 'always') { row.classList.remove('hidden'); btn.classList.remove('hidden'); btn.textContent = '隐藏词根'; }
    else if (disp === 'never') { row.classList.add('hidden'); btn.classList.add('hidden'); }
    else { row.classList.add('hidden'); btn.classList.remove('hidden'); btn.textContent = '显示词根'; }
  },

  // ---------- 片段查词根含义 ----------
  preparePiece(piece) {
    const p = String(piece || '').trim();
    if (!p) return;
    const input = $('#root-piece-input');
    input.value = p;
    UI.hide($('#root-piece-result'));
    input.focus();
    input.select();
    UI.toast('选「直接问含义」或「结合本词问」查询片段 ' + p);
  },

  typeName(t) { return t === 'p' ? '前缀' : t === 'r' ? '词根' : t === 's' ? '后缀' : '成分'; },

  // 把一条片段结论画到结果区
  renderPieceResult(d, fromArchive) {
    const box = $('#root-piece-result');
    UI.show(box);
    if (d.fromLocal) {
      box.innerHTML = '<div><span class="rp-piece">' + UI.esc(d.piece) + '</span> —— ' + UI.esc(d.meaning) +
        ' <span class="sub">（本地词根库）</span></div>';
      return;
    }
    const alreadySaid = /不表意|不是词根|非词根/.test(d.meaning || '');
    box.innerHTML =
      '<div><span class="rp-piece">' + UI.esc(d.piece || '') + '</span> —— ' + UI.esc(d.meaning || '') +
      (!d.isRoot && !alreadySaid ? ' <span class="sub">（它本身不表意）</span>' : '') +
      (fromArchive ? ' <span class="sub">· 档案里的结论，不用再问 AI</span>' : '') +
      (d.mode === 'word' ? ' <span class="sub">· 结合本词</span>' : '') + '</div>' +
      (d.note ? '<div class="sub">' + UI.esc(d.note) + '</div>' : '') +
      (d.examples && d.examples.length ? '<div class="rp-ex">例词：' + d.examples.map(UI.esc).join('、') + '</div>' : '');
  },

  // mode: 'piece' = 只问这个片段本身的通用含义；'word' = 结合当前单词问它在这里的作用
  async queryPiece(mode) {
    const inWord = mode === 'word';
    const input = $('#root-piece-input');
    const piece = input.value.trim().toLowerCase().replace(/[^a-z-]/g, '');
    if (!piece) return UI.toast('先输入一个字母片段', true);
    const word = Practice.cur ? Practice.cur.item.w : '';
    if (inWord && !word) return UI.toast('现在没有正在练的单词，「结合本词问」用不了', true);
    input.value = piece;
    const box = $('#root-piece-result');
    UI.show(box);

    // 本地词根表和片段档案存的都是「片段的通用含义」，不是「在这个词里的作用」，
    // 所以只有「直接问」才走这两步缓存；「结合本词问」直接问 AI。
    if (!inWord) {
      // 1) 本地词根表精确命中：直接给，不花 token
      const hit = Roots.ROOT_BY_FORM[piece];
      if (hit) {
        Practice.renderPieceResult({ piece, isRoot: true, meaning: hit.m + '（' + Practice.typeName(hit.t) + '）', fromLocal: true }, false);
        return;
      }

      // 2) 片段档案里有（以前问过 AI）：直接复用，不再请求
      const archived = Roots.PieceArchive.get(piece);
      if (archived) {
        Practice.renderPieceResult(archived, true);
        return;
      }
    }

    // 3) 没配 AI：给本地库里的近似项
    if (!App.aiReady) {
      const near = Roots.ROOT_ENTRIES.filter(e => e.f.includes(piece) || piece.includes(e.f)).slice(0, 6);
      box.innerHTML = near.length
        ? '<div class="sub">未配置 AI，本地词根库中最接近的：</div>' +
          near.map(e => '<div class="rp-near"><b>' + UI.esc(e.f) + '</b> —— ' + UI.esc(e.m) + '</div>').join('')
        : '<div class="sub">未配置 AI，本地词根库也查不到这个片段。到「设置」填好 Key 就能让 AI 分析。</div>';
      return;
    }

    // 4) 问 AI
    box.innerHTML = '<span class="sub">' + (inWord ? 'AI 正在分析它在「' + UI.esc(word) + '」里的作用…' : 'AI 正在分析这个片段…') + '</span>';
    try {
      // 猜词义模式、且还没看答案时开启防剧透：只讲片段，不能把整词意思漏出来
      const needGuard = Practice.mode === 'meaning' && !Practice.revealed;
      const d = await Api.rootPiece(piece, word, needGuard, inWord ? 'word' : 'piece');
      // 「结合本词」的结论只对这一个词成立，不写进通用档案（否则会串到别的词）
      if (d && d.piece && !inWord) Roots.PieceArchive.put(d);
      Practice.renderPieceResult(d, !!d.cached && !inWord);
      Practice.renderRoots();                            // 词根行的灰块立刻变成"已收录"
      UI.toast(inWord ? ('拿到了「' + word + '」里 ' + piece + ' 的作用') : ('已收录片段 ' + piece + '，下次直接查看'));
      if (!inWord && typeof RootsView !== 'undefined' && RootsView.renderPieceArchive) RootsView.renderPieceArchive();
    } catch (e) {
      box.innerHTML = '<span class="sub">查询失败：' + UI.esc(e.message) + '</span>';
    }
  },

  // 拼写模式下判断"词根提示会不会直接给出答案"
  //  ① 整词就是一个词根（limit / sign / class / fund…）
  //  ② 只有一个有含义片段，却覆盖了大半单词（拼一拼就出来了）
  isRootSpoiler(word, parts) {
    if (!parts || !parts.length) return false;
    const known = parts.filter(p => p.type !== 'link' && p.meaning);
    if (!known.length) return false;
    const covered = known.reduce((n, p) => n + p.text.length, 0);
    if (known.length === 1 && known[0].text === word) return true;
    if (known.length === 1 && covered / word.length >= 0.6) return true;
    return false;
  },

  // 本地拆不出词根时，后台用 AI 补全（不阻塞）
  async maybeAiRoots(item) {
    if (!App.aiReady) return;
    if (!Store.progress.settings.rootsAuto) return;
    const local = Roots.splitWord(item.w);
    if (local.knownCount > 0) return;
    try {
      const data = await Api.roots(item.w, UI.meaningText(item));
      if (!Practice.cur || Practice.cur.item.w !== item.w) return;
      Practice.aiRoots = data;
      Practice.renderRoots();
      if (Store.progress.settings.rootsDisplay === 'always') UI.show($('#wc-roots'));
    } catch (e) { /* 补全失败不影响练习 */ }
  },

  // ---------- 提交 ----------
  // local = true：机械提交（不调 AI，用本地算法判定）
  async submit(local) {
    const cur = Practice.cur;
    if (!cur) return;
    const input = $('#answer');
    const text = input.value.trim();
    if (!text) { UI.toast('先写点什么吧', true); return; }
    if (Practice.revealed) { Practice.next(); return; }

    Practice.attempts += 1;
    input.value = '';
    const btn = local ? $('#btn-submit-local') : $('#btn-submit');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '判定中…';
    try {
      if (Practice.mode === 'meaning') await Practice.judgeMeaning(text, !!local);
      else await Practice.judgeSpell(text, !!local);
    } catch (e) {
      UI.toast(e.message || '判定失败', true);
    } finally {
      btn.disabled = false; btn.textContent = label;
      $('#answer').focus();
    }
  },

  // ---------- 模式一：猜词义 ----------
  async judgeMeaning(text, local) {
    const item = Practice.cur.item;
    const meanings = UI.meaningText(item);
    const rootsTxt = Roots.rootsText(item.w) || (Practice.aiRoots ? Practice.aiRoots.parts.map(p => p.text + '(' + p.meaning + ')').join(' + ') : '');
    const pool = item.tr.map(t => t.c).concat(meanings ? [meanings] : []);
    let res;
    if (!local && App.aiReady) {
      try {
        res = await Api.judgeMeaning({
          word: item.w,
          meaning: meanings,
          roots: rootsTxt,
          guess: text,
          attempt: Practice.attempts,
          history: Practice.guesses.map(g => g.text)
        });
      } catch (e) {
        if (e.noKey) { App.aiReady = false; App.refreshAiState(); }
        res = null;
      }
    }
    if (!res) {
      if (local) {
        // 机械提交：命中释义关键词 → 算对；否则字符重合度 ≥75 算对（完全不花 token）
        const j = LocalJudge.meaningPass(text, pool, 75);
        res = {
          score: j.score,
          correct: j.pass,
          comment: j.pass
            ? (j.how === 'keyword' ? '机械判定：命中了释义里的关键词，算你对了。' : '机械判定：与释义重合度约 ' + j.score + '%，算你对了。')
            : '机械判定：没对上任一义项（重合度约 ' + j.score + '%，需命中关键词或有 75% 以上重合）。它只比字面，近义写法可能误判 —— 拿不准就用「AI 提交」。',
          hint: '',
          by: 'mech'
        };
      } else {
        const score = LocalJudge.scoreMeaning(text, pool);
        res = {
          score,
          correct: score >= 85,
          comment: score >= 85 ? '本地估算：与释义高度重合，算你对了。' : '本地估算（未配置 AI）：你写的与正确释义的字符重合度约 ' + score + '%。',
          hint: '',
          by: 'local'
        };
      }
    }

    // 双保险：AI 有时会顺手把答案解释出来，这里再拦一道（未答对时不许剧透）
    if (!res.correct) {
      if (UI.leaksAnswer(res.comment, meanings)) {
        res.comment = '这个说法还不到位。为免剧透，点评已自动隐藏 —— 可以点「要提示」拿个线索。';
        res.cleaned = true;
      }
      if (res.hint && UI.leaksAnswer(res.hint, meanings)) res.hint = '';
    }

    Practice.guesses.push({ text, score: res.score, comment: res.comment });
    Practice.renderResult(res);
    Practice.renderHistory();

    if (res.correct) {
      Store.markAttempt(item.w, true);
      setTimeout(() => Practice.showWordCard(false), 700);
    } else {
      Store.markAttempt(item.w, false);
      Practice.maybeCostNotice();
    }
  },

  // 同一题猜了很多次还没中，提醒一下（每次猜测都会调一次 AI，是要花钱的）
  maybeCostNotice() {
    if (!Practice.attempts || Practice.attempts % 5 !== 0) return;
    setTimeout(() => UI.toast('你好像答了很多次哟，请仔细思考，token 很贵的！', true), 900);
  },

  renderResult(res) {
    const card = $('#result-card');
    UI.show(card);
    UI.show($('#score-row'));
    UI.hide($('#spell-tiles'));
    UI.hide($('#spell-result'));
    const v = UI.verdict(res.score);
    $('#rs-score').textContent = res.score;
    $('#rs-score').className = v.cls;
    $('#rs-bar').style.width = res.score + '%';
    $('#rs-verdict').innerHTML = '<span class="' + v.cls + '">' + v.text + '</span>' +
      (res.by === 'local' ? ' <span class="sub">（本地估算，配置 AI 后更准）</span>'
        : res.by === 'mech' ? ' <span class="sub">（机械判定，没花 token）</span>' : '');
    $('#rs-comment').textContent = res.comment || '';
    // 判定结果一律不带提示：想拿线索得自己点「要提示」，避免"答错就送答案"
    UI.hide($('#rs-hint'));
  },

  renderHistory() {
    const card = $('#history-card');
    if (!Practice.guesses.length) return UI.hide(card);
    UI.show(card);
    const list = Practice.guesses.slice().sort((a, b) => b.score - a.score);
    $('#history-list').innerHTML = list.map(g => {
      const cls = g.score >= 85 ? 'hot' : g.score >= 50 ? 'mid' : 'cold';
      return `<li>
        <span class="g-text">${UI.esc(g.text)}</span>
        <span class="g-bar"><i style="width:${g.score}%"></i></span>
        <span class="g-score ${cls}">${g.score}</span>
      </li>`;
    }).join('');
  },

  // ---------- 模式二：拼单词 ----------
  async judgeSpell(text, local) {
    const item = Practice.cur.item;
    const guess = text.toLowerCase().replace(/[^a-z-]/g, '');
    const answer = item.w;
    const tiles = LocalJudge.compareSpell(guess, answer);
    Practice.spelledTiles = tiles;

    // 字母级反馈（Wordle 风格）
    UI.show($('#result-card'));
    UI.hide($('#score-row'));
    const tileBox = $('#spell-tiles');
    tileBox.innerHTML = Array.from(guess).map((c, i) => {
      const cls = tiles[i] === 'green' ? 'green' : tiles[i] === 'yellow' ? 'yellow' : 'gray';
      return `<div class="tile ${cls}" style="animation-delay:${i * 40}ms">${UI.esc(c)}</div>`;
    }).join('');
    UI.show(tileBox);
    UI.show($('#spell-result'));

    const exact = guess === answer;
    let correct = exact, comment = '', tip = '';

    if (!exact && !local && App.aiReady) {
      try {
        const r = await Api.judgeSpell({ word: answer, spell: guess, meaning: UI.meaningText(item), roots: Roots.rootsText(answer) });
        correct = !!r.correct;
        comment = r.comment || '';
        tip = r.tip || '';
      } catch (e) {
        if (e.noKey) { App.aiReady = false; App.refreshAiState(); }
      }
    }
    if (!exact && !comment) {
      comment = LocalJudge.spellTip(guess, answer);
    }

    $('#sp-verdict').innerHTML = exact
      ? '<span class="hot">完全正确！</span>' + (local ? ' <span class="sub">（机械判定）</span>' : '')
      : '<span class="cold">还差一点</span> —— ' + UI.esc(comment) + (local ? ' <span class="sub">（机械判定，没走 AI）</span>' : '');
    $('#sp-comment').textContent = tip ? '提示：' + tip : '';

    Practice.guesses.push({ text: guess, score: exact ? 100 : Math.max(0, 100 - LocalJudge.editDistance(guess, answer) * 12), comment });

    if (correct) {
      Store.markAttempt(answer, true);
      setTimeout(() => Practice.showWordCard(false), 800);
    } else {
      Store.markAttempt(answer, false);
      Practice.hintLevel = Math.min(answer.length - 2, Practice.hintLevel + 1);
      Practice.render();
      Practice.maybeCostNotice();
    }
  },

  // ---------- 看例句（只在猜词义模式）----------
  // 三档：0 没看 → 1 只给英文 → 2 中英都给（给中文前必须确认，因为那等于报答案）
  async showExample() {
    const cur = Practice.cur;
    if (!cur || Practice.mode !== 'meaning') return;
    const item = cur.item;

    let sents = (item.sen || []).filter(s => s && s.e);
    if (!sents.length) {                       // 词库里没例句：让 AI 补（结果会存进资料库，只花一次）
      if (!App.aiReady) return UI.toast('这个词词库里没有例句；配好 AI Key 后可以让 AI 补一条', true);
      UI.toast('词库里没例句，AI 正在补…');
      try {
        const r = await Api.sentences(item.w, UI.meaningText(item));
        sents = (r.sentences || []).map(s => ({ e: s.e, c: s.c })).filter(s => s.e);
        if (sents.length) item.sen = sents;
      } catch (e) {
        return UI.toast('补例句失败：' + e.message, true);
      }
      if (!sents.length) return UI.toast('这个词暂时拿不到例句', true);
    }

    if (Practice.egLevel === 0) {
      // 已经看过答案的话就不用再藏了
      Practice.egLevel = Practice.revealed ? 2 : 1;
      if (!Practice.revealed) UI.toast('先给英文例句；想看中文，再点一次「看例句」');
    } else if (Practice.egLevel === 1) {
      if (!confirm('中文翻译相当于直接把答案说了，确定要看吗？\n\n建议先自己猜两次——这题的难度看完中文就没了。')) return;
      Practice.egLevel = 2;
    } else {
      return UI.toast('英文和中文都已经显示了');
    }
    Practice.renderExample(sents);
  },

  renderExample(sents) {
    const row = $('#wc-eg');
    if (!row) return;
    const lv = Practice.egLevel;
    row.innerHTML = sents.slice(0, 2).map(s =>
      '<div class="eg-item"><div class="eg-en">' + UI.esc(s.e) + '</div>' +
      (lv >= 2 && s.c ? '<div class="eg-cn">' + UI.esc(s.c) + '</div>' : '') +
      '</div>'
    ).join('') + (lv < 2 ? '<div class="eg-foot">还想看中文翻译？再点一次「看例句」</div>' : '');
    UI.show(row);
    Practice.syncEgButton();
  },

  syncEgButton() {
    const btn = $('#btn-eg');
    if (!btn) return;
    const meaning = Practice.mode === 'meaning';
    UI.toggle(btn, meaning);                    // 拼单词模式不给例句（会直接暴露拼写）
    if (!meaning) return;
    const lv = Practice.egLevel;
    btn.textContent = lv === 1 ? '看中文翻译' : '看例句';
    btn.classList.toggle('danger', lv === 1);
  },

  // ---------- 两级提示 ----------
  HINT_MAX: 2,

  async hint() {
    const cur = Practice.cur;
    if (!cur) return;
    if (Practice.mode === 'spell') {
      Practice.hintLevel = Math.min(cur.item.w.length, Practice.hintLevel + 1);
      Practice.render();
      UI.toast('已揭示 ' + Practice.hintLevel + ' 个字母');
      return;
    }
    const w = cur.item.w;

    // 两级都给过了：再点就把原来那两条重新摆出来（不会再问 AI，一分钱不花）
    if (Practice.hintLevel >= Practice.HINT_MAX) {
      Practice.renderHint();
      UI.toast('提示就这两条，再看一遍想想吧');
      return;
    }

    const nextLevel = Practice.hintLevel + 1;
    const saved = Roots.HintArchive.get(w);
    const cached = saved && saved.hints && saved.hints[nextLevel - 1];

    if (cached) {                     // 以前存过的提示直接用，不重复花钱
      Practice.hintLevel = nextLevel;
      Practice.renderHint();
      UI.toast('这条提示以前存过，直接给你');
      return;
    }

    if (!App.aiReady) {
      // 无 AI 时给一个本地提示：词根 + 长度 + 首字母
      UI.toast('词根：' + (Roots.rootsText(w) || '本地库暂未收录') + '｜长度 ' + w.length + '，首字母 ' + w[0]);
      return;
    }
    UI.toast('正在生成提示…');
    try {
      const data = await Api.hint({
        word: w,
        meaning: UI.meaningText(cur.item),
        roots: Roots.rootsText(w),
        history: Practice.guesses.map(g => g.text),
        level: nextLevel
      });
      const rec = Roots.HintArchive.get(w) || { hints: [] };
      rec.hints[nextLevel - 1] = data.hint || '';
      Roots.HintArchive.put(w, rec.hints);
      Practice.hintLevel = nextLevel;
      Practice.renderHint();
    } catch (e) {
      UI.toast(e.message || '提示生成失败', true);
    }
  },

  // 画出已拿到的提示（第一段「方向」+ 第二段「场景」）
  renderHint() {
    const w = Practice.cur && Practice.cur.item.w;
    if (!w) return;
    const rec = Roots.HintArchive.get(w);
    const hints = (rec && rec.hints) || [];
    const box = $('#rs-hint');
    const parts = [];
    for (let i = 0; i < Math.min(Practice.hintLevel, hints.length); i++) {
      if (!hints[i]) continue;
      parts.push('<div class="hint-line' + (i === 0 ? '' : ' lv2') + '"><b>' +
        (i === 0 ? '方向' : '场景') + '：</b>' + UI.esc(hints[i]) + '</div>');
    }
    if (!parts.length) { UI.hide(box); return; }
    UI.show($('#result-card'));
    UI.hide($('#score-row'));       // 提示不配评分：别让上一题残留的分数跟着露出来
    UI.hide($('#spell-tiles'));
    UI.hide($('#spell-result'));
    UI.show(box);
    box.innerHTML = parts.join('');
  },

  // ---------- 单词详情卡（答对 / 看答案后弹出）----------
  async showWordCard(gaveUp) {
    const cur = Practice.cur;
    if (!cur) return;
    Practice.revealed = true;
    const item = cur.item;

    UI.show($('#word-modal'));
    UI.hide($('#result-card'));
    // 「查看」模式（从词库 / 生词本 / 今日点开）：不给评分按钮，改用左上角关闭
    UI.toggle($('#wm-close'), Practice.lookupMode);
    UI.toggle($('#wm-rating'), !Practice.lookupMode);
    UI.toggle($('#wm-tip'), !Practice.lookupMode);
    // 这个词以前 AI 讲解过的话，直接从档案里读出来显示，不再花钱
    Practice.renderExplain(Roots.ExplainArchive.get(item.w));

    $('#wm-word').textContent = item.w;
    $('#wm-ph').textContent = item.ph ? '/' + item.ph + '/' : '';
    $('#wm-meaning').innerHTML = item.tr.map(t =>
      `<div><span class="pos">${UI.esc(t.p || '')}</span>${UI.esc(t.c)}</div>`).join('');

    Practice.renderAnswerRoots();
    Practice.updateStar();

    // 同根词 / 近义词 / 短语
    const blocks = [];
    if (item.rel && item.rel.length) {
      blocks.push('<div class="extra-block"><h4>同根词</h4>' +
        item.rel.map(r => `<div class="item"><b>${UI.esc(r.w)}</b> <i>${UI.esc(r.c)}</i></div>`).join('') + '</div>');
    }
    if (item.sy && item.sy.length) {
      blocks.push('<div class="extra-block"><h4>近义词</h4><div class="item">' + item.sy.map(UI.esc).join('、') + '</div></div>');
    }
    if (item.phr && item.phr.length) {
      blocks.push('<div class="extra-block"><h4>常用搭配</h4>' +
        item.phr.map(p => `<div class="item"><b>${UI.esc(p.e)}</b> <i>${UI.esc(p.c)}</i></div>`).join('') + '</div>');
    }
    $('#wm-extra').innerHTML = blocks.join('');

    Practice.fillSentences(item);        // 词库没例句就找 AI 补
    if (gaveUp) UI.toast('记住它，下次再来');
    Speech.speak(item.w);
    Practice.updateStrip();
  },

  // 例句：优先用词库里的，没有就找 AI 要（结果存进词根资料库）
  async fillSentences(item) {
    const box = $('#wm-sentences');
    const draw = list => list.filter(s => s.e).map(s =>
      `<div class="sen"><div class="en">${UI.esc(s.e)}</div><div class="cn">${UI.esc(s.c || '')}</div></div>`).join('');
    const local = (item.sen || []).filter(s => s.e);
    if (local.length) {
      box.innerHTML = '<h4>例句</h4>' + draw(local);
      return;
    }
    if (!App.aiReady) {
      box.innerHTML = '<h4>例句</h4><div class="sub">词库里没有例句（配置 AI 后可自动补充）</div>';
      return;
    }
    box.innerHTML = '<h4>例句</h4><div class="sub">正在获取例句…</div>';
    try {
      const d = await Api.sentences(item.w, UI.meaningText(item));
      if (!Practice.cur || Practice.cur.item.w !== item.w) return;   // 已经翻页了
      box.innerHTML = '<h4>例句</h4>' + (draw(d.sentences || []) || '<div class="sub">没拿到例句</div>');
    } catch (e) {
      box.innerHTML = '<h4>例句</h4><div class="sub">例句获取失败：' + UI.esc(e.message) + '</div>';
    }
  },

  // ---------- 生词本收藏 ----------
  toggleStar() {
    const w = Practice.cur.item.w;
    const on = Store.toggleStar(w);
    Practice.updateStar();
    UI.toast(on ? '已收藏到生词本：' + w : '已从生词本移除：' + w);
    if (typeof BooksView !== 'undefined') BooksView.refresh();
    if (typeof StarredView !== 'undefined') StarredView.render();
    if (typeof StatsView !== 'undefined') StatsView.render();
  },

  updateStar() {
    const on = Store.isStarred(Practice.cur.item.w);
    const btn = $('#wm-star');
    btn.textContent = on ? '★' : '☆';
    btn.classList.toggle('on', on);
    btn.title = on ? '已收藏进生词本（点击取消）' : '收藏进生词本';
  },

  // ---------- 从词库/生词本直接查看某个词的卡片（不推进练习队列）----------
  openLookup(word) {
    const item = Store.wordMap[word];
    if (!item) return UI.toast('「' + word + '」属于另一本词库，切到那本词库后就能看卡片', true);
    Practice._prevCur = Practice.cur;          // 记住练习里正在做的那题，关闭时恢复
    Practice.lookupMode = true;
    Practice.cur = { item, type: Store.isNew(word) ? 'new' : 'review' };
    Practice.guesses = [];
    Practice.attempts = 0;
    Practice.revealed = false;
    Practice.aiRoots = null;
    Practice.showWordCard(false);
  },

  // 关闭「查看」卡片：恢复练习里原来那道题的进度
  closeLookup() {
    UI.hide($('#word-modal'));
    Practice.lookupMode = false;
    Practice.cur = Practice._prevCur || null;
    Practice._prevCur = null;
    BooksView.render();
    if (typeof StarredView !== 'undefined') StarredView.render();
    if (typeof TodayView !== 'undefined') TodayView.render();
  },

  // ---------- 「已经很懂了」：跳过这题，加入牢记，并换一个新词进来 ----------
  knowIt() {
    const cur = Practice.cur;
    if (!cur) return;
    const w = cur.item.w;
    const added = Store.skipAsKnown(w);
    UI.toast('「' + w + '」已加入牢记' + (added ? '，换入新词 ' + added : '（这本词库已经学完）'));
    Practice.showCurrent();
  },

  // ---------- 三个复习按钮 ----------
  finishCard(act) {
    if (!Practice.cur) return;
    const w = Practice.cur.item.w;
    const lookup = Practice.lookupMode;        // 从词库/生词本点进来的，不能推进练习队列
    Store.rate(w, act, Practice.cur.type === 'new');
    UI.hide($('#word-modal'));
    const msg = act === 'know' ? ('「' + w + '」已标记牢记，不再出现')
      : act === 'again' ? ('「' + w + '」明天复习')
      : ('「' + w + '」3 天后复习');
    UI.toast(msg);
    if (lookup) {
      Practice.lookupMode = false;
      Practice.cur = Practice._prevCur || null;
      Practice._prevCur = null;
      BooksView.render();
      if (typeof StarredView !== 'undefined') StarredView.render();
      if (typeof TodayView !== 'undefined') TodayView.render();
      StatsView.render();
      return;
    }
    Practice.next();
  },

  // 详情卡里的词根区（本地库优先，AI 结果覆盖）
  renderAnswerRoots() {
    const item = Practice.cur.item;
    const local = Roots.splitWord(item.w);
    const ai = Practice.aiRoots || (Roots.ExplodeArchive ? Roots.ExplodeArchive.get(item.w) : null);
    const parts = (ai && ai.parts && ai.parts.length)
      ? ai.parts.map(p => ({ text: p.text, type: p.type, meaning: p.meaning }))
      : (local.knownCount ? local.parts : []);
    $('#wm-roots').innerHTML = parts.length
      ? UI.rootPieces(parts) +
        (ai && ai.story ? `<div class="sub" style="width:100%">助记：${UI.esc(ai.story)}</div>` : '') +
        (ai ? '<div class="sub" style="width:100%">（AI 拆解，已存进「词根库」）</div>' : '')
      : '<span class="sub">本地词根库没拆出来，可点「AI 拆词根」</span>';
  },

  async aiRootsManual() {
    if (!Practice.cur) return;
    if (!App.aiReady) return UI.toast('请先在设置里配置 API Key', true);
    const item = Practice.cur.item;
    UI.toast('AI 拆解中…');
    try {
      const data = await Api.roots(item.w, UI.meaningText(item));
      Practice.aiRoots = data;
      Roots.ExplodeArchive.put(item.w, data);       // 存进档案：跟着这个单词走
      Practice.renderAnswerRoots();
      Practice.renderRoots();
      if (typeof RootsView !== 'undefined' && RootsView.renderExplodeArchive) RootsView.renderExplodeArchive();
      UI.toast('已用 AI 拆解，并保存到「词根库」');
    } catch (e) { UI.toast(e.message || '拆解失败', true); }
  },

  // 练习中觉得词根拆得不对：让 AI 强制重拆，替换当前显示并保存（以后这个词都用它）
  async rerootByAI() {
    const cur = Practice.cur;
    if (!cur) return;
    if (!App.aiReady) return UI.toast('请先在「设置」里配置 API Key', true);
    const item = cur.item;
    const btn = $('#btn-ai-roots');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'AI 拆解中…';
    try {
      const data = await Api.roots(item.w, UI.meaningText(item), true);   // force：跳过旧缓存，重新拆
      if (!Practice.cur || Practice.cur.item.w !== item.w) return;
      Practice.aiRoots = data;
      Roots.ExplodeArchive.put(item.w, data);       // 存进档案：跟着这个单词走
      Practice.renderRoots();
      if (Store.progress.settings.rootsDisplay === 'always') UI.show($('#wc-roots'));
      if (typeof RootsView !== 'undefined' && RootsView.renderExplodeArchive) RootsView.renderExplodeArchive();
      UI.toast('已换成 AI 的拆解，并保存到「词根库」（以后「' + item.w + '」都用它）');
    } catch (e) {
      UI.toast(e.message || 'AI 拆解失败', true);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  },

  // 把一条讲解画进卡片（有缓存时直接调用，不请求 AI）
  renderExplain(d) {
    const box = $('#wm-ai');
    if (!d || (!d.memory && !d.usage && !d.confusable)) { UI.hide(box); return; }
    box.innerHTML =
      (d.memory ? `<div><b>助记：</b>${UI.esc(d.memory)}</div>` : '') +
      (d.usage ? `<div><b>用法：</b>${UI.esc(d.usage)}</div>` : '') +
      (d.confusable ? `<div><b>易混：</b>${UI.esc(d.confusable)}</div>` : '');
    UI.show(box);
  },

  async explain() {
    const item = Practice.cur.item;
    // 讲解过的词直接读档案，一分钱不花
    const cached = Roots.ExplainArchive.get(item.w);
    if (cached) { Practice.renderExplain(cached); UI.toast('这条讲解以前存过，直接给你'); return; }
    if (!App.aiReady) return UI.toast('请先在设置里配置 API Key', true);
    UI.toast('AI 讲解中…');
    try {
      const d = await Api.explain({ word: item.w, meaning: UI.meaningText(item), roots: Roots.rootsText(item.w) });
      Roots.ExplainArchive.put(item.w, d);
      Practice.renderExplain(d);
    } catch (e) {
      UI.toast(e.message || '讲解失败', true);
    }
  },



  updateStrip() {
    const s = Store.stats();
    $('#ps-new').textContent = s.todayNew;
    $('#ps-review').textContent = s.todayReview;
    $('#ps-due').textContent = s.due;
    $('#ps-mastered').textContent = s.mastered;
    const goal = s.goal || 15;
    const pct = Math.min(100, Math.round((s.todayNew / goal) * 100));
    $('#ps-bar-fill').style.width = pct + '%';

    // ---- 两阶段进度（先复习、后学新）----
    const q = Store.queue || [];
    const qi = Math.max(0, Math.min(Store.qi, q.length));
    const done = q.slice(0, qi);
    const rTotal = q.filter(x => x && x.type === 'review').length;
    const nTotal = q.filter(x => x && x.type === 'new').length;
    const rDone = done.filter(x => x && x.type === 'review').length;
    const nDone = done.filter(x => x && x.type === 'new').length;

    const stageEl = $('#ps-stage');
    if (stageEl) {
      if (!q.length) {
        stageEl.textContent = '';
      } else if (rTotal && rDone < rTotal) {
        stageEl.innerHTML = '复习阶段 <b>' + rDone + '/' + rTotal + '</b>' +
          (nTotal ? ' · 复习完还有 <b>' + nTotal + '</b> 个新词' : '');
      } else if (nTotal) {
        // 学习阶段用「今日新词进度 / 每日限额」，跟角标口径保持一致
        const limit = Store.dailyLimit();
        const curIsNew = !!(Practice.cur && Practice.cur.type === 'new');
        const nToday = (s.todayNew || 0) + (curIsNew ? 1 : 0);   // 不封顶，跟角标口径一致
        stageEl.innerHTML = (rTotal ? '<span class="hot">复习完成 ✓</span> · ' : '') +
          '学习阶段 <b>' + nToday + '/' + Math.max(limit, nToday) + '</b>';
      } else {
        stageEl.textContent = '';
      }
    }

    // ---- 到期词顺延提示（复习阶段每天有上限）----
    const blEl = $('#ps-backlog');
    if (blEl) {
      const rRemain = q.slice(qi).filter(x => x && x.type === 'review').length;
      const backlog = Math.max(0, (s.due || 0) - rRemain);
      if (backlog > 0) {
        blEl.textContent = '另有 ' + backlog + ' 个到期词今天排不下，顺延到明天';
        UI.show(blEl);
      } else {
        UI.hide(blEl);
      }
    }
  }
};
