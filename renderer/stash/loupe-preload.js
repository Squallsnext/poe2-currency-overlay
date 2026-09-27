const { contextBridge, ipcRenderer } = require('electron');

// the magnifier window (main.js "loupe"): the OCR panel's pictures, sent on every slider
// move; closing it tells the panel
contextBridge.exposeInMainWorld('loupeApi', {
  onData: (cb) => ipcRenderer.on('loupe-data', (_e, d) => cb(d)),
  close: () => ipcRenderer.send('loupe-close'),
});
