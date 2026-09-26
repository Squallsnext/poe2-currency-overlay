const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adjustApi', {
  save: (payload) => ipcRenderer.invoke('stash-adjust-save', payload),
  close: () => ipcRenderer.send('stash-adjust-close'),
  // the capture + boxes to show (main.js stash-adjust-open)
  getData: () => ipcRenderer.invoke('stash-adjust-data'),
});
