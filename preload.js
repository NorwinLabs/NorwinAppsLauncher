const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('norwin', {
  listApps: () => ipcRenderer.invoke('apps:list'),
  setPath: (id) => ipcRenderer.invoke('apps:setPath', id),
  launch: (id) => ipcRenderer.invoke('apps:launch', id),
  openRepo: (repo) => ipcRenderer.invoke('apps:openRepo', repo),
  latestRelease: (repo) => ipcRenderer.invoke('apps:latestRelease', repo),
  setToken: (token) => ipcRenderer.invoke('config:setToken', token),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
