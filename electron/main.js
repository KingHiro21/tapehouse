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

const DOWNLOAD_FILTERS = {
  wav: { name: 'WAV audio', extensions: ['wav'] },
  zip: { name: 'Zip archive', extensions: ['zip'] },
  json: { name: 'Tapehouse plugin', extensions: ['json'] },
};

/* Bounces, project bundles and library backups leave the page as downloads. Ask
   where each one goes with a name and filter that match the file, instead of
   relying on Chromium's default routine; a dismissed dialog cancels the file. */
function saveDownloads() {
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Tell the page how the export ended, so it never claims a save that was
    // dismissed or landed somewhere other than Downloads.
    item.once('done', (event, state) => {
      if (webContents.isDestroyed()) return;
      const completed = state === 'completed';
      webContents.send('tapehouse:download', {
        canceled: !completed,
        path: completed ? item.getSavePath() : null,
      });
    });

    const name = item.getFilename();
    const filter = DOWNLOAD_FILTERS[path.extname(name).slice(1).toLowerCase()];
    const parent = win && !win.isDestroyed() ? win : undefined;
    const { canceled, filePath } = dialog.showSaveDialogSync(parent, {
      title: 'Save from Tapehouse',
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: filter ? [filter, { name: 'All files', extensions: ['*'] }] : undefined,
    });
    if (canceled || !filePath) { item.cancel(); return; }
    item.setSavePath(filePath);
  });
}

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
      preload: path.join(__dirname, 'preload.js'),
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
    saveDownloads();
    buildMenu();
    createWindow();
  });
}
