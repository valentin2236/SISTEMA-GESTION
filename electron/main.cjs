const { app, BrowserWindow, globalShortcut, Menu, ipcMain, dialog } = require('electron');
const path = require('node:path');
const crypto = require('crypto');
const fs   = require('fs');
const http = require('http');

let win;
let autoUpdater = null;

// ── Config de modo (servidor / cliente) ──
const MODO_CONFIG_PATH = path.join(app.getPath('userData'), 'modo.json');

function getModoConfig() {
  try {
    if (fs.existsSync(MODO_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(MODO_CONFIG_PATH, 'utf8'));
    }
  } catch {}
  return null;
}

function setModoConfig(modo, ip) {
  fs.writeFileSync(MODO_CONFIG_PATH, JSON.stringify({ modo, ip: ip || '' }), 'utf8');
}

// Genera (o lee) un JWT_SECRET único para esta instalación
function ensureJwtSecret() {
  const secretPath = path.join(app.getPath('userData'), 'jwt.secret');
  let secret;
  if (fs.existsSync(secretPath)) {
    secret = fs.readFileSync(secretPath, 'utf8').trim();
  } else {
    secret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretPath, secret, 'utf8');
  }
  process.env.JWT_SECRET = secret;
}

// Verifica si el trial de 7 días expiró y no hay licencia activa
function checkTrialStatus() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3847/api/licencia/estado-publico', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ trialExpired: false, activa: false }); }
      });
    });
    req.on('error', () => resolve({ trialExpired: false, activa: false }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ trialExpired: false, activa: false }); });
  });
}

// Verifica si el negocio ya está configurado (primer inicio)
function checkSetupDone() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3847/api/sistema/setup-status', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).configurado === true); }
        catch { resolve(true); }
      });
    });
    req.on('error', () => resolve(true));
    req.setTimeout(3000, () => { req.destroy(); resolve(true); });
  });
}

// Cancela la orden MP abierta (si hay) antes de cerrar
function cancelarMpLocal() {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 3847, path: '/api/sistema/cancelar-mp-local', method: 'DELETE' },
      resolve
    );
    req.on('error', resolve);
    req.setTimeout(1500, () => { req.destroy(); resolve(); });
    req.end();
  });
}

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
    });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => {
      var resp = dialog.showMessageBoxSync({
        type: 'info', title: 'Actualización disponible',
        message: 'Nueva versión disponible (v' + info.version + '). ¿Descargar ahora?',
        buttons: ['Descargar', 'Más tarde'], defaultId: 0,
      });
      if (resp === 0) autoUpdater.downloadUpdate();
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
    });
    autoUpdater.checkForUpdates();
  } catch (e) {
    console.error('[updater] Excepción:', e.message);
  }
}

function buildMenu(baseUrl) {
  return Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [
      { label: 'Cambiar modo (Servidor/Caja)', click: () => {
        const r = dialog.showMessageBoxSync(win, {
          type: 'question',
          title: 'Cambiar modo',
          message: '¿Querés cambiar el modo del sistema?\nEl programa se va a reiniciar.',
          buttons: ['Cambiar modo', 'Cancelar'],
        });
        if (r === 0) {
          if (fs.existsSync(MODO_CONFIG_PATH)) fs.unlinkSync(MODO_CONFIG_PATH);
          app.relaunch(); app.exit(0);
        }
      }},
      { type: 'separator' },
      { role: 'quit', label: 'Salir' },
    ]},
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recargar' }, { role: 'forceReload', label: 'Recargar forzado' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'DevTools' },
      { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Pantalla completa' },
    ]},
    { label: 'Ir', submenu: [
      { label: 'Inicio', click: () => win && win.loadURL(baseUrl + '/admin/dashboard.html') },
      { label: 'POS', click: () => win && win.loadURL(baseUrl + '/pos.html') },
      { label: 'Config', click: () => win && win.loadURL(baseUrl + '/config.html') },
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
  ]);
}

async function createWindow() {
  const baseUrl = 'http://localhost:3847';
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    backgroundColor: '#0d1b2a',
    icon: path.join(__dirname, '..', 'public', 'img', 'icono_1024.png'),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const configurado = await checkSetupDone();
  if (!configurado) {
    win.loadURL(baseUrl + '/setup.html');
  } else {
    const licStatus = await checkTrialStatus();
    if (licStatus.trialExpired && !licStatus.activa) {
      win.loadURL(baseUrl + '/trial-finalizado.html');
    } else {
      win.loadURL(baseUrl + '/admin/login.html');
    }
  }

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

  Menu.setApplicationMenu(buildMenu(baseUrl));
  win.on('close', async (e) => {
    e.preventDefault();
    await cancelarMpLocal().catch(() => {});
    try {
      await win.webContents.executeJavaScript(`
        localStorage.removeItem('token');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_nombre');
        localStorage.removeItem('user_rol');
        sessionStorage.clear();
      `);
    } catch {}
    win.destroy();
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  const { ipcMain: ipc } = require('electron');

  // ── Modo: guardar config y reiniciar ──
  ipc.handle('set-mode', (_evt, modo, ip) => {
    setModoConfig(modo, ip);
    app.relaunch();
    app.exit(0);
  });
  ipc.handle('get-mode', () => getModoConfig());
  ipc.handle('reset-mode', () => {
    try { if (fs.existsSync(MODO_CONFIG_PATH)) fs.unlinkSync(MODO_CONFIG_PATH); } catch {}
    app.relaunch();
    app.exit(0);
  });

  ipc.handle('print-ticket', async (_evt, opts) => {
    const { url, deviceName, silent = true, landscape = false, margins = 'none' } = opts || {};
    if (!url) return { ok: false, error: 'URL requerida' };
    const pw = new BrowserWindow({ show: false, webPreferences: {
      contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs'),
    }});
    try {
      await pw.loadURL(url.startsWith('http') ? url : 'http://localhost:3847' + url);
      await new Promise(r => pw.webContents.isLoading() ? pw.webContents.once('did-finish-load', r) : r());
      await pw.webContents.print({ silent, deviceName: deviceName || undefined, printBackground: true,
        color: false, landscape, margins: margins === 'none' ? { marginType: 'none' } : undefined, copies: 1 });
      pw.close(); return { ok: true };
    } catch (e) { try { pw.close(); } catch {} return { ok: false, error: String(e) }; }
  });
  ipc.handle('get-printers', (ev) => { try { return ev.sender.getPrinters(); } catch { return []; } });
  ipc.handle('get-app-version', () => app.getVersion());

  const modoConfig = getModoConfig();

  if (!modoConfig) {
    // ── Primer arranque: seleccionar modo ──
    const setupWin = new BrowserWindow({
      width: 560, height: 480, resizable: false,
      backgroundColor: '#0d1b2a',
      icon: path.join(__dirname, '..', 'public', 'img', 'icono_1024.png'),
      webPreferences: {
        contextIsolation: true, nodeIntegration: false,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });
    setupWin.loadFile(path.join(__dirname, '..', 'public', 'setup-modo.html'));
    Menu.setApplicationMenu(null);
    return;
  }

  if (modoConfig.modo === 'cliente') {
    // ── Modo cliente: apuntar al servidor remoto ──
    const baseUrl = `http://${modoConfig.ip}:3847`;
    win = new BrowserWindow({
      width: 1280, height: 800, minWidth: 1024, minHeight: 700,
      backgroundColor: '#0d1b2a',
      icon: path.join(__dirname, '..', 'public', 'img', 'icono_1024.png'),
      webPreferences: {
        contextIsolation: true, nodeIntegration: false,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });
    let errorShown = false;
    win.webContents.on('did-fail-load', (_e, code, _desc, url) => {
      if (errorShown || !url || url.startsWith('file://')) return;
      errorShown = true;
      win.loadFile(path.join(__dirname, '..', 'public', 'sin-conexion.html'),
        { query: { ip: modoConfig.ip } });
    });
    win.webContents.on('did-navigate', () => { errorShown = false; });
    win.loadURL(baseUrl + '/admin/login.html');
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
    Menu.setApplicationMenu(buildMenu(baseUrl));
    win.on('closed', () => { win = null; });
    return;
  }

  // ── Modo servidor (default) ──
  ensureJwtSecret();
  await startServer();
  await createWindow();
  setupAutoUpdater();
});
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('quit', () => {
  process.exit(0);
});
