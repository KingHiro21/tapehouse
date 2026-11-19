#!/usr/bin/env node
/* Loads the built page's plugin manifests the way the app does and validates
   every one of them, without launching a window. This catches the class of bug
   that made the app fail to boot: a built-in plugin the validator rejects
   (for example one graph node too many) leaves the whole page dead, and nothing
   else in the build noticed.

   It runs the real build output (dist/Tapehouse.html) against the real
   validatePlugin, with a small stub for the browser globals the file touches at
   load time. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist', 'Tapehouse.html'), 'utf8');
const m = html.match(/<script id="th-app">([\s\S]*?)<\/script>/);
if (!m) { console.error('check-plugins: could not find the app script in dist/Tapehouse.html'); process.exit(1); }

/* Only the plugin manifests are needed. Rather than boot the whole app (it wants a
   DOM, storage and audio), the source up to the end of the plugin registrations is
   evaluated with the few globals it reads. */
let src = m[1];
// The page ends with boot(); everything before it only *defines* things (the plugin
// registrations live all over the sources), so the call is what gets skipped.
const bootAt = src.lastIndexOf(String.fromCharCode(10) + "boot();");
if (bootAt > 0) src = src.slice(0, bootAt);

const sandbox = {
  console,
  window: { matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), location: { hash: '', search: '' }, addEventListener() {}, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: null },
  navigator: { userAgent: 'node', platform: 'node', mediaDevices: {} },
  document: { createElement: () => ({ style: {}, setAttribute() {}, append() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, children: [] }), createElementNS: () => ({ setAttribute() {}, append() {}, style: {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: { classList: { add() {}, remove() {}, toggle() {} }, append() {}, addEventListener() {} }, documentElement: { style: {} }, visibilityState: 'visible' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  indexedDB: null,
  Blob: class { constructor() {} },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  addEventListener() {}, removeEventListener() {}, fetch: async () => ({ ok: false, json: async () => ({}) }),
  performance: { now: () => 0 },
  devicePixelRatio: 1, AudioContext: class {}, OfflineAudioContext: class {}, AudioWorkletNode: class {},
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

let plugins;
try {
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src + '\n;globalThis.__out = { BUILTIN_PLUGINS, validatePlugin, TuneCore };', ctx, { timeout: 30000 });
  plugins = sandbox.__out;
} catch (e) {
  console.error('check-plugins: the app script failed to load: ' + e.message);
  process.exit(1);
}
if (!plugins || !Array.isArray(plugins.BUILTIN_PLUGINS) || !plugins.BUILTIN_PLUGINS.length) { console.error('check-plugins: no built-in plugins found'); process.exit(1); }

let bad = 0;
const seen = new Set();
for (const p of plugins.BUILTIN_PLUGINS) {
  try {
    const man = plugins.validatePlugin(p);
    if (seen.has(man.id)) { console.error(`check-plugins: duplicate plugin id ${man.id}`); bad++; }
    seen.add(man.id);
    if (man.type === 'effect' && !man.script && (!man.graph || !man.graph.length)) { console.error(`check-plugins: ${man.id} has no graph`); bad++; }
  } catch (e) {
    console.error(`check-plugins: ${p && p.id} is rejected by the validator: ${e.message}`);
    bad++;
  }
}
/* Regression: changing the song scale while singing must release a held note
   that the new scale excludes, then correct the signal to an allowed note. */
try {
  const TuneCore = plugins.TuneCore;
  const verify = (label, ok, detail) => { if (!ok) throw new Error(`${label}: ${detail}`); console.log(`  ok    ${label}`); };
  const mask = notes => notes.reduce((bits, note) => bits | (1 << note), 0);
  const core = new TuneCore(48000, { voice: 'soprano', mask: mask([0, 2, 4, 5, 7, 9, 11]), retune: 0, humanize: 0, flex: 0, amount: 1 });
  const input = new Float32Array(128), output = new Float32Array(128);
  const b4 = 493.883;
  const sing = frames => {
    for (let start = 0; start < frames; start += input.length) {
      for (let i = 0; i < input.length; i++) {
        const t = (core.n + i) / 48000;
        input[i] = 0.25 * (Math.sin(2 * Math.PI * b4 * t) + 0.35 * Math.sin(4 * Math.PI * b4 * t) + 0.12 * Math.sin(6 * Math.PI * b4 * t));
      }
      core.process(input, output, input.length);
    }
  };
  sing(48000);
  verify('Tune detects the sustained B4 before a key change', core.report().v && core.report().t === 71, JSON.stringify(core.report()));
  core.set({ mask: mask([0, 2, 4, 5, 7, 9, 10]) }); // C major -> F major excludes B; next allowed note is C.
  verify('Tune releases a held target excluded by the new scale', core.report().t == null, JSON.stringify(core.report()));
  sing(48000);
  const rep = core.report();
  const samples = new Float32Array(9600);
  for (let start = 0; start < samples.length; start += input.length) {
    for (let i = 0; i < input.length; i++) {
      const t = (core.n + i) / 48000;
      input[i] = 0.25 * (Math.sin(2 * Math.PI * b4 * t) + 0.35 * Math.sin(4 * Math.PI * b4 * t) + 0.12 * Math.sin(6 * Math.PI * b4 * t));
    }
    core.process(input, output, input.length);
    samples.set(output, start);
  }
  const amplitude = hz => {
    let re = 0, im = 0;
    for (let i = 0; i < samples.length; i++) { const phase = 2 * Math.PI * hz * i / 48000; re += samples[i] * Math.cos(phase); im -= samples[i] * Math.sin(phase); }
    return 2 * Math.hypot(re, im) / samples.length;
  };
  verify('Tune corrects the sustained note to the new scale', rep.t === 72 && amplitude(523.251) > amplitude(b4) * 4, `report ${JSON.stringify(rep)}, B4 ${amplitude(b4).toFixed(4)}, C5 ${amplitude(523.251).toFixed(4)}`);
} catch (e) {
  console.error(`check-plugins: Tune regression test failed: ${e.message}`);
  bad++;
}
if (bad) process.exit(1);
console.log(`plugins ok (${plugins.BUILTIN_PLUGINS.length} built-in manifests validate; Tune key-change regression passes)`);
