const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const registry = require('./apps.json');

// User-specific settings live outside the repo: local exe paths + optional GitHub token
// (token is only needed to check releases of private repos).
const configFile = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return { paths: {}, token: '' };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 680,
    backgroundColor: '#0f1115',
    title: 'NorwinApps',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('apps:list', () => {
  const cfg = loadConfig();
  return registry.map((a) => ({
    ...a,
    localPath: cfg.paths[a.id] || '',
    installed: !!(cfg.paths[a.id] && fs.existsSync(cfg.paths[a.id])),
  }));
});

ipcMain.handle('apps:setPath', async (_e, id) => {
  const res = await dialog.showOpenDialog({
    title: 'Select the app executable',
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const cfg = loadConfig();
  cfg.paths[id] = res.filePaths[0];
  saveConfig(cfg);
  return res.filePaths[0];
});

ipcMain.handle('apps:launch', (_e, id) => {
  const exe = loadConfig().paths[id];
  if (!exe || !fs.existsSync(exe)) return { ok: false, error: 'Executable not set or missing.' };
  try {
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) });
    child.on('error', () => {});
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('apps:openRepo', (_e, repo) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  shell.openExternal(`https://github.com/${repo}`);
  return true;
});

ipcMain.handle('apps:latestRelease', async (_e, repo) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: 'Bad repo' };
  const { token } = loadConfig();
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'NorwinApps' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
    if (res.status === 404) return { ok: true, tag: null };
    if (!res.ok) return { ok: false, error: `GitHub ${res.status}` };
    const data = await res.json();
    return { ok: true, tag: data.tag_name, url: data.html_url };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('config:setToken', (_e, token) => {
  const cfg = loadConfig();
  cfg.token = String(token || '').trim();
  saveConfig(cfg);
  return true;
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://github.com/')) shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
