const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printTicket: (url, opts = {}) => ipcRenderer.invoke('print-ticket', { url, ...opts }),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
