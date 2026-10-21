// ==================== 生词本（收藏的单词单独一页查看） ====================
const StarredView = {
  init() { /* 目前无需绑定，列表是动态渲染的 */ },

  // 词根小字：优先用 AI 拆解（跟着单词走），没有就用本地词根库
  rootLine(w) {
    const arc = (typeof Roots !== 'undefined' && Roots.ExplodeArchive) ? Roots.ExplodeArchive : null;
    const ai = arc ? arc.get(w) : null;
    if (ai && ai.parts && ai.parts.length) return ai.parts.map(p => p.text).join(' + ');
    const t = (typeof Roots !== 'undefined') ? Roots.rootsText(w) : '';
    return t ? t.replace(/\([^)]*\)/g, '') : '';
  },

  render() {
    const box = $('#starred-list');
    if (!box) return;
    const words = Store.starredWords();   // 已是「当前词库里有、且收藏了」的词，按收藏时间排序
    const meta = $('#starred-meta');
    if (meta) meta.textContent = words.length ? '共 ' + words.length + ' 个' : '';

    if (!words.length) {
      box.innerHTML = '<div class="sub" style="padding:22px;text-align:center">' +
        '生词本还是空的。<br>练习答完一题后，点单词卡右上角的 ☆ 就能收藏进来。</div>';
      return;
    }

    box.innerHTML = words.map(w => {
      const item = Store.wordMap[w];
      if (!item) {                       // 收藏跟随单词本身，词不在当前词库时也留着这一条
        return `<div class="wl-item other" data-w="${UI.esc(w)}">
          <span class="wl-star on">★</span><span class="w">${UI.esc(w)}</span>
          <span class="cn">（属于另一本词库）</span>
          <span class="wl-badge">其他词库</span>
        </div>`;
      }
      const s = Store.state(w);
      let badge = '<span class="wl-badge">未学</span>';
      if (s && s.grad) badge = '<span class="wl-badge mastered">牢记</span>';
      else if (s && s.s >= MASTER_STAGE) badge = '<span class="wl-badge mastered">已掌握</span>';
      else if (s && Store.isDue(w)) badge = '<span class="wl-badge due">待复习</span>';
      else if (s && s.seen > 0) badge = '<span class="wl-badge learning">学习中</span>';
      const split = StarredView.rootLine(w);
      return `<div class="wl-item" data-w="${UI.esc(w)}">
        <span class="wl-star on">★</span><span class="w">${UI.esc(w)}</span>
        <span class="cn">${UI.esc(item ? UI.meaningText(item) : '')}</span>
        ${split ? `<span class="cn" style="opacity:.75">词根：${UI.esc(split)}</span>` : ''}
        ${badge}
      </div>`;
    }).join('');

    $$('#starred-list .wl-item').forEach(el => {
      el.addEventListener('click', () => Practice.openLookup(el.dataset.w));
    });
  }
};
