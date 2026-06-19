import { app, BrowserWindow, globalShortcut, Menu, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Levanta tu backend Express (puerto 3000)
import '../backend/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let autoUpdater = null;

// Auto-updater (solo en builds empaquetados)
async function setupAutoUpdater() {
  if (!app.isPackaged) return;

  try {
    const { autoUpdater: updater } = await import('electron-updater');
    autoUpdater = updater;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Actualización disponible',
        message: `Hay una nueva versión disponible (v${info.version}). ¿Descargar ahora?`,
        buttons: ['Descargar', 'Más tarde'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Actualización lista',
        message: 'La actualización se instalará al reiniciar la aplicación. ¿Reiniciar ahora?',
        buttons: ['Reiniciar', 'Más tarde'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
    });

    autoUpdater.checkForUpdates();
  } catch {
    // electron-updater no disponible en modo desarrollo
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: true,
    titleBarStyle: 'default',
    autoHideMenuBar: false,
    icon: path.join(__dirname, '..', 'public', 'img', 'Logo-ValentinArriola.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.loadURL('http://localhost:3000/admin/dashboard.html');

  // ===== Atajos globales =====
  const shortcuts = [
    ['F1', "document.getElementById('buscar')?.focus();document.getElementById('buscar')?.select();"],
    ['F2', "document.dispatchEvent(new KeyboardEvent('keydown',{key:'F2'}));"],
    ['F3', "document.dispatchEvent(new KeyboardEvent('keydown',{key:'F3'}));"],
    ['F9', "document.getElementById('btn-finalizar')?.click();"],
  ];

  shortcuts.forEach(([key, code]) => {
    try {
      globalShortcut.register(key, () => {
        const w = BrowserWindow.getFocusedWindow();
        w?.webContents.executeJavaScript(code).catch(() => {});
      });
    } catch {}
  });

  // ===== Menú =====
  const template = [
    { label: 'Archivo', submenu: [{ role: 'quit', label: 'Salir' }] },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Recargar forzado' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Alternar DevTools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom 100%' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ir',
      submenu: [
        { label: 'Inicio', click: () => win?.loadURL('http://localhost:3000/admin/dashboard.html') },
        { label: 'POS', click: () => win?.loadURL('http://localhost:3000/pos.html') },
        { label: 'Config', click: () => win?.loadURL('http://localhost:3000/config.html') },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'Sistema de Gestión PRO',
              message: `Sistema de Gestión PRO\nVersión: ${app.getVersion()}`,
              buttons: ['OK'],
            });
          },
        },
        {
          label: 'Buscar actualizaciones',
          click: () => {
            if (autoUpdater) {
              autoUpdater.checkForUpdates();
            } else {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'Actualizaciones',
                message: 'La verificación de actualizaciones solo está disponible en la versión instalada.',
              });
            }
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  win.on('closed', () => { win = null; });
}

/* =========================
   IMPRESIÓN SILENCIOSA
   ========================= */
ipcMain.handle('print-ticket', async (_evt, {
  url,
  deviceName,
  silent = true,
  landscape = false,
  margins = 'none',
} = {}) => {
  if (!url) return { ok: false, error: 'URL de ticket requerida' };

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  try {
    const fullURL = url.startsWith('http') ? url : `http://localhost:3000${url}`;
    await printWin.loadURL(fullURL);

    await new Promise((resolve) => {
      if (printWin.webContents.isLoading()) {
        printWin.webContents.once('did-finish-load', resolve);
      } else {
        resolve();
      }
    });

    await printWin.webContents.print({
      silent,
      deviceName: deviceName || undefined,
      printBackground: true,
      color: false,
      landscape,
      margins: margins === 'none' ? { marginType: 'none' } : undefined,
      copies: 1,
    });

    printWin.close();
    return { ok: true };
  } catch (e) {
    try { printWin.close(); } catch {}
    return { ok: false, error: String(e) };
  }
});

/* =========================
   LISTA DE IMPRESORAS
   ========================= */
ipcMain.handle('get-printers', (event) => {
  try {
    return event.sender.getPrinters();
  } catch {
    return [];
  }
});

/* =========================
   INFO DE VERSIÓN
   ========================= */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

/* ===== Ciclo de vida ===== */
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
