'use strict';
/* Bridges the shell's download outcome into the page: after an export is clicked,
   the page waits here to learn whether it was written and where, or cancelled. */
const { contextBridge, ipcRenderer } = require('electron');

const arrived = [];
const waiters = [];
const projects = [];
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

contextBridge.exposeInMainWorld('tapehouse', {
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
});
