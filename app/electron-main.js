// ==================== Electron 主进程（独立窗口版）====================
// 把本地服务跑在同一个进程里，用应用窗口显示前端 —— 不需要浏览器，也不需要 start.bat。
// 数据放在用户数据目录（Windows：%APPDATA%\英语猜词背诵器\data），首次运行自动释放词库。

const path = require('path');
const { app, BrowserWindow, shell, dialog } = require('electron');

const APP_NAME = '英语猜词背诵器';
app.setName(APP_NAME);

// 必须在 require('./server.js') 之前设好
process.env.AUTO_OPEN = '0';        // 不要再打开系统浏览器
process.env.PORT = '0';             // 让系统分配一个空闲端口，避免和别的东西抢 4578

let win = null;
let server = null;

function createWindow(port) {
  win = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    title: APP_NAME,
    backgroundColor: '#0f1424',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon-256.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('http://127.0.0.1:' + port);
  win.on('closed', () => { win = null; });
  // 外链交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // 数据目录：外部（启动器）指定过就用它（方便沿用项目里的 data/），否则用系统用户数据目录
  if (!process.env.RECITER_DATA_DIR) {
    process.env.RECITER_DATA_DIR = path.join(app.getPath('userData'), 'data');
  }
  try {
    server = require('./server.js');
  } catch (e) {
    dialog.showErrorBox(APP_NAME, '启动失败：' + e.message);
    app.quit();
    return;
  }
  const start = () => {
    const addr = server.address();
    createWindow(addr ? addr.port : 4578);
  };
  if (server.listening) start();
  else server.once('listening', start);
});

app.on('window-all-closed', () => { app.quit(); });          // 关窗即退出（服务一起停）
app.on('before-quit', () => { try { if (server) server.close(); } catch (e) { /* 忽略 */ } });
