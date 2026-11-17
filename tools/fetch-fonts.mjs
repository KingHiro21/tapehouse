#!/usr/bin/env node
/* Refreshes the bundled fonts in src/fonts/ from Google Fonts.
   Only the latin and latin-ext subsets are kept: the app ships them inside the
   page, so it never needs the network — which is the point for the desktop build. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src', 'fonts');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Michroma&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const KEEP = new Set(['latin', 'latin-ext']);

const css = await (await fetch(CSS_URL, { headers: { 'user-agent': UA } })).text();
if (!css.includes('@font-face')) throw new Error(`no @font-face in the Google Fonts response (${css.length} bytes)`);

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
const kept = [];

await mkdir(outDir, { recursive: true });
for (const [, subset, block] of blocks) {
  if (!KEEP.has(subset)) continue;
  const family = /font-family:\s*'([^']+)'/.exec(block)[1];
  const weight = /font-weight:\s*(\d+)/.exec(block)[1];
  const url = /url\((https:[^)]+)\)/.exec(block)[1];
  const file = `${slug(family)}-${weight}-${subset}.woff2`;
  const bytes = Buffer.from(await (await fetch(url, { headers: { 'user-agent': UA } })).arrayBuffer());
  await writeFile(path.join(outDir, file), bytes);
  kept.push({ file, bytes: bytes.length, family, weight, subset });
  // Point the rule at the local copy; build.mjs turns it into a data: URI.
  kept[kept.length - 1].rule = block.replace(url, `./${file}`);
}

// Keep the rules in Google's order so the unicode-range fallbacks still line up.
const fontCss = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
  .filter(([, subset]) => KEEP.has(subset))
  .map(([, subset, block]) => {
    const family = /font-family:\s*'([^']+)'/.exec(block)[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)[1];
    return block.replace(/url\(https:[^)]+\)/, `url(./${slug(family)}-${weight}-${subset}.woff2)`);
  })
  .join('\n');

await writeFile(path.join(outDir, 'fonts.css'), fontCss + '\n');
const total = kept.reduce((n, f) => n + f.bytes, 0);
console.log(`wrote ${kept.length} font files (${Math.round(total / 1024)} KB) and src/fonts/fonts.css`);
for (const f of kept) console.log(`  ${f.file}  ${Math.round(f.bytes / 1024)} KB`);
