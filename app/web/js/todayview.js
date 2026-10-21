// ==================== 今日：今天遇见的单词 + 待复习的单词 ====================
// 猜词义 / 拼单词 两套系统各看各的，用页面顶部的分页切换（只看数据，不改变当前练习的系统）
const TodayView = {
  mode: 'meaning',

  init() {
    $$('#today-mode-switch .today-tab').forEach(b => {
      b.addEventListener('click', () => {
        TodayView.mode = b.dataset.tmode;
        TodayView.render();
      });
    });
  },

  async render() {
    if (!$('#today-seen-list')) return;
    const m = TodayView.mode;
    $$('#today-mode-switch .today-tab').forEach(b => b.classList.toggle('active', b.dataset.tmode === m));

    const tip = $('#today-mode-tip');
    if (tip) tip.textContent = Store.modeEnabled(m) ? '' : '这个系统还没开启，去「设置」里打开';

    let words = [];
    try {
      words = await Store.wordsFor(m);
    } catch (e) {
      console.warn('今日页：读取词库失败', e);
    }
    const map = {};
    words.forEach(w => { map[w.w] = w; });

    // 今天遇见的（按遇到顺序，最近的排前面）
    const t = Store.today(m);
    const seen = (Array.isArray(t.words) ? t.words : []).slice().reverse();

    // 待复习（到期的）
    const due = words.filter(w => Store.isDue(w.w, m)).map(w => w.w);

    const metaSeen = $('#today-seen-meta');
    if (metaSeen) metaSeen.textContent = seen.length ? '共 ' + seen.length + ' 个' : '';
    $('#today-seen-list').innerHTML = seen.length
      ? seen.map(w => TodayView.itemHtml(w, map)).join('')
      : '<div class="sub" style="padding:22px;text-align:center">今天还没有练过' + TodayView.modeName(m) + '，去「练习」开始吧。</div>';

    const metaDue = $('#today-due-meta');
    if (metaDue) metaDue.textContent = due.length ? '共 ' + due.length + ' 个' : '';
    $('#today-due-list').innerHTML = due.length
      ? due.map(w => TodayView.itemHtml(w, map)).join('')
      : '<div class="sub" style="padding:22px;text-align:center">暂时没有到期的复习词。</div>';

    $$('#view-today .wl-item').forEach(el => {
      el.addEventListener('click', () => {
        const w = el.dataset.w;
        if (!Store.wordMap[w]) return UI.toast('这个词不在当前系统的词库里，先在练习里切到「' + TodayView.modeName(m) + '」再看', true);
        Practice.openLookup(w);
      });
    });
  },

  modeName(m) { return m === 'spell' ? '拼单词' : '猜词义'; },

  itemHtml(w, map) {
    const item = (map || Store.wordMap)[w];
    const s = Store.state(w, TodayView.mode);
    let badge = '<span class="wl-badge">未学</span>';
    if (s && s.grad) badge = '<span class="wl-badge mastered">牢记</span>';
    else if (s && s.s >= MASTER_STAGE) badge = '<span class="wl-badge mastered">已掌握</span>';
    else if (s && Store.isDue(w, TodayView.mode)) badge = '<span class="wl-badge due">待复习</span>';
    else if (s && s.seen > 0) badge = '<span class="wl-badge learning">学习中</span>';
    const star = Store.isStarred(w) ? '<span class="wl-star on">★</span>' : '';
    return `<div class="wl-item" data-w="${UI.esc(w)}">
      ${star}<span class="w">${UI.esc(w)}</span>
      <span class="cn">${UI.esc(item ? UI.meaningText(item) : '')}</span>
      ${badge}
    </div>`;
  }
};
