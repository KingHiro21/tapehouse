/* =====================================================================
   Part 7: Listen & Match. Tapehouse listens to a vocal (a take, or 10 seconds live), compares it with a target
   (a style, or an a cappella you import) and builds the whole vocal chain from what it heard.
   ===================================================================== */

/* ---------- Match EQ: low cut + eleven bands, fitted by Listen & Match ---------- */
const LM_EQ = [[150, 1.1], [250, 1.1], [400, 1.1], [630, 1.1], [1000, 1.1], [1600, 1.1], [2500, 1.1], [4000, 1.1], [6300, 1.1], [10000, 1.1], [13000, 0.7, 'highshelf']]
  .map(([f, q, type]) => ({ f, q, type: type || 'peaking' }));
const lmHz = f => f >= 1000 ? (f / 1000).toFixed(f % 1000 ? 1 : 0).replace('.0', '') + 'k' : String(f);
BUILTIN_PLUGINS.push({ id: 'th.match-eq', type: 'effect', name: 'Match EQ', author: 'Tapehouse',
  description: 'The EQ curve Listen & Match fitted to your voice: a low cut plus eleven bands. Turn any band yourself afterwards.',
  params: [{ id: 'lowcut', label: 'Low cut', min: 30, max: 300, default: 80, curve: 'log', unit: 'Hz' },
    ...LM_EQ.map((b, i) => ({ id: 'g' + i, label: lmHz(b.f), min: -12, max: 12, default: 0, unit: 'dB' })),
    // output trim: lets an A/B comparison keep the same loudness instead of jumping when the cuts come off
    { id: 'trim', label: 'Trim', min: -18, max: 6, default: 0, unit: 'dB' }],
  graph: [{ node: 'filter', filterType: 'highpass', frequency: '$lowcut', q: 0.71 },
    ...LM_EQ.map((b, i) => ({ node: 'filter', filterType: b.type, frequency: b.f, q: b.q, gain: '$g' + i })),
    { node: 'gain', gainDb: '$trim' }] });

/* ---------- analysis ---------- */
const LM_BANDS = (() => { const f = []; for (let k = -26; k <= 24; k++) { const fc = 1000 * Math.pow(2, k / 6); if (fc >= 50 && fc <= 16100) f.push(fc); } return f; })();
const lmPct = (arr, p) => { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const lmDb = p => 10 * Math.log10(p + 1e-20);
function lmFFT(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function lmCorr(a, b) { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return sab / Math.sqrt(saa * sbb + 1e-12); }
/* Key from the melody: pitch-class time of steady notes, matched against Krumhansl–Kessler key profiles. */
function lmKey(hist) {
  const tot = hist.reduce((s, v) => s + v, 0); if (tot <= 0) return null;
  const res = [];
  for (let r = 0; r < 12; r++) for (const [scale, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]]) res.push({ root: r, scale, c: lmCorr(hist, prof.map((_, i) => prof[(i - r + 12) % 12])) });
  res.sort((a, b) => b.c - a.c);
  return { root: res[0].root, scale: res[0].scale, conf: res[0].c, margin: res[0].c - res[1].c, all: res };
}
/* Listens to a whole take. Returns tone curve, dynamics, sibilance, harshness, noise, level, range, key, width and wetness. */
async function analyzeVoice(buf, onProgress = () => {}) {
  const sr = buf.sampleRate, n = buf.length, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const N = 4096, H = 2048, frames = Math.floor((n - N) / H) + 1;
  if (frames < 30) throw new Error('That take is too short to listen to. Give me at least five seconds of singing.');
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const nb = LM_BANDS.length, edges = LM_BANDS.map(f => [Math.max(1, Math.floor(f * Math.pow(2, -1 / 12) / sr * N)), Math.max(1, Math.ceil(f * Math.pow(2, 1 / 12) / sr * N))]);
  const fdb = new Float32Array(frames), bp = new Float32Array(frames * nb), side = new Float32Array(frames), re = new Float64Array(N), im = new Float64Array(N);
  let peak = 0, clips = 0, run = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(R ? (L[i] + R[i]) * 0.5 : L[i]), a2 = Math.max(Math.abs(L[i]), R ? Math.abs(R[i]) : 0); if (a2 > peak) peak = a2; if (a2 >= 0.99) { if (++run === 3) clips++; } else run = 0; void a; }
  for (let f = 0; f < frames; f++) {
    const s = f * H; let e = 0, es = 0;
    for (let i = 0; i < N; i++) { const l = L[s + i], r = R ? R[s + i] : l, m = (l + r) * 0.5; e += m * m; es += (l - r) * (l - r) * 0.25; re[i] = m * win[i]; im[i] = 0; }
    fdb[f] = lmDb(e / N); side[f] = es / N;
    lmFFT(re, im);
    for (let b = 0; b < nb; b++) { const [lo, hi] = edges[b]; let p = 0, c = 0; for (let k = lo; k <= hi && k < N / 2; k++) { p += re[k] * re[k] + im[k] * im[k]; c++; } bp[f * nb + b] = c ? p / c : 0; }
    if (f % 160 === 0) { onProgress(0.65 * f / frames); await new Promise(r => setTimeout(r, 0)); }
  }
  // room noise is only measurable when there are real pauses; with non-stop singing the quietest frames are still voice
  const quietDb = lmPct(Array.from(fdb), 0.1), loudDb = lmPct(Array.from(fdb), 0.95), noiseKnown = loudDb - quietDb >= 20;
  const gate = Math.min(Math.max(quietDb + 10, loudDb - 30, -65), loudDb - 12), noiseDb = quietDb;
  const act = new Uint8Array(frames); let nAct = 0; for (let f = 0; f < frames; f++) if (fdb[f] > gate) { act[f] = 1; nAct++; }
  if (nAct < 25) throw new Error('I couldn’t hear enough voice in that. Sing a little louder or pick a longer take.');
  // tone: average spectrum of the frames with voice in them
  const ltas = new Float64Array(nb), sibSpec = new Float64Array(nb); let actPow = 0, actSide = 0, actMid = 0, sibN = 0, sibHF = 0;
  const hfLo = LM_BANDS.findIndex(f => f >= 5000), hfHi = LM_BANDS.findIndex(f => f > 10000);
  for (let f = 0; f < frames; f++) {
    if (!act[f]) continue;
    let tot = 0, hf = 0; for (let b = 0; b < nb; b++) { const p = bp[f * nb + b]; ltas[b] += p; tot += p; if (b >= hfLo && b < hfHi) hf += p; }
    actPow += tot; actSide += side[f]; actMid += Math.pow(10, fdb[f] / 10);
    if (hf / (tot + 1e-20) > 0.3 && fdb[f] > loudDb - 30) { sibN++; sibHF += hf; for (let b = 0; b < nb; b++) sibSpec[b] += bp[f * nb + b]; }
  }
  const curve = Array.from(ltas, p => +lmDb(p / nAct).toFixed(1));
  const actMean = actPow / nAct, sibRel = sibN ? lmDb(sibHF / sibN) - lmDb(actMean) : -30;
  let sibFreq = 6500; if (sibN) { let best = -1; for (let b = 0; b < nb; b++) if (LM_BANDS[b] >= 4000 && LM_BANDS[b] <= 11000 && sibSpec[b] > best) { best = sibSpec[b]; sibFreq = LM_BANDS[b]; } }
  // harshness: how far narrow peaks in 2–8 kHz stick out of the smoothed tone curve
  let peaky = 0; for (let b = 3; b < nb - 3; b++) { if (LM_BANDS[b] < 2000 || LM_BANDS[b] > 8000) continue; const nbh = []; for (let k = -3; k <= 3; k++) if (k) nbh.push(curve[b + k]); nbh.sort((x, y) => x - y); const med = (nbh[2] + nbh[3]) / 2; if (curve[b - 1] > curve[b] - 12 && curve[b + 1] > curve[b] - 12) peaky = Math.max(peaky, curve[b] - med); }
  // dynamics: loudness range over 400 ms windows with voice in them
  const wl = Math.max(1, Math.round(0.4 * sr / H)), wins = [];
  for (let f = 0; f + wl <= frames; f += Math.max(1, wl >> 1)) { let a = 0, p = 0; for (let k = 0; k < wl; k++) { a += act[f + k]; p += Math.pow(10, fdb[f + k] / 10); } if (a >= wl * 0.6) wins.push(lmDb(p / wl)); }
  const lra = wins.length > 4 ? lmPct(wins, 0.95) - lmPct(wins, 0.1) : 6;
  // wetness: how much sound hangs on 130–340 ms after phrases end (reverb and echoes)
  const tails = [];
  const pauseF = Math.ceil(0.4 * sr / H);
  for (let f = 4; f < frames - pauseF; f++) if (act[f - 1] && act[f - 2] && act[f - 3] && !act[f]) {
    let quiet = true; for (let k = 0; k < pauseF; k++) if (fdb[f + k] > gate + 6 && k > Math.round(0.36 * sr / H)) { quiet = false; break; }
    let still = 0; for (let k = 0; k < pauseF; k++) if (act[f + k]) still++;
    if (!quiet || still > pauseF * 0.5) continue;
    const before = (fdb[f - 1] + fdb[f - 2] + fdb[f - 3]) / 3, a0 = Math.round(0.13 * sr / H), a1 = Math.max(a0 + 1, Math.round(0.34 * sr / H));
    let s = 0, c = 0; for (let k = a0; k <= a1 && f + k < frames; k++) { s += fdb[f + k]; c++; } if (c) tails.push(s / c - before);
  }
  const wetDb = tails.length >= 3 ? lmPct(tails, 0.5) : null;
  const widthDb = R ? lmDb(actSide / nAct) - lmDb(actMid / nAct) : -60;
  // busiest 12 s, used to balance the level of the chain afterwards
  const wf = Math.min(frames, Math.round(12 * sr / H)); let bestF = 0, bestA = -1, ca = 0;
  for (let f = 0; f < frames; f++) { ca += act[f]; if (f >= wf) ca -= act[f - wf]; if (f >= wf - 1 && ca > bestA) { bestA = ca; bestF = f - wf + 1; } }
  onProgress(0.7);
  // pitch: YIN on a decimated copy, 20 ms steps → range and key
  const D = Math.max(1, Math.round(sr / 11025)), sr2 = sr / D, m2 = Math.floor(n / D), x2 = new Float32Array(m2);
  for (let i = 0; i < m2; i++) { let s = 0; for (let k = 0; k < D; k++) { const j = i * D + k; s += R ? (L[j] + R[j]) * 0.5 : L[j]; } x2[i] = s / D; }
  const W = Math.round(sr2 * 0.03), maxLag = Math.ceil(sr2 / 65), minLag = Math.floor(sr2 / 1000), hop = Math.round(sr2 * 0.02), dfn = new Float64Array(maxLag + 2);
  const f0s = [], hist = new Array(12).fill(0), notes = []; let prevM = null;
  for (let s = 0, c = 0; s + W + maxLag + 1 < m2; s += hop, c++) {
    const fi = Math.min(frames - 1, Math.floor(s * D / H)); if (!act[fi]) { prevM = null; continue; }
    let run2 = 0; dfn[0] = 1;
    for (let t = 1; t <= maxLag; t++) { let v = 0; for (let j = 0; j < W; j++) { const d = x2[s + j] - x2[s + j + t]; v += d * d; } run2 += v; dfn[t] = run2 > 0 ? v * t / run2 : 1; }
    let bt = -1; for (let t = minLag; t < maxLag; t++) if (dfn[t] < 0.15) { while (t + 1 < maxLag && dfn[t + 1] < dfn[t]) t++; bt = t; break; }
    if (bt < 0 || dfn[bt] > 0.25) { prevM = null; continue; }
    const a = dfn[bt - 1], b = dfn[bt], cc = dfn[bt + 1], den = a - 2 * b + cc, tt = den > 0 ? bt + 0.5 * (a - cc) / den : bt;
    const f0 = sr2 / tt, mm = 69 + 12 * Math.log2(f0 / 440); f0s.push(f0);
    if (prevM != null && Math.abs(mm - prevM) < 0.35) { hist[((Math.round(mm) % 12) + 12) % 12] += 1; if (notes.length < 1200) notes.push(+mm.toFixed(2)); }
    prevM = mm;
    if (c % 400 === 0) { onProgress(0.7 + 0.28 * s / m2); await new Promise(r => setTimeout(r, 0)); }
  }
  onProgress(1);
  const key = lmKey(hist);
  return {
    v: 1, sr, dur: +(n / sr).toFixed(2), curve, noiseDb: noiseKnown ? +noiseDb.toFixed(1) : null, activeDb: +lmDb(actMid / nAct).toFixed(1), peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1), clips,
    lra: +lra.toFixed(1), sibRel: +sibRel.toFixed(1), sibFreq: Math.round(sibFreq), sibFrac: +(sibN / nAct).toFixed(3), peaky: +peaky.toFixed(1),
    widthDb: +widthDb.toFixed(1), wetDb: wetDb == null ? null : +wetDb.toFixed(1), activeFrac: +(nAct / frames).toFixed(2),
    f0: f0s.length > 20 ? { lo: Math.round(lmPct(f0s, 0.05)), mid: Math.round(lmPct(f0s, 0.5)), hi: Math.round(lmPct(f0s, 0.95)) } : null,
    key: key && { root: key.root, scale: key.scale, conf: +key.conf.toFixed(2), margin: +key.margin.toFixed(3) }, keyAll: key ? key.all.slice(0, 6).map(k => [k.root, k.scale, +k.c.toFixed(2)]) : [],
    excerpt: { start: +(bestF * H / sr).toFixed(2), dur: +(wf * H / sr).toFixed(2) }, notes,
  };
}

/* ---------- targets ---------- */
// Tone of a produced pop / R&B lead vocal, in dB per frequency (shape only). Raw voices are darker than this; the match adds presence and air.
const LM_BASE = [[50, -24], [70, -15], [90, -9], [120, -4.5], [160, -2], [250, -0.5], [400, 0], [630, -0.5], [1000, -2.5], [1600, -5], [2500, -6.5], [4000, -8], [6300, -10.5], [10000, -14], [13000, -16.5], [16000, -21]];
const LM_STYLES = {
  breezy: { label: 'Chris Brown style', char: 'fet', ratio: 4, lra: 5, sib: -9, tilt: [[4500, 0], [6300, 1], [8000, 1], [11000, 1.5], [16000, 1.5]] },
  bieber: { label: 'Justin Bieber style', char: 'opto', ratio: 3, lra: 6, sib: -10, tilt: [[200, 0], [300, -0.5], [600, 0], [2000, 0], [3000, -1], [4500, 0], [9000, 0.5], [12000, 1], [16000, 1]] },
  laroi: { label: 'Kid LAROI style', char: 'vox', ratio: 4, lra: 5, sib: -9, tilt: [[150, 0], [250, 0.5], [450, 0.5], [800, 0], [2200, 0], [3000, 1], [4500, 0], [9000, 0.5], [16000, 0.5]] },
  mgk: { label: 'MGK style', char: 'fet', ratio: 8, lra: 4, sib: -9, tilt: [[800, 0], [1300, 1.5], [3000, 1.5], [4500, 0], [10000, -0.5], [16000, -0.5]] },
  clean: { label: 'Clean vocal', char: 'opto', ratio: 3, lra: 6, sib: -10, tilt: [] },
  rap: { label: 'Rap vocal', char: 'fet', ratio: 8, lra: 4, sib: -9, tilt: [[1500, 0], [2200, 2], [4000, 2], [5500, 0]] },
  dreamy: { label: 'Dreamy vocal', char: 'opto', ratio: 3, lra: 6, sib: -10, tilt: [[300, 0], [450, -1], [800, -1], [1200, 0], [7000, 0], [9000, 2], [16000, 2]] },
};
function lmInterp(pts, f) {
  if (!pts.length) return 0; const x = Math.log2(f);
  if (f <= pts[0][0]) return pts[0][1]; if (f >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) { const x0 = Math.log2(pts[i - 1][0]), x1 = Math.log2(pts[i][0]); return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (x - x0) / (x1 - x0); }
  return 0;
}
const lmStyleCurve = id => LM_BANDS.map(f => lmInterp(LM_BASE, f) + lmInterp((LM_STYLES[id] || LM_STYLES.clean).tilt, f));
function lmNorm(curve) { let s = 0, c = 0; LM_BANDS.forEach((f, i) => { if (f >= 500 && f <= 4000) { s += curve[i]; c++; } }); const m = s / c; return curve.map(v => v - m); }

/* ---------- EQ fitting ---------- */
// Magnitude of the browser's own biquads (same formulas as Web Audio), so the fitted curve is what you actually hear.
function lmBiquadDb(type, f0, q, gain, f, sr = 48000) {
  const A = Math.pow(10, gain / 40), w0 = 2 * Math.PI * f0 / sr, cw = Math.cos(w0), sw = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peaking') { const al = sw / (2 * q); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else if (type === 'highshelf') { const al = sw / 2 * Math.SQRT2, s2 = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cw + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s2); a0 = (A + 1) - (A - 1) * cw + s2; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s2; }
  else { const al = sw / (2 * q); b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; } // highpass
  const w = 2 * Math.PI * f / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2_ = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2_), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2_);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}
function lmEqResponse(gains, lowcut) { return LM_BANDS.map(f => LM_EQ.reduce((s, b, i) => s + lmBiquadDb(b.type, b.f, b.q, gains[i], f), lowcut ? lmBiquadDb('highpass', lowcut, 0.71, 0, f) : 0)); }
function lmFitEq(desired) {
  const g = LM_EQ.map(() => 0), idx = LM_EQ.map(b => { let bi = 0, bd = 1e9; LM_BANDS.forEach((f, i) => { const d = Math.abs(Math.log2(f / b.f)); if (d < bd) { bd = d; bi = i; } }); return bi; });
  for (let it = 0; it < 50; it++) {
    const resp = lmEqResponse(g, 0);
    LM_EQ.forEach((b, j) => {
      // average error over a third of an octave around the band (the shelf looks at everything above it)
      let s = 0, c = 0; LM_BANDS.forEach((f, i) => { const d = Math.log2(f / b.f); if (b.type === 'highshelf' ? d >= -0.15 : Math.abs(d) <= 0.17) { s += desired[i] - resp[i]; c++; } });
      if (c) g[j] = clamp(g[j] + 0.55 * s / c, -12, 12);
    });
    void idx;
  }
  return g.map(v => +v.toFixed(1));
}

/* ---------- building the chain ---------- */
function lmStyleParts(style) {
  const ch = CHAINS[style] || CHAINS.clean, find = id => ch.fx.find(([pl]) => pl === id);
  const tune = find('th.autotune'), sat = find('th.saturator');
  const space = ch.fx.filter(([pl]) => ['th.doubler', 'th.chorus', 'th.tape-delay', 'th.pingpong', 'th.room-reverb'].includes(pl));
  return { tune: tune && tune[1], sat: sat && sat[1], space };
}
const LM_ROLES = { gate: 'Noise gate', nc: 'Noise removal', deecho: 'De-echo', level: 'Input level', tune: 'Tune', eq: 'EQ match', comp: 'Compress', comp2: 'Glue', sat: 'Saturate', tamer: 'Tamer', deess: 'De-ess', width: 'Width', delay: 'Delay', reverb: 'Reverb', safe: 'Limiter' };
/* Target numbers for this match: from a style, or measured from an a cappella. */
function lmTarget(M) {
  const st = LM_STYLES[M.style] || LM_STYLES.clean;
  if (M.kind === 'acap' && M.ref) return { curve: M.ref.curve, lra: clamp(M.ref.lra, 3, 10), sib: M.ref.sibRel, width: M.ref.widthDb, wet: M.ref.wetDb, fromRef: true };
  return { curve: lmStyleCurve(M.style), lra: st.lra, sib: st.sib, width: null, wet: null, fromRef: false };
}
/* The EQ the match wants (before fitting): target minus you, smoothed, limited per region and scaled by Match amount. */
function lmDesired(M) {
  const a = M.a, t = lmTarget(M), you = lmNorm(a.curve), tg = lmNorm(t.curve), raw = tg.map((v, i) => v - you[i]);
  const sm = raw.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) if (raw[i + k] !== undefined) { s += raw[i + k]; c++; } return s / c; });
  return sm.map((v, i) => { const f = LM_BANDS[i]; let lim = f < 120 ? 0 : f < 250 ? 4 : f < 9000 ? 8 : 6; if (f > 10000 && v > 0) lim = 5; return clamp(v, -lim, lim) * M.amount; });
}
function lmVoiceType(a) { const m = a.f0 && a.f0.mid; return !m ? 'tenor' : m > 270 ? 'soprano' : m < 125 ? 'low' : 'tenor'; }
function lmLowCut(a) { const lo = a.f0 ? a.f0.lo : 110; return Math.round(clamp(lo * 0.72, 60, 140)); }
function lmBuildChain(M) {
  const a = M.a, st = LM_STYLES[M.style] || LM_STYLES.clean, t = lmTarget(M), parts = lmStyleParts(M.style), i = M.intensity;
  const proc = 0.4 + 0.75 * i, wet = 0.5 + 0.625 * i, off = new Set(M.off || []), fx = [];
  const add = (role, pl, params) => { const f = fxSlot(pl, { ...params, _role: role }); f.bypass = off.has(role); fx.push(f); };
  const R = Math.max(0, a.lra * 0.8 - t.lra);
  if (a.noiseDb != null && a.noiseDb > -62 && a.activeDb - a.noiseDb < 35) {
    add('nc', 'th.denoise', { amount: +clamp(0.45 + (30 - (a.activeDb - a.noiseDb)) * 0.025, 0.45, 0.85).toFixed(2) });
    add('gate', 'th.vocal-comp', { mode: 'gate', target: clamp(a.noiseDb + 6, -80, -20) });
  }
  if (a.wetDb != null && a.wetDb > -30) add('deecho', 'th.dereverb', { amount: +clamp(0.3 + (-a.wetDb - 20) * 0.022, 0.3, 0.8).toFixed(2) });
  add('level', 'th.vocal-comp', { mode: 'auto', target: -20 });
  if (parts.tune) add('tune', 'th.autotune', { ...parts.tune, voice: lmVoiceType(a) });
  const gains = lmFitEq(lmDesired(M)), eq = { lowcut: lmLowCut(a) }; gains.forEach((g, k) => { eq['g' + k] = g; });
  add('eq', 'th.match-eq', eq);
  const cm = { fet: { attack: 0.5, release: 110 }, opto: {}, vox: {}, clean: { attack: 8, release: 130 } }[st.char] || {};
  add('comp', 'th.vocal-comp', { mode: st.char, amount: +clamp((0.2 + 0.03 * R) * proc, 0.08, 0.6).toFixed(2), ratio: st.ratio, ...cm, output: 2 });
  add('comp2', 'th.vocal-comp', { mode: 'clean', amount: +clamp((0.1 + 0.015 * R) * proc, 0.04, 0.32).toFixed(2), ratio: 2, attack: 10, release: 150, output: +(M.trim || 0).toFixed(1) });
  if (parts.sat) add('sat', 'th.saturator', { ...parts.sat, drive: +(parts.sat.drive * proc).toFixed(2) });
  add('tamer', 'th.deharsh', { depth: +clamp((2 + a.peaky) * proc, 1, 9).toFixed(1), sens: 0.5 });
  const excess = a.sibRel - t.sib;
  add('deess', 'th.deesser', { freq: Math.round(clamp(a.sibFreq * 0.78, 4000, 8500)), thresh: Math.round(clamp(-20 + a.sibRel + 2, -44, -16)), range: +clamp((3 + 0.8 * excess) * proc, 2, 10).toFixed(1) });
  const wMix = t.width != null ? clamp((t.width + 30) / 22 * 0.35, 0.05, 0.4) : null, rMix = t.wet != null ? clamp((t.wet + 45) / 30 * 0.24 + 0.06, 0.05, 0.32) : null;
  for (const [pl, p] of parts.space) {
    const role = pl === 'th.room-reverb' ? 'reverb' : pl === 'th.doubler' || pl === 'th.chorus' ? 'width' : 'delay';
    const base = role === 'reverb' && rMix != null ? rMix : role === 'width' && wMix != null ? wMix : role === 'delay' && rMix != null ? (p.mix || 0.1) * clamp(rMix / 0.16, 0.5, 1.6) : (p.mix || 0.1);
    add(role, pl, { ...p, mix: +clamp(base * wet, 0, 0.6).toFixed(3) });
  }
  add('safe', 'th.limiter', { ceiling: -1, release: 80 });
  return fx;
}
/* A short render of the busiest part of the take through the chain, to set its output to a steady level (−18 dB RMS). */
async function lmBalance(M, buf) {
  if (!buf) return;
  const sr = buf.sampleRate, s0 = Math.floor(M.a.excerpt.start * sr), len = Math.min(buf.length - s0, Math.floor(Math.min(12, M.a.excerpt.dur) * sr));
  if (len < sr * 2) return;
  const ex = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr }), d = ex.getChannelData(0), L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  for (let i = 0; i < len; i++) d[i] = R ? (L[s0 + i] + R[s0 + i]) * 0.5 : L[s0 + i];
  const id = '__listen_excerpt'; buffers.set(id, ex);
  try {
    for (let pass = 0; pass < 2; pass++) {
      const fx = lmBuildChain(M), stepDur = 60 / project.bpm / 4, steps = Math.ceil(len / sr / stepDur) + 1;
      const P = normalizeProject({ id: 'listen', name: 'listen', bpm: project.bpm, key: project.key, scale: project.scale, channels: [], patterns: [],
        playlist: { tracks: [{ name: 'Vocal', insert: 1, mute: false }], clips: [{ id: 'x', kind: 'audio', ref: id, track: 0, start: 0, len: steps, gain: 1, offset: 0 }], markers: [] },
        mixer: [{ name: 'Master', vol: 1, fx: [] }, { name: 'Vocal', vol: 1, fx }], master: { on: false }, automation: [] });
      const { buffer, frames } = await renderOffline(P, 'song', 44100, { from: 0, to: steps });
      const o = buffer.getChannelData(0); let s = 0, c = 0; for (let k = 0; k < frames; k++) { const v = o[k]; if (v * v > 1e-7) { s += v * v; c++; } }
      if (!c) return;
      const out = lmDb(s / c); M.trim = clamp((M.trim || 0) + (-18 - out), -12, 12);
      if (Math.abs(-18 - out) < 0.7) break;
    }
  } finally { buffers.delete(id); }
}

/* ---------- what it heard, in words ---------- */
function lmFindings(M) {
  const a = M.a, t = lmTarget(M), out = [], d = lmDesired({ ...M, amount: 1 });
  const band = (lo, hi) => { let s = 0, c = 0; LM_BANDS.forEach((f, i) => { if (f >= lo && f <= hi) { s += d[i]; c++; } }); return c ? s / c : 0; };
  const air = band(7000, 14000), pres = band(2000, 5000), mud = band(200, 500), tgtName = t.fromRef ? 'the a cappella' : 'the target';
  const toneBits = [];
  if (Math.abs(air) >= 1.5) toneBits.push(air > 0 ? `${air.toFixed(0)} dB less air than ${tgtName}` : `${(-air).toFixed(0)} dB more top end than ${tgtName}`);
  if (Math.abs(pres) >= 1.5) toneBits.push(pres > 0 ? `${pres.toFixed(0)} dB less presence` : `${(-pres).toFixed(0)} dB more bite`);
  if (Math.abs(mud) >= 1.5) toneBits.push(mud < 0 ? `${(-mud).toFixed(0)} dB extra low-mid build-up` : `thinner low mids`);
  out.push(['Tone', toneBits.length ? toneBits.join(', ') : `already close to ${tgtName}`, toneBits.length ? `Match EQ fixes it at ${Math.round(M.amount * 100)}%.` : 'Only small EQ moves.', toneBits.length ? 'fix' : 'ok']);
  out.push(['Dynamics', `${a.lra.toFixed(0)} dB between your softest and loudest phrases (target ${t.lra.toFixed(0)})`, a.lra * 0.8 > t.lra + 1 ? `${(LM_STYLES[M.style] || LM_STYLES.clean).char.toUpperCase()} compression evens it out.` : 'Light compression is enough.', a.lra * 0.8 > t.lra + 1 ? 'fix' : 'ok']);
  out.push(['Sibilance', a.sibFrac > 0.01 ? `S sounds peak around ${lmHz(Math.round(a.sibFreq / 100) * 100)}Hz` : 'Hardly any harsh S sounds', a.sibRel > t.sib + 2 ? 'De-esser set firmer.' : 'De-esser set lightly.', a.sibRel > t.sib + 2 ? 'fix' : 'ok']);
  out.push(['Harshness', a.peaky > 3 ? `A ringing peak ${a.peaky.toFixed(0)} dB above the rest in 2–8 kHz` : 'Smooth, no ringing peaks', a.peaky > 3 ? 'Tamer pulls it down only when it rings.' : 'Tamer kept gentle.', a.peaky > 3 ? 'fix' : 'ok']);
  const noisy = a.noiseDb != null && a.noiseDb > -62 && a.activeDb - a.noiseDb < 35;
  out.push(['Noise', a.noiseDb == null ? 'No pauses long enough to hear the room' : `Room noise at ${a.noiseDb.toFixed(0)} dB, voice ${(a.activeDb - a.noiseDb).toFixed(0)} dB above it`, noisy ? 'Noise gate on between phrases.' : a.noiseDb == null ? 'No gate.' : 'Quiet enough, no gate.', noisy ? 'fix' : 'ok']);
  out.push(['Level', a.clips ? `Clipped ${a.clips} time${a.clips > 1 ? 's' : ''} (peaks ${a.peakDb.toFixed(1)} dB)` : `Peaks ${a.peakDb.toFixed(1)} dB, no clipping`, a.clips ? 'Turn your mic gain down and record again: clipping can’t be fixed afterwards.' : 'Input level rides it to a steady level.', a.clips ? 'warn' : 'ok']);
  if (a.f0) out.push(['Range', `${noteName(Math.round(69 + 12 * Math.log2(a.f0.lo / 440)))}–${noteName(Math.round(69 + 12 * Math.log2(a.f0.hi / 440)))}`, `Tune set for ${{ soprano: 'a high voice', low: 'a low voice', tenor: 'alto / tenor' }[lmVoiceType(a)]}, low cut at ${lmLowCut(a)} Hz.`, 'ok']);
  return out;
}
/* Does the melody fit the song key? Relative major/minor use the same notes, so they count as a match. */
function lmKeyAdvice(a) {
  if (!a.key || a.key.conf < 0.55) return null;
  const notes = (root, scale) => { const s = new Set((SCALES[scale] || SCALES.minor).steps.map(x => (x + root) % 12)); return [...s].sort((p, q) => p - q).join(','); };
  if (notes(a.key.root, a.key.scale) === notes(project.key, project.scale)) return null;
  const songC = (a.keyAll.find(k => k[0] === project.key && k[1] === project.scale) || [0, 0, -1])[2];
  if (a.key.conf - songC < 0.12) return null;
  return { root: a.key.root, scale: a.key.scale, label: `${KEY_NAMES[a.key.root]} ${a.key.scale}` };
}

/* ---------- the screen ---------- */
async function lmSourceBuffer(src) {
  if (!src) return null;
  if (src.kind === 'mic') return ui.lmMic || null;
  try { return await getBuffer(src.ref); } catch (e) { return null; }
}
function lmTakes(ins) {
  const tr = project.playlist.tracks, seen = new Set(), out = [];
  for (const c of project.playlist.clips) {
    if (c.kind !== 'audio' || !tr[c.track] || (tr[c.track].insert | 0) !== ins || seen.has(c.ref)) continue;
    const s = lib.get(c.ref); if (!s || s.duration < 4) continue; seen.add(c.ref); out.push({ id: c.ref, name: `${s.name} (bar ${Math.floor(c.start / 16) + 1})` });
  }
  return out;
}
function lmLibraryAudio(minDur = 4) { return sortedLib().filter(s => s.duration >= minDur && !String(s.folder).startsWith('Factory')); }
function lmState(ins) {
  const m = project.mixer[ins], saved = m && m.match;
  const st = ui.lm && ui.lm.ins === ins ? ui.lm : (ui.lm = { ins, style: saved ? saved.style : (activeChain(ins) && LM_STYLES[activeChain(ins)] ? activeChain(ins) : 'breezy'), kind: saved ? saved.kind : 'style', refId: saved ? saved.refId : null, amount: saved ? saved.amount : 0.6, intensity: saved ? saved.intensity : 0.8, busy: '', err: '', prog: 0 });
  if (!st.src) { const t = lmTakes(ins)[0]; st.src = saved && saved.src ? saved.src : t ? { kind: 'take', ref: t.id } : REC.stream || STANDALONE ? { kind: 'mic' } : null; }
  return st;
}
function openListen(ins) {
  if (!(ins > 0)) { const tr = REC.armed != null ? project.playlist.tracks[REC.armed] : project.playlist.tracks.find(t => (t.insert | 0) > 0 && lmTakes(t.insert | 0).length); ins = tr ? tr.insert | 0 : 0; }
  if (!(ins > 0)) { toast('Arm a vocal track (Record) or record a take first, so Listen & Match knows which track to mix.'); return; }
  lmState(ins); renderListen();
}
function renderListen() {
  const st = ui.lm, ins = st.ins, m = project.mixer[ins], M = m && m.match, card = $('#sheet .sheet-card'), keep = $('#sheet').hidden ? 0 : card.scrollTop;
  const takes = lmTakes(ins), libAudio = lmLibraryAudio(), styleIds = Object.keys(LM_STYLES), canMic = STANDALONE || !!REC.stream;
  const srcSel = el('select', { 'aria-label': 'What to listen to', onchange: e => { const v = e.target.value; st.src = v === 'mic' ? { kind: 'mic' } : { kind: 'take', ref: v }; renderListen(); } },
    takes.length ? el('optgroup', { label: `Takes on ${m.name}` }, takes.map(t => el('option', { value: t.id, selected: st.src && st.src.ref === t.id }, t.name))) : null,
    libAudio.length ? el('optgroup', { label: 'Your library' }, libAudio.filter(s => !takes.some(t => t.id === s.id)).map(s => el('option', { value: s.id, selected: st.src && st.src.ref === s.id }, s.name))) : null,
    canMic ? el('option', { value: 'mic', selected: st.src && st.src.kind === 'mic' }, ui.lmMic ? 'What I just sang (10 s)' : 'Sing 10 seconds into the mic') : null);
  if (!takes.length && !libAudio.length && !canMic) srcSel.append(el('option', { value: '' }, 'No takes yet'));
  const tgtSel = el('select', { 'aria-label': 'Match to', onchange: e => { const v = e.target.value; if (v.startsWith('acap:')) { st.kind = 'acap'; st.refId = v.slice(5); } else { st.kind = 'style'; st.style = v; } renderListen(); } },
    el('optgroup', { label: 'Styles' }, styleIds.map(id => el('option', { value: id, selected: st.kind === 'style' && st.style === id }, LM_STYLES[id].label))),
    el('optgroup', { label: 'An a cappella from your library' }, libAudio.length ? libAudio.map(s => el('option', { value: 'acap:' + s.id, selected: st.kind === 'acap' && st.refId === s.id }, s.name)) : el('option', { value: '', disabled: true }, 'Import an a cappella first')));
  const styleSel = st.kind === 'acap' ? el('label', { class: 'lm-inline' }, el('span', { class: 'lbl' }, 'Effects like'), el('select', { 'aria-label': 'Tune and effects style', onchange: e => { st.style = e.target.value; if (M) lmRebuild('style'); else renderListen(); } },
    styleIds.map(id => el('option', { value: id, selected: st.style === id }, LM_STYLES[id].label)))) : null;
  const top = el('div', { class: 'lm-top' },
    el('div', { class: 'lm-pick' }, el('span', { class: 'lbl' }, 'Listen to'), srcSel),
    el('div', { class: 'lm-pick' }, el('span', { class: 'lbl' }, 'Match to'), tgtSel), styleSel,
    el('button', { class: 'btn primary', disabled: !!st.busy || !st.src, onclick: () => runListen() }, icon('mic'), M ? 'Listen again' : 'Listen & mix'));
  const hint = el('p', { class: 'muted small lm-hint' }, st.kind === 'acap'
    ? 'Matches your tone, dynamics, S sounds, width and reverb amount to that a cappella. Official a cappellas work best; your vocal still gets the Tune and effects of the style you pick.'
    : 'Tapehouse listens for tone, dynamics, S sounds, harsh peaks, room noise, level, range and key, then sets every module for your voice. Drop an artist’s a cappella anywhere on the page to match to it instead.');
  const busy = st.busy ? el('div', { class: 'lm-busy', role: 'status' }, el('span', {}, st.busy), el('span', { class: 'lm-bar' }, el('i', { style: { width: Math.round((st.prog || 0) * 100) + '%' } }))) : null;
  const err = st.err ? el('div', { class: 'mic-err', role: 'alert' }, el('b', {}, 'Couldn’t listen'), el('p', {}, st.err)) : null;
  const nodes = [sheetHead(`Listen & Match · ${m.name}`), top, hint, busy, err];
  if (M && M.a) {
    const desired = lmDesired(M), gains = (m.fx.find(f => f.plugin === 'th.match-eq') || { params: {} }).params, g = LM_EQ.map((_, k) => +(gains['g' + k] || 0));
    const resp = lmEqResponse(g, +gains.lowcut || 0), t = lmTarget(M);
    nodes.push(lmPlots(lmNorm(M.a.curve), lmNorm(t.curve), resp, desired, t.fromRef));
    const adv = lmKeyAdvice(M.a);
    if (adv) nodes.push(el('div', { class: 'lm-key' }, el('span', {}, `Your melody fits ${adv.label}, but the song is set to ${keyLabel(project)}. Tune snaps to the song key.`),
      el('button', { class: 'btn sm primary', onclick: () => { mutate(P => { P.key = adv.root; P.scale = adv.scale; }); renderListen(); toast(`Song key set to ${adv.label}. Your beat wasn’t moved.`); } }, `Use ${adv.label}`)));
    nodes.push(el('div', { class: 'lm-find' }, lmFindings(M).map(([k, what, did, tone]) => el('div', { class: 'lm-row ' + tone }, el('b', {}, k), el('span', {}, what), el('span', { class: 'muted' }, did)))));
    const slider = (label, key, help) => el('label', { class: 'lm-slider' }, el('span', { class: 'lbl' }, label),
      el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(st[key] * 100)), 'aria-label': label, title: help,
        oninput: e => { st[key] = +e.target.value / 100; e.target.nextSibling.textContent = e.target.value + '%'; lmRebuild('drag'); },
        onchange: () => lmRebuild('commit') }), el('span', { class: 'mono' }, Math.round(st[key] * 100) + '%'));
    nodes.push(el('div', { class: 'lm-sliders' }, slider('Match amount', 'amount', 'How far the EQ moves your tone toward the target'), slider('Intensity', 'intensity', 'How hard the compression, de-essing and effects work')));
    const off = new Set(M.off || []);
    nodes.push(el('div', { class: 'lm-chain' }, el('span', { class: 'lbl' }, 'Signal chain'), el('div', { class: 'lm-mods' }, m.fx.map(f => {
      const role = f.params && f.params._role; if (!role) return null;
      return el('button', { class: 'lm-mod', 'aria-pressed': String(!off.has(role)), title: off.has(role) ? 'Off: tap to turn on' : 'On: tap to turn off', onclick: () => { const s = new Set(M.off || []); s.has(role) ? s.delete(role) : s.add(role); mutate(P => { P.mixer[ins].match.off = [...s]; P.mixer[ins].fx.forEach(x => { if (x.params && x.params._role === role) x.bypass = s.has(role); }); }); renderListen(); } }, LM_ROLES[role] || role);
    }))));
  }
  nodes.push(el('div', { class: 'btn-row' }, M ? el('button', { class: 'btn', onclick: () => { closeSheet(); ui.selInsert = ins; setTab('mixer'); } }, 'Open in Mix') : null, el('button', { class: 'btn primary', onclick: closeSheet }, 'Done')));
  openSheet(nodes, 'wide listen');
  if (keep) $('#sheet .sheet-card').scrollTop = keep;
}
function lmPlots(you, tgt, resp, desired, fromRef) {
  const W = 640, H1 = 150, H2 = 92, fx = f => 36 + (W - 44) * (Math.log2(f / 50) / Math.log2(16000 / 50));
  const line = (vals, y) => LM_BANDS.map((f, i) => `${i ? 'L' : 'M'}${fx(f).toFixed(1)},${y(vals[i]).toFixed(1)}`).join('');
  const vis = LM_BANDS.map((f, i) => i).filter(i => LM_BANDS[i] >= 60), all = vis.flatMap(i => [you[i], tgt[i]]);
  const hiV = Math.min(24, Math.max(6, ...all) + 2), loV = Math.max(hiV - 50, Math.min(...all) - 2);
  const y1 = v => 14 + (H1 - 26) * (1 - (clamp(v, loV, hiV) - loV) / (hiV - loV)), y2 = v => H2 / 2 - (clamp(v, -12, 12) / 12) * (H2 / 2 - 8);
  const grid = [100, 1000, 10000].map(f => `<line x1="${fx(f)}" x2="${fx(f)}" y1="0" y2="100%" class="g"/><text x="${fx(f) + 3}" y="11" class="t">${lmHz(f)}</text>`).join('');
  const area = `${line(you, y1)}L${fx(16000)},${H1 - 12}L${fx(LM_BANDS[0])},${H1 - 12}Z`;
  const svg1 = `<svg viewBox="0 0 ${W} ${H1}" role="img" aria-label="Tone of your voice compared with the target"><g>${grid}</g><path d="${area}" class="you"/><path d="${line(tgt, y1)}" class="tgt"/></svg>`;
  const svg2 = `<svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="EQ applied"><g>${grid}</g><line x1="36" x2="${W - 8}" y1="${y2(0)}" y2="${y2(0)}" class="z"/><text x="4" y="${y2(6) + 4}" class="t">+6</text><text x="4" y="${y2(-6) + 4}" class="t">−6</text><path d="${line(desired, y2)}" class="want"/><path d="${line(resp, y2)}" class="eq"/></svg>`;
  return el('div', { class: 'lm-plots' },
    el('div', { class: 'lm-legend' }, el('span', { class: 'k you' }, 'Your voice'), el('span', { class: 'k tgt' }, fromRef ? 'A cappella' : 'Target'), el('span', { class: 'k eq' }, 'EQ applied'), el('span', { class: 'k want' }, 'Full match')),
    el('div', { class: 'lm-svg', html: svg1 }), el('div', { class: 'lm-svg', html: svg2 }));
}
/* Re-derive the chain from what was heard (sliders, style or module changes) without listening again.
   Effects keep their identity, so the engine just updates settings: no dropouts while you drag. */
function lmApply(ins, M) {
  const P = project, old = P.mixer[ins].fx, nf = lmBuildChain(M);
  nf.forEach(f => { const o = old.find(x => x.plugin === f.plugin && x.params && x.params._role === f.params._role); if (o) f.id = o.id; });
  P.mixer[ins].match = M; P.mixer[ins].fx = nf;
  if (engine) nf.forEach(f => { const o = old.find(x => x.id === f.id); if (o) for (const k in f.params) if (JSON.stringify(o.params[k]) !== JSON.stringify(f.params[k])) engine.setFxParam(ins, f.id, k, f.params[k]); });
  changed({ render: false });
}
async function lmRebuild(mode) {
  const st = ui.lm, ins = st.ins, m = project.mixer[ins]; if (!m || !m.match) return;
  const M = { ...m.match, style: st.style, amount: st.amount, intensity: st.intensity };
  if (mode === 'drag') { if (!st.dragPushed) { pushUndo(); st.dragPushed = true; } lmApply(ins, M); return; }
  if (!(mode === 'commit' && st.dragPushed)) pushUndo();
  st.dragPushed = false;
  const buf = await lmSourceBuffer(M.src); if (buf) await lmBalance(M, buf);
  lmApply(ins, M); renderListen();
}
async function lmCaptureMic(st) {
  const ins = st.ins;
  const ti = project.playlist.tracks.findIndex(t => (t.insert | 0) === ins);
  if (REC.armed == null || (project.playlist.tracks[REC.armed].insert | 0) !== ins) armTrack(ti >= 0 ? ti : pickRecordTrack());
  if (!(await openMic())) throw new Error(STANDALONE ? 'The mic didn’t open. Allow it in the address bar and try again.' : 'claude.ai can’t pass your mic to apps. Pick a take instead, or use the recording edition.');
  if (REC.state && REC.state !== 'idle') throw new Error('Stop recording first.');
  startCapture();
  for (let s = 10; s > 0; s--) { st.busy = `Sing the way you normally do… ${s}`; st.prog = (10 - s) / 10; renderListen(); await new Promise(r => setTimeout(r, 1000)); }
  await stopCapture();
  const chunks = REC.chunks.slice().sort((a, b) => a.f - b.f); REC.chunks = [];
  const total = chunks.reduce((s, c) => s + c.d.length, 0); if (total < ctx.sampleRate * 3) throw new Error('I didn’t get enough audio from the mic. Try again.');
  const buf = new AudioBuffer({ numberOfChannels: 1, length: total, sampleRate: ctx.sampleRate }), d = buf.getChannelData(0); let o = 0;
  for (const c of chunks) { d.set(c.d, o); o += c.d.length; }
  ui.lmMic = buf; return buf;
}
async function runListen() {
  const st = ui.lm; if (!st || st.busy) return;
  st.err = ''; st.prog = 0;
  try {
    let buf;
    if (st.src && st.src.kind === 'mic') buf = await lmCaptureMic(st);
    else { st.busy = 'Loading the take…'; renderListen(); buf = await lmSourceBuffer(st.src); }
    if (!buf) throw new Error('Pick a take to listen to.');
    st.busy = 'Listening to your voice…'; renderListen();
    const a = await analyzeVoice(buf, p => { st.prog = p; const b = $('#sheet .lm-bar i'); if (b) b.style.width = Math.round(p * 100) + '%'; });
    let ref = null;
    if (st.kind === 'acap') {
      if (!st.refId) throw new Error('Pick the a cappella to match to.');
      st.busy = 'Listening to the a cappella…'; st.prog = 0; renderListen();
      const rb = await getBuffer(st.refId); if (!rb) throw new Error('That a cappella couldn’t be loaded.');
      ref = await analyzeVoice(rb, p => { st.prog = p; const b = $('#sheet .lm-bar i'); if (b) b.style.width = Math.round(p * 100) + '%'; });
    }
    st.busy = 'Setting up the chain and balancing the level…'; st.prog = 1; renderListen();
    const refName = ref && (lib.get(st.refId) || {}).name;
    const M = { v: 1, src: st.src && st.src.kind === 'mic' ? { kind: 'mic' } : st.src, kind: st.kind, style: st.style, refId: st.kind === 'acap' ? st.refId : null, refName, ref, a, amount: st.amount, intensity: st.intensity, off: [], trim: 0 };
    if (engine) await engine.loadDsp();
    await lmBalance(M, buf);
    mutate(P => { P.mixer[st.ins].match = M; P.mixer[st.ins].fx = lmBuildChain(M); });
    st.busy = '';
    toast(st.kind === 'acap' ? `Matched to ${refName || 'the a cappella'}. Play it back or turn on Hear myself.` : `Mixed for your voice in ${LM_STYLES[st.style].label}. Play it back or turn on Hear myself.`, { action: { label: 'Undo', run: undo } });
  } catch (e) { st.busy = ''; st.err = e.message || String(e); }
  renderListen();
}
