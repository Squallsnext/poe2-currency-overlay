const { contextBridge, ipcRenderer } = require('electron');

// tab builder window (main.js "tab builder"): the capture + found cells, the item list,
// save / close
contextBridge.exposeInMainWorld('builderApi', {
  getData: () => ipcRenderer.invoke('stash-builder-data'),
  items: () => ipcRenderer.invoke('stash-builder-items'),
  save: (payload) => ipcRenderer.invoke('stash-builder-save', payload),
  close: () => ipcRenderer.send('stash-builder-close'),
});
