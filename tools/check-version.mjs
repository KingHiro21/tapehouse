#!/usr/bin/env node
/* Guards the release pipeline: the app version must agree everywhere, or CI
   builds assets with the wrong name and users install old builds (this happened:
   the v2.4.8 release shipped files named 2.4.7 because the bump was forgotten).
   Checks src/engine.js APP_VERSION against package.json and package-lock.json. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFile(path.join(root, f), 'utf8');
const [engine, pkg, lock] = await Promise.all([read('src/engine.js'), read('package.json'), read('package-lock.json')]);

const engineV = (engine.match(/APP_VERSION = '([^']+)'/) || [])[1];
const pkgV = (JSON.parse(pkg).version);
const lockV = (JSON.parse(lock).version);

let ok = true;
if (!engineV) { console.error('check-version: APP_VERSION not found in src/engine.js'); ok = false; }
for (const [name, a, b] of [['engine.js vs package.json', engineV, pkgV], ['package.json vs package-lock.json', pkgV, lockV]]) {
  if (a !== b) { console.error(`check-version: ${name} disagree (${a} vs ${b}) — bump all three together`); ok = false; }
}
if (!/^\d+\.\d+\.\d+$/.test(engineV || '')) { console.error(`check-version: ${engineV} is not a semver version`); ok = false; }
if (ok) console.log(`version ok (${engineV})`);
process.exit(ok ? 0 : 1);
