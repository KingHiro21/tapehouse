/* =====================================================================
   Part 3: music theory, idea generators, Claude co-producer, mix check,
   song sections, command palette, tips
   ===================================================================== */
const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = {
  major: { label: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: 'dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: 'phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { label: 'lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: 'mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  harmonic: { label: 'harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  pentmin: { label: 'minor pentatonic', steps: [0, 3, 5, 7, 10] },
  pentmaj: { label: 'major pentatonic', steps: [0, 2, 4, 7, 9] },
  blues: { label: 'blues', steps: [0, 3, 5, 6, 7, 10] },
  chromatic: { label: 'any notes', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};
const PROGRESSIONS = [
  { id: 'dark', label: 'Dark', degs: [0, 5, 2, 6] },
  { id: 'pop', label: 'Uplifting', degs: [0, 4, 5, 3] },
  { id: 'dreamy', label: 'Dreamy', degs: [5, 3, 0, 4] },
  { id: 'sad', label: 'Bittersweet', degs: [0, 3, 6, 2] },
  { id: 'tension', label: 'Tension', degs: [0, 3, 4, 4] },
  { id: 'smooth', label: 'Smooth', degs: [1, 4, 0, 0] },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const scaleOf = P => SCALES[P.scale] || SCALES.minor;
const keyLabel = P => `${KEY_NAMES[P.key]} ${scaleOf(P).label}`;
const pcOf = (P, n) => (((n - P.key) % 12) + 12) % 12;
const inKey = (P, n) => scaleOf(P).steps.includes(pcOf(P, n));
function snapToKey(P, n, dir = 0) {
  if (P.scale === 'chromatic') return n;
  for (let d = 0; d < 12; d++) { if (dir >= 0 && inKey(P, n + d)) return n + d; if (dir <= 0 && inKey(P, n - d)) return n - d; }
  return n;
}
function chordNotes(P, d, seventh) {
  const st = scaleOf(P).steps, L = st.length;
  const tone = k => P.key + st[(d + k) % L] + 12 * Math.floor((d + k) / L);
  return (seventh ? [0, 2, 4, 6] : [0, 2, 4]).map(k => { let n = 48 + tone(k); while (n < 55) n += 12; while (n > 70) n -= 12; return n; }).sort((a, b) => a - b);
}
function chordInfo(P, d) {
  const st = scaleOf(P).steps, L = st.length;
  const at = k => st[(d + k) % L] + 12 * Math.floor((d + k) / L);
  const root = (P.key + st[d % L]) % 12, third = at(2) - at(0), fifth = at(4) - at(0);
  let q = '', rn = ROMAN[d % 7] || String(d + 1);
  if (L === 7) {
    if (third === 3 && fifth === 7) { q = 'm'; rn = rn.toLowerCase(); }
    else if (third === 3 && fifth === 6) { q = '°'; rn = rn.toLowerCase() + '°'; }
    else if (third === 4 && fifth === 8) { q = '+'; rn += '+'; }
  }
  return { name: KEY_NAMES[root] + q, roman: rn };
}
const rnd = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const progDegs = () => (PROGRESSIONS.find(p => p.id === ui.ideaProg) || PROGRESSIONS[0]).degs;
function tile(notes, srcLen, dstLen) {
  const out = [];
  for (let off = 0; off < dstLen; off += srcLen) for (const n of notes) if (off + n.s < dstLen) out.push({ ...n, s: off + n.s, l: Math.min(n.l, dstLen - off - n.s) });
  return out;
}
const to808 = n => { const pc = ((n % 12) + 12) % 12; return pc <= 6 ? 60 + pc : 48 + pc; };

/* ---------- generators ---------- */
function genChordNotes(P, degs, rhythm) {
  const hitsFor = { stabs: [[2, 2], [6, 2], [10, 2], [14, 2]], pulse: [[0, 3], [4, 3], [8, 3], [12, 3]], syncop: [[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]], sustain: [[0, 16]] };
  const out = [];
  degs.forEach((d, b) => { const notes = chordNotes(P, d); for (const [s, l] of hitsFor[rhythm] || hitsFor.sustain) for (const n of notes) out.push({ s: b * 16 + s, l, n, v: 0.72 }); });
  return out;
}
function genBass(P, degs, style, kickSteps) {
  const st = scaleOf(P).steps, out = [];
  degs.forEach((d, b) => {
    const r = 36 + ((P.key + st[d % st.length]) % 12), o = b * 16;
    if (style === 'offbeat') [2, 6, 10, 14].forEach(s => out.push({ s: o + s, l: 2, n: r, v: 0.85 }));
    else if (style === 'follow') {
      const ks = kickSteps && kickSteps.length ? kickSteps : [0, 8];
      ks.forEach((s, i) => out.push({ s: o + s, l: Math.max(1, Math.min((ks[i + 1] ?? 16) - s, 8)), n: r, v: 0.9 }));
    } else if (style === 'driving') for (let s = 0; s < 16; s += 2) out.push({ s: o + s, l: 2, n: (s === 6 || s === 14) && chance(0.5) ? r + 12 : r, v: s % 4 === 0 ? 0.9 : 0.72 });
    else if (style === 'acid') [[0, 2, 0], [3, 1, 0], [6, 1, 12], [8, 2, 0], [11, 1, 12], [12, 2, 0], [14, 1, 7]].forEach(([s, l, x]) => out.push({ s: o + s, l, n: snapToKey(P, r + x), v: 0.85 }));
    else { out.push({ s: o, l: 6, n: r, v: 0.9 }, { s: o + 8, l: 3, n: r, v: 0.78 }); out.push({ s: o + 12, l: 2, n: chance(0.5) ? r + 12 : r, v: 0.7 }, { s: o + 14, l: 2, n: snapToKey(P, r + 7), v: 0.65 }); }
  });
  return out;
}
function genMelody(P, degs, lift = 0) {
  const rhythms = [[0, 3, 6, 8, 10, 12, 14], [0, 2, 4, 7, 10, 12], [0, 4, 6, 8, 12, 14], [0, 3, 6, 10, 12], [2, 4, 6, 10, 12, 14]];
  const pool = []; for (let n = 62 + lift; n <= 79 + lift; n++) if (inKey(P, n)) pool.push(n);
  let cur = pool[Math.floor(pool.length / 2)];
  const bar = (b, motif) => {
    const chord = chordNotes(P, degs[b % degs.length]).map(n => n % 12), out = [];
    motif.forEach((s, i) => {
      const strong = s % 4 === 0;
      let c = pool.filter(n => Math.abs(n - cur) <= (strong ? 7 : 4));
      if (strong) { const ct = c.filter(n => chord.includes(n % 12)); if (ct.length) c = ct; }
      c.sort((a, z) => Math.abs(a - cur) - Math.abs(z - cur));
      if (c.length) cur = c[Math.min(c.length - 1, Math.floor(Math.random() * Math.min(3, c.length)))];
      out.push({ s: b * 16 + s, l: Math.max(1, Math.min((motif[i + 1] ?? 16) - s, 4)), n: cur, v: strong ? 0.85 : 0.68 });
    });
    return out;
  };
  const motif = rnd(rhythms), b0 = bar(0, motif), b1 = bar(1, motif);
  const b2 = b0.map(n => ({ ...n, s: n.s + 32 })), b3 = bar(3, motif.slice(0, Math.max(2, motif.length - 2)));
  const last = b3[b3.length - 1], root = chordNotes(P, degs[3 % degs.length])[0] % 12;
  if (last) { let best = last.n; for (let n = last.n - 6; n <= last.n + 6; n++) if (n % 12 === root) { best = n; break; } last.n = best; last.l = Math.max(last.l, 4); }
  return [...b0, ...b1, ...b2, ...b3].filter(n => n.s < 64).map(n => ({ ...n, l: Math.min(n.l, 64 - n.s) }));
}
const STYLES = {
  house: { label: 'House', bpm: 124, swing: 0.08, scale: 'minor', keys: [9, 2, 5, 7], progs: ['dark', 'dreamy', 'pop'], chords: { plugin: 'th.tape-keys', rhythm: 'stabs' }, pad: true,
    bass: { plugin: 'th.acid-bass', style: 'offbeat' }, lead: 'th.glass-pluck',
    drums: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], openhat: [2, 6, 10, 14], shaker: [3, 7, 11, 15] } },
  trap: { label: 'Trap', bpm: 140, swing: 0, scale: 'minor', keys: [1, 4, 6, 11], progs: ['dark', 'tension', 'sad'], chords: { plugin: 'th.sunset-pad', rhythm: 'sustain' },
    bass: { drum: '808', style: 'follow' }, lead: 'th.glass-pluck', rolls: true,
    drums: { kick: [0, 7, 10], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [11] } },
  hiphop: { label: 'Boom-bap', bpm: 90, swing: 0.3, scale: 'minor', keys: [2, 7, 0], progs: ['smooth', 'dark', 'sad'], chords: { plugin: 'th.tape-keys', rhythm: 'syncop' },
    bass: { plugin: 'th.sub-bass', style: 'simple' }, lead: 'th.tape-keys',
    drums: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] } },
  lofi: { label: 'Lo-fi', bpm: 80, swing: 0.4, scale: 'dorian', keys: [2, 5, 9], progs: ['smooth', 'dreamy'], chords: { plugin: 'th.tape-keys', rhythm: 'syncop' },
    bass: { plugin: 'th.sub-bass', style: 'simple' }, lead: 'th.glass-pluck', lofi: true,
    drums: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], shaker: [3, 11] } },
  dnb: { label: 'Drum & Bass', bpm: 172, swing: 0, scale: 'minor', keys: [4, 9, 2], progs: ['dark', 'tension'], chords: { plugin: 'th.sunset-pad', rhythm: 'sustain' },
    bass: { plugin: 'th.sub-bass', style: 'simple' }, lead: 'th.square-lead',
    drums: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], shaker: [1, 5, 9, 13] } },
  pop: { label: 'Pop', bpm: 112, swing: 0, scale: 'major', keys: [0, 7, 2, 9], progs: ['pop', 'dreamy'], chords: { plugin: 'th.tape-keys', rhythm: 'pulse' }, pad: true,
    bass: { plugin: 'th.sub-bass', style: 'driving' }, lead: 'th.square-lead',
    drums: { kick: [0, 8, 10], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] } },
  reggaeton: { label: 'Reggaeton', bpm: 96, swing: 0, scale: 'minor', keys: [9, 4, 7], progs: ['dark', 'pop'], chords: { plugin: 'th.glass-pluck', rhythm: 'stabs' },
    bass: { plugin: 'th.sub-bass', style: 'follow' }, lead: 'th.square-lead',
    drums: { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14] } },
  synthwave: { label: 'Synthwave', bpm: 100, swing: 0, scale: 'minor', keys: [9, 4, 2], progs: ['dark', 'dreamy'], chords: { plugin: 'th.sunset-pad', rhythm: 'sustain' },
    bass: { plugin: 'th.acid-bass', style: 'driving', params: { cutoff: 700, resonance: 3, envmod: 1200 } }, lead: 'th.square-lead',
    drums: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] } },
};
const DRUM_VOL = { kick: 0.95, snare: 0.75, clap: 0.72, hat: 0.5, openhat: 0.42, shaker: 0.42, perc: 0.5, tom: 0.6, '808': 0.85 };
function drumSteps(S, len = 32) {
  const out = {};
  for (const [k, hits] of Object.entries(S.drums)) {
    const a = new Array(len).fill(0);
    for (let b = 0; b < len / 16; b++) for (const s of hits) a[b * 16 + s] = k === 'hat' ? (s % 4 === 0 ? 0.62 : s % 2 === 0 ? 0.5 : 0.36) : k === 'kick' ? 0.95 : 0.82;
    out[k] = a;
  }
  if (out.kick && chance(0.6)) { const s = 16 + rnd([3, 11, 13, 14]); if (!out.kick[s]) out.kick[s] = 0.7; }
  if (S.rolls && out.hat) { for (const s of rnd([[13, 15], [5, 7, 13, 15], [9, 11]])) out.hat[s] = 0.4; for (let s = 28; s < 32; s++) out.hat[s] = 0.35 + Math.random() * 0.3; }
  if (out.hat) out.hat = out.hat.map(v => v ? Math.round(clamp(v + (Math.random() - 0.5) * 0.12, 0.2, 1) * 100) / 100 : 0);
  if (out.snare && chance(0.4)) out.snare[31] = 0.45;
  return out;
}
function drumCh(P, kind) {
  return P.channels.find(c => c.kind === 'drum' && c.drum === kind) ||
    makeChannel(P, { name: DRUMS.find(d => d[0] === kind)[1], kind: 'drum', drum: kind, vol: DRUM_VOL[kind] ?? 0.75 });
}
function synthCh(P, plugin, name) {
  return P.channels.find(c => c.kind === 'synth' && c.name === name) || makeChannel(P, { name, kind: 'synth', plugin, vol: 0.65 });
}
const addFxTo = (P, ch, list) => { if (ch && ch.insert > 0) P.mixer[ch.insert].fx.push(...list.map(([id, params]) => fxSlot(id, params))); };
function buildStyleSong(id) {
  const S = STYLES[id], P = newProject(`${S.label} idea`);
  P.mixer = newMixer(0); P.bpm = S.bpm; P.swing = S.swing; P.key = rnd(S.keys); P.scale = S.scale; P.playlist.tracks = [];
  const progId = rnd(S.progs), prog = (PROGRESSIONS.find(p => p.id === progId) || PROGRESSIONS[0]).degs;
  ui.ideaProg = progId; ui.ideaStyle = id;
  const steps = drumSteps(S, 32), drums = { ...newPattern(0, 32), name: 'Drums', color: COLORS[0] }, chs = {};
  for (const k of Object.keys(steps)) { chs[k] = drumCh(P, k); drums.steps[chs[k].id] = steps[k]; }
  const bassP = { ...newPattern(1, 64), name: 'Bass', color: COLORS[1] };
  let bassCh;
  if (S.bass.drum === '808') { bassCh = drumCh(P, '808'); bassCh.params = { decay: 0.9 }; bassP.notes[bassCh.id] = genBass(P, prog, 'follow', S.drums.kick).map(n => ({ ...n, n: to808(n.n) })); }
  else { bassCh = synthCh(P, S.bass.plugin, 'Bass'); bassCh.vol = 0.75; if (S.bass.params) bassCh.params = { ...S.bass.params }; bassP.notes[bassCh.id] = genBass(P, prog, S.bass.style, S.drums.kick); }
  if (chs.kick) bassCh.duck = { by: chs.kick.id, amount: 0.55 };
  const chordP = { ...newPattern(2, 64), name: 'Chords', color: COLORS[3] };
  const chordCh = synthCh(P, S.chords.plugin, 'Chords'); chordCh.vol = 0.6;
  chordP.notes[chordCh.id] = genChordNotes(P, prog, S.chords.rhythm);
  let padCh = null;
  if (S.pad && S.chords.plugin !== 'th.sunset-pad') { padCh = synthCh(P, 'th.sunset-pad', 'Pad'); padCh.vol = 0.42; chordP.notes[padCh.id] = genChordNotes(P, prog, 'sustain'); }
  const melP = { ...newPattern(3, 64), name: 'Melody', color: COLORS[5] };
  const leadCh = synthCh(P, S.lead, 'Melody'); leadCh.vol = 0.5;
  melP.notes[leadCh.id] = genMelody(P, prog);
  P.mixer[0].vol = 0.7;
  P.mixer[0].fx = [fxSlot('th.glue-comp', { threshold: -14, ratio: 2.5, makeup: 2 })];
  ['hat', 'openhat', 'shaker'].forEach(k => addFxTo(P, chs[k], [['th.eq3', { low: -12 }]]));
  addFxTo(P, chordCh, S.chords.plugin === 'th.sunset-pad' ? [['th.room-reverb', { size: 4, mix: 0.35 }]] : [['th.tape-delay', { time: 0.75, mix: 0.16 }], ['th.room-reverb', { size: 2.4, mix: 0.25 }]]);
  addFxTo(P, padCh, [['th.chorus', { mix: 0.35 }], ['th.room-reverb', { size: 4.5, mix: 0.4 }]]);
  addFxTo(P, leadCh, [['th.tape-delay', { time: rnd([0.5, 0.75]), mix: 0.22 }], ['th.room-reverb', { size: 2.8, mix: 0.25 }]]);
  if (S.lofi) { addFxTo(P, chordCh, [['th.bitcrusher', { bits: 9, mix: 0.25 }]]); P.mixer[0].fx.unshift(fxSlot('th.saturator', { drive: 0.3, tone: 6000, mix: 0.6, output: -2 })); }
  P.patterns = [drums, bassP, chordP, melP]; P.currentPattern = drums.id;
  autoArrange(P);
  return P;
}
const hearIt = { label: 'Hear it', run: () => { setMode('pattern'); if (!T.playing) play(); } };
async function startStyleSong(id) {
  await openProjectObject(buildStyleSong(id));
  T.mode = 'song'; renderTransport(); setTab('playlist');
  toast(`New ${STYLES[id].label} song in ${keyLabel(project)}. Change anything you like.`, { action: { label: 'Play', run: () => { if (!T.playing) play(); } } });
}
function ideaDrums() {
  const S = STYLES[ui.ideaStyle] || STYLES.house, pat = curPattern();
  mutate(P => {
    if (pat.length < 32) setPatternLength(pat, 32);
    for (const [k, a] of Object.entries(drumSteps(S, 32))) { const arr = ensureSteps(pat, drumCh(P, k).id); for (let i = 0; i < pat.length; i++) arr[i] = a[i % 32]; }
  });
  setTab('rack'); toast(`${S.label} drums are in “${pat.name}”.`, { action: hearIt });
}
function ideaChords() {
  const S = STYLES[ui.ideaStyle] || STYLES.house, pat = curPattern();
  mutate(P => {
    if (pat.length < 64) setPatternLength(pat, 64);
    const ch = synthCh(P, S.chords.plugin, 'Chords');
    pat.notes[ch.id] = tile(genChordNotes(P, progDegs(), S.chords.rhythm), 64, pat.length); ui.prCh = ch.id; ui.selCh = ch.id;
  });
  setTab('piano'); toast(`Chords in ${keyLabel(project)} are in “${pat.name}”.`, { action: hearIt });
}
function ideaBass() {
  const S = STYLES[ui.ideaStyle] || STYLES.house, pat = curPattern();
  mutate(P => {
    if (pat.length < 64) setPatternLength(pat, 64);
    const kick = P.channels.find(c => c.kind === 'drum' && c.drum === 'kick');
    const ks = kick && pat.steps[kick.id] ? pat.steps[kick.id].slice(0, 16).map((v, i) => (v ? i : -1)).filter(i => i >= 0) : S.drums.kick;
    let ch, notes = genBass(P, progDegs(), S.bass.style, ks);
    if (S.bass.drum === '808') { ch = drumCh(P, '808'); notes = notes.map(n => ({ ...n, n: to808(n.n) })); }
    else { ch = synthCh(P, S.bass.plugin, 'Bass'); if (S.bass.params && !Object.keys(ch.params).length) ch.params = { ...S.bass.params }; }
    if (kick && !ch.duck) ch.duck = { by: kick.id, amount: 0.5 };
    pat.notes[ch.id] = tile(notes, 64, pat.length); ui.prCh = ch.id; ui.selCh = ch.id;
  });
  setTab('piano'); toast(`A bassline that follows the chords is in “${pat.name}”.`, { action: hearIt });
}
function ideaMelody() {
  const S = STYLES[ui.ideaStyle] || STYLES.house, pat = curPattern();
  mutate(P => {
    if (pat.length < 64) setPatternLength(pat, 64);
    const ch = synthCh(P, S.lead, 'Melody');
    pat.notes[ch.id] = tile(genMelody(P, progDegs()), 64, pat.length); ui.prCh = ch.id; ui.selCh = ch.id;
  });
  setTab('piano'); toast(`A melody in ${keyLabel(project)} is in “${pat.name}”. Try it again for a different one.`, { action: hearIt });
}

/* ---------- auto-arrange & song sections ---------- */
const SECTION_PLAN = [['Intro', 4, ['chords']], ['Verse', 8, ['chords', 'drums', 'bass', 'mixed']], ['Build', 4, ['chords', 'drums', 'melody', 'mixed']],
  ['Chorus', 8, ['chords', 'drums', 'bass', 'melody', 'mixed']], ['Break', 4, ['chords', 'melody']], ['Chorus', 8, ['chords', 'drums', 'bass', 'melody', 'mixed']], ['Outro', 4, ['chords', 'drums']]];
function patternRole(P, pat) {
  let steps = false; const ns = [];
  for (const ch of P.channels) {
    if ((pat.steps[ch.id] || []).some(Boolean)) steps = true;
    for (const n of pat.notes[ch.id] || []) if (!(ch.kind === 'drum' && ch.drum !== '808')) ns.push({ ...n, b808: ch.kind === 'drum' });
    else steps = true;
  }
  if (!steps && !ns.length) return null;
  if (!ns.length) return 'drums';
  if (steps) return 'mixed';
  if (ns.some(n => n.b808) || ns.reduce((a, n) => a + n.n, 0) / ns.length < 52) return 'bass';
  const starts = {}; for (const n of ns) starts[n.s] = (starts[n.s] || 0) + 1;
  return Object.values(starts).some(c => c >= 3) ? 'chords' : 'melody';
}
function autoArrange(P) {
  const used = P.patterns.map(p => ({ p, role: patternRole(P, p) })).filter(x => x.role);
  if (!used.length) return false;
  P.playlist.clips = []; P.playlist.markers = [];
  P.playlist.tracks = used.map(u => newTrack(0, u.p.name.slice(0, 24)));
  while (P.playlist.tracks.length < 6) P.playlist.tracks.push(newTrack(P.playlist.tracks.length));
  let bar = 0;
  for (const [name, bars, roles] of SECTION_PLAN) {
    let pick = used.filter(u => roles.includes(u.role));
    for (const fb of [['melody'], ['mixed'], ['drums']]) if (!pick.length) pick = used.filter(u => fb.includes(u.role));
    if (!pick.length) pick = used;
    P.playlist.markers.push({ id: uid(), start: bar * 16, name });
    for (const u of pick) P.playlist.clips.push({ id: uid(), kind: 'pattern', ref: u.p.id, track: used.indexOf(u), start: bar * 16, len: bars * 16, gain: 1, offset: 0 });
    bar += bars;
  }
  return true;
}
function autoArrangeCurrent() {
  if (!project.patterns.some(p => patternRole(project, p))) { toast('Your patterns are empty. Make a beat or some notes first, or use Ideas.'); return; }
  const had = project.playlist.clips.length;
  mutate(P => autoArrange(P));
  T.mode = 'song'; T.songPos = T.marker = 0; renderTransport(); setTab('playlist');
  toast(`Built a ${songLength(project) / 16}-bar song from your patterns.${had ? ' Undo brings back your old arrangement.' : ''}`, { action: { label: 'Play', run: () => { if (!T.playing) play(); } } });
}
function addSection() {
  const names = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Drop', 'Break', 'Outro'];
  mutate(P => {
    const mk = { id: uid(), start: T.songPos, name: names[P.playlist.markers.length % names.length] };
    P.playlist.markers = P.playlist.markers.filter(m => m.start !== mk.start).concat(mk).sort((a, b) => a.start - b.start);
    ui.plMark = mk.id; ui.plSel = null;
  });
}
function markerInspector(mk) {
  return el('div', { class: 'pl-insp' },
    el('span', { class: 'lbl' }, 'Section'),
    el('input', { type: 'text', value: mk.name, 'aria-label': 'Section name', style: { width: '140px' }, onchange: e => mutate(() => { mk.name = e.target.value.trim().slice(0, 24) || mk.name; }) }),
    el('span', { class: 'pos' }, `Starts at bar ${Math.floor(mk.start / 16) + 1}`),
    el('textarea', { class: 'mk-lyrics', rows: '3', 'aria-label': `Lyrics for ${mk.name}`, placeholder: 'Words for this section (they show on the Create tab while the song plays)', value: mk.lyrics || '', onchange: e => mutate(() => { mk.lyrics = e.target.value.slice(0, 1500); }, { render: false }) }),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn sm', onclick: () => { T.songPos = T.marker = mk.start; setMode('song'); if (!T.playing) play(); } }, 'Play from here'),
      el('button', { class: 'btn sm danger', onclick: () => mutate(P => { P.playlist.markers = P.playlist.markers.filter(x => x.id !== mk.id); ui.plMark = null; }) }, 'Delete'),
      el('button', { class: 'btn sm icon ghost', 'aria-label': 'Close section details', onclick: () => { ui.plMark = null; renderView(); } }, icon('x'))));
}

/* ---------- key ---------- */
function setKey(root, scale) {
  const old = project.key;
  mutate(P => { P.key = root; P.scale = scale; P.keySet = true; }); // set by hand: Smart key won't move it any more
  const moved = project.patterns.some(pt => project.channels.some(c => (c.kind !== 'drum' || c.drum === '808') && (pt.notes[c.id] || []).length));
  if (root !== old && moved) {
    let d = ((root - old) % 12 + 12) % 12; if (d > 6) d -= 12;
    toast(`Key is now ${keyLabel(project)}.`, { action: { label: `Move my notes ${d > 0 ? 'up' : 'down'} ${Math.abs(d)}`, run: () => transposeAll(d) } });
  }
}
function transposeAll(d) {
  mutate(P => { for (const pt of P.patterns) for (const c of P.channels) { if (c.kind === 'drum' && c.drum !== '808') continue; (pt.notes[c.id] || []).forEach(n => { n.n = clamp(n.n + d, 0, 127); }); } });
  toast('Your notes moved into the new key.');
}
const keySnap = (n, dir = 0) => (ui.prSnapKey && project.scale !== 'chromatic') ? clamp(snapToKey(project, n, dir), PR.lo, PR.hi) : n;
function chordBar(ch, pat) {
  const P = project, bar = el('div', { class: 'chordbar' });
  if (scaleOf(P).steps.length !== 7) { bar.append(el('span', { class: 'hint' }, `Chord buttons need a 7-note scale, and ${keyLabel(P)} has ${scaleOf(P).steps.length}. Pick major or minor in the key menu.`)); return bar; }
  bar.append(el('span', { class: 'lbl' }, `Chords in ${keyLabel(P)}`));
  for (let d = 0; d < 7; d++) { const info = chordInfo(P, d); bar.append(el('button', { class: 'chord', title: `Add ${info.name} at the cursor line`, onclick: () => stampChord(ch, pat, d) }, el('b', {}, info.name), el('small', {}, info.roman))); }
  bar.append(el('span', { class: 'spacer' }),
    el('select', { 'aria-label': 'Chord progression', value: ui.ideaProg, onchange: e => { ui.ideaProg = e.target.value; } }, PROGRESSIONS.map(p => el('option', { value: p.id }, `${p.label} · ${p.degs.map(x => chordInfo(P, x).name).join(' ')}`))),
    el('button', { class: 'btn sm', onclick: () => mutate(() => { if (pat.length < 64) setPatternLength(pat, 64); pat.notes[ch.id] = tile(genChordNotes(P, progDegs(), 'sustain'), 64, pat.length); ui.prCursor = 0; ui.prSel = null; }) }, 'Fill 4 bars'));
  return bar;
}
function stampChord(ch, pat, d) {
  const s = clamp(ui.prCursor || 0, 0, pat.length - 1), l = Math.max(1, Math.min(ui.prLen, pat.length - s));
  const notes = chordNotes(project, d);
  pushUndo();
  const arr = pat.notes[ch.id] || (pat.notes[ch.id] = []);
  for (const n of notes) if (!arr.some(x => x.s === s && x.n === n)) arr.push({ s, l, n, v: 0.75 });
  ui.prCursor = Math.min(pat.length - 1, s + l);
  changed({ render: false });
  if (ensureCtx()) notes.forEach(n => engine.trigger(ch, ctx.currentTime + 0.005, n, 0.7, 0.45, false));
  drawPiano();
}
function duckRow(ch) {
  const others = project.channels.filter(c => c.id !== ch.id);
  const row = el('div', { class: 'btn-row' }, el('span', { class: 'lbl' }, 'Duck under'),
    el('select', { 'aria-label': 'Turn this sound down whenever another sound hits', value: ch.duck ? ch.duck.by : '', onchange: e => mutate(() => { if (e.target.value) ch.duck = { by: e.target.value, amount: ch.duck ? ch.duck.amount : 0.5 }; else delete ch.duck; }) },
      el('option', { value: '' }, 'Nothing'), others.map(c => el('option', { value: c.id }, c.name))));
  if (ch.duck) row.append(knob({ mini: true, value: ch.duck.amount, min: 0.05, max: 0.95, def: 0.5, label: 'How much to duck', fmt: v => Math.round(v * 100) + '%', color: soundColor(ch.color), onStart: pushUndo, onInput: v => { ch.duck.amount = v; }, onEnd: () => changed({ render: false }) }));
  row.append(el('span', { class: 'hint' }, 'Dips this sound each time the other one hits so they don’t fight. Producers call it sidechain.'));
  return row;
}
function setMode(m) {
  if (T.mode === m) return;
  const was = T.playing; if (was) halt();
  T.mode = m; renderTransport(); renderView(); if (was) play();
}

/* ---------- sheets ---------- */
let sheetReturn = null;
function openSheet(nodes, cls) {
  if ($('#sheet').hidden) sheetReturn = document.activeElement;
  const card = $('#sheet .sheet-card'); card.className = 'sheet-card' + (cls ? ' ' + cls : ''); card.replaceChildren(...nodes.filter(Boolean));
  $('#sheet').hidden = false; card.scrollTop = 0;
}
function closeSheet() { $('#sheet').hidden = true; if (sheetReturn && sheetReturn.isConnected && sheetReturn.focus) sheetReturn.focus(); }
const sheetHead = title => el('div', { class: 'sheet-head' }, el('h2', { id: 'sheetTitle' }, title), el('button', { class: 'btn icon ghost', 'aria-label': 'Close', onclick: closeSheet }, icon('x')));

/* ---------- tips ---------- */
const TIPS = {
  create: 'Describe a song or tap a few styles, then press Create. You get two takes; keep the one you like and it opens in the studio, ready to change in Beat, Notes, Song and Mix.',
  rack: 'Each row is a sound and each square is a 16th note. Tap squares to build a beat, then pick a row to shape its sound underneath. Stuck? Ideas writes drums, chords, a bassline or a melody for you.',
  piano: 'Write melodies and chords here. Lit rows are in your song’s key, so whatever you draw on them fits. Chord buttons drop a whole chord at the cursor line.',
  playlist: 'Arrange patterns into a song from left to right: pick a pattern at the top and tap an empty lane, or press Arrange for me. Automate adds fades and filter sweeps. To sing over it, press Record at the top; your takes land on the Vocal track.',
  mixer: 'Every sound gets its own channel here automatically. Add effects like reverb or EQ, run Check my mix to catch problems, then pick a Mastering level to make it release-loud. Vocal sounds are set on the Vocal screen.',
  library: 'Your sounds live here. Import files, then drag a sound into Beat to play it or into Song to place it.',
  plugins: 'Instruments and effects. Install a plugin file, or write your own below and install it in one click.',
};
function tipStrip(id) {
  const text = TIPS[id];
  if (!ui.guide || !text) return null;
  return el('div', { class: 'tip' }, el('span', { class: 'tip-k' }, 'Tip'), el('p', {}, text), el('button', { class: 'btn sm ghost', onclick: () => toggleGuide(false) }, 'Hide tips'));
}
function toggleGuide(on) {
  ui.guide = on == null ? !ui.guide : on;
  try { localStorage.setItem('th.guide', ui.guide ? '1' : '0'); } catch (e) { /* ok */ }
  $('#tipsBtn').setAttribute('aria-pressed', String(ui.guide));
  renderView(); if (isWide()) renderLibrary($('#libRail'));
}

/* ---------- Claude co-producer ---------- */
let sampleFn = null, askCtl = null, sampleState = 'checking';
function refreshIdeas() { const card = $('#sheet .sheet-card'); if (!$('#sheet').hidden && card.classList.contains('ideas')) openIdeas(false); }
const SAMPLE_ERR = {
  not_granted: 'Claude access was declined for this page. You can allow it from the page’s permissions menu.',
  rate_limited: 'You’ve reached a usage limit for now. Try again in a little while.',
  invalid_json: 'Claude’s answer came back in a form I couldn’t read. Try again, or describe it a little differently.',
  refused: 'Claude declined that one. Try describing it differently.',
  cancelled: 'Stopped.',
  prompt_too_large: 'That description is too long. Shorten it and try again.',
  sampling_disabled: 'Asking Claude is turned off for this account.',
};
const AI_INST = { 'tape-keys': 'th.tape-keys', 'sunset-pad': 'th.sunset-pad', 'acid-bass': 'th.acid-bass', 'sub-bass': 'th.sub-bass', 'square-lead': 'th.square-lead', 'glass-pluck': 'th.glass-pluck' };
function aiPrompt(text) {
  const P = project;
  return `You write one pattern for a step-sequencer music app.
Request: ${JSON.stringify(text.slice(0, 600))}
Song: ${P.bpm} BPM, key ${keyLabel(P)}. The grid has 16 steps per bar; one step is a 16th note. A pattern is 16, 32 or 64 steps long (1, 2 or 4 bars).
Drum sounds: kick, snare, clap, hat, openhat, shaker, perc, tom, 808 (a pitched 808 bass that takes notes).
Instruments: tape-keys (electric piano), sunset-pad (warm pad), acid-bass (squelchy bass), sub-bass (clean sub bass), square-lead (bright lead), glass-pluck (short pluck).
Reply with only JSON in this shape:
{"name":"Short name","length":64,"bpm":140,"drums":{"kick":[0,7,10,16,23,26],"clap":[8,24],"hat":[{"s":0,"v":0.6},{"s":2,"v":0.4}],"808":[{"s":0,"l":6,"n":37}]},"parts":[{"name":"Piano","instrument":"tape-keys","notes":[{"s":0,"l":16,"n":61,"v":0.7}]}]}
Rules: write every bar out across the full length. Drum entries are step numbers or {"s":step,"v":velocity}. Notes use s = start step, l = length in steps, n = MIDI note (60 is middle C, keep 28-96), v = velocity 0.1-1. Keep notes in the key unless the request says otherwise. Include "bpm" only if the request clearly wants a different tempo. At most 6 parts.`;
}
function applyAiPattern(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Claude sent back something I couldn’t use. Try again.');
  const len = clamp(Math.round((+d.length || 64) / 16) * 16, 16, 256);
  const toNote = x => (x && Number.isFinite(+x.s) && Number.isFinite(+x.n) && +x.s >= 0 && +x.s < len) ? { s: Math.floor(+x.s), l: clamp(Math.round(+x.l || 2), 1, len - Math.floor(+x.s)), n: clamp(Math.round(+x.n), 24, 108), v: clamp(+x.v || 0.8, 0.1, 1) } : null;
  const drumIn = Object.entries(d.drums && typeof d.drums === 'object' ? d.drums : {}).filter(([k, h]) => DRUMS.some(x => x[0] === k) && Array.isArray(h) && h.length);
  const partIn = (Array.isArray(d.parts) ? d.parts : []).slice(0, 6).map(p => ({ p, ns: (Array.isArray(p && p.notes) ? p.notes : []).slice(0, 2000).map(toNote).filter(Boolean) })).filter(x => x.ns.length);
  if (!drumIn.length && !partIn.length) throw new Error('Claude’s answer had no notes or drum hits in it. Try again.');
  let name = '';
  mutate(P => {
    if (+d.bpm >= 50 && +d.bpm <= 200 && Math.abs(+d.bpm - P.bpm) >= 1) P.bpm = Math.round(+d.bpm);
    const pat = newPattern(P.patterns.length, len); pat.name = name = String(d.name || 'Claude idea').slice(0, 40);
    P.patterns.push(pat); P.currentPattern = pat.id; ui.plBrush = pat.id;
    for (const [kind, hits] of drumIn) {
      const ch = drumCh(P, kind);
      if (kind === '808') { const ns = hits.map(toNote).filter(Boolean).map(n => ({ ...n, n: to808(n.n) })); if (ns.length) pat.notes[ch.id] = ns; continue; }
      const arr = ensureSteps(pat, ch.id);
      for (const h of hits) { const st = typeof h === 'number' ? h : h && +h.s, v = h && typeof h === 'object' ? +h.v : 0.8; if (Number.isInteger(st) && st >= 0 && st < len) arr[st] = clamp(v || 0.8, 0.1, 1); }
    }
    for (const { p, ns } of partIn) { const ch = synthCh(P, AI_INST[p.instrument] || 'th.tape-keys', String(p.name || 'Part').slice(0, 32)); pat.notes[ch.id] = ns; ui.prCh = ch.id; }
  });
  if (engine) engine.refreshTempo();
  return name;
}
function pasteBlock(open) {
  const ta = el('textarea', { rows: '3', 'aria-label': 'Pattern pasted from a Claude chat', placeholder: 'Paste Claude’s whole reply here' });
  const st = el('div', { class: 'sdk-status', 'aria-live': 'polite' });
  const add = () => {
    try {
      const txt = ta.value, i = txt.indexOf('{'), j = txt.lastIndexOf('}');
      if (i < 0 || j < i) throw new Error('There’s no pattern in that text. Paste Claude’s whole reply.');
      const name = applyAiPattern(JSON.parse(txt.slice(i, j + 1)));
      closeSheet(); setTab('rack'); toast(`Added “${name}” as a new pattern.`, { action: hearIt });
    } catch (e) { st.className = 'sdk-status err'; st.textContent = e instanceof SyntaxError ? 'That pattern text is cut off or has a typo. Copy the whole reply and try again.' : e.message; }
  };
  return el('details', { class: 'paste', open: !!open },
    el('summary', {}, 'Paste a pattern from a Claude chat'),
    el('p', { class: 'muted' }, 'In any Claude chat, ask for “a Tapehouse pattern as JSON” and describe what you want. Paste the reply here and it becomes a new pattern.'),
    ta, el('div', { class: 'btn-row', style: { marginTop: '8px' } }, el('button', { class: 'btn', onclick: add }, 'Add pattern')), st);
}
function askSection() {
  const sec = el('section', { class: 'ask' }, el('h3', {}, 'Ask Claude'));
  if (sampleState === 'checking') { sec.append(el('p', { class: 'muted' }, 'Connecting to Claude…'), pasteBlock(false)); return { node: sec }; }
  if (!sampleFn) {
    sec.append(el('p', { class: 'muted' }, 'Writing patterns from a description needs Claude’s built-in helper, and this view doesn’t offer it. Open this page on claude.ai in a web browser to use it, or paste a pattern from a chat below.'), pasteBlock(true));
    return { node: sec };
  }
  const input = el('textarea', { rows: '3', 'aria-label': 'Describe the pattern you want', placeholder: 'For example: a sad trap beat with rolling hats, a deep 808 and soft piano chords', value: ui.askText || '', oninput: e => { ui.askText = e.target.value; } });
  const status = el('div', { class: 'sdk-status', 'aria-live': 'polite' });
  const stopB = el('button', { class: 'btn', hidden: true, onclick: () => { if (askCtl) askCtl.abort(); } }, 'Stop');
  const go = el('button', { class: 'btn primary', onclick: async () => {
    const text = input.value.trim();
    if (!text) { status.className = 'sdk-status err'; status.textContent = 'Describe what you want first.'; return; }
    go.disabled = true; stopB.hidden = false; status.className = 'sdk-status'; status.textContent = 'Claude is writing your pattern. This can take up to a minute.';
    askCtl = new AbortController();
    try {
      const name = applyAiPattern(await sampleFn.json(aiPrompt(text), { signal: askCtl.signal, modelTier: 'default' }));
      closeSheet(); setTab('rack');
      toast(`Claude made “${name}”. It’s your current pattern now.`, { action: hearIt });
    } catch (e) { status.className = 'sdk-status err'; status.textContent = (e && SAMPLE_ERR[e.code]) || (e && e.message) || 'Something went wrong. Try again.'; }
    finally { go.disabled = false; stopB.hidden = true; askCtl = null; }
  } }, 'Write it');
  sec.append(el('p', { class: 'muted' }, `Describe a beat or a part in plain words. Claude writes it as a new pattern in ${keyLabel(project)}, using your Claude usage.`),
    input, el('div', { class: 'btn-row', style: { marginTop: '8px' } }, go, stopB), status, pasteBlock(false));
  return { node: sec, input };
}
function openIdeas(focusAsk) {
  const P = project, pat = curPattern(), ask = askSection();
  openSheet([
    sheetHead('Ideas'),
    ask.node,
    el('section', {}, el('h3', {}, `Add to “${pat.name}”`),
      el('p', { class: 'muted' }, `Each button writes one part in ${keyLabel(P)} and replaces only that part. Press it again for a different take; Undo brings back the old one.`),
      el('div', { class: 'btn-row' },
        el('span', { class: 'lbl' }, 'Style'), el('select', { 'aria-label': 'Style', value: ui.ideaStyle, onchange: e => { ui.ideaStyle = e.target.value; } }, Object.entries(STYLES).map(([id, s]) => el('option', { value: id }, s.label))),
        el('span', { class: 'lbl' }, 'Chords'), el('select', { 'aria-label': 'Chord progression', value: ui.ideaProg, onchange: e => { ui.ideaProg = e.target.value; } }, PROGRESSIONS.map(p => el('option', { value: p.id }, `${p.label} · ${p.degs.map(x => chordInfo(P, x).name).join(' ')}`)))),
      el('div', { class: 'btn-row', style: { marginTop: '10px' } },
        el('button', { class: 'btn', onclick: () => { closeSheet(); ideaDrums(); } }, 'Drums'),
        el('button', { class: 'btn', onclick: () => { closeSheet(); ideaChords(); } }, 'Chords'),
        el('button', { class: 'btn', onclick: () => { closeSheet(); ideaBass(); } }, 'Bassline'),
        el('button', { class: 'btn', onclick: () => { closeSheet(); ideaMelody(); } }, 'Melody'))),
    el('p', { class: 'muted small ideas-more' }, 'Want a whole new song? ', el('button', { class: 'linkish', onclick: () => { closeSheet(); setTab('create'); } }, 'Create'), ' makes one from a description. To lay your patterns out as a song, use Arrange for me on ', el('button', { class: 'linkish', onclick: () => { closeSheet(); setTab('playlist'); } }, 'Song'), '.'),
  ], 'ideas');
  if (focusAsk && ask.input) ask.input.focus();
}

/* ---------- mix check ---------- */
async function filterPass(buf, frames, chain) {
  const oac = new OfflineAudioContext(buf.numberOfChannels, frames, buf.sampleRate), src = oac.createBufferSource(); src.buffer = buf;
  let n = src;
  for (const [type, f, q, gain] of chain) { const b = oac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (gain != null) b.gain.value = gain; n.connect(b); n = b; }
  n.connect(oac.destination); src.start();
  return oac.startRendering();
}
function gatedLoudness(b) {
  const sr = b.sampleRate, blk = Math.floor(sr * 0.4), hop = Math.floor(sr * 0.1), chs = [];
  for (let c = 0; c < b.numberOfChannels; c++) chs.push(b.getChannelData(c));
  const zs = [];
  for (let i = 0; i + blk <= chs[0].length; i += hop) { let z = 0; for (const d of chs) { let s = 0; for (let j = i; j < i + blk; j += 2) s += d[j] * d[j]; z += s / (blk / 2); } zs.push(z); }
  const lk = z => -0.691 + 10 * Math.log10(z + 1e-12), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  let g = zs.filter(z => lk(z) > -70); if (!g.length) return -Infinity;
  const rel = lk(mean(g)) - 10; g = g.filter(z => lk(z) > rel);
  return g.length ? lk(mean(g)) : -Infinity;
}
function usedChannels(P) {
  return P.channels.filter(c => P.patterns.some(pt => (pt.steps[c.id] || []).some(Boolean) || (pt.notes[c.id] || []).length));
}
async function runMixCheck() {
  if (ui.mixReport && ui.mixReport.busy) return;
  ui.mixReport = { busy: true }; if (ui.tab === 'mixer') renderView();
  try {
    const P = project, what = P.playlist.clips.length ? 'song' : 'pattern';
    const { buffer, frames } = await renderOffline(P, what, 22050);
    const chs = []; for (let c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
    let peak = 0, sum = 0, n = 0;
    for (const d of chs) for (let i = 0; i < frames; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (!(i & 1)) { sum += d[i] * d[i]; n++; } }
    const items = [], peakDb = 20 * Math.log10(peak + 1e-9), master = () => project.mixer[0];
    const lowerMaster = db => mutate(Px => { Px.mixer[0].vol = clamp(Px.mixer[0].vol * dbToGain(-db), 0.05, 1.25); });
    if (peak < 0.003) {
      items.push({ level: 'bad', title: 'Nothing is coming out', text: `Every sound in the ${what} is muted, silent or empty.` });
    } else {
      if (peakDb > -0.1) items.push({ level: 'bad', title: 'Your mix clips', text: `It peaks at ${fmtDb(peak)} dB, so the loudest moments will crackle.`, fix: { label: `Lower the master ${Math.ceil(peakDb + 1)} dB`, run: () => lowerMaster(Math.ceil(peakDb + 1)) } });
      else if (peakDb > -1) items.push({ level: 'warn', title: 'Almost clipping', text: `It peaks at ${peakDb.toFixed(1)} dB. A little headroom keeps it clean.`, fix: { label: 'Lower the master 1.5 dB', run: () => lowerMaster(1.5) } });
      else items.push({ level: 'good', title: 'No clipping', text: `The loudest moment peaks at ${peakDb.toFixed(1)} dB.` });
      const lufs = gatedLoudness(await filterPass(buffer, frames, [['highpass', 60, 0.5], ['highshelf', 1500, null, 4]]));
      if (lufs < -20) items.push({ level: 'warn', title: 'On the quiet side', text: `About ${Math.round(lufs)} LUFS. Streaming apps play most songs near −14, so yours will sound smaller next to them.`,
        fix: { label: 'Master it for streaming', run: () => autoMaster('streaming') } });
      else if (lufs > -8) items.push({ level: 'warn', title: 'Very loud', text: `About ${Math.round(lufs)} LUFS. It may sound squashed, and streaming apps will turn it down anyway.`, fix: { label: `Lower the master ${Math.round(lufs + 11)} dB`, run: () => lowerMaster(Math.round(lufs + 11)) } });
      else items.push({ level: 'good', title: 'Loudness is in a good range', text: `About ${Math.round(lufs)} LUFS, close to what streaming apps expect.` });
      const used = usedChannels(P);
      const kicks = used.filter(c => (c.kind === 'drum' && c.drum === 'kick') || /kick/i.test(c.name));
      const basses = used.filter(c => !kicks.includes(c) && ((c.kind === 'drum' && c.drum === '808') || (c.kind === 'synth' && /bass/i.test(c.plugin + ' ' + c.name)) || (c.kind === 'sampler' && /bass|808/i.test(c.name))));
      if (kicks.length && basses.length) {
        const loose = basses.filter(b => !b.duck);
        if (loose.length) items.push({ level: 'warn', title: 'Kick and bass are fighting', text: `${loose.map(b => b.name).join(', ')} and ${kicks[0].name} share the low end and hit together, which makes it muddy.`,
          fix: { label: 'Duck the bass under the kick', run: () => mutate(Px => { for (const b of loose) { const c = Px.channels.find(x => x.id === b.id); if (c) c.duck = { by: kicks[0].id, amount: 0.55 }; } }) } });
        else items.push({ level: 'good', title: 'Kick and bass take turns', text: 'The bass ducks under the kick, so the low end stays clear.' });
      }
      const low = await filterPass(buffer, frames, [['lowpass', 120, 0.7], ['lowpass', 120, 0.7]]);
      let ls = 0, ln = 0; for (let c = 0; c < low.numberOfChannels; c++) { const d = low.getChannelData(c); for (let i = 0; i < d.length; i += 2) { ls += d[i] * d[i]; ln++; } }
      const lowRatio = Math.sqrt(ls / Math.max(1, ln)) / Math.max(1e-9, Math.sqrt(sum / Math.max(1, n)));
      if (lowRatio > 0.72) items.push({ level: 'warn', title: 'Bass-heavy', text: 'Most of the energy sits below 120 Hz. On phone speakers it will sound muddy or quiet.',
        fix: { label: 'Trim the lows on the master', run: () => mutate(Px => { const m = Px.mixer[0], eq = m.fx.find(f => f.plugin === 'th.eq3'); if (eq) eq.params = { ...eq.params, low: clamp((eq.params.low || 0) - 4, -15, 15) }; else m.fx.unshift(fxSlot('th.eq3', { low: -4 })); }) } });
      else if (lowRatio < 0.12 && basses.length) items.push({ level: 'warn', title: 'Thin low end', text: 'The bass is barely audible against everything else.',
        fix: { label: 'Turn the bass up 4 dB', run: () => mutate(Px => { for (const b of basses) { const c = Px.channels.find(x => x.id === b.id); if (c) c.vol = clamp(c.vol * dbToGain(4), 0, 1.2); } }) } });
      else items.push({ level: 'good', title: 'Low end is balanced', text: 'Bass and kick sit well against the rest of the mix.' });
      if (chs.length === 2) {
        let lr = 0, ll = 0, rr = 0; for (let i = 0; i < frames; i += 4) { const a = chs[0][i], b = chs[1][i]; lr += a * b; ll += a * a; rr += b * b; }
        const corr = lr / Math.max(1e-12, Math.sqrt(ll * rr));
        const wide = used.find(c => c.kind === 'synth' && c.insert > 0 && /pad|keys|chord/i.test(c.plugin + ' ' + c.name));
        if (corr > 0.97) items.push({ level: 'warn', title: 'Very narrow', text: 'The mix is almost mono. A little width makes it feel bigger.',
          fix: wide ? { label: `Add chorus to ${wide.name}`, run: () => mutate(Px => { Px.mixer[wide.insert].fx.push(fxSlot('th.chorus', { mix: 0.4 })); }) } : null });
        else items.push({ level: 'good', title: 'Good stereo width', text: 'The mix has space between left and right.' });
      }
    }
    if (what === 'pattern') items.push({ level: 'warn', title: 'No song yet', text: 'The playlist is empty, so this only checked the current pattern.', fix: { label: 'Arrange for me', run: autoArrangeCurrent } });
    const fixes = items.filter(i => i.level === 'bad').length, checks = items.filter(i => i.level === 'warn').length;
    ui.mixReport = { what: what === 'song' ? 'whole song' : `pattern “${curPattern().name}”`, items,
      summary: fixes || checks ? [fixes ? `${fixes} to fix` : '', checks ? `${checks} to check` : ''].filter(Boolean).join(', ') : 'Sounds healthy' };
  } catch (e) { ui.mixReport = { error: e.message || String(e) }; }
  if (ui.tab === 'mixer') renderView();
}
function mixReportNode() {
  const R = ui.mixReport; if (!R) return null;
  const box = el('div', { class: 'report', 'aria-live': 'polite' });
  if (R.busy) { box.append(el('div', { class: 'issue' }, el('div', { class: 'txt' }, el('b', {}, 'Listening to your mix…'), el('span', {}, 'Playing the whole thing through silently and measuring it. Longer songs take longer.')))); return box; }
  if (R.error) { box.append(el('div', { class: 'issue bad' }, el('span', { class: 'chip-s' }, 'Error'), el('div', { class: 'txt' }, el('b', {}, 'Mix check failed'), el('span', {}, R.error)))); return box; }
  box.append(el('div', { class: 'report-head' }, el('span', { class: 'lbl' }, `Mix check · ${R.what}`), el('span', { class: 'muted small' }, R.summary), el('span', { class: 'spacer' }),
    el('button', { class: 'btn sm ghost', onclick: runMixCheck }, 'Check again'), el('button', { class: 'btn sm ghost', onclick: () => { ui.mixReport = null; renderView(); } }, 'Close')));
  for (const it of R.items) box.append(el('div', { class: 'issue ' + it.level },
    el('span', { class: 'chip-s' }, it.level === 'good' ? 'Good' : it.level === 'warn' ? 'Check' : 'Fix'),
    el('div', { class: 'txt' }, el('b', {}, it.title), el('span', {}, it.text)),
    it.done ? el('span', { class: 'muted small' }, 'Done') : it.fix ? el('button', { class: 'btn sm', onclick: () => { it.fix.run(); it.done = true; renderView(); } }, it.fix.label) : null));
  return box;
}

/* ---------- command palette ---------- */
function buildCommands() {
  const C = [], add = (group, label, run, hint) => C.push({ group, label, run, hint, q: `${group} ${label} ${hint || ''}`.toLowerCase() });
  TABS.forEach(([id, label, alt]) => add('Go to', label, () => setTab(id), alt));
  add('Play', T.playing ? 'Pause' : 'Play', togglePlay, 'Space');
  add('Play', 'Loop the current pattern', () => setMode('pattern'), 'pattern mode');
  add('Play', 'Play the whole song', () => { setMode('song'); if (!T.playing) play(); }, 'song mode');
  Object.entries(STYLES).forEach(([id, s]) => add('Ideas', `Start a ${s.label} song`, () => startStyleSong(id), `${s.bpm} bpm genre new`));
  Object.entries(STYLES).forEach(([id, s]) => add('Ideas', `${s.label} drums in this pattern`, () => { ui.ideaStyle = id; ideaDrums(); }, 'beat generate'));
  add('Ideas', 'Chords in this pattern', ideaChords, 'progression harmony generate');
  add('Ideas', 'Bassline that follows the chords', ideaBass, 'bass generate');
  add('Ideas', 'Melody in key', ideaMelody, 'lead tune generate');
  add('Ideas', 'Arrange my patterns into a song', autoArrangeCurrent, 'structure sections auto');
  add('Ideas', 'Ask Claude for a pattern', () => openIdeas(true), 'ai describe write');
  add('Ideas', 'All ideas', () => openIdeas(false));
  add('Create', 'Create a new song', () => { setTab('create'); const d = $('.c-desc'); if (d) d.focus(); }, 'suno generate write song');
  add('Create', 'Extend this song', extendSong, 'longer bridge chorus');
  add('Create', 'New takes of this song', () => { setTab('create'); createSong(planFromProject(project)); }, 'variation remix');
  add('File', 'Export stems', exportStems, 'separate tracks wav zip');
  DRUMS.forEach(([id, n]) => add('Add sound', `${n} drum`, () => { addChannel({ name: n, kind: 'drum', drum: id }); setTab('rack'); }, 'channel'));
  for (const p of plugins.values()) if (p.manifest.type === 'instrument') add('Add sound', `${p.manifest.name} instrument`, () => { addChannel({ name: p.manifest.name, kind: 'synth', plugin: p.id }); setTab('rack'); }, 'synth channel');
  sortedLib().slice(0, 400).forEach(s => add('Add sound', s.name, () => { addSamplerChannel(s.id); setTab('rack'); }, s.folder));
  const sel = project.channels.find(c => c.id === ui.selCh), ins = sel && sel.insert > 0 ? sel.insert : clamp(ui.selInsert, 0, project.mixer.length - 1);
  for (const p of plugins.values()) if (p.manifest.type === 'effect') add('Add effect', `${p.manifest.name} on ${project.mixer[ins].name}`, async () => { await addFx(ins, p.id); ui.selInsert = ins; setTab('mixer'); }, 'fx mixer');
  add('Mix', 'Check my mix', () => { setTab('mixer'); runMixCheck(); }, 'clipping loudness problems');
  add('Pattern', 'New pattern', () => addPattern(false)); add('Pattern', 'Clone this pattern', () => addPattern(true), 'copy duplicate');
  project.patterns.forEach(p => add('Pattern', `Open ${p.name}`, () => { project.currentPattern = p.id; scheduleSave(); render(); }));
  add('Song', 'Add a section marker here', () => { setTab('playlist'); addSection(); }, 'verse chorus');
  add('Key', `Change key (now ${keyLabel(project)})`, () => $('#keyRoot').focus(), 'scale');
  add('File', 'Import files', () => pickFiles(), 'audio midi zip samples');
  add('File', 'Export song to WAV', () => openProjectSheet({ exportSong: true }), 'mixdown render bounce');
  add('File', 'Save project bundle', exportBundle, 'tapehouse project share');
  add('File', 'Back up my library', backupLibrary, 'sounds zip');
  add('File', 'New blank project', () => openProjectObject(blankProject()));
  add('File', 'Open or manage projects', openProjectSheet);
  add('Edit', 'Undo', undo, 'Ctrl Z'); add('Edit', 'Redo', redo, 'Ctrl Shift Z');
  add('Help', ui.guide ? 'Hide tips' : 'Show tips', () => toggleGuide());
  add('Look', 'Change colors', openColors, 'theme palette style');
  Object.entries(THEMES).forEach(([id, t]) => add('Look', `Colors: ${t.label}`, () => applyTheme(id, ui.multi), 'theme palette'));
  add('Look', ui.multi ? 'One color for all sounds' : 'Give each sound its own color', () => applyTheme(ui.theme, !ui.multi), 'theme palette');
  add('Plugins', 'Write or install a plugin', () => setTab('plugins'));
  studioCommands(add);
  return C;
}
function openPalette() {
  const cmds = buildCommands();
  const input = el('input', { type: 'search', placeholder: 'What do you want to do? Try “trap”, “reverb”, “export”', 'aria-label': 'Search actions', autocomplete: 'off' });
  const list = el('div', { class: 'pal-list', role: 'listbox', 'aria-label': 'Actions' });
  let sel = 0, shown = [];
  const run = c => { closeSheet(); c.run(); };
  const draw = () => {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    shown = cmds.filter(c => words.every(w => c.q.includes(w))).slice(0, 80);
    sel = clamp(sel, 0, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((c, i) => el('button', { class: 'pal-item' + (i === sel ? ' sel' : ''), role: 'option', 'aria-selected': String(i === sel), onclick: () => run(c) },
      el('span', { class: 'pal-group' }, c.group), el('span', { class: 'pal-label' }, c.label), c.hint ? el('span', { class: 'pal-hint' }, c.hint) : null)));
    if (!shown.length) list.append(el('p', { class: 'hint', style: { padding: '10px' } }, 'Nothing matches. Try “kick”, “chords”, “reverb” or “export”.'));
    const cur = list.children[sel]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); run(shown[sel]); }
  });
  openSheet([sheetHead('Do anything'), input, list], 'palette');
  draw(); input.focus();
}

/* ---------- color themes ---------- */
const THEMES = {
  prism: { label: 'Prism', note: 'Every sound gets its own color, all at the same brightness so nothing shouts.', pick: true,
    accent: '#ffad4a', hi: '#ffd08f', lo: '#a8692a', ink: '#2a1503', bg: '#0d0d11', glow: '#1c1b21',
    sounds: ['#ff6b4f', '#4fb4ff', '#ffa040', '#a98bff', '#8fdc6c', '#6f86ff', '#f2d052', '#3fd2be'] },
  sunset: { label: 'Sunset', note: 'Warm reds, golds and pinks. Colorful but cozy.',
    accent: '#ff9459', hi: '#ffbe93', lo: '#a5552b', ink: '#2a1006', bg: '#110c0f', glow: '#2a1720',
    sounds: ['#ff6b5b', '#c792ff', '#ff9459', '#ff8c8c', '#ffc35c', '#e8875a', '#ffdd85', '#f2a07b'] },
  ocean: { label: 'Ocean', note: 'Cool teals, blues and violets. Calm, late-night energy.',
    accent: '#45c3f0', hi: '#9fe0f8', lo: '#2a7895', ink: '#04161f', bg: '#0a0e13', glow: '#13222e',
    sounds: ['#4fd6c8', '#5aa9ff', '#7ee0ff', '#9b8cff', '#5ee39f', '#c38bff', '#a9d7ff', '#3fc0e0'] },
  brass: { label: 'Brass', note: 'Muted tones with one gold accent. The quiet studio look.',
    accent: '#e2b36b', hi: '#f4d39a', lo: '#9c7a45', ink: '#1d1508', bg: '#0c0d10', glow: '#1c1d22',
    sounds: COLORS.slice() },
};
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function soundColor(c, raw) {
  const t = THEMES[ui.theme] || THEMES.prism;
  if (!ui.multi && !raw) return t.accent;
  let i = COLORS.indexOf(String(c).toLowerCase()); if (i < 0) i = OLD_COLORS.indexOf(String(c).toLowerCase());
  return i >= 0 ? t.sounds[i] : (c || t.accent);
}
function applyTheme(id, multi, silent) {
  ui.theme = THEMES[id] ? id : 'prism'; ui.multi = multi !== false;
  const t = THEMES[ui.theme], st = document.documentElement.style;
  [['--accent', t.accent], ['--accent-hi', t.hi], ['--accent-lo', t.lo], ['--accent-ink', t.ink], ['--accent-rgb', hexRgb(t.accent).join(' ')], ['--bg', t.bg], ['--glow-bg', t.glow]].forEach(([k, v]) => st.setProperty(k, v));
  try { localStorage.setItem('th.theme', ui.theme); localStorage.setItem('th.multi', ui.multi ? '1' : '0'); } catch (e) { /* ok */ }
  readColors();
  const dots = $('#themeDots');
  if (dots) [...dots.children].forEach((d, i) => { const c = ui.multi ? t.sounds[[0, 1, 3][i]] : t.accent; d.style.background = c; d.style.color = c; });
  if (!silent) { render(); renderLib(); }
}
function openColors() {
  const rows = [[0, [0, 4]], [2, [2, 6]], [6, [1, 3, 5, 7]], [1, [0, 3, 6]]];
  const card = (id, t) => {
    const col = i => (ui.multi ? t.sounds[i] : t.accent);
    return el('button', { class: 'theme-card' + (ui.theme === id ? ' on' : ''), 'aria-pressed': String(ui.theme === id), onclick: () => { applyTheme(id, ui.multi); openColors(); } },
      el('div', { class: 'tc-preview', style: `--tb:${t.bg};--tg:${t.glow}` },
        rows.map(([ci, on]) => el('div', { class: 'tc-row', style: `--rc:${col(ci)}` }, el('b'), [0, 1, 2, 3, 4, 5, 6, 7].map(k => el('i', { class: on.includes(k) ? 'on' : '' })))),
        el('div', { class: 'tc-clips' }, [0, 1, 3, 5].map(ci => el('span', { style: `--rc:${col(ci)}` })))),
      el('div', { class: 'tc-meta' }, el('b', {}, t.label, t.pick ? el('em', {}, 'Recommended') : null), el('span', {}, t.note)));
  };
  openSheet([
    sheetHead('Colors'),
    el('p', { class: 'muted', style: { margin: 0 } }, 'Tap a look and the studio changes right away, so you can try each one while your song plays.'),
    el('div', { class: 'theme-grid' }, Object.entries(THEMES).map(([id, t]) => card(id, t))),
    el('label', { class: 'toggle-row' }, el('input', { type: 'checkbox', checked: ui.multi, onchange: e => { applyTheme(ui.theme, e.target.checked); openColors(); } }),
      el('b', {}, 'Give every sound its own color'),
      el('span', { class: 'hint' }, 'Turn it off and every sound uses the theme’s single accent color instead.')),
  ], 'colors');
}

