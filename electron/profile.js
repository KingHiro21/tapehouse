'use strict';
/* Where a copy of Tapehouse keeps its projects.
   A portable build ships `portable.txt` beside Tapehouse.exe and keeps everything
   in a `data` folder there, so the whole folder can move between machines. The
   installed app has no marker and uses the normal Windows profile. */
const fs = require('node:fs');
const path = require('node:path');

function portableDataDir(exeDir = path.dirname(process.execPath)) {
  if (!fs.existsSync(path.join(exeDir, 'portable.txt'))) return null;
  const dir = path.join(exeDir, 'data');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch {
    // Read-only media (a locked USB stick, a Program Files folder): keep the app
    // usable on the normal profile rather than refusing to start.
    return null;
  }
}

module.exports = { portableDataDir };
