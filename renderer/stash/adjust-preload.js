const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adjustApi', {
  save: (payload) => ipcRenderer.invoke('stash-adjust-save', payload),
  close: () => ipcRenderer.send('stash-adjust-close'),
});
