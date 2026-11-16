/* =====================================================================
   Part 2: project model, transport, views, import / export, boot
   ===================================================================== */
const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor"/></svg>',
  undo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5H9a3.5 3.5 0 0 1 0 7H6.5"/></svg>',
  redo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5H7a3.5 3.5 0 0 0 0 7h2.5"/></svg>',
  x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
  left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4L6 8l4 4"/></svg>',
  search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>',
  importIc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.5M4.8 6.8 8 10l3.2-3.2"/><path d="M2.5 10.5v3h11v-3"/></svg>',
  folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 4h4.2l1.5 1.6H14v6.9H2z"/></svg>',
  chat: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2.5 3h11v7.5H7.5L4.5 13v-2.5h-2z"/><path d="M5.5 6.8h5" stroke-linecap="round"/></svg>',
  right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>',
  metro: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M6 2h4l2.5 12h-9z"/><path d="M8 11l3.5-6.5"/><path d="M5 11h6"/></svg>',
  mic: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="5.5" y="1.8" width="5" height="8" rx="2.5"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5"/></svg>',
  more: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="12.5" cy="8" r="1.5"/></svg>',
  phones: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10V8a5.5 5.5 0 0 1 11 0v2"/><rect x="2" y="9.5" width="3" height="4.5" rx="1.2"/><rect x="11" y="9.5" width="3" height="4.5" rx="1.2"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
  again: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5V5h-2.5"/></svg>',
};
const icon = n => el('span', { class: 'ic', 'aria-hidden': 'true', html: ICON[n] });
const DT_SAMPLE = 'application/x-tapehouse-sample';
const hasType = (dt, t) => !!dt && Array.from(dt.types || []).includes(t);
const PR = { keysW: 54, rulerH: 22, rowH: 14, cellW: 22, lo: 21, hi: 108 };
const PL = { headW: 176, rowH: 48 };
const COLOR = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  COLOR.accentRgb = cs.getPropertyValue('--accent-rgb').trim().replace(/\s+/g, ',');
  for (const k of ['bg', 'well', 'panel', 'panel-2', 'panel-3', 'line', 'line-2', 'text', 'muted', 'faint', 'accent', 'accent-hi', 'accent-lo', 'danger', 'key-white', 'key-black', 'font-ui', 'font-mono']) COLOR[k] = cs.getPropertyValue('--' + k).trim();
}

/* ---------- state ---------- */
let project = null, downloads = null, factoryPending = false;
const ui = { tab: 'create', cTags: [], cDesc: '', cCustom: false, cTitle: '', cLyrics: '', cBusy: false, cStatus: null, takes: [], songs: null, pvKey: null, pvLoading: false, selCh: null, prCh: null, prTool: 'draw', prLen: 4, prSel: null, prSnapKey: true, prCursor: 0, plBarW: 56, plSnap: 16, plSel: null, plBrush: null, plMark: null,
  selInsert: 1, libQuery: '', libFolder: 'All', libSel: null, importFolder: 'Imported', previewId: null, pluginDraft: '', sdkStatus: null,
  guide: true, ideaStyle: 'house', ideaProg: 'dark', askText: '', mixReport: null,
  rec: { metro: false, countIn: true, loopBars: 0, latencyMs: 0, monitor: false, deviceId: '' }, autoSel: null, autoBars: 4, autoFrom: null,
  ab: 'A', refPos: 0, masterBusy: null, masterInfo: null, refInfo: null, tone: null };
const T = { playing: false, mode: 'pattern', step: 0, next: 0, queue: [], songPos: 0, marker: 0, shown: -1, first: false, startStep: 0 };
const hist = { undo: [], redo: [] };

/* ---------- project model ---------- */
const fxSlot = (plugin, params) => ({ id: uid(), plugin, params: params || {}, bypass: false });
function newMixer(n = 8, names = []) {
  const m = [{ id: 'master', name: 'Master', vol: 0.85, pan: 0, mute: false, solo: false, fx: [] }];
  for (let i = 1; i <= n; i++) m.push({ id: uid(), name: names[i - 1] || `Insert ${i}`, vol: 0.8, pan: 0, mute: false, solo: false, fx: [] });
  return m;
}
const newTrack = (i, name) => ({ name: name || `Track ${i + 1}`, mute: false, insert: 0 });
const newPattern = (i, len = 16) => ({ id: uid(), name: `Pattern ${i + 1}`, color: COLORS[(i * 3) % COLORS.length], length: len, steps: {}, notes: {} });
function newProject(name = 'Untitled') {
  const pat = newPattern(0);
  return { format: 'tapehouse-project', version: 1, id: uid(), name, bpm: 120, swing: 0, key: 9, scale: 'minor', channels: [], patterns: [pat], currentPattern: pat.id,
    playlist: { tracks: Array.from({ length: 8 }, (_, i) => newTrack(i)), clips: [], markers: [] }, mixer: newMixer(8), master: defaultMaster(), automation: [], updatedAt: Date.now() };
}
function blankProject() {
  const P = newProject('Untitled');
  [['Kick', 'kick'], ['Clap', 'clap'], ['Hat', 'hat'], ['Snare', 'snare']].forEach(([name, drum], i) => {
    P.channels.push({ id: uid(), name, color: COLORS[i], kind: 'drum', drum, params: {}, vol: 0.8, pan: 0, mute: false, insert: i + 1 });
    P.mixer[i + 1].name = name;
  });
  return P;
}
function demoProject() {
  const P = newProject('First Session'); P.bpm = 124; P.swing = 0.1;
  P.mixer = newMixer(8, ['Kick', 'Clap', 'Hats', 'Bass', 'Keys', 'Pad']);
  P.mixer[0].fx = [fxSlot('th.glue-comp', { threshold: -12, ratio: 2, makeup: 2 })];
  P.mixer[3].fx = [fxSlot('th.eq3', { low: -12, mid: 0, high: 2 })];
  P.mixer[4].fx = [fxSlot('th.saturator', { drive: 0.3, mix: 0.6, output: -2 })];
  P.mixer[5].fx = [fxSlot('th.tape-delay', { time: 0.75, mix: 0.2 }), fxSlot('th.room-reverb', { size: 2.2, mix: 0.25 })];
  P.mixer[6].fx = [fxSlot('th.chorus', { mix: 0.35 }), fxSlot('th.room-reverb', { size: 4.5, mix: 0.38 })];
  const mk = o => ({ id: uid(), vol: 0.8, pan: 0, mute: false, params: {}, insert: 0, ...o });
  const kick = mk({ name: 'Kick', kind: 'drum', drum: 'kick', color: COLORS[0], insert: 1, vol: 0.95 });
  const clap = mk({ name: 'Clap', kind: 'drum', drum: 'clap', color: COLORS[2], insert: 2, vol: 0.7 });
  const hat = mk({ name: 'Hat', kind: 'drum', drum: 'hat', color: COLORS[6], insert: 3, vol: 0.55, pan: 0.15 });
  const ohat = mk({ name: 'Open Hat', kind: 'drum', drum: 'openhat', color: COLORS[6], insert: 3, vol: 0.42, pan: -0.1 });
  const shaker = mk({ name: 'Shaker', kind: 'sampler', sampleId: 'factory-shaker', color: COLORS[4], insert: 3, vol: 0.45, pan: 0.3 });
  const bass = mk({ name: 'Bass', kind: 'synth', plugin: 'th.acid-bass', color: COLORS[1], insert: 4, vol: 0.72 });
  const keys = mk({ name: 'Keys', kind: 'synth', plugin: 'th.tape-keys', color: COLORS[3], insert: 5, vol: 0.62 });
  const pad = mk({ name: 'Pad', kind: 'synth', plugin: 'th.sunset-pad', color: COLORS[5], insert: 6, vol: 0.55 });
  P.channels = [kick, clap, hat, ohat, shaker, bass, keys, pad];
  bass.duck = { by: kick.id, amount: 0.5 };
  const steps = (len, map) => { const a = new Array(len).fill(0); for (const k in map) a[k] = map[k]; return a; };
  const drums = { ...newPattern(0, 16), name: 'Drums', color: COLORS[0] };
  drums.steps[kick.id] = steps(16, { 0: 0.95, 4: 0.95, 8: 0.95, 12: 0.95 });
  drums.steps[clap.id] = steps(16, { 4: 0.85, 12: 0.85 });
  const hm = {}; [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15].forEach(i => { hm[i] = i % 2 ? 0.4 : 0.6; });
  drums.steps[hat.id] = steps(16, hm);
  drums.steps[ohat.id] = steps(16, { 2: 0.75, 6: 0.75, 10: 0.75, 14: 0.75 });
  drums.steps[shaker.id] = steps(16, { 3: 0.55, 7: 0.45, 11: 0.55, 15: 0.45 });
  const roots = [45, 41, 48, 43];
  const bassP = { ...newPattern(1, 64), name: 'Bassline', color: COLORS[1] };
  bassP.notes[bass.id] = roots.flatMap((r, b) => [[0, 2, 0], [3, 1, 0], [6, 1, 12], [8, 2, 0], [11, 1, 12], [12, 2, 0], [14, 1, 7]].map(([s, l, o]) => ({ s: b * 16 + s, l, n: r + o, v: 0.85 })));
  const keysP = { ...newPattern(2, 64), name: 'Keys', color: COLORS[3] };
  const chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
  keysP.notes[keys.id] = chords.flatMap((c, b) => [2, 6, 10, 14].flatMap(s => c.map(n => ({ s: b * 16 + s, l: 2, n, v: 0.7 }))));
  const padP = { ...newPattern(3, 64), name: 'Pad', color: COLORS[5] };
  const padCh = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]];
  padP.notes[pad.id] = padCh.flatMap((c, b) => c.map(n => ({ s: b * 16, l: 16, n, v: 0.7 })));
  P.patterns = [drums, bassP, keysP, padP]; P.currentPattern = drums.id;
  ['Drums', 'Bass', 'Keys', 'Pad'].forEach((n, i) => { P.playlist.tracks[i].name = n; });
  const clip = (ref, track, start, len) => ({ id: uid(), kind: 'pattern', ref, track, start, len, gain: 1, offset: 0 });
  P.playlist.clips = [clip(padP.id, 3, 0, 256), clip(drums.id, 0, 64, 192), clip(bassP.id, 1, 128, 128), clip(keysP.id, 2, 64, 64), clip(keysP.id, 2, 192, 64)];
  P.playlist.markers = [{ id: uid(), start: 0, name: 'Intro' }, { id: uid(), start: 64, name: 'Groove' }, { id: uid(), start: 128, name: 'Full' }];
  return P;
}
/* What Listen & Match heard, kept with the insert so its sliders still work after reopening (plain numbers only, size-capped). */
function keepMatch(x) { if (!x || typeof x !== 'object') return undefined; try { const j = JSON.stringify(x); return j.length < 40000 ? JSON.parse(j) : undefined; } catch (e) { return undefined; } }
function normalizeProject(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.channels) || !Array.isArray(p.patterns)) throw new Error('This is not a Tapehouse project.');
  const num = (v, d, a, b) => { v = +v; return Number.isFinite(v) ? clamp(v, a, b) : d; };
  const isHex = c => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
  const out = { format: 'tapehouse-project', version: 1, id: String(p.id || uid()), name: String(p.name || 'Untitled').slice(0, 80),
    bpm: Math.round(num(p.bpm, 120, 40, 240)), swing: num(p.swing, 0, 0, 0.6), key: Math.round(num(p.key, 9, 0, 11)), scale: SCALES[p.scale] ? p.scale : 'minor', updatedAt: +p.updatedAt || Date.now() };
  if (p.keySet) out.keySet = true;
  const sk = p.smartKey; // what Smart key heard in the beat, so Tune and offline renders snap the same way after a reload
  if (sk && Number.isFinite(+sk.root)) out.smartKey = { root: Math.round(num(sk.root, 0, 0, 11)), mode: sk.mode === 'major' ? 'major' : 'minor', conf: num(sk.conf, 0, 0, 1), src: ['beat', 'vocal', 'song'].includes(sk.src) ? sk.src : 'beat', extra: Array.isArray(sk.extra) ? sk.extra.slice(0, 2).map(x => Math.round(num(x, 0, 0, 11))) : [], sig: String(sk.sig || '').slice(0, 24), alt: Array.isArray(sk.alt) ? sk.alt.slice(0, 3).map(a => [Math.round(num(a[0], 0, 0, 11)), a[1] === 'major' ? 'major' : 'minor', num(a[2], 0, 0, 1)]) : [] };
  const mix = Array.isArray(p.mixer) && p.mixer.length ? p.mixer.slice(0, 64) : newMixer(8);
  out.mixer = mix.map((m, i) => ({ id: String((m && m.id) || uid()), name: String((m && m.name) || (i ? `Insert ${i}` : 'Master')).slice(0, 24),
    vol: num(m && m.vol, 0.8, 0, 1.25), pan: num(m && m.pan, 0, -1, 1), mute: !!(m && m.mute), solo: !!(m && m.solo),
    fx: (m && Array.isArray(m.fx) ? m.fx : []).filter(f => f && typeof f.plugin === 'string').slice(0, 16)
      .map(f => ({ id: String(f.id || uid()), plugin: f.plugin, params: (f.params && typeof f.params === 'object') ? { ...f.params } : {}, bypass: !!f.bypass })),
    match: keepMatch(m && m.match), trim: num(m && m.trim, 0, -24, 24),
    vsPreset: m && typeof m.vsPreset === 'string' ? m.vsPreset.slice(0, 60) : undefined, vsMod: !!(m && m.vsMod) || undefined,
    vsTarget: m && typeof m.vsTarget === 'string' ? m.vsTarget.slice(0, 24) : undefined, vsMatch: m && m.vsMatch ? keepMatch(m.vsMatch) : undefined }));
  out.channels = p.channels.filter(c => c && ['drum', 'sampler', 'synth'].includes(c.kind)).slice(0, 64).map((c, i) => ({
    id: String(c.id || uid()), name: String(c.name || 'Channel').slice(0, 32), color: isHex(c.color) ? remapColor(c.color) : COLORS[i % COLORS.length], kind: c.kind,
    drum: c.kind === 'drum' ? (DRUMS.some(d => d[0] === c.drum) ? c.drum : 'kick') : undefined,
    plugin: c.kind === 'synth' ? (c.plugin === 'th.vox' ? 'th.square-lead' : String(c.plugin || '')) : undefined, sampleId: c.kind === 'sampler' ? String(c.sampleId || '') : undefined,
    params: (c.params && typeof c.params === 'object') ? { ...c.params } : {}, vol: num(c.vol, 0.8, 0, 1.2), pan: num(c.pan, 0, -1, 1),
    mute: !!c.mute, insert: Math.round(num(c.insert, 0, 0, out.mixer.length - 1)),
    duck: c.duck && typeof c.duck.by === 'string' ? { by: c.duck.by, amount: num(c.duck.amount, 0.5, 0, 0.95) } : undefined }));
  const chIds = new Set(out.channels.map(c => c.id));
  out.channels.forEach(c => { if (c.duck && (!chIds.has(c.duck.by) || c.duck.by === c.id)) delete c.duck; });
  out.patterns = p.patterns.filter(Boolean).slice(0, 200).map((pt, i) => {
    const L = Math.round(num(pt.length, 16, 1, 512)), steps = {}, notes = {};
    for (const k in (pt.steps || {})) if (chIds.has(k) && Array.isArray(pt.steps[k])) { const a = pt.steps[k].slice(0, L).map(v => num(v, 0, 0, 1)); while (a.length < L) a.push(0); steps[k] = a; }
    for (const k in (pt.notes || {})) if (chIds.has(k) && Array.isArray(pt.notes[k])) {
      notes[k] = pt.notes[k].filter(n => n && Number.isFinite(+n.s) && Number.isFinite(+n.n)).slice(0, 4000)
        .map(n => { const s = Math.round(clamp(+n.s, 0, L - 1)); return { s, l: Math.min(Math.round(num(n.l, 1, 1, L)), L - s), n: Math.round(clamp(+n.n, 0, 127)), v: num(n.v, 0.8, 0.05, 1) }; });
    }
    return { id: String(pt.id || uid()), role: typeof pt.role === 'string' ? pt.role.slice(0, 24) : undefined, name: String(pt.name || `Pattern ${i + 1}`).slice(0, 40), color: isHex(pt.color) ? remapColor(pt.color) : COLORS[(i * 3) % COLORS.length], length: L, steps, notes };
  });
  if (!out.patterns.length) out.patterns.push(newPattern(0));
  out.currentPattern = out.patterns.some(x => x.id === p.currentPattern) ? p.currentPattern : out.patterns[0].id;
  const pl = p.playlist || {};
  const tracks = Array.isArray(pl.tracks) && pl.tracks.length ? pl.tracks.slice(0, 64) : Array.from({ length: 8 }, (_, i) => newTrack(i));
  out.playlist = { tracks: tracks.map((t, i) => ({ name: String((t && t.name) || `Track ${i + 1}`).slice(0, 24), mute: !!(t && t.mute), insert: Math.round(num(t && t.insert, 0, 0, out.mixer.length - 1)) })), clips: [] };
  const patIds = new Set(out.patterns.map(x => x.id));
  out.playlist.clips = (Array.isArray(pl.clips) ? pl.clips : []).filter(c => c && (c.kind === 'pattern' ? patIds.has(c.ref) : (c.kind === 'audio' && typeof c.ref === 'string'))).slice(0, 3000)
    .map(c => {
      const o = { id: String(c.id || uid()), kind: c.kind, ref: c.ref, track: Math.round(num(c.track, 0, 0, out.playlist.tracks.length - 1)),
        start: Math.round(num(c.start, 0, 0, 100000)), len: Math.round(num(c.len, 16, 1, 100000)), gain: num(c.gain, 1, 0, 2), offset: num(c.offset, 0, 0, 36000) };
      if (c.kind === 'audio' && Array.isArray(c.takes)) { const tk = c.takes.filter(x => typeof x === 'string').slice(0, 64); if (!tk.includes(o.ref)) tk.push(o.ref); if (tk.length > 1) o.takes = tk; }
      return o;
    });
  out.playlist.markers = (Array.isArray(pl.markers) ? pl.markers : []).filter(m => m && Number.isFinite(+m.start)).slice(0, 64)
    .map(m => ({ id: String(m.id || uid()), start: Math.round(num(m.start, 0, 0, 100000)), name: String(m.name || 'Section').slice(0, 24), lyrics: typeof m.lyrics === 'string' ? m.lyrics.slice(0, 1500) : '' })).sort((a, b) => a.start - b.start);
  if (p.song && typeof p.song === 'object') {
    const sg = p.song, prog = a => Array.isArray(a) && a.length && a.every(x => Number.isInteger(x) && x >= 0 && x <= 6) ? a.slice(0, 4) : undefined;
    const ids = new Set(out.channels.map(c => c.id)), roles = {};
    for (const k of ['kick', 'bass', 'chords', 'pad', 'lead']) if (sg.roles && ids.has(sg.roles[k])) roles[k] = sg.roles[k];
    const tr = {}; for (const k of ['drums', 'bass', 'chords', 'lead']) tr[k] = Math.round(num(sg.tracks && sg.tracks[k], { drums: 0, bass: 1, chords: 2, lead: 3 }[k], 0, out.playlist.tracks.length - 1));
    out.song = { title: String(sg.title || out.name).slice(0, 80), prompt: String(sg.prompt || '').slice(0, 600), tags: (Array.isArray(sg.tags) ? sg.tags : []).slice(0, 6).map(t => String(t).slice(0, 24)),
      style: STYLES[sg.style] ? sg.style : 'pop', vocal: !!sg.vocal, seed: Number.isFinite(+sg.seed) ? (+sg.seed >>> 0) : 1, created: +sg.created || Date.now(),
      prog: sg.prog ? { verse: prog(sg.prog.verse) || [0, 5, 2, 6], chorus: prog(sg.prog.chorus) || [3, 4, 0, 5], bridge: prog(sg.prog.bridge) || [5, 3, 0, 4] } : undefined, roles, tracks: tr };
  }
  out.master = normalizeMaster(p.master);
  if (p.reference && typeof p.reference.id === 'string') out.reference = { id: p.reference.id };
  out.automation = normalizeAutomation(p.automation, out);
  upgradeChains(out);
  return out;
}
const curPattern = () => project.patterns.find(p => p.id === project.currentPattern) || project.patterns[0];
const patById = id => project.patterns.find(p => p.id === id);
function ensureSteps(pat, chId) {
  let a = pat.steps[chId]; if (!a) a = pat.steps[chId] = new Array(pat.length).fill(0);
  while (a.length < pat.length) a.push(0);
  return a;
}
function setPatternLength(pat, L) {
  pat.length = L;
  for (const k in pat.steps) { const a = pat.steps[k]; if (a.length > L) a.length = L; else while (a.length < L) a.push(0); }
  for (const k in pat.notes) pat.notes[k] = pat.notes[k].filter(n => n.s < L).map(n => (n.s + n.l > L ? { ...n, l: L - n.s } : n));
}
function chanLabel(ch) {
  if (ch.kind === 'drum') return 'Drum · ' + ((DRUMS.find(d => d[0] === ch.drum) || [])[1] || 'Drum');
  if (ch.kind === 'synth') { const pl = getPlugin(ch.plugin); return pl ? 'Instrument · ' + pl.manifest.name : 'Missing plugin'; }
  const s = lib.get(ch.sampleId); return s ? 'Sampler · ' + s.name : 'Missing sample';
}
function nextFreeInsert(P = project) {
  const used = new Set(P.channels.map(c => c.insert));
  for (let i = 1; i < P.mixer.length; i++) if (!used.has(i)) return i;
  if (P.mixer.length < 64) { P.mixer.push({ id: uid(), name: `Insert ${P.mixer.length}`, vol: 0.8, pan: 0, mute: false, solo: false, fx: [] }); return P.mixer.length - 1; }
  return 0;
}
function makeChannel(P, o) {
  const ch = { id: uid(), name: 'Channel', color: COLORS[P.channels.length % COLORS.length], kind: 'drum', params: {}, vol: 0.8, pan: 0, mute: false, ...o };
  if (o.insert == null) ch.insert = nextFreeInsert(P);
  const m = P.mixer[ch.insert]; if (ch.insert > 0 && m && /^Insert \d+$/.test(m.name)) m.name = ch.name.slice(0, 24);
  P.channels.push(ch); return ch;
}
function addChannel(o) {
  let ch;
  mutate(P => { ch = makeChannel(P, o); ui.selCh = ch.id; });
  return ch;
}
function addSamplerChannel(id) {
  const s = lib.get(id); if (!s) return;
  addChannel({ name: s.name.slice(0, 32), kind: 'sampler', sampleId: id });
  getBuffer(id).catch(() => {});
  if (ui.tab !== 'rack') toast(`Added “${s.name}” to your beat`, { action: { label: 'Open Beat', run: () => setTab('rack') } });
}
function duplicateChannel(ch) {
  mutate(P => {
    const c = JSON.parse(JSON.stringify(ch)); c.id = uid(); c.name = (ch.name + ' 2').slice(0, 32);
    P.channels.splice(P.channels.indexOf(ch) + 1, 0, c);
    for (const pt of P.patterns) { if (pt.steps[ch.id]) pt.steps[c.id] = pt.steps[ch.id].slice(); if (pt.notes[ch.id]) pt.notes[c.id] = pt.notes[ch.id].map(n => ({ ...n })); }
    ui.selCh = c.id;
  });
}
function deleteChannel(id) {
  mutate(P => {
    P.channels = P.channels.filter(c => c.id !== id);
    for (const pt of P.patterns) { delete pt.steps[id]; delete pt.notes[id]; }
    if (ui.selCh === id) ui.selCh = null; if (ui.prCh === id) ui.prCh = null;
  });
}
function addPattern(clone) {
  mutate(P => {
    const src = curPattern();
    const p = clone ? JSON.parse(JSON.stringify(src)) : newPattern(P.patterns.length, 16);
    p.id = uid(); p.name = clone ? (src.name + ' copy').slice(0, 40) : `Pattern ${P.patterns.length + 1}`;
    p.color = COLORS[(P.patterns.length * 3) % COLORS.length];
    P.patterns.push(p); P.currentPattern = p.id; ui.plBrush = p.id;
  });
}
function deletePattern() {
  if (project.patterns.length < 2) return;
  mutate(P => {
    const id = P.currentPattern;
    P.patterns = P.patterns.filter(p => p.id !== id);
    P.playlist.clips = P.playlist.clips.filter(c => !(c.kind === 'pattern' && c.ref === id));
    P.currentPattern = P.patterns[0].id;
  });
}
function firstFreeTrack(start, len) {
  const tr = project.playlist.tracks;
  for (let t = 0; t < tr.length; t++) if (!project.playlist.clips.some(c => c.track === t && c.start < start + len && start < c.start + c.len)) return t;
  return tr.length;
}
function addAudioClip(id, track = null, start = null) {
  const s = lib.get(id); if (!s) return;
  const sd = 60 / project.bpm / 4, len = Math.max(4, Math.ceil(s.duration / sd / 4) * 4);
  if (start == null) start = T.songPos;
  if (track == null) track = firstFreeTrack(start, len);
  mutate(P => {
    while (track >= P.playlist.tracks.length) P.playlist.tracks.push(newTrack(P.playlist.tracks.length));
    const c = { id: uid(), kind: 'audio', ref: id, track, start, len, gain: 1, offset: 0 };
    P.playlist.clips.push(c); ui.plSel = c.id;
  });
  getBuffer(id).catch(() => {});
  if (ui.tab !== 'playlist') toast(`Placed “${s.name}” on ${project.playlist.tracks[track].name} at bar ${Math.floor(start / 16) + 1}`, { action: { label: 'Open Song', run: () => setTab('playlist') } });
}

/* ---------- undo / save ---------- */
function pushUndo() { hist.undo.push(JSON.stringify(project)); if (hist.undo.length > 80) hist.undo.shift(); hist.redo.length = 0; updateUndo(); }
function mutate(fn, opts = {}) { pushUndo(); fn(project); changed(opts); }
function changed(opts = {}) {
  project.updatedAt = Date.now(); scheduleSave();
  if (engine) engine.sync();
  if (opts.render === false) renderTransport(); else render();
  smartKeySoon();
}
function swapFromHistory(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(project)); project = JSON.parse(from.pop());
  ui.prSel = null; ui.plSel = null;
  if (engine) { engine.inserts.forEach(i => { i.sig = null; }); engine.sync(); }
  scheduleSave(); render();
}
const undo = () => swapFromHistory(hist.undo, hist.redo);
const redo = () => swapFromHistory(hist.redo, hist.undo);
function updateUndo() { $('#undoBtn').disabled = !hist.undo.length; $('#redoBtn').disabled = !hist.redo.length; }
const setSaveState = t => { $('#saveState').textContent = t; };
async function saveProject() {
  if (!project) return;
  try {
    await Store.put('projects', { id: project.id, name: project.name, updatedAt: project.updatedAt || Date.now(), data: JSON.stringify(project) });
    await Store.put('meta', { key: 'current', value: project.id });
    setSaveState(Store.durable ? 'Saved' : 'Not saved · storage blocked');
  } catch (e) { setSaveState('Not saved'); toast(`Couldn’t save to this browser: ${e.message}`, { kind: 'error' }); }
}
const scheduleSave = debounce(() => { setSaveState('Saving…'); saveProject(); }, 600);

/* ---------- toasts & small controls ---------- */
function toast(msg, o = {}) {
  const t = el('div', { class: 'toast' + (o.kind ? ' ' + o.kind : ''), role: o.kind === 'error' ? 'alert' : 'status' }, el('span', {}, msg));
  if (o.action) t.append(el('button', { class: 'btn sm', onclick: () => { o.action.run(); t.remove(); } }, o.action.label));
  $('#toasts').append(t);
  if (!o.sticky) setTimeout(() => t.remove(), o.ms || (o.action ? 9000 : 4200));
  return { set(m) { t.firstChild.textContent = m; }, done() { t.remove(); } };
}
function confirmBtn(label, run, o = {}) {
  const b = el('button', { class: o.cls || 'btn danger' }, label); let armed = false, timer;
  b.addEventListener('click', e => {
    e.stopPropagation();
    if (!armed) { armed = true; b.textContent = o.confirm || 'Click again to confirm'; b.classList.add('arm');
      timer = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('arm'); }, 3500); return; }
    clearTimeout(timer); run();
  });
  return b;
}
const emptyState = (title, text, action) => el('div', { class: 'empty' }, el('h3', {}, title), el('p', {}, text), action || null);

function knob(o) {
  const NS = 'http://www.w3.org/2000/svg', size = o.mini ? 26 : 38;
  const wrap = el('div', { class: 'knob' + (o.mini ? ' mini' : '') + (o.cls ? ' ' + o.cls : ''), tabindex: '0', role: 'slider', 'aria-label': o.label });
  if (o.color) wrap.style.setProperty('--kc', o.color);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  const R = 15, A0 = -135, A1 = 135;
  const pt = a => { const r = a * Math.PI / 180; return [20 + R * Math.sin(r), 20 - R * Math.cos(r)]; };
  const arc = (a, b) => { if (Math.abs(b - a) < 0.5) return ''; const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  mk('path', { d: arc(A0, A1), class: 'trk', fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round' });
  const val = mk('path', { class: 'val', fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round' });
  mk('circle', { cx: 20, cy: 20, r: 10, class: 'cap' });
  const ptr = mk('line', { x1: 20, y1: 20, x2: 20, y2: 12, class: 'ptr', 'stroke-width': 2, 'stroke-linecap': 'round' });
  wrap.append(svg);
  const kv = el('span', { class: 'kv' });
  if (!o.mini) wrap.append(kv, el('span', { class: 'kl' }, o.label));
  let v = o.value ?? o.def;
  const toN = x => o.curve === 'log' ? Math.log(x / o.min) / Math.log(o.max / o.min) : (x - o.min) / (o.max - o.min);
  const fromN = n => { n = clamp(n, 0, 1); let x = o.curve === 'log' ? o.min * Math.pow(o.max / o.min, n) : o.min + n * (o.max - o.min); if (o.step) x = Math.round(x / o.step) * o.step; return clamp(x, o.min, o.max); };
  const draw = () => {
    const a = A0 + clamp(toN(v), 0, 1) * (A1 - A0), zero = o.bipolar ? 0 : A0;
    val.setAttribute('d', a >= zero ? arc(zero, a) : arc(a, zero)); ptr.setAttribute('transform', `rotate(${a.toFixed(1)} 20 20)`);
    const txt = o.fmt ? o.fmt(v) : String(+(+v).toFixed(2));
    kv.textContent = txt; wrap.setAttribute('aria-valuenow', String(v)); wrap.setAttribute('aria-valuetext', txt); wrap.title = `${o.label}: ${txt}`;
  };
  const set = nv => { if (nv === v) return; v = nv; draw(); if (o.onInput) o.onInput(v); };
  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); wrap.focus({ preventScroll: true });
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    if (o.onStart) o.onStart();
    const y0 = e.clientY, n0 = toN(v);
    const move = ev => set(fromN(n0 + (y0 - ev.clientY) / (ev.shiftKey ? 700 : 160)));
    const up = () => { wrap.removeEventListener('pointermove', move); wrap.removeEventListener('pointerup', up); wrap.removeEventListener('pointercancel', up); if (o.onEnd) o.onEnd(v); };
    wrap.addEventListener('pointermove', move); wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  });
  wrap.addEventListener('dblclick', e => { e.stopPropagation(); if (o.onStart) o.onStart(); set(o.def); if (o.onEnd) o.onEnd(v); });
  wrap.addEventListener('keydown', e => {
    const d = e.shiftKey ? 0.005 : 0.04; let n = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') n = toN(v) + d; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') n = toN(v) - d;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = 1;
    if (n == null) return; e.preventDefault(); e.stopPropagation();
    if (o.onStart) o.onStart();
    let nv = fromN(n); if (o.step && nv === v) nv = clamp(v + Math.sign(n - toN(v)) * o.step, o.min, o.max);
    set(nv); if (o.onEnd) o.onEnd(v);
  });
  wrap.setValue = nv => { v = nv; draw(); };
  draw();
  return wrap;
}
function fmtParam(d, v) {
  if (d.options) { const o = d.options.find(x => x.value === v); return o ? o.label : String(v); }
  const u = d.unit || '';
  if (u === 'Hz') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(Math.round(v));
  if (u === 's') return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s';
  if (u === 'dB') return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
  if (u === 'st') return (v > 0 ? '+' : '') + Math.round(v) + ' st';
  if (u === '%' || (!u && d.min >= 0 && d.max <= 1)) return Math.round(v * 100) + '%';
  if (u === '×') return v.toFixed(2) + '×';
  const dec = d.step >= 1 ? 0 : (Math.abs(v) < 10 ? 2 : 1);
  return v.toFixed(dec) + (u ? ' ' + u : '');
}
function paramControl(d, value, o) {
  if (d.options) {
    const sel = el('select', { 'aria-label': d.label, onchange: e => { o.onStart(); o.onInput(d.options[+e.target.value].value); o.onEnd(); } },
      d.options.map((x, i) => el('option', { value: String(i), selected: x.value === value }, x.label)));
    return el('label', { class: 'optwrap' }, sel, el('span', { class: 'kl' }, d.label));
  }
  return knob({ value: +value, min: d.min, max: d.max, def: d.default, curve: d.curve, step: d.step, bipolar: d.min < 0 && d.max > 0, label: d.label,
    fmt: x => fmtParam(d, x), color: o.color, onStart: o.onStart, onInput: o.onInput, onEnd: o.onEnd });
}

/* ---------- audio context & transport ---------- */
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const wait = ms => new Promise(r => setTimeout(r, ms));
let unlockEl = null, unlockTried = false;
function silentWavURL() {
  const n = 4000, ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
  const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
}
// iPhones route web audio through the ringer channel, so the silent switch mutes it.
// Asking for a "playback" session (and keeping a silent media element playing) lifts that.
function unlockMedia() {
  try { if (navigator.audioSession && !['playback', 'play-and-record'].includes(navigator.audioSession.type)) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  if (!IS_IOS || unlockTried) return;
  unlockTried = true;
  try {
    unlockEl = new Audio(silentWavURL()); unlockEl.loop = true; unlockEl.setAttribute('playsinline', '');
    const p = unlockEl.play(); if (p && p.catch) p.catch(() => { unlockTried = false; unlockEl = null; });
  } catch (e) { unlockTried = false; unlockEl = null; }
}
function ensureCtx() {
  unlockMedia();
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('This browser has no Web Audio support, so Tapehouse can’t make sound here.', { kind: 'error' }); return null; }
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { toast('Sound couldn’t start in this browser.', { kind: 'error' }); return null; } }
    engine = new Engine(ctx, () => project);
    engine.build(); engine.prepare(project).catch(() => {});
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}
function soundCheck() {
  if (!T.playing || !ctx) return;
  if (ctx.state !== 'running') {
    toast('Your browser is holding the sound back. Tap the button to let it play.', { kind: 'error', action: { label: 'Turn on sound', run: () => { unlockTried = false; ensureCtx(); } } });
    return;
  }
  if (IS_IOS) {
    try { if (localStorage.getItem('th.iosHint')) return; localStorage.setItem('th.iosHint', '1'); } catch (e) { return; }
    toast('Playing. If you hear nothing, turn the volume up and switch off silent mode.', { ms: 7000 });
  }
}
const clock = (() => {
  let worker = null, timer = null, backup = null;
  try {
    const src = 'let t=null;onmessage=e=>{clearInterval(t);if(e.data==="go")t=setInterval(()=>postMessage(0),25)}';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = () => tick();
    worker.onerror = () => { worker = null; };
  } catch (e) { worker = null; }
  return {
    start() { if (worker) worker.postMessage('go'); clearInterval(timer); timer = setInterval(tick, 25); clearInterval(backup); },
    stop() { if (worker) worker.postMessage('stop'); clearInterval(timer); clearInterval(backup); },
  };
})();
async function play(opts = {}) {
  if (T.playing || !ensureCtx()) return;
  stopSongPreview();
  T.playing = true; renderTransport();
  try { await Promise.race([ctx.resume(), wait(800)]); } catch (e) { /* checked below */ }
  await Promise.race([engine.prepare(project).catch(() => {}), wait(1500)]);
  if (!T.playing) return;
  T.queue = []; T.shown = -1; T.first = true;
  T.startStep = T.mode === 'song' ? T.songPos : 0; T.step = T.startStep;
  const t0 = ctx.currentTime + 0.06;
  T.next = t0 + (opts.lead || 0);
  engine.autoLast = new Map();
  engine.autoKeys = T.mode === 'song' && autos(project).length ? new Set(autos(project).filter(l => !l.off && l.points.length).map(l => autoKey(l.target))) : null;
  if (opts.onStart) opts.onStart(t0, T.next);
  startReference(T.next);
  clock.start(); tick();
  setTimeout(soundCheck, 700 + (opts.lead || 0) * 1000);
}
function tick() {
  if (!T.playing || !ctx || !engine) return;
  const P = project, horizon = ctx.currentTime + 0.12;
  if (T.next < ctx.currentTime - 0.3) T.next = ctx.currentTime + 0.02; // tab slept: skip ahead instead of bursting
  while (T.next < horizon) {
    const sd = 60 / P.bpm / 4; let wrapped = false;
    if (T.mode === 'song') { const end = T.loop ? T.loop.to : songLength(P); if (T.step >= end) { T.step = T.loop ? T.loop.from : 0; wrapped = true; } }
    else if (T.step >= curPattern().length) T.step = 0;
    if (wrapped) engine.autoLast = new Map();
    const sw = T.step % 2 ? (P.swing || 0) * sd * 0.5 : 0;
    scheduleStep(engine, P, T.mode, T.step, T.next + sw, sd, T.first || wrapped ? T.step : -1);
    if (ui.rec.metro && T.step % 4 === 0) metroClick(T.next, T.step % 16 === 0);
    T.queue.push({ step: T.step, time: T.next });
    T.first = false; T.next += sd; T.step++;
  }
}
function halt() {
  T.playing = false; clock.stop(); T.queue = []; T.shown = -1;
  if (engine) { engine.panic(); engine.resetAuto(); stopReference(); }
  if (REC.state === 'rec' || REC.state === 'count') { REC.stopAt = ctx ? ctx.currentTime : 0; setTimeout(stopRecording, 0); }
  showStep(-1); renderTransport();
}
function togglePlay() {
  if (!T.playing) { play(); return; }
  if (T.mode === 'song' && T.shown >= 0) T.songPos = T.shown;
  halt();
}
function stopAndRewind() {
  const was = T.playing; halt();
  if (!was && T.songPos === T.marker) T.marker = 0;
  T.songPos = T.marker;
  showStep(-1); if (ui.tab === 'playlist') renderView();
}
function setBpm(v) {
  const b = clamp(Math.round(+v) || 120, 40, 240);
  if (b === project.bpm) { renderTransport(); return; }
  mutate(P => { P.bpm = b; }, { render: false });
  if (engine) engine.refreshTempo();
  if (ui.tab === 'playlist') renderView();
}
function fmtPos(step) {
  if (step < 0) step = T.mode === 'song' ? T.songPos : 0;
  return `${Math.floor(step / 16) + 1}.${Math.floor((step % 16) / 4) + 1}.${(step % 4) + 1}`;
}
function patPlayStep(pat) {
  if (!T.playing || T.shown < 0) return -1;
  if (T.mode === 'pattern') return pat.id === project.currentPattern ? T.shown % pat.length : -1;
  const c = project.playlist.clips.find(x => x.kind === 'pattern' && x.ref === pat.id && T.shown >= x.start && T.shown < x.start + x.len && !(project.playlist.tracks[x.track] || {}).mute);
  return c ? (T.shown - c.start) % pat.length : -1;
}
let rackNow = -1;
function showStep(step) {
  $('#timeDisp').textContent = fmtPos(step);
  if (ui.tab === 'rack') {
    const v = $('#view'), s = patPlayStep(curPattern());
    if (s !== rackNow) { $$('.st.now', v).forEach(b => b.classList.remove('now')); if (s >= 0) $$(`.st[data-i="${s}"]`, v).forEach(b => b.classList.add('now')); rackNow = s; }
  } else if (ui.tab === 'piano') drawPiano();
  else if (ui.tab === 'playlist') updatePlayhead();
  else if (ui.tab === 'create') highlightLyrics(step);
}
const meterEls = [];
let scopeEl = null, masterFillEl = null;
function frame() {
  requestAnimationFrame(frame);
  if (T.playing && ctx) {
    const now = ctx.currentTime;
    while (T.queue.length > 1 && T.queue[1].time <= now) T.queue.shift();
    const cur = T.queue[0];
    if (cur && cur.time <= now && cur.step !== T.shown) { T.shown = cur.step; showStep(cur.step); }
  }
  studioFrame();
  if (!engine) return;
  const peakLevel = (an, d) => { an.getFloatTimeDomainData(d); let pk = 0; for (let j = 0; j < d.length; j++) { const a = Math.abs(d[j]); if (a > pk) pk = a; } return clamp((20 * Math.log10(pk + 1e-9) + 54) / 54, 0, 1); };
  for (let i = 0; i < engine.inserts.length; i++) {
    if (!meterEls[i]) continue;
    const ins = engine.inserts[i];
    ins.level = Math.max(peakLevel(ins.meter, ins.data), ins.level - 0.025);
    if (meterEls[i].isConnected) meterEls[i].style.height = (ins.level * 100).toFixed(1) + '%';
  }
  const M = engine.master;
  if (M) {
    M.level = Math.max(peakLevel(M.meter, M.data), M.level - 0.025);
    masterFillEl.style.height = (M.level * 100).toFixed(1) + '%';
    if (M.level > 0.001 || T.playing) drawScope(M.data);
  }
}
function drawScope(data) {
  const c = scopeEl, w = c.clientWidth, h = c.clientHeight; if (!w) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.strokeStyle = COLOR.accent; g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i < data.length; i += 4) { const x = i / (data.length - 1) * w, y = h / 2 - data[i] * h * 0.45; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
}
function previewChannel(ch, dur = 0.25) {
  if (!ensureCtx()) return;
  const go = () => engine.trigger(ch, ctx.currentTime + 0.01, 60, 0.85, dur, true);
  if (ch.kind === 'sampler' && !buffers.has(ch.sampleId)) getBuffer(ch.sampleId).then(go, () => toast('This sample is missing from your library.', { kind: 'error' }));
  else go();
}
function previewNote(ch, n, dur = 0.3) {
  if (!ensureCtx()) return;
  const go = () => engine.trigger(ch, ctx.currentTime + 0.005, n, 0.8, dur, false);
  if (ch.kind === 'sampler' && !buffers.has(ch.sampleId)) getBuffer(ch.sampleId).then(go, () => {}); else go();
}

/* ---------- views ---------- */
const TABS = [['create', 'Create', 'Song generator'], ['rack', 'Beat', 'Channel rack'], ['piano', 'Notes', 'Piano roll'], ['playlist', 'Song', 'Playlist'], ['vocal', 'Vocal', 'Vocal suite'], ['mixer', 'Mix', 'Mixer'], ['library', 'Sounds', 'Library'], ['plugins', 'Plugins', 'Plugin manager']];
const wideMQ = window.matchMedia('(min-width: 1100px)');
const isWide = () => wideMQ.matches;
let swingKnob = null;
function renderTransport() {
  const P = project;
  const pn = $('#projName'); if (document.activeElement !== pn) pn.value = P.name;
  const bpm = $('#bpm'); if (document.activeElement !== bpm) bpm.value = String(P.bpm);
  $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === T.mode)));
  const ps = $('#patSelect'); ps.replaceChildren(...P.patterns.map(p => el('option', { value: p.id }, p.name))); ps.value = P.currentPattern;
  const pb = $('#playBtn'); pb.classList.toggle('on', T.playing); pb.replaceChildren(icon(T.playing ? 'pause' : 'play'));
  pb.setAttribute('aria-label', T.playing ? 'Pause (Space)' : 'Play (Space)');
  const recording = REC.state === 'rec' || REC.state === 'count', rb = $('#recBtn');
  rb.classList.toggle('on', REC.state === 'rec'); rb.classList.toggle('count', REC.state === 'count'); rb.classList.toggle('ready', REC.armed != null && !recording);
  rb.setAttribute('aria-pressed', String(recording)); rb.setAttribute('aria-label', recording ? 'Stop recording (R)' : 'Record (R)'); const rl = rb.querySelector('.rl'); if (rl) rl.textContent = REC.state === 'count' ? 'Get ready' : recording ? 'Stop' : 'Record'; rb.title = recording ? 'Stop recording (R)' : 'Record your voice or an instrument (R)';
  $('#metroBtn').setAttribute('aria-pressed', String(!!ui.rec.metro));
  updateUndo();
  const kr = $('#keyRoot'), ks = $('#keyScale');
  if (!kr.options.length) { kr.append(...KEY_NAMES.map((k, i) => el('option', { value: String(i) }, k))); ks.append(...Object.entries(SCALES).map(([id, sc]) => el('option', { value: id }, sc.label))); }
  kr.value = String(P.key); ks.value = P.scale;
  const kl = $('.keybox .k'), sk = P.smartKey, fromBeat = sk && sk.src === 'beat' && !P.keySet && +sk.root === P.key && sk.mode === P.scale;
  if (kl) { kl.textContent = fromBeat ? 'Key · from your beat' : 'Key'; kl.title = fromBeat ? 'Heard in your beat. Set it yourself and it stays put.' : ''; }
  if (!T.playing) $('#timeDisp').textContent = fmtPos(-1);
  if (!swingKnob) {
    swingKnob = knob({ mini: true, value: P.swing, min: 0, max: 0.6, def: 0, label: 'Swing', fmt: v => Math.round(v / 0.6 * 100) + '%',
      onStart: pushUndo, onInput: v => { project.swing = v; }, onEnd: () => changed({ render: false }) });
    $('#swingHost').append(swingKnob);
  } else if (document.activeElement !== swingKnob) swingKnob.setValue(P.swing);
}
function renderTabs() {
  $('#tabs').replaceChildren(...TABS.map(([id, label, alt]) => el('button', { class: 'tab', role: 'tab', 'data-tab': id, title: alt, 'aria-selected': String(ui.tab === id), onclick: () => setTab(id) }, label)));
  const on = $('#tabs .tab[aria-selected="true"]'), bar = $('#tabs'); // keep the open tab in view when the bar scrolls (phones)
  if (on && bar.scrollWidth > bar.clientWidth) { const l = on.offsetLeft - bar.offsetLeft, r = l + on.offsetWidth; if (l < bar.scrollLeft) bar.scrollLeft = l - 8; else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8; }
}
function setTab(id) {
  if (id === 'library' && isWide()) id = 'rack';
  ui.tab = id; try { localStorage.setItem('th.tab', id); } catch (e) { /* ok */ }
  autoMode(); renderTabs(); renderView();
}
/* Play follows the screen: Beat and Notes loop the pattern you're editing, the other screens play the song.
   Only switches while stopped, and the Pattern/Song switch at the top still overrides it. */
function autoMode() {
  if (T.playing) return;
  const m = ui.tab === 'rack' || ui.tab === 'piano' || !project.playlist.clips.length ? 'pattern' : 'song';
  if (T.mode !== m) { T.mode = m; renderTransport(); }
}
function render() { renderTransport(); renderTabs(); renderView(); }
function renderView() {
  const v = $('#view'), keep = {};
  $$('[data-scroll]', v).forEach(e => { keep[e.dataset.scroll] = [e.scrollLeft, e.scrollTop]; });
  if (prState && prState.ro) prState.ro.disconnect();
  prState = null; rackNow = -1; meterEls.length = 0;
  v.replaceChildren();
  if (ui.tab === 'library' && isWide()) ui.tab = 'rack';
  ({ create: renderCreate, rack: renderRack, piano: renderPiano, playlist: renderPlaylist, vocal: renderVocal, mixer: renderMixer, library: renderLibrary, plugins: renderPlugins }[ui.tab] || renderRack)(v);
  $$('[data-scroll]', v).forEach(e => { const k = keep[e.dataset.scroll]; if (k) { e.scrollLeft = k[0]; e.scrollTop = k[1]; } });
  if (T.playing && T.shown >= 0) showStep(T.shown);
}
function renderLib() {
  if (isWide()) renderLibrary($('#libRail'));
  else if (ui.tab === 'library') renderView();
}

/* ----- channel rack ----- */
let paint = null, stepEditing = false;
function setStep(arr, b, i, val) {
  arr[i] = val; b.classList.toggle('on', !!val); b.setAttribute('aria-pressed', String(!!val));
  if (val) b.style.setProperty('--v', val);
}
const cycleVel = v => !v ? 1 : v >= 0.95 ? 0.5 : v <= 0.55 ? 0.8 : 1;
function lengthSelect(pat) {
  const opts = [16, 32, 48, 64, 128, 256]; if (!opts.includes(pat.length)) opts.push(pat.length); opts.sort((a, b) => a - b);
  return el('select', { 'aria-label': 'Pattern length', value: String(pat.length), onchange: e => mutate(() => setPatternLength(pat, +e.target.value)) },
    opts.map(n => el('option', { value: String(n) }, n % 16 === 0 ? `${n / 16} bar${n === 16 ? '' : 's'}` : `${n} steps`)));
}
function insertSelect(ch, cls) {
  return el('select', { class: cls || '', 'aria-label': `Mixer insert for ${ch.name}`, title: 'Mixer insert', value: String(ch.insert), onchange: e => mutate(() => { ch.insert = +e.target.value; }, { render: false }) },
    project.mixer.map((m, i) => el('option', { value: String(i) }, i === 0 ? 'Master' : `${i} · ${m.name}`)));
}
function instrumentOptions(cur) {
  const list = [...plugins.values()].filter(p => p.manifest.type === 'instrument').map(p => el('option', { value: p.id }, p.manifest.name + (p.builtin ? '' : ' ★')));
  if (!plugins.has(cur)) list.unshift(el('option', { value: cur }, 'Missing plugin'));
  return list;
}
function sortedLib() { return [...lib.values()].sort((a, b) => String(a.folder).localeCompare(String(b.folder)) || String(a.name).localeCompare(String(b.name))); }
function sampleOptions(cur) {
  const list = sortedLib().slice(0, 800).map(s => el('option', { value: s.id }, `${s.folder} / ${s.name}`));
  if (!lib.has(cur)) list.unshift(el('option', { value: cur || '' }, 'Missing sample'));
  return list;
}
function addChannelSelect() {
  return el('select', { 'aria-label': 'Add a channel', onchange: e => {
    const v = e.target.value; e.target.value = ''; if (!v) return;
    const k = v.slice(0, v.indexOf(':')), id = v.slice(v.indexOf(':') + 1);
    if (k === 'drum') addChannel({ name: DRUMS.find(d => d[0] === id)[1], kind: 'drum', drum: id });
    else if (k === 'synth') addChannel({ name: getPlugin(id).manifest.name, kind: 'synth', plugin: id });
    else if (k === 'sample') addSamplerChannel(id);
  } },
  el('option', { value: '' }, 'Add a sound…'),
  el('optgroup', { label: 'Drum synths' }, DRUMS.map(([id, n]) => el('option', { value: 'drum:' + id }, n))),
  el('optgroup', { label: 'Instruments' }, [...plugins.values()].filter(p => p.manifest.type === 'instrument').map(p => el('option', { value: 'synth:' + p.id }, p.manifest.name))),
  lib.size ? el('optgroup', { label: 'Library sounds' }, sortedLib().slice(0, 400).map(s => el('option', { value: 'sample:' + s.id }, `${s.folder} / ${s.name}`))) : null);
}
function paramDefsFor(ch) {
  if (ch.kind === 'drum') return DRUM_PARAMS;
  if (ch.kind === 'sampler') return SAMPLER_PARAMS;
  const pl = getPlugin(ch.plugin); return pl ? pl.manifest.params : [];
}
function renderRack(v) {
  const P = project, pat = curPattern();
  const sel = P.channels.find(c => c.id === ui.selCh) || P.channels[0];
  ui.selCh = sel ? sel.id : null;
  const head = el('div', { class: 'view-head' },
    el('input', { type: 'text', value: pat.name, 'aria-label': 'Pattern name', title: 'Rename this pattern. Pick another pattern at the top.', style: { width: '150px' }, onchange: e => mutate(() => { pat.name = e.target.value.trim().slice(0, 40) || pat.name; }) }),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Length'), lengthSelect(pat)),
    el('button', { class: 'btn sm', onclick: () => addPattern(false), title: 'New empty pattern' }, 'New'),
    el('button', { class: 'btn sm', onclick: () => addPattern(true), title: 'Copy this pattern' }, 'Clone'),
    P.patterns.length > 1 ? confirmBtn('Delete', deletePattern, { cls: 'btn sm ghost', confirm: 'Delete pattern?' }) : null,
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn sm primary', onclick: () => openIdeas(false), title: 'Write drums, chords, a bassline or a melody into this pattern, or ask Claude for one' }, 'Ideas'),
    el('button', { class: 'btn sm ghost', onclick: () => mutate(() => { for (const k in pat.steps) pat.steps[k].fill(0); pat.notes = {}; }) }, 'Clear pattern'));
  const body = el('div', { class: 'view-body', 'data-scroll': 'rackv' });
  const scroll = el('div', { class: 'rack-scroll', 'data-scroll': 'rack' });
  if (!P.channels.length) scroll.append(emptyState('No sounds yet', 'Add a drum, an instrument or a sound from your library below, or let Ideas start a beat for you.'));
  for (const ch of P.channels) scroll.append(rackRow(ch, pat));
  scroll.addEventListener('dragover', e => { if (hasType(e.dataTransfer, DT_SAMPLE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  scroll.addEventListener('drop', e => { const id = e.dataTransfer.getData(DT_SAMPLE); if (id) { e.preventDefault(); e.stopPropagation(); addSamplerChannel(id); } });
  body.append(scroll, el('div', { class: 'rack-add' }, addChannelSelect(), el('span', { class: 'hint' }, 'Click a step to toggle it · shift-click or right-click for accent and soft hits · drag a library sound onto the rack')));
  if (sel) body.append(instrumentPanel(sel));
  v.append(head, tipStrip('rack') || '', body);
}
function rackRow(ch, pat) {
  const row = el('div', { class: 'rk-row' + (ch.id === ui.selCh ? ' sel' : ''), style: `--c:${soundColor(ch.color)}` });
  const kb = { onStart: pushUndo, onEnd: () => changed({ render: false }) };
  row.append(el('div', { class: 'rk-ctrl' },
    el('button', { class: 'led' + (ch.mute ? '' : ' on'), 'aria-label': (ch.mute ? 'Unmute ' : 'Mute ') + ch.name, 'aria-pressed': String(!ch.mute), onclick: () => mutate(() => { ch.mute = !ch.mute; }) }),
    knob({ mini: true, cls: 'vol', value: ch.vol, min: 0, max: 1.2, def: 0.8, label: `${ch.name} volume`, fmt: x => fmtDb(x) + ' dB', color: soundColor(ch.color), ...kb, onInput: x => { ch.vol = x; if (engine) engine.sync(); } }),
    knob({ mini: true, cls: 'pan', bipolar: true, value: ch.pan, min: -1, max: 1, def: 0, label: `${ch.name} pan`, fmt: fmtPan, color: soundColor(ch.color), ...kb, onInput: x => { ch.pan = x; if (engine) engine.sync(); } }),
    el('button', { class: 'rk-name', title: chanLabel(ch), onclick: () => { ui.selCh = ch.id; renderView(); } }, ch.name)));
  const notes = pat.notes[ch.id];
  if (notes && notes.length) { row.append(miniRoll(ch, pat)); return row; }
  const arr = ensureSteps(pat, ch.id), steps = el('div', { class: 'rk-steps' });
  for (let i = 0; i < pat.length; i++) {
    const b = el('button', { class: 'st' + (Math.floor(i / 4) % 2 ? ' b2' : '') + (i && i % 16 === 0 ? ' gap' : '') + (arr[i] ? ' on' : ''), 'data-i': String(i), 'aria-label': `${ch.name} step ${i + 1}`, 'aria-pressed': String(!!arr[i]) });
    if (arr[i]) b.style.setProperty('--v', arr[i]);
    steps.append(b);
  }
  steps.addEventListener('pointerdown', e => {
    const b = e.target.closest('.st'); if (!b || e.button !== 0) return;
    const i = +b.dataset.i, val = e.shiftKey ? cycleVel(arr[i]) : (arr[i] ? 0 : 0.8);
    pushUndo(); stepEditing = true; setStep(arr, b, i, val);
    if (val && !T.playing) previewChannel(ch);
    paint = e.pointerType === 'mouse' && !e.shiftKey ? { arr, row: steps, val } : null;
  });
  steps.addEventListener('contextmenu', e => { const b = e.target.closest('.st'); if (!b) return; e.preventDefault(); const i = +b.dataset.i; pushUndo(); setStep(arr, b, i, cycleVel(arr[i])); changed({ render: false }); });
  steps.addEventListener('click', e => { if (e.detail !== 0) return; const b = e.target.closest('.st'); if (!b) return; const i = +b.dataset.i; pushUndo(); setStep(arr, b, i, arr[i] ? 0 : 0.8); changed({ render: false }); });
  row.append(steps);
  return row;
}
function miniRoll(ch, pat) {
  const L = pat.length, w = L * 25 - 3 + Math.floor((L - 1) / 16) * 5, h = 28, dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = el('canvas', { class: 'mini-roll', role: 'button', tabindex: '0', 'aria-label': `${ch.name} notes. Open in the piano roll`, title: 'Open in the piano roll' });
  c.style.width = w + 'px'; c.style.height = h + 'px'; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const notes = pat.notes[ch.id]; let lo = 127, hi = 0;
  for (const n of notes) { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); }
  const span = Math.max(12, hi - lo + 1); lo = Math.floor((lo + hi) / 2 - span / 2);
  const sx = w / L, rh = (h - 4) / span; g.fillStyle = soundColor(ch.color);
  for (const n of notes) { g.globalAlpha = 0.45 + 0.55 * (n.v ?? 0.8); g.fillRect(n.s * sx, h - 2 - (n.n - lo + 1) * rh, Math.max(2, n.l * sx - 1), Math.max(2, rh)); }
  const open = () => { ui.prCh = ch.id; ui.selCh = ch.id; setTab('piano'); };
  c.addEventListener('click', open); c.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return c;
}
function instrumentPanel(ch) {
  const kb = { onStart: pushUndo, onEnd: () => changed({ render: false }) };
  const box = el('section', { class: 'panel', style: `--c:${soundColor(ch.color)}`, 'aria-label': `${ch.name} settings` });
  box.append(el('div', { class: 'panel-head' },
    el('input', { type: 'text', value: ch.name, 'aria-label': 'Channel name', style: { width: '160px' }, onchange: e => mutate(() => { ch.name = e.target.value.trim().slice(0, 32) || ch.name; }) }),
    el('span', { class: 'kind-chip' }, chanLabel(ch)),
    el('div', { class: 'swatches' }, COLORS.map((c, ci) => el('button', { class: 'swatch', style: { background: soundColor(c, true) }, 'aria-label': `Color ${ci + 1}`, 'aria-pressed': String(c === ch.color), onclick: () => mutate(() => { ch.color = c; }) })))));
  let src;
  if (ch.kind === 'drum') src = el('select', { 'aria-label': 'Drum sound', value: ch.drum, onchange: e => mutate(() => { ch.drum = e.target.value; }) }, DRUMS.map(([id, n]) => el('option', { value: id }, n)));
  else if (ch.kind === 'synth') src = el('select', { 'aria-label': 'Instrument plugin', value: ch.plugin, onchange: e => mutate(() => { ch.plugin = e.target.value; ch.params = {}; }) }, instrumentOptions(ch.plugin));
  else src = el('select', { 'aria-label': 'Sample', value: ch.sampleId || '', onchange: e => { mutate(() => { ch.sampleId = e.target.value; }); getBuffer(ch.sampleId).catch(() => {}); } }, sampleOptions(ch.sampleId));
  box.append(el('div', { class: 'btn-row' }, el('span', { class: 'lbl' }, ch.kind === 'drum' ? 'Sound' : ch.kind === 'synth' ? 'Plugin' : 'Sample'), src, el('span', { class: 'lbl' }, 'Mixer channel'), insertSelect(ch)));
  const defs = paramDefsFor(ch), pl = ch.kind === 'synth' ? getPlugin(ch.plugin) : null;
  const vals = pl ? effectiveParams(pl.manifest, ch.params) : { ...Object.fromEntries(defs.map(d => [d.id, d.default])), ...ch.params };
  box.append(defs.length ? el('div', { class: 'knobs' }, defs.map(d => paramControl(d, vals[d.id], { ...kb, color: soundColor(ch.color), onInput: x => { ch.params[d.id] = x; } })))
    : el('p', { class: 'hint' }, 'Nothing to adjust on this one.'));
  box.append(duckRow(ch));
  box.append(el('div', { class: 'btn-row' },
    el('button', { class: 'btn', onclick: () => { ui.prCh = ch.id; setTab('piano'); } }, 'Edit notes'),
    el('button', { class: 'btn', onclick: () => previewChannel(ch, 0.6) }, 'Preview'),
    el('button', { class: 'btn', onclick: () => duplicateChannel(ch) }, 'Duplicate'),
    confirmBtn('Delete channel', () => deleteChannel(ch.id), { confirm: 'Confirm delete' })),
    el('p', { class: 'hint', style: { margin: 0 } }, 'Play the selected channel from your keyboard: A W S E D F T G Y H U J K. Z and X shift the octave.'));
  return box;
}

/* ----- piano roll ----- */
let prState = null, prDrag = null, prTouch = null;
const PR_LENS = [[1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, '1 bar']];
function renderPiano(v) {
  const P = project, pat = curPattern();
  const ch = P.channels.find(c => c.id === ui.prCh) || P.channels.find(c => c.id === ui.selCh) || P.channels[0];
  if (!ch) { v.append(emptyState('Nothing to play yet', 'Add a sound in Beat, then come back here to write notes.')); return; }
  ui.prCh = ch.id;
  const keyOn = project.scale !== 'chromatic';
  v.append(el('div', { class: 'view-head' },
    el('select', { 'aria-label': 'Channel', value: ch.id, onchange: e => { ui.prCh = e.target.value; ui.prSel = null; renderView(); } }, P.channels.map(c => el('option', { value: c.id }, c.name))),
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Tool' }, ['draw', 'erase'].map(t => el('button', { 'aria-pressed': String(ui.prTool === t), onclick: () => { ui.prTool = t; renderView(); } }, t === 'draw' ? 'Draw' : 'Erase'))),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Note'), el('select', { 'aria-label': 'Length of new notes and chords', value: String(ui.prLen), onchange: e => { ui.prLen = +e.target.value; } }, PR_LENS.map(([n, l]) => el('option', { value: String(n) }, l)))),
    el('button', { class: 'btn sm', 'aria-pressed': String(ui.prSnapKey && keyOn), disabled: !keyOn, title: 'New and moved notes stay in the song’s key', onclick: () => { ui.prSnapKey = !ui.prSnapKey; renderView(); } }, 'Stay in key'),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Length'), lengthSelect(pat)),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn sm', onclick: () => openIdeas(false) }, 'Ideas'),
    el('button', { class: 'btn sm ghost', onclick: () => mutate(() => { delete pat.notes[ch.id]; ui.prSel = null; }) }, 'Clear notes')),
    tipStrip('piano') || '', chordBar(ch, pat));
  const wrap = el('div', { class: 'pr-wrap', 'data-scroll': 'piano', tabindex: '0', 'aria-label': `Piano roll for ${ch.name}` });
  const spacer = el('div', { class: 'pr-spacer' }), canvas = el('canvas');
  spacer.style.width = (PR.keysW + pat.length * PR.cellW) + 'px';
  spacer.style.height = (PR.rulerH + (PR.hi - PR.lo + 1) * PR.rowH) + 'px';
  wrap.append(spacer, canvas); v.append(wrap);
  prState = { wrap, canvas, pat, ch, ro: new ResizeObserver(() => drawPiano()) };
  prState.ro.observe(wrap);
  let raf = 0;
  wrap.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawPiano(); }); });
  requestAnimationFrame(() => {
    if (wrap.scrollTop === 0) { const ns = pat.notes[ch.id] || []; const c = ns.length ? ns.reduce((a, n) => a + n.n, 0) / ns.length : 62; wrap.scrollTop = Math.max(0, (PR.hi - c) * PR.rowH - wrap.clientHeight / 2); }
    drawPiano();
  });
  const hit = e => {
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    return { keys: px < PR.keysW, ruler: py < PR.rulerH, sf: (px - PR.keysW + wrap.scrollLeft) / PR.cellW, note: PR.hi - Math.floor((py - PR.rulerH + wrap.scrollTop) / PR.rowH) };
  };
  const arrOf = () => pat.notes[ch.id] || (pat.notes[ch.id] = []);
  const find = (sf, n) => { const a = pat.notes[ch.id] || []; for (let i = a.length - 1; i >= 0; i--) { const x = a[i]; if (x.n === n && sf >= x.s && sf < x.s + x.l) return x; } return null; };
  const removeNote = x => { const a = arrOf(), i = a.indexOf(x); if (i >= 0) a.splice(i, 1); if (ui.prSel === x) ui.prSel = null; };
  const addAt = H => { const s = Math.floor(H.sf), n = { s, n: keySnap(H.note), l: Math.max(1, Math.min(ui.prLen, pat.length - s)), v: 0.8 }; arrOf().push(n); ui.prSel = n; ui.prCursor = Math.min(pat.length - 1, s + n.l); return n; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    const H = hit(e);
    if (H.ruler) { if (!H.keys) { ui.prCursor = clamp(Math.round(H.sf), 0, pat.length - 1); drawPiano(); } return; }
    if (H.keys) { if (H.note >= PR.lo && H.note <= PR.hi) previewNote(ch, H.note); return; }
    if (H.note < PR.lo || H.note > PR.hi || H.sf < 0 || H.sf >= pat.length) return;
    const x = find(H.sf, H.note);
    if (e.pointerType === 'touch') { prTouch = { x0: e.clientX, y0: e.clientY, H, x }; return; }
    e.preventDefault(); wrap.focus({ preventScroll: true });
    if (e.button === 2 || ui.prTool === 'erase') {
      pushUndo(); if (x) removeNote(x);
      prDrag = { erase: true }; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      drawPiano(); return;
    }
    if (e.button !== 0) return;
    pushUndo();
    let target = x, mode = 'move';
    if (x) { if ((x.s + x.l - H.sf) * PR.cellW < 7 && x.l * PR.cellW > 10) mode = 'resize'; ui.prSel = x; }
    else target = addAt(H);
    previewNote(ch, target.n);
    prDrag = { mode, target, s0: target.s, n0: target.n, l0: target.l, sf0: H.sf, note0: H.note };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    drawPiano();
  });
  canvas.addEventListener('pointermove', e => {
    if (!prDrag) {
      if (e.pointerType === 'mouse') { const H = hit(e), x = !H.keys && !H.ruler && find(H.sf, H.note); canvas.style.cursor = H.keys ? 'pointer' : x ? ((x.s + x.l - H.sf) * PR.cellW < 7 ? 'ew-resize' : 'grab') : 'crosshair'; }
      return;
    }
    const H = hit(e);
    if (prDrag.erase) { const x = find(H.sf, H.note); if (x) { removeNote(x); drawPiano(); } return; }
    const t = prDrag.target;
    if (prDrag.mode === 'move') {
      const ns = clamp(prDrag.s0 + Math.floor(H.sf) - Math.floor(prDrag.sf0), 0, pat.length - t.l); let nn = clamp(prDrag.n0 + H.note - prDrag.note0, PR.lo, PR.hi);
      if (nn !== t.n) nn = keySnap(nn, Math.sign(nn - t.n));
      if (ns !== t.s || nn !== t.n) { if (nn !== t.n) previewNote(ch, nn, 0.15); t.s = ns; t.n = nn; drawPiano(); }
    } else {
      const nl = clamp(prDrag.l0 + Math.round(H.sf) - Math.round(prDrag.sf0), 1, pat.length - t.s);
      if (nl !== t.l) { t.l = nl; ui.prLen = nl; drawPiano(); }
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (prTouch && e.pointerType === 'touch') {
      const t = prTouch; prTouch = null;
      if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) < 10) {
        pushUndo();
        if (t.x) removeNote(t.x); else if (ui.prTool === 'draw') previewNote(ch, addAt(t.H).n);
        changed({ render: false }); drawPiano();
      }
      return;
    }
    if (prDrag) { if (prDrag.target) ui.prCursor = Math.min(pat.length - 1, prDrag.target.s + prDrag.target.l); prDrag = null; changed({ render: false }); drawPiano(); }
  });
  canvas.addEventListener('pointercancel', () => { prTouch = null; if (prDrag) { prDrag = null; changed({ render: false }); } });
}
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, Math.max(1, w), h, r); else g.rect(x, y, Math.max(1, w), h); }
function drawPiano() {
  const S = prState; if (!S || ui.tab !== 'piano') return;
  const { wrap, canvas, pat, ch } = S, w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
  const sx = wrap.scrollLeft, sy = wrap.scrollTop;
  canvas.style.transform = `translate(${sx}px, ${sy}px)`;
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { keysW, rulerH, rowH, cellW, lo, hi } = PR, C = COLOR;
  g.fillStyle = C.well; g.fillRect(0, 0, w, h);
  g.save(); g.beginPath(); g.rect(keysW, rulerH, w - keysW, h - rulerH); g.clip();
  const r0 = Math.max(0, Math.floor(sy / rowH)), r1 = Math.min(hi - lo, Math.ceil((sy + h) / rowH));
  const P = project, keyOn = P.scale !== 'chromatic';
  for (let r = r0; r <= r1; r++) {
    const n = hi - r, y = rulerH + r * rowH - sy, ik = keyOn ? inKey(P, n) : !isBlack(n);
    g.fillStyle = ik ? '#17181c' : '#0e0f12'; g.fillRect(keysW, y, w, rowH);
    if (keyOn && pcOf(P, n) === 0) { g.fillStyle = `rgba(${C.accentRgb},.07)`; g.fillRect(keysW, y, w, rowH); }
    g.fillStyle = n % 12 === 0 ? '#2d2e35' : '#1b1c21'; g.fillRect(keysW, y + rowH - 1, w, 1);
  }
  const s0 = Math.max(0, Math.floor(sx / cellW)), s1 = Math.min(pat.length, Math.ceil((sx + w) / cellW));
  for (let s = s0; s <= s1; s++) { g.fillStyle = s % 16 === 0 ? '#3d3e46' : s % 4 === 0 ? '#28292f' : '#1c1d22'; g.fillRect(keysW + s * cellW - sx, rulerH, 1, h); }
  const endX = keysW + pat.length * cellW - sx; if (endX < w) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(endX, rulerH, w - endX, h); }
  const vis = (x, y, nw) => !(x > w || x + nw < keysW || y > h || y + rowH < rulerH);
  g.globalAlpha = 0.2;
  for (const o of project.channels) {
    if (o.id === ch.id || !pat.notes[o.id]) continue; g.fillStyle = soundColor(o.color);
    for (const n of pat.notes[o.id]) { const x = keysW + n.s * cellW - sx, y = rulerH + (hi - n.n) * rowH - sy; if (vis(x, y, n.l * cellW)) g.fillRect(x + 1, y + 1, n.l * cellW - 2, rowH - 2); }
  }
  g.globalAlpha = 1; g.font = `600 9px ${C['font-mono'] || 'monospace'}`; g.textBaseline = 'alphabetic';
  const noteCol = soundColor(ch.color);
  for (const n of pat.notes[ch.id] || []) {
    const x = keysW + n.s * cellW - sx, y = rulerH + (hi - n.n) * rowH - sy, nw = n.l * cellW - 1;
    if (!vis(x, y, nw)) continue;
    g.globalAlpha = 0.5 + 0.5 * (n.v ?? 0.8); g.fillStyle = noteCol; rrect(g, x + 0.5, y + 1, nw - 0.5, rowH - 2, 3); g.fill();
    g.fillStyle = 'rgba(255,255,255,.32)'; g.fillRect(x + 2, y + 1.5, Math.max(1, nw - 3.5), 1.5); g.globalAlpha = 1;
    if (n === ui.prSel) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; rrect(g, x + 0.5, y + 1, nw - 0.5, rowH - 2, 3); g.stroke(); }
    if (nw > 34) { g.fillStyle = 'rgba(10,10,14,.78)'; g.fillText(noteName(n.n), x + 4, y + rowH - 4); }
    g.fillStyle = 'rgba(10,10,14,.35)'; g.fillRect(x + nw - 4, y + 3, 2, rowH - 6);
    if (keyOn && !inKey(P, n.n)) { g.fillStyle = C.danger; g.fillRect(x + 1.5, y + 2, 2.5, rowH - 4); }
  }
  { const cx = keysW + clamp(ui.prCursor || 0, 0, pat.length) * cellW - sx; g.fillStyle = C.text; g.globalAlpha = 0.55; g.fillRect(cx, rulerH, 1.5, h); g.globalAlpha = 1; }
  const ps = patPlayStep(pat);
  if (ps >= 0) { const x = keysW + ps * cellW - sx; g.fillStyle = C.accent; g.globalAlpha = 0.16; g.fillRect(x, rulerH, cellW, h); g.globalAlpha = 1; g.fillRect(x, rulerH, 2, h); }
  g.restore();
  g.fillStyle = C['panel-2']; g.fillRect(keysW, 0, w - keysW, rulerH); g.fillStyle = C.line; g.fillRect(keysW, rulerH - 1, w - keysW, 1);
  g.save(); g.beginPath(); g.rect(keysW, 0, w - keysW, rulerH); g.clip();
  g.font = `500 10.5px ${C['font-mono'] || 'monospace'}`; g.textBaseline = 'middle';
  for (let s = s0 - (s0 % 4); s <= s1; s += 4) {
    const x = keysW + s * cellW - sx;
    if (s % 16 === 0) { g.fillStyle = C.muted; g.fillText(String(s / 16 + 1), x + 5, rulerH / 2); g.fillStyle = '#3d3e46'; g.fillRect(x, 4, 1, rulerH - 4); }
    else { g.fillStyle = '#2b2c32'; g.fillRect(x, rulerH - 7, 1, 6); }
  }
  g.restore();
  g.save(); g.beginPath(); g.rect(0, rulerH, keysW, h - rulerH); g.clip();
  g.font = `600 9px ${C['font-mono'] || 'monospace'}`; g.textBaseline = 'middle';
  for (let r = r0; r <= r1; r++) {
    const n = hi - r, y = rulerH + r * rowH - sy, blk = isBlack(n);
    g.fillStyle = C['key-white']; g.fillRect(0, y, keysW, rowH);
    if (blk) { g.fillStyle = C['key-black']; g.fillRect(0, y + 1, keysW * 0.6, rowH - 2); }
    else if (n % 12 === 0 || n % 12 === 5) { g.fillStyle = '#a7a196'; g.fillRect(0, y + rowH - 1, keysW, 1); }
    if (keyOn && pcOf(P, n) === 0) { g.fillStyle = C['accent-lo']; g.fillText(noteName(n), keysW - 24, y + rowH / 2); }
    else if (n % 12 === 0) { g.fillStyle = '#3a372f'; g.fillText(noteName(n), keysW - 24, y + rowH / 2); }
  }
  g.fillStyle = '#060708'; g.fillRect(keysW - 1, rulerH, 1, h);
  g.restore();
  g.fillStyle = C['panel-2']; g.fillRect(0, 0, keysW, rulerH);
  { const cx = keysW + clamp(ui.prCursor || 0, 0, pat.length) * cellW - sx; if (cx >= keysW) { g.fillStyle = C.text; g.beginPath(); g.moveTo(cx - 5, rulerH - 8); g.lineTo(cx + 5, rulerH - 8); g.lineTo(cx, rulerH - 1); g.fill(); } }
}
function handlePianoKey(e) {
  const n = ui.prSel, pat = curPattern(), ch = project.channels.find(c => c.id === ui.prCh); if (!ch || !n) return false;
  const arr = pat.notes[ch.id] || []; if (!arr.includes(n)) { ui.prSel = null; return false; }
  const ops = {
    Delete: () => { arr.splice(arr.indexOf(n), 1); ui.prSel = null; }, Backspace: () => { arr.splice(arr.indexOf(n), 1); ui.prSel = null; },
    ArrowUp: () => { n.n = clamp(n.n + (e.shiftKey ? 12 : 1), PR.lo, PR.hi); previewNote(ch, n.n, 0.15); },
    ArrowDown: () => { n.n = clamp(n.n - (e.shiftKey ? 12 : 1), PR.lo, PR.hi); previewNote(ch, n.n, 0.15); },
    ArrowLeft: () => { if (e.shiftKey) n.l = Math.max(1, n.l - 1); else n.s = Math.max(0, n.s - 1); },
    ArrowRight: () => { if (e.shiftKey) n.l = Math.min(pat.length - n.s, n.l + 1); else n.s = Math.min(pat.length - n.l, n.s + 1); },
  };
  if (!ops[e.key]) return false;
  e.preventDefault(); pushUndo(); ops[e.key](); changed({ render: false }); drawPiano();
  return true;
}

/* ----- playlist ----- */
let plDrag = null, plTap = null;
function renderPlaylist(v) {
  const P = project, barW = ui.plBarW, stepW = barW / 16;
  const songBars = songLength(P) / 16, bars = Math.max(32, songBars + 8);
  ui.plBrush = P.currentPattern; // one pattern picker for the whole app: the one at the top (Beat edits it, Song places it)
  const brush = patById(ui.plBrush);
  v.append(el('div', { class: 'view-head' },
    el('span', { class: 'muted small paint-note', title: 'Pick a different pattern at the top' }, 'Places ', el('b', {}, brush ? brush.name : 'a pattern')),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Snap'), el('select', { 'aria-label': 'Snap', value: String(ui.plSnap), onchange: e => { ui.plSnap = +e.target.value; } }, [[16, 'Bar'], [4, 'Beat'], [1, 'Step']].map(([n, l]) => el('option', { value: String(n) }, l)))),
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Zoom' },
      el('button', { 'aria-label': 'Zoom out', onclick: () => { ui.plBarW = Math.max(24, ui.plBarW - 16); renderView(); } }, '−'),
      el('button', { 'aria-label': 'Zoom in', onclick: () => { ui.plBarW = Math.min(200, ui.plBarW + 16); renderView(); } }, '+')),
    el('button', { class: 'btn sm', onclick: () => mutate(P2 => { P2.playlist.tracks.push(newTrack(P2.playlist.tracks.length)); }) }, 'Add track'),
    el('button', { class: 'btn sm', onclick: addSection, title: 'Add a named section where the orange marker is' }, 'Add section'),
    el('button', { class: 'btn sm primary', onclick: autoArrangeCurrent, title: 'Lay your patterns out as a full song' }, 'Arrange for me'),
    el('button', { class: 'btn sm', onclick: openAutoPicker, title: 'Fades, filter sweeps and volume moves over time' }, 'Automate'),
    el('span', { class: 'spacer' }),
    el('span', { class: 'muted small' }, `${songBars} bars · ${fmtDur(songLength(P) * 15 / P.bpm)}`),
    el('span', { class: 'hint' }, 'Tap an empty lane to place the pattern · drag to move · drag the right edge to resize · right-click deletes · the round button on a track picks it for recording')), tipStrip('playlist') || '');
  const wrap = el('div', { class: 'pl-wrap', 'data-scroll': 'playlist' });
  const laneW = bars * barW;
  const grid = el('div', { class: 'pl-grid', style: `--hw:${PL.headW}px;--bw:${barW}px;width:${PL.headW + laneW}px` });
  const barsEl = el('div', { class: 'pl-bars', style: { width: laneW + 'px' }, title: 'Click to set where Song mode starts' });
  for (let b = 0; b < bars; b++) barsEl.append(el('span', { class: 'pl-bar', style: { left: b * barW + 'px' } }, String(b + 1)));
  barsEl.append(el('span', { class: 'pl-pos', style: { left: T.songPos * stepW + 'px' } }));
  for (const mk of P.playlist.markers || []) barsEl.append(el('span', { class: 'pl-mark' + (ui.plMark === mk.id ? ' sel' : ''), style: { left: mk.start * stepW + 'px' }, title: 'Section: click to rename or play from here', onclick: e => { e.stopPropagation(); ui.plMark = mk.id; ui.plSel = null; renderView(); } }, mk.name));
  barsEl.addEventListener('click', e => {
    const r = barsEl.getBoundingClientRect();
    T.marker = T.songPos = Math.max(0, Math.floor((e.clientX - r.left) / stepW / ui.plSnap) * ui.plSnap); ui.autoFrom = null;
    if (!T.playing) $('#timeDisp').textContent = fmtPos(-1);
    renderView();
  });
  grid.append(el('div', { class: 'pl-ruler' }, el('div', { class: 'pl-corner' }, el('span', { class: 'lbl' }, 'Tracks')), barsEl));
  P.playlist.tracks.forEach((tr, ti) => {
    const lane = el('div', { class: 'pl-lane', 'data-track': String(ti), style: { width: laneW + 'px' } });
    for (const c of P.playlist.clips) if (c.track === ti) lane.append(clipEl(c, stepW));
    grid.append(el('div', { class: 'pl-row' + (tr.mute ? ' tmute' : '') + (REC.armed === ti ? ' armed' : '') },
      el('div', { class: 'pl-thead' },
        el('button', { class: 'led' + (tr.mute ? '' : ' on'), 'aria-label': (tr.mute ? 'Unmute ' : 'Mute ') + tr.name, onclick: () => mutate(() => { tr.mute = !tr.mute; }) }),
        el('button', { class: 'arm' + (REC.armed === ti ? ' on' : ''), 'aria-pressed': String(REC.armed === ti), 'aria-label': (REC.armed === ti ? 'Disarm ' : 'Arm for recording: ') + tr.name, title: REC.armed === ti ? 'Armed for recording. Tap to disarm.' : 'Arm this track to record onto it', onclick: () => armTrack(REC.armed === ti ? null : ti) }),
        el('input', { type: 'text', value: tr.name, 'aria-label': 'Track name', onchange: e => mutate(() => { tr.name = e.target.value.slice(0, 24) || tr.name; }, { render: false }) }),
        el('select', { 'aria-label': `Mixer insert for audio on ${tr.name}`, title: 'Mixer insert for audio clips on this track', value: String(tr.insert || 0), onchange: e => mutate(() => { tr.insert = +e.target.value; }, { render: false }) },
          P.mixer.map((m, i) => el('option', { value: String(i) }, i === 0 ? 'M' : String(i))))),
      lane));
  });
  automationRows(grid, laneW, stepW);
  grid.append(el('div', { class: 'playhead', id: 'plHead', hidden: true }));
  wrap.append(grid); v.append(wrap);
  const sel = P.playlist.clips.find(c => c.id === ui.plSel), mk = (P.playlist.markers || []).find(m => m.id === ui.plMark), au = autos(P).find(l => l.id === ui.autoSel);
  if (sel) v.append(clipInspector(sel)); else if (mk) v.append(markerInspector(mk)); else if (au) v.append(autoInspector(au));
  if (REC.armed != null) v.append(armBar());
  const snapAt = (lane, x) => Math.max(0, Math.floor((x - lane.getBoundingClientRect().left) / stepW / ui.plSnap) * ui.plSnap);
  grid.addEventListener('contextmenu', e => { if (e.target.closest('.pl-lane')) e.preventDefault(); });
  grid.addEventListener('pointerdown', e => {
    const lane = e.target.closest('.pl-lane'); if (!lane) return;
    const node = e.target.closest('.clip');
    if (node) {
      const clip = P.playlist.clips.find(c => c.id === node.dataset.id); if (!clip) return;
      if (e.button === 2) { e.preventDefault(); mutate(P2 => { P2.playlist.clips = P2.playlist.clips.filter(c => c !== clip); if (ui.plSel === clip.id) ui.plSel = null; }); return; }
      if (e.button !== 0) return;
      if (e.pointerType === 'touch') { plTap = { x: e.clientX, y: e.clientY, clip }; return; }
      e.preventDefault();
      pushUndo();
      plDrag = { clip, node, resize: !!e.target.closest('.clip-grip'), x0: e.clientX, y0: e.clientY, start0: clip.start, len0: clip.len, track0: clip.track, moved: false };
      try { grid.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      $$('.clip.sel', grid).forEach(n => n.classList.remove('sel')); node.classList.add('sel');
      return;
    }
    if (e.button === 0) plTap = { x: e.clientX, y: e.clientY, lane };
  });
  grid.addEventListener('pointermove', e => {
    const d = plDrag; if (!d) return;
    const ds = Math.round((e.clientX - d.x0) / stepW / ui.plSnap) * ui.plSnap;
    if (d.resize) {
      const nl = Math.max(Math.min(ui.plSnap, d.len0), d.len0 + ds);
      if (nl !== d.clip.len) { d.clip.len = nl; d.node.style.width = Math.max(6, nl * stepW - 1) + 'px'; d.moved = true; }
    } else {
      const ns = Math.max(0, d.start0 + ds), nt = clamp(d.track0 + Math.round((e.clientY - d.y0) / PL.rowH), 0, P.playlist.tracks.length - 1);
      if (ns !== d.clip.start) { d.clip.start = ns; d.node.style.left = ns * stepW + 'px'; d.moved = true; }
      if (nt !== d.clip.track) { d.clip.track = nt; const l2 = grid.querySelector(`.pl-lane[data-track="${nt}"]`); if (l2) l2.append(d.node); d.moved = true; }
    }
  });
  grid.addEventListener('pointerup', e => {
    if (plDrag) { const d = plDrag; plDrag = null; ui.plSel = d.clip.id; ui.plMark = null; if (d.moved) changed(); else { hist.undo.pop(); updateUndo(); renderView(); } return; }
    const t = plTap; plTap = null;
    if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return;
    if (t.clip) { ui.plSel = t.clip.id; ui.plMark = null; renderView(); return; }
    const pat = patById(ui.plBrush); if (!pat) return;
    const start = snapAt(t.lane, e.clientX), track = +t.lane.dataset.track;
    mutate(P2 => { const c = { id: uid(), kind: 'pattern', ref: pat.id, track, start, len: pat.length, gain: 1, offset: 0 }; P2.playlist.clips.push(c); ui.plSel = c.id; });
  });
  grid.addEventListener('pointercancel', () => { plTap = null; if (plDrag) { const d = plDrag; plDrag = null; if (d.moved) changed(); else { hist.undo.pop(); updateUndo(); } } });
  grid.addEventListener('dragover', e => { if (e.target.closest('.pl-lane') && (hasType(e.dataTransfer, DT_SAMPLE) || hasType(e.dataTransfer, 'Files'))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  grid.addEventListener('drop', async e => {
    const lane = e.target.closest('.pl-lane'); if (!lane) return;
    e.preventDefault(); e.stopPropagation(); hideDrop();
    const start = snapAt(lane, e.clientX), track = +lane.dataset.track, id = e.dataTransfer.getData(DT_SAMPLE);
    if (id) { addAudioClip(id, track, start); return; }
    if (e.dataTransfer.files && e.dataTransfer.files.length) { const res = await importFiles([...e.dataTransfer.files]); if (res.audio[0]) addAudioClip(res.audio[0].id, track, start); }
  });
  updatePlayhead();
}
function clipEl(c, stepW) {
  const isPat = c.kind === 'pattern', pat = isPat ? patById(c.ref) : null, s = isPat ? null : lib.get(c.ref);
  const name = isPat ? (pat ? pat.name : 'Missing pattern') : (s ? s.name : 'Missing audio') + (c.takes ? ` · ${c.takes.indexOf(c.ref) + 1}/${c.takes.length}` : '');
  const w = Math.max(6, c.len * stepW - 1);
  const kc = isPat ? soundColor(pat ? pat.color : COLORS[0]) : soundColor(COLORS[4]);
  const node = el('div', { class: 'clip' + (c.id === ui.plSel ? ' sel' : ''), 'data-id': c.id, title: name, style: `left:${c.start * stepW}px;width:${w}px;--c:${kc}` });
  const cw = Math.min(w, 6000), chh = 22, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = el('canvas'); cv.style.width = cw + 'px'; cv.style.height = chh + 'px'; cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = kc; g.globalAlpha = 0.85;
  const steps = Math.min(c.len, Math.floor(cw / stepW) + 1);
  if (isPat && pat) {
    const ids = Object.keys(pat.steps).filter(k => pat.steps[k].some(Boolean)), all = [];
    for (const k in pat.notes) for (const n of pat.notes[k]) all.push(n);
    let lo = 127, hi = 0; for (const n of all) { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); }
    const span = Math.max(1, hi - lo + 1), split = ids.length && all.length;
    const sh = split ? chh * 0.45 : chh - 2, nh = split ? chh * 0.5 : chh - 2, ny = split ? chh * 0.48 : 1, rh = sh / Math.max(1, ids.length);
    for (let off = 0; off < steps; off += pat.length) {
      ids.forEach((k, ri) => pat.steps[k].forEach((val, i) => { if (val && off + i < steps) g.fillRect((off + i) * stepW, 1 + ri * rh, Math.max(1, stepW * 0.6), Math.max(1, rh - 0.5)); }));
      for (const n of all) if (off + n.s < steps) g.fillRect((off + n.s) * stepW, ny + (hi - n.n) / span * (nh - 2), Math.max(1, Math.min(n.l, steps - off - n.s) * stepW - 1), 2);
    }
  } else if (s && s.peaks) {
    const sd = 60 / project.bpm / 4, N = s.peaks.length;
    for (let x = 0; x < cw; x += 2) {
      const t = (c.offset || 0) + x / stepW * sd; if (t > s.duration) break;
      const p = s.peaks[Math.min(N - 1, Math.floor(t / s.duration * N))] || 0, ph = Math.max(1, p * (chh - 2));
      g.fillRect(x, (chh - ph) / 2, 1.3, ph);
    }
  }
  node.append(el('span', { class: 'clip-name' }, name), cv, el('span', { class: 'clip-grip', 'aria-hidden': 'true' }));
  return node;
}
function clipInspector(c) {
  const isPat = c.kind === 'pattern', step = ui.plSnap;
  const name = isPat ? ((patById(c.ref) || {}).name || 'Missing pattern') : ((lib.get(c.ref) || {}).name || 'Missing audio');
  const lenTxt = c.len % 16 === 0 ? `${c.len / 16} bar${c.len === 16 ? '' : 's'}` : `${c.len} steps`;
  const mv = fn => mutate(() => fn(c));
  return el('div', { class: 'pl-insp' },
    el('strong', {}, name),
    el('span', { class: 'pos' }, `Bar ${fmtPos(c.start)} · ${lenTxt} · ${project.playlist.tracks[c.track].name}`),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm icon', 'aria-label': 'Move earlier', onclick: () => mv(x => { x.start = Math.max(0, x.start - step); }) }, icon('left')),
      el('button', { class: 'btn sm icon', 'aria-label': 'Move later', onclick: () => mv(x => { x.start += step; }) }, icon('right')),
      el('button', { class: 'btn sm icon', 'aria-label': 'Move up a track', onclick: () => mv(x => { x.track = Math.max(0, x.track - 1); }) }, icon('up')),
      el('button', { class: 'btn sm icon', 'aria-label': 'Move down a track', onclick: () => mv(x => { x.track = Math.min(project.playlist.tracks.length - 1, x.track + 1); }) }, icon('down')),
      el('button', { class: 'btn sm', onclick: () => mv(x => { x.len = Math.max(1, x.len - step); }) }, 'Shorter'),
      el('button', { class: 'btn sm', onclick: () => mv(x => { x.len += step; }) }, 'Longer'),
      el('button', { class: 'btn sm', onclick: () => mutate(P => { const d = { ...c, id: uid(), start: c.start + c.len }; P.playlist.clips.push(d); ui.plSel = d.id; }) }, 'Repeat'),
      isPat ? el('button', { class: 'btn sm', onclick: () => { project.currentPattern = c.ref; scheduleSave(); renderTransport(); setTab('rack'); } }, 'Edit pattern') : null,
      !isPat && c.takes ? takesControl(c) : null,
      !isPat ? el('span', { class: 'field' }, el('span', { class: 'lbl' }, 'Gain'), knob({ mini: true, value: c.gain ?? 1, min: 0, max: 2, def: 1, label: 'Clip gain', fmt: x => fmtDb(x) + ' dB', onStart: pushUndo, onInput: x => { c.gain = x; }, onEnd: () => changed({ render: false }) })) : null,
      el('button', { class: 'btn sm danger', onclick: () => mutate(P => { P.playlist.clips = P.playlist.clips.filter(x => x.id !== c.id); ui.plSel = null; }) }, 'Delete'),
      el('button', { class: 'btn sm icon ghost', 'aria-label': 'Close clip details', onclick: () => { ui.plSel = null; renderView(); } }, icon('x'))));
}
function updatePlayhead() {
  const ph = $('#plHead'); if (!ph) return;
  const step = T.playing && T.mode === 'song' ? T.shown : -1;
  if (step < 0) { ph.hidden = true; return; }
  ph.hidden = false;
  const x = PL.headW + step * ui.plBarW / 16; ph.style.left = x + 'px';
  const wrap = ph.closest('.pl-wrap');
  if (wrap && !plDrag && (x > wrap.scrollLeft + wrap.clientWidth - 40 || x < wrap.scrollLeft + PL.headW)) wrap.scrollLeft = Math.max(0, x - PL.headW - 40);
}

/* ----- mixer ----- */
function renderMixer(v) {
  const P = project; ui.selInsert = clamp(ui.selInsert, 0, P.mixer.length - 1);
  const strips = el('div', { class: 'mx-strips', 'data-scroll': 'mixer' });
  P.mixer.forEach((m, i) => strips.append(mixerStrip(m, i)));
  v.append(el('div', { class: 'view-head' },
    el('button', { class: 'btn sm primary', onclick: runMixCheck, disabled: !!(ui.mixReport && ui.mixReport.busy) }, 'Check my mix'),
    el('button', { class: 'btn sm', disabled: P.mixer.length >= 64, onclick: () => mutate(P2 => { P2.mixer.push({ id: uid(), name: `Insert ${P2.mixer.length}`, vol: 0.8, pan: 0, mute: false, solo: false, fx: [] }); ui.selInsert = P2.mixer.length - 1; }) }, 'Add insert'),
    el('span', { class: 'hint' }, 'Each sound gets its own channel automatically. Every channel feeds the Master.')),
    tipStrip('mixer') || '',
    el('div', { class: 'view-body', 'data-scroll': 'mixv' }, masterCard(), mixReportNode() || '', strips, insertDetail(ui.selInsert)));
}
function mixerStrip(m, i) {
  const db = el('div', { class: 'strip-db' }, fmtDb(m.vol)), fill = el('i'); meterEls[i] = fill;
  let armed = false;
  const fader = el('input', { type: 'range', class: 'fader', min: '0', max: '1.25', step: '0.01', value: String(m.vol), 'aria-label': `${m.name} volume`,
    onpointerdown: () => { if (!armed) { pushUndo(); armed = true; } }, onkeydown: () => { if (!armed) { pushUndo(); armed = true; } },
    oninput: e => { m.vol = +e.target.value; db.textContent = fmtDb(m.vol); if (engine) engine.sync(); },
    onchange: () => { armed = false; changed({ render: false }); }, onclick: e => e.stopPropagation() });
  const ms = el('div', { class: 'ms' }, el('button', { class: 'm', 'aria-pressed': String(!!m.mute), 'aria-label': 'Mute ' + m.name, onclick: e => { e.stopPropagation(); mutate(() => { m.mute = !m.mute; }); } }, 'M'));
  if (i > 0) ms.append(el('button', { class: 's', 'aria-pressed': String(!!m.solo), 'aria-label': 'Solo ' + m.name, onclick: e => { e.stopPropagation(); mutate(() => { m.solo = !m.solo; }); } }, 'S'));
  const src = project.channels.find(c => (c.insert | 0) === i);
  return el('div', { class: 'strip' + (i === 0 ? ' master' : '') + (i === ui.selInsert ? ' sel' : ''), style: src && i > 0 ? `--sc:${soundColor(src.color)}` : null, onclick: () => { if (ui.selInsert !== i) { ui.selInsert = i; renderView(); } } },
    el('div', { class: 'strip-num' }, i === 0 ? 'MASTER' : String(i)),
    el('div', { class: 'strip-name', title: m.name }, m.name),
    el('div', { class: 'strip-mid' }, el('div', { class: 'meter' }, fill), fader), db,
    knob({ mini: true, bipolar: true, value: m.pan, min: -1, max: 1, def: 0, label: `${m.name} pan`, fmt: fmtPan, onStart: pushUndo, onInput: x => { m.pan = x; if (engine) engine.sync(); }, onEnd: () => changed({ render: false }) }),
    ms, el('div', { class: 'fx-dots', title: `${m.fx.length} effect${m.fx.length === 1 ? '' : 's'}` }, m.fx.map(f => el('i', { class: f.bypass ? 'off' : '' }))));
}
function insertDetail(i) {
  const P = project, m = P.mixer[i];
  const feeds = P.channels.filter(c => (c.insert | 0) === i).map(c => c.name)
    .concat(P.playlist.tracks.filter((t, ti) => (t.insert | 0) === i && P.playlist.clips.some(c => c.kind === 'audio' && c.track === ti)).map(t => `${t.name} audio`));
  const box = el('section', { class: 'panel', 'aria-label': `${m.name} effects` });
  box.append(el('div', { class: 'panel-head' },
    i === 0 ? el('span', { class: 'panel-title' }, 'Master') : el('input', { type: 'text', value: m.name, 'aria-label': 'Insert name', style: { width: '160px' }, onchange: e => mutate(() => { m.name = e.target.value.slice(0, 24) || m.name; }) }),
    el('span', { class: 'muted small' }, i === 0 ? 'Every insert ends up here.' : feeds.length ? 'Receives: ' + feeds.join(', ') : 'Nothing is routed here yet.'),
    el('span', { class: 'spacer' }),
    i > 0 && i === P.mixer.length - 1 && !feeds.length ? confirmBtn('Remove insert', () => mutate(P2 => { P2.mixer.pop(); for (const t of P2.playlist.tracks) if (t.insert >= P2.mixer.length) t.insert = 0; ui.selInsert = P2.mixer.length - 1; }), { cls: 'btn sm ghost' }) : null));
  const list = el('div', { class: 'fx-list' });
  if (!m.fx.length) list.append(el('p', { class: 'hint', style: { margin: 0 } }, 'No effects on this insert yet. Add a reverb, delay or EQ, or one of your own plugins.'));
  m.fx.forEach((f, k) => list.append(fxCard(i, m, f, k)));
  box.append(list, el('div', { class: 'btn-row' }, el('span', { class: 'lbl' }, 'Add effect'),
    el('select', { 'aria-label': 'Add effect', onchange: e => { const id = e.target.value; e.target.value = ''; if (id) addFx(i, id); } },
      el('option', { value: '' }, 'Choose…'), [...plugins.values()].filter(p => p.manifest.type === 'effect').map(p => el('option', { value: p.id }, p.manifest.name + (p.builtin ? '' : ' ★')))),
    i > 0 && vocalInsert(i) ? el('button', { class: 'btn sm primary', title: 'Presets, Tune, Listen & Match and recording for this track are on the Vocal screen', onclick: () => { ui.vsIns = i; setTab('vocal'); } }, icon('mic'), 'Open in Vocal') : null));
  return box;
}
/* An insert that a recorded track (or a vocal chain) runs through: the Vocal screen shapes it. */
function vocalInsert(i) {
  const P = project;
  return P.playlist.tracks.some((t, ti) => (t.insert | 0) === i && (P.playlist.clips.some(c => c.kind === 'audio' && c.track === ti) || /vocal|vox|voice/i.test(t.name))) || P.mixer[i].fx.some(f => f.plugin === 'th.autotune');
}
function fxCard(i, m, f, k) {
  const pl = getPlugin(f.plugin), err = engine && engine.failed.get(f.plugin);
  const card = el('div', { class: 'fx' + (f.bypass ? ' off' : '') });
  card.append(el('div', { class: 'fx-head' },
    el('button', { class: 'led' + (f.bypass ? '' : ' on'), 'aria-label': (f.bypass ? 'Turn on ' : 'Bypass ') + (pl ? pl.manifest.name : 'effect'), onclick: () => mutate(() => { f.bypass = !f.bypass; }) }),
    el('span', { class: 'fx-name' }, pl ? pl.manifest.name : 'Missing plugin', pl && !pl.builtin ? el('span', { class: 'badge ' + (pl.manifest.script ? 'script' : 'user'), style: { marginLeft: '8px' } }, pl.manifest.script ? 'Script' : 'Installed') : null),
    el('button', { class: 'btn sm icon ghost', 'aria-label': 'Move effect up', disabled: k === 0, onclick: () => mutate(() => { m.fx.splice(k - 1, 0, m.fx.splice(k, 1)[0]); }) }, icon('up')),
    el('button', { class: 'btn sm icon ghost', 'aria-label': 'Move effect down', disabled: k === m.fx.length - 1, onclick: () => mutate(() => { m.fx.splice(k + 1, 0, m.fx.splice(k, 1)[0]); }) }, icon('down')),
    el('button', { class: 'btn sm icon ghost', 'aria-label': 'Remove effect', onclick: () => mutate(() => { m.fx.splice(k, 1); }) }, icon('x'))));
  if (!pl) { card.append(el('div', { class: 'fx-err' }, 'This plugin isn’t installed anymore. Reinstall it from the Plugins tab.')); return card; }
  if (err) card.append(el('div', { class: 'fx-err' }, `Not running: ${err}`));
  if (f.plugin === 'th.autotune' && !f.bypass) card.append(tuneReadout(i, f));
  const vals = effectiveParams(pl.manifest, f.params);
  if (pl.manifest.params.length) card.append(el('div', { class: 'knobs' }, pl.manifest.params.map(d => paramControl(d, vals[d.id], {
    onStart: pushUndo, onEnd: () => changed({ render: false }), onInput: x => { f.params[d.id] = x; if (engine) engine.setFxParam(i, f.id, d.id, x); } }))));
  return card;
}
async function addFx(i, id) {
  const pl = getPlugin(id); if (!pl) return;
  i = clamp(i, 0, project.mixer.length - 1);
  if (pl.manifest.script) {
    if (!ensureCtx()) return;
    try { await engine.loadWorklet(pl); }
    catch (e) { toast(`Couldn’t start ${pl.manifest.name}: ${e.message || 'the script was blocked'}`, { kind: 'error' }); return; }
  }
  if (pluginUsesDsp(id) && ensureCtx()) await engine.loadDsp();
  mutate(P => { P.mixer[i].fx.push(fxSlot(id)); });
}

/* ----- library ----- */
function drawPeaks(cv, peaks) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
  if (!peaks || !peaks.length) return;
  g.fillStyle = COLOR.accent || '#e2b36b'; g.globalAlpha = 0.7;
  for (let x = 0; x < w; x += 3) { const p = peaks[Math.floor(x / w * peaks.length)] || 0, ph = Math.max(2, p * h * 0.95); g.fillRect(x, (h - ph) / 2, 2, ph); }
}
function renderLibrary(host) {
  if (!host) return;
  const oldList = host.querySelector('.lib-list'), keepTop = oldList ? oldList.scrollTop : 0;
  const folders = [...new Set([...lib.values()].map(s => s.folder))].sort();
  if (ui.libFolder !== 'All' && !folders.includes(ui.libFolder)) ui.libFolder = 'All';
  $('#folderList').replaceChildren(...[...new Set(['Imported', 'My Music', 'Drums', 'Loops', 'Vocals', ...folders])].map(f => el('option', { value: f })));
  const list = el('div', { class: 'lib-list', role: 'list', 'data-scroll': 'lib' });
  const fill = () => {
    list.replaceChildren();
    if (!lib.size) { list.append(emptyState(factoryPending ? 'Setting up factory sounds…' : 'Your library is empty', 'Import audio, MIDI or a ZIP sample pack. Everything is stored in this browser.')); return; }
    const q = ui.libQuery.trim().toLowerCase();
    const items = sortedLib().filter(s => (ui.libFolder === 'All' || s.folder === ui.libFolder) && (!q || String(s.name).toLowerCase().includes(q) || String(s.folder).toLowerCase().includes(q)));
    if (!items.length) { list.append(el('p', { class: 'hint', style: { padding: '12px' } }, 'No sounds match that search.')); return; }
    const frag = document.createDocumentFragment();
    for (const s of items.slice(0, 600)) frag.append(libRow(s));
    list.append(frag);
    if (items.length > 600) list.append(el('p', { class: 'hint', style: { padding: '8px 12px' } }, `Showing 600 of ${items.length}. Search to narrow it down.`));
  };
  const foot = el('span', {}, Store.durable ? 'Stored in this browser on this device.' : 'Storage is blocked here, so imports won’t be kept.');
  host.replaceChildren(el('div', { class: 'lib' },
    el('div', { class: 'lib-head' },
      ui.guide && host.id === 'view' ? el('p', { class: 'hint', style: { margin: 0 } }, TIPS.library) : null,
      el('div', { class: 'lib-title' }, el('h2', {}, 'Library'), el('span', { class: 'count' }, `${lib.size} sound${lib.size === 1 ? '' : 's'}`)),
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Import into'), el('input', { type: 'text', list: 'folderList', value: ui.importFolder, 'aria-label': 'Folder for new imports', style: { flex: '1', minWidth: '0' }, onchange: e => { ui.importFolder = e.target.value.trim().slice(0, 40) || 'Imported'; } })),
      el('div', { class: 'lib-drop' }, 'Press Import at the top, or drop files anywhere on the page: audio (WAV, MP3, FLAC, OGG, M4A), MIDI, ZIP sample packs, plugins or a Tapehouse project.'),
      el('input', { type: 'search', placeholder: 'Search sounds', 'aria-label': 'Search the library', value: ui.libQuery, oninput: e => { ui.libQuery = e.target.value; fill(); } }),
      el('div', { class: 'chips' }, ['All', ...folders].map(f => el('button', { class: 'chip', 'aria-pressed': String(ui.libFolder === f), onclick: () => { ui.libFolder = f; renderLib(); } }, f)))),
    list,
    el('div', { class: 'lib-foot' }, foot, el('button', { class: 'btn sm', disabled: !lib.size || !downloads, title: downloads ? 'Save every sound as one .zip' : 'Saving files isn’t available in this view', onclick: backupLibrary }, 'Back up (.zip)'))));
  fill(); list.scrollTop = keepTop;
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(est => { if (est && est.usage != null && Store.durable) foot.textContent = `Stored in this browser · ${fmtBytes(est.usage)} used`; }).catch(() => {});
}
function libRow(s) {
  const sel = ui.libSel === s.id, playing = ui.previewId === s.id;
  const cv = el('canvas', { width: '152', height: '48', 'aria-hidden': 'true' }); drawPeaks(cv, s.peaks);
  const row = el('div', { class: 'lib-row' + (sel ? ' sel' : ''), role: 'listitem', draggable: true },
    el('button', { class: 'btn icon play-mini' + (playing ? ' on' : ''), 'aria-label': (playing ? 'Stop ' : 'Preview ') + s.name, onclick: e => { e.stopPropagation(); previewSample(s.id); } }, icon(playing ? 'stop' : 'play')),
    el('div', { style: { minWidth: '0' } }, el('div', { class: 'lib-name' }, s.name), el('div', { class: 'lib-sub' }, `${s.folder} · ${fmtDur(s.duration)} · ${String(s.ext).toUpperCase()}`)), cv);
  row.addEventListener('click', () => { ui.libSel = sel ? null : s.id; renderLib(); });
  row.addEventListener('dragstart', e => { e.dataTransfer.setData(DT_SAMPLE, s.id); e.dataTransfer.setData('text/plain', s.name); e.dataTransfer.effectAllowed = 'copy'; });
  if (sel) row.append(el('div', { class: 'lib-actions', onclick: e => e.stopPropagation() },
    el('button', { class: 'btn sm', onclick: () => addSamplerChannel(s.id) }, 'Add to beat'),
    el('button', { class: 'btn sm', onclick: () => addAudioClip(s.id) }, 'Add to song'),
    el('input', { type: 'text', value: s.name, 'aria-label': 'Sound name', onchange: e => updateSample(s.id, { name: e.target.value.trim().slice(0, 80) || s.name }) }),
    el('input', { type: 'text', value: s.folder, list: 'folderList', 'aria-label': 'Folder', onchange: e => updateSample(s.id, { folder: e.target.value.trim().slice(0, 60) || 'Imported' }) }),
    confirmBtn('Delete', () => deleteSample(s.id), { cls: 'btn sm danger', confirm: 'Delete for good?' })));
  return row;
}
let previewSrc = null;
async function previewSample(id) {
  if (!ensureCtx()) return;
  if (previewSrc) { try { previewSrc.stop(); } catch (e) { /* ok */ } previewSrc = null; }
  if (ui.previewId === id) { ui.previewId = null; renderLib(); return; }
  ui.previewId = id; renderLib();
  try {
    const buf = await getBuffer(id); if (ui.previewId !== id) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; g.gain.value = 0.9; src.connect(g); g.connect(ctx.destination);
    src.onended = () => { if (previewSrc === src) { previewSrc = null; ui.previewId = null; renderLib(); } };
    src.start(); previewSrc = src;
  } catch (e) { ui.previewId = null; renderLib(); toast(e.message, { kind: 'error' }); }
}
async function updateSample(id, patch) {
  const meta = lib.get(id); if (!meta) return;
  Object.assign(meta, patch);
  try { await Store.put('samples', meta); } catch (e) { toast(`Couldn’t save that change: ${e.message}`, { kind: 'error' }); }
  renderLib(); if (ui.tab !== 'library') renderView();
}
async function deleteSample(id) {
  try { await Store.del('samples', id); await Store.del('sampleData', id); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  const name = (lib.get(id) || {}).name; lib.delete(id); buffers.delete(id); reversedBufs.delete(id); ui.libSel = null;
  if (project.playlist.clips.some(c => c.kind === 'audio' && c.ref === id)) mutate(P => { P.playlist.clips = P.playlist.clips.filter(c => !(c.kind === 'audio' && c.ref === id)); });
  else render();
  renderLib(); toast(`Deleted “${name}”`);
}

/* ----- plugins ----- */
const pluginTemplate = m => {
  const o = { format: 'tapehouse-plugin', type: m.type, name: m.name };
  if (m.author) o.author = m.author; if (m.description) o.description = m.description;
  o.params = m.params; if (m.type === 'instrument') o.voice = m.voice; else o.graph = m.graph;
  return o;
};
const SDK_EXAMPLES = [
  { label: 'Instrument', code: JSON.stringify({ format: 'tapehouse-plugin', type: 'instrument', name: 'Wobble Bass', author: 'You', description: 'Saw bass with an LFO on the filter.',
    params: [{ id: 'cutoff', label: 'Cutoff', min: 80, max: 4000, default: 500, curve: 'log', unit: 'Hz' }, { id: 'wobble', label: 'Wobble', min: 0.5, max: 12, default: 4, unit: 'Hz' }, { id: 'depth', label: 'Depth', min: 0, max: 2000, default: 900, unit: 'Hz' }],
    voice: { gain: 0.35, oscillators: [{ wave: 'sawtooth', gain: 0.7 }, { wave: 'square', octave: -1, gain: 0.4 }], envelope: { attack: 0.005, decay: 0.2, sustain: 0.9, release: 0.1 },
      filter: { type: 'lowpass', cutoff: '$cutoff', q: 6 }, lfo: { target: 'filter', rate: '$wobble', depth: '$depth' } } }, null, 2) },
  { label: 'Effect', code: JSON.stringify({ format: 'tapehouse-plugin', type: 'effect', name: 'Lo-Fi Space', author: 'You', description: 'Crush, darken, then a wash of room.',
    params: [{ id: 'crush', label: 'Crush', min: 3, max: 12, default: 8, step: 1, unit: 'bit' }, { id: 'tone', label: 'Tone', min: 500, max: 12000, default: 3800, curve: 'log', unit: 'Hz' }, { id: 'space', label: 'Space', min: 0, max: 1, default: 0.35 }],
    graph: [{ node: 'bitcrush', bits: '$crush', mix: 0.7 }, { node: 'filter', filterType: 'lowpass', frequency: '$tone', q: 0.7 }, { node: 'reverb', decay: 2.8, mix: '$space' }] }, null, 2) },
  { label: 'Script effect', code: `// @tapehouse {"type":"effect","name":"Ring Mod","author":"You","description":"Classic ring modulator written as an AudioWorklet.","processor":"tapehouse-ring-mod","params":[{"id":"freq","label":"Freq","min":20,"max":2000,"default":330,"curve":"log","unit":"Hz"},{"id":"mix","label":"Mix","min":0,"max":1,"default":0.5}]}
class RingMod extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq', defaultValue: 330, minValue: 20, maxValue: 2000 },
      { name: 'mix', defaultValue: 0.5, minValue: 0, maxValue: 1 },
    ];
  }
  constructor() { super(); this.phase = 0; }
  process(inputs, outputs, params) {
    const input = inputs[0], output = outputs[0];
    let ph = this.phase;
    for (let ch = 0; ch < output.length; ch++) {
      const inp = input[ch] || input[0], out = output[ch];
      ph = this.phase;
      for (let i = 0; i < out.length; i++) {
        const x = inp ? inp[i] : 0;
        const mix = params.mix.length > 1 ? params.mix[i] : params.mix[0];
        const f = params.freq.length > 1 ? params.freq[i] : params.freq[0];
        out[i] = x * (1 - mix) + x * Math.sin(ph) * mix;
        ph += 2 * Math.PI * f / sampleRate;
      }
    }
    this.phase = ph % (2 * Math.PI);
    return true;
  }
}
registerProcessor('tapehouse-ring-mod', RingMod);
` },
];
async function installPluginText(text, forceId) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Paste or write a plugin first.');
  let man, source = null;
  if (t[0] === '{') { let obj; try { obj = JSON.parse(t); } catch (e) { throw new Error('That JSON has a syntax error: ' + e.message); } man = validatePlugin(obj); }
  else { man = parseScriptPlugin(t); source = t; }
  const existing = forceId ? plugins.get(forceId) : [...plugins.values()].find(p => !p.builtin && p.manifest.type === man.type && p.manifest.name.toLowerCase() === man.name.toLowerCase());
  if (existing && existing.builtin) throw new Error('That id belongs to a built-in plugin.');
  const id = forceId || (existing ? existing.id : 'user.' + slug(man.name) + '-' + uid().slice(0, 4));
  if (source && [...plugins.values()].some(p => p.id !== id && p.manifest.script && p.manifest.processor === man.processor)) throw new Error(`Another script already uses the processor name “${man.processor}”. Pick a unique name.`);
  man.id = id;
  await Store.put('plugins', { id, manifest: man, source, installedAt: Date.now() });
  plugins.set(id, { id, manifest: man, source, builtin: false });
  if (existing && source && engine && engine.loaded.has(id)) toast('Reload the page to run the updated script.');
  if (engine) { engine.inserts.forEach(x => { x.sig = null; }); engine.sync(); }
  return { id, name: man.name, type: man.type, updated: !!existing };
}
async function removePlugin(id) {
  try { await Store.del('plugins', id); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  plugins.delete(id); if (engine) engine.sync(); render(); toast('Plugin removed');
}
const countUsage = id => project.channels.filter(c => c.plugin === id).length + project.mixer.reduce((a, m) => a + m.fx.filter(f => f.plugin === id).length, 0);
function renderPlugins(v) {
  const all = [...plugins.values()], insIdx = clamp(ui.selInsert, 0, project.mixer.length - 1);
  const card = p => {
    const m = p.manifest, used = countUsage(p.id);
    return el('div', { class: 'pg-card' },
      el('h4', {}, m.name, el('span', { class: 'badge' + (p.builtin ? '' : m.script ? ' script' : ' user') }, p.builtin ? 'Built-in' : m.script ? 'Script' : 'Installed')),
      m.description ? el('p', {}, m.description) : null,
      el('div', { class: 'params' }, m.params.length ? m.params.map(x => x.label).join(' · ') : 'No params'),
      el('div', { class: 'btn-row' },
        m.type === 'instrument'
          ? el('button', { class: 'btn sm', onclick: () => { addChannel({ name: m.name, kind: 'synth', plugin: p.id }); toast(`Added ${m.name} to your beat`, { action: { label: 'Open Beat', run: () => setTab('rack') } }); } }, 'Add to beat')
          : el('button', { class: 'btn sm', onclick: async () => { await addFx(insIdx, p.id); toast(`Added ${m.name} to ${project.mixer[insIdx].name}`, { action: { label: 'Open Mix', run: () => setTab('mixer') } }); } }, `Add to ${project.mixer[insIdx].name}`),
        el('button', { class: 'btn sm ghost', onclick: () => { ui.pluginDraft = p.source || JSON.stringify(pluginTemplate(m), null, 2); ui.sdkStatus = null; renderView(); requestAnimationFrame(() => { const ed = $('#sdkEditor'); if (ed) ed.scrollIntoView({ block: 'center' }); }); } }, p.builtin ? 'Use as template' : 'Edit'),
        !p.builtin ? confirmBtn('Remove', () => removePlugin(p.id), { cls: 'btn sm danger', confirm: used ? `Used ${used}× · remove?` : 'Confirm remove' }) : null));
  };
  const ta = el('textarea', { id: 'sdkEditor', rows: '16', spellcheck: false, 'aria-label': 'Plugin source', value: ui.pluginDraft || SDK_EXAMPLES[0].code, oninput: e => { ui.pluginDraft = e.target.value; } });
  const status = el('div', { class: 'sdk-status' + (ui.sdkStatus ? ' ' + ui.sdkStatus.kind : ''), 'aria-live': 'polite' }, ui.sdkStatus ? ui.sdkStatus.text : '');
  const dl = el('dl', {});
  [['instrument.voice', 'gain · oscillators[] {wave, octave, semitone, detune, gain} · noise · envelope {attack, decay, sustain, release} · filter {type, cutoff, q, envAmount, envelope} · lfo {target: pitch | filter | amp, rate, depth, wave}'],
    ['effect.graph', `Nodes run in series: ${Object.keys(PRIMS).join(', ')}. The delay node takes "beats" for tempo sync.`],
    ['params[]', '{id, label, min, max, default, curve: "log", step, unit} or {id, label, options: [{label, value}], default}'],
    ['"$id"', 'Any voice or graph value can point at a param: "$cutoff", or scaled: "$detune*-1".'],
    ['script .js', 'First line: // @tapehouse {"type":"effect", "name", "processor", "params"}. Then register an AudioWorkletProcessor; param ids map to its AudioParams.']]
    .forEach(([k, d]) => dl.append(el('dt', {}, k), el('dd', {}, d)));
  v.append(el('div', { class: 'view-head' },
    el('button', { class: 'btn primary sm', onclick: () => pickFiles('.json,.js,.zip,application/json,text/javascript') }, 'Install plugin file'),
    el('span', { class: 'hint' }, 'Tapehouse plugins are .json instruments and effects or .js AudioWorklet effects. Desktop VST and AU plugins can’t run inside a web page.')),
    tipStrip('plugins') || '',
    el('div', { class: 'view-body', 'data-scroll': 'plugins' }, el('div', { class: 'pg-body' },
      el('section', { class: 'pg-sec' }, el('h3', {}, 'Instruments'), el('div', { class: 'pg-grid' }, all.filter(p => p.manifest.type === 'instrument').map(card))),
      el('section', { class: 'pg-sec' }, el('h3', {}, 'Effects'), el('div', { class: 'pg-grid' }, all.filter(p => p.manifest.type === 'effect').map(card))),
      el('section', { class: 'pg-sec' }, el('h3', {}, 'Write your own'), el('div', { class: 'sdk' },
        el('p', {}, 'Write a plugin here and install it straight into the studio. JSON plugins describe a synth voice or a chain of effect nodes. Script effects are real DSP code running on the audio thread.'),
        dl,
        el('div', { class: 'btn-row' }, el('span', { class: 'lbl' }, 'Start from'), SDK_EXAMPLES.map(x => el('button', { class: 'btn sm', onclick: () => { ui.pluginDraft = x.code; ta.value = x.code; ui.sdkStatus = null; status.textContent = ''; status.className = 'sdk-status'; } }, x.label))),
        ta,
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn primary', onclick: async () => {
            try { const r = await installPluginText(ta.value); ui.sdkStatus = { kind: 'ok', text: `${r.updated ? 'Updated' : 'Installed'} “${r.name}”. ${r.type === 'instrument' ? 'Add it from Beat.' : 'Add it to a mixer insert.'}` }; ui.pluginDraft = ta.value; renderView(); }
            catch (e) { status.className = 'sdk-status err'; status.textContent = e.message; } } }, 'Install'),
          el('button', { class: 'btn', onclick: () => { const done = () => toast('Copied'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('Press Ctrl+C or ⌘C to copy'); }); else { ta.select(); toast('Press Ctrl+C or ⌘C to copy'); } } }, 'Copy'),
          el('button', { class: 'btn', disabled: !downloads, title: downloads ? '' : 'Saving files isn’t available in this view', onclick: () => savePluginFile(ta.value) }, 'Save as file')),
        status)))));
}
async function savePluginFile(text) {
  const t = String(text || '').trim();
  try {
    if (t[0] === '{') { const m = validatePlugin(JSON.parse(t)); await saveFile(safeFile(m.name) + '.json', t); }
    else { const m = parseScriptPlugin(t); await saveFile(safeFile(m.name) + '.zip', makeZip([{ name: safeFile(m.name) + '.js', data: utf8(t) }])); }
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

/* ---------- import ---------- */
function pickFiles(accept) { const fi = $('#fileInput'); fi.accept = accept || ''; fi.value = ''; fi.click(); }
const GM_DRUMS = { 35: 'kick', 36: 'kick', 37: 'perc', 38: 'snare', 39: 'clap', 40: 'snare', 41: 'tom', 42: 'hat', 43: 'tom', 44: 'hat', 45: 'tom', 46: 'openhat', 47: 'tom', 48: 'tom', 49: 'openhat', 50: 'tom', 51: 'openhat', 54: 'shaker', 56: 'perc', 57: 'openhat', 60: 'perc', 61: 'perc', 62: 'perc', 63: 'perc', 64: 'perc', 69: 'shaker', 70: 'shaker', 75: 'perc', 76: 'perc', 77: 'perc' };
function computePeaks(buf, n) {
  const d0 = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, L = d0.length, step = Math.max(1, Math.floor(L / n));
  const out = []; let mx = 0;
  for (let i = 0; i < n; i++) {
    let p = 0; const a = i * step, b = Math.min(L, a + step);
    for (let j = a; j < b; j += 4) { const v = Math.abs(d0[j]) + (d1 ? Math.abs(d1[j]) : 0); if (v > p) p = v; }
    out.push(p); if (p > mx) mx = p;
  }
  return out.map(p => mx ? Math.round(p / mx * 1000) / 1000 : 0);
}
async function importAudioBytes(name, bytes, o = {}) {
  const ab = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (!ab.byteLength) throw new Error(`${fileName(name)} is empty.`);
  let buf;
  try { buf = await decodeAB(decodeCtx(), ab.slice(0)); } catch (e) { throw new Error(`${fileName(name)}: this browser can’t decode that audio format.`); }
  const id = o.id || uid();
  const meta = { id, name: baseName(name).slice(0, 80), ext: extOf(name) || 'wav', folder: String(o.folder || 'Imported').slice(0, 60), size: ab.byteLength,
    duration: buf.duration, channels: buf.numberOfChannels, peaks: computePeaks(buf, 120), addedAt: Date.now() };
  await Store.put('sampleData', { id, data: ab });
  await Store.put('samples', meta);
  lib.set(id, meta); buffers.set(id, buf);
  return meta;
}
async function importMidi(name, ab) {
  const mid = parseMidi(ab), tps = mid.div / 4;
  let groups = [];
  for (const tr of mid.tracks) {
    if (!tr.notes.length) continue;
    const byCh = new Map(); for (const n of tr.notes) { if (!byCh.has(n.ch)) byCh.set(n.ch, []); byCh.get(n.ch).push(n); }
    for (const [c, notes] of byCh) groups.push({ name: tr.name, ch: c, notes });
  }
  if (!groups.length) throw new Error(`${fileName(name)} has no notes in it.`);
  groups = groups.slice(0, 16);
  let maxEnd = 0; for (const g of groups) for (const n of g.notes) maxEnd = Math.max(maxEnd, Math.round(n.t1 / tps));
  const length = clamp(Math.ceil(maxEnd / 16) * 16, 16, 512);
  let made = 0;
  mutate(P => {
    const pat = newPattern(P.patterns.length, length); pat.name = baseName(name).slice(0, 40);
    P.patterns.push(pat); P.currentPattern = pat.id; ui.plBrush = pat.id;
    groups.forEach((g, gi) => {
      if (g.ch === 9) {
        const byKind = new Map();
        for (const n of g.notes) { const s = Math.round(n.t0 / tps); if (s >= length) continue; const k = GM_DRUMS[n.n] || 'perc'; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push({ s, v: clamp(n.v, 0.2, 1) }); }
        for (const [k, hits] of byKind) {
          makeChannel(P, { name: DRUMS.find(d => d[0] === k)[1], kind: 'drum', drum: k }); const ch = P.channels[P.channels.length - 1]; made++;
          const arr = ensureSteps(pat, ch.id); for (const h of hits) arr[h.s] = Math.max(arr[h.s] || 0, Math.round(h.v * 100) / 100);
        }
      } else {
        const avg = g.notes.reduce((a, n) => a + n.n, 0) / g.notes.length;
        const ch = makeChannel(P, { name: (g.name || `MIDI ${gi + 1}`).slice(0, 32), kind: 'synth', plugin: avg < 48 ? 'th.sub-bass' : 'th.tape-keys' }); made++;
        pat.notes[ch.id] = g.notes.map(n => ({ s: Math.round(n.t0 / tps), l: Math.max(1, Math.round((n.t1 - n.t0) / tps)), n: clamp(n.n, PR.lo, PR.hi), v: Math.round(clamp(n.v, 0.1, 1) * 100) / 100 }))
          .filter(n => n.s < length).map(n => ({ ...n, l: Math.min(n.l, length - n.s) }));
      }
    });
  });
  const extra = maxEnd > 512 ? ' It was longer than 32 bars, so the end was trimmed.' : '';
  if (mid.bpm && mid.bpm !== project.bpm && mid.bpm >= 40 && mid.bpm <= 240) toast(`“${baseName(name)}” is now a pattern with ${made} channel${made === 1 ? '' : 's'}. The file’s tempo is ${mid.bpm} BPM.${extra}`, { action: { label: `Use ${mid.bpm} BPM`, run: () => setBpm(mid.bpm) } });
  else toast(`“${baseName(name)}” is now a pattern with ${made} channel${made === 1 ? '' : 's'}.${extra}`, { action: { label: 'Open Notes', run: () => setTab('piano') } });
}
async function importBundle(entries, manifestEntry, res) {
  const j = JSON.parse(new TextDecoder().decode(await manifestEntry.get()));
  if (!j || j.format !== 'tapehouse-bundle' || !j.project) throw new Error('This project bundle is damaged.');
  for (const pl of j.plugins || []) {
    if (plugins.has(pl.id)) continue;
    const en = entries.find(e => e.name === pl.file); if (!en) continue;
    try { await installPluginText(new TextDecoder().decode(await en.get()), pl.id); res.plugins++; } catch (e) { res.errors.push(e.message); }
  }
  for (const s of j.samples || []) {
    if (lib.has(s.id)) continue;
    const en = entries.find(e => e.name === s.file); if (!en) { res.errors.push(`The bundle is missing ${s.file}`); continue; }
    try { res.audio.push(await importAudioBytes(`${s.name}.${s.ext}`, await en.get(), { folder: s.folder, id: s.id })); } catch (e) { res.errors.push(e.message); }
  }
  await openProjectObject(j.project); res.projects++;
}
async function importZip(name, ab, res, progress) {
  const entries = readZip(ab);
  const pm = entries.find(e => fileName(e.name) === 'tapehouse-project.json');
  if (pm) return importBundle(entries, pm, res);
  let libMap = null;
  const lm = entries.find(e => fileName(e.name) === 'tapehouse-library.json');
  if (lm) { try { const j = JSON.parse(new TextDecoder().decode(await lm.get())); libMap = new Map((j.samples || []).map(s => [s.file, s])); } catch (e) { /* treat as a plain zip */ } }
  const zipFolder = baseName(name);
  let i = 0;
  for (const en of entries) {
    const ext = extOf(en.name);
    try {
      if (AUDIO_EXT.includes(ext)) {
        const meta = libMap && libMap.get(en.name);
        if (meta && lib.has(meta.id)) { res.skipped++; continue; }
        const parts = en.name.split('/'), sub = parts.length >= 2 ? parts[parts.length - 2] : '';
        const folder = meta ? meta.folder : (sub && sub !== zipFolder ? `${zipFolder} / ${sub}` : zipFolder);
        res.audio.push(await importAudioBytes(meta ? `${meta.name}.${ext}` : fileName(en.name), await en.get(), { folder, id: meta && meta.id }));
      } else if (ext === 'mid' || ext === 'midi') {
        const u8 = await en.get(); await importMidi(fileName(en.name), u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); res.midi++;
      } else if (ext === 'js' || ext === 'json') {
        const txt = new TextDecoder().decode(await en.get());
        if (ext === 'js' || /"format"\s*:\s*"tapehouse-plugin"/.test(txt)) { await installPluginText(txt); res.plugins++; }
      }
    } catch (e) { res.errors.push(e.message.includes(fileName(en.name)) ? e.message : `${fileName(en.name)}: ${e.message}`); }
    if (progress) progress(++i, entries.length);
  }
}
async function importFiles(files) {
  const res = { audio: [], midi: 0, plugins: 0, projects: 0, skipped: 0, errors: [] };
  if (!files.length) return res;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const folder = ui.importFolder || 'Imported';
  const busy = toast(`Importing ${files.length} file${files.length > 1 ? 's' : ''}…`, { sticky: true, kind: 'busy' });
  let k = 0;
  for (const f of files) {
    k++; const ext = extOf(f.name);
    try {
      if (AUDIO_EXT.includes(ext) || (f.type || '').startsWith('audio/')) { busy.set(`Importing ${k} of ${files.length}: ${f.name}`); res.audio.push(await importAudioBytes(f.name, await f.arrayBuffer(), { folder })); }
      else if (ext === 'mid' || ext === 'midi') { await importMidi(f.name, await f.arrayBuffer()); res.midi++; }
      else if (ext === 'zip') { await importZip(f.name, await f.arrayBuffer(), res, (i, n) => busy.set(`Unpacking ${f.name}: ${i} of ${n}`)); }
      else if (ext === 'json') {
        const txt = await f.text(); let obj;
        try { obj = JSON.parse(txt); } catch (e) { throw new Error(`${f.name} isn’t valid JSON.`); }
        if (obj && obj.format === 'tapehouse-plugin') { await installPluginText(txt); res.plugins++; }
        else if (obj && obj.format === 'tapehouse-project') { await openProjectObject(obj); res.projects++; }
        else throw new Error(`${f.name} isn’t a Tapehouse plugin or project.`);
      } else if (ext === 'js' || ext === 'txt') { await installPluginText(await f.text()); res.plugins++; }
      else res.errors.push(`${f.name}: this file type isn’t supported.`);
    } catch (e) { res.errors.push(e.message || String(e)); }
  }
  busy.done();
  const bits = [];
  if (res.audio.length) bits.push(`${res.audio.length} sound${res.audio.length > 1 ? 's' : ''}`);
  if (res.plugins) bits.push(`${res.plugins} plugin${res.plugins > 1 ? 's' : ''}`);
  if (res.projects) bits.push('a project');
  if (res.skipped) bits.push(`${res.skipped} already in your library`);
  if (bits.length) toast(`Imported ${bits.join(', ')}.`, res.audio.length && ui.tab !== 'library' && !isWide() ? { action: { label: 'Open library', run: () => setTab('library') } } : {});
  if (res.errors.length) toast(res.errors[0] + (res.errors.length > 1 ? ` (and ${res.errors.length - 1} more)` : ''), { kind: 'error', ms: 8000 });
  if (res.audio.length) { ui.libFolder = 'All'; }
  renderLib(); render();
  return res;
}

/* ---------- projects & export ---------- */
function switchProject(p) {
  halt(); project = p; hist.undo.length = 0; hist.redo.length = 0;
  Object.assign(ui, { selCh: null, prCh: null, prSel: null, plSel: null, plBrush: null });
  T.songPos = T.marker = 0;
  if (engine) { engine.build(); engine.prepare(project); }
  scheduleSave(); render(); smartKeySoon(800);
}
async function openProjectObject(obj) {
  const p = normalizeProject(JSON.parse(JSON.stringify(obj))); p.id = uid();
  await saveProject(); switchProject(p);
}
async function loadProject(id) {
  const rec = await Store.get('projects', id);
  if (!rec) { toast('That project could not be found.', { kind: 'error' }); return; }
  let p; try { p = normalizeProject(JSON.parse(rec.data)); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  await saveProject(); switchProject(p); toast(`Opened “${p.name}”`);
}
/* Plain browser downloads, used when Tapehouse runs as its own file outside claude.ai. */
function browserDownloads() {
  return { native: true, async save({ filename, data }) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = el('a', { href: url, download: filename, style: { display: 'none' } }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } };
}
/* The whole app as one .html file, for recording outside claude.ai (which doesn't pass the mic to pages). */
function standaloneHtml() {
  const P = PAGE_PARTS, fonts = 'https://fonts.googleapis.com/css2?family=Michroma&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Tapehouse</title>'
    + `<link rel="stylesheet" href="${fonts}"><style>html,body{margin:0}</style><style id="th-style">${P.css}</style></head><body>${P.markup}<script id="th-app">${P.js}<` + '/script></body></html>';
}
async function getRecordingEdition() {
  if (!PAGE_PARTS) { toast('Couldn’t package the app from this view.', { kind: 'error' }); return; }
  const html = new TextEncoder().encode(standaloneHtml());
  if (await saveFile('Tapehouse.zip', makeZip([{ name: 'Tapehouse.html', data: html }])))
    toast('Unzip it and open Tapehouse.html in Chrome or Edge. Allow the mic when it asks.', { ms: 9000 });
}
async function saveFile(filename, data) {
  if (!downloads) { toast('Saving files isn’t available in this view.', { kind: 'error' }); return false; }
  try { await downloads.save({ filename, data }); toast(`Saved ${filename}`); return true; }
  catch (e) {
    const code = e && e.code;
    if (code === 'declined') toast('Save cancelled.');
    else if (code === 'rate_limited') toast('Another save is still open. Finish it, then try again.', { kind: 'error' });
    else if (code === 'too_large') toast('That file is too large to save here.', { kind: 'error' });
    else toast(`Couldn’t save: ${(e && e.message) || code || 'unknown error'}`, { kind: 'error' });
    return false;
  }
}
async function exportAudio(what, out) {
  out.replaceChildren(el('span', { class: 'muted' }, what === 'song' ? 'Rendering the song…' : 'Rendering the pattern…'));
  try {
    const { buffer, frames } = await renderOffline(project, what);
    let peak = 0; for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < frames; i += 2) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
    const wav = encodeWav(buffer, frames), name = safeFile(project.name + (what === 'pattern' ? ' - ' + curPattern().name : ''));
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    out.replaceChildren(el('span', {}, `${fmtDur(frames / buffer.sampleRate)} rendered, ${fmtBytes(wav.byteLength)} as 16-bit WAV.`),
      peak > 1 ? el('span', { class: 'fx-err' }, `The mix clips (peak ${fmtDb(peak)} dB). Pull the master fader down a little.`) : null,
      el('audio', { controls: true, src: url }));
    if (downloads && downloads.native) { if (await saveFile(name + '.wav', new Uint8Array(wav))) out.append(el('span', { class: 'muted small' }, 'Saved to your Downloads folder.')); }
    else if (downloads) { if (await saveFile(name + '.zip', makeZip([{ name: name + '.wav', data: new Uint8Array(wav) }]))) out.append(el('span', { class: 'muted small' }, 'Saved as a .zip with the .wav inside.')); }
    else out.append(el('span', { class: 'muted small' }, 'Saving files isn’t available in this view, so listen to it here.'));
  } catch (e) { out.replaceChildren(el('span', { class: 'fx-err' }, `Render failed: ${e.message}`)); }
}
async function exportBundle() {
  const P = project, files = [], samples = [], pls = [];
  try {
    for (const id of usedSampleIds(P, true)) {
      const meta = lib.get(id), rec = await Store.get('sampleData', id); if (!meta || !rec) continue;
      const file = `samples/${id}.${meta.ext}`; files.push({ name: file, data: new Uint8Array(rec.data) });
      samples.push({ id, file, name: meta.name, folder: meta.folder, ext: meta.ext });
    }
    const pids = new Set(); P.channels.forEach(c => { if (c.kind === 'synth') pids.add(c.plugin); }); P.mixer.forEach(m => m.fx.forEach(f => pids.add(f.plugin)));
    for (const id of pids) {
      const p = plugins.get(id); if (!p || p.builtin) continue;
      const file = `plugins/${id}.${p.manifest.script ? 'js' : 'json'}`;
      files.push({ name: file, data: utf8(p.source || JSON.stringify(pluginTemplate(p.manifest), null, 2)) }); pls.push({ id, file });
    }
    files.unshift({ name: 'tapehouse-project.json', data: utf8(JSON.stringify({ format: 'tapehouse-bundle', version: 1, project: P, samples, plugins: pls })) });
    await saveFile(safeFile(P.name) + '.zip', makeZip(files));
  } catch (e) { toast(`Couldn’t pack the project: ${e.message}`, { kind: 'error' }); }
}
async function backupLibrary() {
  const t = toast('Packing your library…', { sticky: true, kind: 'busy' });
  try {
    const files = [], samples = [];
    for (const s of lib.values()) {
      const rec = await Store.get('sampleData', s.id); if (!rec) continue;
      const file = `${safeFile(s.folder)}/${safeFile(s.name)}-${s.id.slice(0, 4)}.${s.ext}`;
      files.push({ name: file, data: new Uint8Array(rec.data) }); samples.push({ id: s.id, file, name: s.name, folder: s.folder, ext: s.ext });
    }
    files.unshift({ name: 'tapehouse-library.json', data: utf8(JSON.stringify({ format: 'tapehouse-library', version: 1, samples })) });
    t.done(); await saveFile('Tapehouse Library.zip', makeZip(files));
  } catch (e) { t.done(); toast(e.message, { kind: 'error' }); }
}
async function openProjectSheet(opts = {}) {
  let list = []; try { list = await Store.all('projects'); } catch (e) { /* ok */ }
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const out = el('div', { class: 'export-out', 'aria-live': 'polite' });
  openSheet([
    sheetHead(project.name),
    el('section', {}, el('h3', {}, 'Export'),
      el('p', { class: 'muted' }, downloads ? 'Mixdowns save as a .zip with a 16-bit .wav inside. A project bundle carries the patterns, the sounds they use and your installed plugins, so you can open it on another device.'
        : 'Saving files isn’t available in this view. You can still render a mixdown and listen to it here.'),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn primary', onclick: () => exportAudio('song', out) }, 'Song to WAV'),
        el('button', { class: 'btn', onclick: () => exportAudio('pattern', out) }, 'Pattern to WAV'),
        el('button', { class: 'btn', disabled: !downloads, onclick: exportBundle }, 'Project bundle'),
        el('button', { class: 'btn', disabled: !downloads, onclick: () => { closeSheet(); exportStems(); }, title: 'One .wav per sound, zipped' }, 'Stems')),
      out),
    el('section', {}, el('h3', {}, 'Start new'), el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => { closeSheet(); openProjectObject(blankProject()); } }, 'Blank project'),
      el('button', { class: 'btn', onclick: () => { closeSheet(); openProjectObject(demoProject()); } }, 'Demo song'),
      el('button', { class: 'btn', onclick: () => { closeSheet(); const c = JSON.parse(JSON.stringify(project)); c.name = (project.name + ' copy').slice(0, 80); openProjectObject(c); } }, 'Duplicate this one'))),
    el('section', {}, el('h3', {}, `Saved projects · ${list.length}`),
      list.length ? list.map(r => el('div', { class: 'proj-row' + (r.id === project.id ? ' cur' : '') },
        el('span', { class: 'nm' }, r.name), el('span', { class: 'dt' }, new Date(r.updatedAt || 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        r.id === project.id ? null : el('button', { class: 'btn sm', onclick: () => { closeSheet(); loadProject(r.id); } }, 'Open'),
        r.id === project.id ? null : confirmBtn('Delete', async () => { await Store.del('projects', r.id); openProjectSheet(); }, { cls: 'btn sm ghost', confirm: 'Delete for good?' })))
        : el('p', { class: 'hint' }, 'Nothing saved yet.')),
    el('p', { class: 'hint', style: { margin: 0 } }, Store.durable ? 'Projects save automatically in this browser. Use a project bundle to move work between devices.' : 'This browser is blocking storage, so nothing is kept after you close the page. Export a project bundle to keep your work.')]);
  if (opts.exportSong) exportAudio('song', out);
}

/* ---------- factory sounds ---------- */
async function renderSnippet(len, nch, bpm, setup) {
  const sr = 44100, oac = new OfflineAudioContext(nch, Math.ceil(sr * len), sr);
  const P = { bpm, mixer: [{ id: 'm', name: 'M', vol: 1, pan: 0, mute: false, solo: false, fx: [] }], channels: [], patterns: [], playlist: { tracks: [], clips: [] } };
  const E = new Engine(oac, () => P, { offline: true }); E.build();
  const add = o => { const ch = { id: uid(), name: 'x', params: {}, vol: 0.9, pan: 0, mute: false, insert: 0, ...o }; P.channels.push(ch); E.sync(); return ch; };
  setup(E, add);
  return oac.startRendering();
}
async function storeRendered(id, name, folder, buf) {
  const wav = encodeWav(buf);
  const meta = { id, name, ext: 'wav', folder, size: wav.byteLength, duration: buf.duration, channels: buf.numberOfChannels, peaks: computePeaks(buf, 120), addedAt: Date.now(), factory: true };
  await Store.put('sampleData', { id, data: wav }); await Store.put('samples', meta);
  lib.set(id, meta); buffers.set(id, buf);
}
async function seedFactory() {
  try { if (await Store.get('meta', 'factory-v1')) return; } catch (e) { /* render anyway */ }
  factoryPending = true; renderLib();
  try {
    const hits = [['factory-kick', 'Kick Punch', 'kick', 0.7], ['factory-snare', 'Snare Crack', 'snare', 0.5], ['factory-clap', 'Clap Wide', 'clap', 0.5], ['factory-hat', 'Hat Closed', 'hat', 0.25],
      ['factory-openhat', 'Hat Open', 'openhat', 0.6], ['factory-shaker', 'Shaker', 'shaker', 0.25], ['factory-perc', 'Perc Block', 'perc', 0.3], ['factory-tom', 'Tom Low', 'tom', 0.7], ['factory-808', '808 Long C', '808', 2.0]];
    for (const [id, name, drum, len] of hits) {
      if (lib.has(id)) continue;
      await storeRendered(id, name, 'Factory Drums', await renderSnippet(len, 1, 124, (E, add) => { E.trigger(add({ kind: 'drum', drum }), 0.002, 60, 1, 0.1, true); }));
    }
    const sd = 60 / 124 / 4, loopLen = 32 * sd;
    if (!lib.has('factory-stab')) await storeRendered('factory-stab', 'Keys Stab Am', 'Factory Instruments', await renderSnippet(1.6, 2, 124, (E, add) => { const ch = add({ kind: 'synth', plugin: 'th.tape-keys' }); [57, 60, 64].forEach(n => E.trigger(ch, 0.002, n, 0.8, 0.45, false)); }));
    if (!lib.has('factory-pad')) await storeRendered('factory-pad', 'Pad Swell F', 'Factory Instruments', await renderSnippet(5, 2, 124, (E, add) => { const ch = add({ kind: 'synth', plugin: 'th.sunset-pad' }); [53, 57, 60, 65].forEach(n => E.trigger(ch, 0.002, n, 0.8, 3.2, false)); }));
    if (!lib.has('factory-acid')) await storeRendered('factory-acid', 'Acid Loop 124', 'Factory Loops', await renderSnippet(loopLen, 2, 124, (E, add) => {
      const ch = add({ kind: 'synth', plugin: 'th.acid-bass' });
      [[0, 45, 2], [2, 45, 1], [3, 57, 1], [6, 45, 1], [8, 48, 2], [10, 45, 1], [11, 55, 1], [14, 43, 2], [16, 45, 2], [18, 57, 1], [19, 45, 1], [22, 52, 1], [24, 48, 2], [26, 45, 1], [27, 57, 1], [30, 40, 2]]
        .forEach(([s, n, l]) => E.trigger(ch, s * sd, n, 0.85, l * sd * 0.9, false));
    }));
    if (!lib.has('factory-drumloop')) await storeRendered('factory-drumloop', 'Drum Loop 124', 'Factory Loops', await renderSnippet(loopLen, 2, 124, (E, add) => {
      const k = add({ kind: 'drum', drum: 'kick' }), c = add({ kind: 'drum', drum: 'clap', vol: 0.7 }), h = add({ kind: 'drum', drum: 'hat', vol: 0.5 }), o = add({ kind: 'drum', drum: 'openhat', vol: 0.4 });
      for (let s = 0; s < 32; s++) {
        const t = s * sd, b = s % 16;
        if (b % 4 === 0) E.trigger(k, t, 60, 0.95, sd, true);
        if (b === 4 || b === 12) E.trigger(c, t, 60, 0.85, sd, true);
        if (b % 4 === 2) E.trigger(o, t, 60, 0.7, sd, true); else E.trigger(h, t, 60, s % 2 ? 0.4 : 0.6, sd, true);
      }
    }));
    await Store.put('meta', { key: 'factory-v1', value: true });
  } catch (e) { console.warn('Factory sounds could not be created', e); }
  factoryPending = false; renderLib();
  if (ui.tab === 'rack') renderView();
}

/* ---------- keyboard, drag & drop, boot ---------- */
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
let kbBase = 60; const held = new Map();
function isTyping(t) {
  if (!t || !t.tagName) return false;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
  return t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type);
}
function keyboardChannel() {
  const id = ui.tab === 'piano' ? ui.prCh : ui.selCh;
  return project.channels.find(c => c.id === id) || project.channels[0];
}
function onKeyDown(e) {
  if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (isTyping(e.target)) return;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod || e.altKey || !$('#sheet').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if (e.target && e.target.closest && e.target.closest('.knob')) return;
  if (ui.tab === 'piano' && ui.prSel && handlePianoKey(e)) return;
  const k = e.key.toLowerCase();
  if (k === 'r' && !e.repeat) { recordToggle(); return; }
  if (k === 'm' && !e.repeat) { toggleMetro(); return; }
  if (k === 'z' || k === 'x') { kbBase = clamp(kbBase + (k === 'z' ? -12 : 12), 24, 96); toast(`Keyboard starts at ${noteName(kbBase)}`, { ms: 1300 }); return; }
  if (k in KEYMAP && !e.repeat && !held.has(k)) {
    const ch = keyboardChannel(); if (!ch || !ensureCtx()) return;
    const n = kbBase + KEYMAP[k];
    if (ch.kind === 'sampler' && !buffers.has(ch.sampleId)) { getBuffer(ch.sampleId).catch(() => {}); return; }
    held.set(k, engine.trigger(ch, ctx.currentTime + 0.003, n, 0.85, 30, false));
  }
}
function onKeyUp(e) {
  if (e.code === 'Space' && !isTyping(e.target)) e.preventDefault();
  const k = e.key.toLowerCase(); if (!held.has(k)) return;
  const h = held.get(k); held.delete(k);
  if (h && h.release && ctx) h.release(ctx.currentTime);
}
let dragDepth = 0;
function hideDrop() { dragDepth = 0; $('#dropOverlay').hidden = true; }
function bindChrome() {
  scopeEl = $('#scope'); masterFillEl = $('#masterFill');
  $('#stopBtn').append(icon('stop')); $('#undoBtn').append(icon('undo')); $('#redoBtn').append(icon('redo')); $('#searchBtn').append(icon('search')); $('#importBtn').prepend(icon('importIc')); $('#projBtn').prepend(icon('folder'));
  $('#colorsBtn').addEventListener('click', openColors);
  $('#searchBtn').addEventListener('click', openPalette);
  $('#tipsBtn').addEventListener('click', () => toggleGuide());
  $('#keyRoot').addEventListener('change', e => setKey(+e.target.value, project.scale));
  $('#keyScale').addEventListener('change', e => setKey(project.key, e.target.value));
  $('#playBtn').addEventListener('click', togglePlay);
  $('#stopBtn').addEventListener('click', stopAndRewind);
  $('#recBtn').addEventListener('click', recordToggle);
  $('#metroBtn').append(icon('metro')); $('#metroBtn').addEventListener('click', toggleMetro);
  $$('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#bpm').addEventListener('change', e => setBpm(e.target.value));
  $('#projName').addEventListener('change', e => mutate(P => { P.name = e.target.value.trim().slice(0, 80) || 'Untitled'; }, { render: false }));
  $('#patSelect').addEventListener('change', e => { project.currentPattern = e.target.value; ui.plBrush = e.target.value; ui.prSel = null; scheduleSave(); render(); });
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  $('#importBtn').addEventListener('click', () => pickFiles());
  $('#projBtn').addEventListener('click', openProjectSheet);
  $('#fileInput').addEventListener('change', e => { const files = [...e.target.files]; if (files.length) importFiles(files); });
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  const unlock = () => { if (!ctx || ctx.state !== 'running' || !unlockTried) ensureCtx(); };
  ['pointerdown', 'click', 'keydown', 'touchend'].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));
  document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { for (const [k, h] of held) { held.delete(k); if (h && h.release && ctx) h.release(ctx.currentTime); } });
  document.addEventListener('pointermove', e => {
    if (!paint || !(e.buttons & 1)) return;
    const t = document.elementFromPoint(e.clientX, e.clientY), b = t && t.closest && t.closest('.st');
    if (b && b.parentElement === paint.row) { const i = +b.dataset.i; if (!!paint.arr[i] !== !!paint.val) setStep(paint.arr, b, i, paint.val); }
  });
  const endSteps = () => { if (stepEditing) { stepEditing = false; paint = null; changed({ render: false }); } };
  document.addEventListener('pointerup', endSteps); document.addEventListener('pointercancel', endSteps);
  window.addEventListener('dragenter', e => { if (hasType(e.dataTransfer, 'Files')) { dragDepth++; $('#dropOverlay').hidden = false; } });
  window.addEventListener('dragleave', e => { if (hasType(e.dataTransfer, 'Files')) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) hideDrop(); } });
  window.addEventListener('dragover', e => { if (hasType(e.dataTransfer, 'Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('drop', e => { hideDrop(); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } });
  const onWide = () => { if (isWide() && ui.tab === 'library') ui.tab = 'rack'; render(); renderLib(); };
  if (wideMQ.addEventListener) wideMQ.addEventListener('change', onWide); else if (wideMQ.addListener) wideMQ.addListener(onWide);
  window.addEventListener('pagehide', () => scheduleSave.flush());
}
async function boot() {
  try { applyTheme(localStorage.getItem('th.theme') || 'prism', localStorage.getItem('th.multi') !== '0', true); } catch (e) { applyTheme('prism', true, true); }
  for (const m of BUILTIN_PLUGINS) { const man = validatePlugin(m); man.id = m.id; plugins.set(m.id, { id: m.id, manifest: man, source: null, builtin: true }); }
  try { const t = localStorage.getItem('th.tab'); if (t && TABS.some(x => x[0] === t)) ui.tab = t; ui.guide = localStorage.getItem('th.guide') !== '0'; } catch (e) { /* ok */ }
  loadRecPrefs();
  $('#tipsBtn').setAttribute('aria-pressed', String(ui.guide));
  project = demoProject();
  bindChrome(); autoMode(); render(); renderLib();
  requestAnimationFrame(frame);
  try {
    const [pls, samples, cur] = await Promise.all([Store.all('plugins'), Store.all('samples'), Store.get('meta', 'current')]);
    for (const rec of pls || []) {
      try { const man = rec.source ? parseScriptPlugin(rec.source) : validatePlugin(rec.manifest); man.id = rec.id; plugins.set(rec.id, { id: rec.id, manifest: man, source: rec.source || null, builtin: false }); }
      catch (e) { console.warn('Skipped a stored plugin', rec.id, e); }
    }
    for (const s of samples || []) lib.set(s.id, s);
    let loaded = false;
    if (cur && cur.value) {
      const rec = await Store.get('projects', cur.value);
      if (rec) { try { project = normalizeProject(JSON.parse(rec.data)); loaded = true; } catch (e) { toast('Your last project couldn’t be opened, so the demo is loaded instead.', { kind: 'error' }); } }
    }
    if (!loaded) await saveProject();
    setSaveState(Store.durable ? 'Saved' : 'Not saved · storage blocked');
    if (engine) { engine.build(); engine.prepare(project); }
    autoMode(); render(); renderLib();
  } catch (e) { console.warn(e); setSaveState('Storage unavailable'); }
  seedFactory();
  if (STANDALONE) downloads = browserDownloads();
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(d => { downloads = d || null; if (downloads) { renderLib(); if (ui.tab === 'plugins') renderView(); } }).catch(() => {});
    window.claude.use('sample').then(f => { sampleFn = f || null; sampleState = f ? 'ready' : 'none'; refreshIdeas(); }).catch(() => { sampleState = 'none'; refreshIdeas(); });
  } else sampleState = 'none';
}
