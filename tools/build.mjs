#!/usr/bin/env node
/* Assembles src/ into dist/, the same output build.sh produces, without needing bash.
   dist/tapehouse-preview.html  — the page for claude.ai (mic does not work in a preview)
   dist/Tapehouse.html         — the standalone edition (mic works); this is what the Windows app loads
   The two names must differ by more than case: Windows cannot hold both files, and
   the one the shell loads would silently vanish from the package.
   Fonts come from src/fonts and are inlined, so the page needs no network. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root, 'src', name), 'utf8');

const PARTS = ['engine', 'vocal', 'app', 'plus', 'studio', 'listen', 'suite', 'create'];
const FONT_DIR = path.join(root, 'src', 'fonts');

const [css, body, fontCss, ...scripts] = await Promise.all([
  read('style.css'),
  read('body.html'),
  read('fonts/fonts.css'),
  ...PARTS.map(part => read(`${part}.js`)),
]);

// Turn each url(./x.woff2) in src/fonts/fonts.css into a data: URI, so the page
// carries the fonts and has nothing to fetch at runtime.
const fontFileNames = (await readdir(FONT_DIR)).filter(file => file.endsWith('.woff2'));
const fontBytes = new Map(await Promise.all(fontFileNames.map(async file => [
  file,
  (await readFile(path.join(FONT_DIR, file))).toString('base64'),
])));
const inlineFonts = fontCss.replace(/url\(\.\/([^)]+)\)/g, (match, file) => {
  const base64 = fontBytes.get(file);
  if (!base64) throw new Error(`src/fonts/fonts.css points at a missing file: ${file}`);
  return `url(data:font/woff2;base64,${base64})`;
});

const fragment = [
  '<title>Tapehouse</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<style id="th-fonts">',
  inlineFonts,
  '</style>',
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
await writeFile(path.join(root, 'dist', 'tapehouse-preview.html'), fragment);
await writeFile(path.join(root, 'dist', 'Tapehouse.html'), page);
/* The vocal DSP worklet as a real file next to the page: audioWorklet.addModule on a blob URL
   hangs on some Windows machines, so the engine prefers this same-origin file (blob stays as fallback). */
const voc = await read('vocal.js');
const dspCode = voc.slice(voc.indexOf('class TuneCore'), voc.indexOf('const DSP_NODES'));
const { dspModule } = new Function(dspCode + '\nreturn { dspModule };')();
await writeFile(path.join(root, 'dist', 'Tapehouse-dsp.js'), dspModule());
console.log(`built dist/tapehouse-preview.html and dist/Tapehouse.html (${fontBytes.size} fonts inlined) + DSP worklet file`);
