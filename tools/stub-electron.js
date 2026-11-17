'use strict';
/* A stand-in for Electron's main-process API, just big enough to load
   electron/main.js with plain Node. Everything the app touches is recorded on
   the exported `__calls` object so tools/check-shell.cjs can assert on it. */

const { version } = require('../package.json');

const calls = {
  privilegedSchemes: [],
  switches: [],
  protocolHandlers: {},
  permissionRequest: null,
  permissionCheck: null,
  menuTemplate: null,
  menu: null,
  windows: [],
  dialogs: [],
  externalUrls: [],
  loadedUrls: [],
  appEvents: {},
  overriddenPaths: {},
  downloadHandler: null,
  saveDialogs: [],
  saveDialogResult: { canceled: false, filePath: '/sessions/Tapehouse Bounce.wav' },
  ready: false,
  quit: false,
};

class FakeWebContents {
  constructor() {
    this.windowOpenHandler = null;
    this.navigateHandler = null;
    this.sent = [];
    this.destroyed = false;
    this.handlers = {};
  }
  isDestroyed() { return this.destroyed; }
  send(channel, payload) { this.sent.push({ channel, payload }); }
  setWindowOpenHandler(fn) { this.windowOpenHandler = fn; }
  on(event, fn) {
    (this.handlers[event] ||= []).push(fn);
    if (event === 'will-navigate') this.navigateHandler = fn;
  }
  fire(event, ...args) {
    for (const fn of this.handlers[event] || []) fn(...args);
  }
}

class BrowserWindow {
  constructor(options) {
    this.options = options;
    this.webContents = new FakeWebContents();
    this.shown = false;
    this.minimized = false;
    this.destroyed = false;
    calls.windows.push(this);
  }
  isDestroyed() { return this.destroyed; }
  once(event, fn) { if (event === 'ready-to-show') this.showOnReady = fn; }
  on(event, fn) { if (event === 'closed') this.closedHandler = fn; }
  show() { this.shown = true; }
  loadURL(url) { this.loadedUrl = url; calls.loadedUrls.push(url); }
  isMinimized() { return this.minimized; }
  restore() { this.minimized = false; }
  focus() { this.focused = true; }
}

const app = {
  getPath(name) { calls.paths = { ...(calls.paths || {}), [name]: '/downloads' }; return '/downloads'; },
  setPath(name, value) { calls.overriddenPaths[name] = value; },
  // main.js calls app.commandLine.appendSwitch, as real Electron does.
  commandLine: {
    appendSwitch(name, value) { calls.switches.push({ name, value }); },
  },
  getVersion() { return version; },
  requestSingleInstanceLock() { return true; },
  quit() { calls.quit = true; },
  whenReady() {
    return Promise.resolve().then(() => { calls.ready = true; });
  },
  on(event, fn) { calls.appEvents[event] = fn; },
};

const Menu = {
  buildFromTemplate(template) { calls.menuTemplate = template; return template; },
  setApplicationMenu(menu) { calls.menu = menu; },
};

const dialog = {
  showMessageBox(window, options) { calls.dialogs.push({ window, options }); },
  // The harness sets saveDialogResult to play out a choice or a cancellation.
  showSaveDialogSync(window, options) {
    calls.saveDialogs.push({ window, options });
    return calls.saveDialogResult;
  },
};

const protocol = {
  registerSchemesAsPrivileged(schemes) { calls.privilegedSchemes.push(...schemes); },
  handle(scheme, handler) { calls.protocolHandlers[scheme] = handler; },
};

const session = {
  defaultSession: {
    setPermissionRequestHandler(fn) { calls.permissionRequest = fn; },
    setPermissionCheckHandler(fn) { calls.permissionCheck = fn; },
    on(event, fn) { if (event === 'will-download') calls.downloadHandler = fn; },
  },
};

const shell = {
  openExternal(url) { calls.externalUrls.push(url); },
  openPath() {},
};

module.exports = {
  app,
  BrowserWindow,
  Menu,
  dialog,
  protocol,
  session,
  shell,
  __calls: calls,
};
