'use strict';
/* Bridges the shell's download outcome into the page: after an export is clicked,
   the page waits here to learn whether it was written and where, or cancelled. */
const { contextBridge, ipcRenderer } = require('electron');

const arrived = [];
const waiters = [];

ipcRenderer.on('tapehouse:download', (event, outcome) => {
  const waiter = waiters.shift();
  if (waiter) waiter(outcome);
  else arrived.push(outcome);
});

contextBridge.exposeInMainWorld('tapehouse', {
  nextDownload() {
    if (arrived.length) return Promise.resolve(arrived.shift());
    return new Promise(resolve => waiters.push(resolve));
  },
});
