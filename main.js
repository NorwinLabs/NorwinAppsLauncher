const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { OS_LABEL, PLATFORM_TO_OS, classify, pickAsset, normalizeName, parseChecksums, isNewer } = require('./lib/assets');

const registry = require('./apps.json');

const SELF_REPO = 'NorwinLabs/NorwinAppsLauncher';
const CURRENT_OS = PLATFORM_TO_OS[process.platform];
const ICON = path.join(__dirname, 'assets', 'icon.png');

let mainWin = null;
let tray = null;
let isQuitting = false;

// ---- Config (stored in userData, never in the repo) ----
const configFile = () => path.join(app.getPath('userData'), 'config.json');
const appsDir = () => path.join(app.getPath('userData'), 'apps');
const FLAGS = { autoUpdate: true, launchAfterInstall: true, closeToTray: false };

function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {}
  return { paths: {}, versions: {}, managed: {}, token: '', ...FLAGS, ...raw };
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

function ghHeaders() {
  const { token } = loadConfig();
  const h = { 'User-Agent': 'NorwinApps', Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// ---- Window / tray ----
function showWindow() {
  if (!mainWin || mainWin.isDestroyed()) return createWindow();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 980,
    height: 680,
    backgroundColor: '#0f1115',
    title: 'NorwinApps',
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWin.on('close', (e) => {
    if (!isQuitting && tray && loadConfig().closeToTray) {
      e.preventDefault();
      mainWin.hide();
    }
  });
  return mainWin;
}

function createTray() {
  try {
    const size = process.platform === 'darwin' ? 18 : 16;
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: size, height: size }));
    tray.setToolTip('NorwinApps');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open NorwinApps', click: showWindow },
      { label: 'Check for updates', click: () => { showWindow(); mainWin.webContents.send('updater:trigger'); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', showWindow);
  } catch {
    tray = null; // some Linux desktops have no tray; closeToTray is then ignored
  }
}

// ---- Apps: list / link / launch ----
ipcMain.handle('apps:list', () => {
  const cfg = loadConfig();
  return registry.map((a) => ({
    ...a,
    localPath: cfg.paths[a.id] || '',
    installed: !!(cfg.paths[a.id] && fs.existsSync(cfg.paths[a.id])),
    installedVersion: cfg.versions[a.id] || '',
    managed: !!cfg.managed[a.id],
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
  delete cfg.managed[id];
  delete cfg.versions[id];
  saveConfig(cfg);
  return res.filePaths[0];
});

function launchExe(exe) {
  if (!exe || !fs.existsSync(exe)) return { ok: false, error: 'Executable not set or missing.' };
  try {
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) });
    child.on('error', () => {});
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

ipcMain.handle('apps:launch', (_e, id) => launchExe(loadConfig().paths[id]));

// ---- Releases ----
const releaseCache = new Map();

async function getRelease(repo, force = false) {
  const hit = releaseCache.get(repo);
  if (!force && hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: ghHeaders() });
    let value;
    if (res.status === 404) value = { ok: true, noRelease: true, tag: '', assets: [] };
    else if (!res.ok) return { ok: false, error: `GitHub ${res.status}` };
    else {
      const data = await res.json();
      value = { ok: true, tag: data.tag_name, url: data.html_url, assets: data.assets || [] };
    }
    releaseCache.set(repo, { at: Date.now(), value });
    return value;
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

ipcMain.handle('apps:platforms', async (_e, id) => {
  const a = registry.find((x) => x.id === id);
  if (!a || a.webUrl !== undefined) return { ok: true, platforms: [] };
  const rel = await getRelease(a.repo);
  if (!rel.ok) return rel;
  const byOs = new Map();
  for (const x of rel.assets) {
    const c = classify(x.name);
    if (!c) continue;
    if (!byOs.has(c.os)) byOs.set(c.os, new Set());
    if (c.arch) byOs.get(c.os).add(c.arch);
  }
  return {
    ok: true,
    noRelease: rel.noRelease,
    tag: rel.tag,
    current: CURRENT_OS,
    platforms: [...byOs].map(([os, archs]) => ({ os, label: OS_LABEL[os], archs: [...archs] })),
    updateAvailable: isNewer(loadConfig().versions[id], rel.tag),
  };
});

// ---- Install / uninstall ----
function progress(id, text) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('apps:installProgress', { id, text });
}

// Streams an asset to disk; returns its sha512 (base64) so it can be verified.
async function download(asset, dest, id) {
  const res = await fetch(asset.url, { headers: { ...ghHeaders(), Accept: 'application/octet-stream' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(asset.size) || 0;
  const hash = crypto.createHash('sha512');
  let got = 0;
  const out = fs.createWriteStream(dest);
  for await (const chunk of res.body) {
    got += chunk.length;
    hash.update(chunk);
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (total) progress(id, `Downloading ${Math.round((got / total) * 100)}%`);
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  return hash.digest('base64');
}

async function fetchText(asset) {
  const res = await fetch(asset.url, { headers: { ...ghHeaders(), Accept: 'application/octet-stream' } });
  return res.ok ? res.text() : '';
}

// electron-builder releases ship latest*.yml with a sha512 for every installer.
async function expectedChecksums(assets) {
  const map = new Map();
  for (const y of assets.filter((x) => /^latest.*\.yml$/i.test(x.name)).slice(0, 4)) {
    try { parseChecksums(await fetchText(y), map); } catch {}
  }
  return map;
}

const exists = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };

function log(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'launcher.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

const capture = (cmd, args) => new Promise((resolve) => {
  let out = '';
  const p = spawn(cmd, args, { windowsHide: true });
  p.stdout.on('data', (d) => { out += d; });
  p.on('error', () => resolve(''));
  p.on('close', () => resolve(out));
});

// NSIS installers register themselves under ...\Uninstall\<key> with the real install folder.
async function findViaRegistry(a) {
  const sub = '\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
  const roots = ['HKCU' + sub, 'HKLM' + sub, 'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'];
  for (const root of roots) {
    const found = await capture('reg', ['query', root, '/s', '/f', a.name, '/d']);
    for (const key of found.split(/\r?\n/).filter((l) => /^HK/i.test(l.trim()))) {
      const vals = {};
      for (const m of (await capture('reg', ['query', key.trim()])).matchAll(/^\s+(\S+)\s+REG_\w+\s+(.*?)\r?$/gm)) vals[m[1]] = m[2];
      if (!String(vals.DisplayName || '').toLowerCase().includes(a.name.toLowerCase())) continue;
      const icon = String(vals.DisplayIcon || '').replace(/^"|"$/g, '').replace(/,-?\d+$/, '').replace(/"/g, '');
      if (/\.exe$/i.test(icon) && !/uninstall/i.test(path.basename(icon)) && exists(icon)) return icon;
      const dir = String(vals.InstallLocation || '').replace(/"/g, '');
      if (dir && fs.existsSync(dir)) {
        const exe = fs.readdirSync(dir).find((f) => /\.exe$/i.test(f) && !/uninstall|update/i.test(f) && f.toLowerCase().startsWith(a.name.toLowerCase().slice(0, 6)));
        if (exe) return path.join(dir, exe);
      }
    }
  }
  return null;
}

async function findInstalledExe(a) {
  const viaReg = await findViaRegistry(a).catch(() => null);
  if (viaReg) return viaReg;
  const bases = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  for (const base of bases) {
    for (const n of [a.name, a.id]) {
      const p = path.join(base, n, `${n}.exe`);
      if (exists(p)) return p;
    }
  }
  return null;
}

const runAndWait = (file, args) => new Promise((resolve, reject) => {
  const p = spawn(file, args, { stdio: 'ignore' });
  p.on('error', reject);
  p.on('exit', (code) => resolve(code));
});

ipcMain.handle('apps:install', async (_e, id) => {
  const a = registry.find((x) => x.id === id);
  if (!a || a.webUrl !== undefined) return { ok: false, error: 'This app cannot be installed.' };
  try {
    progress(id, 'Looking up latest release…');
    const rel = await getRelease(a.repo, true);
    if (!rel.ok) return { ok: false, error: rel.error };
    if (rel.noRelease) return { ok: false, error: 'No release published yet (or repo is private - add a token in Settings).' };
    const asset = pickAsset(rel.assets, process.platform, process.arch);
    if (!asset) return { ok: false, error: `No ${OS_LABEL[CURRENT_OS] || process.platform} installer for ${process.arch} in the latest release.` };

    const dir = path.join(appsDir(), a.id);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(asset.name));
    const [expected, digest] = await Promise.all([expectedChecksums(rel.assets), download(asset, dest, id)]);

    const want = expected.get(normalizeName(asset.name));
    if (want && want !== digest) {
      fs.rmSync(dest, { force: true });
      return { ok: false, error: 'Checksum mismatch - the download was discarded and nothing was installed.' };
    }
    const note = want ? '' : ' (no checksum published - not verified)';

    const cfg = loadConfig();
    let exe = null;
    if (process.platform === 'darwin') {
      await shell.openPath(dest);
      return { ok: true, message: `Opened the disk image - drag the app to Applications, then link it.${note}` };
    }
    if (process.platform === 'linux' || /portable/i.test(asset.name)) {
      fs.chmodSync(dest, 0o755);
      exe = dest;
      const old = cfg.paths[a.id];
      if (old && old !== dest && old.startsWith(dir)) fs.rmSync(old, { force: true });
    } else {
      progress(id, 'Installing…');
      const code = await runAndWait(dest, ['/S']);
      log(`install ${a.id} ${rel.tag}: installer exit code ${code}`);
      // Give the installer a moment to finish writing its files / registry entries.
      for (let i = 0; i < 10 && !exe; i++) {
        exe = await findInstalledExe(a);
        if (!exe) await new Promise((r) => setTimeout(r, 1000));
      }
      log(`install ${a.id}: found exe ${exe}`);
      if (code && !exe) return { ok: false, error: `The installer exited with code ${code}. Try running ${path.basename(dest)} yourself from ${dir}.` };
      fs.rmSync(dest, { force: true });
      if (!exe) {
        // Could not locate the install automatically: let the user point at it once.
        const pick = await dialog.showOpenDialog({
          title: `Installed - select ${a.name}'s executable to link it`,
          defaultPath: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : undefined,
          properties: ['openFile'],
          filters: [{ name: 'Executable', extensions: ['exe'] }],
        });
        exe = pick.canceled ? null : pick.filePaths[0];
      }
    }
    if (!exe) return { ok: true, message: `Installed - use "Link exe" to point at it.${note}` };

    cfg.paths[a.id] = exe;
    cfg.versions[a.id] = rel.tag;
    cfg.managed[a.id] = true;
    saveConfig(cfg);
    if (cfg.launchAfterInstall) launchExe(exe);
    return { ok: true, message: `Installed ${rel.tag}${cfg.launchAfterInstall ? ' and launched' : ''}.${note}` };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('apps:uninstall', async (_e, id) => {
  const a = registry.find((x) => x.id === id);
  const cfg = loadConfig();
  const exe = cfg.paths[id];
  if (!a || !cfg.managed[id] || !exe) return { ok: false, error: 'Only apps installed from here can be uninstalled.' };
  try {
    const dir = path.dirname(exe);
    if (exe.startsWith(appsDir())) {
      fs.rmSync(dir, { recursive: true, force: true }); // AppImage / portable build
    } else if (process.platform === 'win32') {
      const un = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => /^uninstall.*\.exe$/i.test(f));
      if (!un) return { ok: false, error: 'Could not find the uninstaller. Remove it from Windows Settings > Apps.' };
      progress(id, 'Uninstalling…');
      await runAndWait(path.join(dir, un), ['/S', `_?=${dir}`]);
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      return { ok: false, error: 'Remove the app manually, then it will unlink here.' };
    }
    delete cfg.paths[id];
    delete cfg.versions[id];
    delete cfg.managed[id];
    saveConfig(cfg);
    return { ok: true, message: 'Uninstalled.' };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('apps:openWeb', (_e, id) => {
  const a = registry.find((x) => x.id === id);
  if (!a || !/^https:\/\//.test(a.webUrl || '')) return false;
  shell.openExternal(a.webUrl);
  return true;
});

ipcMain.handle('apps:openRepo', (_e, repo) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  shell.openExternal(`https://github.com/${repo}`);
  return true;
});

ipcMain.handle('apps:latestRelease', async (_e, repo) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: 'Bad repo' };
  const rel = await getRelease(repo, true);
  if (!rel.ok) return rel;
  return { ok: true, tag: rel.noRelease ? null : rel.tag, url: rel.url };
});

// ---- Settings ----
ipcMain.handle('config:get', () => {
  const cfg = loadConfig();
  return { autoUpdate: cfg.autoUpdate, launchAfterInstall: cfg.launchAfterInstall, closeToTray: cfg.closeToTray, hasTray: !!tray };
});

ipcMain.handle('config:setFlag', (_e, key, value) => {
  if (!(key in FLAGS)) return false;
  const cfg = loadConfig();
  cfg[key] = !!value;
  saveConfig(cfg);
  if (key === 'autoUpdate') autoUpdater.autoDownload = cfg.autoUpdate;
  return true;
});

ipcMain.handle('config:setToken', (_e, token) => {
  const cfg = loadConfig();
  cfg.token = String(token || '').trim();
  saveConfig(cfg);
  releaseCache.clear();
  if (cfg.token) autoUpdater.addAuthHeader(`Bearer ${cfg.token}`);
  return true;
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://github.com/')) shell.openExternal(url);
});

// ---- Self-update (reads GitHub Releases of SELF_REPO) ----
function sendUpdate(state) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('updater:state', state);
}

function setupUpdater() {
  const cfg = loadConfig();
  if (cfg.token) autoUpdater.addAuthHeader(`Bearer ${cfg.token}`);
  autoUpdater.autoDownload = cfg.autoUpdate;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ status: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ status: 'current' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ status: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => sendUpdate({ status: 'error', error: String(e.message || e) }));
}

// Dev (unpackaged) builds can't self-update, so just read the repo's latest release.
async function checkRepoRelease() {
  const rel = await getRelease(SELF_REPO, true);
  if (!rel.ok) return { status: 'error', error: rel.error };
  const tag = rel.tag.replace(/^v/, '');
  return !rel.noRelease && isNewer(app.getVersion(), tag) ? { status: 'available', version: tag, manual: true } : { status: 'current' };
}

ipcMain.handle('updater:info', () => ({ version: app.getVersion(), packaged: app.isPackaged }));

ipcMain.handle('updater:check', async () => {
  try {
    if (!app.isPackaged) return await checkRepoRelease();
    await autoUpdater.checkForUpdates();
    return { status: 'checking' };
  } catch (err) {
    return { status: 'error', error: String(err.message || err) };
  }
});

ipcMain.handle('updater:download', () => {
  if (app.isPackaged) autoUpdater.downloadUpdate().catch((e) => sendUpdate({ status: 'error', error: String(e.message || e) }));
  else shell.openExternal(`https://github.com/${SELF_REPO}/releases/latest`);
});

ipcMain.handle('updater:install', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

// ---- App lifecycle ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { isQuitting = true; });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    if (app.isPackaged) {
      setupUpdater();
      mainWin.webContents.once('did-finish-load', () => autoUpdater.checkForUpdates().catch(() => {}));
    }
    app.on('activate', showWindow);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
