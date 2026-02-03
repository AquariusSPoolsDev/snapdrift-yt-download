const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchMetadata: (url) => ipcRenderer.invoke('fetch-metadata', url),
  startDownload: (opts) => ipcRenderer.invoke('start-download', opts),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'), // Add this
  onYtOutput: (cb) => ipcRenderer.on('yt-output', (ev, data) => cb(data)),
  onDownloadFinished: (cb) => ipcRenderer.on('download-finished', (ev, data) => cb(data)),
});