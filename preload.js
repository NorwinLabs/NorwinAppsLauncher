const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('norwin', {
  listApps: call('apps:list'),
  setPath: call('apps:setPath'),
  launch: call('apps:launch'),
  platforms: call('apps:platforms'),
  install: call('apps:install'),
  uninstall: call('apps:uninstall'),
  openWeb: call('apps:openWeb'),
  openRepo: call('apps:openRepo'),
  latestRelease: call('apps:latestRelease'),
  getConfig: call('config:get'),
  setFlag: call('config:setFlag'),
  setToken: call('config:setToken'),
  updaterInfo: call('updater:info'),
  checkUpdate: call('updater:check'),
  downloadUpdate: call('updater:download'),
  installUpdate: call('updater:install'),
  openExternal: call('shell:openExternal'),
  onInstallProgress: (cb) => ipcRenderer.on('apps:installProgress', (_e, p) => cb(p)),
  onUpdateState: (cb) => ipcRenderer.on('updater:state', (_e, s) => cb(s)),
  onUpdateTrigger: (cb) => ipcRenderer.on('updater:trigger', () => cb()),
});
