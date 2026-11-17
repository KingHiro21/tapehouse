'use strict';
/* Windows hands the shell a path when someone double-clicks a .tapehouse file or
   drops one on Tapehouse.exe. Switches and other arguments are ignored. */
const fs = require('node:fs');
const path = require('node:path');

const EXTENSION = '.tapehouse';

function projectPathFrom(argv, existsSync = fs.existsSync) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue;
    if (!arg.toLowerCase().endsWith(EXTENSION)) continue;
    const file = path.resolve(arg);
    if (existsSync(file)) return file;
  }
  return null;
}

module.exports = { projectPathFrom, EXTENSION };
