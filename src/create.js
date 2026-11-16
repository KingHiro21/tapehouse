/* =====================================================================
   Part 4: Create — describe a song, get two takes, keep one
   ===================================================================== */
const FORMS = {
  song: [['Intro', 4], ['Verse 1', 8], ['Pre-Chorus', 4], ['Chorus', 8], ['Verse 2', 8], ['Chorus', 8], ['Bridge', 8], ['Chorus', 8], ['Outro', 4]],
  club: [['Intro', 8], ['Build', 8], ['Drop', 8], ['Break', 8], ['Build', 4], ['Drop', 8], ['Outro', 8]],
  rap: [['Intro', 4], ['Hook', 8], ['Verse 1', 8], ['Hook', 8], ['Verse 2', 8], ['Hook', 8], ['Outro', 4]],
  chill: [['Intro', 4], ['Verse 1', 8], ['Chorus', 8], ['Verse 2', 8], ['Chorus', 8], ['Outro', 4]],
};
const STYLE_FORM = { pop: 'song', house: 'club', dnb: 'club', synthwave: 'song', trap: 'rap', hiphop: 'rap', reggaeton: 'rap', lofi: 'chill' };
const STYLE_WORDS = {
  trap: ['trap', 'drill', '808', 'rage', 'phonk'], house: ['house', 'edm', 'dance', 'club', 'techno', 'disco', 'rave'],
  hiphop: ['hip hop', 'hip-hop', 'hiphop', 'boom bap', 'boom-bap', 'rap', 'old school'], lofi: ['lofi', 'lo-fi', 'chill', 'study', 'jazzy', 'relax', 'cozy', 'rainy'],
  dnb: ['drum and bass', 'drum & bass', 'dnb', 'jungle', 'liquid'], pop: ['pop', 'love', 'upbeat', 'summer', 'radio', 'ballad'],
  reggaeton: ['reggaeton', 'latin', 'dembow', 'perreo'], synthwave: ['synthwave', '80s', 'retro', 'outrun', 'night drive', 'neon'],
};
const MOOD_WORDS = {
  sad: ['sad', 'heartbreak', 'lonely', 'cry', 'melancholy', 'miss', 'broken', 'goodbye'], happy: ['happy', 'joy', 'sunny', 'summer', 'upbeat', 'fun', 'party'],
  dreamy: ['dreamy', 'dream', 'float', 'stars', 'ethereal', 'soft', 'night'], dark: ['dark', 'angry', 'evil', 'menacing', 'gritty', 'villain'],
  epic: ['epic', 'anthem', 'powerful', 'cinematic', 'triumph'], chill: ['chill', 'calm', 'relax', 'lazy', 'cozy'],
};
const MOOD_PROGS = { sad: ['sad', 'dark', 'dreamy'], happy: ['pop', 'dreamy', 'smooth'], dreamy: ['dreamy', 'smooth', 'pop'], dark: ['dark', 'tension', 'sad'], epic: ['dark', 'pop', 'tension'], chill: ['smooth', 'dreamy', 'sad'] };
const CREATE_TAGS = ['Pop', 'House', 'Trap', 'Boom-bap', 'Lo-fi', 'Drum & Bass', 'Reggaeton', 'Synthwave', 'Happy', 'Sad', 'Dreamy', 'Dark', 'Epic', 'Chill'];
const TITLE_ADJ = { sad: ['Paper', 'Quiet', 'Broken', 'Faded', 'Blue'], happy: ['Golden', 'Sunny', 'Bright', 'Lucky', 'Wild'], dreamy: ['Velvet', 'Midnight', 'Silver', 'Floating', 'Starlit'],
  dark: ['Black', 'Cold', 'Iron', 'Hollow', 'Electric'], epic: ['Endless', 'Rising', 'Burning', 'Infinite', 'Thunder'], chill: ['Slow', 'Easy', 'Soft', 'Rainy', 'Sunday'] };
const TITLE_NOUN = ['Hearts', 'Skyline', 'Summer', 'Signals', 'Rain', 'Highway', 'Echoes', 'Satellites', 'Fever', 'Daydream', 'Lights', 'Tides', 'Static', 'Gravity'];
const STOP = new Set(['about', 'with', 'that', 'this', 'song', 'track', 'beat', 'from', 'into', 'like', 'some', 'feel', 'have', 'make', 'want', 'your', 'their', 'there', 'where', 'when', 'what', 'over', 'down', 'very', 'really', 'just']);
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
function detectWord(text, map) {
  let best = null, n = 0;
  for (const [k, words] of Object.entries(map)) { const c = words.filter(w => text.includes(w)).length; if (c > n) { n = c; best = k; } }
  return best;
}
function sectionInfo(name) {
  const n = String(name).toLowerCase();
  if (/intro/.test(n)) return { type: 'intro', energy: 0, prog: 'verse' };
  if (/outro|ending/.test(n)) return { type: 'outro', energy: 0, prog: 'verse' };
  if (/pre|build|lift|rise/.test(n)) return { type: 'pre', energy: 2, prog: 'verse' };
  if (/chorus|hook|drop|refrain/.test(n)) return { type: 'chorus', energy: 3, prog: 'chorus' };
  if (/bridge/.test(n)) return { type: 'bridge', energy: 1, prog: 'bridge' };
  if (/break|interlude/.test(n)) return { type: 'break', energy: 0, prog: 'bridge' };
  return { type: 'verse', energy: 1, prog: 'verse' };
}
function parseLyrics(text) {
  const blocks = []; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); const tag = line.match(/^\[(.+?)\]$/);
    if (tag) { cur = { name: tag[1], lines: [] }; blocks.push(cur); continue; }
    if (!line) continue;
    if (!cur) { cur = { name: '', lines: [] }; blocks.push(cur); }
    cur.lines.push(line);
  }
  if (blocks.length === 1 && !blocks[0].name) {
    const lines = blocks[0].lines; blocks.length = 0;
    for (let i = 0; i < lines.length; i += 4) blocks.push({ name: (i / 4) % 2 ? 'Chorus' : 'Verse', lines: lines.slice(i, i + 4) });
  }
  return blocks;
}
function assignLyrics(sections, blocks) {
  const verses = blocks.filter(b => !/chorus|hook|refrain|bridge|pre|intro|outro/i.test(b.name));
  const chorus = blocks.find(b => /chorus|hook|refrain/i.test(b.name)), bridge = blocks.find(b => /bridge/i.test(b.name)), pre = blocks.find(b => /pre/i.test(b.name));
  let vi = 0;
  for (const s of sections) {
    const t = sectionInfo(s.name).type;
    const b = t === 'chorus' ? chorus : t === 'bridge' ? bridge : t === 'pre' ? pre : t === 'verse' ? verses[vi++] : null;
    s.lyrics = b ? b.lines.join('\n') : '';
  }
}
function makeTitle(text, mood) {
  const banned = new Set([...Object.values(STYLE_WORDS).flat(), ...Object.values(MOOD_WORDS).flat()]);
  const words = (text.match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w) && !banned.has(w) && !/(ing|ed|ly)$/.test(w));
  const adj = rnd(TITLE_ADJ[mood] || TITLE_ADJ.dreamy);
  return words.length && chance(0.7) ? `${adj} ${cap(rnd(words))}` : `${adj} ${rnd(TITLE_NOUN)}`;
}
function planLocal(desc, tags, opts, variant = 0) {
  const text = `${desc} ${tags.join(' ')}`.toLowerCase();
  const style = detectWord(text, STYLE_WORDS) || ['pop', 'house', 'lofi', 'synthwave', 'trap'][Math.floor(Math.random() * 5)];
  const mood = detectWord(text, MOOD_WORDS) || 'dreamy', S = STYLES[style];
  let bpm = S.bpm; const m = text.match(/(\d{2,3})\s*bpm/);
  if (m) bpm = clamp(+m[1], 60, 180); else if (/\bslow\b/.test(text)) bpm -= 14; else if (/\bfast\b|energetic|hype/.test(text)) bpm += 10;
  const scale = mood === 'happy' ? 'major' : (mood === 'sad' || mood === 'dark') ? 'minor' : S.scale;
  const ids = MOOD_PROGS[mood] || S.progs, prog = id => (PROGRESSIONS.find(p => p.id === id) || PROGRESSIONS[0]).degs.slice();
  const verse = prog(ids[variant % ids.length]), chorus = prog(ids[(variant + 1) % ids.length]);
  const sections = FORMS[STYLE_FORM[style]].map(([name, bars]) => ({ name, bars, lyrics: '' }));
  if (opts.lyrics) assignLyrics(sections, parseLyrics(opts.lyrics));
  const keys = scale === 'major' ? [0, 7, 2, 9, 5] : S.keys;
  return { title: (opts.title || '').trim() || makeTitle(text, mood), prompt: desc, tags: [S.label, cap(mood), ...tags.filter(t => t !== S.label && t.toLowerCase() !== mood)].slice(0, 5),
    style, bpm: Math.round(bpm), key: keys[(variant + Math.floor(Math.random() * keys.length)) % keys.length], scale,
    prog: { verse, chorus: chorus.join() === verse.join() ? [3, 4, 0, 5] : chorus, bridge: rnd([[5, 3, 0, 4], [3, 4, 5, 4], [5, 6, 3, 4]]) }, sections, vocal: false };
}
function planPrompt(desc, tags, opts) {
  return `You are a songwriter planning a song for a music app. The app builds all the music itself from your plan, so you choose structure, harmony and words.
Request: ${JSON.stringify((desc || '').slice(0, 600))}
Style tags: ${tags.join(', ') || 'none'}
${opts.lyrics ? 'The user wrote these lyrics; split them across the sections exactly as written: ' + JSON.stringify(opts.lyrics.slice(0, 3000)) : 'Do not write lyrics: leave every "lyrics" empty.'}
${opts.title ? 'The title is ' + JSON.stringify(opts.title) + '.' : ''}
Reply with only JSON in this shape:
{"title":"Song title","style":"pop","bpm":104,"key":"A","scale":"minor","tags":["dreamy","night drive"],"progressions":{"verse":[0,5,2,6],"chorus":[3,4,0,5],"bridge":[5,3,0,4]},"sections":[{"name":"Intro","bars":4,"lyrics":""},{"name":"Verse 1","bars":8,"lyrics":"line one\\nline two\\nline three\\nline four"},{"name":"Chorus","bars":8,"lyrics":"..."}]}
Rules: style is one of pop, house, trap, hiphop, lofi, dnb, reggaeton, synthwave. bpm 60 to 180. key is one of C C# D D# E F F# G G# A A# B. scale is major, minor or dorian. Each progression is four scale degrees from 0 to 6, and the chorus should lift compared with the verse. Use 6 to 10 sections, each 4 or 8 bars, 40 to 72 bars in total, with names like Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Bridge, Outro (Hook, Drop or Break are fine too). tags: up to 4 short words.`;
}
function planFromClaude(d, base) {
  if (!d || typeof d !== 'object') return base;
  const p = { ...base };
  if (typeof d.title === 'string' && d.title.trim()) p.title = d.title.trim().slice(0, 60);
  if (STYLES[d.style]) p.style = d.style;
  if (+d.bpm >= 60 && +d.bpm <= 180) p.bpm = Math.round(+d.bpm);
  const ki = KEY_NAMES.indexOf(String(d.key || '').toUpperCase().replace('♯', '#')); if (ki >= 0) p.key = ki;
  if (['major', 'minor', 'dorian'].includes(d.scale)) p.scale = d.scale;
  const okProg = a => Array.isArray(a) && a.length >= 2 && a.every(x => Number.isInteger(x) && x >= 0 && x <= 6) ? a.slice(0, 4) : null;
  if (d.progressions) for (const k of ['verse', 'chorus', 'bridge']) { const v = okProg(d.progressions[k]); if (v) { while (v.length < 4) v.push(v[v.length - 1]); p.prog = { ...p.prog, [k]: v }; } }
  if (Array.isArray(d.sections) && d.sections.length >= 3) {
    const secs = d.sections.slice(0, 12).filter(s => s && s.name).map(s => ({ name: String(s.name).slice(0, 24), bars: +s.bars === 4 ? 4 : 8, lyrics: typeof s.lyrics === 'string' ? s.lyrics.slice(0, 800) : '' }));
    if (secs.length >= 3) p.sections = secs;
  }
  if (Array.isArray(d.tags)) p.tags = [STYLES[p.style].label, ...d.tags.map(t => cap(String(t).slice(0, 20)))].slice(0, 5);
  return p;
}

/* ---------- build a whole song from a plan ---------- */
function buildSong(plan, variant = 0) {
  const S = STYLES[plan.style] || STYLES.pop, P = newProject(plan.title);
  P.mixer = newMixer(0); P.patterns = []; P.mixer[0].vol = 0.7; P.bpm = plan.bpm; P.swing = S.swing; P.key = plan.key; P.scale = plan.scale; P.playlist.tracks = [];
  const pats = {}, chs = {};
  const pat = (role, name, len, colorIdx) => {
    if (pats[role]) return pats[role];
    const p = { ...newPattern(P.patterns.length, len), name, role, color: COLORS[colorIdx] }; P.patterns.push(p); pats[role] = p; return p;
  };
  // sounds
  const steps = drumSteps(S, 32);
  for (const k of Object.keys(steps)) chs[k] = drumCh(P, k);
  const bassCh = S.bass.drum === '808' ? drumCh(P, '808') : synthCh(P, S.bass.plugin, 'Bass');
  if (S.bass.drum === '808') bassCh.params = { decay: 0.9 }; else { bassCh.vol = 0.75; if (S.bass.params) bassCh.params = { ...S.bass.params }; }
  if (chs.kick) bassCh.duck = { by: chs.kick.id, amount: 0.55 };
  const chordPlugin = variant % 2 && S.chords.plugin === 'th.tape-keys' ? 'th.glass-pluck' : S.chords.plugin;
  const chordCh = synthCh(P, chordPlugin, 'Chords'); chordCh.vol = 0.58;
  const padCh = synthCh(P, 'th.sunset-pad', chordPlugin === 'th.sunset-pad' ? 'Strings' : 'Pad'); padCh.vol = 0.4;
  const leadCh = synthCh(P, S.lead, 'Lead'); leadCh.vol = 0.5;
  // drum patterns: full and light
  const full = pat('drums:full', 'Drums', 32, 0); for (const k in steps) full.steps[chs[k].id] = steps[k];
  const light = pat('drums:light', 'Drums (light)', 32, 0);
  for (const k of ['kick', 'hat', 'shaker']) if (steps[k]) light.steps[chs[k].id] = steps[k].map((v, i) => (k === 'kick' && i % 16 >= 8 && chance(0.5)) ? 0 : v * 0.85);
  const rhythmFor = key => key === 'chorus' ? (S.chords.rhythm === 'sustain' ? 'pulse' : S.chords.rhythm) : key === 'bridge' ? 'sustain' : (variant % 2 ? 'sustain' : S.chords.rhythm);
  const partsFor = key => {
    const prog = plan.prog[key] || plan.prog.verse, label = cap(key);
    const c = pat(`chords:${key}`, `${label} Chords`, 64, 3);
    if (!c.notes[chordCh.id]) { c.notes[chordCh.id] = genChordNotes(P, prog, rhythmFor(key)); if (key !== 'verse') c.notes[padCh.id] = genChordNotes(P, prog, 'sustain'); }
    const b = pat(`bass:${key}`, `${label} Bass`, 64, 1);
    if (!b.notes[bassCh.id]) { let ns = genBass(P, prog, key === 'bridge' ? 'simple' : S.bass.style, S.drums.kick); if (S.bass.drum === '808') ns = ns.map(n => ({ ...n, n: to808(n.n) })); b.notes[bassCh.id] = ns; }
    const m = pat(`melody:${key}`, `${label} Melody`, 64, 5);
    if (!m.notes[leadCh.id]) m.notes[leadCh.id] = genMelody(P, prog, key === 'chorus' ? 5 : key === 'bridge' ? 2 : 0);
    return { c, b, m };
  };
  const TR = { drums: 0, bass: 1, chords: 2, lead: 3 };
  P.playlist.tracks = ['Drums', 'Bass', 'Chords', 'Lead'].map((n, i) => newTrack(i, n));
  while (P.playlist.tracks.length < 6) P.playlist.tracks.push(newTrack(P.playlist.tracks.length));
  let bar = 0;
  const place = (p, track, start, len) => P.playlist.clips.push({ id: uid(), kind: 'pattern', ref: p.id, track, start, len, gain: 1, offset: 0 });
  for (const s of plan.sections) {
    const info = sectionInfo(s.name), { c, b, m } = partsFor(info.prog), st = bar * 16, len = s.bars * 16;
    P.playlist.markers.push({ id: uid(), start: st, name: s.name, lyrics: s.lyrics || '' });
    place(c, TR.chords, st, len);
    if (info.type === 'intro' && s.bars >= 8) place(light, TR.drums, st + len / 2, len / 2);
    if (info.energy >= 1) { place(info.energy >= 2 ? full : light, TR.drums, st, len); place(b, TR.bass, st, len); }
    if (info.energy >= 1 || info.type === 'break') place(m, TR.lead, st, len);
    if (info.type === 'outro') place(light, TR.drums, st, Math.min(len, 64));
    bar += s.bars;
  }
  P.mixer[0].fx = [fxSlot('th.glue-comp', { threshold: -14, ratio: 2.5, makeup: 2 })];
  ['hat', 'openhat', 'shaker'].forEach(k => addFxTo(P, chs[k], [['th.eq3', { low: -12 }]]));
  addFxTo(P, chordCh, chordPlugin === 'th.sunset-pad' ? [['th.room-reverb', { size: 4, mix: 0.35 }]] : [['th.tape-delay', { time: 0.75, mix: 0.14 }], ['th.room-reverb', { size: 2.4, mix: 0.25 }]]);
  addFxTo(P, padCh, [['th.chorus', { mix: 0.35 }], ['th.room-reverb', { size: 4.5, mix: 0.4 }]]);
  addFxTo(P, leadCh, [['th.tape-delay', { time: 0.75, mix: 0.2 }], ['th.room-reverb', { size: 2.8, mix: 0.25 }]]);
  if (S.lofi) { addFxTo(P, chordCh, [['th.bitcrusher', { bits: 9, mix: 0.25 }]]); P.mixer[0].fx.unshift(fxSlot('th.saturator', { drive: 0.3, tone: 6000, mix: 0.6, output: -2 })); }
  P.currentPattern = full.id;
  P.song = { title: plan.title, prompt: plan.prompt || '', tags: plan.tags || [], style: plan.style, vocal: false, prog: plan.prog, seed: hashStr(plan.title + ':' + variant + ':' + Date.now()), created: Date.now(),
    roles: { kick: chs.kick ? chs.kick.id : '', bass: bassCh.id, chords: chordCh.id, pad: padCh.id, lead: leadCh.id }, tracks: TR };
  return P;
}

/* ---------- create flow ---------- */
let createCtl = null;
function readComposer() {
  return { desc: (ui.cDesc || '').trim(), tags: ui.cTags.slice(), opts: { lyrics: ui.cCustom ? (ui.cLyrics || '').trim() : '', title: ui.cCustom ? (ui.cTitle || '').trim() : '' } };
}
async function createSong(fromPlan) {
  if (ui.cBusy) return;
  const { desc, tags, opts } = readComposer();
  if (!fromPlan && !desc && !tags.length && !opts.lyrics) { ui.cStatus = { kind: 'err', text: 'Describe your song or tap a style first.' }; refreshCreate(); return; }
  ui.cBusy = true; ui.cStatus = { kind: '', text: sampleFn && !fromPlan ? 'Claude is writing the title, lyrics and structure. This can take up to a minute.' : 'Building two takes…' }; refreshCreate();
  let plans;
  try {
    if (fromPlan) plans = [fromPlan, { ...fromPlan }];
    else {
      const a = planLocal(desc, tags, opts, 0), b = planLocal(desc, tags, opts, 1);
      if (sampleFn) {
        createCtl = new AbortController();
        try {
          const d = await sampleFn.json(planPrompt(desc, tags, opts), { signal: createCtl.signal, modelTier: 'default' });
          const p = planFromClaude(d, a); plans = [p, { ...p, prog: { ...p.prog, verse: p.prog.verse, chorus: p.prog.chorus } }];
        } catch (e) {
          if (e && e.code === 'cancelled') { ui.cBusy = false; ui.cStatus = { kind: '', text: 'Stopped.' }; refreshCreate(); return; }
          plans = [a, b]; toast(`Claude couldn’t write this one (${(e && SAMPLE_ERR[e.code]) || 'try again later'}), so the built-in songwriter made it.`, { kind: 'error', ms: 7000 });
        } finally { createCtl = null; }
      } else plans = [a, b];
    }
    await wait(30);
    ui.takes = plans.map((p, i) => ({ id: uid(), plan: p, project: buildSong(p, i), kept: false }));
    ui.cStatus = { kind: 'ok', text: 'Two takes are ready. Play them and keep the one you like.' };
  } catch (e) { ui.cStatus = { kind: 'err', text: `Something went wrong: ${e.message}` }; }
  ui.cBusy = false; refreshCreate();
}
async function keepTake(t) {
  stopSongPreview();
  await openProjectObject(t.project);
  t.kept = true; t.project = JSON.parse(JSON.stringify(project));
  T.mode = 'song'; T.songPos = T.marker = 0; renderTransport();
  loadSongs(); refreshCreate();
  toast(`“${project.name}” is open. Press play, or dig into Beat, Notes and Song.`, { action: { label: 'Play', run: () => { setMode('song'); if (!T.playing) play(); } } });
}
function planFromProject(P) {
  const s = P.song || {};
  return { title: P.name, prompt: s.prompt || '', tags: s.tags || [], style: s.style || 'pop', bpm: P.bpm, key: P.key, scale: P.scale, vocal: false,
    prog: s.prog || { verse: [0, 5, 2, 6], chorus: [3, 4, 0, 5], bridge: [5, 3, 0, 4] },
    sections: (P.playlist.markers || []).map((m, i, a) => ({ name: m.name, bars: Math.max(4, Math.round(((a[i + 1] ? a[i + 1].start : songLength(P)) - m.start) / 16 / 4) * 4), lyrics: m.lyrics || '' })) };
}
function extendSong() {
  const P0 = project;
  if (!P0.song || !P0.song.roles) { toast('Extend works on songs made in Create.'); return; }
  const marks = [...P0.playlist.markers].sort((a, b) => a.start - b.start);
  const ci = marks.map(m => sectionInfo(m.name).type === 'chorus').lastIndexOf(true);
  if (ci < 0) { toast('This song has no chorus to build on yet.'); return; }
  mutate(P => {
    const s = P.song, R = s.roles, TR = s.tracks || { drums: 0, bass: 1, chords: 2, lead: 3 }, prog = (s.prog && s.prog.bridge) || [5, 3, 0, 4];
    const ch = id => P.channels.find(c => c.id === id);
    const mk = (role, name, fill) => { let p = P.patterns.find(x => x.role === role); if (!p) { p = { ...newPattern(P.patterns.length, 64), name, role, color: COLORS[3] }; fill(p); P.patterns.push(p); } return p; };
    const parts = [];
    if (ch(R.chords)) parts.push([TR.chords, mk('chords:bridge', 'Bridge Chords', p => { p.notes[R.chords] = genChordNotes(P, prog, 'sustain'); if (ch(R.pad)) p.notes[R.pad] = genChordNotes(P, prog, 'sustain'); })]);
    if (ch(R.bass)) parts.push([TR.bass, mk('bass:bridge', 'Bridge Bass', p => { const b = ch(R.bass); let ns = genBass(P, prog, 'simple', null); if (b.kind === 'drum') ns = ns.map(n => ({ ...n, n: to808(n.n) })); p.notes[R.bass] = ns; })]);
    if (ch(R.lead)) parts.push([TR.lead, mk('melody:bridge', 'Bridge Melody', p => { p.notes[R.lead] = genMelody(P, prog, 2); })]);
    const light = P.patterns.find(x => x.role === 'drums:light');
    if (light) parts.push([TR.drums, light]);
    const ms = [...P.playlist.markers].sort((a, b) => a.start - b.start), chorus = ms[ci], cEnd = ms[ci + 1] ? ms[ci + 1].start : songLength(P);
    const chorusClips = P.playlist.clips.filter(c => c.start >= chorus.start && c.start < cEnd);
    const outro = ms.slice(ci + 1).find(m => sectionInfo(m.name).type === 'outro');
    const at = outro ? outro.start : songLength(P), bridgeLen = 128, add = bridgeLen + (cEnd - chorus.start);
    for (const c of P.playlist.clips) if (c.start >= at) c.start += add;
    for (const m of P.playlist.markers) if (m.start >= at) m.start += add;
    for (const [track, p] of parts) P.playlist.clips.push({ id: uid(), kind: 'pattern', ref: p.id, track, start: at, len: bridgeLen, gain: 1, offset: 0 });
    for (const c of chorusClips) P.playlist.clips.push({ ...c, id: uid(), start: at + bridgeLen + (c.start - chorus.start) });
    P.playlist.markers.push({ id: uid(), start: at, name: 'Bridge', lyrics: '' }, { id: uid(), start: at + bridgeLen, name: 'Final Chorus', lyrics: chorus.lyrics || '' });
    P.playlist.markers.sort((a, b) => a.start - b.start);
  });
  toast(`Added a bridge and a final chorus. The song is now ${songLength(project) / 16} bars.`, { action: { label: 'Play', run: () => { setMode('song'); if (!T.playing) play(); } } });
}

/* ---------- previews (rendered excerpts) ---------- */
let songPrev = null;
function stopSongPreview() {
  if (songPrev) { try { songPrev.src.stop(); } catch (e) { /* ok */ } songPrev = null; }
  if (ui.pvKey) { ui.pvKey = null; ui.pvLoading = false; refreshCreate(); }
}
async function previewProject(P, key) {
  if (!ensureCtx()) return;
  const same = ui.pvKey === key; stopSongPreview(); if (same) return;
  if (T.playing) halt();
  ui.pvKey = key; ui.pvLoading = true; refreshCreate();
  try {
    const ch = (P.playlist.markers || []).find(m => sectionInfo(m.name).type === 'chorus');
    const from = ch ? ch.start : 0, to = Math.min(songLength(P), from + 12 * 16);
    const { buffer, frames } = await renderOffline(P, 'song', 44100, { from, to });
    if (ui.pvKey !== key) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(), now = ctx.currentTime, dur = frames / buffer.sampleRate;
    src.buffer = buffer; g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.95, now + 0.04);
    g.gain.setValueAtTime(0.95, now + Math.max(0.1, dur - 1.5)); g.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(g); g.connect(ctx.destination); src.start(now, 0, dur);
    songPrev = { src, key }; ui.pvLoading = false; refreshCreate();
    src.onended = () => { if (songPrev && songPrev.src === src) { songPrev = null; ui.pvKey = null; refreshCreate(); } };
  } catch (e) { ui.pvKey = null; ui.pvLoading = false; refreshCreate(); toast(`Preview failed: ${e.message}`, { kind: 'error' }); }
}

/* ---------- your songs ---------- */
async function loadSongs() {
  try {
    const list = await Store.all('projects');
    ui.songs = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40).map(r => { try { return { id: r.id, P: normalizeProject(JSON.parse(r.data)), updatedAt: r.updatedAt }; } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { ui.songs = []; }
  refreshCreate();
}
function refreshCreate() { if (ui.tab === 'create') renderView(); }
function highlightLyrics(step) {
  const secs = $$('.ly-sec', $('#view')); if (!secs.length) return;
  const ms = [...(project.playlist.markers || [])].sort((a, b) => a.start - b.start);
  let cur = -1; if (step >= 0 && T.mode === 'song') ms.forEach((m, i) => { if (m.start <= step) cur = i; });
  secs.forEach((s, i) => s.classList.toggle('now', i === cur));
}

/* ---------- Create view ---------- */
function pvButton(P, key, label) {
  const on = ui.pvKey === key;
  return el('button', { class: 'pv-btn' + (on ? ' on' : ''), 'aria-label': (on ? 'Stop ' : 'Preview ') + label, title: on ? 'Stop preview' : 'Hear the chorus', onclick: e => { e.stopPropagation(); previewProject(P, key); } },
    on && ui.pvLoading ? el('span', { class: 'spin' }) : icon(on ? 'stop' : 'play'));
}
function takeCard(t, i) {
  const P = t.project, pl = t.plan, len = songLength(P) * 15 / P.bpm, key = 'take:' + t.id;
  return el('article', { class: 'c-take' + (t.kept ? ' kept' : '') },
    el('div', { class: 'c-take-top' }, pvButton(P, key, pl.title),
      el('div', { class: 'c-take-body' }, el('span', { class: 'c-k' }, t.kept ? `Take ${i + 1} · kept` : `Take ${i + 1}`), el('h3', {}, pl.title))),
    el('div', { class: 'c-meta' }, `${STYLES[pl.style].label} · ${pl.bpm} BPM · ${KEY_NAMES[pl.key]} ${SCALES[pl.scale].label} · ${fmtDur(len)}`),
    el('div', { class: 'c-tagline sec-line' }, pl.sections.map(s => el('span', {}, s.name))),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn primary sm', onclick: () => keepTake(t) }, t.kept ? 'Open again' : 'Keep and open')));
}
function nowOpenCard() {
  const P = project, s = P.song, len = songLength(P) * 15 / P.bpm, ms = [...(P.playlist.markers || [])].sort((a, b) => a.start - b.start);
  const hasWords = ms.some(m => m.lyrics);
  return el('section', { class: 'c-card c-now' },
    el('div', { class: 'c-take-body' },
      el('span', { class: 'c-k' }, 'Open in the studio'),
      el('h3', {}, P.name),
      el('div', { class: 'c-meta' }, `${P.bpm} BPM · ${keyLabel(P)} · ${P.playlist.clips.length ? fmtDur(len) : 'no arrangement yet'}`),
      el('div', { class: 'btn-row', style: { marginTop: '6px' } },
        el('button', { class: 'btn primary sm', onclick: () => { setMode('song'); if (!T.playing) play(); else togglePlay(); } }, T.playing ? 'Pause' : 'Play song'),
        s ? el('button', { class: 'btn sm', onclick: extendSong, title: 'Add a bridge and a final chorus' }, 'Extend') : null,
        s ? el('button', { class: 'btn sm', onclick: () => createSong(planFromProject(P)), title: 'Two new takes with the same structure' }, 'New takes of this') : null,
        el('button', { class: 'btn sm ghost', onclick: () => setTab('playlist') }, 'Open in Song'),
        el('button', { class: 'btn sm ghost', onclick: () => setTab('vocal') }, 'Record a vocal'))),
    ms.length && !hasWords ? el('div', { class: 'ly' },
      el('h3', { class: 'c-sub' }, 'Sections'),
      el('div', { class: 'c-tagline sec-line' }, ms.map((m, i) => el('span', { class: 'ly-sec', 'data-i': String(i) }, m.name))))
    : ms.length ? el('div', { class: 'ly' },
      el('h3', { class: 'c-sub' }, 'Lyrics'),
      ms.map((m, i) => el('div', { class: 'ly-sec', 'data-i': String(i) },
        el('h4', {}, m.name, el('button', { class: 'ly-edit', onclick: () => { ui.plMark = m.id; ui.plSel = null; setTab('playlist'); } }, m.lyrics ? 'Edit' : 'Add words')),
        m.lyrics ? el('p', {}, m.lyrics) : null))) : null);
}
function songsGrid() {
  const list = (ui.songs || []).filter(x => x.id !== project.id);
  if (!list.length) return null;
  return el('section', { class: 'c-sec' }, el('h3', { class: 'c-sub' }, 'Your songs'),
    el('div', { class: 'c-songs' }, list.map(x => {
      const P = x.P, key = 'song:' + x.id;
      return el('article', { class: 'c-song' },
        P.playlist.clips.length ? pvButton(P, key, P.name) : el('span', { class: 'pv-btn idle', 'aria-hidden': 'true' }, icon('play')),
        el('div', { class: 'c-take-body' }, el('b', {}, P.name),
          el('span', { class: 'c-meta' }, `${P.bpm} BPM · ${keyLabel(P)} · ${new Date(x.updatedAt || 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`)),
        el('button', { class: 'btn sm', onclick: () => { stopSongPreview(); loadProject(x.id).then(loadSongs); } }, 'Open'));
    })));
}
function renderCreate(v) {
  if (!ui.songs) loadSongs();
  const tags = el('div', { class: 'chips c-tags' }, CREATE_TAGS.map(label => el('button', { class: 'chip', 'aria-pressed': String(ui.cTags.includes(label)), onclick: e => {
    const i = ui.cTags.indexOf(label); if (i >= 0) ui.cTags.splice(i, 1); else ui.cTags.push(label);
    e.currentTarget.setAttribute('aria-pressed', String(i < 0));
  } }, label)));
  const status = ui.cStatus ? el('div', { class: 'sdk-status ' + (ui.cStatus.kind || ''), 'aria-live': 'polite' }, ui.cStatus.text) : null;
  const composer = el('section', { class: 'c-card c-composer' },
    el('h2', { class: 'c-h' }, 'What do you want to make?'),
    el('textarea', { class: 'c-desc', rows: '3', 'aria-label': 'Describe your song', placeholder: 'Describe it: “a dreamy late-night pop song about driving home with the windows down”', value: ui.cDesc || '', oninput: e => { ui.cDesc = e.target.value; } }),
    tags,
    el('div', { class: 'btn-row' },
      el('label', { class: 'c-toggle' }, el('input', { type: 'checkbox', checked: !!ui.cCustom, onchange: e => { ui.cCustom = e.target.checked; renderView(); } }), 'My own title and lyrics')),
    ui.cCustom ? el('div', { class: 'c-custom' },
      el('input', { type: 'text', 'aria-label': 'Song title', placeholder: 'Title', value: ui.cTitle || '', oninput: e => { ui.cTitle = e.target.value; } }),
      el('textarea', { rows: '7', 'aria-label': 'Your lyrics', placeholder: '[Verse]\nYour words here\n\n[Chorus]\nThe part everyone sings', value: ui.cLyrics || '', oninput: e => { ui.cLyrics = e.target.value; } })) : null,
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary big', disabled: !!ui.cBusy, onclick: () => createSong() }, ui.cBusy ? 'Creating…' : 'Create'),
      ui.cBusy && createCtl ? el('button', { class: 'btn', onclick: () => createCtl && createCtl.abort() }, 'Stop') : null,
      el('span', { class: 'hint c-who' }, sampleFn ? 'Claude plans the title, structure and chords, and Tapehouse builds the music.' : 'Tapehouse builds the whole song from your description and tags.')),
    status);
  const body = el('div', { class: 'view-body create', 'data-scroll': 'create' }, composer);
  if (ui.takes && ui.takes.length) body.append(el('section', { class: 'c-sec' }, el('h3', { class: 'c-sub' }, 'New takes'), el('div', { class: 'c-takes' }, ui.takes.map(takeCard))));
  body.append(nowOpenCard());
  const grid = songsGrid(); if (grid) body.append(grid);
  v.append(tipStrip('create') || '', body);
  if (T.playing && T.shown >= 0) highlightLyrics(T.shown);
}

/* ---------- stems ---------- */
async function exportStems() {
  const P = project, used = usedChannels(P);
  if (!used.length) { toast('There’s nothing to export yet.'); return; }
  const busy = toast('Rendering stems…', { sticky: true, kind: 'busy' }), files = [];
  try {
    for (let i = 0; i < used.length; i++) {
      busy.set(`Rendering stem ${i + 1} of ${used.length}: ${used[i].name}`);
      const Q = JSON.parse(JSON.stringify(P)); Q.channels.forEach(c => { c.mute = c.id !== used[i].id; });
      Q.playlist.clips = Q.playlist.clips.filter(c => c.kind !== 'audio');
      const { buffer, frames } = await renderOffline(Q, P.playlist.clips.length ? 'song' : 'pattern', 44100, null, { noMaster: true });
      files.push({ name: `${String(i + 1).padStart(2, '0')} ${safeFile(used[i].name)}.wav`, data: new Uint8Array(encodeWav(buffer, frames)) });
    }
    if (P.playlist.clips.some(c => c.kind === 'audio')) {
      busy.set('Rendering the audio clips stem');
      const Q = JSON.parse(JSON.stringify(P)); Q.channels.forEach(c => { c.mute = true; });
      const { buffer, frames } = await renderOffline(Q, 'song', 44100, null, { noMaster: true });
      files.push({ name: `${String(files.length + 1).padStart(2, '0')} Audio clips.wav`, data: new Uint8Array(encodeWav(buffer, frames)) });
    }
    busy.done();
    await saveFile(`${safeFile(P.name)} stems.zip`, makeZip(files));
  } catch (e) { busy.done(); toast(`Couldn’t render stems: ${e.message}`, { kind: 'error' }); }
}

boot();
