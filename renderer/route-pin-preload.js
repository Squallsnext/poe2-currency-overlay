const { contextBridge, ipcRenderer } = require('electron');

// Pinned route window: content comes from the overlay (via main), actions go back.
contextBridge.exposeInMainWorld('routePinApi', {
  onContent: (cb) => ipcRenderer.on('route-pin-content', (_e, payload) => cb(payload)),
  action: (act) => ipcRenderer.send('route-pin-action', act),
});
