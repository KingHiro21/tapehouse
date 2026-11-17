#!/usr/bin/env node
/* Builds the portable Windows app: out/Tapehouse-win32-x64/Tapehouse.exe
   No installer and no Wine needed, so it runs from Linux, macOS or Windows. */
import { packager } from '@electron/packager';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const [appDir] = await packager({
  dir: root,
  name: 'Tapehouse',
  platform: 'win32',
  arch: 'x64',
  out: path.join(root, 'out'),
  asar: true,
  overwrite: true,
  appVersion: version,
  appCopyright: 'Tapehouse',
  icon: path.join(root, 'build', 'icon.ico'),
  // Only the shell and the built page travel with the app.
  ignore: [/^\/?(build|src|tools|artifacts|out|node_modules|package-lock\.json|build\.sh|\.gitignore|README\.md)(\/|$)/],
  quiet: true,
});

console.log(`packaged ${path.relative(root, appDir)}/Tapehouse.exe`);
