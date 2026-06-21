const { app, BrowserWindow, globalShortcut, Menu, ipcMain, dialog } = require('electron');
const path = require('node:path');

let win;
let autoUpdater = null;

async function startServer() {
  await import('../backend/server.js');
}

async function setupAutoUpdater() {
  try {
    const mod = await import('electron-updater');
    autoUpdater = new mod.NsisUpdater({
      provider: 'github',
      owner: 'valentin2236',
      repo: 'SISTEMA-GESTION',
      private: true,
      token: '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',
    });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => {
      console.log('[updater] Buscando actualizaciones...');
    });
    autoUpdater.on('update-available', (info) => {
      var resp = dialog.showMessageBoxSync({
        type: 'info', title: 'Actualización disponible',
        message: 'Nueva versión disponible (v' + info.version + '). ¿Descargar?',
        buttons: ['Descargar', 'Más tarde'], defaultId: 0,
      });
      if (resp === 0) autoUpdater.downloadUpdate();
    });
    autoUpdater.on('update-not-available', () => {
      console.log('[updater] Ya tenés la última versión');
    });
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(win, {
        type: 'info', title: 'Actualización lista',
        message: 'Se instalará al reiniciar. ¿Reiniciar ahora?',
        buttons: ['Reiniciar', 'Más tarde'], defaultId: 0,
      }).then(function(result) { if (result.response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', (err) => {
      console.error('[updater] Error:', err.message);
      dialog.showMessageBoxSync({
        type: 'error', title: 'Error de actualización',
        message: 'No se pudo verificar actualizaciones:\n' + err.message,
      });
    });
    autoUpdater.checkForUpdates();
  } catch (e) {
    console.error('[updater] Excepción:', e.message);
    dialog.showMessageBoxSync({
      type: 'error', title: 'Error updater',
      message: 'Error al iniciar el actualizador:\n' + e.message + '\n\nKeys: ' + Object.keys(e).join(', '),
    });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    icon: path.join(__dirname, '..', 'public', 'img', 'Logo-ValentinArriola.ico'),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.loadURL('http://localhost:3000/admin/login.html');

  [
    ['F1', "document.getElementById('buscar')?.focus();document.getElementById('buscar')?.select();"],
    ['F2', "document.dispatchEvent(new KeyboardEvent('keydown',{key:'F2'}));"],
    ['F3', "document.dispatchEvent(new KeyboardEvent('keydown',{key:'F3'}));"],
    ['F9', "document.getElementById('btn-finalizar')?.click();"],
  ].forEach(([key, code]) => {
    try { globalShortcut.register(key, () => {
      const w = BrowserWindow.getFocusedWindow();
      if (w) w.webContents.executeJavaScript(code).catch(() => {});
    }); } catch {}
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [{ role: 'quit', label: 'Salir' }] },
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recargar' }, { role: 'forceReload', label: 'Recargar forzado' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'DevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' },
    ]},
    { label: 'Ir', submenu: [
      { label: 'Inicio', click: () => win && win.loadURL('http://localhost:3000/admin/dashboard.html') },
      { label: 'POS', click: () => win && win.loadURL('http://localhost:3000/pos.html') },
      { label: 'Config', click: () => win && win.loadURL('http://localhost:3000/config.html') },
    ]},
    { label: 'Ayuda', submenu: [
      { label: 'Acerca de', click: () => dialog.showMessageBox(win, {
        type: 'info', title: 'Sistema de Gestión PRO',
        message: 'Versión: ' + app.getVersion(), buttons: ['OK'],
      })},
      { label: 'Buscar actualizaciones', click: () => {
        if (autoUpdater) autoUpdater.checkForUpdates();
        else dialog.showMessageBox(win, { type: 'info', title: 'Actualizaciones',
          message: 'Solo disponible en la versión instalada.' });
      }},
    ]},
  ]));
  win.on('close', () => {
    if (win) {
      win.webContents.executeJavaScript(`
        localStorage.removeItem('token');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_nombre');
        localStorage.removeItem('user_rol');
        sessionStorage.clear();
      `).catch(() => {});
    }
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  const { ipcMain: ipc } = require('electron');

  ipc.handle('print-ticket', async (_evt, opts) => {
    const { url, deviceName, silent = true, landscape = false, margins = 'none' } = opts || {};
    if (!url) return { ok: false, error: 'URL requerida' };
    const pw = new BrowserWindow({ show: false, webPreferences: {
      contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs'),
    }});
    try {
      await pw.loadURL(url.startsWith('http') ? url : 'http://localhost:3000' + url);
      await new Promise(r => pw.webContents.isLoading() ? pw.webContents.once('did-finish-load', r) : r());
      await pw.webContents.print({ silent, deviceName: deviceName || undefined, printBackground: true,
        color: false, landscape, margins: margins === 'none' ? { marginType: 'none' } : undefined, copies: 1 });
      pw.close(); return { ok: true };
    } catch (e) { try { pw.close(); } catch {} return { ok: false, error: String(e) }; }
  });
  ipc.handle('get-printers', (ev) => { try { return ev.sender.getPrinters(); } catch { return []; } });
  ipc.handle('get-app-version', () => app.getVersion());

  await startServer();
  createWindow();

  setupAutoUpdater();
});
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
