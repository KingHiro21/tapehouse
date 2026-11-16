/* =====================================================================
   Part 8: Vocal Suite. One hardware-style screen for a vocal track: Tune, Cleanup, Tone, Dynamics and Space,
   input and output with meters, presets, and an assistant you can type or talk to.
   It drives the same effects as the mixer, so everything stays editable in Mix.
   ===================================================================== */

/* ---------- the chain behind the suite ---------- */
const SUITE_ORDER = ['gate', 'level', 'tune', 'eqm', 'eq', 'comp', 'comp2', 'sat', 'tamer', 'deess', 'width', 'delay', 'reverb', 'safe'];
const SUITE_DEF = { // added only when a control needs them, set so they change nothing until you turn them
  gate: ['th.vocal-comp', { mode: 'gate', target: -80 }],
  level: ['th.vocal-comp', { mode: 'auto', target: -20 }],
  tune: ['th.autotune', { retune: 20, humanize: 0.15, flex: 0.1, amount: 1, formant: 0, voice: 'tenor', scale: 'key', fcorr: 'off', root: -1, smode: 'minor' }],
  eqm: ['th.match-eq', { lowcut: 30, g0: 0, g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0, g7: 0, g8: 0, g9: 0, g10: 0 }],
  eq: ['th.vocal-eq', { lowcut: 30, mud: 0, mudFreq: 280, presence: 0, presFreq: 3000, air: 0 }],
  comp: ['th.vocal-comp', { mode: 'opto', amount: 0.05, output: 0 }],
  comp2: ['th.vocal-comp', { mode: 'clean', amount: 0.025, ratio: 2, attack: 10, release: 150, output: 0 }],
  sat: ['th.saturator', { drive: 0, tone: 9000, mix: 0, output: 0 }],
  tamer: ['th.deharsh', { depth: 0, sens: 0.5 }],
  deess: ['th.deesser', { freq: 6500, thresh: -24, range: 0 }],
  width: ['th.doubler', { mix: 0, spread: 14, depth: 0.5, voices: 2 }],
  delay: ['th.tape-delay', { time: 0.5, feedback: 0.25, tone: 3500, mix: 0 }],
  reverb: ['th.room-reverb', { size: 1.8, damp: 8500, predelay: 0.02, mix: 0 }],
  safe: ['th.limiter', { ceiling: -1, release: 80 }],
};
const SUITE_MODS = [['tune', 'Tune', ['tune']], ['cleanup', 'Cleanup', ['gate', 'tamer', 'deess']], ['tone', 'Tone', ['eqm', 'eq', 'sat']], ['dynamics', 'Dynamics', ['level', 'comp', 'comp2']], ['space', 'Space', ['width', 'delay', 'reverb']]];
/* Which effect on the insert plays which part, whether it came from a preset, Listen & Match or the suite itself. */
function suiteClassify(fx) {
  const map = {}; let comps = 0;
  for (const f of fx) {
    let r = null;
    switch (f.plugin) {
      case 'th.autotune': r = 'tune'; break;
      case 'th.match-eq': r = 'eqm'; break;
      case 'th.vocal-eq': r = 'eq'; break;
      case 'th.saturator': r = 'sat'; break;
      case 'th.deharsh': r = 'tamer'; break;
      case 'th.deesser': r = 'deess'; break;
      case 'th.doubler': case 'th.chorus': r = 'width'; break;
      case 'th.tape-delay': case 'th.pingpong': r = 'delay'; break;
      case 'th.room-reverb': r = 'reverb'; break;
      case 'th.limiter': r = 'safe'; break;
      case 'th.vocal-comp': { const m = (f.params || {}).mode; r = m === 'gate' ? 'gate' : m === 'auto' ? 'level' : (++comps === 1 ? 'comp' : comps === 2 ? 'comp2' : null); break; }
      default: r = null;
    }
    if (r && !map[r]) map[r] = f;
  }
  return map;
}
function suiteEnsure(P, ins, roles) {
  const m = P.mixer[ins];
  for (const role of [...roles, 'safe']) {
    let map = suiteClassify(m.fx); if (map[role] || !SUITE_DEF[role]) continue;
    const [pl, params] = SUITE_DEF[role], f = fxSlot(pl, { ...params }), idx = SUITE_ORDER.indexOf(role);
    let pos = 0; m.fx.forEach((x, i) => { const r = Object.keys(map).find(k => map[k] === x); if (r && SUITE_ORDER.indexOf(r) < idx) pos = i + 1; });
    if (role !== 'safe' && map.safe) pos = Math.min(pos, m.fx.indexOf(map.safe));
    m.fx.splice(pos, 0, f);
  }
}

/* ---------- Smart key: Tune hears the beat ---------- */
// Renders the song without the vocals, measures which notes the music sits on (harmonic pitch salience folded onto
// 12 notes, with the bass line counted on its own), and matches that against the 24 major and minor keys.
// A Tune set to Smart snaps to the result; it re-listens by itself whenever the beat changes.
const SK = { timer: 0, busy: false, again: false, status: '' };
const SK_BASS_MAJ = [6, 0, 2, 0, 3, 3.5, 0, 4.5, 0, 2.5, 0, 1.5], SK_BASS_MIN = [6, 0, 2, 3.5, 0, 3, 0, 4.5, 2.5, 0, 2.5, 0.5];
const VOCAL_NAME = /vocal|vox|voice|acapella|a cappella|adlib|ad-lib|singing|^take|recording/i;
function suiteVocalTracks(P) {
  const out = new Set();
  P.playlist.tracks.forEach((t, i) => {
    const m = (t.insert | 0) > 0 ? P.mixer[t.insert | 0] : null, aud = P.playlist.clips.filter(c => c.track === i && c.kind === 'audio');
    const recs = aud.length && aud.every(c => { const it = lib.get(c.ref); return it && /record/i.test(it.folder || ''); });
    if ((m && m.fx.some(f => f.plugin === 'th.autotune')) || VOCAL_NAME.test(t.name || '') || recs || i === REC.armed) out.add(i);
  });
  return out;
}
function skHash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
/* Everything that changes what the beat plays: its clips, the patterns' notes, the instruments. Not the vocals, not the mix. */
function beatSig(P) {
  const voc = suiteVocalTracks(P);
  const clips = P.playlist.clips.filter(c => !voc.has(c.track) && P.playlist.tracks[c.track] && !P.playlist.tracks[c.track].mute).map(c => [c.kind, c.ref, c.start, c.len, c.offset || 0, c.gain, c.pitch || 0]);
  return skHash(JSON.stringify([P.bpm, clips, P.patterns.map(p => [p.id, p.length, p.notes]), P.channels.map(c => [c.id, c.kind, c.plugin, c.sampleId, c.mute, c.params])]));
}
function smartKeyWanted() { return true; } // the song key follows the beat whether or not anything is tuned yet
const suiteSameNotes = (r1, m1, r2, m2) => tuneMask({ key: r1, scale: m1 }, 'key', -1) === tuneMask({ key: r2, scale: m2 }, 'key', -1);
/* Where the song key came from, in words. */
function songKeySource() {
  const P = project, sk = P.smartKey;
  if (SK.busy) return 'listening to your beat…';
  if (P.keySet) return sk && sk.src === 'beat' && !suiteSameNotes(P.key, P.scale, sk.root, sk.mode) ? `the song key, set by you (your beat sounds like ${suiteKeyName(sk.root, sk.mode)} ${sk.mode})` : 'the song key, set by you';
  if (sk && sk.src === 'beat') return `the song key, heard in your beat${sk.conf < 0.3 ? ' (not sure, check it)' : ''}`;
  return 'the song key. Add a beat and it follows the beat';
}
function smartKeySoon(ms = 1800) { clearTimeout(SK.timer); SK.timer = setTimeout(() => { smartKeyRun(); }, ms); }
function smartKeyRefresh() { const a = document.activeElement; if (ui.tab === 'vocal' && !ui.vsDragged && !(a && a.closest && a.closest('.vs') && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) renderView(); }
async function smartKeyRun(force = false) {
  const P = project;
  if (!force && !smartKeyWanted(P)) return null;
  if (REC.state !== 'idle') { smartKeySoon(4000); return null; } // never compete with a recording
  const sig = beatSig(P);
  if (!force && P.smartKey && P.smartKey.sig === sig) return P.smartKey;
  if (SK.busy) { SK.again = true; return null; }
  SK.busy = true; SK.status = 'listening'; smartKeyRefresh();
  try {
    let res = await detectBeatKey(P);
    if (!res || res.conf < 0.2) { const v = await detectVocalKey(P); if (v && (!res || v.conf > res.conf)) res = v; }
    if (project !== P) return null; // another song was opened meanwhile
    const prev = P.smartKey, next = res ? { ...res, sig } : { root: P.key, mode: SCALES[P.scale] && SCALES[P.scale].steps.includes(4) ? 'major' : 'minor', conf: 0, src: 'song', sig, alt: [] };
    P.smartKey = next;
    // One key for the song: unless you've set it yourself, it follows the beat, so the key at the top, the piano roll and Tune agree.
    // Same notes under another name (A minor / C major) leave your key's name alone.
    const name = res ? `${suiteKeyName(next.root, next.mode)} ${next.mode}` : '', fresh = !prev || prev.root !== next.root || prev.mode !== next.mode;
    const heard = res && res.src === 'beat' && res.conf >= 0.3, differs = res && !suiteSameNotes(P.key, P.scale, next.root, next.mode);
    if (heard && differs && !P.keySet) { P.key = next.root; P.scale = next.mode; renderTransport(); toast(`Your beat is in ${name}, so that’s the song key now. Tune and the piano roll follow it.`, { ms: 5000 }); }
    else if (res && differs && fresh) toast(res.src === 'vocal' ? `Your singing sounds like ${name}. The song key is ${keyLabel(P)}.` : `Your beat sounds like ${name}, but you set the song key to ${keyLabel(P)}.`, { action: { label: `Use ${name}`, run: () => setKey(next.root, next.mode) }, ms: 9000 });
    scheduleSave(); if (engine) engine.sync(); renderTransport();
    SK.status = '';
    return next;
  } catch (e) { console.warn('Smart key', e); SK.status = 'failed'; return null; }
  finally { SK.busy = false; smartKeyRefresh(); if (SK.again) { SK.again = false; smartKeySoon(400); } }
}
/* What the beat plays. Notes the app plays itself are read straight from the patterns (exact, instant);
   imported audio is listened to from the file; only pitched samplers get rendered, since their sample's own pitch is unknown. */
async function detectBeatKey(P) {
  const voc = suiteVocalTracks(P), sd = 60 / P.bpm / 4, on = i => P.playlist.tracks[i] && !P.playlist.tracks[i].mute && !voc.has(i);
  const clips = P.playlist.clips.filter(c => on(c.track)), groups = [];
  // 1) notes: synths, and the 808 (it plays 36 + tune + note − 60)
  const placements = clips.length ? clips.filter(c => c.kind === 'pattern').map(c => [P.patterns.find(p => p.id === c.ref), c.start, c.len]).filter(x => x[0])
    : P.patterns.map(p => [p, 0, p.length]);
  const sym = { C: new Float64Array(12), B: new Float64Array(12), cue: new Float64Array(12), secs: 0 }, low = new Map();
  const pitched = P.channels.filter(ch => !ch.mute && (ch.kind === 'synth' || (ch.kind === 'drum' && ch.drum === '808')));
  let samplerNotes = false;
  for (const [pat, start, len] of placements) {
    for (const ch of P.channels) if (!ch.mute && ch.kind === 'sampler' && new Set((pat.notes[ch.id] || []).map(n => n.n)).size >= 3) samplerNotes = true;
    for (const ch of pitched) {
      const off = ch.kind === 'drum' ? (+(ch.params || {}).tune || 0) - 24 : 0, evs = (pat.notes[ch.id] || []).map(n => [n.s, n.l, n.n + off, n.v ?? 0.8]);
      if (ch.kind === 'drum' && pat.steps[ch.id]) pat.steps[ch.id].forEach((v, s) => { if (v > 0) evs.push([s, 4, 60 + off, v]); });
      for (const [s, l, n, v] of evs) for (let r = 0; start + r * pat.length + s < start + len; r++) {
        const at = start + r * pat.length + s, dur = Math.min(l, start + len - at, ch.kind === 'drum' ? 8 : 64);
        sym.C[((n % 12) + 12) % 12] += dur * sd * v; sym.secs += dur * sd * v;
        for (let k = 0; k < dur; k++) { const q = at + k, cur = low.get(q); if (n < 60 && (cur == null || n < cur)) low.set(q, n); }
      }
    }
  }
  for (const [q, n] of low) { const pc = ((n % 12) + 12) % 12, ph = q % 64; sym.B[pc] += sd; if (q % 16 < 4) sym.cue[pc] += ph < 4 ? 1 : ph >= 32 && ph < 36 ? 0.4 : 0.15; }
  if (sym.secs > 0) groups.push(sym);
  // 2) imported audio, straight from the file (up to two and a half minutes in all)
  let budget = 150;
  for (const c of clips.filter(c => c.kind === 'audio').sort((a, b) => a.start - b.start)) {
    const buf = buffers.get(c.ref); if (!buf || budget <= 0) continue;
    const t0 = +c.offset || 0, t1 = Math.min(buf.duration, t0 + c.len * sd, t0 + budget); if (t1 - t0 < 2) continue;
    const g = { C: new Float64Array(12), B: new Float64Array(12), cue: new Float64Array(12), secs: 0 };
    skChroma(buf, t0, t1, g, c.start, sd); budget -= t1 - t0;
    if (g.secs > 0) groups.push(g);
  }
  // 3) samplers played as instruments: render just them
  if (samplerNotes) {
    const Q = JSON.parse(JSON.stringify(P));
    Q.channels.forEach(ch => { if (ch.kind !== 'sampler') ch.mute = true; });
    Q.playlist.tracks.forEach((t, i) => { if (voc.has(i)) t.mute = true; }); Q.playlist.clips = Q.playlist.clips.filter(c => c.kind === 'pattern');
    Q.mixer.forEach(m => { m.fx = []; });
    const what = Q.playlist.clips.length ? 'song' : 'pattern', full = what === 'song' ? songLength(Q) : null;
    try {
      const { buffer, frames } = await renderOffline(Q, what, 22050, what === 'song' ? { from: 0, to: Math.min(full, Math.ceil(60 / sd)) } : null, { noMaster: true });
      const g = { C: new Float64Array(12), B: new Float64Array(12), cue: new Float64Array(12), secs: 0 };
      skChroma(buffer, 0, frames / buffer.sampleRate, g, 0, sd); if (g.secs > 0) groups.push(g);
    } catch (e) { /* no samples loaded */ }
  }
  if (!groups.length) return null;
  // each source counts by how long it plays
  const C = new Float64Array(12), B = new Float64Array(12), cue = new Float64Array(12), tot = groups.reduce((s, g) => s + g.secs, 0);
  for (const g of groups) for (const [dst, src] of [[C, g.C], [B, g.B], [cue, g.cue]]) { const sum = src.reduce((a, b) => a + b, 0); if (sum > 0) for (let i = 0; i < 12; i++) dst[i] += src[i] / sum * g.secs / tot; }
  if (tot < 2) return null;
  const k = skKey(C, B, cue); return k && { ...k, src: 'beat' };
}
/* No beat to hear: use the melody of the vocal already on the track (Listen & Match's measurement if there is one). */
async function detectVocalKey(P) {
  for (const m of P.mixer) if (m.match && m.match.a && m.match.a.key && m.match.a.key.conf >= 0.6) return { root: m.match.a.key.root, mode: m.match.a.key.scale === 'major' ? 'major' : 'minor', conf: clamp((m.match.a.key.conf - 0.6) * 2.5, 0.2, 0.9), src: 'vocal', alt: [] };
  const voc = suiteVocalTracks(P), clip = P.playlist.clips.filter(c => c.kind === 'audio' && voc.has(c.track) && buffers.get(c.ref)).sort((a, b) => b.len - a.len)[0];
  if (!clip) return null;
  try { const a = await analyzeVoice(buffers.get(clip.ref)); if (a.key && a.key.conf >= 0.6) return { root: a.key.root, mode: a.key.scale === 'major' ? 'major' : 'minor', conf: clamp((a.key.conf - 0.6) * 2.5, 0.2, 0.9), src: 'vocal', alt: [] }; } catch (e) { /* too short or silent */ }
  return null;
}
/* Note content of audio: whitened spectrum, harmonic sum per semitone (E1 to C7), tuned to the recording's own A.
   t0..t1 in seconds of the file; step0 is the song step where t0 plays, sd the length of a step, to find each bar's first beat. */
function skChroma(buf, t0, t1, acc, step0, sd) {
  const sr0 = buf.sampleRate, dec = sr0 > 32000 ? 2 : 1, sr = sr0 / dec, a0 = Math.floor(t0 * sr0), a1 = Math.min(buf.length, Math.floor(t1 * sr0));
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, len = Math.floor((a1 - a0) / dec);
  const x = new Float32Array(len); // mono, halved in rate with a gentle low-pass when it's 44.1/48 kHz
  if (dec === 2) for (let i = 0; i < len; i++) { const j = a0 + 2 * i, m = k => { const q = Math.min(a1 - 1, Math.max(a0, j + k)); return (L[q] + R[q]) * 0.5; }; x[i] = (m(-1) + 2 * m(0) + m(1)) * 0.25; }
  else for (let i = 0; i < len; i++) x[i] = (L[a0 + i] + R[a0 + i]) * 0.5;
  const N = 8192, half = N / 2, bin = sr / N, nfr = Math.floor(len / N);
  if (nfr < 2) return;
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(half), wm = new Float64Array(half), cs = new Float64Array(half + 1), lo = new Int32Array(half), hi = new Int32Array(half);
  for (let k = 0; k < half; k++) { lo[k] = Math.max(0, Math.floor(k * 0.891)); hi[k] = Math.min(half, Math.ceil(k * 1.122) + 1); }
  const spec = (f, at0) => { // what stands above its neighbourhood (a sixth of an octave either side)
    const s = at0 != null ? at0 : f * N; if (s < 0 || s + N > len) return null; let e = 0;
    for (let i = 0; i < N; i++) { const v = x[s + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    const db = 10 * Math.log10(e / N + 1e-12); if (db < -55) return null;
    lmFFT(re, im); let mx = 0;
    for (let k = 0; k < half; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); cs[k + 1] = cs[k] + mag[k]; }
    for (let k = 0; k < half; k++) { const env = (cs[hi[k]] - cs[lo[k]]) / (hi[k] - lo[k]); wm[k] = Math.max(0, mag[k] - env); if (wm[k] > mx) mx = wm[k]; }
    return mx > 0 ? { mx, db } : null;
  };
  let sx = 0, sy = 0; // its tuning (A=432, a sped-up sample…): where its peaks sit between semitones, on average
  for (let f = 0; f < nfr; f += 2) {
    const r = spec(f); if (!r) continue;
    for (let k = Math.ceil(100 / bin); k < Math.min(half - 1, 2000 / bin); k++) {
      if (!(wm[k] > wm[k - 1] && wm[k] >= wm[k + 1] && wm[k] > 0.15 * r.mx)) continue;
      const a = Math.log(wm[k - 1] + 1e-9), b = Math.log(wm[k]), c = Math.log(wm[k + 1] + 1e-9), d = clamp(0.5 * (a - c) / (a - 2 * b + c || 1e-9), -0.5, 0.5);
      const ang = (1200 * Math.log2((k + d) * bin / 440) / 100) * 2 * Math.PI; sx += wm[k] * Math.cos(ang); sy += wm[k] * Math.sin(ang);
    }
  }
  const tune = sx || sy ? Math.atan2(sy, sx) / (2 * Math.PI) : 0; acc.tune = Math.round(tune * 100);
  const S = new Float64Array(97), at = fr => { const i = Math.floor(fr / bin); return i + 1 < half ? Math.max(wm[i], wm[i + 1]) : 0; };
  const salience = r => {
    let smx = 0;
    for (let p = 28; p <= 96; p++) {
      const f0 = 440 * Math.pow(2, (p - 69 + tune) / 12); let s = 0, w = 1;
      for (let h = 1; h <= 6; h++, w *= 0.84) { const fh = f0 * h; if (fh > sr * 0.45) break; s += w * Math.min(at(fh), r.mx); }
      if (at(f0) < 0.05 * r.mx) s *= 0.25; // a note needs its own fundamental, or it's only a harmonic of something lower
      S[p] = s; if (s > smx) smx = s;
    }
    return smx;
  };
  for (let f = 0; f < nfr; f++) {
    const r = spec(f); if (!r) continue;
    const smx = salience(r); if (!(smx > 0)) continue;
    const wt = clamp((r.db + 55) / 30, 0.1, 1);
    for (let p = 33; p <= 96; p++) acc.C[p % 12] += wt * S[p] / smx;
    for (let p = 28; p <= 52; p++) acc.B[p % 12] += wt * S[p] / smx;
    acc.secs += N / sr;
  }
  // the bass note on the first beat of each bar, phrase starts counting most: that's usually the home chord
  for (let k = Math.ceil(step0 / 16); ; k++) {
    const t = t0 + (k * 16 - step0) * sd + 0.02; if (t + N / sr > t1) break;
    const r = spec(0, Math.round((t - t0) * sr)); if (!r || !(salience(r) > 0)) continue;
    let bmx = 0, bpc = -1; for (let p = 28; p <= 52; p++) if (S[p] > bmx) { bmx = S[p]; bpc = p % 12; }
    const ph = (k * 16) % 64; if (bpc >= 0) acc.cue[bpc] += ph === 0 ? 1 : ph === 32 ? 0.4 : 0.15;
  }
}
/* The key: note content against the major/minor profiles, plus the bass, plus how much of it fits the key's seven notes.
   Relative keys (A minor / C major) use the same notes, so Tune is right either way; which one it is comes from the bass
   at the start of each phrase. Notes the beat leans on outside the scale (a harmonic-minor V) are kept as extras. */
function skKey(C, B, cue) {
  const rot = (prof, r) => prof.map((_, i) => prof[(i - r + 12) % 12]), tot = C.reduce((a, b) => a + b, 0), bsum = B.reduce((a, b) => a + b, 0), all = [];
  if (!(tot > 0)) return null;
  const steps = { major: SCALES.major.steps, minor: SCALES.minor.steps }, inSet = (r, m) => steps[m].map(s => (r + s) % 12);
  for (let r = 0; r < 12; r++) for (const [mode, prof, bp] of [['major', KK_MAJOR, SK_BASS_MAJ], ['minor', KK_MINOR, SK_BASS_MIN]]) {
    const fit = inSet(r, mode).reduce((a, pc) => a + C[pc], 0) / tot;
    all.push({ root: r, mode, fit, s: lmCorr(C, rot(prof, r)) + (bsum > 0 ? 0.45 * lmCorr(B, rot(bp, r)) : 0) + 2 * fit });
  }
  all.sort((a, b) => b.s - a.s);
  const set = k => (k.root + (k.mode === 'minor' ? 3 : 0)) % 12, top = all[0], rival = all.find(k => set(k) !== set(top));
  let best = top; const rel = all.find(k => k !== top && set(k) === set(top)), csum = cue.reduce((a, b) => a + b, 0);
  if (rel && csum > 0) { // the same notes either way: the home note under the start of each phrase decides
    const ct = cue[top.root] / csum, cr = cue[rel.root] / csum;
    if (cr >= 0.35 && cr >= 2 * ct) best = rel; else if (!(ct >= 0.35 && ct >= 2 * cr) && rel.s + 0.6 * cr > top.s + 0.6 * ct) best = rel;
  }
  const own = inSet(best.root, best.mode), mean = own.reduce((a, pc) => a + C[pc], 0) / 7;
  // only the out-of-scale note songs really lean on: minor's raised 7th (harmonic minor), or major's flat 7th; and only when it's
  // clearly there, well above the spill of other out-of-scale notes (808 slides, passing tones)
  const outs = [...Array(12).keys()].filter(pc => !own.includes(pc)), cand = (best.root + (best.mode === 'minor' ? 11 : 10)) % 12;
  const spill = outs.filter(pc => pc !== cand).reduce((a, pc) => a + C[pc], 0) / (outs.length - 1);
  const extra = C[cand] >= 0.35 * mean && C[cand] >= 2.5 * spill ? [cand] : [];
  return { root: best.root, mode: best.mode, extra, conf: +clamp((top.s - rival.s) / 0.25, 0, 1).toFixed(2), fit: +best.fit.toFixed(2), alt: all.filter(k => k !== best).slice(0, 3).map(k => [k.root, k.mode, +k.s.toFixed(3)]) };
}
/* ---------- macro controls ---------- */
/* Gain the Compression knob gives back, per character, so turning it changes the squeeze, not the volume.
   Fitted from renders of a real vocal through the suite chain (dB lost at 50% and 100%). */
const SUITE_MAKEUP = { fet: [0.083, 0.00034], vox: [0.069, 0.00042], clean: [0.08, 0.00036], opto: [0, 0.00074] };
const suiteMakeup = (mode, v) => { const [a, b] = SUITE_MAKEUP[mode] || SUITE_MAKEUP.clean; return a * v + b * v * v; };
const suiteCompPos = amt => clamp((+amt - 0.05) / 0.0055, 0, 100);
const pct = v => Math.round(v) + '%', dbf = v => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' dB';
const SUITE_MACROS = {
  retune: { mod: 'tune', label: 'Retune', min: 0, max: 100, step: 1, def: 20, fmt: v => Math.round(v) + ' ms', roles: ['tune'], get: M => +(M.tune.params.retune ?? 20), set: v => ({ tune: { retune: Math.round(v) } }) },
  humanize: { mod: 'tune', label: 'Humanize', min: 0, max: 100, step: 1, def: 15, fmt: pct, roles: ['tune'], get: M => Math.round(+(M.tune.params.humanize ?? 0.2) * 100), set: v => ({ tune: { humanize: v / 100 } }) },
  flex: { mod: 'tune', label: 'Flex', min: 0, max: 100, step: 1, def: 10, fmt: pct, roles: ['tune'], get: M => Math.round(+(M.tune.params.flex ?? 0) * 100), set: v => ({ tune: { flex: v / 100 } }) },
  gate: { off: 0, mod: 'cleanup', label: 'Noise gate', min: 0, max: 100, def: 0, fmt: pct, roles: ['gate'], get: M => clamp((+M.gate.params.target + 80) / 0.5, 0, 100), set: v => ({ gate: { target: -80 + v * 0.5 } }) },
  deess: { off: 0, mod: 'cleanup', label: 'De-ess', min: 0, max: 100, def: 40, fmt: pct, roles: ['deess'], get: M => clamp(+M.deess.params.range / 0.12, 0, 100), set: v => ({ deess: { range: v * 0.12, thresh: -24 - v * 0.14 } }) },
  tamer: { off: 0, mod: 'cleanup', label: 'Tamer', min: 0, max: 100, def: 30, fmt: pct, roles: ['tamer'], get: M => clamp(+M.tamer.params.depth / 0.1, 0, 100), set: v => ({ tamer: { depth: v * 0.1 } }) },
  lowcut: { off: 30, mod: 'cleanup', label: 'Low cut', min: 30, max: 300, curve: 'log', def: 90, fmt: v => Math.round(v) + ' Hz', roles: M => [M.eqm ? 'eqm' : 'eq'], get: M => +((M.eqm || M.eq).params.lowcut ?? 90), set: (v, M) => ({ [M.eqm ? 'eqm' : 'eq']: { lowcut: Math.round(v) } }) },
  warmth: { off: 0, mod: 'tone', label: 'Warmth', min: -6, max: 6, def: 0, bipolar: true, fmt: dbf, roles: ['eq'], get: M => +(M.eq.params.mud ?? 0), set: v => ({ eq: { mud: +v.toFixed(1) } }) },
  presence: { off: 0, mod: 'tone', label: 'Presence', min: -6, max: 6, def: 0, bipolar: true, fmt: dbf, roles: ['eq'], get: M => +(M.eq.params.presence ?? 0), set: v => ({ eq: { presence: +v.toFixed(1) } }) },
  air: { off: 0, mod: 'tone', label: 'Air', min: -6, max: 8, def: 0, bipolar: true, fmt: dbf, roles: ['eq'], get: M => +(M.eq.params.air ?? 0), set: v => ({ eq: { air: +v.toFixed(1) } }) },
  grit: { off: 0, mod: 'tone', label: 'Grit', min: 0, max: 100, def: 0, fmt: pct, roles: ['sat'], get: M => +M.sat.params.mix > 0 ? clamp(+M.sat.params.drive / 0.006, 0, 100) : 0, set: v => ({ sat: { drive: +(v * 0.006).toFixed(3), mix: v < 1 ? 0 : 0.45 } }) },
  compress: { off: 0, mod: 'dynamics', label: 'Compression', min: 0, max: 100, def: 40, fmt: pct, roles: ['comp'], get: M => suiteCompPos(M.comp.params.amount ?? 0.3),
    set: (v, M) => { // the second compressor follows in proportion, and the output makes up what the squeeze takes
      const p = M.comp ? M.comp.params : { mode: 'opto', amount: 0.05, output: 0 }, a = +(0.05 + v * 0.0055).toFixed(3), old = suiteCompPos(p.amount ?? 0.3);
      const out = { comp: { amount: a, output: +clamp((+p.output || 0) + suiteMakeup(p.mode, v) - suiteMakeup(p.mode, old), -12, 12).toFixed(2) } };
      if (M.comp2 && M.comp) out.comp2 = { amount: +clamp(+M.comp2.params.amount * a / Math.max(0.02, +M.comp.params.amount || 0.05), 0.02, 0.9).toFixed(3) };
      return out; } },
  width: { off: 0, mod: 'space', label: 'Width', min: 0, max: 100, def: 20, fmt: pct, roles: ['width'], get: M => clamp(+M.width.params.mix / 0.004, 0, 100), set: v => ({ width: { mix: +(v * 0.004).toFixed(3) } }) },
  delay: { off: 0, mod: 'space', label: 'Delay', min: 0, max: 100, def: 20, fmt: pct, roles: ['delay'], get: M => clamp(+M.delay.params.mix / 0.004, 0, 100), set: v => ({ delay: { mix: +(v * 0.004).toFixed(3) } }) },
  reverb: { off: 0, mod: 'space', label: 'Reverb', min: 0, max: 100, def: 25, fmt: pct, roles: ['reverb'], get: M => clamp(+M.reverb.params.mix / 0.005, 0, 100), set: v => ({ reverb: { mix: +(v * 0.005).toFixed(3) } }) },
  size: { mod: 'space', label: 'Room size', min: 0.4, max: 6, curve: 'log', def: 1.8, fmt: v => v.toFixed(1) + ' s', roles: ['reverb'], get: M => +(M.reverb.params.size ?? 1.8), set: v => ({ reverb: { size: +v.toFixed(2) } }) },
};
const SUITE_MACRO_LABEL = Object.fromEntries(Object.entries(SUITE_MACROS).map(([k, d]) => [k, d.label]));
function suiteRoles(d, map) { return typeof d.roles === 'function' ? d.roles(map) : d.roles; }
function suiteGet(ins, id) {
  const d = SUITE_MACROS[id], map = suiteClassify(project.mixer[ins].fx);
  return suiteRoles(d, map).every(r => map[r]) ? d.get(map) : null;
}
/* Writes parameter changes. Effects a control needs are added first; while you drag, the engine just gets new values. */
function suiteWrite(ins, changes, phase = 'once') {
  const m = project.mixer[ins]; let map = suiteClassify(m.fx);
  const need = Object.keys(changes).filter(r => r !== 'comp2' && !map[r]);
  if (phase !== 'drag' || !ui.vsDragged) pushUndo();
  if (phase === 'drag') ui.vsDragged = true; else ui.vsDragged = false;
  if (need.length) { suiteEnsure(project, ins, need); map = suiteClassify(m.fx); }
  for (const role in changes) {
    const f = map[role]; if (!f) continue;
    for (const k in changes[role]) { f.params[k] = changes[role][k]; if (engine && !need.length) engine.setFxParam(ins, f.id, k, changes[role][k]); }
  }
  if (m.vsPreset) m.vsMod = true;
  changed({ render: false });
}
function suiteSetMacro(ins, id, v, phase) { const d = SUITE_MACROS[id]; suiteWrite(ins, d.set(clamp(v, d.min, d.max), suiteClassify(project.mixer[ins].fx)), phase); }

function suiteCharacter(M, mode) {
  if (!M.comp) return { comp: { mode } };
  const p = M.comp.params, v = suiteCompPos(p.amount ?? 0.3);
  return { comp: { mode, output: +clamp((+p.output || 0) + suiteMakeup(mode, v) - suiteMakeup(p.mode, v), -12, 12).toFixed(2) } };
}

/* ---------- artist starting points ---------- */
// Our take on each artist's usual vocal sound. The four researched ones load their full chains; the rest are suite settings.
const SUITE_ARTISTS = [
  { id: 'breezy', name: 'Chris Brown', al: ['chris brown', 'breezy'], chain: 'breezy' },
  { id: 'bieber', name: 'Justin Bieber', al: ['justin bieber', 'bieber'], chain: 'bieber' },
  { id: 'laroi', name: 'Kid LAROI', al: ['the kid laroi', 'kid laroi', 'laroi'], chain: 'laroi' },
  { id: 'mgk', name: 'MGK', al: ['machine gun kelly', 'mgk'], chain: 'mgk' },
  { id: 'weeknd', name: 'The Weeknd', al: ['the weeknd', 'weeknd', 'weekend', 'abel'], s: { retune: 22, humanize: 20, warmth: -1, presence: 1, air: 4, compress: 55, deess: 50, tamer: 35, width: 35, delay: 25, reverb: 40, size: 3.2 }, ch: 'opto', time: 1 },
  { id: 'drake', name: 'Drake', al: ['drake', 'drizzy'], s: { retune: 28, humanize: 25, warmth: 1, presence: 1, air: 1.5, compress: 55, deess: 45, tamer: 30, width: 8, delay: 8, reverb: 12, size: 1.4 }, ch: 'fet', time: 0.5 },
  { id: 'travis', name: 'Travis Scott', al: ['travis scott', 'travis', 'la flame'], s: { retune: 1, humanize: 0, presence: 1.5, air: 2.5, grit: 25, compress: 60, deess: 50, tamer: 40, width: 35, delay: 35, reverb: 40, size: 3.5 }, ch: 'fet', time: 0.75, hard: true },
  { id: 'posty', name: 'Post Malone', al: ['post malone', 'posty'], s: { retune: 12, humanize: 10, warmth: 1, presence: 0.5, air: 2, grit: 8, compress: 55, deess: 45, tamer: 35, width: 25, delay: 22, reverb: 30, size: 2.4 }, ch: 'vox', time: 0.5 },
  { id: 'juice', name: 'Juice WRLD', al: ['juice wrld', 'juice world', 'juicewrld'], s: { retune: 6, humanize: 10, warmth: 0.5, presence: 1.5, air: 2, grit: 12, compress: 55, deess: 45, tamer: 40, width: 28, delay: 22, reverb: 30, size: 2.6 }, ch: 'vox', time: 0.5, hard: true },
  { id: 'billie', name: 'Billie Eilish', al: ['billie eilish', 'billie'], s: { retune: 35, humanize: 35, flex: 30, warmth: 1.5, air: 3, compress: 60, deess: 60, tamer: 40, width: 10, delay: 10, reverb: 18, size: 1.6 }, ch: 'opto', time: 0.5, natural: true },
  { id: 'ariana', name: 'Ariana Grande', al: ['ariana grande', 'ariana'], s: { retune: 25, humanize: 25, warmth: -0.5, presence: 1, air: 4.5, compress: 55, deess: 60, tamer: 45, width: 35, delay: 15, reverb: 32, size: 2.6 }, ch: 'opto', time: 0.5, natural: true },
  { id: 'sza', name: 'SZA', al: ['sza'], s: { retune: 20, humanize: 20, warmth: 1, presence: 0.5, air: 3, compress: 50, deess: 50, tamer: 40, width: 22, delay: 20, reverb: 30, size: 2.8 }, ch: 'opto', time: 0.75, natural: true },
  { id: 'frank', name: 'Frank Ocean', al: ['frank ocean'], s: { retune: 25, humanize: 30, warmth: 1.5, air: 2, grit: 5, compress: 45, deess: 45, tamer: 30, width: 15, delay: 18, reverb: 28, size: 2.4 }, ch: 'opto', time: 0.5, natural: true },
  { id: 'tpain', name: 'T-Pain', al: ['t-pain', 't pain', 'tpain'], s: { retune: 0, humanize: 0, presence: 1, air: 2, compress: 55, deess: 45, tamer: 30, width: 15, delay: 15, reverb: 20, size: 2 }, ch: 'fet', time: 0.5, hard: true },
  { id: 'future', name: 'Future', al: ['future'], s: { retune: 2, humanize: 0, presence: 1, air: 1.5, grit: 18, compress: 60, deess: 45, tamer: 35, width: 25, delay: 30, reverb: 30, size: 3 }, ch: 'fet', time: 0.5, hard: true },
  { id: 'bruno', name: 'Bruno Mars', al: ['bruno mars', 'bruno'], s: { retune: 30, humanize: 25, warmth: 0.5, presence: 2, air: 2, compress: 60, deess: 50, tamer: 35, width: 15, delay: 12, reverb: 20, size: 1.8 }, ch: 'fet', time: 0.5, natural: true },
];
function suiteFresh(P, ins) {
  P.mixer[ins].fx = SUITE_ORDER.filter(r => r !== 'eqm' && r !== 'gate').map(r => fxSlot(SUITE_DEF[r][0], { ...SUITE_DEF[r][1] }));
}
function suiteApplyArtist(P, ins, a) {
  if (a.chain) { P.mixer[ins].fx = CHAINS[a.chain].fx.map(([pl, params]) => fxSlot(pl, { ...params })); return; }
  suiteFresh(P, ins);
  const map = suiteClassify(P.mixer[ins].fx);
  for (const [id, v] of Object.entries(a.s)) { const ch = SUITE_MACROS[id].set(v, map); for (const r in ch) if (map[r]) Object.assign(map[r].params, ch[r]); }
  if (a.ch) map.comp.params.mode = a.ch;
  map.comp.params.output = +suiteMakeup(map.comp.params.mode, a.s.compress || 0).toFixed(2);
  if (a.time) map.delay.params.time = a.time;
  map.tune.params.fcorr = a.natural ? 'on' : 'off';
}

/* ---------- presets ---------- */
let suiteUser = null;
async function suiteLoadUser() { if (suiteUser) return suiteUser; try { const r = await Store.get('meta', 'vocal-presets'); suiteUser = (r && Array.isArray(r.value)) ? r.value : []; } catch (e) { suiteUser = []; } return suiteUser; }
async function suiteSaveUser() { try { await Store.put('meta', { key: 'vocal-presets', value: suiteUser }); } catch (e) { toast('Couldn’t save the preset in this browser.', { kind: 'error' }); } }
function suitePresetList() {
  return [...SUITE_ARTISTS.map(a => ({ kind: 'artist', id: a.id, name: `${a.name} style` })),
    ...Object.entries(CHAINS).filter(([, c]) => !c.artist).map(([id, c]) => ({ kind: 'chain', id, name: c.label })),
    ...(suiteUser || []).map((u, i) => ({ kind: 'user', id: 'u' + i, name: u.name, fx: u.fx, target: u.target }))];
}
function suiteLoadPreset(ins, p) {
  mutate(P => {
    const m = P.mixer[ins];
    if (p.kind === 'artist') suiteApplyArtist(P, ins, SUITE_ARTISTS.find(a => a.id === p.id));
    else if (p.kind === 'chain') m.fx = CHAINS[p.id].fx.map(([pl, params]) => fxSlot(pl, { ...params }));
    else m.fx = p.fx.map(([pl, params]) => fxSlot(pl, { ...params }));
    delete m.match; delete m.vsMatch;
    m.vsPreset = p.name; delete m.vsMod;
    m.vsTarget = p.kind === 'user' ? (p.target || m.vsTarget || 'clean') : p.id; // who this preset sounds like
  });
  suiteAutoMatch(ins);
}
/* With a take on the track, a new preset is fitted to your voice straight away (a moment after you stop flicking through). */
function suiteAutoMatch(ins, ms = 700) {
  clearTimeout(SVM.auto);
  if (ui.vsAuto === false || !suiteTakeClip(ins) || REC.state !== 'idle') return;
  SVM.auto = setTimeout(() => {
    const st = ui.vsM, m = project.mixer[ins];
    if (st && st.busy && st.ins === ins && m && st.tid === m.vsTarget) return; // already fitting this preset to you
    suiteMatch(ins, { auto: true, src: 'take' });
  }, ms);
}

/* ---------- the assistant ---------- */
const NOTE_IDX = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// How musicians spell each key: Eb major and Bb minor, not D# major and A# minor.
const KEY_MAJ = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], KEY_MIN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const suiteKeyName = (root, mode) => (['major', 'pentmaj', 'lydian', 'mixolydian'].includes(mode) ? KEY_MAJ : KEY_MIN)[((root % 12) + 12) % 12];
function suiteParseKey(raw) {
  const t = ' ' + raw + ' ';
  let m = t.match(/\b([A-Ga-g])\s?(#|♯|b|♭|-?sharp|-?flat)?\s?(major|maj|minor|min)\b/i) || t.match(/\bkey(?: of)?\s+([A-Ga-g])(#|♯|b|♭|\s?sharp|\s?flat)?(m)?\b/i)
    || t.match(/\bin\s+([A-G])(#|♯|b|♭)?(m)?(?=[\s,.!?]|$)/);
  if (!m) return null;
  let root = NOTE_IDX[m[1].toLowerCase()]; const acc = (m[2] || '').toLowerCase().trim();
  if (/#|♯|sharp/.test(acc)) root += 1; else if (/^b$|♭|flat/.test(acc)) root -= 1;
  const md = (m[3] || '').toLowerCase(), minor = md === 'm' || md.startsWith('min');
  return { root: (root + 12) % 12, mode: minor ? 'minor' : 'major' };
}
function suiteParse(text) {
  const t = ' ' + text.toLowerCase().replace(/[’']/g, "'").replace(/auto[- ]?tune/g, 'autotune') + ' ', ops = [];
  const k = /\b(a (little )?bit|slightly|a touch|a little|tiny bit|subtly|a hair)\b/.test(t) ? 0.5 : /\b(a lot|way|much more|very|super|tons|really|max|crazy)\b/.test(t) ? 2 : 1;
  const lastAt = (s, re) => { let i = -1, m; re.lastIndex = 0; while ((m = re.exec(s))) i = m.index; return i; };
  const NEG = /\b(less|no|reduce|lower|decrease|cut|remove|without|too|turn down|fewer|minus|take out|take away|kill)\b/g, POS = /\b(more|add|increase|extra|boost|turn up|bigger|plus|some|put|give)\b/g;
  // Is this mention a "less of it"? Looks at the nearest more/less word before it, and at "is too much" after it.
  const isNeg = (idx, len) => { const w = t.slice(Math.max(0, idx - 32), idx); if (lastAt(w, NEG) > lastAt(w, POS)) return true; return /^[^.,!?]{0,14}\b(is |it's |feels |sounds )?(too (much|strong|obvious|heavy|hard|loud|big)|overdone|overkill)\b/.test(t.slice(idx + len)); };
  const has = re => { const m = re.exec(t); return m ? { idx: m.index, neg: isNeg(m.index, m[0].length) } : null; };
  const art = SUITE_ARTISTS.find(a => a.al.some(al => new RegExp('\\b' + al.replace(/[-\s]/g, '[-\\s]?') + '\\b').test(t)));
  if (art) ops.push({ artist: art.id });
  const smart = /\b(smart key|smart tune|auto[- ]?key|detect (the |my )?key|find (the |my )?key|what key|which key|match (it to )?(the |my )?(beat|instrumental|track|key)|key of (the |my )?(beat|instrumental|song)|lock (it )?to (the |my )?beat)\b/.test(t);
  const key = smart ? null : suiteParseKey(text); if (smart) ops.push({ smart: true }); else if (key) ops.push({ key });
  if (/\b(reset|start over|from scratch|clear it|clean slate)\b/.test(t)) ops.push({ reset: true });
  if (art && /\b(sound(s)? like|make me (sound )?like|like)\b/.test(t)) ops.push({ match: true });
  if (!smart && /\b(listen|analy[sz]e|match (it to )?my|mix (it )?for me|fix my (voice|vocal)|what should i (change|do)|how does (it|my voice|this) sound|any (advice|tips|suggestions))\b/.test(t)) ops.push({ listen: true });
  if (/\b(un-?bypass|turn (it|everything|the effects?) (back )?on)\b/.test(t)) ops.push({ bypass: false });
  else if (/\b(bypass|turn (it|everything|the effects?) off|raw (vocal|voice|sound))\b/.test(t)) ops.push({ bypass: true });
  // tuning
  let h;
  if (/\b(robot|robotic|hard[- ]?tune|hard tuned|super tuned|t-?pain effect)\b/.test(t) && !art) ops.push({ set: 'retune', v: 0 }, { set: 'humanize', v: 0 }, { fcorr: 'off' }, { tuneOn: true });
  else if (/\b(no autotune|without autotune|autotune off|turn off (the )?autotune|no tun|untuned|raw pitch)\w*/.test(t)) ops.push({ tuneOff: true });
  else if (/\b(natural|transparent|subtle tun\w*|less obvious|not obvious|invisible)\b/.test(t) && !art) ops.push({ set: 'retune', v: 40 }, { set: 'humanize', v: 35 }, { fcorr: 'on' }, { tuneOn: true });
  else if ((h = has(/\b(autotune|tune|tuning|pitch correction|tuned|pitchy|off[- ]key)\b/))) {
    const pitchy = /\b(pitchy|off[- ]key|out of tune|flat notes|sharp notes)\b/.test(t), less = !pitchy && (h.neg || /\b(softer|subtler|lighter|gentler)\b/.test(t));
    if (!key || /\b(more|less|harder|softer|stronger|lighter|heavier)\b/.test(t) || pitchy) ops.push({ add: 'retune', v: (less ? 15 : -15) * k }, ...(less ? [] : [{ tuneOn: true }]));
  }
  // space
  if (/\b(drier|dry it|dry vocal|make it dry|dryer|too wet|too washy|washed out|too much space)\b/.test(t)) ops.push({ add: 'reverb', v: -12 * k }, { add: 'delay', v: -8 * k });
  else if (/\b(wetter|more wet|make it wet|spacious|spacey|spacy|ambient|dreamy|too dry|more space)\b/.test(t)) ops.push({ add: 'reverb', v: 12 * k }, { add: 'delay', v: 6 * k });
  if ((h = has(/\b(reverb|verb|hall|room)\b/))) ops.push(/\bno (reverb|verb)\b/.test(t) ? { set: 'reverb', v: 0 } : { add: 'reverb', v: (h.neg ? -15 : 15) * k });
  if (/\b(bigger|huge|massive|larger|longer) (room|space|reverb|hall|tail)\b/.test(t)) ops.push({ add: 'size', v: 0.8 * k });
  else if (/\b(smaller|shorter|tighter) (room|space|reverb|tail)\b/.test(t)) ops.push({ add: 'size', v: -0.6 * k });
  if ((h = has(/\b(delay|echo|echoes|slapback|slap)\b/))) ops.push(/\bno (delay|echo)/.test(t) ? { set: 'delay', v: 0 } : { add: 'delay', v: (h.neg ? -15 : 15) * k });
  if ((h = has(/\b(wider|wide|stereo|thicker|doubles?|doubled|stacks?|stacked|fuller|width)\b/))) ops.push({ add: 'width', v: (h.neg ? -15 : 15) * k });
  else if (/\b(narrower|narrow|mono|centered|centred)\b/.test(t)) ops.push({ add: 'width', v: -15 * k });
  // tone
  if (/\b(too bright|less bright|less air|darker|dark|dull|duller|muffled|smoother top)\b/.test(t)) ops.push({ add: 'air', v: -2 * k });
  else if ((h = has(/\b(brighter|bright|airy|airier|air|crisp|crisper|sparkle|sparkly|shine|shiny|expensive)\b/))) ops.push({ add: 'air', v: (h.neg ? -2 : 2) * k });
  if (/\b(muddy|boomy|boxy|less low|less bass|too much low|cloudy)\b/.test(t)) ops.push({ add: 'warmth', v: -2 * k }, { add: 'lowcut', v: 20 * k });
  else if ((h = has(/\b(warmer|warm|body|thick|richer|rich|deeper)\b/))) ops.push({ add: 'warmth', v: (h.neg ? -1.5 : 1.5) * k });
  else if (/\b(thin|thinner)\b/.test(t)) ops.push({ add: 'warmth', v: -1.5 * k });
  if (/\b(harsh|piercing|shrill|nasal|honky|ear-?piercing|brittle|abrasive)\b/.test(t)) ops.push({ add: 'presence', v: -1.5 * k }, { add: 'tamer', v: 20 * k });
  else if ((h = has(/\b(upfront|up front|forward|present|presence|clearer|clear|cut through|intelligible|in your face|buried)\b/))) ops.push({ add: 'presence', v: (h.neg && !/\bburied\b/.test(t) ? -1.5 : 1.5) * k });
  if (/\b(sibilan\w*|esses|s sounds|s's|hissy s|lisp)\b/.test(t)) ops.push({ add: 'deess', v: 20 * k });
  if ((h = has(/\b(grit|gritty|distort\w*|dirt|dirty|saturat\w*|crunch\w*|edge|edgy|aggressive|raspy|rough)\b/))) ops.push({ add: 'grit', v: (h.neg ? -20 : 20) * k });
  else if (/\b(cleaner|no distortion)\b/.test(t)) ops.push({ add: 'grit', v: -20 * k });
  // dynamics
  if (/\b(less compress\w*|more dynamic|breathe|uncompressed|squashed|too compressed|over-?compressed|lifeless)\b/.test(t)) ops.push({ add: 'compress', v: -15 * k });
  else if (/\b(compress\w*|squash|punch\w*|tight(er)?|controlled|consistent|even(er)? out|glue\w*|jumps? out|jumpy|all over the place)\b/.test(t)) ops.push({ add: 'compress', v: 15 * k });
  if (/\b(1176|fet)\b/.test(t)) ops.push({ character: 'fet' }); else if (/\b(la-?2a|opto)\b/.test(t)) ops.push({ character: 'opto' }); else if (/\b(rvox|leveller|leveler)\b/.test(t)) ops.push({ character: 'vox' });
  if (/\b(less|lower|softer|reduce) gat\w*|\bgate (is )?(cutting|chopping)|\b(chopp\w*|cuts? off (my|the) (words|ends))/.test(t)) ops.push({ add: 'gate', v: -25 * k });
  else if (/\b(noise|noisy|hiss|hissing|background|room sound|gate|fan|hum)\b/.test(t)) ops.push({ add: 'gate', v: 25 * k });
  if (/\b(louder|turn (it )?up|more volume|too quiet|too soft)\b/.test(t)) ops.push({ out: 2 * k }); else if (/\b(quieter|turn (it )?down|less volume|too loud)\b/.test(t)) ops.push({ out: -2 * k });
  return ops;
}
/* Runs the parsed (or Claude-chosen) changes on the insert, as one undo step. Returns what changed, in words. */
function suiteRun(ins, ops) {
  const said = [], before = {};
  Object.keys(SUITE_MACROS).forEach(id => { before[id] = suiteGet(ins, id); });
  if (!ops.length) return said;
  const work = ops.filter(o => !o.listen);
  if (!work.length) return said;
  pushUndo();
  const P = project, m = P.mixer[ins];
  for (const o of work) {
    if (o.reset) { suiteFresh(P, ins); delete m.match; said.push('Reset to a clean chain'); }
    if (o.artist) { const a = SUITE_ARTISTS.find(x => x.id === o.artist); suiteApplyArtist(P, ins, a); delete m.match; delete m.vsMatch; m.vsPreset = a.name + ' style'; m.vsTarget = a.id; delete m.vsMod; said.push(`Loaded my starting point for ${a.name}`); }
    if (o.preset && CHAINS[o.preset]) { m.fx = CHAINS[o.preset].fx.map(([pl, params]) => fxSlot(pl, { ...params })); m.vsTarget = o.preset; delete m.vsMatch; said.push(`Loaded ${CHAINS[o.preset].label}`); }
    if (o.key) { suiteEnsure(P, ins, ['tune']); const tf = suiteClassify(m.fx).tune; tf.params.root = o.key.root; tf.params.smode = SCALES[o.key.mode] ? o.key.mode : 'major'; tf.bypass = false; said.push(`Tune snaps to ${suiteKeyName(o.key.root, tf.params.smode)} ${(SCALES[tf.params.smode] || {}).label || tf.params.smode}`); }
    if (o.smart) { suiteEnsure(P, ins, ['tune']); const tf = suiteClassify(m.fx).tune; tf.params.root = -1; tf.bypass = false; said.push('Tune follows the song key, which follows your beat'); }
    if (o.tuneOff) { const tf = suiteClassify(m.fx).tune; if (tf) { tf.bypass = true; said.push('Tune off'); } }
    if (o.tuneOn) { suiteEnsure(P, ins, ['tune']); const tf = suiteClassify(m.fx).tune; if (tf.bypass) { tf.bypass = false; said.push('Tune on'); } }
    if (o.fcorr) { suiteEnsure(P, ins, ['tune']); suiteClassify(m.fx).tune.params.fcorr = o.fcorr; }
    if (o.character) { suiteEnsure(P, ins, ['comp']); const mp = suiteClassify(m.fx); Object.assign(mp.comp.params, suiteCharacter(mp, o.character).comp); said.push(`Compressor character: ${{ fet: 'FET (1176)', opto: 'Opto (LA-2A)', vox: 'Leveller (RVox)', clean: 'Clean' }[o.character]}`); }
    if (o.bypass != null) { m.fx.forEach(f => { f.bypass = o.bypass; }); said.push(o.bypass ? 'All effects bypassed' : 'Effects back on'); }
    if (o.out) { const cur = 20 * Math.log10(Math.max(1e-4, m.vol)); m.vol = clamp(Math.pow(10, (cur + o.out) / 20), 0, 1.25); said.push(`Output ${dbf(20 * Math.log10(m.vol))}`); }
    if (o.set || o.add) {
      const id = o.set || o.add, d = SUITE_MACROS[id]; let map = suiteClassify(m.fx);
      const need = suiteRoles(d, map).filter(r => !map[r]); if (need.length) { suiteEnsure(P, ins, need); map = suiteClassify(m.fx); }
      const cur = d.get(map), nv = clamp(o.set ? o.v : cur + o.v, d.min, d.max), ch = d.set(nv, map);
      for (const r in ch) if (map[r]) Object.assign(map[r].params, ch[r]);
    }
  }
  if (m.vsPreset && !work.some(o => o.artist || o.preset)) m.vsMod = true;
  if (work.some(o => o.artist || o.preset) && !ops.some(o => o.match || o.listen)) setTimeout(() => suiteAutoMatch(ins), 0); // a new preset gets fitted to your voice
  Object.keys(SUITE_MACROS).forEach(id => { const a = before[id], b = suiteGet(ins, id); if (b != null && (a == null || Math.abs(b - a) > 0.05) && !work.some(o => o.artist || o.reset || o.preset)) said.push(`${SUITE_MACROS[id].label} ${SUITE_MACROS[id].fmt(b)}`); });
  changed();
  return said;
}
function suiteState(ins) {
  const o = {}; Object.keys(SUITE_MACROS).forEach(id => { const v = suiteGet(ins, id); if (v != null) o[id] = Math.round(v * 10) / 10; });
  const map = suiteClassify(project.mixer[ins].fx);
  if (map.tune) { const p = map.tune.params; o.tuneKey = +p.root >= 0 ? `${suiteKeyName(+p.root, p.smode)} ${p.smode}` : `song key (${keyLabel(project)})`; o.tuneOn = !map.tune.bypass; } else o.tuneOn = false;
  if (map.comp) o.character = map.comp.params.mode;
  const a = project.mixer[ins].match && project.mixer[ins].match.a;
  if (a) { const r1 = x => Number.isFinite(+x) ? Math.round(+x * 10) / 10 : undefined; o.measured = { loudnessDb: r1(a.activeDb), peakDb: r1(a.peakDb), clipped: a.clips || 0, noiseFloorDb: a.noiseDb == null ? "unknown" : r1(a.noiseDb), loudnessRangeDb: r1(a.lra), sibilanceDb: r1(a.sibRel), harshPeaksDb: r1(a.peaky), roomReverbDb: r1(a.wetDb) }; }
  return o;
}
async function suiteAskClaude(ins, text) {
  const ranges = Object.entries(SUITE_MACROS).map(([id, d]) => `${id} (${d.label}): ${d.min} to ${d.max}${d.fmt === dbf ? ' dB' : id === 'size' ? ' seconds' : id === 'retune' ? ' ms, 0 = hard robotic, 10-15 modern R&B, 20-40 natural' : id === 'lowcut' ? ' Hz' : ''}`).join('\n');
  const prompt = `You are the assistant inside a vocal processing plugin. Answer the singer's request by choosing settings.
The singer said: "${text}"
Current settings: ${JSON.stringify(suiteState(ins))}
Controls you may set (numbers):
${ranges}
Other choices: "character" is one of fet, opto, vox, clean. "key" sets the notes Tune snaps to: {"root": 0-11 where 0 is C, "mode": "major" or "minor"}, or the string "smart" to have Tune listen to the beat and follow its key. "artist" loads a starting chain, one of: ${SUITE_ARTISTS.map(a => a.id + ' (' + a.name + ')').join(', ')}. "tune": "on" or "off".
Return JSON only, no prose around it:
{"reply": "one or two short sentences to the singer about what you changed and why", "artist": null or id, "key": null or {"root": n, "mode": "major|minor"}, "set": {"control": number}, "character": null or string, "tune": null or "on" or "off"}
Apply "artist" first, then the rest. For an artist you don't have, choose settings that recreate their typical vocal production and say it's a starting point. If they ask for advice, give it in "reply" and change only what clearly helps.`;
  const r = await sampleFn.json(prompt, { modelTier: 'default' });
  const ops = [];
  if (r && typeof r === 'object') {
    if (r.artist && SUITE_ARTISTS.some(a => a.id === r.artist)) ops.push({ artist: r.artist });
    if (r.key === 'smart') ops.push({ smart: true });
    else if (r.key && Number.isFinite(+r.key.root)) ops.push({ key: { root: ((+r.key.root % 12) + 12) % 12, mode: r.key.mode === 'minor' ? 'minor' : 'major' } });
    if (r.tune === 'off') ops.push({ tuneOff: true }); else if (r.tune === 'on') ops.push({ tuneOn: true });
    if (r.set && typeof r.set === 'object') for (const [id, v] of Object.entries(r.set)) if (SUITE_MACROS[id] && Number.isFinite(+v)) ops.push({ set: id, v: +v });
    if (['fet', 'opto', 'vox', 'clean'].includes(r.character)) ops.push({ character: r.character });
  }
  return { ops, reply: r && typeof r.reply === 'string' ? r.reply.slice(0, 400) : '' };
}
async function suiteSend(ins, text) {
  text = String(text || '').trim(); if (!text) return;
  const chat = ui.vsChat; chat.push({ who: 'me', text });
  const ops = suiteParse(text), mentionsArtist = /\b(like|style|preset|sound of|vibe)\b/i.test(text);
  const unknownArtist = mentionsArtist && !ops.some(o => o.artist);
  if (sampleFn && !ops.some(o => o.smart) && (!ops.length || unknownArtist || /\?$/.test(text))) {
    chat.push({ who: 'bot', text: 'Thinking…', busy: true }); renderVocalChat();
    try {
      const r = await suiteAskClaude(ins, text); chat.pop();
      const said = suiteRun(ins, r.ops);
      chat.push({ who: 'bot', text: (r.reply || 'Done.') + (said.length ? '\n' + said.join(' · ') : '') });
    } catch (e) { chat.pop(); const said = suiteRun(ins, ops); chat.push({ who: 'bot', text: said.length ? said.join(' · ') : 'I couldn’t reach Claude just now. Try a plain request like “more autotune” or “brighter”.' }); }
  } else {
    const said = suiteRun(ins, ops), art = ops.find(o => o.artist);
    chat.push({ who: 'bot', text: said.length ? (art && !SUITE_ARTISTS.find(a => a.id === art.artist).chain ? said.join(' · ') + '\nIt’s my take on their sound, so tweak it to taste.' : said.join(' · '))
      : unknownArtist ? 'I don’t have that artist yet. Try Chris Brown, Bieber, Kid LAROI, MGK, The Weeknd, Drake, Travis Scott, Post Malone, Juice WRLD, Billie Eilish, Ariana, SZA, Frank Ocean, T-Pain, Future or Bruno Mars.'
      : 'Tell me how it should sound: “more autotune”, “brighter”, “less reverb”, “warmer”, “wider”, “Drake preset in C# minor”, “too harsh”…' });
  }
  if (ops.some(o => o.listen || o.match)) { // fit the (new) preset to your voice and say what changed
    const m = project.mixer[ins], tg = suiteTargetFor(m);
    if (!suiteSources(ins).length) chat.push({ who: 'bot', text: STANDALONE ? `Record a take (or pick “Sing 10 seconds now”) and I’ll make you sound like ${tg ? tg.label : 'the preset'}.` : `Record a take in the recording edition (or import one) and I’ll make you sound like ${tg ? tg.label : 'the preset'}.` });
    else {
      chat.push({ who: 'bot', text: `Listening to ${ui.vsSrc === 'mic' ? 'you' : 'your take'} and fitting ${tg ? tg.label : 'the preset'} to your voice…`, busy: true }); renderView();
      await suiteMatch(ins, { src: ui.vsSrc }); chat.pop();
      const M = project.mixer[ins].vsMatch, st = ui.vsM;
      chat.push({ who: 'bot', text: st && st.err ? st.err : M ? `Done. You now sit ${M.err[0] > M.err[1] ? `${(M.err[0] - M.err[1]).toFixed(1)} dB closer to` : 'right on'} ${M.label}’s sound. The details are above.` : 'Done.' });
    }
  }
  if (ops.some(o => o.smart)) { // listen now and say what it heard
    chat.push({ who: 'bot', text: 'Listening to your beat…', busy: true }); renderView();
    const k = await smartKeyRun(true); chat.pop();
    const nm = k ? `${suiteKeyName(k.root, k.mode)} ${k.mode}` : '', same = k && suiteSameNotes(project.key, project.scale, k.root, k.mode);
    chat.push({ who: 'bot', text: k && k.src !== 'song' ? `Your ${k.src === 'vocal' ? 'singing' : 'beat'} is in ${nm}${k.conf < 0.3 ? ' (I’m not sure, so check it)' : ''}. ` + (same ? `The song key is ${keyLabel(project)}, so Tune snaps to it. I’ll re-listen if you change the beat.` : `You set the song key to ${keyLabel(project)}; tap Use in the message at the bottom to switch.`) : 'I can’t hear a beat yet. Import or make one and the song key follows it by itself.' });
  }
  if (chat.length > 40) chat.splice(0, chat.length - 40);
  renderView();
}

/* ---------- the screen ---------- */
function suiteIns() {
  const tr = project.playlist.tracks;
  if (ui.vsIns > 0 && ui.vsIns < project.mixer.length && tr.some(t => (t.insert | 0) === ui.vsIns)) return ui.vsIns;
  if (REC.armed != null && tr[REC.armed] && (tr[REC.armed].insert | 0) > 0) return (ui.vsIns = tr[REC.armed].insert | 0);
  const v = tr.find(t => (t.insert | 0) > 0 && /vocal|vox|voice/i.test(t.name)) || tr.find(t => (t.insert | 0) > 0 && project.playlist.clips.some(c => c.kind === 'audio' && tr[c.track] === t));
  return (ui.vsIns = v ? v.insert | 0 : 0);
}
function renderVocal(v) {
  ui.vsChat = ui.vsChat || [{ who: 'bot', greet: true, text: '' }];
  ui.vsTab = ui.vsTab || 'tune';
  if (!suiteUser) suiteLoadUser().then(() => { if (ui.tab === 'vocal') renderView(); });
  smartKeyEnsure();
  const ins = suiteIns();
  if (!(ins > 0)) {
    v.append(el('div', { class: 'view-body' }, el('div', { class: 'empty vs-empty' }, el('h3', {}, 'Vocal'),
      el('p', { class: 'muted' }, 'Record your voice over the beat and shape it here: presets, Tune, clean-up, tone and space. Press Record at the top, or set up the track first.'),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', onclick: () => { suiteEnsureTrack(); renderView(); } }, icon('mic'), 'Set up a vocal track'),
        el('button', { class: 'btn', onclick: importTake }, 'Import a take')))));
    return;
  }
  const m = project.mixer[ins], map = suiteClassify(m.fx), tracks = project.playlist.tracks.map((t, i) => [t, i]).filter(([t]) => (t.insert | 0) > 0);
  const allOff = m.fx.length && m.fx.every(f => f.bypass), recording = REC.state === 'rec' || REC.state === 'count';
  const list = suitePresetList(), cur = m.vsPreset ? m.vsPreset + (m.vsMod ? ' (edited)' : '') : (m.match ? (m.match.kind === 'acap' ? `Matched: ${m.match.refName || 'a cappella'}` : 'Matched to your voice') : m.fx.length ? 'Custom' : 'No effects');
  const stepPreset = d => { const i = list.findIndex(p => p.name === m.vsPreset); const p = list[((i < 0 ? (d > 0 ? -1 : 0) : i) + d + list.length) % list.length]; suiteLoadPreset(ins, p); };
  const pickTrack = val => { ui.vsIns = val; const ti = suiteTrackOf(val); if (REC.armed != null && ti >= 0 && !recording) armTrack(ti); else renderView(); };
  const head = el('div', { class: 'vs-bar' },
    el('div', { class: 'vs-brand' }, el('b', {}, 'TAPEHOUSE'), el('span', {}, 'Vocal · VS-1')),
    el('label', { class: 'vs-track', title: 'The track you record onto and shape here' }, el('span', {}, 'Track'), el('select', { 'aria-label': 'Track', disabled: recording, onchange: e => pickTrack(+e.target.value) }, tracks.map(([t]) => el('option', { value: String(t.insert | 0), selected: (t.insert | 0) === ins }, t.name)))),
    el('div', { class: 'vs-preset' },
      el('button', { class: 'vs-key', 'aria-label': 'Previous preset', onclick: () => stepPreset(-1) }, '‹'),
      el('select', { class: 'vs-pname', 'aria-label': 'Preset', onchange: e => { const p = list[+e.target.value]; if (p) suiteLoadPreset(ins, p); } },
        el('option', { value: '', selected: !list.some(p => p.name === m.vsPreset) }, cur),
        el('optgroup', { label: 'Artist styles' }, list.map((p, i) => p.kind === 'artist' ? el('option', { value: String(i), selected: p.name === m.vsPreset }, p.name) : null)),
        el('optgroup', { label: 'Natural' }, list.map((p, i) => p.kind === 'chain' ? el('option', { value: String(i), selected: p.name === m.vsPreset }, p.name) : null)),
        (suiteUser || []).length ? el('optgroup', { label: 'Yours' }, list.map((p, i) => p.kind === 'user' ? el('option', { value: String(i), selected: p.name === m.vsPreset }, p.name) : null)) : null),
      el('button', { class: 'vs-key', 'aria-label': 'Next preset', onclick: () => stepPreset(1) }, '›')),
    el('div', { class: 'vs-util' },
      el('button', { class: 'vs-key wide', title: 'Save these settings as your own preset', onclick: () => { ui.vsSaving = !ui.vsSaving; renderView(); } }, 'Save'),
      el('button', { class: 'vs-key wide' + (allOff ? ' lit' : ''), 'aria-pressed': String(!!allOff), title: 'Bypass every effect to compare with your raw voice', onclick: () => mutate(P => { P.mixer[ins].fx.forEach(f => { f.bypass = !allOff; }); }) }, 'Bypass')));
  const saving = ui.vsSaving ? el('form', { class: 'vs-save', onsubmit: async e => {
    e.preventDefault(); const name = (e.target.elements.n.value || '').trim().slice(0, 40); if (!name) return;
    await suiteLoadUser(); suiteUser = suiteUser.filter(u => u.name !== name); suiteUser.push({ name, target: m.vsTarget, fx: m.fx.map(f => [f.plugin, { ...f.params }]) }); await suiteSaveUser();
    mutate(P => { P.mixer[ins].vsPreset = name; delete P.mixer[ins].vsMod; }); ui.vsSaving = false; toast(`Saved “${name}”. It’s in the preset list under Yours.`);
  } }, el('input', { name: 'n', placeholder: 'Name your preset', 'aria-label': 'Preset name', maxlength: '40', autofocus: true }), el('button', { class: 'btn sm primary', type: 'submit' }, 'Save preset'), el('button', { class: 'btn sm', type: 'button', onclick: () => { ui.vsSaving = false; renderView(); } }, 'Cancel')) : null;
  const io = (side) => {
    const isIn = side === 'in', val = isIn ? (+m.trim || 0) : 20 * Math.log10(Math.max(1e-4, m.vol));
    return el('div', { class: 'vs-io ' + side },
      knob({ label: isIn ? 'Input' : 'Output', min: isIn ? -24 : -30, max: isIn ? 24 : 1.9, def: isIn ? 0 : -1.9, value: val, bipolar: isIn, cls: 'vs-knob big ' + side, fmt: dbf,
        onStart: () => { ui.vsDragged = false; }, onInput: x => { if (!ui.vsDragged) { pushUndo(); ui.vsDragged = true; } if (isIn) m.trim = +x.toFixed(1); else m.vol = clamp(Math.pow(10, x / 20), 0, 1.25); changed({ render: false }); }, onEnd: () => { ui.vsDragged = false; } }),
      el('div', { class: 'vs-meter', 'data-meter': side, 'aria-hidden': 'true' }, Array.from({ length: 14 }, () => el('i'))));
  };
  const screen = vsAssist(ins, m);
  const tabs = el('div', { class: 'vs-tabs', role: 'tablist' }, SUITE_MODS.map(([id, label, roles]) => {
    const on = roles.some(r => map[r] && !map[r].bypass);
    return el('button', { role: 'tab', class: 'vs-tab', 'aria-selected': String(ui.vsTab === id), onclick: () => { ui.vsTab = id; renderView(); } }, el('span', { class: 'vs-led' + (on ? ' on' : '') }), label);
  }));
  const panel = el('div', { class: 'vs-panel', role: 'tabpanel' }, suitePanel(ins, ui.vsTab, map));
  const eng = engine ? (engine.dsp === 'ready' ? 'fast engine' : engine.dsp === 'failed' ? 'backup engine' : 'starting engine') : '';
  const foot = el('div', { class: 'vs-foot' },
    el('button', { class: 'btn sm', onclick: () => { ui.selInsert = ins; setTab('mixer'); } }, 'See every effect in Mix'),
    el('span', { class: 'muted small mono rec-diag' + (engine && engine.dsp === 'failed' ? ' warn' : '') }, `Tapehouse ${APP_VERSION}${STANDALONE ? ' · recording edition' : ''}${eng ? ' · ' + eng : ''}${ctx ? ' · ' + Math.round(ctx.sampleRate / 100) / 10 + ' kHz' : ''}`,
      engine && engine.dsp === 'failed' ? ' · This browser blocked the fast audio engine, so effects run on a backup that can crackle. Use Chrome or Edge and keep this tab in front.' : ''));
  v.append(el('div', { class: 'view-body vs', 'data-scroll': 'vs' }, el('div', { class: 'vs-wrap' }, el('div', { class: 'vs-face' }, el('i', { class: 'vs-screw a' }), el('i', { class: 'vs-screw b' }), el('i', { class: 'vs-screw c' }), el('i', { class: 'vs-screw d' }),
    head, saving, vsRecord(ins, m), el('div', { class: 'vs-core' }, io('in'), screen, io('out')), tabs, panel), foot)));
  const log = $('#vsChat'); if (log) log.scrollTop = log.scrollHeight;
  if (ui.vsKeep) { const kb = $$('.vs .knob').find(x => x.getAttribute('aria-label') === ui.vsKeep); ui.vsKeep = null; if (kb && document.activeElement === document.body) kb.focus({ preventScroll: true }); }
  if (ui.vsFocus) { ui.vsFocus = false; const q = $('.vs-ask input'); if (q) q.focus({ preventScroll: true }); }
  suiteTick(ins);
}
/* The assistant: the preset says who you want to sound like, this makes your voice land there. Shows the target,
   where your voice comes from, what it found and changed (with a picture), how strong the tone match is, and a chat
   for anything else ("less autotune", "more reverb"). */
/* The assistant's opening line, from where you are: no take yet, ready to match, or matched. */
function suiteGreeting(ins, tg, M) {
  if (!tg) return 'Tell me what to change: “more reverb”, “brighter”, “less compression”.';
  const other = tg.id === 'drake' ? 'The Weeknd' : 'Drake';
  if (M && M.target === tg.id) return `Want it different? Tell me: “brighter”, “less autotune”, “more reverb”, or “sound like ${other}”.`;
  const first = suiteTakeClip(ins) ? `Press Match my voice and I’ll fit ${tg.label}’s preset to your take.`
    : STANDALONE || REC.stream ? `Record a take and I’ll fit ${tg.label}’s preset to your voice.`
    : `Import a take (or record one in the recording edition) and I’ll fit ${tg.label}’s preset to your voice.`;
  return first + ` Or tell me what to change: “less autotune”, “more reverb”, “sound like ${other}”.`;
}
function vsAssist(ins, m) {
  const tg = suiteTargetFor(m), st = ui.vsM && ui.vsM.ins === ins ? ui.vsM : null, M = m.vsMatch, srcs = suiteSources(ins), busy = !!(st && st.busy);
  if (!ui.vsSrc || !srcs.some(x => x.id === ui.vsSrc)) ui.vsSrc = srcs[0] ? srcs[0].id : '';
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, eqm = suiteClassify(m.fx).eqm, name = tg ? tg.label : 'your instrument';
  const head = el('div', { class: 'vsa-head' },
    el('div', { class: 'vs-bot', html: SUITE_BOT_SVG, 'aria-hidden': 'true' }),
    el('div', { class: 'vsa-title' }, el('span', { class: 'vsa-k' }, tg ? 'Make me sound like' : 'Instrument'), el('b', { class: 'vsa-target' }, name),
      el('span', { class: 'vsa-sub' }, tg ? `${tg.artist ? 'Artist preset' : 'Preset'}: pick someone else in the preset list above.` : 'Guitar or keys: after each take I set its level against the beat.')));
  const go = tg && srcs.length ? el('div', { class: 'vsa-go-row' },
    el('button', { class: 'vsa-go', disabled: busy || !srcs.length, onclick: () => suiteMatch(ins, { src: ui.vsSrc }) }, icon('mic'), M && M.target === tg.id ? 'Match again' : 'Match my voice'),
    el('label', { class: 'vsa-src' }, el('span', {}, 'Using'), el('select', { 'aria-label': 'Which recording of your voice to use', disabled: busy, onchange: e => { ui.vsSrc = e.target.value; SVM.voice = null; } }, srcs.map(x => el('option', { value: x.id, selected: x.id === ui.vsSrc }, x.label))))) : null; // nothing to match yet: the opening line says what to do
  const status = st && (busy || st.err) ? el('div', { class: 'vsa-status', role: 'status' }, el('span', {}, busy ? st.busy : st.err), busy ? el('span', { class: 'vsa-bar' }, el('i', { style: { width: Math.round((st.prog || 0) * 100) + '%' } })) : null) : null;
  let result = null;
  if (tg && M && M.target === tg.id && M.curves) {
    const W = 300, H = 112, fx = f => 6 + (W - 12) * Math.log2(f / 60) / Math.log2(16000 / 60), vis = LM_BANDS.map((f, i) => i).filter(i => LM_BANDS[i] >= 60);
    const all = vis.flatMap(i => [M.curves.you[i], M.curves.target[i], M.curves.after[i]]), hi = Math.max(...all) + 2, lo = Math.max(hi - 42, Math.min(...all) - 2);
    const y = v => 8 + (H - 22) * (1 - (clamp(v, lo, hi) - lo) / (hi - lo)), path = c => vis.map((i, k) => `${k ? 'L' : 'M'}${fx(LM_BANDS[i]).toFixed(1)},${y(c[i]).toFixed(1)}`).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your tone through the preset, the target, and after the match"><g class="gr">${[100, 1000, 10000].map(f => `<line x1="${fx(f)}" x2="${fx(f)}" y1="4" y2="${H - 14}"/><text x="${fx(f) + 3}" y="${H - 3}">${lmHz(f)}</text>`).join('')}</g><path class="you" d="${path(M.curves.you)}"/><path class="tgt" d="${path(M.curves.target)}"/><path class="aft" d="${path(M.curves.after)}"/></svg>`;
    const amt = Math.round((Number.isFinite(+M.amount) ? +M.amount : 1) * 100);
    const amtTxt = el('span', { class: 'mono' }, amt + '%');
    result = el('div', { class: 'vsa-res' },
      el('div', { class: 'vsa-plot' }, el('div', { html: svg }), el('div', { class: 'vsa-legend' }, el('span', { class: 'you' }, 'You through the preset'), el('span', { class: 'tgt' }, `${name}’s sound`), el('span', { class: 'aft' }, 'You, matched'))),
      el('div', { class: 'vsa-did' }, el('span', { class: 'vsa-k' }, `What I changed (from ${M.from})`), ...M.did.map(t => el('p', {}, '✓ ', t)), ...(M.tips || []).map(t => el('p', { class: 'tip' }, '! ', t)),
        el('div', { class: 'vsa-ctl' },
          el('label', { class: 'vsa-amt' }, el('span', {}, 'Tone match'), el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(amt), 'aria-label': 'How strongly the tone is matched',
            oninput: e => { amtTxt.textContent = e.target.value + '%'; suiteMatchAmount(ins, +e.target.value / 100, 'drag'); }, onchange: () => { ui.vsDragged = false; } }), amtTxt),
          eqm ? el('button', { class: 'vsa-ab' + (eqm.bypass ? '' : ' on'), 'aria-pressed': String(!eqm.bypass), title: 'Hear the preset with and without the tone match', onclick: () => mutate(P => { const e = suiteClassify(P.mixer[ins].fx).eqm; if (e) e.bypass = !e.bypass; }) }, eqm.bypass ? 'Match off' : 'Match on') : null)));
  }
  const chat = el('div', { class: 'vs-chat', id: 'vsChat', role: 'log', 'aria-live': 'polite' }, ui.vsChat.slice(-8).map(c => el('div', { class: 'vs-msg ' + c.who + (c.busy ? ' busy' : '') }, c.who === 'me' ? 'YOU: ' + c.text : c.greet ? suiteGreeting(ins, tg, M) : c.text)));
  const ask = el('form', { class: 'vs-ask', onsubmit: e => { e.preventDefault(); const i = e.target.elements.q; const q = i.value; i.value = ''; ui.vsFocus = true; suiteSend(ins, q); } },
    SR ? el('button', { type: 'button', class: 'vs-mic' + (ui.vsListening ? ' on' : ''), 'aria-label': 'Say it instead of typing', title: 'Say it instead of typing', onclick: () => suiteVoice(ins) }, icon('mic')) : null,
    el('input', { name: 'q', autocomplete: 'off', placeholder: isWide() ? 'Anything else? “less autotune”, “more reverb”, “sound like Drake”' : 'e.g. “less autotune”', 'aria-label': 'Tell the assistant what to change' }),
    el('button', { type: 'submit', class: 'vs-send', 'aria-label': 'Send' }, '➤'));
  return el('div', { class: 'vs-crt' + (busy || ui.vsChat.some(c => c.busy) || ui.vsListening ? ' busy' : '') }, el('div', { class: 'vs-crt-in vsa' }, head, go, status, result, chat, ask));
}
/* The Record section: the one place for everything about getting a take in (mic, count-in, loop, timing, takes) and what
   happened to it after (the polish). The Record button at the top does exactly the same as the big button here. */
function vsRecord(ins, m) {
  const recording = REC.state === 'rec' || REC.state === 'count', counting = REC.state === 'count', saving = REC.state === 'saving';
  const take = suiteTakeClip(ins), bar = Math.floor(T.songPos / 16) + 1, [kt] = suiteKeyText(ins);
  const box = el('section', { class: 'vs-rec', 'aria-label': 'Record' });
  const recBtn = el('button', { class: 'vss-rec' + (recording ? ' on' : '') + (counting ? ' count' : ''), disabled: saving, 'aria-pressed': String(recording), title: 'Record (R)', onclick: recordToggle },
    el('i', { 'aria-hidden': 'true' }), el('b', {}, saving ? 'Saving' : counting ? 'Ready' : recording ? 'Stop' : 'Record'));
  const loopTxt = ui.rec.loopBars ? `Loops bars ${bar}–${bar + ui.rec.loopBars - 1} and keeps every pass as a take.` : `From bar ${bar}${ui.rec.countIn ? ' after one bar of clicks' : ''}, with the song playing. Tune: ${kt}.`;
  const tog = (key, label, title) => el('button', { class: 'vs-chip' + (ui.rec[key] ? ' lit' : ''), 'aria-pressed': String(!!ui.rec[key]), disabled: recording, title, onclick: () => { ui.rec[key] = !ui.rec[key]; saveRecPrefs(); renderView(); } }, `${label}: ${ui.rec[key] ? 'on' : 'off'}`);
  box.append(el('div', { class: 'vs-rec-main' }, recBtn,
    el('div', { class: 'vss-recinfo' },
      el('b', { id: 'vssRecTime' }, saving ? 'Saving your take…' : counting ? 'Get ready…' : recording ? 'Recording' : take ? 'Record another take' : 'Record your vocal'),
      el('span', { class: 'vs-hint' }, recording || saving ? 'Press Stop (or R) when you’re done.' : loopTxt),
      !recording && bar > 1 ? el('button', { class: 'vs-chip', onclick: () => { T.songPos = T.marker = 0; renderView(); } }, 'Start from the top') : null),
    el('div', { class: 'vs-rec-tog' },
      el('button', { class: 'vs-chip big' + (REC.mon ? ' lit' : ''), 'aria-pressed': String(!!REC.mon), title: 'Hear yourself through the sound, with or without recording. Wear headphones.', onclick: () => suiteLive(ins) }, icon('phones'), REC.mon ? 'Hearing myself' : 'Hear myself'),
      tog('countIn', 'Count-in', 'One bar of clicks before recording starts'))));
  const opts = el('div', { class: 'vs-rec-opts' });
  if (REC.stream) opts.append(el('div', { class: 'vss-mic' }, el('span', { class: 'lbl' }, 'Mic'), el('span', { class: 'in-meter' }, el('i', { id: 'inFill' })), el('span', { id: 'vssMicTxt', class: 'vs-hint' }, 'Sing to check your level'), el('span', { class: 'in-clip', id: 'inClip', hidden: true }, 'Too loud')));
  else if (!REC.err) opts.append(el('span', { class: 'vs-hint' }, REC.opening ? 'Asking for your mic…' : 'The mic opens when you press Record or Hear myself.'));
  const latTxt = el('span', { class: 'vs-hint mono' }, `${ui.rec.latencyMs > 0 ? '+' : ''}${Math.round(ui.rec.latencyMs)} ms`);
  opts.append(...[
    el('span', { class: 'vs-field' }, el('span', { class: 'lbl' }, 'Loop'), el('div', { class: 'vs-seg', role: 'group', 'aria-label': 'Loop recording' }, [[0, 'Off'], [2, '2'], [4, '4'], [8, '8 bars']].map(([n, l]) =>
      el('button', { class: ui.rec.loopBars === n ? 'on' : '', 'aria-pressed': String(ui.rec.loopBars === n), disabled: recording, title: n ? `Loop ${n} bars and keep every pass as a take` : 'Record once, straight through', onclick: () => { ui.rec.loopBars = n; saveRecPrefs(); renderView(); } }, l)))),
    el('span', { class: 'vs-field', title: 'If your takes land late, turn this left. If early, turn it right.' }, el('span', { class: 'lbl' }, 'Timing'),
      knob({ mini: true, bipolar: true, value: ui.rec.latencyMs, min: -200, max: 200, def: 0, step: 1, label: 'Recording timing offset', fmt: v => (v > 0 ? '+' : '') + Math.round(v) + ' ms', onEnd: saveRecPrefs, onInput: v => { ui.rec.latencyMs = v; latTxt.textContent = (v > 0 ? '+' : '') + Math.round(v) + ' ms'; } }), latTxt),
    REC.devices && REC.devices.length > 1 ? el('label', { class: 'vs-field' }, el('span', { class: 'lbl' }, 'Input'),
      el('select', { 'aria-label': 'Microphone', disabled: recording, onchange: e => { ui.rec.deviceId = e.target.value; saveRecPrefs(); openMic(true); } },
        el('option', { value: '' }, 'Default mic'), REC.devices.filter(d => d.deviceId && d.deviceId !== 'default').map((d, i) => el('option', { value: d.deviceId, selected: d.deviceId === ui.rec.deviceId }, d.label || `Input ${i + 1}`)))) : null,
    el('button', { class: 'vs-chip', disabled: recording, title: 'Recorded on your phone or in another app? It lands on this track at the marker.', onclick: importTake }, 'Import a take')].filter(Boolean));
  box.append(opts);
  if (REC.err) { const [t1, t2] = micHelp(); box.append(el('div', { class: 'mic-err vss-err', role: 'alert' }, el('b', {}, t1), el('p', {}, t2),
    el('div', { class: 'btn-row' }, IOS ? el('button', { class: 'btn sm primary', onclick: importTake }, 'Import a take') : REC.err === 'blocked' && !STANDALONE ? el('button', { class: 'btn sm primary', onclick: getRecordingEdition }, 'Get the recording edition') : el('button', { class: 'btn sm', onclick: () => openMic(true) }, 'Try the mic again'),
      IOS ? null : el('button', { class: 'btn sm', onclick: importTake }, 'Import a take')))); }
  if (REC.stream && REC.clipCount >= 3) box.append(el('div', { class: 'mic-err vss-err', role: 'alert' }, el('b', {}, 'Your mic is clipping before the sound reaches Tapehouse'),
    el('p', {}, 'That crackle happens at the mic, so no effect can remove it. Turn down the gain knob on your mic or audio interface until the meter stays out of the red when you sing loudest. On Windows also check Settings › System › Sound › your mic › Input volume (try 70–80) and turn off any "Microphone boost".'),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn sm', onclick: () => { REC.clipCount = 0; renderView(); } }, 'I turned it down'))));
  // the take, and what the polish did to it
  const cards = el('div', { class: 'vs-rec-cards' });
  const st = ui.vsM && ui.vsM.ins === ins ? ui.vsM : null, M = m.vsMatch, tg = suiteTargetFor(m);
  const fitLine = st && st.busy ? el('p', { class: 'vs-hint live' }, st.busy)
    : st && st.err ? el('p', { class: 'vss-tip' }, 'Couldn’t fit the preset: ' + st.err)
    : M && tg && M.target === tg.id ? el('p', { class: 'vss-did' }, icon('check'), `Fitted to ${M.label}. What changed is in the assistant below.`) : null;
  if (take) {
    const n = take.takes ? take.takes.length : 1, k = take.takes ? Math.max(0, take.takes.indexOf(take.ref)) : 0, it = lib.get(take.ref);
    const flip = j => mutate(() => { take.ref = take.takes[(j + n) % n]; getBuffer(take.ref).catch(() => {}); });
    cards.append(el('div', { class: 'vss-card' },
      el('span', { class: 'vs-lbl' }, 'Your take'),
      el('div', { class: 'vss-take' }, el('b', {}, n > 1 ? `Take ${k + 1} of ${n}` : 'Take 1'), it ? el('span', { class: 'vs-hint' }, `${fmtDur(it.duration)} · bar ${Math.floor(take.start / 16) + 1}`) : null,
        n > 1 ? el('span', { class: 'vss-flip' }, el('button', { class: 'vs-key', 'aria-label': 'Previous take', onclick: () => flip(k - 1) }, '‹'), el('button', { class: 'vs-key', 'aria-label': 'Next take', onclick: () => flip(k + 1) }, '›')) : null),
      el('div', { class: 'vs-feel' },
        el('button', { class: 'vs-chip lit', onclick: () => { if (T.playing) halt(); T.songPos = T.marker = take.start; T.mode = 'song'; play(); } }, icon('play'), 'Play it'),
        n > 1 ? el('button', { class: 'vs-chip', title: 'Keep this take and drop the others (they stay in your library under Recordings)', onclick: () => mutate(() => { delete take.takes; }) }, icon('check'), 'Keep this one') : null,
        el('button', { class: 'vs-chip', onclick: () => { ui.plSel = take.id; setTab('playlist'); } }, 'Show in Song')), fitLine));
  }
  if (cards.children.length) box.append(cards);
  return box;
}
/* Hear myself: the mic through this track's sound, recording or not. */
async function suiteLive(ins) {
  if (!REC.mon) {
    const ti = suiteTrackOf(ins); if (ti >= 0 && REC.armed !== ti) armTrack(ti);
    if (!project.mixer[ins].fx.length) suiteLoadPreset(ins, suiteDefaultPreset());
  }
  await goLive();
  if (ui.tab === 'vocal') renderView();
}
function renderVocalChat() { if (ui.tab === 'vocal') renderView(); }
const SUITE_BOT_SVG = '<svg viewBox="0 0 64 52"><rect x="4" y="6" width="56" height="38" rx="7" class="b"/><rect x="12" y="13" width="40" height="17" rx="4" class="w"/><circle cx="23" cy="21.5" r="5.5" class="r"/><circle cx="41" cy="21.5" r="5.5" class="r"/><g class="sp"><path d="M23 17v9M18.5 21.5h9" class="s"/></g><g class="sp2"><path d="M41 17v9M36.5 21.5h9" class="s"/></g><path d="M25 36q7 5 14 0" class="m"/><path d="M14 44l3 5h30l3-5" class="b2"/><circle cx="32" cy="3" r="2.4" class="a"/><path d="M32 5v2" class="s"/></svg>';
function suiteVoice(ins) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
  if (ui.vsRec) { try { ui.vsRec.stop(); } catch (e) { /* ok */ } return; }
  const r = new SR(); ui.vsRec = r; r.lang = navigator.language || 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
  let finalText = '';
  r.onresult = e => { let s = ''; for (const res of e.results) { s += res[0].transcript; if (res.isFinal) finalText = s; } const i = $('.vs-ask input'); if (i) i.value = s; };
  r.onerror = e => { toast(e.error === 'not-allowed' ? 'The mic is blocked here, so type it instead.' : 'Didn’t catch that. Try again or type it.'); };
  r.onend = () => { ui.vsRec = null; ui.vsListening = false; const b = $('.vs-mic'); if (b) b.classList.remove('on'); const i = $('.vs-ask input'); const q = finalText || (i && i.value); if (q) { if (i) i.value = ''; suiteSend(ins, q); } };
  try { r.start(); ui.vsListening = true; const b = $('.vs-mic'); if (b) b.classList.add('on'); } catch (e) { ui.vsRec = null; }
}
function suiteKnob(ins, id, map) {
  const d = SUITE_MACROS[id], present = suiteRoles(d, map).every(r => map[r] && !map[r].bypass), val = suiteRoles(d, map).every(r => map[r]) ? d.get(map) : (d.off ?? d.def);
  return knob({ label: d.label, min: d.min, max: d.max, step: d.step, curve: d.curve, bipolar: d.bipolar, def: d.def, value: val, cls: 'vs-knob' + (present ? '' : ' idle'), fmt: d.fmt,
    onStart: () => { ui.vsDragged = false; }, onInput: x => suiteSetMacro(ins, id, x, 'drag'), onEnd: () => { ui.vsDragged = false; ui.vsKeep = d.label; renderView(); } });
}
function suiteModSwitch(ins, roles, map) {
  const present = roles.filter(r => map[r]), on = present.some(r => !map[r].bypass);
  return el('button', { class: 'vs-power' + (on ? ' on' : ''), 'aria-pressed': String(on), title: on ? 'Turn this module off' : 'Turn this module on',
    onclick: () => mutate(P => { const mp = suiteClassify(P.mixer[ins].fx); if (!present.length) suiteEnsure(P, ins, roles.slice(0, 1)); const m2 = suiteClassify(P.mixer[ins].fx); roles.forEach(r => { if (m2[r]) m2[r].bypass = on; }); void mp; }) }, on ? 'On' : 'Off');
}
function suitePanel(ins, tab, map) {
  const [, label, roles] = SUITE_MODS.find(x => x[0] === tab), headRow = el('div', { class: 'vs-ph' }, suiteModSwitch(ins, roles, map), el('b', {}, label));
  const knobs = ids => el('div', { class: 'vs-knobs' }, ids.map(id => suiteKnob(ins, id, map)));
  if (tab === 'tune') {
    const tf = map.tune, p = tf ? tf.params : {}, own = !!tf && p.root != null && +p.root >= 0;
    const root = own ? +p.root : project.key, sm = own ? p.smode : (p.scale === 'chromatic' ? 'chromatic' : project.scale);
    const modes = ['major', 'minor', 'harmonic', 'dorian', 'pentmin', 'pentmaj', 'blues', 'chromatic'], smOk = SCALES[sm] && modes.includes(sm) ? sm : 'minor';
    // In "Song key" the steppers change the song's key itself (the one at the top); in "Own key" they change only Tune's.
    const setTo = (r, s) => { if (own) { suiteWrite(ins, { tune: { root: r, smode: s } }); renderView(); } else setKey(r, SCALES[s] ? s : project.scale); };
    const setMode = md => { suiteWrite(ins, { tune: md === 'song' ? { root: -1 } : { root: project.key, smode: SCALES[project.scale] && modes.includes(project.scale) ? project.scale : 'minor' } }); renderView(); };
    const sk = project.smartKey, heard = sk && sk.src === 'beat', differs = heard && !suiteSameNotes(project.key, project.scale, sk.root, sk.mode);
    const status = el('span', { class: 'vs-hint' + (SK.busy && !own ? ' live' : '') }, own ? `Only Tune uses this key. The song stays in ${keyLabel(project)}.` : `${cap(songKeySource())}.` + ((sk && sk.extra || []).length && heard && !differs ? ` Keeps ${sk.extra.map(pc => KEY_MIN[pc]).join(', ')} too, since your beat uses it.` : ''));
    const keyBox = el('div', { class: 'vs-keybox' },
      el('div', { class: 'vs-seg', role: 'radiogroup', 'aria-label': 'Which key Tune snaps to' }, [['song', 'Song key'], ['own', 'Own key']].map(([id, lab]) =>
        el('button', { role: 'radio', 'aria-checked': String((id === 'own') === own), class: (id === 'own') === own ? 'on' : '', title: id === 'song' ? 'Snap to the song’s key, the one at the top, which follows your beat' : 'Give Tune a key of its own, without changing the song', onclick: () => setMode(id) }, lab))),
      el('span', { class: 'vs-lbl' }, 'Key'), el('div', { class: 'vs-step' }, el('button', { class: 'vs-key', 'aria-label': 'Key down', onclick: () => setTo((root + 11) % 12, smOk) }, '‹'), el('span', { class: 'vs-lcd' + (SK.busy && !own ? ' busy' : '') }, suiteKeyName(root, sm)), el('button', { class: 'vs-key', 'aria-label': 'Key up', onclick: () => setTo((root + 1) % 12, smOk) }, '›')),
      el('span', { class: 'vs-lbl' }, 'Scale'), el('div', { class: 'vs-step' }, el('button', { class: 'vs-key', 'aria-label': 'Scale back', onclick: () => setTo(root, modes[(modes.indexOf(smOk) + modes.length - 1) % modes.length]) }, '‹'), el('span', { class: 'vs-lcd' }, ((SCALES[sm] || {}).label || sm).replace('minor pentatonic', 'min penta').replace('major pentatonic', 'maj penta').replace('harmonic minor', 'harm minor')), el('button', { class: 'vs-key', 'aria-label': 'Scale forward', onclick: () => setTo(root, modes[(modes.indexOf(smOk) + 1) % modes.length]) }, '›')),
      vsKeys(tuneMask(project, tf ? tf.params.scale : 'key', tf ? tf.params.root : -1, tf ? tf.params.smode : 'minor')),
      status,
      own ? null : el('div', { class: 'vs-feel' },
        el('button', { class: 'vs-chip', disabled: SK.busy, title: 'Listen to the beat again and update the song key', onclick: () => smartKeyRun(true) }, 'Listen to my beat'),
        differs ? el('button', { class: 'vs-chip lit', onclick: () => setKey(sk.root, sk.mode) }, `Use ${suiteKeyName(sk.root, sk.mode)} ${sk.mode}`) : null),
      el('div', { class: 'vs-lstoggle' }, el('span', { class: REC.mon ? 'on' : '' }, 'Live'), el('span', { class: REC.mon ? '' : 'on' }, 'Studio')));
    const note = el('div', { class: 'vs-note' }, el('span', { class: 'vs-lbl' }, 'Current note'), el('b', { id: 'vsNote' }, '– –'),
      el('div', { class: 'vs-cents' }, el('i', { id: 'vsNeedle' }), el('span', {}, '−50'), el('span', {}, '−25'), el('span', {}, '0'), el('span', {}, '+25'), el('span', {}, '+50')), el('small', { id: 'vsNoteSub' }, 'Sing or play a vocal'));
    const feel = el('div', { class: 'vs-feel' }, TUNE_FEELS.map(([id, lab, rt]) => el('button', { class: 'vs-chip' + (tf && tuneFeelOf(tf) === id ? ' lit' : ''), onclick: () => { const t = TUNE_FEELS.find(x => x[0] === id); mutate(P => { suiteEnsure(P, ins, ['tune']); const f = suiteClassify(P.mixer[ins].fx).tune; f.bypass = false; Object.assign(f.params, { retune: t[2], humanize: t[3], flex: t[4], fcorr: t[5] }); }); } }, lab)));
    return [headRow, el('div', { class: 'vs-tune' }, keyBox, note, el('div', { class: 'vs-tknobs' }, knobs(['retune', 'humanize', 'flex']), feel))];
  }
  if (tab === 'cleanup') return [headRow, knobs(['gate', 'deess', 'tamer', 'lowcut']), el('p', { class: 'vs-hint' }, 'Noise gate quiets the room between phrases, De-ess tames S sounds, Tamer pulls down harsh ringing.')];
  if (tab === 'tone') return [headRow, knobs(['warmth', 'presence', 'air', 'grit']), map.eqm ? el('p', { class: 'vs-hint' }, 'Listen & Match’s EQ stays underneath; these are your moves on top.') : null];
  if (tab === 'dynamics') {
    const ch = map.comp ? map.comp.params.mode : null, setCh = c => { suiteWrite(ins, suiteCharacter(map, c)); renderView(); };
    return [headRow, el('div', { class: 'vs-dyn' }, knobs(['compress']),
      el('div', { class: 'vs-col' }, el('span', { class: 'vs-lbl' }, 'Character'), el('div', { class: 'vs-feel' }, [['fet', 'FET · 1176'], ['opto', 'Opto · LA-2A'], ['vox', 'Leveller'], ['clean', 'Clean']].map(([c, lab]) => el('button', { class: 'vs-chip' + (ch === c ? ' lit' : ''), onclick: () => setCh(c) }, lab))),
        el('span', { class: 'vs-lbl' }, 'Auto level'), el('button', { class: 'vs-chip' + (map.level && !map.level.bypass ? ' lit' : ''), onclick: () => mutate(P => { const mp = suiteClassify(P.mixer[ins].fx); if (!mp.level) suiteEnsure(P, ins, ['level']); else mp.level.bypass = !mp.level.bypass; }) }, map.level && !map.level.bypass ? 'On: rides your mic level' : 'Off')),
      el('div', { class: 'vs-gr' }, el('span', { class: 'vs-lbl' }, 'Reduction'), el('b', { id: 'vsGr' }, '0.0 dB'), el('div', { class: 'vs-grbar' }, el('i', { id: 'vsGrBar' }))))];
  }
  const dl = map.delay ? map.delay.params : null;
  return [headRow, el('div', { class: 'vs-space' }, knobs(['width', 'delay', 'reverb', 'size']),
    el('div', { class: 'vs-col' }, el('span', { class: 'vs-lbl' }, 'Delay time'), el('div', { class: 'vs-feel' }, DELAY_TIMES.map(t => el('button', { class: 'vs-chip' + (dl && +dl.time === t.value ? ' lit' : ''), onclick: () => { suiteWrite(ins, { delay: { time: t.value } }); renderView(); } }, t.label)))))];
}
/* One octave: lit keys are the notes Tune snaps to; while you sing, the key you're on glows and the one Tune lands on is marked. */
function vsKeys(mask) {
  const white = [0, 2, 4, 5, 7, 9, 11], black = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]];
  return el('div', { class: 'vs-keys', role: 'img', 'aria-label': 'Notes Tune snaps to: ' + KEY_NAMES.filter((_, pc) => mask & (1 << pc)).join(', ') },
    ...white.map(pc => el('i', { class: 'w' + (mask & (1 << pc) ? ' on' : ''), 'data-pc': String(pc) }, el('span', {}, KEY_MIN[pc]))),
    ...black.map(([pc, pos]) => el('i', { class: 'b' + (mask & (1 << pc) ? ' on' : ''), 'data-pc': String(pc), style: { left: `calc(${pos} * (100% / 7) - 0.3 * (100% / 7))` } })));
}
/* Meters, the current-note display and gain reduction, while the Vocal tab is on screen. */
let suiteRaf = 0, grShown = 0;
function suiteTick(ins) {
  cancelAnimationFrame(suiteRaf);
  const buf = new Float32Array(512);
  const loop = () => {
    const root = $('.vs'); if (!root || ui.tab !== 'vocal') return;
    const e = engine && engine.inserts[ins];
    suiteSimpleTick();
    for (const side of ['in', 'out']) {
      const mt = root.querySelector(`[data-meter="${side}"]`); if (!mt) continue;
      let lv = 0; const an = e && (side === 'in' ? e.pre : e.meter);
      if (an) { an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > lv) lv = a; } }
      const db = 20 * Math.log10(lv + 1e-9), lit = Math.round(clamp((db + 48) / 48, 0, 1) * 14);
      [...mt.children].forEach((c, i) => { c.className = i < lit ? (i >= 12 ? 'r' : i >= 9 ? 'y' : 'g') : ''; });
    }
    const map = e ? suiteClassify(project.mixer[ins].fx) : {};
    const nb = $('#vsNote'), nd = $('#vsNeedle'), ns = $('#vsNoteSub');
    if (nb && map.tune) {
      const f = e.fx.find(x => x.id === map.tune.id), r = f && f.probe ? f.probe() : null;
      if (r && r.v && r.t != null && (T.playing || REC.stream)) {
        const near = Math.round(r.m), off = clamp((r.m - near) * 100, -50, 50), kp = ((near % 12) + 12) % 12, tp = ((Math.round(r.t) % 12) + 12) % 12;
        $$('.vs-keys i').forEach(k => { k.classList.toggle('sing', +k.dataset.pc === kp); k.classList.toggle('land', +k.dataset.pc === tp && tp !== kp); });
        nb.textContent = noteName(near).replace(/-?\d+$/, ''); nd.style.left = (50 + off) + '%'; nd.classList.add('on'); nd.classList.toggle('ok', Math.abs(off) < 10);
        if (ns) ns.textContent = `${off >= 0 ? '+' : '−'}${Math.abs(Math.round(off))} ct, Tune lands it on ${noteName(r.t).replace(/-?\d+$/, '')}`;
      } else { nb.textContent = '– –'; nd.classList.remove('on'); nd.style.left = '50%'; $$('.vs-keys i.sing, .vs-keys i.land').forEach(k => k.classList.remove('sing', 'land')); if (ns) ns.textContent = T.playing || REC.stream ? 'Listening…' : 'Sing or play a vocal'; }
    }
    const gb = $('#vsGr'), gbar = $('#vsGrBar');
    if (gb && map.comp && e) { // both compressors together, falling fast and recovering slowly so it can be read
      let g = 0; for (const c of [map.comp, map.comp2]) { if (!c || c.bypass) continue; const f = e.fx.find(x => x.id === c.id), r = f && f.probe ? f.probe() : null; if (r && Number.isFinite(r.gr)) g += Math.min(0, r.gr); }
      grShown = g < grShown ? g : grShown + (g - grShown) * 0.08;
      const gs = Math.abs(grShown) < 0.05 ? 0 : grShown; gb.textContent = (gs ? '−' + Math.abs(gs).toFixed(1) : '0.0') + ' dB'; if (gbar) gbar.style.width = clamp(-gs / 18 * 100, 0, 100) + '%'; }
    suiteRaf = requestAnimationFrame(loop);
  };
  suiteRaf = requestAnimationFrame(loop);
}

/* =====================================================================
   Recording and the polish: Record (top bar, R, or the big button on the Vocal screen) records onto your vocal track.
   After each take Tapehouse polishes it (voice type, room noise, sharp S's) and sets its level to sit on the beat.
   ===================================================================== */
function suiteDefaultPreset() {
  if (ui.vsPending) return ui.vsPending;
  const a = SUITE_ARTISTS.find(x => x.chain === lastTunedChain()) || SUITE_ARTISTS[0];
  return { kind: 'artist', id: a.id, name: `${a.name} style` };
}
/* The vocal track and its insert, made on first use with the chosen (or last used) sound. */
/* A fresh vocal track (no effects, no takes, never given a sound) gets the chosen or last used sound. */
function suiteAutoSound(ins) {
  const m = project.mixer[ins], ti = suiteTrackOf(ins); if (!m || m.fx.length || m.vsPreset) return;
  if (ti >= 0 && project.playlist.clips.some(c => c.kind === 'audio' && c.track === ti)) return;
  suiteLoadPreset(ins, suiteDefaultPreset());
}
function suiteEnsureTrack() {
  let ins = suiteIns(); if (ins > 0) { suiteAutoSound(ins); return ins; }
  const ti = giveTrackInsert(pickRecordTrack()); ins = project.playlist.tracks[ti].insert | 0; ui.vsIns = ins;
  if (ins > 0 && !project.mixer[ins].fx.length) suiteLoadPreset(ins, suiteDefaultPreset());
  return ins;
}
const suiteTrackOf = ins => project.playlist.tracks.findIndex(t => (t.insert | 0) === ins);
async function suiteRecord() {
  if (REC.state !== 'idle') return;
  let ti = REC.armed != null && project.playlist.tracks[REC.armed] ? REC.armed : -1;
  if (ti < 0) ti = suiteTrackOf(suiteEnsureTrack());
  if (ti < 0) return;
  if (REC.armed !== ti) armTrack(ti);
  await startRecording();
}
/* Called when a take lands on a track (from any screen). */
function afterTake(clipId, ti) {
  const tr = project.playlist.tracks[ti], ins = tr ? tr.insert | 0 : 0;
  if (ins > 0) { ui.vsIns = ins; ui.vsTake = clipId; clearTimeout(SVM.auto); suiteMatch(ins, { auto: true, src: 'take', clip: clipId }); }
}
function suiteTakeClip(ins) {
  const ti = suiteTrackOf(ins); if (ti < 0) return null;
  const own = project.playlist.clips.filter(c => c.kind === 'audio' && c.track === ti);
  return own.find(c => c.id === ui.vsTake) || own[own.length - 1] || null;
}
function kBlocks(b) { // mean square of the K-weighted signal per 400 ms block, 100 ms apart (BS.1770 blocks)
  const sr = b.sampleRate, blk = Math.floor(sr * 0.4), hop = Math.floor(sr * 0.1), chs = [], out = [];
  for (let c = 0; c < b.numberOfChannels; c++) chs.push(b.getChannelData(c));
  for (let i = 0; i + blk <= chs[0].length; i += hop) { let z = 0; for (const d of chs) { let s = 0; for (let j = i; j < i + blk; j += 2) s += d[j] * d[j]; z += s / (blk / 2); } out.push(z); }
  return out;
}
/* How loud the vocal sits against the beat: each rendered on its own over (up to 20 s of) the take, through its effects,
   compared only where the vocal is singing. Returns loudness in LU and the gap. */
async function suiteMeasureBalance(P, clip) {
  const sd = 60 / P.bpm / 4, from = clip.start, to = Math.min(clip.start + clip.len, clip.start + Math.ceil(20 / sd)), voc = suiteVocalTracks(P), vti = clip.track;
  const beat = JSON.parse(JSON.stringify(P)), vox = JSON.parse(JSON.stringify(P));
  beat.playlist.tracks.forEach((t, i) => { if (voc.has(i) || i === vti) t.mute = true; });
  vox.channels.forEach(c => { c.mute = true; }); vox.playlist.tracks.forEach((t, i) => { t.mute = i !== vti; });
  const SR = 22050, [rb, rv] = await Promise.all([renderOffline(beat, 'song', SR, { from, to }, { noMaster: true }), renderOffline(vox, 'song', SR, { from, to }, { noMaster: true })]);
  const zb = kBlocks(await filterPass(rb.buffer, rb.frames, K_CHAIN)), zv = kBlocks(await filterPass(rv.buffer, rv.frames, K_CHAIN)), n = Math.min(zb.length, zv.length);
  const lk = z => -0.691 + 10 * Math.log10(z + 1e-12);
  if (n < 4) return null;
  let vmax = -Infinity; for (let i = 0; i < n; i++) vmax = Math.max(vmax, lk(zv[i]));
  const act = []; for (let i = 0; i < n; i++) if (lk(zv[i]) > Math.max(-60, vmax - 18)) act.push(i);
  if (act.length < 3) return null;
  const Lv = lk(act.reduce((s, i) => s + zv[i], 0) / act.length), Lb = lk(act.reduce((s, i) => s + zb[i], 0) / act.length);
  return { Lv, Lb, diff: Lv - Lb, beat: Lb > -55 };
}
/* How far above the beat a lead vocal sits, by style (LU). Rap rides on top; dreamy, washed-out vocals sit inside the beat. */
function suiteBalanceTarget(m) {
  const n = String(m.vsPreset || '').toLowerCase();
  return /rap/.test(n) ? 2.5 : /dreamy|travis|future|billie/.test(n) ? 0.5 : 1.5;
}
function smartKeyEnsure() { const P = project; if (!SK.busy && (!P.smartKey || P.smartKey.sig !== beatSig(P))) smartKeyRun(true); }
let micHold = [];
function suiteSimpleTick() {
  const t = document.getElementById('vssRecTime');
  if (t && ctx && Number.isFinite(REC.songStart)) {
    if (REC.state === 'count') t.textContent = `Get ready… ${Math.max(1, Math.ceil((REC.songStart - ctx.currentTime) / (60 / project.bpm)))}`;
    else if (REC.state === 'rec') { const s = Math.max(0, ctx.currentTime - REC.songStart); t.textContent = `Recording ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
  }
  const mt = document.getElementById('vssMicTxt');
  if (mt && REC.stream) { // the loudest moment of the last 3 seconds decides what the level note says
    const now = performance.now(); micHold.push([now, REC.level || 0]); while (micHold.length && now - micHold[0][0] > 3000) micHold.shift();
    let mx = 0; for (const h of micHold) if (h[1] > mx) mx = h[1];
    const db = mx * 54 - 54;
    const [txt, cls] = REC.clipUntil > now ? ['Too loud: back off or turn your mic down', 'bad'] : mx < 0.12 ? ['Sing to check your level', 'idle'] : db < -36 ? ['A bit quiet: sing closer or turn your mic up', 'warn'] : db > -3 ? ['Nearly too loud: back off a little', 'warn'] : ['Good level', 'ok'];
    if (mt.textContent !== txt) { mt.textContent = txt; mt.className = 'vs-hint mic-' + cls; }
  }
}
function suiteRefreshSoft() { const a = document.activeElement; if (ui.tab === 'vocal' && !ui.vsDragged && !(a && a.closest && a.closest('.vs') && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) renderView(); }
/* What Tune snaps to, in words: [key, where it comes from]. */
function suiteKeyText(ins) {
  const m = ins > 0 ? project.mixer[ins] : null, map = m ? suiteClassify(m.fx) : {}, tf = map.tune && !map.tune.bypass ? map.tune : null;
  if (m && !tf) return ['off', 'This sound doesn’t use Tune.'];
  if (tf && tf.params.root != null && +tf.params.root >= 0) return [`${suiteKeyName(+tf.params.root, tf.params.smode)} ${(SCALES[tf.params.smode] || {}).label || tf.params.smode}`, 'Tune’s own key'];
  return [keyLabel(project), songKeySource()];
}

/* =====================================================================
   Sound like: the preset says who you want to sound like; this makes YOUR voice land there.
   It listens to your take (or 10 seconds of singing), runs it through the preset, measures the result against that
   artist's sound and fits the chain to you: tone (a match EQ checked by re-measuring), compression for your dynamics,
   Tune speed for how far you drift off the notes, de-esser, gate, voice type and level. One undo step.
   ===================================================================== */
// The sound each preset aims for: a produced lead-vocal tone (LM_BASE) tilted per artist, plus how even and how
// sibilant it is. Our read of each artist's records, so a starting point rather than their engineer's settings.
const SUITE_TARGETS = {
  breezy: LM_STYLES.breezy, bieber: LM_STYLES.bieber, laroi: LM_STYLES.laroi, mgk: LM_STYLES.mgk,
  clean: LM_STYLES.clean, rap: LM_STYLES.rap, dreamy: LM_STYLES.dreamy,
  weeknd: { lra: 5, sib: -10, tilt: [[200, 0], [350, -1], [700, 0], [3000, 0], [6000, 1], [10000, 2], [16000, 2]] },
  drake: { lra: 4, sib: -9, tilt: [[150, 0.5], [300, 1], [600, 0.5], [1500, 0.5], [4000, 0], [8000, -1], [14000, -1.5]] },
  travis: { lra: 4, sib: -8, tilt: [[300, -0.5], [1500, 0], [3000, 1.5], [6000, 1.5], [10000, 1.5], [16000, 1]] },
  posty: { lra: 5, sib: -9, tilt: [[200, 0.5], [400, 0.5], [1000, 0], [2500, 0.5], [8000, 0.5], [14000, 1]] },
  juice: { lra: 5, sib: -9, tilt: [[300, 0], [2000, 0.5], [3500, 1.5], [8000, 1], [14000, 1]] },
  billie: { lra: 7, sib: -11, tilt: [[120, 1], [250, 1.5], [500, 0.5], [2500, -1], [5000, -0.5], [9000, 0.5], [14000, 1]] },
  ariana: { lra: 6, sib: -10, tilt: [[250, -0.5], [500, -0.5], [2000, 0], [4000, 0.5], [8000, 2], [12000, 2.5], [16000, 2.5]] },
  sza: { lra: 6, sib: -10, tilt: [[200, 0.5], [400, 0.5], [1500, 0], [5000, 0.5], [10000, 1.5], [16000, 1.5]] },
  frank: { lra: 6, sib: -10, tilt: [[150, 0.5], [300, 1], [700, 0.5], [2500, 0], [6000, 0], [12000, 0.5]] },
  tpain: { lra: 4, sib: -9, tilt: [[500, 0], [1000, 1], [2000, 1.5], [3500, 1], [6000, 0.5], [12000, 0.5]] },
  future: { lra: 4, sib: -9, tilt: [[200, 0.5], [500, 0.5], [1200, 1], [2500, 0.5], [6000, -0.5], [12000, -1]] },
  bruno: { lra: 5, sib: -9, tilt: [[300, -0.5], [1500, 0.5], [3000, 1.5], [5000, 1], [10000, 1]] },
};
const suiteTargetLabel = id => { const a = SUITE_ARTISTS.find(x => x.id === id); return a ? a.name : CHAINS[id] ? CHAINS[id].label : 'Clean vocal'; };
function suiteTargetFor(m) {
  const id = m && m.vsTarget && (SUITE_TARGETS[m.vsTarget] || m.vsTarget === 'instrument') ? m.vsTarget : 'clean', t = SUITE_TARGETS[id];
  if (!t) return null; // guitar or keys: nothing to sound like, just the level
  return { id, label: suiteTargetLabel(id), artist: !!SUITE_ARTISTS.find(x => x.id === id), curve: LM_BANDS.map(f => lmInterp(LM_BASE, f) + lmInterp(t.tilt || [], f)), lra: t.lra, sib: t.sib };
}
const SVM = { token: 0, voice: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* Where your voice comes from: the take on this track, 10 seconds of singing now, or a file in your library. */
function suiteSources(ins) {
  const out = [], take = suiteTakeClip(ins);
  if (take) out.push({ id: 'take', label: 'Your latest take', ref: take.ref });
  const micOk = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;
  if (REC.stream || (STANDALONE && micOk && !REC.err)) out.push({ id: 'mic', label: 'Sing 10 seconds now' });
  const voc = suiteVocalTracks(project), beat = new Set(project.playlist.clips.filter(c => c.kind === 'audio' && !voc.has(c.track)).map(c => c.ref)); // the beat is not your voice
  for (const s of lmLibraryAudio().slice(0, 30)) if ((!take || s.id !== take.ref) && !beat.has(s.id)) out.push({ id: 'lib:' + s.id, label: s.name, ref: s.id });
  return out;
}
async function suiteCaptureMic(ins, tick) {
  const ti = suiteTrackOf(ins); if (ti >= 0 && REC.armed !== ti) armTrack(ti);
  if (!(await openMic())) throw new Error(micHelp()[1]);
  if (REC.state !== 'idle') throw new Error('Stop recording first.');
  startCapture();
  for (let s = 10; s > 0; s--) { tick(s); await sleep(1000); }
  await stopCapture();
  const chunks = REC.chunks.slice().sort((a, b) => a.f - b.f); REC.chunks = [];
  const total = chunks.reduce((s, c) => s + c.d.length, 0); if (total < ctx.sampleRate * 3) throw new Error('I didn’t get enough of your voice from the mic. Try again a little louder.');
  const buf = new AudioBuffer({ numberOfChannels: 1, length: total, sampleRate: ctx.sampleRate }), d = buf.getChannelData(0); let o = 0;
  for (const c of chunks) { d.set(c.d, o); o += c.d.length; }
  return buf;
}
/* Your voice, measured once per take: switching presets afterwards re-fits without listening again. */
async function suiteGetVoice(ins, srcId, onBusy) {
  const src = suiteSources(ins).find(s => s.id === srcId) || suiteSources(ins)[0];
  if (!src) throw new Error(STANDALONE ? 'Record a take first, or pick Sing 10 seconds now.' : 'Record a take first (in the recording edition), or import one.');
  const key = src.id === 'mic' ? null : src.ref;
  if (key && SVM.voice && SVM.voice.key === key) return SVM.voice;
  let buf;
  if (src.id === 'mic') buf = await suiteCaptureMic(ins, s => onBusy(`Sing the way you normally do… ${s}`, (10 - s) / 10));
  else { onBusy('Loading your voice…', 0); buf = await getBuffer(src.ref); }
  if (!buf) throw new Error('That take couldn’t be loaded.');
  onBusy('Listening to your voice…', 0);
  const a = await analyzeVoice(buf, p => onBusy('Listening to your voice…', p));
  const sr = buf.sampleRate, s0 = Math.floor(a.excerpt.start * sr), len = Math.min(buf.length - s0, Math.floor(Math.min(10, a.excerpt.dur) * sr));
  const ex = new AudioBuffer({ numberOfChannels: 1, length: Math.max(len, 1), sampleRate: sr }), d = ex.getChannelData(0), L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  for (let i = 0; i < len; i++) d[i] = R ? (L[s0 + i] + R[s0 + i]) * 0.5 : L[s0 + i];
  SVM.voice = { key: key || 'mic:' + Date.now(), a, ex, label: src.id === 'mic' ? 'what you just sang' : src.id === 'take' ? 'your latest take' : src.label };
  return SVM.voice;
}
/* Your excerpt through a chain, measured: tone curve, dynamics, S sounds and level. Space effects are left out of the
   measurement, so reverb tails don't read as tone. */
async function suiteRenderMeasure(fx, ex) {
  const id = '__vs_excerpt'; buffers.set(id, ex);
  try {
    const dry = fx.map(f => ['th.doubler', 'th.chorus', 'th.tape-delay', 'th.pingpong', 'th.room-reverb'].includes(f.plugin) ? { ...f, bypass: true } : f);
    const sd = 60 / project.bpm / 4, steps = Math.ceil(ex.duration / sd) + 1;
    const P = normalizeProject({ id: 'vsm', name: 'vsm', bpm: project.bpm, key: project.key, scale: project.scale, keySet: project.keySet, smartKey: project.smartKey, channels: [], patterns: [],
      playlist: { tracks: [{ name: 'Vocal', insert: 1, mute: false }], clips: [{ id: 'x', kind: 'audio', ref: id, track: 0, start: 0, len: steps, gain: 1, offset: 0 }], markers: [] },
      mixer: [{ name: 'Master', vol: 1, fx: [] }, { name: 'Vocal', vol: 1, fx: dry }], master: { on: false }, automation: [] });
    const { buffer, frames } = await renderOffline(P, 'song', 44100, { from: 0, to: steps });
    const o = buffer.getChannelData(0); let s = 0, c = 0; for (let k = 0; k < frames; k++) { const v = o[k]; if (v * v > 1e-7) { s += v * v; c++; } }
    const out = await analyzeVoice(buffer);
    return { curve: out.curve, lra: out.lra, sibRel: out.sibRel, rms: c ? lmDb(s / c) : -90 };
  } finally { buffers.delete(id); }
}
/* What the tone match wants: target minus what you sound like through the preset, smoothed and kept musical. */
function suiteDesired(tgCurve, outCurve, lim = 1, valid = null, mel = null) {
  const you = lmNorm(outCurve), tg = lmNorm(tgCurve), raw = tg.map((v, i) => valid && !valid[i] ? 0 : v - you[i]); // bands your recording doesn't contain stay put
  const sm = raw.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) if (raw[i + k] !== undefined) { s += raw[i + k]; c++; } return s / c; });
  // where your melody sits, the level mostly says which notes you sang: move it gently, so the voice keeps its body
  // boom from singing close to the mic can come out a lot (cuts up to 9 dB under 250 Hz); lows never get pumped up
  return sm.map((v, i) => { const f = LM_BANDS[i]; let l = f < 120 ? 0 : f < 250 ? (v < 0 ? 9 : 4) : f < 9000 ? 8 : 6; if (mel && mel[i] && f >= 250) l = Math.min(l, 5); if (f > 10000 && v > 0) l = 5; return clamp(v, -l * lim, l * lim); });
}
/* Tone is the broad balance of a voice, so curves are compared a third of an octave at a time, not note by note. */
const suiteSmooth = c => c.map((_, i) => { let s = 0, w = 0; for (let k = -2; k <= 2; k++) { const v = c[i + k]; if (v !== undefined) { const wt = 3 - Math.abs(k); s += v * wt; w += wt; } } return s / w; });
/* The bands your melody sits in (from the notes you actually sang). */
function suiteMelody(a) {
  const n = (a && a.notes || []).slice().sort((x, y) => x - y); if (n.length < 30) return null;
  const q = p => n[Math.floor(p * (n.length - 1))], hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const lo = hz(q(0.1)) / Math.pow(2, 1 / 6), hi = hz(q(0.9)) * Math.pow(2, 1 / 6);
  return LM_BANDS.map(f => f >= lo && f <= hi);
}
/* How far a sound is from the target's tone, in dB: smoothed, over the bands your recording has, melody bands counted lightly. */
const suiteToneErr = (curve, tgCurve, valid = null, mel = null) => { const a = suiteSmooth(lmNorm(curve)), t = suiteSmooth(lmNorm(tgCurve)); let s = 0, c = 0; LM_BANDS.forEach((f, i) => { if (f >= 100 && f <= 12000 && (!valid || valid[i])) { const w = mel && mel[i] && f >= 250 ? 0.3 : 1; s += w * (a[i] - t[i]) ** 2; c += w; } }); return c ? Math.sqrt(s / c) : 0; };
/* Bands your recording actually has (a phone or an old file can stop at 8 kHz): nothing to match where there's no voice. */
const suiteValid = a => { const mx = Math.max(...a.curve); return a.curve.map(v => v > mx - 50); };
/* How far you drift off the notes Tune snaps to (median, in cents), from the steady parts of your singing. */
function suiteDrift(a, tuneFx) {
  if (!a.notes || a.notes.length < 30 || !tuneFx) return null;
  const p = tuneFx.params, mask = tuneMask(project, p.scale, p.root, p.smode), devs = [];
  for (const m of a.notes) { let best = 99; for (let k = -6; k <= 6; k++) { const n = Math.round(m) + k; if (mask & (1 << (((n % 12) + 12) % 12))) best = Math.min(best, Math.abs(m - n)); } if (best < 99) devs.push(best * 100); }
  devs.sort((x, y) => x - y); return devs.length ? devs[Math.floor(devs.length / 2)] : null;
}
async function suiteMatch(ins, opts = {}) {
  const m = project.mixer[ins]; if (!m) return;
  clearTimeout(SVM.auto); // this match covers any automatic one still waiting to start
  const token = ++SVM.token, tg = suiteTargetFor(m), P0 = project;
  const st = ui.vsM = { ins, busy: 'Getting ready…', prog: 0, err: '', auto: !!opts.auto, target: tg ? tg.label : '', tid: m.vsTarget };
  const busy = (t, p) => { if (token !== SVM.token) return; st.busy = t; st.prog = p || 0; const b = $('.vsa-bar i'), s = $('.vsa-status span'); if (b && s) { b.style.width = Math.round(st.prog * 100) + '%'; s.textContent = t; } else suiteRefreshSoft(); };
  suiteRefreshSoft();
  try {
    const v = tg ? await suiteGetVoice(ins, opts.src || ui.vsSrc, busy) : null, a = v && v.a; // guitar or keys: only the level
    if (token !== SVM.token || project !== P0) return;
    if (engine) await engine.loadDsp();
    // plan on a copy of the chain: same effects, same ids, so nothing drops out when it's applied
    const fx = JSON.parse(JSON.stringify(m.fx)), Q = { mixer: { [ins]: { fx } } }, did = [], tips = [];
    let map = suiteClassify(fx);
    const vocal = !!(tg && v);
    if (vocal) {
      const voice = lmVoiceType(a), tunes = fx.filter(f => f.plugin === 'th.autotune');
      if (tunes.some(f => (f.params.voice || 'tenor') !== voice)) { tunes.forEach(f => { f.params.voice = voice; }); did.push(`Tune set for ${{ low: 'a low voice', tenor: 'a mid-range voice', soprano: 'a high voice' }[voice]}, so it tracks all your notes`); }
      if (a.noiseDb != null && a.noiseDb > -62 && a.activeDb - a.noiseDb < 35) {
        const target = Math.round(clamp(a.noiseDb + 6, -80, -30));
        if (!map.gate || map.gate.bypass || +map.gate.params.target < target - 3) { suiteEnsure(Q, ins, ['gate']); map = suiteClassify(fx); map.gate.bypass = false; map.gate.params.target = target; did.push('Gate on, to hide the room noise between your lines'); }
      }
      const sx = a.sibRel - tg.sib;
      if (sx > 1.5) { suiteEnsure(Q, ins, ['deess']); map = suiteClassify(fx); const want = clamp(40 + sx * 8, 40, 90), cur = clamp(+map.deess.params.range / 0.12, 0, 100); if (want > cur + 5) { Object.assign(map.deess.params, SUITE_MACROS.deess.set(want, map).deess); map.deess.bypass = false; did.push(`Your S sounds are sharper than ${tg.label}’s, so the de-esser works harder`); } }
      if (map.comp) {
        const ex2 = a.lra * 0.8 - tg.lra, cur = suiteCompPos(map.comp.params.amount ?? 0.3);
        const want = clamp(cur + (ex2 > 1 ? ex2 * 4 : ex2 < -2 ? ex2 * 2 : 0), 10, 85);
        if (Math.abs(want - cur) >= 4) { const ch = SUITE_MACROS.compress.set(want, map); for (const r in ch) if (map[r]) Object.assign(map[r].params, ch[r]); did.push(want > cur ? `Your loud and soft lines are ${a.lra.toFixed(0)} dB apart (${tg.label}: about ${tg.lra}), so compression evens you out more` : 'You sing very evenly already, so compression eases off'); }
      }
      const tf = map.tune && !map.tune.bypass ? map.tune : null, drift = suiteDrift(a, tf);
      if (tf && drift != null) {
        const r0 = +tf.params.retune;
        if (drift > 25 && r0 > 10) { const r1 = Math.round(clamp(r0 * Math.pow(25 / drift, 1.3), 8, r0)); if (r1 < r0 - 2) { tf.params.retune = r1; tf.params.humanize = +clamp((+tf.params.humanize || 0) * 0.7, 0, 1).toFixed(2); did.push(`You drift about ${Math.round(drift)} cents off the notes, so Tune pulls a bit faster (${r0} → ${r1} ms) to land you on pitch like ${tg.label}`); } }
        else if (drift <= 12 && r0 <= 10 && !tg.artist) did.push(`You’re within ${Math.round(drift)} cents of the notes: nice and in tune`);
      }
      suiteEnsure(Q, ins, ['eqm']); map = suiteClassify(fx);
      const eqm = map.eqm; eqm.bypass = false; eqm.params.lowcut = lmLowCut(a); LM_EQ.forEach((_, k) => { eqm.params['g' + k] = 0; });
      // tone, checked by ear (well, by measuring): through the preset as it is, then with the match EQ, then once more to refine
      busy(`Running your voice through ${tg.label}…`, 0.2);
      const out0 = await suiteRenderMeasure(fx, v.ex); if (token !== SVM.token) return;
      const valid = suiteValid(a), mel = suiteMelody(a);
      // boom: close to a mic you carry far more low end than a finished record. A higher low cut clears it (and makes room for the 808)
      const lc0 = eqm.params.lowcut, ys = suiteSmooth(lmNorm(out0.curve)), ts = suiteSmooth(lmNorm(tg.curve));
      let lowEx = 0, nLow = 0; LM_BANDS.forEach((f, i) => { if (f >= 60 && f <= 130 && valid[i]) { lowEx += ys[i] - ts[i]; nLow++; } }); lowEx = nLow ? lowEx / nLow : 0;
      let base = out0.curve;
      if (lowEx > 6 && a.f0) {
        const lc = Math.round(clamp(a.f0.lo * (lowEx > 12 ? 1.15 : 1), lc0, 140));
        if (lc >= lc0 + 5) { eqm.params.lowcut = lc; base = out0.curve.map((v, i) => v + lmBiquadDb('highpass', lc, 0.71, 0, LM_BANDS[i]) - lmBiquadDb('highpass', lc0, 0.71, 0, LM_BANDS[i])); did.push(`Low cut up to ${lc} Hz: singing close to the mic adds boom that ${tg.label}’s records don’t have, and it leaves room for the 808`); }
      }
      let full = lmFitEq(suiteDesired(tg.curve, base, 1, valid, mel));
      const amount = m.vsMatch && Number.isFinite(+m.vsMatch.amount) ? +m.vsMatch.amount : 1;
      const setG = g => LM_EQ.forEach((_, k) => { eqm.params['g' + k] = +(g[k] * amount).toFixed(1); });
      setG(full); busy('Matching your tone…', 0.5);
      const out1 = await suiteRenderMeasure(fx, v.ex); if (token !== SVM.token) return;
      const fix = lmFitEq(suiteDesired(tg.curve, out1.curve, 0.5, valid, mel));
      full = full.map((g, k) => +clamp(g + 0.7 * fix[k] / Math.max(0.25, amount), -12, 9).toFixed(1)); setG(full); // boosts stay musical: past +9 dB a voice turns harsh
      busy('Checking the result…', 0.8);
      const out2 = await suiteRenderMeasure(fx, v.ex); if (token !== SVM.token) return;
      const trim = clamp(-18 - out2.rms, -6, 6), last = map.comp2 || map.comp;
      if (last && Math.abs(trim) >= 0.5) last.params.output = +clamp((+last.params.output || 0) + trim, -12, 12).toFixed(1);
      const band = (lo, hi) => { const d = suiteDesired(tg.curve, out0.curve, 1, valid, mel); let s = 0, c = 0; LM_BANDS.forEach((f, i) => { if (f >= lo && f <= hi) { s += d[i]; c++; } }); return c ? s / c : 0; };
      const air = band(7000, 14000), pres = band(2000, 5000), mud = band(200, 500), tone = [];
      if (Math.abs(air) >= 1.2) tone.push(air > 0 ? `${air.toFixed(0)} dB darker up top` : `${(-air).toFixed(0)} dB brighter up top`);
      if (Math.abs(pres) >= 1.2) tone.push(pres > 0 ? `${pres.toFixed(0)} dB less presence` : `${(-pres).toFixed(0)} dB more bite`);
      if (Math.abs(mud) >= 1.2) tone.push(mud < 0 ? `${(-mud).toFixed(0)} dB boomier in the low mids` : 'thinner in the low mids');
      const e0 = suiteToneErr(out0.curve, tg.curve, valid, mel), e2 = suiteToneErr(out2.curve, tg.curve, valid, mel);
      if (!valid[LM_BANDS.findIndex(f => f >= 10000)]) tips.push('Your recording stops below 10 kHz (a phone or a compressed file?), so there’s no “air” in it to bring out. A proper mic or the raw voice memo gets closer.');
      did.unshift(tone.length ? `Through the preset you came out ${tone.join(', ')} than ${tg.label}’s sound. The match EQ fixes it (${e0.toFixed(1)} → ${e2.toFixed(1)} dB off the target)` : `Your tone already sits close to ${tg.label}’s sound, so the match EQ only makes small moves`);
      if (a.clips > 0) tips.push(`Your mic clipped ${a.clips === 1 ? 'once' : a.clips + ' times'} in that take. That crackle can’t be fixed afterwards, so turn the mic gain down a little and record again.`);
      else if (a.activeDb < -42) tips.push('Your mic was quiet. Sing a bit closer or turn its gain up, so the room noise stays low.');
      st.result = { you: suiteSmooth(lmNorm(out0.curve)), target: suiteSmooth(lmNorm(tg.curve)), after: suiteSmooth(lmNorm(out2.curve)), full, e0, e2 };
    }
    if (token !== SVM.token || project !== P0) return;
    const before = hist.undo.length;
    mutate(PP => {
      const mm = PP.mixer[ins]; mm.fx = fx;
      if (vocal) mm.vsMatch = { target: tg.id, label: tg.label, at: Date.now(), from: v.label, amount: m.vsMatch && Number.isFinite(+m.vsMatch.amount) ? +m.vsMatch.amount : 1, full: st.result.full, did, tips, curves: { you: st.result.you.map(x => +x.toFixed(1)), target: st.result.target.map(x => +x.toFixed(1)), after: st.result.after.map(x => +x.toFixed(1)) }, err: [+st.result.e0.toFixed(1), +st.result.e2.toFixed(1)] };
    }, { render: false });
    // after a take: also sit it on the beat
    if (opts.clip) {
      try {
        busy('Setting your level against the beat…', 0.95);
        const clip = project.playlist.clips.find(c => c.id === opts.clip), bal = clip && await suiteMeasureBalance(project, clip);
        if (token === SVM.token && bal && bal.beat) {
          const need = suiteBalanceTarget(project.mixer[ins]) - bal.diff;
          if (Math.abs(need) >= 0.5) {
            const mm = project.mixer[ins], maxDb = 20 * Math.log10(1.25), cur = 20 * Math.log10(Math.max(1e-4, mm.vol)); let nv = cur + need, down = 0;
            if (nv > maxDb) { down = Math.min(18, nv - maxDb); nv = maxDb; }
            mm.vol = clamp(Math.pow(10, Math.max(-30, nv) / 20), 0, 1.25);
            if (down >= 0.5) { const g = Math.pow(10, -down / 20), voc = suiteVocalTracks(project); project.channels.forEach(c => { c.vol = +(c.vol * g).toFixed(4); }); project.playlist.clips.forEach(c => { if (c.kind === 'audio' && !voc.has(c.track)) c.gain = +((c.gain ?? 1) * g).toFixed(4); }); }
            const line = down >= 0.5 ? `Beat down ${down.toFixed(1)} dB and your vocal up, so you sit on top of it` : need > 0 ? `Vocal up ${need.toFixed(1)} dB to sit on the beat` : `Vocal down ${(-need).toFixed(1)} dB so it sits in the beat`;
            if (project.mixer[ins].vsMatch) project.mixer[ins].vsMatch.did.push(line); else did.push(line);
            changed({ render: false });
          }
        } else if (bal && !bal.beat) tips.push('No beat is playing under this take yet. Add one and record again, and I’ll balance your level against it.');
      } catch (e) { console.warn('balance', e); }
    }
    st.busy = ''; st.done = true; st.undoAt = hist.undo.length > before ? hist.undo.length : -1;
    if (ui.tab !== 'vocal') toast(vocal ? `Matched your take to ${tg.label}.` : 'Set your level against the beat.', { action: { label: 'See it', run: () => setTab('vocal') }, ms: 6000 });
  } catch (e) { if (token === SVM.token) { st.busy = ''; st.err = e.message || String(e); } console.warn('match', e); }
  suiteRefreshSoft();
}
/* Strength of the tone match, live while you drag. */
function suiteMatchAmount(ins, amt, phase) {
  const m = project.mixer[ins], M = m && m.vsMatch, eqm = m && suiteClassify(m.fx).eqm; if (!M || !eqm || !M.full) return;
  if (phase !== 'drag' || !ui.vsDragged) pushUndo(); ui.vsDragged = phase === 'drag';
  M.amount = clamp(amt, 0, 1);
  LM_EQ.forEach((_, k) => { const v = +(M.full[k] * M.amount).toFixed(1); eqm.params['g' + k] = v; if (engine) engine.setFxParam(ins, eqm.id, 'g' + k, v); });
  changed({ render: false });
}
