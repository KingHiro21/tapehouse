#!/usr/bin/env node
/* Assembles src/ into dist/, the same output build.sh produces, without needing bash.
   dist/tapehouse.html  — the page for claude.ai (mic does not work in a preview)
   dist/Tapehouse.html  — the standalone edition (mic works); this is what the Windows app loads */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, 'src', name), 'utf8');

const PARTS = ['engine', 'vocal', 'app', 'plus', 'studio', 'listen', 'suite', 'create'];
const FONTS = 'https://fonts.googleapis.com/css2?family=Michroma&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap';

const [css, body, ...scripts] = await Promise.all([
  read('style.css'),
  read('body.html'),
  ...PARTS.map(part => read(`${part}.js`)),
]);

const fragment = [
  '<title>Tapehouse</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  `<link rel="stylesheet" href="${FONTS}">`,
  '<style id="th-style">',
].join('\n') + '\n'
  + css
  + '</style>' + '\n'
  + body
  + '<script id="th-app">' + '\n'
  + scripts.map(script => script + '\n').join('')
  + '</script>' + '\n';

const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0}</style></head><body>\n'
  + fragment
  + '</body></html>\n';

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'tapehouse.html'), fragment);
await writeFile(path.join(root, 'dist', 'Tapehouse.html'), page);
console.log('built dist/tapehouse.html and dist/Tapehouse.html');
