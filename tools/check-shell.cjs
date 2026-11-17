#!/usr/bin/env node
'use strict';
/* Checks the desktop shell (electron/main.js) with plain Node: `electron` is
   redirected to tools/stub-electron.js, the window never opens, and the app://
   handler, permission policy, menu and window options are asserted directly. */

const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const stubPath = path.join(__dirname, 'stub-electron.js');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return stubPath;
  return resolveFilename.call(this, request, ...rest);
};

const electron = require(stubPath);
const calls = electron.__calls;

// Loading the shell registers the app scheme and the single-instance wiring;
// everything else happens once the app signals it is ready.
require('../electron/main.js');

let failed = 0;
function check(label, ok, detail) {
  if (ok) console.log(`  ok    ${label}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
}

async function run() {
  const app = electron.app;
  await app.whenReady();
  await new Promise(resolve => setImmediate(resolve));

  const schemes = calls.privilegedSchemes;
  check('app:// registered as standard + secure',
    schemes.some(s => s.scheme === 'app' && s.privileges && s.privileges.standard === true && s.privileges.secure === true),
    JSON.stringify(schemes));

  check('autoplay unlocked without a gesture',
    calls.switches.some(s => s.name === 'autoplay-policy' && s.value === 'no-user-gesture-required'),
    JSON.stringify(calls.switches));

  check('single instance lock taken, app not quit', calls.quit === false);

  const serve = calls.protocolHandlers.app;
  check('app:// protocol handler registered', typeof serve === 'function');
  if (typeof serve === 'function') {
    const page = await serve(new Request('app://tapehouse/Tapehouse.html'));
    const html = await page.text();
    check('Tapehouse.html served as html', page.status === 200 &&
      String(page.headers.get('content-type')).startsWith('text/html'), `status ${page.status}`);
    check('page is the built app', html.includes('id="th-app"') && html.includes('const APP_VERSION'),
      `${html.length} bytes`);
    const built = fs.readFileSync(path.join(__dirname, '..', 'dist', 'Tapehouse.html'), 'utf8');
    check('fonts are bundled, not fetched',
      !/fonts\.googleapis|fonts\.gstatic/.test(built) && built.includes('id="th-fonts"') && built.includes('data:font/woff2'),
      'the built page still references a font host');

    check('/ serves Tapehouse.html', (await serve(new Request('app://tapehouse/'))).status === 200);
    check('missing file is 404', (await serve(new Request('app://tapehouse/nope.css'))).status === 404);
    check('path traversal is 404', (await serve(new Request('app://tapehouse/../package.json'))).status === 404);
    check('foreign host is 404', (await serve(new Request('app://elsewhere/Tapehouse.html'))).status === 404);
  }

  const ask = (permission, origin) => {
    let answer = null;
    calls.permissionRequest({ getURL: () => 'app://tapehouse/Tapehouse.html' }, permission,
      value => { answer = value; }, { requestingUrl: origin });
    return answer;
  };
  check('mic allowed for the app origin', ask('media', 'app://tapehouse/Tapehouse.html') === true);
  check('clipboard write allowed', ask('clipboard-sanitized-write', 'app://tapehouse/Tapehouse.html') === true);
  check('unrelated permission denied', ask('geolocation', 'app://tapehouse/Tapehouse.html') === false);
  check('remote page cannot get the mic', ask('media', 'https://example.com') === false);
  check('permission check mirrors the policy',
    calls.permissionCheck(null, 'audioCapture', 'app://tapehouse/Tapehouse.html') === true &&
    calls.permissionCheck(null, 'audioCapture', 'https://example.com') === false);

  const labels = (calls.menu || []).map(item => item.label);
  check('menu is View + Help only', labels.join(',') === 'View,Help', labels.join(','));
  const view = (calls.menu || []).find(item => item.label === 'View');
  const roles = view && view.submenu ? view.submenu.filter(i => i.role).map(i => i.role) : [];
  check('View keeps reload, devtools and fullscreen',
    roles.join(',') === 'reload,toggleDevTools,togglefullscreen', roles.join(','));

  const win = calls.windows[0];
  check('one window created', calls.windows.length === 1, `${calls.windows.length} windows`);
  if (win) {
    check('window is a normal studio size', win.options.width >= 1200 && win.options.height >= 800,
      `${win.options.width}x${win.options.height}`);
    check('window keeps the transport usable', win.options.minWidth === 1100 && win.options.minHeight === 640,
      `${win.options.minWidth}x${win.options.minHeight}`);
    check('preload bridges download outcomes',
      typeof win.options.webPreferences.preload === 'string' && fs.existsSync(win.options.webPreferences.preload),
      win.options.webPreferences.preload);
    check('renderer stays sandboxed', win.options.webPreferences.sandbox === true &&
      win.options.webPreferences.contextIsolation === true &&
      win.options.webPreferences.nodeIntegration === false);
    check('audio keeps running unfocused', win.options.webPreferences.backgroundThrottling === false);
    check('loaded from the app origin', win.loadedUrl === 'app://tapehouse/Tapehouse.html', win.loadedUrl);
    // Electron fires ready-to-show on the first paint; play it out here.
    if (typeof win.showOnReady === 'function') win.showOnReady();
    check('window shown once ready', win.shown === true);
    check('closing the window quits', typeof calls.appEvents['window-all-closed'] === 'function' &&
      (calls.appEvents['window-all-closed'](), calls.quit === true));

    const opened = win.webContents.windowOpenHandler({ url: 'https://example.com/docs' });
    check('external links open in the browser and stay out of the app',
      opened && opened.action === 'deny' && calls.externalUrls.includes('https://example.com/docs'));

    let prevented = false;
    win.webContents.navigateHandler({ preventDefault() { prevented = true; } }, 'https://example.com/away');
    check('navigation away is blocked', prevented === true &&
      calls.externalUrls.includes('https://example.com/away'));
  }

  check('downloads are handled by the shell', typeof calls.downloadHandler === 'function');
  if (typeof calls.downloadHandler === 'function') {
    const fakeItem = name => {
      const handlers = {};
      return {
        filename: name,
        savePath: null,
        cancelled: false,
        getFilename() { return this.filename; },
        getSavePath() { return this.savePath; },
        setSavePath(value) { this.savePath = value; },
        cancel() { this.cancelled = true; this.fire('done', 'cancelled'); },
        once(event, fn) { handlers[event] = fn; },
        fire(event, state) { if (handlers[event]) handlers[event]({}, state); },
      };
    };
    const page = { sent: [], isDestroyed: () => false, send(channel, payload) { this.sent.push({ channel, payload }); } };

    const bounce = fakeItem('Tapehouse Bounce.wav');
    calls.saveDialogResult = { canceled: false, filePath: 'D:/Sessions/Bounce.wav' };
    calls.downloadHandler({ preventDefault() {} }, bounce, page);

    const asked = calls.saveDialogs[0];
    check('export asks where to save', calls.saveDialogs.length === 1 && !!asked, `${calls.saveDialogs.length} dialogs`);
    check('dialog starts in Downloads with the export name',
      !!asked && asked.options.defaultPath === '/downloads/Tapehouse Bounce.wav', asked && asked.options.defaultPath);
    check('WAV exports offer a WAV filter',
      !!asked && asked.options.filters[0].extensions.join(',') === 'wav', asked && JSON.stringify(asked.options.filters));
    check('chosen folder is used', bounce.savePath === 'D:/Sessions/Bounce.wav', bounce.savePath);
    check('saving is not cancelled when a folder is picked', bounce.cancelled === false);

    bounce.fire('done', 'completed');
    const reported = page.sent[page.sent.length - 1];
    check('page hears where the export went',
      !!reported && reported.channel === 'tapehouse:download' && reported.payload.canceled === false &&
      reported.payload.path === 'D:/Sessions/Bounce.wav', JSON.stringify(reported && reported.payload));

    const dismissed = fakeItem('Tapehouse.zip');
    calls.saveDialogResult = { canceled: true, filePath: undefined };
    calls.downloadHandler({ preventDefault() {} }, dismissed, page);
    check('dismissing the dialog cancels the export',
      dismissed.cancelled === true && dismissed.savePath === null, `cancelled=${dismissed.cancelled}`);
    const told = page.sent[page.sent.length - 1];
    check('page is told the save was cancelled',
      !!told && told.payload.canceled === true && told.payload.path === null, JSON.stringify(told && told.payload));
  }

  const help = (calls.menu || []).find(item => item.label === 'Help');
  const about = help && help.submenu.find(item => item.label === 'About Tapehouse');
  if (about) {
    about.click();
    const shown = calls.dialogs[0];
    check('About reports the packaged version',
      !!shown && String(shown.options.message).includes(app.getVersion()),
      shown && shown.options.message);
  } else {
    check('About item exists', false);
  }

  if (failed) {
    console.log(`\nshell check failed: ${failed} problem${failed === 1 ? '' : 's'}`);
    process.exitCode = 1;
  } else {
    console.log('\nshell ok');
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
