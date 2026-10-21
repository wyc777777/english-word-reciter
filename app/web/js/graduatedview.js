// ==================== 牢记：被标记为「牢记」、不再进入队列的词 ====================
const GraduatedView = {
  init() { /* 列表动态渲染，无需预先绑定 */ },

  render() {
    const box = $('#grad-list');
    if (!box) return;

    const words = Store.words.filter(w => Store.isGraduated(w.w));

    const meta = $('#grad-meta');
    if (meta) meta.textContent = words.length ? '共 ' + words.length + ' 个' : '';

    box.innerHTML = words.length
      ? words.map(w => GraduatedView.itemHtml(w.w)).join('')
      : '<div class="sub" style="padding:22px;text-align:center">' +
        '还没有标记为「牢记」的词。<br>答对后弹出的单词卡里点「牢记」，这个词就会移到这里。';

    $$('#grad-list .wl-item').forEach(el => {
      el.addEventListener('click', () => Practice.openLookup(el.dataset.w));
    });
  },

  itemHtml(w) {
    const item = Store.wordMap[w];
    const star = Store.isStarred(w) ? '<span class="wl-star on" title="也在生词本里">★</span>' : '';
    return `<div class="wl-item" data-w="${UI.esc(w)}">
      ${star}<span class="w">${UI.esc(w)}</span>
      <span class="cn">${UI.esc(item ? UI.meaningText(item) : '')}</span>
      <span class="wl-badge mastered">牢记</span>
    </div>`;
  }
};
