// ==================== 词根本 ====================
// 三个区块（词根表 / 查过的片段 / AI 拆过的单词）都是：固定高度滚动框 + 滚到底自动加载 + 各自搜索
const RootsView = {
  pageSize: 60,
  filtered: [],
  st: {
    roots:   { page: 0, q: '', total: 0 },
    piece:   { page: 0, q: '', total: 0 },
    explode: { page: 0, q: '', total: 0 }
  },

  init() {
    $('#root-search').addEventListener('input', debounce(() => { RootsView.st.roots.page = 0; RootsView.refresh(); }, 200));
    $('#root-type').addEventListener('change', () => { RootsView.st.roots.page = 0; RootsView.refresh(); });
    $('#btn-root-more').addEventListener('click', () => { RootsView.st.roots.page += 1; RootsView.renderGrid(true); });
    $('#btn-root-close').addEventListener('click', () => UI.hide($('#root-detail')));
    $('#btn-piece-export').addEventListener('click', () => RootsView.exportPieces());
    $('#btn-piece-import').addEventListener('click', () => $('#piece-import-file').click());
    $('#piece-import-file').addEventListener('change', e => RootsView.importPieces(e));

    const ps = $('#piece-search');
    if (ps) ps.addEventListener('input', debounce(() => { RootsView.st.piece.page = 0; RootsView.renderPieceArchive(); }, 200));
    const es = $('#explode-search');
    if (es) es.addEventListener('input', debounce(() => { RootsView.st.explode.page = 0; RootsView.renderExplodeArchive(); }, 200));
  },

  typeName(t) {
    if (t === 'p' || t === 'prefix') return '前缀';
    if (t === 's' || t === 'suffix') return '后缀';
    if (t === 'r' || t === 'root') return '词根';
    return '';
  },

  render() {
    RootsView.st.roots.page = 0;
    RootsView.refresh();
    RootsView.renderPieceArchive();
    RootsView.renderExplodeArchive();
  },

  // ---------- 公共：滚到底自动加载下一批 ----------
  bindInfinite(el, key) {
    if (!el || el.dataset.infBound === '1') return;
    el.dataset.infBound = '1';
    el.addEventListener('scroll', () => {
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 90) return;
      const st = RootsView.st[key];
      if (!st || (st.page + 1) * RootsView.pageSize >= st.total) return;
      st.page += 1;
      if (key === 'roots') RootsView.renderGrid(true);
      else if (key === 'piece') RootsView.renderPieceArchive(true);
      else if (key === 'explode') RootsView.renderExplodeArchive(true);
    });
  },

  // ---------- 区块一：词根表 ----------
  refresh() {
    const q = $('#root-search').value.trim().toLowerCase();
    const type = $('#root-type').value;
    const st = RootsView.st.roots;
    st.q = q;
    RootsView.filtered = Roots.ROOT_ENTRIES.filter(e => {
      if (type !== 'all' && e.t !== type) return false;
      if (!q) return true;
      return e.f.includes(q) || (e.m || '').toLowerCase().includes(q);
    });
    st.total = RootsView.filtered.length;
    RootsView.renderGrid(false);
    UI.hide($('#root-detail'));
  },

  renderGrid(append) {
    const grid = $('#root-grid');
    if (!grid) return;
    const st = RootsView.st.roots;
    if (!append) st.page = 0;
    const shown = RootsView.filtered.slice(0, (st.page + 1) * RootsView.pageSize);
    grid.innerHTML = shown.length
      ? shown.map(e => `
        <div class="root-cell" data-f="${UI.esc(e.f)}">
          <span class="t">${RootsView.typeName(e.t)}${e.ai ? ' · AI' : ''}</span>
          <div class="f">${UI.esc(e.f)}</div>
          <div class="m">${UI.esc(e.m)}</div>
        </div>`).join('')
      : '<div class="sub">没有匹配的词根</div>';

    $$('#root-grid .root-cell').forEach(el => {
      el.addEventListener('click', () => RootsView.showDetail(el.dataset.f));
    });
    $('#btn-root-more').classList.toggle('hidden', shown.length >= RootsView.filtered.length);
    RootsView.bindInfinite(grid, 'roots');
  },

  showDetail(form) {
    const entry = Roots.ROOT_BY_FORM[form];
    if (!entry) return;
    const words = Roots.findCognates(Store.words, form, 24);
    const notes = (typeof Roots.ExplodeArchive !== 'undefined') ? Roots.ExplodeArchive.aiRootNotes(form) : [];

    $('#rd-title').innerHTML = UI.esc(form) + ' <span class="sub">' + UI.esc(entry.m) + ' · ' + RootsView.typeName(entry.t) + '</span>';

    // 同一个词根可能来自不同词源 / 在不同单词里含义不同 —— 把 AI 观察到的都列出来，供人自己判断
    const notesHtml = notes.length > 1
      ? '<div class="extra-block" style="grid-column:1/-1"><h4>AI 在不同单词里看到的含义</h4>' +
        notes.slice(0, 10).map(n =>
          '<div class="item">' + UI.esc(n.m) + (n.w ? ' <span class="sub">（来自 ' + UI.esc(n.w) + '）</span>' : '') + '</div>'
        ).join('') +
        '<div class="sub">同一个字母组合可能有不同来源，含义会随单词变化；练习时以单词卡里那条拆解为准。</div></div>'
      : '';

    $('#rd-body').innerHTML = notesHtml + (words.length
      ? words.map(w => `<div class="rd-word"><b>${UI.esc(w.w)}</b><span>${UI.esc(UI.meaningText(w))}</span></div>`).join('')
      : '<div class="sub">当前词库里没有明显同源词</div>');

    UI.show($('#root-detail'));
    $('#root-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // ---------- 区块二：我查过的片段 ----------
  renderPieceArchive(append) {
    const grid = $('#piece-grid');
    if (!grid) return;
    const st = RootsView.st.piece;
    const q = ($('#piece-search') ? $('#piece-search').value : '').trim().toLowerCase();
    st.q = q;
    if (!append) st.page = 0;

    const all = Roots.PieceArchive.all().filter(e =>
      !q || (e.piece || '').includes(q) || String(e.meaning || '').toLowerCase().includes(q));
    st.total = all.length;

    const cnt = $('#piece-count');
    if (cnt) cnt.textContent = all.length ? '共 ' + all.length + ' 个' : '';

    const shown = all.slice(0, (st.page + 1) * RootsView.pageSize);
    grid.innerHTML = shown.length
      ? shown.map(e => `<div class="root-cell piece-cell" data-piece="${UI.esc(e.piece)}">
          <div class="f">${UI.esc(e.piece)}</div>
          <div class="m">${UI.esc(String(e.meaning || '').slice(0, 24))}</div>
        </div>`).join('')
      : '<div class="sub">' + (q ? '没搜到匹配的片段' :
          '还没有查过片段。练习时点词根行里的灰色片段（标着「点我问 AI」的那种），AI 的结论会自动存到这里。') + '</div>';

    $$('#piece-grid .piece-cell').forEach(el => {
      el.addEventListener('click', () => RootsView.showPiece(el.dataset.piece));
    });
    RootsView.bindInfinite(grid, 'piece');
  },

  showPiece(piece) {
    const e = Roots.PieceArchive.get(piece);
    if (!e) return;
    $('#rd-title').innerHTML = UI.esc(piece) + ' <span class="sub">我查过的片段</span>';
    $('#rd-body').innerHTML =
      '<div class="extra-block" style="grid-column:1/-1"><h4>最相近的含义</h4>' +
      '<div class="item">' + UI.esc(e.meaning || '') + '</div>' +
      (e.note ? '<div class="item"><i>' + UI.esc(e.note) + '</i></div>' : '') +
      (e.examples && e.examples.length ? '<div class="item">例词：' + e.examples.map(UI.esc).join('、') + '</div>' : '') +
      '</div>';
    UI.show($('#root-detail'));
    $('#root-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // ---------- 区块三：AI 拆过的单词 ----------
  renderExplodeArchive(append) {
    const grid = $('#explode-grid');
    if (!grid) return;
    const st = RootsView.st.explode;
    const q = ($('#explode-search') ? $('#explode-search').value : '').trim().toLowerCase();
    st.q = q;
    if (!append) st.page = 0;

    const arc = (typeof Roots.ExplodeArchive !== 'undefined') ? Roots.ExplodeArchive : null;
    const all = (arc ? arc.all() : []).filter(e => {
      if (!q) return true;
      if ((e.word || '').includes(q)) return true;
      return (e.parts || []).some(p => String(p.text || '').toLowerCase().includes(q) ||
        String(p.meaning || '').toLowerCase().includes(q));
    });
    st.total = all.length;

    const cnt = $('#explode-count');
    if (cnt) {
      const dyn = arc ? arc.dynamicRoots().length : 0;
      cnt.textContent = all.length ? ('共 ' + all.length + ' 个' + (!q && dyn ? ' · 顺带学到 ' + dyn + ' 个新词根' : '')) : '';
    }

    const shown = all.slice(0, (st.page + 1) * RootsView.pageSize);
    grid.innerHTML = shown.length
      ? shown.map(e => `<div class="root-cell explode-cell" data-word="${UI.esc(e.word)}">
          <div class="f">${UI.esc(e.word)}</div>
          <div class="m">${UI.esc((e.parts || []).map(p => p.text).join(' + ').slice(0, 26))}</div>
        </div>`).join('')
      : '<div class="sub">' + (q ? '没搜到匹配的单词' :
          '还没有。练习时点卡片顶部的「AI 重拆词根」，结果会自动存到这里、跟这个单词绑定。') + '</div>';

    $$('#explode-grid .explode-cell').forEach(el => {
      el.addEventListener('click', () => RootsView.showExplode(el.dataset.word));
    });
    RootsView.bindInfinite(grid, 'explode');
  },

  showExplode(word) {
    const arc = (typeof Roots.ExplodeArchive !== 'undefined') ? Roots.ExplodeArchive : null;
    const e = arc ? arc.get(word) : null;
    if (!e) return;
    const parts = (e.parts || []).map(p =>
      '<span class="root-piece">' + UI.esc(p.text) + (p.meaning ? '<small>' + UI.esc(p.meaning) + '</small>' : '') + '</span>'
    ).join(' + ');
    $('#rd-title').innerHTML = UI.esc(word) + ' <span class="sub">AI 拆解</span>';
    $('#rd-body').innerHTML =
      '<div class="extra-block" style="grid-column:1/-1"><h4>拆解</h4><div class="item">' + parts + '</div>' +
      (e.core ? '<div class="item">核心：' + UI.esc(e.core) + '</div>' : '') +
      (e.story ? '<div class="item"><i>' + UI.esc(e.story) + '</i></div>' : '') +
      (e.cognates && e.cognates.length ? '<div class="item">同根词：' + e.cognates.map(UI.esc).join('、') + '</div>' : '') +
      '</div>';
    UI.show($('#root-detail'));
    $('#root-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // ---------- 导出 / 导入「跟随单词的知识数据」 ----------
  // 片段 + AI 讲解 + 例句 + AI 拆解；不含个人进度 / 生词本 / 配置
  async exportPieces() {
    try {
      const lib = await Api.rootsLibrary();
      const KINDS = [
        ['piece:', '片段', v => v && v.meaning],
        ['explain:', '讲解', v => v && (v.memory || v.usage || v.confusable)],
        ['sent:', '例句', v => v && Array.isArray(v.sentences) && v.sentences.length],
        ['roots:', '拆解', v => v && Array.isArray(v.parts) && v.parts.length],
        ['hint:', '提示', v => v && Array.isArray(v.hints) && v.hints.some(Boolean)]
      ];
      const items = {};
      const tally = { 片段: 0, 讲解: 0, 例句: 0, 拆解: 0, 提示: 0 };
      Object.keys(lib || {}).forEach(k => {
        const hit = KINDS.find(x => k.indexOf(x[0]) === 0);
        if (!hit || !hit[2](lib[k])) return;
        items[k] = lib[k];
        tally[hit[1]]++;
      });
      const n = Object.keys(items).length;
      if (!n) return UI.toast('还没有可以导出的资料', true);
      const pack = {
        type: 'word-roots-pack',
        version: 2,
        exportedAt: new Date().toISOString(),
        count: n,
        tally,
        items
      };
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'word-roots-pack-' + Store.todayKey() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast('已导出 ' + n + ' 条：片段 ' + tally['片段'] + ' · 讲解 ' + tally['讲解'] +
        ' · 例句 ' + tally['例句'] + ' · 拆解 ' + tally['拆解'] + ' · 提示 ' + tally['提示']);
    } catch (e) { UI.toast('导出失败：' + e.message, true); }
  },

  importPieces(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let data = JSON.parse(reader.result);
        const items = (data && data.items) ? data.items : data;
        const r = await Api.rootsLibraryImport(items);
        const lib = await Api.rootsLibrary();                // 重新载入前端档案
        Roots.PieceArchive.load(lib);
        Roots.ExplainArchive.load(lib);
        Roots.HintArchive.load(lib);
        Roots.ExplodeArchive.load(lib);                      // AI 拆解一起载入
        RootsView.renderPieceArchive();
        RootsView.renderExplodeArchive();
        UI.toast('导入完成：新增 ' + r.added + ' 条' + (r.kept ? '，本地已有保留 ' + r.kept + ' 条' : ''));
      } catch (err) {
        UI.toast('导入失败：' + err.message, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
};
