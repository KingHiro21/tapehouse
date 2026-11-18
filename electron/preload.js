'use strict';
/* Bridges the shell's download outcome into the page: after an export is clicked,
   the page waits here to learn whether it was written and where, or cancelled. */
const { contextBridge, ipcRenderer } = require('electron');

const arrived = [];
const waiters = [];
const projects = [];
const updateHandlers = [];
let projectListener = null;

ipcRenderer.on('tapehouse:download', (event, outcome) => {
  const waiter = waiters.shift();
  if (waiter) waiter(outcome);
  else arrived.push(outcome);
});

ipcRenderer.on('tapehouse:open-project', (event, project) => {
  if (projectListener) projectListener(project);
  else projects.push(project);
});

ipcRenderer.on('tapehouse:update', (event, ev) => {
  for (const fn of updateHandlers) fn(ev);
});

contextBridge.exposeInMainWorld('tapehouse', {
  isShell: true,
  nextDownload() {
    if (arrived.length) return Promise.resolve(arrived.shift());
    return new Promise(resolve => waiters.push(resolve));
  },
  // A project double-clicked in Explorer, or dropped on the exe. Anything that
  // arrived before the page asked is replayed straight away.
  onOpenProject(callback) {
    projectListener = callback;
    while (projects.length) callback(projects.shift());
  },
  /* Updates: the page decides when to look (auto-check on start unless turned
     off) and always asks before anything downloads or installs. */
  updateCheck: () => ipcRenderer.invoke('updater:check'),
  updateStart: version => ipcRenderer.invoke('updater:start', version),
  onUpdate: cb => { updateHandlers.push(cb); },
});
