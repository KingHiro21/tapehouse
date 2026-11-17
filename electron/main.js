'use strict';
/* Tapehouse — Windows desktop shell.
   The app itself stays exactly what dist/ builds; this process only serves that page
   from a secure app:// origin (so the mic, AudioWorklets and storage behave as they
   do in Chrome) and puts it in a native window. */
const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const WEB_DIR = path.join(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://tapehouse';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);

// A studio should not need a click to start its audio clock.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

let win = null;

/* Reads the file in the main process, so it works the same inside app.asar. */
function serveApp() {
  protocol.handle('app', async (request) => {
    if (!request.url.startsWith(`${APP_ORIGIN}/`)) return new Response('Not found', { status: 404 });
    const { pathname } = new URL(request.url);
    const file = path.join(WEB_DIR, pathname === '/' ? 'Tapehouse.html' : pathname.replace(/^\/+/, ''));
    if (!file.startsWith(WEB_DIR + path.sep)) return new Response('Not found', { status: 404 });
    try {
      const data = await fs.readFile(file);
      return new Response(data, { headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
}

/* The mic (and copying plugin code) is allowed for this app's own pages only. */
function allowAppPermissions() {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'audioCapture', 'clipboard-sanitized-write']);
  const isApp = url => typeof url === 'string' && url.startsWith(APP_ORIGIN);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(isApp((details && details.requestingUrl) || contents.getURL()) && allowed.has(permission));
  });
  ses.setPermissionCheckHandler((contents, permission, origin) => isApp(origin) && allowed.has(permission));
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [{
        label: 'About Tapehouse',
        click: () => dialog.showMessageBox(win, {
          type: 'info',
          title: 'About Tapehouse',
          message: `Tapehouse ${app.getVersion()}`,
          detail: 'A studio in a window. Projects, samples and plugins live in this app’s own storage.',
          buttons: ['OK'],
        }),
      }],
    },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    // Below ~1100px the transport's labels start colliding with its readouts.
    minWidth: 1100,
    minHeight: 640,
    title: 'Tapehouse',
    backgroundColor: '#141317',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Keep the audio scheduler ticking while another window has focus.
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  win.loadURL(`${APP_ORIGIN}/Tapehouse.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => {
    serveApp();
    allowAppPermissions();
    buildMenu();
    createWindow();
  });
}
