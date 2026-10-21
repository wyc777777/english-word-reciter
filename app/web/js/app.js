// ==================== 启动与全局 ====================
const App = {
  aiReady: false,

  async boot() {
    try {
      await Store.init();
    } catch (e) {
      document.querySelector('main').innerHTML =
        '<div class="card"><h3>启动失败</h3><p class="tip">' + UI.esc(e.message) + '</p></div>';
      return;
    }

    Settings.init();
    Practice.init();
    BooksView.init();
    RootsView.init();
    StatsView.init();
    StarredView.init();
    TodayView.init();
    GraduatedView.init();

    await Settings.load();
    BooksView.render();
    RootsView.render();
    StatsView.render();

    // 载入「查过的片段」档案（AI 解答过的片段，跨会话/跨浏览器复用）
    try {
      const lib = await Api.rootsLibrary();
      Roots.PieceArchive.load(lib);
      Roots.ExplainArchive.load(lib);       // AI 讲解也一起载入，打开卡片直接显示
      Roots.HintArchive.load(lib);          // 提示也一起载入，点「要提示」优先用存过的
      Roots.ExplodeArchive.load(lib);       // AI 拆解也载入：换题 / 重启后依然能看到，并学会里面的新词根
    } catch (e) { /* 没资料库也能玩 */ }

    Practice.mode = Store.mode;
    Practice.applyModeUI();
    Practice.showCurrent();

    bindTabs();
    $('#book-select').addEventListener('change', async e => {
      await Store.setBook(e.target.value, Practice.mode);
      Settings.fillBookSelects();
      BooksView.render(); RootsView.render(); StatsView.render();
      Practice.showCurrent();
      UI.toast('已把「' + Practice.modeName() + '」切到该词库');
    });
    $('#btn-settings-quick').addEventListener('click', () => switchView('settings'));
    $('#ai-state').addEventListener('click', () => switchView('settings'));

    window.addEventListener('beforeunload', () => Store.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });

    await App.refreshAi();
  },

  async refreshAi() {
    try {
      const cfg = await Api.aiConfig();
      App.aiReady = !!cfg.configured;
    } catch (e) {
      App.aiReady = false;
    }
    App.refreshAiState();
  },

  refreshAiState() {
    const el = $('#ai-state');
    if (!el) return;
    el.textContent = App.aiReady ? 'AI 判定已就绪' : '未配置 Key · 本地兜底';
    el.className = 'ai-state ' + (App.aiReady ? 'ok' : 'off');
  }
};

function bindTabs() {
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => switchView(t.dataset.view));
  });
}

function switchView(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'stats') StatsView.render();
  if (name === 'books') BooksView.render();
  if (name === 'roots') RootsView.render();
  if (name === 'starred') StarredView.render();
  if (name === 'today') TodayView.render();
  if (name === 'graduated') GraduatedView.render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => { App.boot(); });
