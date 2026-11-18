/* =====================================================================
   Part 6: vocal tools. Tune (pitch correction that snaps to the song key),
   de-esser, vocal EQ, doubler, ping-pong delay, and the DSP worklet behind them.
   ===================================================================== */

/* DSP-START
   Pure DSP classes. They must stay self-contained (no outside helpers): the same
   source runs on the main thread (fallback) and inside the AudioWorklet. */
class TuneCore {
  /* Look-ahead in samples. Grains reach half a window back and forth (plus formant stretch);
     live mode uses shorter grains so monitoring feels immediate, renders use the full-quality size. */
  /* Live grains are longer than they used to be (132 vs 170): a window shorter than the sung period locks phases badly and
     reads as metallic. The extra ~4 ms of monitoring latency buys a much more natural sound. */
  static grainHalf(sr, live, voice) { return Math.round(sr / (!live || voice === 'low' ? 110 : voice === 'soprano' ? 155 : 132)); }
  static latency(sr, live, voice) { return Math.ceil(TuneCore.grainHalf(sr, live, voice) * (1 + Math.pow(2, 3 / 12))) + 2; }
  constructor(sr, p) {
    this.sr = sr;
    this.dec = sr > 32000 ? 2 : 1;
    this.sr2 = sr / this.dec;
    this.mode = 'full';
    this.maxHalf = TuneCore.grainHalf(sr, false);  // longest grain half-width: two full periods down to 110 Hz
    this.L = TuneCore.latency(sr, false);          // look-ahead the grains need, in samples
    this.N = 16384; this.M = this.N - 1;
    this.inp = new Float32Array(this.N); this.out = new Float32Array(this.N); this.wsum = new Float32Array(this.N);
    this.n = 0; this.eDone = 0; this.sNext = null; this.aPos = 0;
    // detector path: 1 kHz low-pass, then decimate
    const w0 = 2 * Math.PI * 1000 / sr, al = Math.sin(w0) / (2 * 0.7071), cw = Math.cos(w0), a0 = 1 + al;
    this.b0 = (1 - cw) / 2 / a0; this.b1 = (1 - cw) / a0; this.a1 = -2 * cw / a0; this.a2 = (1 - al) / a0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    this.DN = 4096; this.dbuf = new Float32Array(this.DN); this.dn = 0;
    this.W = Math.round(this.sr2 * 0.02);
    this.frame = new Float32Array(this.W + 1100); this.dfn = new Float32Array(1100);
    this.hop = 256; this.since = 0; this.acc = 0;
    // pitch state
    this.voiced = false; this.T = sr / 200; this.f0 = 0; this.lastM = 0; this.target = null;
    this.s = 0; this.held = 0; this.silent = 1; this.hist = []; this.ratio = 1;
    this.uvT = Math.round(sr * 0.006); this.gx = 1; this.gv = false;
    this.msI = 0; this.msO = 0; this.gain = 1; this.agcA = 1 - Math.exp(-1 / (0.05 * sr));
    this.p = { retune: 20, humanize: 0.2, flex: 0, amount: 1, formant: 0, voice: 'tenor', mask: 0xFFF, live: false, fcorr: 1 };
    this.set(p || {});
  }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = p[k];
    const v = this.p.voice;
    this.fmin = v === 'soprano' ? 150 : v === 'low' ? 70 : 80;
    this.fmax = v === 'soprano' ? 1100 : v === 'low' ? 520 : 900;
    this.fr = Math.pow(2, Math.max(-3, Math.min(3, +this.p.formant || 0)) / 12);
    if (!((this.p.mask | 0) & 0xFFF)) this.p.mask = 0xFFF;
    const live = !!this.p.live, mode = live ? 'live-' + v : 'full';
    if (mode !== this.mode) { // switch grain size: restart synthesis cleanly at the new look-ahead
      this.mode = mode; this.maxHalf = TuneCore.grainHalf(this.sr, live, v); this.L = TuneCore.latency(this.sr, live, v);
      this.out.fill(0); this.wsum.fill(0); this.sNext = null;
    }
  }
  snap(m) {
    const mask = this.p.mask; let best = Math.round(m), bd = 99;
    for (let k = Math.floor(m) - 7; k <= Math.ceil(m) + 7; k++) {
      if (!((mask >> (((k % 12) + 12) % 12)) & 1)) continue;
      const d = Math.abs(k - m); if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  /* YIN pitch detection on the decimated, low-passed signal, then target note + retune smoothing. */
  detect() {
    const hopSec = this.hop / this.sr, rms = Math.sqrt(this.acc / this.hop); this.acc = 0;
    const W = this.W, sr2 = this.sr2, maxLag = Math.min(1000, Math.ceil(sr2 / this.fmin)), minLag = Math.max(2, Math.floor(sr2 / this.fmax));
    const len = W + maxLag + 1;
    let voiced = false, f0 = 0;
    if (this.dn >= len && rms > 0.0025) {
      const f = this.frame, D = this.DN - 1, st = this.dn - len;
      for (let i = 0; i < len; i++) f[i] = this.dbuf[(st + i) & D];
      const d = this.dfn; let run = 0; d[0] = 1;
      for (let t = 1; t <= maxLag; t++) {
        let s = 0;
        for (let j = 0; j < W; j++) { const x = f[j] - f[j + t]; s += x * x; }
        run += s; d[t] = run > 0 ? s * t / run : 1;
      }
      let bt = -1;
      for (let t = minLag; t < maxLag; t++) if (d[t] < 0.15) { while (t + 1 < maxLag && d[t + 1] < d[t]) t++; bt = t; break; }
      if (bt < 0) { let bv = 1; for (let t = minLag; t < maxLag; t++) if (d[t] < bv) { bv = d[t]; bt = t; } }
      if (bt > minLag && bt < maxLag && d[bt] < (this.voiced ? 0.35 : 0.25)) {
        let tt = bt; const a = d[bt - 1], b = d[bt], c = d[bt + 1], den = a - 2 * b + c;
        if (den > 0) tt = bt + 0.5 * (a - c) / den;
        f0 = sr2 / tt; voiced = f0 >= this.fmin * 0.95 && f0 <= this.fmax * 1.05;
      }
    }
    if (!voiced) {
      this.silent += hopSec; this.voiced = false;
      if (this.silent > 0.15) { this.s = 0; this.target = null; this.hist.length = 0; }
      return;
    }
    let m = 69 + 12 * Math.log2(f0 / 440);
    const h = this.hist; h.push(m); if (h.length > 3) h.shift();
    const med = h.length === 3 ? Math.max(Math.min(h[0], h[1]), Math.min(Math.max(h[0], h[1]), h[2])) : m;
    if (Math.abs(m - med) > 1) { m = med; f0 = 440 * Math.pow(2, (m - 69) / 12); } // one-frame octave slips
    const cand = this.snap(med);
    if (this.target == null) { this.target = cand; this.held = 0; }
    else if (cand !== this.target) {
      const dc = Math.abs(med - cand), dt = Math.abs(med - this.target);
      if (dc + 0.15 < dt || dt > 0.9) { this.target = cand; this.held = 0; }
    }
    this.held += hopSec;
    const p = this.p;
    let corr = Math.max(-3, Math.min(3, this.target - m));
    if (p.flex > 0) { // Flex: only pull notes that are already close to the target
      const zone = 0.55 - 0.45 * p.flex, ad = Math.abs(corr);
      if (ad > zone) corr *= Math.max(0, 1 - (ad - zone) / Math.max(0.08, zone));
    }
    // Retune works like Auto-Tune's: milliseconds, 0 = instant (hard tune), 10–50 = natural with more vibrato coming through as it rises
    let tau = Math.max(0, +p.retune || 0) / 1000;
    if (p.humanize > 0) tau += p.humanize * 0.15 * Math.min(1, Math.max(0, (this.held - 0.12) / 0.35)); // Humanize slows it on sustained notes only
    const a = tau < 0.0005 ? 1 : 1 - Math.exp(-hopSec / tau);
    this.s += (corr - this.s) * a;
    this.ratio = Math.pow(2, this.s * Math.max(0, Math.min(1, +p.amount)) / 12);
    this.T = this.sr / f0; this.f0 = f0; this.lastM = m; this.voiced = true; this.silent = 0;
  }
  /* One pitch-synchronous grain (TD-PSOLA): formants stay put, only the pitch moves. */
  grain() {
    const c = this.sNext, v = this.voiced;
    let Tin = v ? this.T : this.uvT; if (Tin < 16) Tin = 16;
    const ratio = v ? this.ratio : 1, fr = v ? Math.max(0.84, Math.min(1.19, this.fr * (this.p.fcorr ? 1 : ratio))) : 1;
    const half = Math.min(Tin, this.maxHalf), Tout = Tin / ratio;
    if (this.aPos > c + Tin || c - this.aPos > 3 * Tin || (v && !this.gv)) this.aPos = c; // a new voiced note starts in step
    else {
      while (this.aPos + Tin <= c) this.aPos += Tin;
      // nearest analysis mark (stays phase-locked as the pitch drifts), when the input for it has arrived
      if (c - this.aPos > Tin * 0.5 && this.aPos + Tin + half * fr < this.n - 1) this.aPos += Tin;
      if (Math.abs(ratio - 1) < 1e-5) { const dr = c - this.aPos; this.aPos += dr > 0.5 ? 0.5 : dr < -0.5 ? -0.5 : dr; } // no correction: ease back into sync
    }
    this.gv = v;
    const M = this.M, inp = this.inp, out = this.out, ws = this.wsum, k = Math.PI / half, ap = this.aPos;
    const i0 = Math.max(Math.ceil(c - half), this.eDone), i1 = Math.floor(c + half);
    for (let i = i0; i <= i1; i++) {
      const u = i - c, w = 0.5 + 0.5 * Math.cos(k * u), pos = ap + u * fr, p0 = Math.floor(pos), q = pos - p0;
      const x0 = inp[p0 & M]; out[i & M] += (x0 + (inp[(p0 + 1) & M] - x0) * q) * w; ws[i & M] += w;
    }
    this.sNext = c + Tout;
  }
  process(x, y, len) {
    const M = this.M, inp = this.inp, dec = this.dec, D = this.DN - 1;
    for (let i = 0; i < len; i++) {
      const v = x[i]; inp[this.n & M] = v;
      const lp = this.b0 * v + this.b1 * this.x1 + this.b0 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = v; this.y2 = this.y1; this.y1 = lp;
      if (this.n % dec === 0) this.dbuf[this.dn++ & D] = lp;
      this.n++; this.acc += v * v;
      if (++this.since >= this.hop) { this.since = 0; this.detect(); }
    }
    const eEnd = this.n - this.L, e0 = eEnd - len;
    if (this.sNext == null || this.sNext < e0 - 4 * this.maxHalf) { this.sNext = e0; this.aPos = e0; }
    this.eDone = e0;
    while (this.sNext <= eEnd + this.maxHalf) this.grain();
    // level match: grains pulled away from their pitch overlap partly out of phase and lose a little level
    const out = this.out, ws = this.wsum, a = this.agcA; let g = this.gain;
    for (let i = 0; i < len; i++) {
      // divide by the exact sum of the overlapping windows: no level ripple however far apart the grains land (deep voices too)
      const k = (e0 + i) & M, wk = ws[k], yo = out[k] / (wk > 0.35 ? wk : 0.35), xi = inp[k];
      ws[k] = 0;
      this.msI += (xi * xi - this.msI) * a; this.msO += (yo * yo - this.msO) * a;
      y[i] = yo * g; out[k] = 0;
    }
    let tg = 1;
    if (this.voiced && Math.abs(this.s) > 0.02 && this.msI > 1e-8 && this.msO > 1e-9) tg = Math.max(0.8, Math.min(1.25, Math.sqrt(this.msI / this.msO)));
    this.gain = g + (tg - g) * (1 - Math.exp(-len / (0.06 * this.sr)));
    this.eDone = eEnd;
  }
  report() { return { v: this.voiced ? 1 : 0, m: this.lastM, t: this.target, s: this.s * this.p.amount }; }
}
class DeEssCore {
  constructor(sr, p) { this.sr = sr; this.zl = [0, 0, 0, 0]; this.zr = [0, 0, 0, 0]; this.env = 0; this.gr = 1; this.p = { freq: 6500, thresh: -28, range: 8 }; this.set(p || {}); }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = +p[k];
    const sr = this.sr, f = Math.max(2000, Math.min(sr * 0.45, this.p.freq || 6500)), w0 = 2 * Math.PI * f / sr, al = Math.sin(w0) / (2 * 0.7071), cw = Math.cos(w0), a0 = 1 + al;
    this.b0 = (1 + cw) / 2 / a0; this.b1 = -(1 + cw) / a0; this.a1 = -2 * cw / a0; this.a2 = (1 - al) / a0;
    this.thr = Math.pow(10, (this.p.thresh || -28) / 20); this.floor = Math.pow(10, -Math.max(0, this.p.range || 0) / 20);
    this.att = Math.exp(-1 / (0.0007 * sr)); this.rel = Math.exp(-1 / (0.06 * sr)); this.gs = Math.exp(-1 / (0.002 * sr));
  }
  hp(z, x) { const y = this.b0 * x + this.b1 * z[0] + this.b0 * z[1] - this.a1 * z[2] - this.a2 * z[3]; z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = y; return y; }
  process(l, r, ol, or, len) {
    for (let i = 0; i < len; i++) {
      const xl = l[i], xr = r ? r[i] : xl, hl = this.hp(this.zl, xl), hr = r ? this.hp(this.zr, xr) : hl;
      const lv = Math.max(hl < 0 ? -hl : hl, hr < 0 ? -hr : hr);
      this.env = lv > this.env ? this.att * this.env + (1 - this.att) * lv : this.rel * this.env + (1 - this.rel) * lv;
      const target = this.env > this.thr ? Math.max(this.floor, Math.pow(this.thr / this.env, 0.8)) : 1;
      this.gr = this.gs * this.gr + (1 - this.gs) * target;
      const k = 1 - this.gr; // split-band: lows untouched, the sibilant band turned down
      ol[i] = xl - hl * k; if (or) or[i] = xr - hr * k;
    }
  }
}
/* Character compressor. No hidden makeup gain and no look-ahead, so levels are predictable and it adds no delay.
   fet = 1176-style (fast, punchy, a little colour), opto = LA-2A / CL-1B (smooth, program-dependent release),
   vox = RVox-style leveller, clean = Pro-C-style, auto = slow input leveller that rides the voice to a target level. */
class CompCore {
  constructor(sr, p) {
    this.sr = sr; this.env = 0; this.g = 1; this.slowGr = 0; this.rms = 0; this.agc = 1; this.grDb = 0;
    this.p = { mode: 'clean', amount: 0.5, ratio: 4, attack: 5, release: 120, output: 0, mix: 1, target: -20 };
    this.set(p || {});
  }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = k === 'mode' ? String(p[k]) : +p[k];
    const sr = this.sr, P = this.p, m = P.mode, co = ms => Math.exp(-1 / (Math.max(0.01, ms) * 0.001 * sr));
    this.thr = -6 - Math.max(0, Math.min(1, P.amount)) * 34;
    this.ratio = m === 'opto' ? 3 : m === 'vox' ? 4 : Math.max(1, P.ratio || 4);
    this.knee = m === 'fet' ? 3 : m === 'opto' ? 10 : m === 'vox' ? 8 : 6;
    this.att = co(m === 'opto' ? 10 : m === 'vox' ? 3 : m === 'fet' ? Math.max(0.05, P.attack) : P.attack);
    this.rel = co(m === 'opto' ? 70 : m === 'vox' ? 90 : P.release);
    this.relSlow = co(1600); this.slowA = 1 - Math.exp(-1 / (0.5 * sr));
    this.det = co(m === 'opto' ? 8 : 0.2); // opto reacts to the average level, the others to peaks
    this.colour = m === 'fet' ? 0.22 : m === 'opto' ? 0.08 : 0;
    this.out = Math.pow(10, (P.output || 0) / 20); this.mix = Math.max(0, Math.min(1, P.mix));
    this.tgt = Math.pow(10, (P.target || -20) / 20); this.rmsA = 1 - Math.exp(-1 / (0.4 * sr));
    this.up = 1 - Math.exp(-1 / (2.5 * sr)); this.dn = 1 - Math.exp(-1 / (0.35 * sr));
    this.fast = 1 - Math.exp(-1 / (0.0015 * sr)); this.pRel = Math.exp(-1 / (0.08 * sr)); this.penv = this.penv || 0;
    this.gRel = Math.exp(-1 / (0.02 * sr)); this.gOpen = Math.exp(-1 / (0.001 * sr)); this.gClose = Math.exp(-1 / (0.12 * sr)); this.hold = this.hold || 0;
  }
  process(l, r, ol, or, len) {
    const P = this.p;
    if (P.mode === 'gate') { // downward expander: below the threshold the level falls 2 dB per dB (down to −40 dB); opens in 1 ms, holds 80 ms
      const thr = P.target, hold = Math.round(0.08 * this.sr);
      for (let i = 0; i < len; i++) {
        const xl = l[i], xr = r ? r[i] : xl, lv = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr);
        this.env = lv > this.env ? lv : this.env * this.gRel;
        const over = 20 * Math.log10(this.env + 1e-9) - thr;
        if (over >= 0) this.hold = hold; else if (this.hold > 0) this.hold--;
        const want = over >= 0 || this.hold > 0 ? 1 : Math.max(0.01, Math.pow(10, over * 2 / 20));
        this.g = want > this.g ? want + (this.g - want) * this.gOpen : want + (this.g - want) * this.gClose;
        ol[i] = xl * this.g; if (or) or[i] = xr * this.g;
      }
      this.grDb = 20 * Math.log10(this.g);
      return;
    }
    if (P.mode === 'auto') {
      for (let i = 0; i < len; i++) {
        const xl = l[i], xr = r ? r[i] : xl, lv = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr);
        this.rms += (0.5 * (xl * xl + xr * xr) - this.rms) * this.rmsA;
        this.penv = lv > this.penv ? lv : this.penv * this.pRel;
        // peaks are never allowed above −6 dBFS: a loud entrance after a quiet patch is caught within 2 ms, not 350
        const ceil = 0.5 / Math.max(this.penv, 1e-9);
        if (ceil < this.agc) this.agc += (ceil - this.agc) * this.fast;
        else if (this.rms > 3.2e-5) { // below about −45 dB it holds, so breaths, room noise and speaker spill are never pumped up
          const want = Math.min(4, Math.max(0.12, this.tgt / Math.sqrt(this.rms), 0), ceil);
          this.agc += (want - this.agc) * (want < this.agc ? this.dn : this.up);
        }
        ol[i] = xl * this.agc; if (or) or[i] = xr * this.agc;
      }
      this.grDb = 20 * Math.log10(this.agc);
      return;
    }
    const thr = this.thr, ratio = this.ratio, knee = this.knee, slope = 1 / ratio - 1, col = this.colour, mix = this.mix, out = this.out;
    for (let i = 0; i < len; i++) {
      const xl = l[i], xr = r ? r[i] : xl, lv = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr);
      this.env = lv > this.env ? lv + (this.env - lv) * this.det : this.env * this.rel + lv * (1 - this.rel);
      const over = 20 * Math.log10(this.env + 1e-9) - thr;
      let gr = 0;
      if (2 * over > knee) gr = slope * over; else if (2 * over > -knee) { const k = over + knee / 2; gr = slope * k * k / (2 * knee); }
      const want = Math.pow(10, gr / 20);
      if (want < this.g) this.g = want + (this.g - want) * this.att;
      else { const rc = P.mode === 'opto' ? this.rel + (this.relSlow - this.rel) * Math.min(1, this.slowGr / 6) : this.rel; this.g = want + (this.g - want) * rc; }
      this.slowGr += (-20 * Math.log10(this.g) - this.slowGr) * this.slowA;
      let yl = xl * this.g, yr = xr * this.g;
      if (col) { const a = 1 + col * (1 - this.g) * 3; yl = Math.tanh(yl * a) / a; yr = Math.tanh(yr * a) / a; }
      ol[i] = (xl + (yl - xl) * mix) * out; if (or) or[i] = (xr + (yr - xr) * mix) * out;
    }
    this.grDb = 20 * Math.log10(this.g);
  }
}
/* Safety limiter for the end of a chain. 1.5 ms look-ahead lets the gain ease down before a peak arrives,
   so limiting stays clean instead of crunching; a final clamp guarantees nothing passes the ceiling. */
class LimitCore {
  static latency(sr) { return Math.round(sr * 0.0015); }
  constructor(sr, p) {
    this.sr = sr; this.D = LimitCore.latency(sr); this.bl = new Float32Array(this.D); this.br = new Float32Array(this.D); this.req = new Float32Array(this.D).fill(1); this.w = 0; this.g = 1;
    this.p = { ceiling: -1, release: 80 }; this.set(p || {});
  }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = +p[k];
    this.c = Math.pow(10, Math.min(0, this.p.ceiling) / 20); this.rel = Math.exp(-1 / (Math.max(5, this.p.release) * 0.001 * this.sr)); this.att = Math.exp(-1 / (this.D / 5));
  }
  process(l, r, ol, or, len) {
    const c = this.c, D = this.D, bl = this.bl, br = this.br, req = this.req;
    for (let i = 0; i < len; i++) {
      const xl = l[i], xr = r ? r[i] : xl, pk = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr), w = this.w;
      const dl = bl[w], dr = br[w]; bl[w] = xl; br[w] = xr; req[w] = pk > c ? c / pk : 1; this.w = w + 1 === D ? 0 : w + 1;
      let need = 1; for (let k = 0; k < D; k++) if (req[k] < need) need = req[k];
      this.g = need < this.g ? need + (this.g - need) * this.att : need + (this.g - need) * this.rel;
      let yl = dl * this.g, yr = dr * this.g;
      if (yl > c) yl = c; else if (yl < -c) yl = -c; if (yr > c) yr = c; else if (yr < -c) yr = -c;
      ol[i] = yl; if (or) or[i] = yr;
      this.grDb = 20 * Math.log10(this.g);
    }
  }
}
/* Soothe-style de-harsher: four bands in the 2–8 kHz range are turned down only while they ring out above the rest of the voice. */
class DeHarshCore {
  constructor(sr, p) {
    this.sr = sr; this.f = [2300, 3400, 5000, 7400].filter(f => f < sr * 0.42);
    this.z = this.f.map(() => [0, 0, 0, 0]); this.e = this.f.map(() => 0); this.g = this.f.map(() => 1); this.full = 0;
    this.p = { depth: 5, sens: 0.5 }; this.set(p || {});
  }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = +p[k];
    const sr = this.sr;
    this.c = this.f.map(f => { const w0 = 2 * Math.PI * f / sr, al = Math.sin(w0) / (2 * 2.2), cw = Math.cos(w0), a0 = 1 + al; return [al / a0, -al / a0, -2 * cw / a0, (1 - al) / a0]; });
    this.floor = Math.pow(10, -Math.max(0, this.p.depth) / 20); this.rel_ = 10 + 8 * Math.max(0, Math.min(1, this.p.sens));
    this.a = Math.exp(-1 / (0.002 * sr)); this.r = Math.exp(-1 / (0.05 * sr)); this.ga = Math.exp(-1 / (0.003 * sr)); this.gr = Math.exp(-1 / (0.06 * sr));
  }
  process(l, r, ol, or, len) {
    const nb = this.f.length, thrRatio = Math.pow(10, -this.rel_ / 20);
    for (let i = 0; i < len; i++) {
      const xl = l[i], xr = r ? r[i] : xl, x = 0.5 * (xl + xr), ax = x < 0 ? -x : x;
      this.full = ax > this.full ? ax + (this.full - ax) * this.a : this.full * this.r + ax * (1 - this.r);
      let cutL = 0, cutR = 0;
      for (let k = 0; k < nb; k++) {
        const c = this.c[k], z = this.z[k], b = c[0] * x + c[1] * z[1] - c[2] * z[2] - c[3] * z[3];
        z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = b;
        const ab = b < 0 ? -b : b; this.e[k] = ab > this.e[k] ? ab + (this.e[k] - ab) * this.a : this.e[k] * this.r + ab * (1 - this.r);
        const ref = this.full * thrRatio, want = this.e[k] > ref && ref > 1e-6 ? Math.max(this.floor, Math.pow(ref / this.e[k], 0.6)) : 1;
        this.g[k] = want < this.g[k] ? want + (this.g[k] - want) * this.ga : want + (this.g[k] - want) * this.gr;
        const cut = b * (1 - this.g[k]); cutL += cut; cutR += cut;
      }
      ol[i] = xl - cutL; if (or) or[i] = xr - cutR;
    }
  }
}
/* Streaming STFT scaffolding under the spectral clean-up modules (Noise removal, De-echo): Hann window, 75% overlap,
   per-bin gains smoothed across frequency and time, and a phase-coherent mono path (stereo stays identical on both
   sides, like Tune). Must stay self-contained (no outside helpers): the same source runs on the main thread
   (fallback) and inside the AudioWorklet. */
class SpecCore {
  constructor(sr, N = 1024, hop = N / 4) {
    this.sr = sr; this.N = N; this.hop = hop; this.L = N - hop; // 768 samples of look-ahead at the default size
    this.win = new Float32Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    this.inr = new Float32Array(N * 2);      // input history
    this.acc = new Float32Array(N * 2);      // overlap-add accumulator
    this.re = new Float32Array(N); this.im = new Float32Array(N);
    this.ore = new Float32Array(N); this.oim = new Float32Array(N);
    this.nb = N / 2 + 1;
    this.mag2 = new Float32Array(this.nb);
    this.g = new Float32Array(this.nb).fill(1);   // smoothed per-bin gains
    this.gt = new Float32Array(this.nb).fill(1);  // this frame's raw gains
    this.n = 0; this.sDone = 0; this.eDone = -this.L;
    this.att = Math.exp(-hop / (0.006 * sr)); this.rel = Math.exp(-hop / (0.08 * sr));
    this.sm = 1; // how much the raw gains are smoothed across frequency (0 = per bin, 1 = fully smoothed)
  }
  fft(re, im) { // in-place radix-2
    const N = this.N;
    for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < N; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < h; k++) {
          const a = i + k, b = a + h, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  /* One frame: window, FFT, the subclass's per-bin gains, resynthesis, overlap-add. */
  frame() {
    const N = this.N, re = this.re, im = this.im, s = this.sDone, inr = this.inr, win = this.win, mask = N * 2 - 1;
    for (let i = 0; i < N; i++) { re[i] = inr[(s + i) & mask] * win[i]; im[i] = 0; }
    this.fft(re, im);
    const nb = this.nb, mag = this.mag2;
    for (let k = 0; k < nb; k++) mag[k] = re[k] * re[k] + im[k] * im[k];
    this.gainsFor(mag);
    // soften the raw gains a third of an octave either side, so isolated bins don't chatter (musical noise)
    const gt = this.gt, sm = this.sm;
    for (let k = 1; k < nb - 1; k++) gt[k] = gt[k] * (1 - sm) + (gt[k - 1] + 2 * gt[k] + gt[k + 1]) * 0.25 * sm;
    gt[0] = (gt[0] + gt[1]) * 0.5 * sm + gt[0] * (1 - sm); gt[nb - 1] = (gt[nb - 1] + gt[nb - 2]) * 0.5 * sm + gt[nb - 1] * (1 - sm);
    const g = this.g, att = this.att, rel = this.rel;
    for (let k = 0; k < nb; k++) g[k] += (gt[k] - g[k]) * (gt[k] < g[k] ? att : rel);
    // resynthesis: multiply the spectrum, invert (real/imag swap trick), window, overlap-add
    const ore = this.ore, oim = this.oim;
    for (let k = 0; k < nb; k++) { ore[k] = re[k] * g[k]; oim[k] = im[k] * g[k]; }
    for (let k = 1; k < N / 2; k++) { ore[N - k] = ore[k]; oim[N - k] = -oim[k]; }
    for (let k = 0; k < N; k++) { const v = ore[k]; ore[k] = oim[k]; oim[k] = v; } // swap, forward FFT, swap back = inverse (÷N below)
    this.fft(ore, oim);
    for (let k = 0; k < N; k++) { const v = ore[k]; ore[k] = oim[k]; oim[k] = v; }
    const acc = this.acc, wn = win, norm = 2 / (3 * N); // swap-trick inverse includes ÷N; Hann² sums to 1.5 at 75% overlap
    for (let i = 0; i < N; i++) acc[(s + i) & mask] += ore[i] * wn[i] * norm;
  }
  process(l, r, ol, or, len) {
    const inr = this.inr, acc = this.acc, mask = this.N * 2 - 1, n0 = this.n;
    for (let i = 0; i < len; i++) inr[(n0 + i) & mask] = r ? (l[i] + r[i]) * 0.5 : l[i];
    this.n = n0 + len;
    while (this.n - this.sDone >= this.N) { this.frame(); this.sDone += this.hop; }
    let p = this.eDone;
    for (let i = 0; i < len; i++, p++) {
      if (p < 0) { ol[i] = 0; if (or) or[i] = 0; continue; } // the look-ahead primes as silence
      const v = acc[p & mask]; acc[p & mask] = 0; ol[i] = v; if (or) or[i] = v;
    }
    this.eDone = p;
    // absolute counters grow forever; `& mask` breaks once they pass 2^31, so slide everything back
    // by a multiple of the ring size (the same amount for all three: only differences matter)
    if (this.eDone > 1 << 29) { const d = 1 << 29; this.n -= d; this.sDone -= d; this.eDone -= d; }
  }
}
/* Noise removal: learns the static hiss and hum behind the voice and turns it down, while you sing or between phrases.
   A per-bin minimum tracker follows the noise floor down fast and up slowly, so the voice never becomes the "noise";
   loud, clearly voiced bins are left untouched, so sibilance and consonants keep their edge. */
class DenoiseCore extends SpecCore {
  /* live (Hear myself) runs a quarter-size transform: 4 ms of look-ahead instead of 16, so the
     monitored voice feels real-time; the big transform stays for rendering takes. */
  constructor(sr, p) { const live = !!(p && p.live); super(sr, live ? 256 : 1024, live ? 64 : 256); this.live = live; this.noise = new Float32Array(this.nb); this.p = { amount: 0.7, floor: -18 }; this.set(p || {}); }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = +p[k];
    this.k = 2.4 * Math.max(0, Math.min(1, this.p.amount)); // over-subtraction: how much of the floor is removed (0 = transparent)
    this.floor = Math.pow(10, Math.max(-40, Math.min(-6, this.p.floor || -18)) / 20);
    this.up = 1 - Math.exp(-this.hop / (0.4 * this.sr));  // the floor estimate rises quickly while the room is alone
    this.dn = 1 - Math.exp(-this.hop / (0.03 * this.sr)); // and falls fast (30 ms)
  }
  gainsFor(mag) {
    const nb = this.nb, noise = this.noise, gt = this.gt, k = this.k, up = this.up, dn = this.dn, floor = this.floor;
    let loTot = 0; for (let i = 0; i < nb; i++) loTot += noise[i];
    let tot = 0; for (let i = 0; i < nb; i++) tot += mag[i];
    const live = tot > 1e-9, vad = live && tot > 8 * loTot; // the voice is in: freeze the floor so it never learns the notes
    for (let i = 0; i < nb; i++) {
      const m = mag[i]; let lo = noise[i];
      if (lo === 0) lo = m;                    // first hearing of this bin: take the level as the floor
      else if (lo > m * 1.4) lo += (m * 1.4 - lo) * dn; // the floor follows the level down fast
      else if (!vad) lo += (m - lo) * up;      // and rises while the room is alone, never under a held note
      noise[i] = lo;
      let gr = 1;
      if (live && lo > 1e-12) {
        const a = k * lo;
        gr = m > a ? 1 - a / m : floor;   // Wiener-style: take out what the floor explains, keep the rest
        if (m > 60 * lo) gr = 1;          // clearly voiced bins stay untouched
      }
      gt[i] = gr;
    }
  }
}
/* De-echo: tightens room echo and reverb tails around the voice. Per bin, an envelope that rises with onsets but
   decays faster than a room does: while the level keeps falling (the tail) the bin is turned down, while onsets and
   sustained notes pass through. Hits the boxy, echoey sound of singing in a hard-walled room; very heavy tails only
   get tighter, not gone. */
class DeEchoCore extends SpecCore {
  /* live (Hear myself) runs a quarter-size transform: 4 ms of look-ahead instead of 16. */
  constructor(sr, p) { const live = !!(p && p.live); super(sr, live ? 256 : 1024, live ? 64 : 256); this.live = live; this.env = new Float32Array(this.nb); this.p = { amount: 0.5, floor: -12 }; this.set(p || {}); }
  set(p) {
    for (const k in p) if (k in this.p) this.p[k] = +p[k];
    const a = Math.max(0, Math.min(1, this.p.amount));
    this.a = a; this.floor = Math.pow(10, Math.max(-30, Math.min(-6, this.p.floor || -12)) / 20);
    this.atk = 1 - Math.exp(-this.hop / (0.002 * this.sr));               // an onset is an onset: 2 ms
    this.dec = Math.exp(-this.hop / ((0.05 + 0.35 * a) * this.sr));       // the envelope decays faster than the room, so tails show up as level still hanging
    this.rel = Math.exp(-this.hop / (0.04 * this.sr));                    // gains follow the tail quickly
    this.sm = 0.35;                                                       // tails sit in broad bands, not single bins
  }
  gainsFor(mag) {
    const nb = this.nb, env = this.env, gt = this.gt, floor = this.floor, atk = this.atk, dec = this.dec, amt = this.a;
    const strength = 0.35 + 0.65 * amt;
    for (let i = 0; i < nb; i++) {
      const m = mag[i]; let e = env[i];
      e = m > e ? e + (m - e) * atk : e * dec + m * (1 - dec);
      env[i] = e;
      let gr = 1;
      if (e > 1e-12) {
        const tail = 1 - (m / e) * 1.25; // how much of this bin is tail: onsets read 0, decayed tails read up to 1
        if (tail > 0) { gr = 1 - strength * tail * (1 - floor); if (gr < floor) gr = floor; }
      }
      gt[i] = gr;
    }
  }
}

/* DSP-END */

function dspModule() {
  return `${TuneCore.toString()}
${DeEssCore.toString()}
${CompCore.toString()}
${LimitCore.toString()}
${DeHarshCore.toString()}
${SpecCore.toString()}
${DenoiseCore.toString()}
${DeEchoCore.toString()}
class THTune extends AudioWorkletProcessor {
  constructor(o) { super(); const p = (o && o.processorOptions) || {}; this.c = new TuneCore(sampleRate, p); this.rep = !!p.report; this.m = new Float32Array(128); this.k = 0;
    this.port.onmessage = e => this.c.set(e.data); }
  process(ins, outs) {
    const i = ins[0], o = outs[0], a = i && i[0], b = i && i[1], L = o[0].length; let m = this.m; if (m.length !== L) m = this.m = new Float32Array(L);
    if (a) { if (b) for (let k = 0; k < L; k++) m[k] = (a[k] + b[k]) * 0.5; else m.set(a); } else m.fill(0);
    this.c.process(m, o[0], L); for (let ch = 1; ch < o.length; ch++) o[ch].set(o[0]);
    if (this.rep && ++this.k >= 16) { this.k = 0; this.port.postMessage(this.c.report()); }
    return true;
  }
}
registerProcessor('th-tune', THTune);
const CORES = { deess: DeEssCore, comp: CompCore, limit: LimitCore, deharsh: DeHarshCore, denoise: DenoiseCore, deecho: DeEchoCore };
class THFx extends AudioWorkletProcessor {
  constructor(o) { super(); const p = (o && o.processorOptions) || {}; this.kind = p.kind; this.live = !!p.live; this.c = new CORES[p.kind](sampleRate, p); this.rep = !!p.report; this.k = 0; this.port.onmessage = e => this.setP(e.data); }
  setP(p) {
    if (p && p.live !== undefined && !!p.live !== this.live) { // live size switch: rebuild the transform
      this.live = !!p.live; this.c = new CORES[this.kind](sampleRate, p); return;
    }
    this.c.set(p);
  }
  process(ins, outs) {
    const i = ins[0], o = outs[0], a = i && i[0], b = i && i[1];
    if (!a) { for (const ch of o) ch.fill(0); return true; }
    this.c.process(a, b || null, o[0], o[1] || null, o[0].length);
    if (!b && o[1]) o[1].set(o[0]);
    if (this.rep && this.c.grDb !== undefined && ++this.k >= 16) { this.k = 0; this.port.postMessage({ gr: this.c.grDb }); }
    return true;
  }
}
registerProcessor('th-fx', THFx);`;
}

const DSP_NODES = new Set(['tune', 'deess', 'comp', 'limit', 'deharsh', 'denoise', 'deecho']);
function pluginUsesDsp(id) { const pl = plugins.get(id); return !!(pl && pl.manifest.graph && pl.manifest.graph.some(n => DSP_NODES.has(n.node))); }
function usesDsp(P) { return P.mixer.some(m => m.fx.some(f => !f.bypass && pluginUsesDsp(f.plugin))); }
/* 12-bit mask of the pitch classes Tune may snap to. root: below 0 follows the song key (the key at the top, which Smart key
   keeps in step with the beat), 0-11 is Tune's own key with smode. Older songs saved -2 for "Smart": that's the song key now. */
function tuneMask(P, which, root, smode) {
  if (root == null || +root < 0) {
    const sc = which === 'chromatic' ? SCALES.chromatic : (SCALES[P.scale] || SCALES.chromatic), r = P.key | 0;
    let mask = 0; for (const st of sc.steps) mask |= 1 << ((r + st) % 12);
    const k = P.smartKey; // the beat leans on a note outside the scale (a harmonic-minor V): keep it, while the song key is the one heard
    if (which !== 'chromatic' && k && k.src === 'beat' && +k.root === r && k.mode === P.scale && Array.isArray(k.extra)) for (const pc of k.extra) mask |= 1 << (pc % 12);
    return mask;
  }
  const own = root != null && +root >= 0, sc = which === 'chromatic' && !own ? SCALES.chromatic : own ? (SCALES[smode] || SCALES.major) : (SCALES[P.scale] || SCALES.chromatic), r = own ? +root : (P.key | 0);
  let mask = 0; for (const st of sc.steps) mask |= 1 << ((r + st) % 12);
  return mask;
}
/* A worklet-backed effect with a main-thread fallback. The node is built on the first apply()
   so the worklet gets its starting settings in processorOptions (offline renders need that). */
function dspPrim(E, kind, makeCore, toParams) {
  const ac = E.ac, input = ac.createGain(), output = ac.createGain();
  let node = null, core = null, coreLive = false, rep = null, last = {};
  const B = 1024, sr = ac.sampleRate; // fallback buffer: the main thread must service this, so give it slack
  const build = p => {
    if (E.dsp === 'ready') {
      try {
        node = new AudioWorkletNode(ac, kind === 'tune' ? 'th-tune' : 'th-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { ...p, kind, report: !E.offline } });
        node.port.onmessage = e => { rep = e.data; };
      } catch (e) { node = null; }
    }
    if (!node) {
      if (!E.dsp && !E.offline) E.loadDsp();
      const c = core = makeCore(sr, p), mono = new Float32Array(B), sp = ac.createScriptProcessor(B, 2, 2);
      sp.onaudioprocess = e => {
        const ib = e.inputBuffer, ob = e.outputBuffer, a = ib.getChannelData(0), b = ib.numberOfChannels > 1 ? ib.getChannelData(1) : null, oa = ob.getChannelData(0), obb = ob.numberOfChannels > 1 ? ob.getChannelData(1) : null;
        if (kind === 'tune') { for (let i = 0; i < a.length; i++) mono[i] = b ? (a[i] + b[i]) * 0.5 : a[i]; c.process(mono, oa, a.length); if (obb) obb.set(oa); }
        else c.process(a, b, oa, obb, a.length);
      };
      node = sp;
    }
    input.connect(node); node.connect(output);
  };
  return {
    input, output, probe() { return core ? (core.report ? core.report() : core.grDb !== undefined ? { gr: core.grDb } : null) : rep; },
    dspFallback: () => !!core, // true while running on the main-thread ScriptProcessor instead of the audio-thread worklet
    get latency() { // what this effect delays the signal by, so audio clips can start early and stay on the beat
      if (!node) return 0;
      const own = kind === 'tune' ? (core ? core.L : TuneCore.latency(sr, last.live, last.voice)) : kind === 'limit' ? LimitCore.latency(sr)
        : kind === 'denoise' || kind === 'deecho' ? (core ? core.L : last.live ? 192 : 768) : 0;
      return (own + (core ? B : 0)) / sr;
    },
    apply(s) { const p = last = toParams(E, s);
      if (!node) { coreLive = !!p.live; build(p); }
      else if (core) { if (!!p.live !== coreLive) { coreLive = !!p.live; core = makeCore(sr, p); } else core.set(p); } // live switches resize the transform: new core
      else node.port.postMessage(p);
    },
    refresh() { apply(last); }, // e.g. the engine switching to low-latency monitoring must reach the cores
    dispose() { if (node) { if (core) node.onaudioprocess = null; else node.port.onmessage = null; } disc(input, output, node); },
  };
}
PRIMS.tune = E => dspPrim(E, 'tune', (sr, p) => new TuneCore(sr, p), (E2, s) => ({
  retune: clamp(+s.retune || 0, 0, 400), humanize: clamp(+s.humanize || 0, 0, 1), flex: clamp(+s.flex || 0, 0, 1),
  amount: clamp(s.amount == null ? 1 : +s.amount, 0, 1), formant: clamp(+s.formant || 0, -3, 3), voice: ['soprano', 'tenor', 'low'].includes(s.voice) ? s.voice : 'tenor',
  mask: tuneMask(E2.P(), s.scale, s.root, s.smode), live: !!E2.lowLat && !E2.offline, fcorr: s.fcorr === 'off' ? 0 : 1 }));
PRIMS.comp = E => dspPrim(E, 'comp', (sr, p) => new CompCore(sr, p), (E2, s) => ({ mode: ['fet', 'opto', 'vox', 'clean', 'auto', 'gate'].includes(s.mode) ? s.mode : 'clean',
  amount: clamp(+(s.amount ?? 0.5), 0, 1), ratio: clamp(+(s.ratio ?? 4), 1, 20), attack: clamp(+(s.attack ?? 5), 0.05, 100), release: clamp(+(s.release ?? 120), 20, 2000),
  output: clamp(+(s.output ?? 0), -24, 24), mix: clamp(+(s.mix ?? 1), 0, 1), target: clamp(+(s.target ?? -20), -80, -6) }));
PRIMS.limit = E => dspPrim(E, 'limit', (sr, p) => new LimitCore(sr, p), (E2, s) => ({ ceiling: clamp(+(s.ceiling ?? -1), -12, 0), release: clamp(+(s.release ?? 80), 5, 1000) }));
PRIMS.deharsh = E => dspPrim(E, 'deharsh', (sr, p) => new DeHarshCore(sr, p), (E2, s) => ({ depth: clamp(+(s.depth ?? 5), 0, 18), sens: clamp(+(s.sens ?? 0.5), 0, 1) }));
PRIMS.deess = E => dspPrim(E, 'deess', (sr, p) => new DeEssCore(sr, p), (E2, s) => ({ freq: clamp(+s.freq || 6500, 2000, 12000), thresh: clamp(+(s.thresh ?? -28), -60, 0), range: clamp(+(s.range ?? 8), 0, 24) }));
PRIMS.denoise = E => dspPrim(E, 'denoise', (sr, p) => new DenoiseCore(sr, p), (E2, s) => ({ amount: clamp(+(s.amount ?? 0.7), 0, 1), floor: clamp(+(s.floor ?? -18), -40, -6), live: !!E2.lowLat && !E2.offline }));
PRIMS.deecho = E => dspPrim(E, 'deecho', (sr, p) => new DeEchoCore(sr, p), (E2, s) => ({ amount: clamp(+(s.amount ?? 0.5), 0, 1), floor: clamp(+(s.floor ?? -12), -30, -6), live: !!E2.lowLat && !E2.offline }));
/* Slowly drifting short delays panned left and right (two or four voices): a wide double that keeps the lead in the middle,
   in the spirit of Waves Doubler, MicroShift and Dimension D. */
PRIMS.doubler = E => {
  const ac = E.ac, dw = dryWet(E), hp = ac.createBiquadFilter(), mg = ac.createChannelMerger(2), V = [];
  hp.type = 'highpass'; hp.frequency.value = 200; dw.input.connect(hp); mg.connect(dw.wet);
  [[0.75, 0.21, 0], [1.25, 0.27, 1], [1.7, 0.17, 1], [2.2, 0.31, 0]].forEach(([k, rate, side], n) => {
    const d = ac.createDelay(0.12), lfo = ac.createOscillator(), dep = ac.createGain(), g = ac.createGain();
    lfo.frequency.value = rate; lfo.connect(dep); dep.connect(d.delayTime); lfo.start();
    hp.connect(d); d.connect(g); g.connect(mg, 0, side); V.push({ d, lfo, dep, g, k, n });
  });
  return { input: dw.input, output: dw.output, apply(s) {
    const sp = clamp(+s.spread || 14, 3, 40) / 1000, four = +s.voices === 4, depth = clamp(+s.depth || 0, 0, 1) * 0.003;
    for (const v of V) { E.ramp(v.d.delayTime, sp * v.k); E.ramp(v.dep.gain, depth * (v.n > 1 ? 1.4 : 1)); E.ramp(v.g.gain, v.n < 2 ? 1 : four ? 0.8 : 0); }
    E.ramp(dw.dry.gain, 1); E.ramp(dw.wet.gain, clamp(+s.mix || 0, 0, 1) * (four ? 0.75 : 1));
  }, dispose() { V.forEach(v => { try { v.lfo.stop(); } catch (e) { /* ok */ } disc(v.d, v.lfo, v.dep, v.g); }); disc(...dw.nodes, hp, mg); } };
};
/* Echoes that bounce left, right, left… */
PRIMS.pingpong = E => {
  const ac = E.ac, dw = dryWet(E), sum = ac.createGain(), tone = ac.createBiquadFilter(), dl = ac.createDelay(4), dr = ac.createDelay(4), f1 = ac.createGain(), f2 = ac.createGain(), mg = ac.createChannelMerger(2);
  sum.channelCount = 1; sum.channelCountMode = 'explicit'; tone.type = 'lowpass';
  dw.input.connect(sum); sum.connect(tone); tone.connect(dl); dl.connect(mg, 0, 0); dl.connect(f1); f1.connect(dr); dr.connect(mg, 0, 1); dr.connect(f2); f2.connect(dl); mg.connect(dw.wet);
  return { input: dw.input, output: dw.output, apply(s) {
    const t = clamp((s.beats != null ? +s.beats : 0.5) * 60 / E.bpm, 0.01, 3.9); E.ramp(dl.delayTime, t, 0.05); E.ramp(dr.delayTime, t, 0.05);
    const fb = clamp(+s.feedback || 0, 0, 0.9); E.ramp(f1.gain, Math.sqrt(fb)); E.ramp(f2.gain, Math.sqrt(fb));
    E.ramp(tone.frequency, clamp(+s.tone || 5000, 200, 20000)); dw.mix(s.mix ?? 0.2);
  }, dispose() { disc(...dw.nodes, sum, tone, dl, dr, f1, f2, mg); } };
};

const DELAY_TIMES = [{ label: '1/16', value: 0.25 }, { label: '1/8', value: 0.5 }, { label: '1/8 dotted', value: 0.75 }, { label: '1/4', value: 1 }, { label: '1/4 dotted', value: 1.5 }, { label: '1/2', value: 2 }];
BUILTIN_PLUGINS.push(
  { id: 'th.autotune', type: 'effect', name: 'Tune', author: 'Tapehouse', description: 'Pitch correction that snaps the voice to the song key. Retune 0–5 is the hard robotic sound, 10–15 the modern R&B sound, 20+ natural.',
    params: [
      { id: 'retune', label: 'Retune', min: 0, max: 100, default: 20, step: 1, unit: 'ms' },
      { id: 'humanize', label: 'Humanize', min: 0, max: 1, default: 0.2, unit: '%' },
      { id: 'flex', label: 'Flex', min: 0, max: 1, default: 0, unit: '%' },
      { id: 'amount', label: 'Amount', min: 0, max: 1, default: 1, unit: '%' },
      { id: 'formant', label: 'Formant', min: -3, max: 3, default: 0, unit: 'st' },
      { id: 'voice', label: 'Voice', options: [{ label: 'Soprano', value: 'soprano' }, { label: 'Alto / Tenor', value: 'tenor' }, { label: 'Low male', value: 'low' }], default: 'tenor' },
      { id: 'scale', label: 'Notes', options: [{ label: 'Song key', value: 'key' }, { label: 'All notes', value: 'chromatic' }], default: 'key' },
      { id: 'root', label: 'Key', options: [{ label: 'Song key', value: -1 }, ...['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map((n, i) => ({ label: n, value: i }))], default: -1 },
      { id: 'smode', label: 'Own scale', options: [['major', 'Major'], ['minor', 'Minor'], ['harmonic', 'Harmonic minor'], ['dorian', 'Dorian'], ['pentmin', 'Minor pentatonic'], ['pentmaj', 'Major pentatonic'], ['blues', 'Blues'], ['chromatic', 'Chromatic']].map(([value, label]) => ({ label, value })), default: 'minor' },
      { id: 'fcorr', label: 'Formant fix', options: [{ label: 'Off (Auto-Tune sound)', value: 'off' }, { label: 'On (natural)', value: 'on' }], default: 'on' }],
    graph: [{ node: 'tune', retune: '$retune', humanize: '$humanize', flex: '$flex', amount: '$amount', formant: '$formant', voice: '$voice', scale: '$scale', fcorr: '$fcorr', root: '$root', smode: '$smode' }] },
  { id: 'th.vocal-eq', type: 'effect', name: 'Vocal EQ', author: 'Tapehouse', description: 'Low cut, mud cut, presence and air: the four moves almost every vocal gets.',
    params: [
      { id: 'lowcut', label: 'Low cut', min: 30, max: 300, default: 90, curve: 'log', unit: 'Hz' },
      { id: 'mud', label: 'Mud', min: -12, max: 6, default: -2, unit: 'dB' },
      { id: 'mudFreq', label: 'Mud freq', min: 150, max: 800, default: 300, curve: 'log', unit: 'Hz' },
      { id: 'presence', label: 'Presence', min: -8, max: 8, default: 1, unit: 'dB' },
      { id: 'presFreq', label: 'Pres freq', min: 1500, max: 6000, default: 3000, curve: 'log', unit: 'Hz' },
      { id: 'air', label: 'Air', min: -6, max: 8, default: 2, unit: 'dB' }],
    graph: [{ node: 'filter', filterType: 'highpass', frequency: '$lowcut', q: 0.71 }, { node: 'filter', filterType: 'peaking', frequency: '$mudFreq', q: 1.1, gain: '$mud' },
      { node: 'filter', filterType: 'peaking', frequency: '$presFreq', q: 0.8, gain: '$presence' }, { node: 'filter', filterType: 'highshelf', frequency: 10000, q: 0.7, gain: '$air' }] },
  { id: 'th.deesser', type: 'effect', name: 'De-esser', author: 'Tapehouse', description: 'Turns down harsh S and T sounds without dulling the rest of the voice.',
    params: [
      { id: 'freq', label: 'Freq', min: 3000, max: 10000, default: 6500, curve: 'log', unit: 'Hz' },
      { id: 'thresh', label: 'Thresh', min: -50, max: 0, default: -28, unit: 'dB' },
      { id: 'range', label: 'Range', min: 0, max: 18, default: 8, unit: 'dB' }],
    graph: [{ node: 'deess', freq: '$freq', thresh: '$thresh', range: '$range' }] },
  { id: 'th.doubler', type: 'effect', name: 'Doubler', author: 'Tapehouse', description: 'Wide stereo double, in the spirit of MicroShift and Dimension D, with the lead kept centred.',
    params: [
      { id: 'mix', label: 'Width', min: 0, max: 1, default: 0.3 },
      { id: 'spread', label: 'Spread', min: 3, max: 40, default: 14, unit: 'ms' },
      { id: 'depth', label: 'Drift', min: 0, max: 1, default: 0.4 },
      { id: 'voices', label: 'Voices', options: [{ label: '2 voices', value: 2 }, { label: '4 voices', value: 4 }], default: 2 }],
    graph: [{ node: 'doubler', mix: '$mix', spread: '$spread', depth: '$depth', voices: '$voices' }] },
  { id: 'th.vocal-comp', type: 'effect', name: 'Vocal Compressor', author: 'Tapehouse', description: 'Compressor with the classic vocal characters: 1176-style FET, LA-2A-style opto, RVox-style leveller, clean, or an auto level that rides the mic to a steady level.',
    params: [
      { id: 'mode', label: 'Character', options: [{ label: 'FET (1176)', value: 'fet' }, { label: 'Opto (LA-2A)', value: 'opto' }, { label: 'Leveller (RVox)', value: 'vox' }, { label: 'Clean', value: 'clean' }, { label: 'Auto level', value: 'auto' }, { label: 'Noise gate', value: 'gate' }], default: 'opto' },
      { id: 'amount', label: 'Squeeze', min: 0, max: 1, default: 0.5, unit: '%' },
      { id: 'ratio', label: 'Ratio', min: 1.5, max: 20, default: 4 },
      { id: 'attack', label: 'Attack', min: 0.05, max: 50, default: 1, curve: 'log', unit: 'ms' },
      { id: 'release', label: 'Release', min: 30, max: 1200, default: 120, curve: 'log', unit: 'ms' },
      { id: 'output', label: 'Output', min: -12, max: 12, default: 0, unit: 'dB' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 1, unit: '%' },
      { id: 'target', label: 'Target', min: -80, max: -6, default: -20, unit: 'dB' }],
    graph: [{ node: 'comp', mode: '$mode', amount: '$amount', ratio: '$ratio', attack: '$attack', release: '$release', output: '$output', mix: '$mix', target: '$target' }] },
  { id: 'th.deharsh', type: 'effect', name: 'De-harsh', author: 'Tapehouse', description: 'Soothe-style resonance control: tames harsh, ringing frequencies in the 2–8 kHz range only while they stick out.',
    params: [
      { id: 'depth', label: 'Depth', min: 0, max: 12, default: 5, unit: 'dB' },
      { id: 'sens', label: 'Sensitivity', min: 0, max: 1, default: 0.5, unit: '%' }],
    graph: [{ node: 'deharsh', depth: '$depth', sens: '$sens' }] },
  { id: 'th.denoise', type: 'effect', name: 'Noise Removal', author: 'Tapehouse', description: 'Learns the static hiss, hum and fan noise behind your voice and turns it down while you sing and between phrases. Leave a second of silence before the first take so it hears the room.',
    params: [
      { id: 'amount', label: 'Amount', min: 0, max: 1, default: 0.7, unit: '%' },
      { id: 'floor', label: 'Floor', min: -30, max: -6, default: -18, unit: 'dB' }],
    graph: [{ node: 'denoise', amount: '$amount', floor: '$floor' }] },
  { id: 'th.dereverb', type: 'effect', name: 'De-echo', author: 'Tapehouse', description: 'Tightens room echo and reverb tails around your voice: onsets and sustained notes pass through, the tail that rings on after them is turned down. Singing in a hard-walled room sounds closer.',
    params: [
      { id: 'amount', label: 'Amount', min: 0, max: 1, default: 0.5, unit: '%' },
      { id: 'floor', label: 'Floor', min: -24, max: -6, default: -12, unit: 'dB' }],
    graph: [{ node: 'deecho', amount: '$amount', floor: '$floor' }] },
  { id: 'th.limiter', type: 'effect', name: 'Limiter', author: 'Tapehouse', description: 'Safety limiter: nothing passes above the ceiling, so the chain can never clip.',
    params: [
      { id: 'ceiling', label: 'Ceiling', min: -6, max: 0, default: -1, unit: 'dB' },
      { id: 'release', label: 'Release', min: 20, max: 500, default: 80, curve: 'log', unit: 'ms' }],
    graph: [{ node: 'limit', ceiling: '$ceiling', release: '$release' }] },
  { id: 'th.pingpong', type: 'effect', name: 'Ping-Pong Delay', author: 'Tapehouse', description: 'Tempo-synced echoes that bounce between left and right.',
    params: [
      { id: 'time', label: 'Time', options: DELAY_TIMES, default: 0.5 },
      { id: 'feedback', label: 'Feedback', min: 0, max: 0.9, default: 0.35 },
      { id: 'tone', label: 'Tone', min: 600, max: 12000, default: 4500, curve: 'log', unit: 'Hz' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.2 }],
    graph: [{ node: 'pingpong', beats: '$time', feedback: '$feedback', tone: '$tone', mix: '$mix' }] },
);
(() => { // Room Reverb gets a pre-delay knob (old projects keep the previous 12 ms default)
  const rv = BUILTIN_PLUGINS.find(p => p.id === 'th.room-reverb');
  if (rv && !rv.params.some(p => p.id === 'predelay')) { rv.params.push({ id: 'predelay', label: 'Pre-delay', min: 0, max: 0.12, default: 0.012, unit: 's' }); rv.graph[0].preDelay = '$predelay'; }
})();

/* Live line on the Tune card: which notes it snaps to and what it hears right now. */
function tuneReadout(i, f) {
  const vals = effectiveParams(getPlugin('th.autotune').manifest, f.params);
  const live = el('span', { class: 'tune-live' }, '');
  const box = el('div', { class: 'tune-read' }, el('span', {}, vals.scale === 'chromatic' ? 'Snaps to the nearest note' : `Snaps to ${keyLabel(project)}`), live);
  let h = 0;
  const tick = () => {
    if (!box.isConnected) { clearInterval(h); return; }
    const fx = engine && engine.inserts[i] && engine.inserts[i].fx.find(x => x.id === f.id), r = fx && fx.probe ? fx.probe() : null;
    const active = T.playing || !!REC.stream;
    if (!active) { live.textContent = 'Play a vocal or sing to watch it work'; live.classList.remove('on'); return; }
    if (!r || !r.v || r.t == null) { live.textContent = 'Listening…'; live.classList.remove('on'); return; }
    const near = Math.round(r.m), off = Math.round((r.m - near) * 100), sc = Math.round(r.s * 100);
    live.textContent = `Hearing ${noteName(near)} ${off >= 0 ? '+' : '−'}${Math.abs(off)} ct → ${noteName(r.t)}, pulled ${sc >= 0 ? 'up' : 'down'} ${Math.abs(sc)} ct`;
    live.classList.add('on');
  };
  h = setInterval(tick, 120); setTimeout(tick, 0);
  return box;
}
