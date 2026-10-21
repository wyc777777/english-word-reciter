// ==================== 设置 ====================
const Settings = {
  cfg: null,

  init() {
    $('#btn-cfg-save').addEventListener('click', () => Settings.saveCfg());
    $('#btn-cfg-test').addEventListener('click', () => Settings.testCfg());
    $('#btn-cfg-new').addEventListener('click', () => Settings.newProfile());
    $('#btn-cfg-new-ok').addEventListener('click', () => Settings.createProfile());
    $('#btn-cfg-new-cancel').addEventListener('click', () => UI.hide($('#cfg-new-row')));
    $('#cfg-new-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') Settings.createProfile();
      if (e.key === 'Escape') UI.hide($('#cfg-new-row'));
    });
    $('#btn-cfg-del').addEventListener('click', () => Settings.delProfile());
    $('#cfg-profiles').addEventListener('change', () => Settings.activate($('#cfg-profiles').value));
    $('#btn-set-save').addEventListener('click', () => Settings.saveStudy());
    const se = $('#set-spell-enabled');
    if (se) se.addEventListener('change', () => Settings.fillSpellField());
    ['meaning', 'spell'].forEach(m => {
      $('#set-book-' + m).addEventListener('change', async () => {
        await Store.setBook($('#set-book-' + m).value, m);
        Settings.fillBookSelects();
        BooksView.render(); RootsView.render(); StatsView.render();
        if (m === Practice.mode) Practice.showCurrent();
        UI.toast('已把「' + Practice.modeName(m) + '」切到该词库');
      });
    });
  },

  // 两个系统的词库下拉 + 练习页的词库下拉
  fillBookSelects() {
    const opts = Store.booksMeta.map(b => `<option value="${b.id}">${UI.esc(b.name)}（${b.count}）</option>`).join('');
    ['meaning', 'spell'].forEach(m => {
      const el = $('#set-book-' + m);
      if (el) { el.innerHTML = opts; el.value = Store.bookIdOf(m); }
    });
    const bs = $('#book-select');
    if (bs) { bs.innerHTML = opts; bs.value = Store.bookIdOf(Practice.mode); }
  },

  async load() {
    try {
      Settings.cfg = await Api.aiConfig();
    } catch (e) {
      Settings.cfg = { profiles: [], activeProfile: '', configured: false };
    }
    const sel = $('#cfg-profiles');
    sel.innerHTML = (Settings.cfg.profiles || []).map(p =>
      `<option value="${UI.esc(p.name)}" ${p.name === Settings.cfg.activeProfile ? 'selected' : ''}>${UI.esc(p.name)}${p.hasKey ? '' : '（无 Key）'}</option>`
    ).join('') || '<option value="">（尚无配置）</option>';
    $('#cfg-base').value = Settings.cfg.apiBaseUrl || '';
    $('#cfg-model').value = Settings.cfg.modelName || '';
    $('#cfg-key').value = '';
    $('#cfg-key').placeholder = Settings.cfg.maskedKey ? ('已保存：' + Settings.cfg.maskedKey + '（留空则不修改）') : 'sk-…';

    // 学习设置
    $('#set-daily').value = Store.progress.settings.dailyNew;
    Settings.fillSpellField();
    $('#set-roots').value = Store.progress.settings.rootsDisplay;
    $('#set-speak').checked = !!Store.progress.settings.autoSpeak;
    const ra = $('#set-roots-auto');
    if (ra) ra.checked = Store.progress.settings.rootsAuto !== false;
    Settings.fillBookSelects();
  },

  // 「拼单词」的开关与每日新词量：没开启时数量框置灰
  fillSpellField() {
    const se = $('#set-spell-enabled'), sd = $('#set-spell-daily');
    if (!se || !sd) return;
    se.checked = !!Store.progress.settings.spellEnabled;
    sd.value = Store.progress.settings.spellDailyNew || 10;
    sd.disabled = !se.checked;
  },

  async saveCfg() {
    try {
      await Api.saveAiConfig({
        apiBaseUrl: $('#cfg-base').value.trim(),
        modelName: $('#cfg-model').value.trim(),
        apiKey: $('#cfg-key').value.trim()
      });
      UI.toast('配置已保存到本机');
      await Settings.load();
      await App.refreshAi();
    } catch (e) { UI.toast('保存失败：' + e.message, true); }
  },

  async testCfg() {
    UI.toast('测试中…');
    try {
      // 先把界面上的值存下去再测，避免"测的是旧配置"
      const key = $('#cfg-key').value.trim();
      if (key && !/\*+/.test(key)) await Settings.saveCfg();
      const r = await Api.testConnection();
      UI.toast('连接成功（' + r.ms + 'ms）：' + (r.reply || 'OK'));
      await App.refreshAi();
    } catch (e) { UI.toast('连接失败：' + e.message, true); }
  },

  // 点「新建」：展开页面内的输入行（不能用 prompt —— Electron 不支持，点了会毫无反应）
  newProfile() {
    const row = $('#cfg-new-row');
    const input = $('#cfg-new-name');
    const n = (Settings.cfg && Settings.cfg.profiles ? Settings.cfg.profiles.length : 0) + 1;
    input.value = '配置 ' + n;          // 预填一个默认名，直接回车也能建
    UI.show(row);
    input.focus();
    input.select();
  },

  async createProfile() {
    const name = $('#cfg-new-name').value.trim();
    if (!name) return UI.toast('先给新配置起个名字', true);
    const exists = Settings.cfg && Settings.cfg.profiles && Settings.cfg.profiles.some(p => p.name === name);
    if (exists) return UI.toast('已经有一个叫「' + name + '」的配置了', true);
    try {
      await Api.newProfile({
        name: name,
        apiBaseUrl: $('#cfg-base').value.trim() || 'https://api.deepseek.com/v1',
        modelName: $('#cfg-model').value.trim() || 'deepseek-chat',
        apiKey: $('#cfg-key').value.trim()
      });
      UI.hide($('#cfg-new-row'));
      await Settings.load();
      await App.refreshAi();
      UI.toast('已创建并切换到「' + name + '」，填好 Key 后点「保存」');
    } catch (e) { UI.toast('创建失败：' + e.message, true); }
  },

  async delProfile() {
    const name = $('#cfg-profiles').value;
    if (!name) return;
    if (!confirm('删除配置「' + name + '」？')) return;
    try {
      await Api.delProfile(name);
      await Settings.load();
      await App.refreshAi();
      UI.toast('已删除');
    } catch (e) { UI.toast('删除失败：' + e.message, true); }
  },

  async activate(name) {
    try {
      await Api.activateProfile(name);
      await Settings.load();
      await App.refreshAi();
      UI.toast('已切换到「' + name + '」');
    } catch (e) { UI.toast('切换失败：' + e.message, true); }
  },

  saveStudy() {
    const s = Store.progress.settings;
    const cur = Practice.mode;
    const oldDaily = s.dailyNew;
    const oldSpellOn = !!s.spellEnabled;
    const oldSpellDaily = s.spellDailyNew;

    s.dailyNew = Math.max(5, Math.min(100, Number($('#set-daily').value) || 15));
    s.spellEnabled = !!$('#set-spell-enabled').checked;
    s.spellDailyNew = Math.max(5, Math.min(100, Number($('#set-spell-daily').value) || 10));
    s.rootsDisplay = $('#set-roots').value;
    s.autoSpeak = $('#set-speak').checked;
    const ra = $('#set-roots-auto');
    s.rootsAuto = ra ? ra.checked : true;
    Store.save();

    const turnedOff = oldSpellOn && !s.spellEnabled;
    const limitChanged = cur === 'spell'
      ? (s.spellDailyNew !== oldSpellDaily || s.spellEnabled !== oldSpellOn)
      : (s.dailyNew !== oldDaily);

    // 关掉拼单词：它的今日队列直接作废
    if (turnedOff) {
      Store.progress.modes.spell = null;
      if (cur === 'spell') { Store.queue = []; Store.qi = 0; Store.persistQueue(); }
    }

    // 注意：不能无条件重建队列 —— buildQueue() 会把指针归零并重新洗牌，
    // 等于把用户正在做的那道题扔掉。只有「当前系统的新词量」变化时才重排，
    // 而且要用 focusOn 把当前词放回当前指针位置。
    if (limitChanged || turnedOff) {
      const curW = Practice.cur && Practice.cur.item ? Practice.cur.item.w : null;
      const curT = Practice.cur ? Practice.cur.type : null;
      if (cur === 'spell' && !s.spellEnabled) {
        Practice.showCurrent();                 // 拼单词刚被关掉 → 显示空态
      } else {
        Store.buildQueue();
        if (curW) Store.focusOn(curW, curT);
        if (Practice.cur) Practice.render();    // 只重绘角标/进度条，不动答题状态
      }
      Practice.applyModeUI();
      if (typeof TodayView !== 'undefined') TodayView.render();
      UI.toast(turnedOff ? '已关闭「拼单词」'
        : '已保存：' + Practice.modeName(cur) + '的每日新词量改为 ' + Store.dailyLimit(cur) + '（当前这题不变）');
    } else {
      if (s.spellEnabled !== oldSpellOn) { Practice.applyModeUI(); if (typeof TodayView !== 'undefined') TodayView.render(); }
      Practice.applyRootsDisplay();             // 词根显示方式即时生效，不碰队列
      UI.toast('学习设置已保存（当前这题不变）');
    }
  }
};
