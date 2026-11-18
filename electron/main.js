'use strict';
/* Tapehouse — Windows desktop shell.
   The app itself stays exactly what dist/ builds; this process only serves that page
   from a secure app:// origin (so the mic, AudioWorklets and storage behave as they
   do in Chrome) and puts it in a native window. */
const { app, BrowserWindow, Menu, dialog, protocol, session, shell, ipcMain } = require('electron');
const https = require('node:https');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { portableDataDir } = require('./profile');
const { projectPathFrom } = require('./open-file');

const WEB_DIR = path.join(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://tapehouse';

// A portable copy carries portable.txt beside the exe and keeps its projects in a
// data folder next to it, so the folder can be copied to another PC with its work.
// An explicit --user-data-dir wins; the smoke test relies on that for a throwaway run.
const portableDir = process.argv.some(arg => arg.startsWith('--user-data-dir')) ? null : portableDataDir();
if (portableDir) app.setPath('userData', portableDir);

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
let pageReady = false;
// Projects handed over before the page can take them, oldest first: a second file
// can arrive while the first is still opening, or before the window exists.
const pendingProjects = [];

const DOWNLOAD_FILTERS = {
  wav: { name: 'WAV audio', extensions: ['wav'] },
  tapehouse: { name: 'Tapehouse project', extensions: ['tapehouse'] },
  zip: { name: 'Zip archive', extensions: ['zip'] },
  json: { name: 'Tapehouse plugin', extensions: ['json'] },
};

/* Bounces, project bundles and library backups leave the page as downloads. Ask
   where each one goes with a name and filter that match the file, instead of
   relying on Chromium's default routine; a dismissed dialog cancels the file. */function saveDownloads() {
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
      // The sync read is the documented one for files inside app.asar.
      const data = fs.readFileSync(file);
      return new Response(data, { headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) {
      // A packaged build must say which file it could not reach.
      console.error(`app: could not serve ${file} (${e.code || e.message})`);
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
        label: 'Check for updates…',
        click: menuUpdateCheck,
      }, {
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

/* ---------- updates ---------- */
/* Checks the GitHub releases for a newer Tapehouse and installs it. Nothing runs
   without the user pressing Install: the page (or the Help menu) asks first, the
   download shows its progress, and only then the NSIS installer takes over. A
   portable copy can't replace its own running exe, so it saves the new zip into
   Downloads and opens the folder instead. */
const REPO = 'KingHiro21/tapehouse';
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const verCmp = (a, b) => { const pa = String(a).split('.'), pb = String(b).split('.'); for (let i = 0; i < 3; i++) { const x = +pa[i] || 0, y = +pb[i] || 0; if (x !== y) return x < y ? -1 : 1; } return 0; };

function httpsGet(url, headers, onRes) {
  return new Promise((resolve, reject) => {
    const follow = (u, hops) => {
      if (hops > 5) { reject(new Error('Too many redirects')); return; }
      const req = https.get(u, { headers: { 'user-agent': 'Tapehouse-Updater', ...headers }, timeout: 20000 }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) { res.resume(); follow(res.headers.location, hops + 1); return; }
        res.on('error', reject);
        onRes(res, resolve, reject);
      });
      req.on('timeout', () => req.destroy(new Error('The connection timed out')));
      req.on('error', reject);
    };
    follow(url, 0);
  });
}
function fetchJson(url) {
  return httpsGet(url, { accept: 'application/vnd.github+json' }, (res, resolve, reject) => {
    if (res.statusCode === 404) { res.resume(); reject(new Error('No published releases yet — the first one appears when a v… tag is pushed')); return; }
    if (res.statusCode !== 200) { res.resume(); reject(new Error(`GitHub answered ${res.statusCode}`)); return; }
    let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c);
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
}
function downloadTo(url, dest, onProgress) {
  return httpsGet(url, {}, (res, resolve, reject) => {
    if (res.statusCode !== 200) { res.resume(); reject(new Error(`The download answered ${res.statusCode}`)); return; }
    const total = +res.headers['content-length'] || 0; let done = 0, last = 0;
    const out = fs.createWriteStream(dest);
    res.on('data', c => { done += c.length; if (onProgress && total && Date.now() - last > 250) { last = Date.now(); onProgress(done / total); } });
    res.on('error', reject); out.on('error', reject);
    out.on('finish', () => out.close(() => resolve(dest)));
    res.pipe(out);
  });
}
async function checkUpdate() {
  const rel = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const version = String(rel.tag_name || '').replace(/^v/i, '');
  const update = verCmp(version, app.getVersion()) > 0;
  const pick = re => (rel.assets || []).find(a => re.test(a.name));
  // a portable copy updates from the zip; an installed one runs the NSIS setup
  const asset = update ? ((isPortable && pick(/^Tapehouse-Portable-\d/i)) || pick(/^Tapehouse-Setup-\d/i) || null) : null;
  return { version, update, current: app.getVersion(), url: rel.html_url, asset };
}
function updateEvent(payload) { if (win && !win.isDestroyed()) win.webContents.send('tapehouse:update', payload); }
let updating = false;
async function runUpdate(version) {
  if (updating) throw new Error('An update is already running');
  const info = await checkUpdate(); // fresh asset URLs; a release can change under us
  if (!info.update || info.version !== version || !info.asset) throw new Error('That update is no longer offered here — check the release page');
  updating = true;
  try {
    const dir = path.join(app.getPath('temp'), 'tapehouse-update');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, info.asset.name);
    await downloadTo(info.asset.browser_download_url, dest, p => updateEvent({ kind: 'progress', pct: Math.round(p * 100) }));
    if (isPortable) {
      let shown = dest;
      try { const zip = path.join(app.getPath('downloads'), info.asset.name); fs.copyFileSync(dest, zip); shown = zip; } catch (e) { /* temp copy is fine */ }
      shell.showItemInFolder(shown);
      updateEvent({ kind: 'saved', name: info.asset.name });
      return { saved: true, name: info.asset.name };
    }
    // installed build: the silent NSIS setup closes this app itself, but leaving
    // first is politer and makes sure no write is held open
    updateEvent({ kind: 'installing' });
    const child = spawn(dest, ['/S'], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => app.exit(0), 800);
    return { installing: true };
  } finally { updating = false; }
}
async function menuUpdateCheck() {
  const parent = win && !win.isDestroyed() ? win : undefined;
  try {
    const info = await checkUpdate();
    if (!info.update) { dialog.showMessageBox(parent, { type: 'info', title: 'Tapehouse', message: 'You’re up to date', detail: `Tapehouse ${app.getVersion()} is the newest release.`, buttons: ['OK'] }); return; }
    const r = await dialog.showMessageBox(parent, { type: 'info', title: 'Tapehouse', message: `Tapehouse ${info.version} is available`, detail: `You have ${app.getVersion()}. The app restarts while the update installs.`, buttons: ['Install and restart', 'Later'], defaultId: 0, cancelId: 1 });
    if (r.response !== 0) return;
    await runUpdate(info.version).catch(e => dialog.showMessageBox(parent, { type: 'warning', title: 'Tapehouse', message: 'The update didn’t finish', detail: e.message, buttons: ['OK'] }));
  } catch (e) {
    dialog.showMessageBox(parent, { type: 'warning', title: 'Tapehouse', message: 'Couldn’t check for updates', detail: e.message, buttons: ['OK'] });
  }
}
ipcMain.handle('updater:check', () => checkUpdate().catch(e => ({ error: e.message })));
ipcMain.handle('updater:start', (e, version) => runUpdate(String(version || '')).catch(err => ({ error: err.message })));

/* A project passed on the command line waits here until the page can take it. */
function takeProjectArg(argv) {
  const file = projectPathFrom(argv);
  if (file) pendingProjects.push(file);
}

/* Hands over everything that queued up while the page was still starting, in the
   order it arrived, so a later file never replaces one that is being opened. */
function sendPendingProject() {
  if (!pageReady || !win || win.isDestroyed()) return;
  while (pendingProjects.length) {
    const file = pendingProjects.shift();
    try {
      const bytes = fs.readFileSync(file);
      win.webContents.send('tapehouse:open-project', { name: path.basename(file), bytes });
    } catch (e) {
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Tapehouse',
        message: `Could not open ${path.basename(file)}`,
        detail: e.message,
        buttons: ['OK'],
      });
    }
  }
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

  win.webContents.on('did-finish-load', () => {
    pageReady = true;
    sendPendingProject();
  });
}

takeProjectArg(process.argv);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // Queue the project first: a second launch can land before this instance has
    // a window, and that file still has to open once the page is ready.
    takeProjectArg(argv);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    sendPendingProject();
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
