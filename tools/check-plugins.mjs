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
  vm.runInContext(src + '\n;globalThis.__out = { BUILTIN_PLUGINS, validatePlugin, TuneCore, detectPitch };', ctx, { timeout: 30000 });
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
/* Tune regressions. These run the real TuneCore on generated voices, so a change to the
   tracker that makes it drift, flicker between notes, or stop hearing part of the range
   fails the build instead of shipping. */
try {
  const TuneCore = plugins.TuneCore;
  const verify = (label, ok, detail) => { if (!ok) throw new Error(`${label}: ${detail}`); console.log(`  ok    ${label}`); };
  const SR = 48000;
  const mask = notes => notes.reduce((bits, note) => bits | (1 << note), 0);
  const MAJOR = mask([0, 2, 4, 5, 7, 9, 11]);
  const midiOf = hz => Math.round(69 + 12 * Math.log2(hz / 440));
  const base = { voice: 'tenor', mask: MAJOR, retune: 20, humanize: 0.2, flex: 0, amount: 1, formant: 0, fcorr: 1 };

  /* Sing a generated voice through the core; report the note changes it made. */
  const sing = (seconds, pitchAt, params, continueOn) => {
    const core = continueOn || new TuneCore(SR, { ...base, ...params });
    const input = new Float32Array(128), output = new Float32Array(128);
    const changes = []; let last = null, phase = 0;
    const frames = Math.ceil((seconds * SR) / input.length);
    const heard = new Float32Array(frames * input.length);
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < input.length; i++) {
        const t = (f * input.length + i) / SR;
        phase += (2 * Math.PI * pitchAt(t)) / SR;
        input[i] = 0.18 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
      }
      core.process(input, output, input.length);
      heard.set(output, f * input.length);
      if (core.target !== last) { if (last !== null) changes.push({ t: (f * input.length) / SR, note: core.target }); last = core.target; }
    }
    return { core, changes, output: heard };
  };

  /* 1. a key change releases a held note the new scale excludes, then retunes to an allowed one */
  {
    const b4 = 493.883;
    const first = sing(1, () => b4, { voice: 'soprano', retune: 0, humanize: 0 });
    verify('Tune hears a sustained B4', first.core.report().v === 1 && first.core.report().t === 71, JSON.stringify(first.core.report()));
    first.core.set({ mask: mask([0, 2, 4, 5, 7, 9, 10]) }); // C major -> F major: B is out, C is next
    verify('a new key releases the held note', first.core.report().t == null, JSON.stringify(first.core.report()));
    const rest = sing(1, () => b4, { voice: 'soprano', retune: 0, humanize: 0 }, first.core);
    const samples = rest.output.subarray(rest.output.length - 9600);
    const amp = hz => {
      let re = 0, im = 0;
      for (let i = 0; i < samples.length; i++) { const phase = (2 * Math.PI * hz * i) / SR; re += samples[i] * Math.cos(phase); im -= samples[i] * Math.sin(phase); }
      return (2 * Math.hypot(re, im)) / samples.length;
    };
    verify('and retunes the note into the new key', rest.core.report().t === 72 && amp(523.251) > amp(b4) * 4,
      `target ${rest.core.report().t}, B4 ${amp(b4).toFixed(4)}, C5 ${amp(523.251).toFixed(4)}`);
  }

  /* 2. a note below the chosen voice type still tunes (the presets are a preference, not a gate) */
  {
    const low = sing(1.4, () => 68, {}); // 68 Hz with the Tenor preset, nearest scale note is C2 65.41
    verify('a note below the voice preset still tunes', low.core.report().v === 1 && low.core.report().t === midiOf(65.41),
      JSON.stringify(low.core.report()));
    const high = sing(1.4, () => 1046.5, { voice: 'soprano' });
    verify('a note above the voice preset still tunes', high.core.report().v === 1 && high.core.report().t === midiOf(1046.5),
      JSON.stringify(high.core.report()));
  }

  /* 3. a wide vibrato sitting on a note boundary must not re-tune to the neighbour note */
  {
    const straddle = sing(2, t => 207.65 * Math.pow(2, (60 * Math.sin(2 * Math.PI * 4.5 * t)) / 1200), { retune: 0, humanize: 0 });
    verify('a vibrato over a note boundary holds one note', straddle.changes.length === 0,
      `${straddle.changes.length} changes: ${straddle.changes.map(c => c.note).join(',')}`);
  }

  /* 4. a real note change is still followed, and quickly */
  {
    const jump = sing(1.4, t => (t < 0.6 ? 261.63 : 293.66), { humanize: 0.1 });
    const change = jump.changes.find(c => c.note === midiOf(293.66));
    verify('a note change is followed within 120 ms', !!change && change.t < 0.72, JSON.stringify(jump.changes));
    verify('and the new note is the right one', jump.core.report().t === midiOf(293.66), JSON.stringify(jump.core.report()));
  }
  /* Zero depth should not process the voice at all (apart from the fixed delay). This
     signal combines voiced harmonics and deterministic breath-like noise. */
  {
    const core = new TuneCore(SR, { ...base, amount: 0 });
    const input = new Float32Array(128), output = new Float32Array(128), all = new Float32Array(SR), heard = new Float32Array(SR);
    let seed = 42;
    for (let i = 0; i < all.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      all[i] = 0.15 * Math.sin(2 * Math.PI * (173 + i / SR * 12) * i / SR) + 0.03 * (seed / 2147483648);
    }
    for (let at = 0; at < all.length; at += 128) {
      input.set(all.subarray(at, at + 128)); core.process(input, output, 128); heard.set(output, at);
    }
    let peak = 0;
    for (let i = core.L; i < heard.length; i++) peak = Math.max(peak, Math.abs(heard[i] - all[i - core.L]));
    verify('zero Tune depth preserves the delayed original', peak < 1e-6, `peak error ${peak}`);
  }

  /* When breath/noise is unvoiced, it should pass through without grain artifacts. */
  {
    const core = new TuneCore(SR, { ...base, retune: 40, humanize: 0.3 });
    const input = new Float32Array(128), output = new Float32Array(128), all = new Float32Array(SR), heard = new Float32Array(SR);
    let seed = 91;
    for (let i = 0; i < all.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; all[i] = 0.1 * (seed / 2147483648); }
    let voiced = 0;
    for (let at = 0; at < all.length; at += 128) {
      input.set(all.subarray(at, at + 128)); core.process(input, output, 128); heard.set(output, at);
      if (core.voiced) voiced++;
    }
    let peak = 0;
    for (let i = core.L; i < heard.length; i++) peak = Math.max(peak, Math.abs(heard[i] - all[i - core.L]));
    verify('unvoiced noise passes through without grains', voiced === 0 && peak < 1e-6, `voiced frames ${voiced}, peak error ${peak}`);
  }

  /* Slow retune must remain slow at note onsets rather than being forced to 12 ms. */
  {
    const slow = sing(0.08, () => 440 * Math.pow(2, 35 / 1200), { mask: 0xFFF, retune: 80, humanize: 0, flex: 0 });
    const fast = sing(0.08, () => 440 * Math.pow(2, 35 / 1200), { mask: 0xFFF, retune: 0, humanize: 0, flex: 0 });
    verify('slower retune preserves the start of a note', Math.abs(slow.core.s) < Math.abs(fast.core.s) * 0.75,
      `slow ${slow.core.s.toFixed(3)}, fast ${fast.core.s.toFixed(3)}`);
  }

  /* 5. the tuner reads a real pitch accurately - the readout was once 87 cents sharp */
  {
    const readings = [];
    for (const hz of [55, 82.41, 110, 146.83, 220, 261.63, 329.63, 440, 523.25, 880, 1046.5]) {
      const samples = new Float32Array(2048);
      for (let i = 0; i < samples.length; i++) {
        const t = i / SR;
        samples[i] = 0.2 * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(4 * Math.PI * hz * t) + 0.2 * Math.sin(6 * Math.PI * hz * t));
      }
      const r = plugins.detectPitch(samples, SR);
      readings.push({ hz, cents: r ? 1200 * Math.log2(r.f / hz) : null });
    }
    const wrong = readings.filter(r => r.cents == null || Math.abs(r.cents) > 3);
    verify('the tuner reads every note within 3 cents', wrong.length === 0, wrong.map(r => `${r.hz}Hz ${r.cents == null ? 'no note' : r.cents.toFixed(1) + 'ct'}`).join(', '));
  }
} catch (e) {
  console.error(`check-plugins: Tune regression test failed: ${e.message}`);
  bad++;
}
if (bad) process.exit(1);
console.log(`plugins ok (${plugins.BUILTIN_PLUGINS.length} built-in manifests validate; Tune regressions pass)`);
