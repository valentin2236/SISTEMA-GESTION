const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters:   () => ipcRenderer.invoke('get-printers'),
  printTicket:   (url, opts = {}) => ipcRenderer.invoke('print-ticket', { url, ...opts }),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  setMode:       (modo, ip) => ipcRenderer.invoke('set-mode', modo, ip),
  getMode:       () => ipcRenderer.invoke('get-mode'),
  resetMode:     () => ipcRenderer.invoke('reset-mode'),
});
