// ==================== 词库浏览 ====================
const BooksView = {
  page: 0,
  pageSize: 60,
  filtered: [],

  init() {
    $('#word-search').addEventListener('input', debounce(() => BooksView.refresh(), 220));
    $('#word-filter').addEventListener('change', () => BooksView.refresh());
    $('#btn-load-more').addEventListener('click', () => { BooksView.page += 1; BooksView.renderList(true); });
  },

  render() {
    const grid = $('#book-grid');
    grid.innerHTML = Store.booksMeta.map(b => `
      <div class="book-item ${b.id === Store.bookIdOf(Practice.mode) ? 'active' : ''}" data-id="${b.id}">
        <h4>${UI.esc(b.name)}</h4>
        <div class="meta">${b.count} 词 · ${UI.esc(b.desc || b.tag || '')}</div>
      </div>`).join('');
    $$('#book-grid .book-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        if (id === Store.bookIdOf(Practice.mode)) return;
        await Store.setBook(id, Practice.mode);
        Settings.fillBookSelects();
        BooksView.render();
        RootsView.render();
        StatsView.render();
        Practice.showCurrent();
        UI.toast('已把「' + Practice.modeName() + '」切到《' + Store.booksMeta.find(b => b.id === id).name + '》');
      });
    });
    $('#books-meta').textContent = '共 ' + Store.booksMeta.length + ' 本 · 当前词库 ' + Store.words.length +
      ' 词 · 生词本 ' + Store.starCount() + ' 词';
    BooksView.refresh();
  },

  refresh() {
    BooksView.page = 0;
    const q = $('#word-search').value.trim().toLowerCase();
    const f = $('#word-filter').value;
    BooksView.filtered = Store.words.filter(w => {
      if (q) {
        const inWord = w.w.includes(q);
        const inCn = (w.tr || []).some(t => (t.c || '').toLowerCase().includes(q));
        if (!inWord && !inCn) return false;
      }
      if (f === 'new') return Store.isNew(w.w);
      if (f === 'learning') { const s = Store.state(w.w); return s && s.seen > 0 && s.s < MASTER_STAGE; }
      if (f === 'mastered') return Store.isMastered(w.w);
      if (f === 'due') return Store.isDue(w.w);
      if (f === 'star') return Store.isStarred(w.w);
      return true;
    });
    BooksView.renderList(false);
  },

  renderList(append) {
    const list = $('#word-list');
    const slice = BooksView.filtered.slice(0, (BooksView.page + 1) * BooksView.pageSize);
    const html = slice.map(w => {
      const s = Store.state(w.w);
      let badge = '<span class="wl-badge">未学</span>';
      if (s && s.seen > 0) {
        if (s.s >= MASTER_STAGE) badge = '<span class="wl-badge mastered">已掌握</span>';
        else if (Store.isDue(w.w)) badge = '<span class="wl-badge due">待复习</span>';
        else badge = '<span class="wl-badge learning">学习中</span>';
      }
      const star = Store.isStarred(w.w) ? '<span class="wl-star" title="已在生词本">★</span>' : '';
      return `<div class="wl-item" data-w="${UI.esc(w.w)}">
        ${star}<span class="w">${UI.esc(w.w)}</span>
        <span class="cn">${UI.esc(UI.meaningText(w))}</span>
        ${badge}
      </div>`;
    }).join('');
    list.innerHTML = html || '<div class="sub" style="padding:20px;text-align:center">没有匹配的单词</div>';
    $$('#word-list .wl-item').forEach(el => {
      el.addEventListener('click', () => {
        Practice.openLookup(el.dataset.w);   // 点单词直接看卡片，不再跳去练习
      });
    });
    $('#btn-load-more').classList.toggle('hidden', slice.length >= BooksView.filtered.length);
  }
};

function debounce(fn, ms) {
  let t;
  return function () {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, arguments), ms);
  };
}
