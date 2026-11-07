const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('norwin', {
  listApps: () => ipcRenderer.invoke('apps:list'),
  setPath: (id) => ipcRenderer.invoke('apps:setPath', id),
  launch: (id) => ipcRenderer.invoke('apps:launch', id),
  openRepo: (repo) => ipcRenderer.invoke('apps:openRepo', repo),
  latestRelease: (repo) => ipcRenderer.invoke('apps:latestRelease', repo),
  setToken: (token) => ipcRenderer.invoke('config:setToken', token),
  updaterInfo: () => ipcRenderer.invoke('updater:info'),
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  setAutoUpdate: (on) => ipcRenderer.invoke('config:setAutoUpdate', on),
  onUpdateState: (cb) => ipcRenderer.on('updater:state', (_e, s) => cb(s)),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
