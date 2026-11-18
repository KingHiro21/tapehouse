'use strict';
/* =====================================================================
   Tapehouse — browser music studio
   Part 1: utilities, storage, plugin format, audio engine, file codecs
   ===================================================================== */

/* ---------- where we run ----------
   Inside claude.ai the page gets window.claude (downloads, Ask Claude) but no microphone.
   Saved as its own file and opened in Chrome or Edge, it gets the mic and normal downloads. */
const APP_VERSION = '2.4';
const STANDALONE = !(window.claude && typeof window.claude.use === 'function');
// Snapshot of the page as written, taken before anything renders, so the claude.ai view can hand out a standalone copy.
const PAGE_PARTS = (() => {
  try {
    const st = document.getElementById('th-style'), sc = document.getElementById('th-app'), body = document.body.cloneNode(true);
    body.querySelectorAll('script, style, title, meta, link').forEach(x => x.remove());
    return st && sc ? { css: st.textContent, markup: body.innerHTML, js: sc.textContent } : null;
  } catch (e) { return null; }
})();

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const dbToGain = db => Math.pow(10, db / 20);
const midiFreq = n => 440 * Math.pow(2, (n - 69) / 12);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
const isBlack = n => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
const COLORS = ['#e2b36b', '#c7a68a', '#a9a397', '#9db497', '#8ea5b2', '#a89bb6', '#c39589', '#cdbd8c'];
const OLD_COLORS = ['#f2a640', '#62c6d6', '#ef7d5e', '#a493f0', '#7dd892', '#e872ad', '#d8c95c', '#5f9ff0'];
const remapColor = c => { const i = OLD_COLORS.indexOf(String(c).toLowerCase()); return i >= 0 ? COLORS[i] : c; };
const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking', 'allpass'];
const AUDIO_EXT = ['wav', 'wave', 'mp3', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'webm', 'aif', 'aiff', 'caf', 'mp4'];
const extOf = n => (String(n).split('/').pop().match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
const fileName = n => String(n).split('/').pop();
const baseName = n => fileName(n).replace(/\.[^.]+$/, '') || 'Untitled';
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'plugin';
const safeFile = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'Tapehouse';
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
const fmtDur = s => !Number.isFinite(s) ? '–' : s < 10 ? s.toFixed(2) + 's' : s < 60 ? s.toFixed(1) + 's' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const fmtDb = g => g <= 0.0001 ? '−∞' : ((20 * Math.log10(g)) >= 0 ? '+' : '') + (20 * Math.log10(g)).toFixed(1);
const fmtPan = p => Math.abs(p) < 0.02 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100);
const utf8 = s => new TextEncoder().encode(s);
const disc = (...ns) => ns.forEach(n => { try { n && n.disconnect(); } catch (e) { /* already disconnected */ } });
function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; }

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  let value;
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (['checked', 'disabled', 'selected', 'hidden', 'draggable', 'tabIndex', 'multiple', 'readOnly', 'spellcheck'].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) { if (k == null || k === false) continue; e.append(k instanceof Node ? k : String(k)); }
  if (value !== undefined) e.value = value;
  return e;
}

/* ---------- storage: IndexedDB with in-memory fallback ---------- */
const Store = (() => {
  const STORES = ['samples', 'sampleData', 'plugins', 'projects', 'meta'];
  const mem = Object.fromEntries(STORES.map(s => [s, new Map()]));
  let dbp = null, durable = true;
  const keyOf = (store, v) => store === 'meta' ? v.key : v.id;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(resolve => {
      let done = false;
      const res = v => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => { if (!done) { durable = false; res(null); } }, 3000);
      try {
        const r = indexedDB.open('tapehouse', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => { durable = false; res(null); };
        r.onblocked = () => { durable = false; res(null); };
      } catch (e) { durable = false; res(null); }
    });
    return dbp;
  }
  function req(d, store, mode, fn) {
    return new Promise((res, rej) => {
      let out;
      const t = d.transaction(store, mode);
      const r = fn(t.objectStore(store));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error || new Error('Storage error'));
      t.onabort = () => rej(t.error || new Error('Storage was full or blocked'));
    });
  }
  return {
    get durable() { return durable; },
    open,
    async get(store, key) { const d = await open(); return d ? req(d, store, 'readonly', s => s.get(key)) : mem[store].get(key); },
    async put(store, val) { const d = await open(); if (!d) { mem[store].set(keyOf(store, val), val); return; } return req(d, store, 'readwrite', s => s.put(val)); },
    async del(store, key) { const d = await open(); if (!d) { mem[store].delete(key); return; } return req(d, store, 'readwrite', s => s.delete(key)); },
    async all(store) { const d = await open(); return d ? req(d, store, 'readonly', s => s.getAll()) : [...mem[store].values()]; },
  };
})();

/* ---------- plugin format ---------- */
const REF = /^\$([A-Za-z_]\w*)(?:\*(-?\d*\.?\d+))?$/;
function resolveT(x, vals) {
  if (typeof x === 'string' && x[0] === '$') {
    const m = x.match(REF); if (!m) return x;
    const v = vals[m[1]];
    return (m[2] && typeof v === 'number') ? v * parseFloat(m[2]) : v;
  }
  if (Array.isArray(x)) return x.map(y => resolveT(y, vals));
  if (x && typeof x === 'object') { const o = {}; for (const k in x) o[k] = resolveT(x[k], vals); return o; }
  return x;
}
function paramDefaults(m) { const o = {}; for (const p of m.params || []) o[p.id] = p.default; return o; }
function effectiveParams(m, over) {
  const o = paramDefaults(m);
  if (over) for (const p of m.params || []) if (over[p.id] !== undefined) o[p.id] = over[p.id];
  return o;
}

function validatePlugin(o) {
  const fail = msg => { throw new Error(msg); };
  if (!o || typeof o !== 'object' || Array.isArray(o)) fail('Plugin manifest must be a JSON object.');
  if (o.format && o.format !== 'tapehouse-plugin') fail('"format" must be "tapehouse-plugin".');
  if (!['instrument', 'effect'].includes(o.type)) fail('"type" must be "instrument" or "effect".');
  if (typeof o.name !== 'string' || !o.name.trim()) fail('"name" is required.');
  const params = Array.isArray(o.params) ? o.params.map(p => ({ ...p })) : [];
  if (params.length > 16) fail('A plugin can have at most 16 params.');
  const ids = new Set();
  for (const p of params) {
    if (!p || typeof p.id !== 'string' || !/^[A-Za-z_]\w*$/.test(p.id)) fail(`Param id "${p && p.id}" must use letters, digits or _ and not start with a digit.`);
    if (ids.has(p.id)) fail(`Param "${p.id}" is defined twice.`);
    ids.add(p.id);
    p.label = String(p.label || p.id).slice(0, 18);
    if (Array.isArray(p.options)) {
      if (!p.options.length) fail(`Param "${p.id}" has an empty options list.`);
      p.options = p.options.map(x => (x && typeof x === 'object') ? { label: String(x.label ?? x.value), value: x.value } : { label: String(x), value: x });
      if (!p.options.some(x => x.value === p.default)) p.default = p.options[0].value;
    } else {
      if (![p.min, p.max, p.default].every(Number.isFinite) || p.min >= p.max) fail(`Param "${p.id}" needs numeric "min" < "max" and a "default".`);
      if (p.curve === 'log' && p.min <= 0) fail(`Param "${p.id}": a log curve needs min > 0.`);
      p.default = clamp(p.default, p.min, p.max);
    }
  }
  const checkRefs = (x, where) => {
    if (typeof x === 'string' && x[0] === '$') { const m = x.match(REF); if (!m || !ids.has(m[1])) fail(`${where} uses "${x}" but no param has that id.`); }
    else if (x && typeof x === 'object') for (const k in x) checkRefs(x[k], where);
  };
  if (o.type === 'instrument') {
    const v = o.voice;
    if (!v || !Array.isArray(v.oscillators) || !v.oscillators.length || v.oscillators.length > 8) fail('An instrument needs "voice.oscillators" with 1 to 8 entries.');
    for (const osc of v.oscillators) if (osc.wave && !WAVES.includes(osc.wave)) fail(`Unknown wave "${osc.wave}". Use ${WAVES.join(', ')}.`);
    if (v.lfo && v.lfo.target && !['pitch', 'filter', 'amp'].includes(v.lfo.target)) fail('"lfo.target" must be pitch, filter or amp.');
    checkRefs(v, 'voice');
  } else if (!o.script) {
    if (!Array.isArray(o.graph) || !o.graph.length || o.graph.length > 12) fail('An effect needs a "graph" with 1 to 12 nodes.');
    for (const n of o.graph) if (!n || !PRIMS[n.node]) fail(`Unknown node "${n && n.node}". Use one of: ${Object.keys(PRIMS).join(', ')}.`);
    checkRefs(o.graph, 'graph');
  }
  return {
    format: 'tapehouse-plugin', id: o.id, type: o.type, name: o.name.trim().slice(0, 48),
    author: o.author ? String(o.author).slice(0, 48) : '', description: o.description ? String(o.description).slice(0, 220) : '',
    params, voice: o.voice, graph: o.graph, script: !!o.script, processor: o.processor,
  };
}
function parseScriptPlugin(src) {
  const m = src.match(/^\s*\/\/\s*@tapehouse\s+(\{.*\})\s*$/m);
  if (!m) throw new Error('Script plugins start with a header line: // @tapehouse {"type":"effect", ...}');
  let man;
  try { man = JSON.parse(m[1]); } catch (e) { throw new Error('The @tapehouse header is not valid JSON.'); }
  if (man.type !== 'effect') throw new Error('Script plugins can be effects only.');
  if (typeof man.processor !== 'string' || !/^[\w-]+$/.test(man.processor)) throw new Error('The header needs "processor": the name you pass to registerProcessor().');
  if (!src.includes('registerProcessor')) throw new Error('The script never calls registerProcessor().');
  man.script = true;
  return validatePlugin(man);
}

const plugins = new Map(); // id -> {id, manifest, source, builtin}
const getPlugin = id => plugins.get(id);

const BUILTIN_PLUGINS = [
  { id: 'th.tape-keys', type: 'instrument', name: 'Tape Keys', author: 'Tapehouse', description: 'Soft electric-piano tone with a bell overtone.',
    params: [
      { id: 'tone', label: 'Tone', min: 300, max: 9000, default: 2600, curve: 'log', unit: 'Hz' },
      { id: 'decay', label: 'Decay', min: 0.1, max: 3, default: 0.9, unit: 's' },
      { id: 'release', label: 'Release', min: 0.02, max: 2, default: 0.35, unit: 's' },
      { id: 'bell', label: 'Bell', min: 0, max: 0.6, default: 0.22 }],
    voice: { gain: 0.42, oscillators: [{ wave: 'triangle', gain: 0.7 }, { wave: 'sine', octave: 1, gain: '$bell' }, { wave: 'sine', octave: 2, detune: 4, gain: '$bell*0.3' }],
      envelope: { attack: 0.004, decay: '$decay', sustain: 0.25, release: '$release' },
      filter: { type: 'lowpass', cutoff: '$tone', q: 0.6, envAmount: 1800, envelope: { attack: 0.003, decay: 0.35, sustain: 0, release: 0.3 } } } },
  { id: 'th.sunset-pad', type: 'instrument', name: 'Sunset Pad', author: 'Tapehouse', description: 'Wide detuned saws through a slow-moving filter.',
    params: [
      { id: 'cutoff', label: 'Cutoff', min: 200, max: 8000, default: 1500, curve: 'log', unit: 'Hz' },
      { id: 'detune', label: 'Detune', min: 0, max: 30, default: 11, unit: 'ct' },
      { id: 'attack', label: 'Attack', min: 0.01, max: 3, default: 0.7, unit: 's' },
      { id: 'release', label: 'Release', min: 0.1, max: 4, default: 1.6, unit: 's' },
      { id: 'motion', label: 'Motion', min: 0, max: 1500, default: 450, unit: 'Hz' }],
    voice: { gain: 0.22, oscillators: [{ wave: 'sawtooth', detune: '$detune', gain: 0.5 }, { wave: 'sawtooth', detune: '$detune*-1', gain: 0.5 }, { wave: 'square', octave: -1, gain: 0.18 }],
      envelope: { attack: '$attack', decay: 0.8, sustain: 0.85, release: '$release' },
      filter: { type: 'lowpass', cutoff: '$cutoff', q: 1.1, envAmount: 500, envelope: { attack: '$attack', decay: 1, sustain: 0.4, release: '$release' } },
      lfo: { target: 'filter', rate: 0.22, depth: '$motion' } } },
  { id: 'th.acid-bass', type: 'instrument', name: 'Acid Bass', author: 'Tapehouse', description: 'Squelchy resonant saw bass in the 303 tradition.',
    params: [
      { id: 'cutoff', label: 'Cutoff', min: 80, max: 4000, default: 420, curve: 'log', unit: 'Hz' },
      { id: 'resonance', label: 'Reso', min: 0.5, max: 22, default: 11 },
      { id: 'envmod', label: 'Env Mod', min: 0, max: 5000, default: 2400, unit: 'Hz' },
      { id: 'decay', label: 'Decay', min: 0.05, max: 1, default: 0.22, unit: 's' }],
    voice: { gain: 0.3, oscillators: [{ wave: 'sawtooth', gain: 0.8 }, { wave: 'square', octave: -1, gain: 0.22 }],
      envelope: { attack: 0.002, decay: 0.3, sustain: 0.55, release: 0.06 },
      filter: { type: 'lowpass', cutoff: '$cutoff', q: '$resonance', envAmount: '$envmod', envelope: { attack: 0.002, decay: '$decay', sustain: 0, release: 0.08 } } } },
  { id: 'th.sub-bass', type: 'instrument', name: 'Sub Bass', author: 'Tapehouse', description: 'Clean sine sub with a touch of triangle grit.',
    params: [
      { id: 'tone', label: 'Tone', min: 80, max: 2000, default: 600, curve: 'log', unit: 'Hz' },
      { id: 'grit', label: 'Grit', min: 0, max: 0.6, default: 0.14 },
      { id: 'release', label: 'Release', min: 0.02, max: 1, default: 0.12, unit: 's' }],
    voice: { gain: 0.55, oscillators: [{ wave: 'sine', gain: 1 }, { wave: 'triangle', gain: '$grit' }],
      envelope: { attack: 0.004, decay: 0.2, sustain: 0.95, release: '$release' }, filter: { type: 'lowpass', cutoff: '$tone', q: 0.5 } } },
  { id: 'th.square-lead', type: 'instrument', name: 'Square Lead', author: 'Tapehouse', description: 'Bright chip-style lead with vibrato.',
    params: [
      { id: 'cutoff', label: 'Cutoff', min: 400, max: 10000, default: 3200, curve: 'log', unit: 'Hz' },
      { id: 'vibrato', label: 'Vibrato', min: 0, max: 40, default: 10, unit: 'ct' },
      { id: 'release', label: 'Release', min: 0.02, max: 1.5, default: 0.25, unit: 's' }],
    voice: { gain: 0.2, oscillators: [{ wave: 'square', gain: 0.6 }, { wave: 'square', detune: 7, gain: 0.4 }, { wave: 'sawtooth', octave: 1, gain: 0.12 }],
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.7, release: '$release' },
      filter: { type: 'lowpass', cutoff: '$cutoff', q: 2, envAmount: 1200, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 } },
      lfo: { target: 'pitch', rate: 5.5, depth: '$vibrato' } } },
  { id: 'th.glass-pluck', type: 'instrument', name: 'Glass Pluck', author: 'Tapehouse', description: 'Short glassy pluck for arps and hooks.',
    params: [
      { id: 'brightness', label: 'Bright', min: 500, max: 12000, default: 5000, curve: 'log', unit: 'Hz' },
      { id: 'decay', label: 'Decay', min: 0.05, max: 1.5, default: 0.3, unit: 's' }],
    voice: { gain: 0.3, oscillators: [{ wave: 'sawtooth', gain: 0.5 }, { wave: 'triangle', octave: 1, gain: 0.4 }], noise: 0.04,
      envelope: { attack: 0.001, decay: '$decay', sustain: 0, release: '$decay*0.8' },
      filter: { type: 'lowpass', cutoff: 300, q: 3, envAmount: '$brightness', envelope: { attack: 0.001, decay: '$decay*0.6', sustain: 0, release: 0.1 } } } },

  { id: 'th.room-reverb', type: 'effect', name: 'Room Reverb', author: 'Tapehouse', description: 'Smooth space from a generated impulse response.',
    params: [
      { id: 'size', label: 'Size', min: 0.3, max: 8, default: 2.2, unit: 's' },
      { id: 'damp', label: 'Damp', min: 1000, max: 16000, default: 7000, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.28 }],
    graph: [{ node: 'reverb', decay: '$size', mix: '$mix', preDelay: 0.012, damp: '$damp' }] },
  { id: 'th.tape-delay', type: 'effect', name: 'Tape Delay', author: 'Tapehouse', description: 'Tempo-synced echo with darkening repeats.',
    params: [
      { id: 'time', label: 'Time', options: [{ label: '1/16', value: 0.25 }, { label: '1/8', value: 0.5 }, { label: '1/8 dotted', value: 0.75 }, { label: '1/4', value: 1 }, { label: '1/4 dotted', value: 1.5 }, { label: '1/2', value: 2 }], default: 0.75 },
      { id: 'feedback', label: 'Feedback', min: 0, max: 0.9, default: 0.38 },
      { id: 'tone', label: 'Tone', min: 600, max: 12000, default: 3500, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.25 }],
    graph: [{ node: 'delay', beats: '$time', feedback: '$feedback', mix: '$mix', tone: '$tone' }] },
  { id: 'th.eq3', type: 'effect', name: '3-Band EQ', author: 'Tapehouse', description: 'Low shelf, sweepable mid, high shelf.',
    params: [
      { id: 'low', label: 'Low', min: -15, max: 15, default: 0, unit: 'dB' },
      { id: 'mid', label: 'Mid', min: -15, max: 15, default: 0, unit: 'dB' },
      { id: 'freq', label: 'Mid Freq', min: 200, max: 5000, default: 1000, curve: 'log', unit: 'Hz' },
      { id: 'high', label: 'High', min: -15, max: 15, default: 0, unit: 'dB' }],
    graph: [{ node: 'eq3', low: '$low', mid: '$mid', high: '$high', midFreq: '$freq' }] },
  { id: 'th.glue-comp', type: 'effect', name: 'Glue Compressor', author: 'Tapehouse', description: 'Bus compressor with make-up gain.',
    params: [
      { id: 'threshold', label: 'Thresh', min: -50, max: 0, default: -16, unit: 'dB' },
      { id: 'ratio', label: 'Ratio', min: 1, max: 20, default: 3 },
      { id: 'attack', label: 'Attack', min: 0.001, max: 0.2, default: 0.01, curve: 'log', unit: 's' },
      { id: 'release', label: 'Release', min: 0.02, max: 1, default: 0.2, curve: 'log', unit: 's' },
      { id: 'makeup', label: 'Makeup', min: -12, max: 18, default: 3, unit: 'dB' }],
    graph: [{ node: 'compressor', threshold: '$threshold', ratio: '$ratio', attack: '$attack', release: '$release', knee: 8 }, { node: 'gain', gainDb: '$makeup' }] },
  { id: 'th.saturator', type: 'effect', name: 'Saturator', author: 'Tapehouse', description: 'Warm tanh drive with a tone control.',
    params: [
      { id: 'drive', label: 'Drive', min: 0, max: 1, default: 0.35 },
      { id: 'tone', label: 'Tone', min: 800, max: 16000, default: 9000, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 1 },
      { id: 'output', label: 'Output', min: -18, max: 6, default: -3, unit: 'dB' }],
    graph: [{ node: 'distortion', drive: '$drive', tone: '$tone', mix: '$mix' }, { node: 'gain', gainDb: '$output' }] },
  { id: 'th.sweep-filter', type: 'effect', name: 'Sweep Filter', author: 'Tapehouse', description: 'Resonant filter for build-ups and sweeps.',
    params: [
      { id: 'mode', label: 'Mode', options: [{ label: 'Low-pass', value: 'lowpass' }, { label: 'High-pass', value: 'highpass' }, { label: 'Band-pass', value: 'bandpass' }], default: 'lowpass' },
      { id: 'cutoff', label: 'Cutoff', min: 30, max: 18000, default: 18000, curve: 'log', unit: 'Hz' },
      { id: 'res', label: 'Reso', min: 0.3, max: 18, default: 0.8 }],
    graph: [{ node: 'filter', filterType: '$mode', frequency: '$cutoff', q: '$res' }] },
  { id: 'th.bitcrusher', type: 'effect', name: 'Bitcrusher', author: 'Tapehouse', description: 'Reduces bit depth for crunchy lo-fi texture.',
    params: [
      { id: 'bits', label: 'Bits', min: 2, max: 12, default: 6, step: 1, unit: 'bit' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.6 }],
    graph: [{ node: 'bitcrush', bits: '$bits', mix: '$mix' }] },
  { id: 'th.chorus', type: 'effect', name: 'Chorus', author: 'Tapehouse', description: 'Modulated delay for width and shimmer.',
    params: [
      { id: 'rate', label: 'Rate', min: 0.05, max: 6, default: 0.8, curve: 'log', unit: 'Hz' },
      { id: 'depth', label: 'Depth', min: 0, max: 1, default: 0.5 },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.45 }],
    graph: [{ node: 'chorus', rate: '$rate', depth: '$depth', mix: '$mix' }] },
  { id: 'th.auto-filter', type: 'effect', name: 'Auto Filter', author: 'Tapehouse', description: 'LFO-driven filter wobble.',
    params: [
      { id: 'cutoff', label: 'Cutoff', min: 150, max: 10000, default: 1400, curve: 'log', unit: 'Hz' },
      { id: 'depth', label: 'Depth', min: 0, max: 5000, default: 900, unit: 'Hz' },
      { id: 'rate', label: 'Rate', min: 0.05, max: 12, default: 2, curve: 'log', unit: 'Hz' },
      { id: 'res', label: 'Reso', min: 0.5, max: 15, default: 4 }],
    graph: [{ node: 'autofilter', filterType: 'lowpass', frequency: '$cutoff', depth: '$depth', rate: '$rate', q: '$res' }] },
];

/* ---------- audio helpers ---------- */
function makeNoiseBuffer(ac) {
  const len = Math.floor(ac.sampleRate);
  const b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function holdParam(p, t) {
  if (p.cancelAndHoldAtTime) { try { p.cancelAndHoldAtTime(t); return; } catch (e) { /* fall through */ } }
  const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t);
}
const curveCache = new Map();
function satCurve(k) {
  const key = 's' + k; if (curveCache.has(key)) return curveCache.get(key);
  // drive 0 → almost clean, 1 → heavy. Peaks around −6 dBFS keep their level; louder parts round off, quieter come up a little.
  const n = 2048, c = new Float32Array(n), a = 0.5 + k * 0.06, norm = 0.5 * a / Math.tanh(0.5 * a);
  for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(a * x) / a * norm; }
  curveCache.set(key, c); return c;
}
function crushCurve(bits) {
  const key = 'b' + bits; if (curveCache.has(key)) return curveCache.get(key);
  const n = 8192, c = new Float32Array(n), q = Math.pow(2, bits) / 2;
  for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.round(x * q) / q; }
  curveCache.set(key, c); return c;
}
function getIR(E, dec) {
  let b = E.irCache.get(dec); if (b) return b;
  const ac = E.ac, sr = ac.sampleRate, len = Math.max(1, Math.floor(sr * dec * 1.15)), fade = sr * 0.004, k = 6.9 / (sr * dec);
  b = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      // brightness falls from about 13 kHz to 2 kHz across the tail, like a real plate or hall
      const fc = 13000 * Math.pow(0.15, i / len), a = Math.exp(-2 * Math.PI * fc / sr);
      lp = a * lp + (1 - a) * (Math.random() * 2 - 1); lp2 = a * lp2 + (1 - a) * lp;
      d[i] = lp2 * Math.exp(-k * i) * (i < fade ? i / fade : 1);
    }
  }
  E.irCache.set(dec, b);
  if (E.irCache.size > 6) E.irCache.delete(E.irCache.keys().next().value);
  return b;
}
function dryWet(E) {
  const ac = E.ac, input = ac.createGain(), output = ac.createGain(), dry = ac.createGain(), wet = ac.createGain();
  input.connect(dry); dry.connect(output); wet.connect(output);
  return { input, output, dry, wet, nodes: [input, output, dry, wet],
    mix(m) { m = clamp(+m || 0, 0, 1); E.ramp(dry.gain, Math.cos(m * Math.PI / 2)); E.ramp(wet.gain, Math.sin(m * Math.PI / 2)); } };
}

/* Effect building blocks. Each returns {input, output, apply(spec), dispose()}. */
const PRIMS = {
  gain(E) { const g = E.ac.createGain();
    return { input: g, output: g, apply(s) { E.ramp(g.gain, s.gainDb != null ? dbToGain(+s.gainDb) : (s.gain != null ? +s.gain : 1)); }, dispose() { disc(g); } }; },
  pan(E) { const p = E.ac.createStereoPanner();
    return { input: p, output: p, apply(s) { E.ramp(p.pan, clamp(+s.pan || 0, -1, 1)); }, dispose() { disc(p); } }; },
  filter(E) { const f = E.ac.createBiquadFilter();
    return { input: f, output: f, apply(s) {
      const ty = FILTER_TYPES.includes(s.filterType) ? s.filterType : 'lowpass'; if (f.type !== ty) f.type = ty;
      E.ramp(f.frequency, clamp(+s.frequency || 1000, 20, 20000)); E.ramp(f.Q, clamp(s.q != null ? +s.q : 0.7, 0.0001, 30));
      if (s.gain != null) E.ramp(f.gain, +s.gain);
    }, dispose() { disc(f); } }; },
  eq3(E) { const ac = E.ac, lo = ac.createBiquadFilter(), mid = ac.createBiquadFilter(), hi = ac.createBiquadFilter();
    lo.type = 'lowshelf'; lo.frequency.value = 220; mid.type = 'peaking'; mid.Q.value = 0.9; hi.type = 'highshelf'; hi.frequency.value = 4500;
    lo.connect(mid); mid.connect(hi);
    return { input: lo, output: hi, apply(s) {
      E.ramp(lo.gain, +s.low || 0); E.ramp(mid.gain, +s.mid || 0); E.ramp(hi.gain, +s.high || 0);
      E.ramp(mid.frequency, clamp(+s.midFreq || 1000, 40, 16000));
    }, dispose() { disc(lo, mid, hi); } }; },
  compressor(E) { const c = E.ac.createDynamicsCompressor();
    return { input: c, output: c, latency: 0.006 /* the browser compressor's built-in look-ahead */, apply(s) {
      E.ramp(c.threshold, clamp(+(s.threshold ?? -18), -100, 0)); E.ramp(c.ratio, clamp(+(s.ratio ?? 4), 1, 20));
      E.ramp(c.attack, clamp(+(s.attack ?? 0.01), 0, 1)); E.ramp(c.release, clamp(+(s.release ?? 0.25), 0, 1)); E.ramp(c.knee, clamp(+(s.knee ?? 6), 0, 40));
    }, dispose() { disc(c); } }; },
  delay(E) { const ac = E.ac, dw = dryWet(E), d = ac.createDelay(4), fb = ac.createGain(), tone = ac.createBiquadFilter();
    tone.type = 'lowpass'; dw.input.connect(d); d.connect(tone); tone.connect(dw.wet); tone.connect(fb); fb.connect(d);
    return { input: dw.input, output: dw.output, apply(s) {
      const t = s.beats != null ? (+s.beats) * 60 / E.bpm : (+s.time || 0.3);
      E.ramp(d.delayTime, clamp(t, 0.001, 3.9), 0.05); E.ramp(fb.gain, clamp(+s.feedback || 0, 0, 0.95));
      E.ramp(tone.frequency, clamp(+s.tone || 8000, 200, 20000)); dw.mix(s.mix ?? 0.3);
    }, dispose() { disc(...dw.nodes, d, fb, tone); } }; },
  reverb(E) { const ac = E.ac, dw = dryWet(E), pre = ac.createDelay(1), conv = ac.createConvolver(), damp = ac.createBiquadFilter();
    damp.type = 'lowpass'; dw.input.connect(pre); pre.connect(conv); conv.connect(damp); damp.connect(dw.wet);
    let last = -1;
    return { input: dw.input, output: dw.output, apply(s) {
      const k = Math.round(clamp(+s.decay || 2, 0.1, 10) * 10) / 10;
      if (k !== last) { last = k; try { conv.buffer = getIR(E, k); } catch (e) { /* keep previous IR */ } }
      E.ramp(pre.delayTime, clamp(+s.preDelay || 0.01, 0, 0.5)); E.ramp(damp.frequency, clamp(+s.damp || 9000, 200, 20000)); dw.mix(s.mix ?? 0.3);
    }, dispose() { disc(...dw.nodes, pre, conv, damp); } }; },
  distortion(E) { const ac = E.ac, dw = dryWet(E), ws = ac.createWaveShaper(), tone = ac.createBiquadFilter();
    ws.oversample = '4x'; tone.type = 'lowpass'; dw.input.connect(ws); ws.connect(tone); tone.connect(dw.wet);
    let last = -1;
    return { input: dw.input, output: dw.output, apply(s) {
      const k = Math.round(clamp(+s.drive || 0, 0, 1) * 100); if (k !== last) { last = k; ws.curve = satCurve(k); }
      E.ramp(tone.frequency, clamp(+s.tone || 12000, 200, 20000)); dw.mix(s.mix ?? 1);
    }, dispose() { disc(...dw.nodes, ws, tone); } }; },
  bitcrush(E) { const ac = E.ac, dw = dryWet(E), ws = ac.createWaveShaper();
    dw.input.connect(ws); ws.connect(dw.wet);
    let last = -1;
    return { input: dw.input, output: dw.output, apply(s) {
      const b = Math.round(clamp(+s.bits || 8, 1, 12)); if (b !== last) { last = b; ws.curve = crushCurve(b); }
      dw.mix(s.mix ?? 0.6);
    }, dispose() { disc(...dw.nodes, ws); } }; },
  chorus(E) { const ac = E.ac, dw = dryWet(E), d = ac.createDelay(0.1), lfo = ac.createOscillator(), lg = ac.createGain();
    d.delayTime.value = 0.018; lfo.connect(lg); lg.connect(d.delayTime); lfo.start(); dw.input.connect(d); d.connect(dw.wet);
    return { input: dw.input, output: dw.output, apply(s) {
      E.ramp(lfo.frequency, clamp(+s.rate || 0.8, 0.01, 20)); E.ramp(lg.gain, clamp(+s.depth || 0, 0, 1) * 0.008); dw.mix(s.mix ?? 0.5);
    }, dispose() { try { lfo.stop(); } catch (e) { /* ok */ } disc(...dw.nodes, d, lfo, lg); } }; },
  autofilter(E) { const ac = E.ac, f = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    return { input: f, output: f, apply(s) {
      const ty = FILTER_TYPES.includes(s.filterType) ? s.filterType : 'lowpass'; if (f.type !== ty) f.type = ty;
      E.ramp(f.frequency, clamp(+s.frequency || 1000, 20, 20000)); E.ramp(f.Q, clamp(+s.q || 1, 0.0001, 30));
      E.ramp(lfo.frequency, clamp(+s.rate || 1, 0.01, 40)); E.ramp(lg.gain, clamp(+s.depth || 0, 0, 10000));
    }, dispose() { try { lfo.stop(); } catch (e) { /* ok */ } disc(f, lfo, lg); } }; },
};

function createEffect(E, pl, overrides) {
  const m = pl.manifest, vals = effectiveParams(m, overrides);
  if (m.script) {
    if (!E.loaded.has(pl.id)) throw new Error('Script is not loaded');
    const node = new AudioWorkletNode(E.ac, m.processor, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    const setP = (id, v) => { const ap = node.parameters.get(id); if (ap && Number.isFinite(+v)) E.ramp(ap, +v); };
    for (const k in vals) setP(k, vals[k]);
    return { input: node, output: node, set: setP, refresh() {}, dispose() { disc(node); try { node.port.close(); } catch (e) { /* ok */ } } };
  }
  const ac = E.ac, input = ac.createGain(), output = ac.createGain();
  const prims = m.graph.map(spec => PRIMS[spec.node](E));
  let n = input; for (const p of prims) { n.connect(p.input); n = p.output; } n.connect(output);
  const apply = () => prims.forEach((p, k) => p.apply(resolveT(m.graph[k], vals)));
  apply();
  return { input, output, set(id, v) { vals[id] = v; apply(); }, refresh: apply, dispose() { disc(input, output); prims.forEach(p => p.dispose()); },
    get latency() { return prims.reduce((a, p) => a + (p.latency || 0), 0); }, probe() { const p = prims.find(x => x.probe); return p ? p.probe() : null; } };
}

/* ---------- sample buffers ---------- */
const lib = new Map();      // id -> sample metadata
const buffers = new Map();  // id -> AudioBuffer
const reversedBufs = new Map();
const bufLoading = new Map();
let ctx = null, engine = null, _dctx = null;
function decodeCtx() { if (ctx) return ctx; if (!_dctx) _dctx = new OfflineAudioContext(2, 1, 44100); return _dctx; }
function decodeAB(ac, ab) {
  return new Promise((res, rej) => {
    try { const p = ac.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
  });
}
function getBuffer(id) {
  if (buffers.has(id)) return Promise.resolve(buffers.get(id));
  if (bufLoading.has(id)) return bufLoading.get(id);
  const pr = (async () => {
    const rec = await Store.get('sampleData', id);
    if (!rec) throw new Error('Audio data is missing for this sample');
    const b = await decodeAB(decodeCtx(), rec.data.slice(0));
    buffers.set(id, b); return b;
  })();
  bufLoading.set(id, pr);
  pr.then(() => bufLoading.delete(id), () => bufLoading.delete(id));
  return pr;
}
function reversedBuffer(id, buf) {
  const hit = reversedBufs.get(id); if (hit && hit.src === buf) return hit.buf;
  const r = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c), b = r.getChannelData(c); for (let i = 0, n = a.length; i < n; i++) b[i] = a[n - 1 - i]; }
  reversedBufs.set(id, { src: buf, buf: r }); return r;
}
function usedSampleIds(P, all) {
  const s = new Set();
  for (const ch of P.channels) if (ch.kind === 'sampler' && ch.sampleId) s.add(ch.sampleId);
  for (const c of P.playlist.clips) if (c.kind === 'audio') { s.add(c.ref); if (all && c.takes) c.takes.forEach(id => s.add(id)); }
  if (all && P.reference && P.reference.id) s.add(P.reference.id);
  return [...s];
}

/* ---------- instruments ---------- */
const DRUMS = [['kick', 'Kick'], ['snare', 'Snare'], ['clap', 'Clap'], ['hat', 'Closed Hat'], ['openhat', 'Open Hat'], ['shaker', 'Shaker'], ['perc', 'Perc'], ['tom', 'Tom'], ['808', '808 Bass']];
const DRUM_PARAMS = [
  { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, unit: 'st' },
  { id: 'decay', label: 'Decay', min: 0.25, max: 3, default: 1, unit: '×' }];
const SAMPLER_PARAMS = [
  { id: 'pitch', label: 'Pitch', min: -24, max: 24, default: 0, step: 1, unit: 'st' },
  { id: 'start', label: 'Start', min: 0, max: 0.95, default: 0, unit: '%' },
  { id: 'attack', label: 'Attack', min: 0.001, max: 1, default: 0.002, curve: 'log', unit: 's' },
  { id: 'release', label: 'Release', min: 0.005, max: 2, default: 0.08, curve: 'log', unit: 's' },
  { id: 'gate', label: 'Notes', options: [{ label: 'One-shot', value: 0 }, { label: 'Hold length', value: 1 }], default: 0 },
  { id: 'reverse', label: 'Direction', options: [{ label: 'Forward', value: 0 }, { label: 'Reverse', value: 1 }], default: 0 }];

function playDrum(E, dest, ch, t, note, vel) {
  const ac = E.ac, p = ch.params || {};
  const semis = (+p.tune || 0) + (note - 60), pr = Math.pow(2, semis / 12), dk = +(p.decay ?? 1) || 1;
  const out = ac.createGain(); out.gain.value = vel; out.connect(dest);
  const srcs = [];
  const env = (g, peak, len) => { g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.002); g.exponentialRampToValueAtTime(0.0001, t + Math.max(0.01, len)); };
  const osc = (type, f0, f1, ft, len, peak) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(clamp(f0, 10, 20000), t); if (f1) o.frequency.exponentialRampToValueAtTime(clamp(f1, 10, 20000), t + ft);
    env(g.gain, peak, len); o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.03); srcs.push(o);
  };
  const noise = (len, peak, chain) => {
    const s = ac.createBufferSource(); s.buffer = E.noise; s.loop = true;
    let n = s; for (const [type, f, q] of chain) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = clamp(f, 20, 18000); b.Q.value = q ?? 0.7; n.connect(b); n = b; }
    const g = ac.createGain(); env(g.gain, peak, len); n.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.03); srcs.push(s);
  };
  switch (ch.drum) {
    case 'kick': osc('sine', 170 * pr, 50 * pr, 0.09, 0.42 * dk, 1); noise(0.014, 0.3, [['highpass', 3000]]); break;
    case 'snare': osc('triangle', 200 * pr, 165 * pr, 0.06, 0.13 * dk, 0.55); noise(0.19 * dk, 0.7, [['highpass', 1400 * pr]]); break;
    case 'clap': {
      const s = ac.createBufferSource(); s.buffer = E.noise; s.loop = true;
      const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = clamp(1500 * pr, 200, 12000); b.Q.value = 1.3;
      const g = ac.createGain(); s.connect(b); b.connect(g); g.connect(out);
      const gg = g.gain; gg.setValueAtTime(0.0001, t);
      for (const off of [0, 0.011, 0.022]) { gg.setValueAtTime(0.9, t + off); gg.exponentialRampToValueAtTime(0.08, t + off + 0.009); }
      gg.setValueAtTime(0.8, t + 0.033); gg.exponentialRampToValueAtTime(0.0001, t + 0.033 + 0.24 * dk);
      s.start(t, Math.random() * 0.5); s.stop(t + 0.06 + 0.24 * dk); srcs.push(s); break;
    }
    case 'hat': noise(0.05 * dk, 0.7, [['highpass', 7500 * pr], ['bandpass', 10500 * pr, 0.9]]); break;
    case 'openhat': noise(0.34 * dk, 0.6, [['highpass', 7200 * pr], ['bandpass', 10000 * pr, 0.8]]); break;
    case 'shaker': noise(0.07 * dk, 0.5, [['bandpass', 6500 * pr, 1.6], ['highpass', 4000]]); break;
    case 'perc': osc('sine', 820 * pr, 760 * pr, 0.05, 0.09 * dk, 0.6); osc('triangle', 1640 * pr, 0, 0, 0.04 * dk, 0.15); break;
    case 'tom': osc('sine', 190 * pr, 110 * pr, 0.25, 0.4 * dk, 0.9); noise(0.03, 0.12, [['lowpass', 3000]]); break;
    case '808': { const f = midiFreq(36 + semis); osc('sine', f * 1.9, f, 0.035, 1.5 * dk, 0.95); osc('triangle', f, 0, 0, 0.6 * dk, 0.12); break; }
    default: osc('sine', 440 * pr, 0, 0, 0.2, 0.5);
  }
  E.track(out, srcs);
  return null;
}

function playSampler(E, dest, ch, t, note, vel, dur, oneShot) {
  const p = ch.params || {};
  let buf = buffers.get(ch.sampleId); if (!buf) return null;
  if (+p.reverse) buf = reversedBuffer(ch.sampleId, buf);
  const ac = E.ac, rate = Math.pow(2, ((note - 60) + (+p.pitch || 0)) / 12);
  const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const amp = ac.createGain(); src.connect(amp); amp.connect(dest);
  const a = Math.max(0.001, +(p.attack ?? 0.002)), r = Math.max(0.005, +(p.release ?? 0.08));
  const off = clamp(+p.start || 0, 0, 0.95) * buf.duration;
  const natural = (buf.duration - off) / rate;
  const gated = !oneShot && !!+p.gate;
  const hold = gated ? Math.min(dur, natural) : natural;
  const g = amp.gain;
  g.setValueAtTime(0, t); g.linearRampToValueAtTime(vel, t + Math.min(a, hold * 0.9 + 0.001));
  let stopAt;
  if (gated) { g.setTargetAtTime(0, t + hold, r / 4); stopAt = Math.min(t + natural, t + hold + r * 1.5) + 0.01; }
  else stopAt = t + natural + 0.01;
  src.start(t, off); src.stop(stopAt);
  E.track(amp, [src]);
  return gated ? { release(now) { holdParam(g, now); g.setTargetAtTime(0, now, r / 4); try { src.stop(now + r * 1.5); } catch (e) { /* ok */ } } } : null;
}

const VOWELS = { ah: [[800, 1], [1150, 0.55], [2900, 0.28]], oh: [[450, 1], [800, 0.6], [2830, 0.2]], oo: [[325, 1], [700, 0.45], [2530, 0.15]], eh: [[530, 1], [1850, 0.5], [2500, 0.32]], ee: [[270, 1], [2300, 0.55], [3000, 0.35]] };
function playSynth(E, dest, ch, t, note, vel, dur) {
  const pl = plugins.get(ch.plugin); if (!pl || pl.manifest.type !== 'instrument') return null;
  const v = resolveT(pl.manifest.voice, effectiveParams(pl.manifest, ch.params));
  const ac = E.ac, f0 = midiFreq(note);
  const en = Object.assign({ attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.2 }, v.envelope || {});
  const a = Math.max(0.001, +en.attack || 0), d = Math.max(0.005, +en.decay || 0), s = clamp(+en.sustain || 0, 0, 1), r = Math.max(0.005, +en.release || 0);
  const peak = clamp((+v.gain || 0.4) * vel, 0, 2), hold = Math.max(0.01, dur);
  const amp = ac.createGain(); amp.connect(dest);
  let head = amp, filt = null;
  if (v.filter) {
    filt = ac.createBiquadFilter(); filt.type = FILTER_TYPES.includes(v.filter.type) ? v.filter.type : 'lowpass';
    filt.Q.value = clamp(+(v.filter.q ?? 0.7), 0.0001, 30); filt.connect(amp); head = filt;
  }
  if (v.vowel && VOWELS[v.vowel]) {
    const bank = ac.createGain();
    for (const [f, gq] of VOWELS[v.vowel]) { const bp = ac.createBiquadFilter(), fg = ac.createGain(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 5; fg.gain.value = gq; bank.connect(bp); bp.connect(fg); fg.connect(head); }
    head = bank;
  }
  const srcs = [], oscs = [];
  for (const o of v.oscillators) {
    const og = o.gain == null ? 0.5 : +o.gain; if (!(og > 0)) continue;
    const osc = ac.createOscillator(); osc.type = WAVES.includes(o.wave) ? o.wave : 'sawtooth';
    osc.frequency.value = clamp(f0 * Math.pow(2, (+o.octave || 0) + (+o.semitone || 0) / 12), 1, 20000);
    osc.detune.value = +o.detune || 0;
    const g = ac.createGain(); g.gain.value = og; osc.connect(g); g.connect(head); srcs.push(osc); oscs.push(osc);
  }
  if (+v.noise > 0) { const n = ac.createBufferSource(); n.buffer = E.noise; n.loop = true; const g = ac.createGain(); g.gain.value = +v.noise; n.connect(g); g.connect(head); srcs.push(n); }
  if (!srcs.length) { disc(amp); return null; }
  const g = amp.gain, pT = t + Math.min(a, hold);
  g.setValueAtTime(0, t); g.linearRampToValueAtTime(peak, pT); g.setTargetAtTime(peak * s, pT, d / 3); g.setTargetAtTime(0, t + hold, r / 4);
  if (filt) {
    const fe = Object.assign({ attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 }, v.filter.envelope || {});
    const base = clamp(+v.filter.cutoff || 2000, 20, 18000), amt = +v.filter.envAmount || 0, F = filt.frequency;
    const fp = t + Math.min(Math.max(0.001, +fe.attack || 0), hold);
    F.setValueAtTime(base, t);
    if (amt) {
      F.linearRampToValueAtTime(clamp(base + amt, 20, 18000), fp);
      F.setTargetAtTime(clamp(base + amt * clamp(+fe.sustain || 0, 0, 1), 20, 18000), fp, Math.max(0.005, +fe.decay || 0.3) / 3);
      F.setTargetAtTime(base, t + hold, Math.max(0.005, +fe.release || 0.3) / 4);
    }
  }
  if (v.lfo && +v.lfo.depth) {
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.type = WAVES.includes(v.lfo.wave) ? v.lfo.wave : 'sine'; lfo.frequency.value = clamp(+v.lfo.rate || 1, 0.01, 40);
    lg.gain.value = +v.lfo.depth; lfo.connect(lg);
    if (v.lfo.target === 'filter' && filt) lg.connect(filt.frequency);
    else if (v.lfo.target === 'amp') { lg.gain.value = clamp(+v.lfo.depth, 0, 1) * peak * 0.5; lg.connect(g); }
    else oscs.forEach(o => lg.connect(o.detune));
    srcs.push(lfo);
  }
  const end = t + hold + r * 1.6 + 0.03;
  srcs.forEach(x => { x.start(t); x.stop(end); });
  E.track(amp, srcs);
  return { release(now) { holdParam(g, now); g.setTargetAtTime(0, now, r / 4); srcs.forEach(x => { try { x.stop(now + r * 1.6 + 0.03); } catch (e) { /* ok */ } }); } };
}

/* ---------- engine ---------- */
class Engine {
  constructor(ac, getP, opts = {}) {
    this.ac = ac; this.P = getP; this.offline = !!opts.offline; this.noMaster = !!opts.noMaster;
    this.inserts = []; this.chans = new Map(); this.voices = new Set();
    this.loaded = new Set(); this.failed = new Map(); this.irCache = new Map();
    this.noise = makeNoiseBuffer(ac); this.instant = false;
    this.at = null; this.atHard = false; this.resetting = false; this.autoLast = new Map(); this.autoKeys = null; this.skipClips = null;
    this.master = null; this.refSrc = null;
    this.dsp = null; this.dspP = null; this.keySig = ''; this.lowLat = false; this.onBuild = null; // vocal DSP worklet: null | 'loading' | 'ready' | 'failed'
  }
  /* Loads the Tune / De-esser worklet once per context. Until it is ready those effects run on a main-thread fallback. */
  loadDsp() {
    if (this.dspP) return this.dspP;
    this.dsp = 'loading';
    this.dspP = (async () => {
      try {
        if (!this.ac.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet is not available');
        const url = URL.createObjectURL(new Blob([dspModule()], { type: 'text/javascript' }));
        try { await this.ac.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        this.dsp = 'ready'; this.loaded.add('#dsp');
      } catch (e) { this.dsp = 'failed'; console.warn('Vocal DSP worklet unavailable, using the fallback', e); }
      if (!this.offline) this.sync();
    })();
    return this.dspP;
  }
  /* While the mic is being monitored, Tune switches to shorter grains so singing through it feels immediate. */
  setLowLatency(on) { on = !!on; if (this.lowLat === on) return; this.lowLat = on; this.refreshTempo(); }
  get bpm() { return this.P().bpm; }
  ramp(param, v, tc = 0.015) {
    if (!Number.isFinite(v)) return;
    if (this.at != null) { try { if (this.atHard) param.setValueAtTime(v, this.at); else param.linearRampToValueAtTime(v, this.at); } catch (e) { /* out of range */ } return; }
    if (this.offline || this.instant) { param.value = v; return; }
    if (this.resetting) holdParam(param, this.ac.currentTime);
    param.setTargetAtTime(v, this.ac.currentTime, tc);
  }
  build() {
    const P = this.P();
    this.inserts.forEach(i => i.dispose());
    for (const c of this.chans.values()) disc(c.gain, c.duck, c.pan);
    this.chans.clear();
    this.buildMaster();
    this.inserts = P.mixer.map(() => this.makeInsert());
    this.inserts.forEach((ins, i) => ins.out.connect(i === 0 ? this.master.input : this.inserts[0].input));
    this.instant = true; this.sync(); this.instant = false;
    if (this.onBuild) this.onBuild(); // e.g. reconnect the live mic to its new insert
  }
  /* Master chain after the Master insert: clean-up high-pass, 3-band tone, glue compressor, drive, limiter, safety clipper. */
  buildMaster() {
    const ac = this.ac;
    this.stopRef();
    if (this.master) disc(...this.master.nodes);
    const input = ac.createGain(), hp = ac.createBiquadFilter(), lo = ac.createBiquadFilter(), mid = ac.createBiquadFilter(), hi = ac.createBiquadFilter();
    const glue = ac.createDynamicsCompressor(), drive = ac.createGain(), lim = ac.createDynamicsCompressor(), clip = ac.createWaveShaper();
    const post = ac.createGain(), meter = ac.createAnalyser(), mixOut = ac.createGain(), refOut = ac.createGain(), safe = ac.createWaveShaper();
    safe.curve = ceilingCurve(-0.3); safe.oversample = '2x'; // always on: anything that would clip is rounded off instead of crackling
    hp.type = 'highpass'; hp.frequency.value = 24; hp.Q.value = 0.6;
    lo.type = 'lowshelf'; lo.frequency.value = 110; mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.7; hi.type = 'highshelf'; hi.frequency.value = 7000;
    glue.knee.value = 6; glue.attack.value = 0.02; glue.release.value = 0.25;
    lim.ratio.value = 20; lim.knee.value = 0; lim.attack.value = 0.001; lim.release.value = 0.09;
    meter.fftSize = 1024; refOut.gain.value = 0;
    post.connect(meter); post.connect(mixOut); mixOut.connect(ac.destination);
    if (!this.offline) refOut.connect(ac.destination);
    this.master = { input, hp, lo, mid, hi, glue, drive, lim, clip, post, meter, mixOut, refOut, safe, on: null, ceil: null, data: new Float32Array(1024), level: 0,
      nodes: [input, hp, lo, mid, hi, glue, drive, lim, clip, post, meter, mixOut, refOut, safe] };
    this.syncMaster();
  }
  syncMaster() {
    const m = this.master; if (!m) return;
    const M = this.P().master || {}, on = !!M.on && !this.noMaster;
    if (m.on !== on) {
      disc(m.input, m.hp, m.lo, m.mid, m.hi, m.glue, m.drive, m.lim, m.clip, m.safe);
      if (on) { m.input.connect(m.hp); m.hp.connect(m.lo); m.lo.connect(m.mid); m.mid.connect(m.hi); m.hi.connect(m.glue); m.glue.connect(m.drive); m.drive.connect(m.lim); m.lim.connect(m.clip); m.clip.connect(m.post); }
      else { m.input.connect(m.safe); m.safe.connect(m.post); }
      m.on = on;
    }
    if (!on) return;
    const g = clamp(+M.glue || 0, 0, 1), ceil = clamp(+M.ceiling || -1, -6, -0.1);
    this.ramp(m.lo.gain, clamp(+M.low || 0, -8, 8)); this.ramp(m.mid.gain, clamp(+M.mid || 0, -8, 8)); this.ramp(m.hi.gain, clamp(+M.high || 0, -8, 8));
    this.ramp(m.glue.threshold, -6 - g * 14); this.ramp(m.glue.ratio, 1.5 + g * 1.5);
    this.ramp(m.drive.gain, dbToGain(clamp(+M.drive || 0, -12, 18)));
    this.ramp(m.lim.threshold, ceil - 1.4);
    if (m.ceil !== ceil) { m.ceil = ceil; m.clip.curve = ceilingCurve(ceil); }
  }
  setAB(useRef, gainDb) {
    const m = this.master; if (!m || this.offline) return;
    this.ramp(m.mixOut.gain, useRef ? 0 : 1, 0.01); this.ramp(m.refOut.gain, useRef ? dbToGain(clamp(gainDb || 0, -30, 12)) : 0, 0.01);
  }
  startRef(buf, offset, t) {
    this.stopRef(); if (!this.master || this.offline || !buf) return;
    const s = this.ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(this.master.refOut);
    s.start(t, ((offset % buf.duration) + buf.duration) % buf.duration); this.refSrc = { src: s, t, offset, dur: buf.duration };
  }
  stopRef() {
    const r = this.refSrc; if (!r) return null; this.refSrc = null;
    try { r.src.stop(); } catch (e) { /* not started */ } disc(r.src);
    return (r.offset + Math.max(0, this.ac.currentTime - r.t)) % r.dur;
  }
  resetAuto() {
    const P = this.P(); this.autoKeys = null; this.autoLast = new Map();
    this.resetting = true;
    try {
      for (const lane of P.automation || []) {
        const t = lane.target;
        if (t.kind === 'out') { if (this.master) this.ramp(this.master.post.gain, 1); }
        else if (t.kind === 'mix') { const ins = this.inserts[t.i], m = P.mixer[t.i]; if (ins && m) this.ramp(t.param === 'pan' ? ins.pan.pan : ins.vol.gain, t.param === 'pan' ? m.pan : m.vol); }
        else if (t.kind === 'ch') { const c = this.chans.get(t.ch), ch = P.channels.find(x => x.id === t.ch); if (c && ch) { if (t.param === 'pan') this.ramp(c.pan.pan, ch.pan); else this.ramp(c.gain.gain, ch.mute ? 0 : ch.vol); } }
        else if (t.kind === 'fx') {
          const m = P.mixer[t.i], f = m && m.fx.find(x => x.id === t.fx), pl = f && plugins.get(f.plugin), fx = this.inserts[t.i] && this.inserts[t.i].fx.find(x => x.id === t.fx);
          if (f && pl && fx && fx.set) fx.set(t.param, effectiveParams(pl.manifest, f.params)[t.param]);
        }
      }
    } finally { this.resetting = false; }
  }
  makeInsert() {
    const ac = this.ac, input = ac.createGain(), vol = ac.createGain(), pan = ac.createStereoPanner(), meter = ac.createAnalyser(), out = ac.createGain(), pre = ac.createAnalyser();
    meter.fftSize = 512; pre.fftSize = 512; vol.connect(pan); pan.connect(meter); meter.connect(out); input.connect(pre);
    return { input, vol, pan, meter, out, pre, fx: [], sig: null, data: new Float32Array(512), level: 0,
      dispose() { this.fx.forEach(f => f.dispose()); disc(input, vol, pan, meter, out, pre); } };
  }
  sync() {
    const P = this.P(), ac = this.ac;
    if (P.mixer.length !== this.inserts.length) return this.build();
    const anySolo = P.mixer.some((m, i) => i > 0 && m.solo);
    P.mixer.forEach((m, i) => {
      const ins = this.inserts[i], ak = this.autoKeys;
      if (!(ak && ak.has('mix:' + i + ':vol'))) this.ramp(ins.vol.gain, m.vol);
      this.ramp(ins.input.gain, Math.pow(10, (+m.trim || 0) / 20)); // input trim, before the effects
      if (!(ak && ak.has('mix:' + i + ':pan'))) this.ramp(ins.pan.pan, m.pan);
      this.ramp(ins.out.gain, (m.mute || (anySolo && i > 0 && !m.solo)) ? 0 : 1, 0.008);
      const sig = m.fx.map(f => f.id + ':' + f.plugin + ':' + (f.bypass ? 1 : 0)).join('|') + '#' + this.loaded.size;
      if (sig !== ins.sig) this.rebuildFx(i, sig);
    });
    for (const ch of P.channels) {
      let c = this.chans.get(ch.id);
      if (!c) { c = { gain: ac.createGain(), duck: ac.createGain(), pan: ac.createStereoPanner(), dest: -1 }; c.gain.connect(c.duck); c.duck.connect(c.pan); this.chans.set(ch.id, c); const was = this.instant; this.instant = true; this.ramp(c.gain.gain, ch.mute ? 0 : ch.vol); this.instant = was; }
      const av = this.autoKeys && this.autoKeys.has('ch:' + ch.id + ':vol');
      if (!av || ch.mute) { if (av) holdParam(c.gain.gain, ac.currentTime); this.ramp(c.gain.gain, ch.mute ? 0 : ch.vol); }
      if (!(this.autoKeys && this.autoKeys.has('ch:' + ch.id + ':pan'))) this.ramp(c.pan.pan, ch.pan);
      const dest = clamp(ch.insert | 0, 0, this.inserts.length - 1);
      if (c.dest !== dest) { disc(c.pan); c.pan.connect(this.inserts[dest].input); c.dest = dest; }
    }
    for (const [id, c] of this.chans) if (!P.channels.some(x => x.id === id)) { disc(c.pan); this.chans.delete(id); }
    this.syncMaster();
    const ks = P.key + ':' + P.scale + ':' + (P.smartKey ? P.smartKey.root + P.smartKey.mode : ''); // Tune snaps to the song key (or the key Smart key heard), so a change refreshes the effects
    if (ks !== this.keySig) { const first = !this.keySig; this.keySig = ks; if (!first) this.refreshTempo(); }
  }
  rebuildFx(i, sig) {
    const ins = this.inserts[i], m = this.P().mixer[i];
    disc(ins.input); if (ins.pre) ins.input.connect(ins.pre); ins.fx.forEach(f => f.dispose()); ins.fx = [];
    let node = ins.input;
    for (const f of m.fx) {
      const pl = plugins.get(f.plugin); let inst = null;
      if (pl && !f.bypass && pl.manifest.type === 'effect') {
        try { inst = createEffect(this, pl, f.params); this.failed.delete(f.plugin); }
        catch (e) { if (!pl.manifest.script || this.loaded.has(pl.id)) this.failed.set(f.plugin, e.message); }
      }
      if (!inst) { ins.fx.push({ id: f.id, set() {}, refresh() {}, dispose() {} }); continue; }
      inst.id = f.id; node.connect(inst.input); node = inst.output; ins.fx.push(inst);
    }
    node.connect(ins.vol); ins.sig = sig;
    Object.defineProperty(ins, 'latency', { configurable: true, get() { return this.fx.reduce((a, f) => a + (f.latency || 0), 0); } });
  }
  setFxParam(i, fxId, pid, v) { const f = this.inserts[i] && this.inserts[i].fx.find(x => x.id === fxId); if (f) f.set(pid, v); }
  refreshTempo() { this.inserts.forEach(ins => ins.fx.forEach(f => f.refresh && f.refresh())); }
  async loadWorklet(pl) {
    if (this.loaded.has(pl.id)) return;
    if (!this.ac.audioWorklet) throw new Error('This browser does not support AudioWorklet script plugins.');
    const url = URL.createObjectURL(new Blob([pl.source], { type: 'text/javascript' }));
    try { await this.ac.audioWorklet.addModule(url); this.loaded.add(pl.id); this.failed.delete(pl.id); }
    finally { URL.revokeObjectURL(url); }
    this.sync();
  }
  async prepare(P) {
    const jobs = [];
    for (const m of P.mixer) for (const f of m.fx) {
      const pl = plugins.get(f.plugin);
      if (pl && pl.manifest.script && !this.loaded.has(pl.id)) jobs.push(this.loadWorklet(pl).catch(e => this.failed.set(pl.id, e.message || 'Could not load script')));
    }
    for (const id of usedSampleIds(P)) if (!buffers.has(id)) jobs.push(getBuffer(id).catch(() => null));
    if (usesDsp(P)) jobs.push(this.loadDsp());
    await Promise.all(jobs);
    this.sync();
  }
  trigger(ch, t, note, vel, dur, oneShot) {
    const c = this.chans.get(ch.id); if (!c) return null;
    let h = null;
    try {
      if (ch.kind === 'drum') h = playDrum(this, c.gain, ch, t, note, vel);
      else if (ch.kind === 'sampler') h = playSampler(this, c.gain, ch, t, note, vel, dur, oneShot);
      else if (ch.kind === 'synth') h = playSynth(this, c.gain, ch, t, note, vel, dur);
    } catch (e) { console.warn('Voice failed', e); }
    this.duckFrom(ch.id, t, vel);
    return h;
  }
  duckFrom(id, t, vel) {
    for (const o of this.P().channels) {
      const d = o.duck; if (!d || d.by !== id || !(d.amount > 0)) continue;
      const c = this.chans.get(o.id); if (!c) continue;
      const g = c.duck.gain, low = 1 - clamp(d.amount * clamp(vel, 0.3, 1), 0, 0.95);
      g.setTargetAtTime(low, t, 0.004); g.setTargetAtTime(1, t + 0.035, 0.09);
    }
  }
  playClip(clip, track, t, offset, maxDur) {
    const buf = buffers.get(clip.ref); if (!buf) return;
    let off = offset + (+clip.offset || 0); if (off >= buf.duration) return;
    const ac = this.ac, idx = clamp((track && track.insert) | 0, 0, this.inserts.length - 1), ins = this.inserts[idx], dest = ins.input;
    let dur = Math.min(maxDur, buf.duration - off); if (dur <= 0.01) return;
    // Tune needs look-ahead, so audio on its insert starts that much earlier and still lands on the beat.
    const lat = idx > 0 ? (ins.latency || 0) : 0;
    if (lat > 0) {
      t -= lat; const minT = this.offline ? 0 : ac.currentTime;
      if (t < minT) { const d = minT - t; t = minT; off += d; dur -= d; if (dur <= 0.01 || off >= buf.duration) return; }
    }
    const src = ac.createBufferSource(), amp = ac.createGain(), g = clip.gain ?? 1;
    src.buffer = buf;
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(g, t + 0.004);
    amp.gain.setValueAtTime(g, t + Math.max(0.005, dur - 0.006)); amp.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(amp); amp.connect(dest); src.start(t, off); src.stop(t + dur + 0.01);
    this.track(amp, [src]);
  }
  track(amp, srcs) {
    if (!srcs.length) return;
    const v = { amp, srcs }; this.voices.add(v); let n = srcs.length;
    srcs.forEach(s => { s.onended = () => { if (--n === 0) { this.voices.delete(v); disc(amp); } }; });
  }
  panic() {
    const now = this.ac.currentTime;
    for (const v of this.voices) { holdParam(v.amp.gain, now); v.amp.gain.setTargetAtTime(0, now, 0.01); for (const s of v.srcs) { try { s.stop(now + 0.08); } catch (e) { /* ok */ } } }
  }
}

/* ---------- sequencing (shared by live playback and offline render) ---------- */
function songLength(P) { let e = 0; for (const c of P.playlist.clips) e = Math.max(e, c.start + c.len); return Math.max(16, Math.ceil(e / 16) * 16); }
function schedulePatternStep(E, P, pat, s, time, sd) {
  for (const ch of P.channels) {
    const steps = pat.steps[ch.id], v = steps && steps[s];
    if (v) E.trigger(ch, time, 60, v, sd, true);
    const notes = pat.notes[ch.id];
    if (notes) for (const n of notes) if (n.s === s) E.trigger(ch, time, n.n, n.v ?? 0.8, n.l * sd, false);
  }
}
function scheduleStep(E, P, mode, step, time, sd, resumeStep) {
  if (mode === 'pattern') {
    const pat = P.patterns.find(p => p.id === P.currentPattern) || P.patterns[0];
    if (pat) schedulePatternStep(E, P, pat, step % pat.length, time, sd);
    return;
  }
  if (P.automation && P.automation.length) scheduleAutomation(E, P, step, time);
  for (const clip of P.playlist.clips) {
    const tr = P.playlist.tracks[clip.track]; if (!tr || tr.mute) continue;
    if (E.skipClips && E.skipClips.has(clip.id)) continue;
    const end = clip.start + clip.len; if (step < clip.start || step >= end) continue;
    if (clip.kind === 'pattern') {
      const pat = P.patterns.find(p => p.id === clip.ref);
      if (pat) schedulePatternStep(E, P, pat, (step - clip.start) % pat.length, time, sd);
    } else if (clip.kind === 'audio') {
      if (step === clip.start) E.playClip(clip, tr, time, 0, clip.len * sd);
      else if (step === resumeStep) E.playClip(clip, tr, time, (step - clip.start) * sd, (end - step) * sd);
    }
  }
}
/* ---------- automation (shared by live playback and offline render) ---------- */
function ceilingCurve(db) {
  const key = 'c' + db; if (curveCache.has(key)) return curveCache.get(key);
  const n = 4096, c = new Float32Array(n), lim = dbToGain(db), k = lim * 0.9;
  for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= k ? a : k + (lim - k) * Math.tanh((a - k) / (lim - k))); }
  curveCache.set(key, c); return c;
}
/* Describes what a lane controls: label, range and the knob value it returns to when playback stops. */
function autoInfo(P, t) {
  if (!t) return null;
  if (t.kind === 'out') return { who: 'Master', what: 'Fade', min: 0, max: 1, value: 1, vol: true, fmt: v => fmtDb(v) + ' dB' };
  if (t.kind === 'mix') {
    const m = P.mixer[t.i]; if (!m) return null;
    const who = t.i === 0 ? 'Master' : m.name;
    return t.param === 'pan' ? { who, what: 'Pan', min: -1, max: 1, bipolar: true, value: m.pan, fmt: fmtPan }
      : { who, what: 'Volume', min: 0, max: 1.25, value: m.vol, vol: true, fmt: v => fmtDb(v) + ' dB' };
  }
  if (t.kind === 'ch') {
    const ch = P.channels.find(c => c.id === t.ch); if (!ch) return null;
    return t.param === 'pan' ? { who: ch.name, what: 'Pan', min: -1, max: 1, bipolar: true, value: ch.pan, fmt: fmtPan, color: ch.color }
      : { who: ch.name, what: 'Volume', min: 0, max: 1.2, value: ch.vol, vol: true, fmt: v => fmtDb(v) + ' dB', color: ch.color };
  }
  if (t.kind === 'fx') {
    const m = P.mixer[t.i], f = m && m.fx.find(x => x.id === t.fx), pl = f && plugins.get(f.plugin);
    const d = pl && pl.manifest.params.find(x => x.id === t.param);
    if (!d || d.options) return null;
    const u = d.unit || '', fmt = v => u === 'Hz' ? (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v)) + ' Hz' : u === 'dB' ? v.toFixed(1) + ' dB' : u === 's' ? v.toFixed(2) + ' s' : (!u && d.min >= 0 && d.max <= 1) ? Math.round(v * 100) + '%' : (+v).toFixed(2) + (u ? ' ' + u : '');
    return { who: (t.i === 0 ? 'Master' : m.name) + ' · ' + pl.manifest.name, what: d.label, min: d.min, max: d.max, log: d.curve === 'log', value: effectiveParams(pl.manifest, f.params)[t.param], fmt };
  }
  return null;
}
function autoValueAt(pts, s, log) {
  if (!pts.length) return null;
  if (s <= pts[0].s) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (s > pts[i].s) continue;
    const a = pts[i - 1], b = pts[i], f = b.s === a.s ? 1 : (s - a.s) / (b.s - a.s);
    return log && a.v > 0 && b.v > 0 ? a.v * Math.pow(b.v / a.v, f) : a.v + (b.v - a.v) * f;
  }
  return pts[pts.length - 1].v;
}
function scheduleAutomation(E, P, step, time) {
  for (const lane of P.automation) {
    if (lane.off || !lane.points.length) continue;
    const info = autoInfo(P, lane.target); if (!info) continue;
    const v = clamp(autoValueAt(lane.points, step, info.log), info.min, info.max);
    E.at = time; E.atHard = !E.autoLast.has(lane.id) || step === 0;
    try { applyAuto(E, P, lane.target, v); } finally { E.at = null; E.atHard = false; }
    E.autoLast.set(lane.id, v);
  }
}
function applyAuto(E, P, t, v) {
  if (t.kind === 'out') { if (E.master) E.ramp(E.master.post.gain, v); }
  else if (t.kind === 'mix') { const ins = E.inserts[t.i]; if (ins) E.ramp(t.param === 'pan' ? ins.pan.pan : ins.vol.gain, v); }
  else if (t.kind === 'ch') { const c = E.chans.get(t.ch), ch = P.channels.find(x => x.id === t.ch); if (c && ch && (t.param === 'pan' || !ch.mute)) E.ramp(t.param === 'pan' ? c.pan.pan : c.gain.gain, v); }
  else if (t.kind === 'fx') { const fx = E.inserts[t.i] && E.inserts[t.i].fx.find(x => x.id === t.fx); if (fx && fx.set) fx.set(t.param, v); }
}
const autoKey = t => t.kind === 'out' ? 'out' : t.kind === 'mix' ? `mix:${t.i}:${t.param}` : t.kind === 'ch' ? `ch:${t.ch}:${t.param}` : `fx:${t.i}:${t.fx}:${t.param}`;

async function renderOffline(P, what, sr = 44100, range, opts = {}) {
  const sd = 60 / P.bpm / 4;
  const pat = P.patterns.find(p => p.id === P.currentPattern) || P.patterns[0];
  const full = what === 'song' ? songLength(P) : pat.length;
  const from = range ? clamp(range.from | 0, 0, full - 1) : 0, to = range ? clamp(range.to | 0, from + 1, full) : full, L = to - from;
  const dur = L * sd + 4;
  if (dur > 25 * 60) throw new Error('That arrangement is longer than 25 minutes — shorten it before exporting.');
  const oac = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const E = new Engine(oac, () => P, { offline: true, noMaster: !!opts.noMaster });
  if (usesDsp(P)) await E.loadDsp();
  E.build(); await E.prepare(P);
  for (let s = from; s < to; s++) {
    const sw = s % 2 ? (P.swing || 0) * sd * 0.5 : 0;
    scheduleStep(E, P, what === 'song' ? 'song' : 'pattern', s, 0.005 + (s - from) * sd + sw, sd, from > 0 ? from : -1);
  }
  const buf = await oac.startRendering();
  // trim the silent tail, keep the musical length
  let last = Math.ceil(L * sd * sr);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > 0.0002) { last = i; break; } }
  return { buffer: buf, frames: Math.min(buf.length, last + Math.floor(sr * 0.05)) };
}

/* ---------- WAV / ZIP / MIDI codecs ---------- */
function encodeWav(buf, frames = buf.length) {
  const nch = buf.numberOfChannels, sr = buf.sampleRate, bytes = frames * nch * 2;
  const ab = new ArrayBuffer(44 + bytes), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, nch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true);
  v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes, true);
  const chs = []; for (let c = 0; c < nch; c++) chs.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < nch; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return ab;
}
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const now = new Date();
  const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack compressed ZIP files.');
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function readZip(ab) {
  const u8 = new Uint8Array(ab), v = new DataView(ab);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not a valid ZIP file.');
  const count = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  if (p === 0xFFFFFFFF || count === 0xFFFF) throw new Error('ZIP64 archives are not supported. Re-zip it with a standard tool.');
  const out = [], dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true);
    const elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/') || name.startsWith('__MACOSX') || fileName(name).startsWith('.')) continue;
    const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
    out.push({ name, get: async () => {
      const raw = u8.subarray(start, start + csize);
      if (method === 0) return raw.slice();
      if (method === 8) return inflateRaw(raw);
      throw new Error(`${fileName(name)} uses an unsupported ZIP compression method.`);
    } });
  }
  return out;
}
function parseMidi(ab) {
  const d = new DataView(ab), N = ab.byteLength; let p = 0;
  const str = (at, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(at + i)); return s; };
  if (N < 14 || str(0, 4) !== 'MThd') throw new Error('This is not a standard MIDI file.');
  const hlen = d.getUint32(4), format = d.getUint16(8), ntr = d.getUint16(10), div = d.getUint16(12);
  if (div & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported.');
  p = 8 + hlen;
  const tracks = []; let tempo = null;
  for (let ti = 0; ti < ntr && p + 8 <= N; ti++) {
    const id = str(p, 4), len = d.getUint32(p + 4); p += 8; const end = Math.min(N, p + len);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, status = 0, name = '';
    const open = new Map(), notes = [];
    const vlq = () => { let val = 0, b; do { b = d.getUint8(p++); val = (val << 7) | (b & 0x7f); } while (b & 0x80 && p < end); return val; };
    while (p < end) {
      tick += vlq(); if (p >= end) break;
      const b = d.getUint8(p);
      if (b & 0x80) { status = b; p++; } else if (!status) break;
      if (status === 0xff) {
        const mt = d.getUint8(p++), ml = vlq();
        if (mt === 0x51 && tempo == null && ml >= 3) tempo = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2);
        if (mt === 0x03 && !name) name = str(p, Math.min(ml, 40)).replace(/[^\x20-\x7e]/g, '').trim();
        p += ml; status = 0;
      } else if (status === 0xf0 || status === 0xf7) { p += vlq(); status = 0; }
      else {
        const type = status & 0xf0, chn = status & 0x0f;
        if (type === 0x90 || type === 0x80) {
          const n = d.getUint8(p++), vel = d.getUint8(p++), key = chn * 128 + n;
          if (type === 0x90 && vel > 0) { if (!open.has(key)) open.set(key, []); open.get(key).push({ tick, v: vel }); }
          else { const st = open.get(key); if (st && st.length) { const o = st.shift(); notes.push({ ch: chn, n, v: o.v / 127, t0: o.tick, t1: tick }); } }
        } else if (type === 0xC0 || type === 0xD0) p += 1;
        else if (type === 0xA0 || type === 0xB0 || type === 0xE0) p += 2;
        else break;
      }
    }
    for (const [key, st] of open) for (const o of st) notes.push({ ch: key >> 7, n: key & 127, v: o.v / 127, t0: o.tick, t1: o.tick + div });
    tracks.push({ name, notes });
    p = end;
  }
  return { format, div, bpm: tempo ? Math.round(60000000 / tempo) : null, tracks };
}
