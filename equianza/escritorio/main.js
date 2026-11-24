// Programa de escritorio de Equianza: abre la misma página web (Firebase Hosting) dentro de una ventana de Windows.
// Los datos siguen en Firebase; este programa no guarda nada propio. Se actualiza solo cuando publicas cambios en la web.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let cfg = { url: '', iniciarConWindows: false };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')) }; } catch { /* usa los valores por defecto */ }

const ORIGEN = (() => { try { return new URL(cfg.url).origin; } catch { return ''; } })();
const falta = !ORIGEN || /TU-PROYECTO/i.test(cfg.url);

if (!app.requestSingleInstanceLock()) { app.quit(); }          // solo una ventana de Equianza a la vez
let ventana = null;
app.on('second-instance', () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } });

function crear() {
  ventana = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 600, backgroundColor: '#ffffff',
    title: 'Equianza · Clínica dental', icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }   // sin "dormir" en segundo plano: los recordatorios de citas siguen corriendo
  });
  Menu.setApplicationMenu(null);
  const sinConexion = () => ventana && ventana.loadFile(path.join(__dirname, 'sin-conexion.html'), { query: { falta: falta ? '1' : '0' } });
  if (falta) sinConexion(); else ventana.loadURL(cfg.url);
  ventana.webContents.on('did-fail-load', (_e, code, _d, url, principal) => { if (principal && code !== -3 && url.startsWith(ORIGEN || 'x://')) sinConexion(); });
  // Enlaces a otros sitios (por ejemplo WhatsApp) se abren en el navegador, no dentro del programa.
  ventana.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  ventana.webContents.on('will-navigate', (ev, url) => { if (ORIGEN && !url.startsWith(ORIGEN) && !url.startsWith('file:')) { ev.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  ventana.on('closed', () => { ventana = null; });
}

app.whenReady().then(() => {
  if (cfg.iniciarConWindows && app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });   // para que los recordatorios funcionen desde que se prende la PC
  crear();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) crear(); });
});
app.on('window-all-closed', () => app.quit());
