// ==================== 统计与数据管理 ====================
function pad2(n) { return (n < 10 ? '0' : '') + n; }

// 统计按当前系统（猜词义 / 拼单词）分别查看，数据互不影响
const StatsView = {
  init() {
    $('#btn-export').addEventListener('click', () => StatsView.exportData());
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', e => StatsView.importData(e));
    $('#btn-reset-book').addEventListener('click', () => StatsView.reset());
    $$('#stats-mode-switch .mode-btn').forEach(b => {
      b.addEventListener('click', async () => {
        await Practice.setMode(b.dataset.smode);
        StatsView.render();
      });
    });
  },

  reset() {
    const bm = (Store.booksMeta.find(b => b.id === Store.bookIdOf('meaning')) || {}).name || '';
    const bs = (Store.booksMeta.find(b => b.id === Store.bookIdOf('spell')) || {}).name || '';
    if (!confirm('确定重置吗？会同时清空两套系统：\n\n· 猜词义（《' + bm + '》）\n· 拼单词（《' + bs + '》）\n\n两边的学习进度和今日进度都会归零，无法恢复。')) return;
    Store.resetAll();
    StatsView.render();
    BooksView.render();
    RootsView.render();
    Practice.showCurrent();
    UI.toast('已重置两套系统的进度');
  },

  render() {
    const s = Store.stats();
    const bookName = (Store.booksMeta.find(b => b.id === Store.bookIdOf(Practice.mode)) || {}).name || '';
    $$('#stats-mode-switch .mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.smode === Practice.mode);
      b.classList.toggle('off', !Store.modeEnabled(b.dataset.smode));
    });
    const tip = $('#stats-scope-tip');
    if (tip) {
      tip.innerHTML = '当前查看：<b>' + UI.esc(Practice.modeName()) + '</b> 系统 · 词库《' + UI.esc(bookName) + '》' +
        '，今日还剩 ' + Math.max(0, s.queueLeft) + ' 个词在队列里。两个系统各练各的，互不干扰。';
    }

    const cells = [
      ['已掌握', s.mastered],
      ['学习中', s.learning],
      ['未学', s.untouched],
      ['待复习', s.due],
      ['今日新词', s.todayNew + '/' + s.goal],
      ['今日正确率', s.accuracy + '%'],
      ['生词本', s.starred],
      ['连续天数', Store.streak()],
      ['词库总量', s.total]
    ];
    $('#stat-grid').innerHTML = cells.map(c => `<div class="stat-cell"><b>${c[1]}</b><small>${c[0]}</small></div>`).join('');

    const total = Math.max(1, s.total);
    $('#m-mastered').style.width = (s.mastered / total * 100) + '%';
    $('#m-learning').style.width = (s.learning / total * 100) + '%';
    $('#lg-mastered').textContent = s.mastered;
    $('#lg-learning').textContent = s.learning;
    $('#lg-new').textContent = s.untouched;

    // 最近 14 天（只统计当前这个系统）
    const days = [];
    const d = new Date();
    d.setDate(d.getDate() - 13);
    for (let i = 0; i < 14; i++) {
      const k = Store.todayKey(d);
      const rec = (Store.progress.daily[k] || {})[Practice.mode] || { new: 0, review: 0 };
      days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), v: (rec.new || 0) + (rec.review || 0) });
      d.setDate(d.getDate() + 1);
    }
    const max = Math.max(1, ...days.map(x => x.v));
    $('#day-chart').innerHTML = days.map(x => `
      <div class="day-col" title="${x.v} 词">
        <i style="height:${Math.max(3, (x.v / max) * 92)}%"></i>
        <span>${x.label}</span>
      </div>`).join('');
    const sub = $('#day-chart-sub');
    if (sub) sub.textContent = '最近 14 天 · ' + Practice.modeName() + '系统';

    StatsView.renderSaves();
  },

  // ---------- 存档系统（3 个槽位）----------
  async renderSaves() {
    const box = $('#save-slots');
    if (!box) return;
    let d;
    try {
      d = await Api.saves();
    } catch (e) {
      box.innerHTML = '<div class="sub">存档读取失败：' + UI.esc(e.message) + '</div>';
      return;
    }
    box.innerHTML = d.slots.map(s => {
      if (s.empty) {
        return `<div class="save-slot empty">
          <h5>槽位 ${s.slot}</h5>
          <div class="meta">空存档</div>
          <div class="acts"><button class="ghost small" data-save="${s.slot}">存档到此</button></div>
        </div>`;
      }
      const t = new Date(s.time);
      const when = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) +
        ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
      const m = s.summary || {};
      return `<div class="save-slot">
        <h5>槽位 ${s.slot} · ${UI.esc(s.name || '')}</h5>
        <div class="meta">${when}<br>学过 ${m.seen || 0} 词 · 掌握 ${m.mastered || 0} · 牢记 ${m.graduated || 0} · 收藏 ${m.stars || 0}</div>
        <div class="acts">
          <button class="ghost small" data-load="${s.slot}">读档</button>
          <button class="ghost small" data-save="${s.slot}">覆盖</button>
          <button class="ghost small danger" data-del="${s.slot}">删除</button>
        </div>
      </div>`;
    }).join('');
    $$('#save-slots button[data-save]').forEach(b => b.addEventListener('click', () => StatsView.doSave(b.dataset.save)));
    $$('#save-slots button[data-load]').forEach(b => b.addEventListener('click', () => StatsView.doLoad(b.dataset.load)));
    $$('#save-slots button[data-del]').forEach(b => b.addEventListener('click', () => StatsView.doDel(b.dataset.del)));
  },

  async doSave(slot) {
    if (!confirm('把当前进度存档到槽位 ' + slot + '？\n（如果槽位里已有存档会被覆盖）')) return;
    try {
      Store.flush();
      await Api.saveTo(slot, Store.progress, '存档 ' + slot);
      UI.toast('已存档到槽位 ' + slot);
      StatsView.renderSaves();
    } catch (e) { UI.toast('存档失败：' + e.message, true); }
  },

  async doLoad(slot) {
    if (!confirm('读取槽位 ' + slot + ' 的存档？\n当前进度会被覆盖 —— 想保住现在的进度，先存到别的槽位。')) return;
    try {
      const d = await Api.loadSave(slot);
      Store.replaceAll(JSON.parse(JSON.stringify(d.progress)));
      await Store.saveNow();      // 先落盘，否则 Store.init() 会读回旧进度
      await Store.init();
      Practice.mode = Store.mode;
      Practice.applyModeUI();
      Settings.fillBookSelects();
      BooksView.render();
      RootsView.render();
      StatsView.render();
      Practice.showCurrent();
      UI.toast('已读取存档：' + (d.name || ('槽位 ' + slot)));
    } catch (e) { UI.toast('读档失败：' + e.message, true); }
  },

  async doDel(slot) {
    if (!confirm('删除槽位 ' + slot + ' 的存档？删了就找不回来了。')) return;
    try {
      await Api.delSave(slot);
      UI.toast('已删除槽位 ' + slot + ' 的存档');
      StatsView.renderSaves();
    } catch (e) { UI.toast('删除失败：' + e.message, true); }
  },

  exportData() {
    const blob = new Blob([JSON.stringify(Store.progress, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'word-progress-' + Store.todayKey() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    UI.toast('已导出进度文件（含两个系统）');
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        Store.replaceAll(JSON.parse(reader.result));
        await Store.init();                 // 用导入的数据重建两个系统的队列
        Practice.mode = Store.mode;
        Practice.applyModeUI();
        Settings.fillBookSelects();
        StatsView.render();
        BooksView.render();
        Practice.showCurrent();
        UI.toast('导入成功');
      } catch (err) {
        UI.toast('导入失败：' + err.message, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
};
