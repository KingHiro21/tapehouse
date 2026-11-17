/* =====================================================================
   Part 5: recording, automation, mastering and reference A/B
   ===================================================================== */

/* ---------- project defaults ---------- */
const MASTER_PRESETS = {
  gentle: { label: 'Gentle', target: -16, glue: 0.25, ceiling: -1.5, note: 'Keeps the dynamics, about −16 LUFS' },
  streaming: { label: 'Streaming', target: -14, glue: 0.4, ceiling: -1, note: 'Spotify and Apple Music level, about −14 LUFS' },
  loud: { label: 'Loud', target: -9, glue: 0.6, ceiling: -0.8, note: 'Club and SoundCloud loud, about −9 LUFS' },
};
const K_CHAIN = [['highpass', 60, 0.5], ['highshelf', 1500, null, 4]];
function defaultMaster() { return { on: false, preset: 'streaming', low: 0, mid: 0, high: 0, glue: 0.4, drive: 0, ceiling: -1, target: -14 }; }
function normalizeMaster(m) {
  const d = defaultMaster(); if (!m || typeof m !== 'object') return d;
  const num = (v, def, a, b) => { v = +v; return Number.isFinite(v) ? clamp(v, a, b) : def; };
  return { on: !!m.on, preset: MASTER_PRESETS[m.preset] ? m.preset : d.preset, low: num(m.low, 0, -8, 8), mid: num(m.mid, 0, -8, 8), high: num(m.high, 0, -8, 8),
    glue: num(m.glue, 0.4, 0, 1), drive: num(m.drive, 0, -12, 18), ceiling: num(m.ceiling, -1, -6, -0.1), target: num(m.target, -14, -24, -6) };
}
function normalizeAutomation(a, P) {
  if (!Array.isArray(a)) return [];
  const out = [];
  for (const l of a.slice(0, 64)) {
    if (!l || !l.target || !Array.isArray(l.points)) continue;
    const t = l.target, pv = t.param === 'vol' || t.param === 'pan'; let target = null;
    if (t.kind === 'out') target = { kind: 'out' };
    else if (t.kind === 'mix' && Number.isInteger(t.i) && P.mixer[t.i] && pv) target = { kind: 'mix', i: t.i, param: t.param };
    else if (t.kind === 'ch' && P.channels.some(c => c.id === t.ch) && pv) target = { kind: 'ch', ch: t.ch, param: t.param };
    else if (t.kind === 'fx' && Number.isInteger(t.i) && P.mixer[t.i] && P.mixer[t.i].fx.some(f => f.id === t.fx) && typeof t.param === 'string') target = { kind: 'fx', i: t.i, fx: t.fx, param: t.param.slice(0, 40) };
    if (!target) continue;
    const points = l.points.filter(p => p && Number.isFinite(+p.s) && Number.isFinite(+p.v)).slice(0, 4000)
      .map(p => ({ s: clamp(Math.round(+p.s * 100) / 100, 0, 100000), v: +p.v })).sort((x, y) => x.s - y.s);
    out.push({ id: String(l.id || uid()), target, points, off: !!l.off });
  }
  return out;
}
const autos = P => P.automation || (P.automation = []);
const fmtL = v => Number.isFinite(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(1) : '–';

/* ---------- recording ---------- */
const REC = { state: 'idle', armed: null, stream: null, src: null, node: null, sink: null, meter: null, mdata: null, mon: null, mode: null, workletReady: false,
  capturing: false, pending: null, chunks: [], songStart: 0, startStep: 0, loop: null, mergeInto: null, stopAt: 0, err: null, errMsg: '', opening: false, devices: [], level: 0, clipUntil: 0, waiter: null };
const REC_WORKLET = `class R extends AudioWorkletProcessor{constructor(){super();this.on=false;this.buf=new Float32Array(8192);this.n=0;this.f0=0;
this.port.onmessage=e=>{if(e.data==='on'){this.on=true;this.n=0}else if(e.data==='off'){this.flush();this.on=false;this.port.postMessage({done:1})}}}
flush(){if(this.n){const o=this.buf.slice(0,this.n);this.port.postMessage({f:this.f0,d:o},[o.buffer]);this.n=0}}
process(ins){if(!this.on)return true;const c=ins[0],a=c&&c[0],b=c&&c[1],L=a?a.length:128;if(this.n===0)this.f0=currentFrame;
for(let k=0;k<L;k++)this.buf[this.n++]=a?(b?(a[k]+b[k])*0.5:a[k]):0;if(this.n>this.buf.length-256)this.flush();return true}}
registerProcessor('th-rec',R);`;
/* Every chain starts with Auto level (rides your mic to a steady level, so the presets behave the same whether you sing soft or loud)
   and ends with a Limiter at −1 dB, so nothing can clip. */
const LEVEL = ['th.vocal-comp', { mode: 'auto', target: -20 }], SAFE = ['th.limiter', { ceiling: -1, release: 80 }];
const CHAINS = {
  clean: { label: 'Clean vocal', desc: 'Low cut, a little air, smooth opto compression, a touch of echo and room',
    fx: [LEVEL, ['th.vocal-eq', { lowcut: 90, mud: -1.5, mudFreq: 400, presence: 0.5, presFreq: 3000, air: 3 }], ['th.vocal-comp', { mode: 'opto', amount: 0.35, output: 0.6 }],
      ['th.deesser', { freq: 6500, thresh: -30, range: 6 }], ['th.tape-delay', { time: 0.75, feedback: 0.25, tone: 3000, mix: 0.1 }], ['th.room-reverb', { size: 1.8, damp: 7500, predelay: 0.015, mix: 0.16 }], SAFE] },
  rap: { label: 'Rap vocal', desc: 'Tight and upfront: hard FET compression, presence, a little grit, almost dry',
    fx: [LEVEL, ['th.vocal-eq', { lowcut: 110, mud: -3, mudFreq: 300, presence: 2, presFreq: 2500, air: 2.5 }], ['th.vocal-comp', { mode: 'fet', amount: 0.4, ratio: 8, attack: 0.3, release: 70, output: 7 }],
      ['th.saturator', { drive: 0.2, tone: 10000, mix: 0.5, output: -1 }], ['th.room-reverb', { size: 0.9, damp: 6000, predelay: 0.01, mix: 0.07 }], SAFE] },
  dreamy: { label: 'Dreamy vocal', desc: 'Airy and wide: chorus, long echoes and a big hall',
    fx: [LEVEL, ['th.vocal-eq', { lowcut: 140, mud: -2, mudFreq: 500, presence: 0, presFreq: 3000, air: 4 }], ['th.vocal-comp', { mode: 'opto', amount: 0.3, output: 0.2 }],
      ['th.chorus', { rate: 0.4, depth: 0.35, mix: 0.25 }], ['th.tape-delay', { time: 1, feedback: 0.45, tone: 2500, mix: 0.2 }], ['th.room-reverb', { size: 4.5, damp: 6500, predelay: 0.03, mix: 0.32 }], SAFE] },
  instrument: { label: 'Guitar or keys', desc: 'Gentle low cut, light compression and a small room',
    fx: [LEVEL, ['th.vocal-eq', { lowcut: 70, mud: -1, mudFreq: 300, presence: 0, presFreq: 3000, air: 1 }], ['th.vocal-comp', { mode: 'clean', amount: 0.25, ratio: 2.5, attack: 15, release: 200 }],
      ['th.room-reverb', { size: 1.4, damp: 7000, predelay: 0.01, mix: 0.14 }], SAFE] },
  /* Artist-style chains. Each mirrors the processing chain their engineers have described, plugin for plugin where we have an equivalent.
     Exact knob settings were never published, so settings are typical starting points for those processors. */
  breezy: { artist: true, label: 'Chris Brown style', short: 'Chris Brown',
    desc: 'Teezio’s chain, tuned to sit under the voice rather than on top of it (26 ms with humanize and flex), 100 Hz cut and 5–7 kHz lift, Pultec air, 1176, RVox, Soothe, Pro-DS, Pro-C2, Doubler, quarter-note H-Delay, VintageVerb.',
    fx: [LEVEL,
      ['th.autotune', { retune: 26, humanize: 0.22, flex: 0.2, amount: 1, formant: 0, voice: 'tenor', scale: 'key', fcorr: 'on' }],
      ['th.vocal-eq', { lowcut: 100, mud: -2, mudFreq: 300, presence: 1.5, presFreq: 5800, air: 3.5 }],
      ['th.vocal-comp', { mode: 'fet', amount: 0.32, ratio: 4, attack: 0.4, release: 120, output: 2.5 }],
      ['th.vocal-comp', { mode: 'vox', amount: 0.3, output: 1.5 }],
      ['th.deharsh', { depth: 4, sens: 0.5 }],
      ['th.deesser', { freq: 6500, thresh: -30, range: 7 }],
      ['th.vocal-comp', { mode: 'clean', amount: 0.18, ratio: 2, attack: 10, release: 150, output: 1.8 }],
      ['th.doubler', { mix: 0.18, spread: 12, depth: 0.5, voices: 2 }],
      ['th.tape-delay', { time: 1, feedback: 0.22, tone: 3200, mix: 0.09 }],
      ['th.room-reverb', { size: 1.6, damp: 9500, predelay: 0.025, mix: 0.12 }],
      SAFE] },
  bieber: { artist: true, label: 'Justin Bieber style', short: 'Bieber',
    desc: 'Josh Gudwin’s chain: light Auto-Tune (30 ms, natural), Manley-style cuts at 330 Hz and 3 kHz with an airy top, LA-2A then 1176, multiband smoothing, de-esser, Dimension D width, ping-pong delay, plate.',
    fx: [LEVEL,
      ['th.autotune', { retune: 30, humanize: 0.3, flex: 0.25, amount: 1, formant: 0, voice: 'tenor', scale: 'key', fcorr: 'on' }],
      ['th.vocal-eq', { lowcut: 90, mud: -3, mudFreq: 330, presence: -1.5, presFreq: 3000, air: 3 }],
      ['th.vocal-comp', { mode: 'opto', amount: 0.38, output: 2.5 }],
      ['th.vocal-comp', { mode: 'fet', amount: 0.22, ratio: 4, attack: 0.8, release: 80, output: 1 }],
      ['th.deharsh', { depth: 3, sens: 0.4 }],
      ['th.deesser', { freq: 7000, thresh: -32, range: 6 }],
      ['th.doubler', { mix: 0.3, spread: 18, depth: 0.65, voices: 4 }],
      ['th.pingpong', { time: 0.5, feedback: 0.34, tone: 4800, mix: 0.16 }],
      ['th.room-reverb', { size: 2.2, damp: 10000, predelay: 0.03, mix: 0.22 }],
      SAFE] },
  laroi: { artist: true, label: 'Kid LAROI style', short: 'Kid LAROI',
    desc: 'Clint Gibbs’ chain: Auto-Tune Pro, moderate (20 ms) with humanize and flex so the tuning is felt but not heard, RVox, C6-style compression, Pro-DS, AE600 + Soothe resonance control, MicroShift back spread, eighth-note H-Delay, VintageVerb.',
    fx: [LEVEL,
      ['th.autotune', { retune: 20, humanize: 0.25, flex: 0.2, amount: 1, formant: 0, voice: 'tenor', scale: 'key', fcorr: 'on' }],
      ['th.vocal-eq', { lowcut: 100, mud: -2, mudFreq: 280, presence: 2, presFreq: 3000, air: 2.5 }],
      ['th.vocal-comp', { mode: 'vox', amount: 0.36, output: 2.5 }],
      ['th.vocal-comp', { mode: 'clean', amount: 0.25, ratio: 2.5, attack: 8, release: 120, output: 2.7 }],
      ['th.deesser', { freq: 7000, thresh: -30, range: 8 }],
      ['th.deharsh', { depth: 5, sens: 0.6 }],
      ['th.doubler', { mix: 0.38, spread: 20, depth: 0.75, voices: 4 }],
      ['th.tape-delay', { time: 0.5, feedback: 0.32, tone: 2800, mix: 0.2 }],
      ['th.room-reverb', { size: 3.2, damp: 8000, predelay: 0.035, mix: 0.28 }],
      SAFE] },
  mgk: { artist: true, label: 'MGK style', short: 'MGK',
    desc: 'Adam Hawkins’ chain: tuned polish, C4 + RCompressor, Decapitator grit, Pro-Q high-pass, Scheps Omni (300 Hz cut, very high ratio), R-De-Esser, a touch of dbx 160, J37 slap, MicroShift, eighth-note EchoBoy and Little Plate.',
    fx: [LEVEL,
      ['th.autotune', { retune: 24, humanize: 0.2, flex: 0.15, amount: 1, formant: 0, voice: 'tenor', scale: 'key', fcorr: 'on' }],
      ['th.vocal-comp', { mode: 'clean', amount: 0.3, ratio: 3, attack: 5, release: 100, output: 1 }],
      ['th.vocal-comp', { mode: 'clean', amount: 0.22, ratio: 3, attack: 12, release: 140, output: 1 }],
      ['th.saturator', { drive: 0.35, tone: 9000, mix: 0.45, output: 0 }],
      ['th.vocal-eq', { lowcut: 110, mud: -3, mudFreq: 300, presence: 2, presFreq: 3500, air: 2.5 }],
      ['th.vocal-comp', { mode: 'fet', amount: 0.28, ratio: 12, attack: 0.5, release: 80, output: 2 }],
      ['th.deesser', { freq: 6500, thresh: -30, range: 7 }],
      ['th.vocal-comp', { mode: 'clean', amount: 0.12, ratio: 2, attack: 15, release: 150, output: 0.5 }],
      ['th.tape-delay', { time: 0.25, feedback: 0.08, tone: 4000, mix: 0.16 }],
      ['th.doubler', { mix: 0.2, spread: 10, depth: 0.55, voices: 2 }],
      ['th.pingpong', { time: 0.5, feedback: 0.25, tone: 3500, mix: 0.1 }],
      ['th.room-reverb', { size: 1.8, damp: 8000, predelay: 0.015, mix: 0.16 }],
      SAFE] },
};
const MIC_ERR = {
  blocked: STANDALONE
    ? ['The browser blocked the mic', 'Click the mic or lock icon at the left of the address bar, set Microphone to Allow, then press Try the mic again. In Windows, also check Settings › Privacy › Microphone and let your browser use it.']
    : ['claude.ai can’t pass your mic to apps', 'Pages inside claude.ai never get microphone access, whatever your browser allows. Get the recording edition: the same Tapehouse as one file on your computer. Open it in Chrome or Edge and your mic, Live and Record all work. To bring a song over, save it from Project › Project bundle and drop that file into the recording edition.'],
  nomic: ['No microphone found', 'Plug in a mic or headset and try again, or import a take you recorded somewhere else.'],
  unsupported: ['Recording isn’t available in this browser', 'You can still record in another app and import the take. It lands on this track at the orange marker.'],
  failed: ['The mic didn’t start', 'Something else may be using it. Close other apps that use the mic and try again, or import a take.'],
};
/* iPhone and iPad only give the mic to Safari on a real web address, never to an app's built-in preview. */
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function micHelp(kind = REC.err || 'blocked') {
  if (IOS && kind !== 'nomic') return ['On iPhone, only Safari can use the mic', 'iPhone gives the mic to web pages only in Safari, on a web address (https://…). Inside an app’s preview, like this one, it stays off whatever you allow. To record: open Tapehouse in Safari from a link, or record a voice memo and use Import a take.'];
  return MIC_ERR[kind] || MIC_ERR.failed;
}
function loadRecPrefs() {
  try {
    const r = JSON.parse(localStorage.getItem('th.rec') || 'null');
    if (r && typeof r === 'object') Object.assign(ui.rec, { metro: !!r.metro, countIn: r.countIn !== false, loopBars: [0, 2, 4, 8].includes(r.loopBars) ? r.loopBars : 0,
      latencyMs: clamp(+r.latencyMs || 0, -200, 200), monitor: !!r.monitor, deviceId: typeof r.deviceId === 'string' ? r.deviceId : '' });
  } catch (e) { /* defaults */ }
}
function saveRecPrefs() { try { localStorage.setItem('th.rec', JSON.stringify(ui.rec)); } catch (e) { /* ok */ } }
function toggleMetro() {
  ui.rec.metro = !ui.rec.metro; saveRecPrefs(); renderTransport(); refreshRecPanel();
  toast(ui.rec.metro ? 'Metronome on' : 'Metronome off', { ms: 1200 });
}
function metroClick(t, accent) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.08); o.onended = () => disc(o, g);
}
function pickRecordTrack() {
  const P = project, tr = P.playlist.tracks;
  const named = tr.findIndex(t => /vocal|voice|vox|rec|guitar/i.test(t.name)); if (named >= 0) return named;
  const empty = tr.findIndex((t, i) => !P.playlist.clips.some(c => c.track === i));
  return empty >= 0 ? empty : tr.length;
}
function freeInsertForTrack(P) {
  const used = new Set(P.channels.map(c => c.insert)); P.playlist.tracks.forEach(t => used.add(t.insert | 0));
  for (let i = 1; i < P.mixer.length; i++) if (!used.has(i) && !P.mixer[i].fx.length) return i;
  if (P.mixer.length < 64) { P.mixer.push({ id: uid(), name: `Insert ${P.mixer.length}`, vol: 0.8, pan: 0, mute: false, solo: false, fx: [] }); return P.mixer.length - 1; }
  return 0;
}
function ensureTrack(ti) {
  if (ti < project.playlist.tracks.length) return ti;
  mutate(P => { P.playlist.tracks.push(newTrack(P.playlist.tracks.length, 'Vocal')); }, { render: false });
  return project.playlist.tracks.length - 1;
}
/* Gives a track its own mixer insert (named after it), so it can carry a vocal chain. */
function giveTrackInsert(ti) {
  ti = ensureTrack(ti);
  if (!(project.playlist.tracks[ti].insert > 0)) {
    mutate(P => {
      const t = P.playlist.tracks[ti]; if (/^Track \d+$/.test(t.name)) t.name = 'Vocal';
      const i = freeInsertForTrack(P); t.insert = i;
      if (i > 0 && /^Insert \d+$/.test(P.mixer[i].name)) P.mixer[i].name = t.name.slice(0, 24);
    }, { render: false });
  }
  return ti;
}
function armTrack(ti, opts = {}) {
  if (REC.state === 'rec' || REC.state === 'count' || REC.state === 'saving') return;
  if (ti == null) { REC.armed = null; closeMic(); renderTransport(); if (ui.tab === 'playlist' || ui.tab === 'vocal') renderView(); return; }
  ti = giveTrackInsert(ti);
  REC.armed = ti;
  const ins = project.playlist.tracks[ti].insert | 0;
  if (ins > 0) { ui.vsIns = ins; if (/vocal|vox|voice/i.test(project.playlist.tracks[ti].name)) suiteAutoSound(ins); } // a new vocal track starts with your last sound
  void opts; renderView();
  renderTransport();
  openMic();
}
function openMic(force) {
  if (REC.stream && !force) return Promise.resolve(true);
  if (REC.pending && !force) return REC.pending;
  const pr = doOpenMic().finally(() => { if (REC.pending === pr) REC.pending = null; });
  REC.pending = pr; return pr;
}
async function doOpenMic() {
  if (!ensureCtx()) return false;
  if (usesDsp(project)) engine.loadDsp(); // so "Hear myself" runs Tune on the audio thread
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { REC.err = 'unsupported'; refreshRecPanel(); return false; }
  closeMic();
  REC.err = null; REC.opening = true; refreshRecPanel();
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (ui.rec.deviceId) audio.deviceId = { exact: ui.rec.deviceId };
  setAudioSession('play-and-record');
  try { REC.stream = await navigator.mediaDevices.getUserMedia({ audio }); }
  catch (e) {
    REC.opening = false; setAudioSession('playback');
    if (ui.rec.deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) { ui.rec.deviceId = ''; saveRecPrefs(); return doOpenMic(); }
    REC.err = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'blocked' : e.name === 'NotFoundError' ? 'nomic' : 'failed';
    REC.errMsg = e.message || e.name; refreshRecPanel(); return false;
  }
  REC.opening = false;
  if (REC.armed == null) { closeMic(); return false; }
  try {
    REC.src = ctx.createMediaStreamSource(REC.stream);
    REC.meter = ctx.createAnalyser(); REC.meter.fftSize = 1024; REC.mdata = new Float32Array(1024); REC.src.connect(REC.meter);
    await buildCapture();
  } catch (e) { REC.err = 'failed'; REC.errMsg = e.message; closeMic(); refreshRecPanel(); return false; }
  setMonitor(); listInputs(); refreshRecPanel();
  return true;
}
async function buildCapture() {
  REC.sink = ctx.createGain(); REC.sink.gain.value = 0; REC.sink.connect(ctx.destination);
  if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      if (!REC.workletReady) {
        const url = URL.createObjectURL(new Blob([REC_WORKLET], { type: 'text/javascript' }));
        try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        REC.workletReady = true;
      }
      const n = new AudioWorkletNode(ctx, 'th-rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      n.port.onmessage = e => { const m = e.data; if (m.done) { const w = REC.waiter; REC.waiter = null; if (w) w(); } else if (m.d) REC.chunks.push({ f: m.f, d: m.d }); };
      REC.src.connect(n); n.connect(REC.sink); REC.node = n; REC.mode = 'worklet'; return;
    } catch (e) { console.warn('Recorder worklet unavailable, using the fallback', e); }
  }
  const sp = ctx.createScriptProcessor(4096, 2, 1);
  sp.onaudioprocess = e => {
    if (!REC.capturing) return;
    const ib = e.inputBuffer, a = ib.getChannelData(0), b = ib.numberOfChannels > 1 ? ib.getChannelData(1) : null, o = new Float32Array(a.length);
    for (let k = 0; k < a.length; k++) o[k] = b ? (a[k] + b[k]) * 0.5 : a[k];
    REC.chunks.push({ f: Math.round(e.playbackTime * ctx.sampleRate) - ib.length, d: o });
  };
  REC.src.connect(sp); sp.connect(REC.sink); REC.node = sp; REC.mode = 'script';
}
function startCapture() { REC.chunks = []; REC.capturing = true; if (REC.mode === 'worklet' && REC.node) REC.node.port.postMessage('on'); }
function stopCapture() {
  REC.capturing = false;
  if (REC.mode !== 'worklet' || !REC.node) return Promise.resolve();
  return new Promise(res => { REC.waiter = res; REC.node.port.postMessage('off'); setTimeout(res, 500); });
}
// iPhone Safari only captures the mic while the page's audio session allows recording
function setAudioSession(type) { try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch (e) { /* not supported */ } }
function closeMic() {
  if (REC.stream) { REC.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* ok */ } }); setAudioSession('playback'); }
  if (REC.node && REC.node.port) REC.node.port.onmessage = null;
  disc(REC.src, REC.node, REC.sink, REC.meter, REC.mon);
  Object.assign(REC, { stream: null, src: null, node: null, sink: null, meter: null, mon: null, mode: null, level: 0 });
  if (engine) engine.setLowLatency(false);
}
/* "Hear myself": the mic runs through the armed track's effects (Tune and the rest) straight to the speakers/headphones,
   whether or not anything is playing or recording. */
function setMonitor() {
  if (REC.mon) { disc(REC.mon); REC.mon = null; }
  if (!engine) return;
  engine.onBuild = setMonitor;
  const tr = REC.armed != null && project.playlist.tracks[REC.armed];
  if (ui.rec.monitor && REC.src && tr) {
    REC.mon = ctx.createGain(); REC.src.connect(REC.mon);
    REC.mon.connect(engine.inserts[clamp(tr.insert | 0, 0, engine.inserts.length - 1)].input);
  }
  engine.setLowLatency(!!REC.mon);
}
function headphonesTip() { toast('Wear headphones. Through speakers the mic hears itself and howls.', { ms: 5000 }); }
function setHearMyself(on) {
  ui.rec.monitor = !!on; saveRecPrefs(); setMonitor(); renderTransport(); refreshRecPanel();
  if (on) headphonesTip();
}
function setInsertBypass(ins, off) { mutate(P => { P.mixer[ins].fx.forEach(f => { f.bypass = off; }); }); }
function lastTunedChain() { try { const v = localStorage.getItem('th.chain'); if (CHAINS[v] && CHAINS[v].artist) return v; } catch (e) { /* ok */ } return 'breezy'; }
/* One tap: arm a vocal track, open the mic and hear yourself through the tuned chain, without recording. */
async function goLive() {
  if (REC.mon) { setHearMyself(false); toast('Hear myself is off. The track stays armed for recording.', { ms: 2500 }); return; }
  if (!ensureCtx()) return;
  armTrack(REC.armed != null ? REC.armed : pickRecordTrack(), { stay: ui.tab === 'vocal' });
  if (!(await openMic())) return;
  const ins = project.playlist.tracks[REC.armed].insert | 0;
  if (ins > 0 && !project.mixer[ins].fx.length) await applyChain(lastTunedChain(), ins, { quiet: true });
  setHearMyself(true);
}
/* Songs saved with the first versions of the vocal presets get the rebuilt chains (those used the browser compressor,
   whose hidden makeup gain could clip). Matched by the old effect line-ups; anything hand-edited beyond that is left alone. */
const OLD_CHAINS = {
  'th.sweep-filter|th.eq3|th.glue-comp|th.tape-delay|th.room-reverb': 'clean',
  'th.sweep-filter|th.eq3|th.glue-comp|th.saturator|th.room-reverb': 'rap',
  'th.sweep-filter|th.eq3|th.glue-comp|th.chorus|th.tape-delay|th.room-reverb': 'dreamy',
  'th.sweep-filter|th.glue-comp|th.room-reverb': 'instrument',
  'th.autotune|th.vocal-eq|th.glue-comp|th.glue-comp|th.deesser|th.tape-delay|th.room-reverb': 'breezy',
  'th.autotune|th.vocal-eq|th.glue-comp|th.glue-comp|th.deesser|th.doubler|th.pingpong|th.room-reverb': 'bieber',
  'th.autotune|th.vocal-eq|th.glue-comp|th.glue-comp|th.deesser|th.saturator|th.doubler|th.tape-delay|th.room-reverb': 'laroi',
};
function upgradeChains(P) {
  for (const m of P.mixer) for (const f of m.fx) if (f.plugin === 'th.autotune' && +f.params.root === -2) f.params.root = -1; // old "Smart" = the song key now
  const vocalIns = new Set(P.playlist.tracks.map(t => t.insert | 0).filter(i => i > 0));
  P.mixer.forEach((m, i) => {
    if (!vocalIns.has(i) || !m.fx.length) return;
    const id = OLD_CHAINS[m.fx.map(f => f.plugin).join('|')];
    if (id && CHAINS[id]) m.fx = CHAINS[id].fx.map(([pl, params]) => fxSlot(pl, { ...params }));
  });
}
/* One control for how obvious the tuning is, applied to the Tune on a track while you sing. */
const TUNE_FEELS = [['natural', 'Natural', 35, 0.3, 0.3, 'on'], ['smooth', 'Smooth', 20, 0.15, 0.15, 'on'], ['autotune', 'Auto-Tune', 10, 0, 0, 'off'], ['hard', 'Hard', 4, 0, 0, 'off'], ['robot', 'Robot', 0, 0, 0, 'off']];
function tuneFeelOf(f) { const r = +((f.params || {}).retune ?? 20); let best = TUNE_FEELS[0], bd = 1e9; for (const t of TUNE_FEELS) { const d = Math.abs(t[2] - r); if (d < bd) { bd = d; best = t; } } return best[0]; }
function setTuneFeel(ins, id) {
  const t = TUNE_FEELS.find(x => x[0] === id); if (!t) return;
  mutate(P => { for (const f of P.mixer[ins].fx) if (f.plugin === 'th.autotune') Object.assign(f.params, { retune: t[2], humanize: t[3], flex: t[4], fcorr: t[5] }); });
}
/* Which preset is on an insert (matched by its effect line-up), for highlighting. */
function activeChain(ins) {
  const m = project.mixer[ins]; if (!m || !m.fx.length) return null;
  const sig = m.fx.map(f => f.plugin).join('|');
  const hit = Object.entries(CHAINS).find(([, c]) => c.fx.map(([pl]) => pl).join('|') === sig);
  return hit ? hit[0] : null;
}
function monitorDelayMs(ins) {
  const e = engine && engine.inserts[ins]; if (!e || !ctx) return null;
  let tr = 0; try { const st = REC.stream && REC.stream.getAudioTracks()[0].getSettings(); tr = st && Number.isFinite(st.latency) ? st.latency : 0; } catch (err) { /* ok */ }
  return Math.round(((e.latency || 0) + (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + tr) * 1000);
}
async function listInputs() {
  try { const ds = await navigator.mediaDevices.enumerateDevices(); REC.devices = ds.filter(d => d.kind === 'audioinput'); refreshRecPanel(); } catch (e) { /* ok */ }
}
/* The one Record action (the button at the top, R, and the big button on the Vocal screen): records onto the armed track,
   or your vocal track (made with your last sound if there isn't one), from whatever screen you're on. */
function recordToggle() {
  if (REC.state === 'rec' || REC.state === 'count') { halt(); return; }
  if (REC.state === 'saving') return;
  suiteRecord();
}
async function startRecording() {
  if (REC.armed == null) armTrack(pickRecordTrack());
  if (!(await openMic())) {
    const go = ui.tab === 'vocal' ? undefined : { label: 'Open Vocal', run: () => setTab('vocal') };
    toast(REC.err === 'blocked' ? (STANDALONE ? 'The browser blocked your mic. The Vocal screen shows how to allow it.' : 'claude.ai can’t pass your mic to apps. The Vocal screen has the recording edition and Import a take.') : 'No mic input is available. The Vocal screen shows what to check.', { kind: 'error', action: go, ms: 7000 });
    return;
  }
  if (T.playing) halt();
  if (T.mode !== 'song') T.mode = 'song';
  if (ui.ab === 'B') { ui.ab = 'A'; applyAB(); }
  const P = project, beat = 60 / P.bpm, start = T.songPos;
  REC.startStep = start;
  REC.loop = ui.rec.loopBars ? { from: start, to: start + ui.rec.loopBars * 16 } : null;
  T.loop = REC.loop;
  const same = P.playlist.clips.find(c => c.kind === 'audio' && c.track === REC.armed && c.start === start);
  REC.mergeInto = same ? same.id : null;
  engine.skipClips = same ? new Set([same.id]) : null;
  const lead = ui.rec.countIn ? 4 * beat : 0;
  REC.state = lead ? 'count' : 'rec'; REC.songStart = Infinity;
  renderTransport(); refreshRecPanel();
  await play({ lead, onStart: (t0, songStart) => {
    REC.songStart = songStart; startCapture();
    if (lead) for (let k = 0; k < 4; k++) metroClick(t0 + k * beat, k === 0);
  } });
}
async function stopRecording() {
  if (REC.state !== 'rec' && REC.state !== 'count') return;
  const stopAt = REC.stopAt || (ctx ? ctx.currentTime : 0); REC.stopAt = 0;
  REC.state = 'saving'; renderTransport(); refreshRecPanel();
  await stopCapture();
  T.loop = null; if (engine) engine.skipClips = null;
  if (T.playing) halt();
  T.songPos = REC.startStep;
  try { await saveTakes(stopAt); } catch (e) { toast(`Couldn’t save the recording: ${e.message}`, { kind: 'error' }); }
  REC.state = 'idle'; REC.chunks = [];
  renderTransport(); if (ui.tab === 'playlist' || ui.tab === 'vocal') renderView();
}
async function saveTakes(stopAt) {
  const sr = ctx.sampleRate, P = project, sd = 60 / P.bpm / 4;
  const chunks = REC.chunks.filter(c => c && c.d && c.d.length);
  if (!chunks.length || !(stopAt > REC.songStart + 0.3)) { toast('Stopped before the recording started, so nothing was kept.'); return; }
  let f0 = Infinity, f1 = 0; for (const c of chunks) { f0 = Math.min(f0, c.f); f1 = Math.max(f1, c.f + c.d.length); }
  const all = new Float32Array(Math.max(1, Math.min(f1 - f0, sr * 60 * 30)));
  for (const c of chunks) { const o = c.f - f0; if (o >= 0 && o < all.length) all.set(c.d.subarray(0, Math.min(c.d.length, all.length - o)), o); }
  const tk = REC.stream && REC.stream.getAudioTracks()[0], st = tk && tk.getSettings ? tk.getSettings() : {};
  const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + (Number.isFinite(st.latency) ? st.latency : 0) + ui.rec.latencyMs / 1000;
  const a0 = Math.round((REC.songStart + lat) * sr) - f0, aEnd = Math.round((stopAt + lat) * sr) - f0;
  const slice = (a, b) => { const out = new Float32Array(Math.max(1, b - a)), s = Math.max(0, a), e = Math.min(all.length, b); if (e > s) out.set(all.subarray(s, e), s - a); return out; };
  const takes = [];
  if (REC.loop) {
    const pass = Math.round((REC.loop.to - REC.loop.from) * sd * sr);
    for (let k = 0; k < 200; k++) { const a = a0 + k * pass; if (a >= aEnd) break; if (a + pass > aEnd && aEnd - a < pass * 0.5 && takes.length) break; takes.push(slice(a, a + pass)); }
  } else takes.push(slice(a0, aEnd));
  if (!takes.length) { toast('Nothing was recorded.'); return; }
  let peak = 0; for (const t of takes) for (let i = 0; i < t.length; i += 4) { const v = Math.abs(t[i]); if (v > peak) peak = v; }
  const ti = clamp(REC.armed ?? 0, 0, P.playlist.tracks.length - 1), tr = P.playlist.tracks[ti];
  const merge = REC.mergeInto ? P.playlist.clips.find(c => c.id === REC.mergeInto) : null, n0 = merge ? (merge.takes ? merge.takes.length : 1) : 0;
  const ids = [];
  for (let k = 0; k < takes.length; k++) ids.push((await storeRecording(`${tr.name} take ${n0 + k + 1}`, takes[k], sr)).id);
  const len = REC.loop ? REC.loop.to - REC.loop.from : Math.max(1, Math.ceil(takes[0].length / sr / sd));
  placeTakes(ids, ti, REC.startStep, len, merge);
  renderLib(); afterTake(ui.plSel, ti);
  if (peak < 0.003) toast('The recording came out silent. Check the input and that your mic is turned up.', { kind: 'error', ms: 8000 });
  else toast(takes.length > 1 ? `Recorded ${takes.length} takes. Flip through them under the clip and keep the best.` : 'Recorded. Press play to hear it back.', { ms: 5000 });
}
async function storeRecording(name, data, sr) {
  const id = uid(), buf = new AudioBuffer({ length: Math.max(1, data.length), numberOfChannels: 1, sampleRate: sr });
  buf.copyToChannel(data, 0);
  const wav = encodeWav(buf);
  const meta = { id, name: name.slice(0, 80), ext: 'wav', folder: 'Recordings', size: wav.byteLength, duration: buf.duration, channels: 1, peaks: computePeaks(buf, 120), addedAt: Date.now() };
  await Store.put('sampleData', { id, data: wav }); await Store.put('samples', meta);
  lib.set(id, meta); buffers.set(id, buf);
  return meta;
}
function placeTakes(ids, ti, start, len, merge) {
  mutate(P => {
    let c = merge && P.playlist.clips.find(x => x.id === merge.id);
    if (c) { const tk = c.takes ? c.takes.slice() : [c.ref]; tk.push(...ids); c.takes = tk; c.ref = ids[ids.length - 1]; c.len = Math.max(c.len, len); c.offset = 0; }
    else { c = { id: uid(), kind: 'audio', ref: ids[ids.length - 1], track: ti, start, len, gain: 1, offset: 0 }; if (ids.length > 1) c.takes = ids.slice(); P.playlist.clips.push(c); }
    ui.plSel = c.id; ui.plMark = null; ui.autoSel = null;
  });
}
function importTake() {
  const fi = el('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.webm,.caf' });
  fi.addEventListener('change', async () => {
    const f = fi.files && fi.files[0]; if (!f) return;
    const was = ui.importFolder; ui.importFolder = 'Recordings';
    let res; try { res = await importFiles([f]); } finally { ui.importFolder = was; }
    const s = res && res.audio && res.audio[0]; if (!s) return;
    const ti = ensureTrack(REC.armed != null ? REC.armed : pickRecordTrack()), start = T.songPos, sd = 60 / project.bpm / 4;
    const merge = project.playlist.clips.find(c => c.kind === 'audio' && c.track === ti && c.start === start);
    placeTakes([s.id], ti, start, Math.max(1, Math.ceil(s.duration / sd)), merge);
    if (ui.tab !== 'playlist' && ui.tab !== 'vocal') setTab('playlist'); else renderView();
    afterTake(ui.plSel, ti);
    toast(`Placed “${s.name}” on ${project.playlist.tracks[ti].name} at bar ${Math.floor(start / 16) + 1}.`);
  });
  fi.click();
}
async function applyChain(id, ins, opts = {}) {
  const c = CHAINS[id]; if (!c) return;
  if (c.artist) try { localStorage.setItem('th.chain', id); } catch (e) { /* ok */ }
  if (!(ins > 0)) { toast('Arm a track first, so the chain has its own mixer insert.'); return; }
  const tuned = c.fx.some(([pl]) => pl === 'th.autotune');
  if (c.fx.some(([pl]) => pluginUsesDsp(pl)) && ensureCtx()) await engine.loadDsp();
  mutate(P => { P.mixer[ins].fx = c.fx.map(([pl, params]) => fxSlot(pl, { ...params })); });
  if (opts.quiet) return;
  toast(tuned ? `${c.label} is on ${project.mixer[ins].name}. Tune follows the song key, ${keyLabel(project)}.` : `${c.label} is on ${project.mixer[ins].name}.`, { action: { label: 'Undo', run: undo } });
}
function takesControl(c) {
  const n = c.takes.length, k = Math.max(0, c.takes.indexOf(c.ref));
  const pick = j => mutate(() => { c.ref = c.takes[(j + n) % n]; getBuffer(c.ref).catch(() => {}); });
  return el('span', { class: 'takes' },
    el('span', { class: 'lbl' }, 'Take'),
    el('button', { class: 'btn sm icon', 'aria-label': 'Previous take', onclick: () => pick(k - 1) }, icon('left')),
    el('span', { class: 'take-n' }, `${k + 1} of ${n}`),
    el('button', { class: 'btn sm icon', 'aria-label': 'Next take', onclick: () => pick(k + 1) }, icon('right')),
    el('button', { class: 'btn sm', title: 'Drop the other takes from this clip. They stay in your library under Recordings.', onclick: () => mutate(() => { delete c.takes; }) }, 'Keep this take'));
}
function refreshRecPanel() {
  if (ui.tab === 'vocal') suiteRefreshSoft();
  else if (ui.tab === 'playlist') { const old = document.getElementById('armBar'); if (old) old.replaceWith(armBar()); }
}
/* Song screen: a slim line for the armed track. Everything about recording is one tap away on the Vocal screen. */
function armBar() {
  const tr = project.playlist.tracks[REC.armed];
  if (!tr) return el('div', { id: 'armBar', hidden: true });
  const recording = REC.state === 'rec' || REC.state === 'count';
  const status = REC.state === 'saving' ? 'Saving the take…' : REC.state === 'count' ? 'Count-in…' : REC.state === 'rec' ? 'Recording' : REC.opening ? 'Asking for your mic…' : REC.err ? 'No mic' : REC.stream ? 'Mic ready' : 'Mic off';
  return el('div', { class: 'arm-bar' + (recording ? ' live' : ''), id: 'armBar', role: 'status' },
    el('i', { class: 'dot', 'aria-hidden': 'true' }),
    el('span', {}, el('b', {}, tr.name), ` is armed · ${status}. `, recording ? 'Press Stop (or R) to finish.' : 'Press Record at the top (or R) to record over the song.'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn sm primary', onclick: () => setTab('vocal') }, icon('mic'), 'Sound, takes & mic'),
    el('button', { class: 'btn sm ghost', disabled: recording, onclick: () => armTrack(null) }, 'Disarm'));
}

/* ---------- reference playback ---------- */
function startReference(t) {
  if (!engine) return;
  const id = project.reference && project.reference.id, buf = id && buffers.get(id);
  if (!buf) { engine.setAB(false); if (id) getBuffer(id).catch(() => {}); return; }
  engine.startRef(buf, ui.refPos || 0, t); applyAB();
}
function stopReference() { if (!engine) return; const pos = engine.stopRef(); if (pos != null) ui.refPos = pos; }
function refGain() {
  const R = ui.refInfo; if (!R || !Number.isFinite(R.lufs) || !Number.isFinite(ui.mixLufs)) return -6;
  const headroom = R.peak > 0 ? -20 * Math.log10(R.peak) - 0.3 : 12; // never push the reference past full scale
  return clamp(ui.mixLufs - R.lufs, -24, Math.max(0, Math.min(12, headroom)));
}
function applyAB() { if (engine) engine.setAB(ui.ab === 'B' && !!project.reference, refGain()); }
function setAB(which) {
  ui.ab = which; applyAB(); refreshMasterCard();
  if (which === 'B' && !T.playing) toast('Press play to hear the reference. Flip back to A any time.', { ms: 3000 });
}

/* ---------- studio frame hook ---------- */
let studioTick = 0;
function studioFrame() {
  studioTick++;
  if (REC.state === 'count' && ctx) {
    if (ctx.currentTime >= REC.songStart) { REC.state = 'rec'; renderTransport(); refreshRecPanel(); }
    else if (Number.isFinite(REC.songStart)) $('#timeDisp').textContent = 'Count ' + Math.max(1, Math.ceil((REC.songStart - ctx.currentTime) / (60 / project.bpm)));
  }
  if (REC.meter) {
    REC.meter.getFloatTimeDomainData(REC.mdata);
    let pk = 0, sq = 0; for (let i = 0; i < REC.mdata.length; i++) { const a = Math.abs(REC.mdata[i]); if (a > pk) pk = a; sq += a * a; }
    const now = performance.now();
    if (pk > 0.97) { // the raw mic signal is at full scale: clipping in the mic/interface itself
      if (now - (REC.lastClip || 0) > 250) { REC.clipCount = (REC.clipCount || 0) + 1; REC.lastClip = now; if (REC.clipCount === 3) refreshRecPanel(); }
      REC.clipUntil = now + 1800;
    }
    // feedback guard: speakers feeding the mic make a loud, steady tone; singing goes up and down
    if (REC.mon) {
      const dbv = 10 * Math.log10(sq / REC.mdata.length + 1e-12), H = REC.fbHist || (REC.fbHist = []);
      H.push([now, dbv]); while (H.length && now - H[0][0] > 1500) H.shift();
      if (H.length >= 40 && now - H[0][0] > 1400) { // a howl is very loud and almost perfectly steady for 1.5 s; a held sung note still wobbles
        const v = H.map(h => h[1]), mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
        if (mean > -12 && sd < 0.6) { REC.fbHist = []; setHearMyself(false); toast('Feedback: your speakers were feeding back into the mic, so Hear myself is off. Use headphones.', { kind: 'error', ms: 7000 }); }
      }
    } else if (REC.fbHist) REC.fbHist = null;
    const f = document.getElementById('inFill');
    if (f) {
      REC.level = Math.max(clamp((20 * Math.log10(pk + 1e-9) + 54) / 54, 0, 1), REC.level - 0.02);
      f.style.width = (REC.level * 100).toFixed(1) + '%';
      const cl = document.getElementById('inClip'); if (cl) cl.hidden = !(REC.clipUntil > now);
    }
  }
  if (studioTick % 6 === 0 && engine && engine.master && engine.master.on) {
    const g = document.getElementById('limGR');
    if (g) { const r = engine.master.lim.reduction || 0; g.textContent = `Limiter ${r < -0.05 ? '−' + Math.abs(r).toFixed(1) : '0.0'} dB`; g.classList.toggle('hot', r < -3); }
  }
}

/* ---------- automation lanes ---------- */
const AUTO_H = 56;
function laneGeom(info) {
  const toN = v => info.log ? Math.log(Math.max(v, info.min) / info.min) / Math.log(info.max / info.min) : (v - info.min) / (info.max - info.min);
  const fromN = n => { n = clamp(n, 0, 1); return info.log ? info.min * Math.pow(info.max / info.min, n) : info.min + n * (info.max - info.min); };
  return { toN, fromN };
}
function automationRows(grid, laneW, stepW) {
  const P = project, lanes = autos(P);
  grid.append(el('div', { class: 'pl-row au-title' },
    el('div', { class: 'pl-thead' }, el('span', { class: 'lbl' }, 'Automation'), el('span', { class: 'spacer' }), el('button', { class: 'btn sm ghost', onclick: openAutoPicker, title: 'Add an automation lane' }, '+ Add')),
    el('div', { class: 'au-lane au-empty', style: { width: laneW + 'px' } }, lanes.length ? null : el('span', { class: 'hint' }, 'Fades, filter sweeps and effect moves over time. Press + Add, or Automate up top for one-tap build-ups and fades.'))));
  for (const lane of lanes) {
    const info = autoInfo(P, lane.target);
    const cv = el('canvas', { class: 'au-cv', 'aria-label': info ? `${info.who} ${info.what} automation` : 'Automation lane' });
    grid.append(el('div', { class: 'pl-row au-row' + (ui.autoSel === lane.id ? ' sel' : '') + (lane.off ? ' off' : '') + (info ? '' : ' missing'), 'data-lane': lane.id },
      el('div', { class: 'pl-thead au-head', onclick: e => { if (!e.target.closest('button')) selectLane(lane.id); } },
        el('button', { class: 'led' + (lane.off ? '' : ' on'), 'aria-label': (lane.off ? 'Turn on' : 'Turn off') + ' this automation', onclick: () => mutate(() => { lane.off = !lane.off; }) }),
        el('div', { class: 'au-name', title: info ? `${info.who} · ${info.what}` : '' }, el('b', {}, info ? info.what : 'Missing'), el('span', {}, info ? info.who : 'Its effect or sound was removed')),
        el('button', { class: 'btn sm icon ghost', 'aria-label': 'Delete this automation lane', onclick: () => mutate(P2 => { P2.automation = autos(P2).filter(l => l.id !== lane.id); if (ui.autoSel === lane.id) ui.autoSel = null; }) }, icon('x'))),
      el('div', { class: 'au-lane', style: { width: laneW + 'px' } }, cv)));
    if (info) bindLane(cv, lane, info, laneW, stepW);
  }
}
function selectLane(id) { ui.autoSel = id; ui.plSel = null; ui.plMark = null; renderView(); }
function drawLane(cv, lane, info, laneW, stepW, hot, readout) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.min(laneW, 16000), h = AUTO_H;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const { toN } = laneGeom(info), pad = 7, y = v => pad + (1 - clamp(toN(v), 0, 1)) * (h - pad * 2);
  const col = info.color ? soundColor(info.color) : (COLOR.accent || '#e2b36b');
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.setLineDash([3, 4]);
  g.beginPath(); g.moveTo(0, Math.round(y(info.value)) + 0.5); g.lineTo(w, Math.round(y(info.value)) + 0.5); g.stroke(); g.setLineDash([]);
  const pts = lane.points; if (!pts.length) return;
  const xy = [];
  if (info.log) for (let x = 0; x <= w; x += 2) xy.push([x, y(autoValueAt(pts, x / stepW, true))]);
  else { xy.push([0, y(pts[0].v)]); for (const p of pts) xy.push([p.s * stepW, y(p.v)]); xy.push([w, y(pts[pts.length - 1].v)]); }
  g.beginPath(); xy.forEach(([x, yy], i) => i ? g.lineTo(x, yy) : g.moveTo(x, yy));
  g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.globalAlpha = 0.16; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
  g.beginPath(); xy.forEach(([x, yy], i) => i ? g.lineTo(x, yy) : g.moveTo(x, yy));
  g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  pts.forEach((p, i) => {
    const x = p.s * stepW, yy = y(p.v); if (x > w + 6) return;
    g.beginPath(); g.arc(x, yy, i === hot ? 5.5 : 4, 0, Math.PI * 2); g.fillStyle = col; g.fill();
    g.lineWidth = 2; g.strokeStyle = COLOR.well || '#0f1013'; g.stroke();
  });
  if (readout && hot >= 0 && pts[hot]) {
    const p = pts[hot], x = p.s * stepW, txt = `${info.fmt(p.v)} · bar ${fmtPos(Math.floor(p.s))}`;
    g.font = `500 11px ${COLOR['font-mono'] || 'monospace'}`; const tw = g.measureText(txt).width + 12;
    const bx = clamp(x + 10, 2, w - tw - 2), by = y(p.v) < h / 2 ? h - 21 : 3;
    g.fillStyle = 'rgba(9,10,12,.9)'; g.fillRect(bx, by, tw, 18); g.fillStyle = COLOR.text || '#ece6da'; g.fillText(txt, bx + 6, by + 13);
  }
}
function bindLane(cv, lane, info, laneW, stepW) {
  const { toN, fromN } = laneGeom(info), pad = 7, h = AUTO_H;
  const snap = () => ui.plSnap >= 16 ? 4 : ui.plSnap;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const valAt = yy => clamp(fromN(1 - (yy - pad) / (h - pad * 2)), info.min, info.max);
  const hit = p => lane.points.findIndex(q => Math.hypot(q.s * stepW - p.x, pad + (1 - toN(q.v)) * (h - pad * 2) - p.y) < 10);
  const draw = (i, ro) => drawLane(cv, lane, info, laneW, stepW, i, ro);
  let drag = null;
  draw(-1);
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = pos(e); let i = hit(p);
    pushUndo();
    if (i < 0) {
      const s = Math.max(0, Math.round(p.x / stepW / snap()) * snap()), pt = { s, v: valAt(p.y) };
      const same = lane.points.findIndex(q => q.s === s); if (same >= 0) lane.points.splice(same, 1);
      lane.points.push(pt); lane.points.sort((a, b) => a.s - b.s); i = lane.points.indexOf(pt);
      drag = { pt, added: true, moved: false };
    } else drag = { pt: lane.points[i], added: false, moved: false };
    drag.wasSel = ui.autoSel === lane.id;
    ui.autoSel = lane.id; ui.plSel = null; ui.plMark = null;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    draw(i, true);
  });
  cv.addEventListener('pointermove', e => {
    const p = pos(e);
    if (!drag) { cv.style.cursor = hit(p) >= 0 ? 'grab' : 'crosshair'; return; }
    const pts = lane.points, i = pts.indexOf(drag.pt), prev = pts[i - 1], next = pts[i + 1];
    let s = Math.max(0, Math.round(p.x / stepW / snap()) * snap());
    if (prev) s = Math.max(s, prev.s); if (next) s = Math.min(s, next.s);
    drag.pt.s = s; drag.pt.v = valAt(p.y); drag.moved = true;
    draw(i, true);
  });
  const end = () => {
    if (!drag) return; const d = drag; drag = null;
    if (!d.added && !d.moved) { hist.undo.pop(); updateUndo(); } else changed({ render: false });
    if (!d.wasSel) renderView(); else { draw(-1); const ins = document.getElementById('autoInsp'); if (ins) ins.replaceWith(autoInspector(lane)); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const del = e => { e.preventDefault(); const i = hit(pos(e)); if (i < 0) return; mutate(() => { lane.points.splice(i, 1); }, { render: false }); draw(-1); };
  cv.addEventListener('contextmenu', del); cv.addEventListener('dblclick', del);
}
const SHAPES = [['in', 'Fade in', 'Sweep in', 'From the far end back to the knob value'], ['out', 'Fade out', 'Sweep out', 'From the knob value out to the far end'],
  ['dip', 'Dip', 'Dip', 'Away and back'], ['pulse', 'Pump', 'Wobble', 'Moves on every beat, like sidechain pumping']];
function applyShape(lane, info, id, a, len) {
  const { toN, fromN } = laneGeom(info), b = a + len, end = songLength(project) + 64;
  const k = clamp(toN(info.value), 0, 1), far = info.vol ? 0 : (k < 0.5 ? 1 : 0), V = n => clamp(fromN(n), info.min, info.max), mixN = t => k + (far - k) * t;
  const old = s => lane.points.length ? autoValueAt(lane.points, s, info.log) : info.value;
  const before = old(a), after = old(b);
  let pts = [];
  if (id === 'in') pts = [[a, V(far)], [b, V(k)]];
  else if (id === 'out') pts = [[a, V(k)], [b, V(far)]];
  else if (id === 'dip') pts = [[a, V(k)], [a + len * 0.3, V(mixN(0.85))], [a + len * 0.7, V(mixN(0.85))], [b, V(k)]];
  else if (id === 'pulse') { for (let s = a; s < b; s += 4) pts.push([s, V(mixN(0.7))], [Math.min(b, s + 3.5), V(k)]); }
  mutate(() => {
    const keep = lane.points.filter(p => p.s < a - 0.02 || p.s > b + 0.02), add = pts.map(([s, v]) => ({ s, v }));
    if (id !== 'clear') {
      if (a > 0) add.unshift({ s: a - 0.01, v: before });
      if (b < end) add.push({ s: b + 0.01, v: id === 'out' && !keep.some(p => p.s > b) && b >= songLength(project) - 1 ? V(far) : after });
    }
    lane.points = keep.concat(add).sort((x, y) => x.s - y.s);
    ui.autoSel = lane.id;
  });
}
function autoInspector(lane) {
  const P = project, info = autoInfo(P, lane.target);
  const box = el('div', { class: 'pl-insp au-insp', id: 'autoInsp' });
  const close = el('button', { class: 'btn sm icon ghost', 'aria-label': 'Close automation details', onclick: () => { ui.autoSel = null; renderView(); } }, icon('x'));
  if (!info) { box.append(el('strong', {}, 'This lane lost its target'), el('span', { class: 'muted small' }, 'The effect or sound it controlled was removed.'), el('button', { class: 'btn sm danger', onclick: () => mutate(P2 => { P2.automation = autos(P2).filter(l => l.id !== lane.id); ui.autoSel = null; }) }, 'Delete lane'), close); return box; }
  const from = ui.autoFrom != null ? ui.autoFrom : Math.floor(T.songPos / 16) + 1;
  box.append(
    el('strong', {}, `${info.who} · ${info.what}`),
    el('span', { class: 'pos' }, lane.points.length ? `${lane.points.length} point${lane.points.length > 1 ? 's' : ''} · double-click a point to delete it` : 'Tap the lane to add points, drag them to shape the move'),
    el('div', { class: 'btn-row' },
      el('span', { class: 'lbl' }, 'Shape'),
      el('label', { class: 'field' }, el('span', { class: 'muted small' }, 'from bar'), el('input', { type: 'number', min: '1', max: '999', value: String(from), 'aria-label': 'Shape starts at bar', style: { width: '62px' }, onchange: e => { ui.autoFrom = clamp(Math.round(+e.target.value) || 1, 1, 999); } })),
      el('div', { class: 'seg', role: 'group', 'aria-label': 'Shape length' }, [1, 2, 4, 8].map(n => el('button', { 'aria-pressed': String(ui.autoBars === n), onclick: () => { ui.autoBars = n; const ins = document.getElementById('autoInsp'); if (ins) ins.replaceWith(autoInspector(lane)); } }, `${n} bar${n > 1 ? 's' : ''}`))),
      SHAPES.map(([id, volLabel, label, title]) => el('button', { class: 'btn sm', title, onclick: () => applyShape(lane, info, id, (from - 1) * 16, ui.autoBars * 16) }, info.vol ? volLabel : label)),
      el('button', { class: 'btn sm ghost', onclick: () => applyShape(lane, info, 'clear', (from - 1) * 16, ui.autoBars * 16) }, 'Clear range'),
      confirmBtn('Clear all', () => mutate(() => { lane.points = []; }), { cls: 'btn sm ghost', confirm: 'Clear every point?' }),
      close));
  return box;
}
function addLane(t) {
  const k = autoKey(t), have = autos(project).find(l => autoKey(l.target) === k);
  if (have) { ui.autoSel = have.id; ui.plSel = null; ui.plMark = null; setTab('playlist'); return; }
  mutate(P => { const lane = { id: uid(), target: t, points: [], off: false }; autos(P).push(lane); ui.autoSel = lane.id; ui.plSel = null; ui.plMark = null; });
  setTab('playlist');
  toast('Tap the lane to add points and drag them to shape it, or use a shape below.', { ms: 5000 });
}
function openAutoPicker() {
  const P = project, have = new Set(autos(P).map(l => autoKey(l.target)));
  const item = (t, label, sub) => el('button', { class: 'au-pick' + (have.has(autoKey(t)) ? ' on' : ''), onclick: () => { closeSheet(); addLane(t); } }, el('b', {}, label), sub ? el('span', {}, sub) : null);
  const quick = (title, text, run) => el('button', { class: 'au-q', onclick: () => { closeSheet(); run(); } }, el('b', {}, title), el('span', {}, text));
  const fxItems = [];
  P.mixer.forEach((m, i) => m.fx.forEach(f => {
    const pl = getPlugin(f.plugin); if (!pl) return;
    for (const d of pl.manifest.params) if (!d.options && !(pl.id === 'th.room-reverb' && d.id === 'size')) fxItems.push(item({ kind: 'fx', i, fx: f.id, param: d.id }, `${pl.manifest.name} · ${d.label}`, i === 0 ? 'Master' : m.name));
  }));
  const trackIns = [...new Set(P.playlist.tracks.filter((t, ti) => t.insert > 0 && P.playlist.clips.some(c => c.kind === 'audio' && c.track === ti)).map(t => t.insert))];
  openSheet([
    sheetHead('Automate'),
    el('section', {}, el('h3', {}, 'Quick moves'), el('div', { class: 'au-quick' },
      quick('Build-ups into each chorus', 'A filter sweeps up over the 4 bars before every chorus, then the chorus drops in full.', recipeBuildups),
      quick('Silence before each chorus', 'Cuts everything on the last beat before the chorus, so it hits harder.', recipeGap),
      quick('Fade in the start', 'The song rises out of silence over the first 4 bars.', recipeFadeIn),
      quick('Fade out the end', 'The song falls away to silence over the last 8 bars.', recipeFadeOut))),
    el('section', {}, el('h3', {}, 'Or automate anything'),
      el('div', { class: 'au-group' }, el('span', { class: 'lbl' }, 'Master'), el('div', { class: 'au-items' }, item({ kind: 'out' }, 'Fade', 'After mastering'), item({ kind: 'mix', i: 0, param: 'pan' }, 'Pan', 'Whole song'))),
      P.channels.length ? el('div', { class: 'au-group' }, el('span', { class: 'lbl' }, 'Sounds'), el('div', { class: 'au-items' }, P.channels.flatMap(ch => [item({ kind: 'ch', ch: ch.id, param: 'vol' }, `${ch.name} volume`), item({ kind: 'ch', ch: ch.id, param: 'pan' }, `${ch.name} pan`)]))) : null,
      trackIns.length ? el('div', { class: 'au-group' }, el('span', { class: 'lbl' }, 'Recorded tracks'), el('div', { class: 'au-items' }, trackIns.flatMap(i => [item({ kind: 'mix', i, param: 'vol' }, `${P.mixer[i].name} volume`), item({ kind: 'mix', i, param: 'pan' }, `${P.mixer[i].name} pan`)]))) : null,
      el('div', { class: 'au-group' }, el('span', { class: 'lbl' }, 'Effects'), fxItems.length ? el('div', { class: 'au-items' }, fxItems) : el('p', { class: 'hint', style: { margin: 0 } }, 'No effects in the mixer yet. Add a Sweep Filter, reverb or delay in Mix, and every knob on it can move over time.')))
  ], 'au-sheet');
}
function chorusStarts(P) {
  const mk = P.playlist.markers || [];
  let c = mk.filter(m => /chorus|drop|hook/i.test(m.name)).map(m => m.start);
  if (!c.length) c = mk.filter(m => m.start >= 32).map(m => m.start);
  return [...new Set(c.filter(s => s >= 16))];
}
function laneFor(P, t) {
  const k = autoKey(t); let lane = autos(P).find(l => autoKey(l.target) === k);
  if (!lane) { lane = { id: uid(), target: t, points: [], off: false }; P.automation.push(lane); }
  lane.off = false; return lane;
}
const clearRanges = (pts, ranges) => pts.filter(p => !ranges.some(([a, b]) => p.s >= a - 0.02 && p.s <= b + 0.02));
function recipeBuildups() {
  const cs = chorusStarts(project);
  if (!cs.length) { toast('Mark your sections first (Arrange for me does it), then try again.', { kind: 'error' }); return; }
  mutate(P => {
    const m = P.mixer[0]; let f = m.fx.find(x => x.plugin === 'th.sweep-filter' && (x.params || {}).mode === 'highpass');
    if (!f) { f = fxSlot('th.sweep-filter', { mode: 'highpass', cutoff: 30, res: 1 }); m.fx.push(f); }
    const lane = laneFor(P, { kind: 'fx', i: 0, fx: f.id, param: 'cutoff' }), base = f.params.cutoff ?? 30;
    const pts = clearRanges(lane.points, cs.map(c => [Math.max(0, c - 64), c]));
    for (const c of cs) pts.push({ s: Math.max(0, c - 64), v: base }, { s: c - 0.01, v: 2400 }, { s: c, v: base });
    lane.points = pts.sort((a, b) => a.s - b.s); ui.autoSel = lane.id;
  });
  setTab('playlist'); toast(`Build-ups added before ${cs.length} chorus${cs.length > 1 ? 'es' : ''}. Press play in Song mode to hear them.`, { ms: 5000 });
}
function recipeGap() {
  const cs = chorusStarts(project);
  if (!cs.length) { toast('Mark your sections first (Arrange for me does it), then try again.', { kind: 'error' }); return; }
  mutate(P => {
    const lane = laneFor(P, { kind: 'out' }), pts = clearRanges(lane.points, cs.map(c => [c - 4, c]));
    for (const c of cs) { const v0 = lane.points.length ? autoValueAt(lane.points, c - 4, false) : 1; pts.push({ s: c - 4.01, v: v0 }, { s: c - 4, v: 0 }, { s: c - 0.01, v: 0 }, { s: c, v: 1 }); }
    lane.points = pts.sort((a, b) => a.s - b.s); ui.autoSel = lane.id;
  });
  setTab('playlist'); toast(`A beat of silence now lands before ${cs.length} chorus${cs.length > 1 ? 'es' : ''}.`);
}
function recipeFadeIn() {
  mutate(P => { const lane = laneFor(P, { kind: 'out' }); lane.points = clearRanges(lane.points, [[0, 64]]).concat([{ s: 0, v: 0 }, { s: 64, v: 1 }]).sort((a, b) => a.s - b.s); ui.autoSel = lane.id; });
  setTab('playlist'); toast('The first 4 bars now fade in.');
}
function recipeFadeOut() {
  const end = songLength(project), a = Math.max(0, end - 128);
  mutate(P => { const lane = laneFor(P, { kind: 'out' }); lane.points = clearRanges(lane.points, [[a, end]]).concat([{ s: a, v: 1 }, { s: end, v: 0 }]).sort((x, y) => x.s - y.s); ui.autoSel = lane.id; });
  setTab('playlist'); toast('The last 8 bars now fade out.');
}

/* ---------- mastering ---------- */
const withMaster = (P, patch) => { const Q = JSON.parse(JSON.stringify(P)); Q.master = { ...(Q.master || defaultMaster()), ...patch }; return Q; };
async function measureMix(Q, what, sr = 22050) {
  const { buffer, frames } = await renderOffline(Q, what, sr);
  let peak = 0; for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < frames; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  const lufs = gatedLoudness(await filterPass(buffer, frames, K_CHAIN));
  return { lufs, peak, peakDb: 20 * Math.log10(peak + 1e-9) };
}
const songOrPattern = () => project.playlist.clips.length ? 'song' : 'pattern';
function refreshMasterCard() { const old = document.getElementById('masterCard'); if (old) old.replaceWith(masterCard()); }
async function autoMaster(id) {
  if (ui.masterBusy) return;
  if (!project.master) project.master = defaultMaster();
  if (id === 'off') { mutate(P => { P.master.on = false; }); ui.masterInfo = null; return; }
  const pr = MASTER_PRESETS[id] || MASTER_PRESETS.streaming;
  mutate(P => { Object.assign(P.master, { on: true, preset: MASTER_PRESETS[id] ? id : 'streaming', glue: pr.glue, ceiling: pr.ceiling, target: pr.target }); }, { render: false });
  if (ui.tab !== 'mixer') setTab('mixer');
  const step = msg => { ui.masterBusy = msg; refreshMasterCard(); };
  try {
    const what = songOrPattern();
    step('Listening to your mix…');
    const raw = await measureMix(withMaster(project, { on: false }), what);
    if (raw.peak < 0.003) throw new Error('Nothing is playing yet, so there’s nothing to master.');
    let drive = clamp(pr.target - raw.lufs, -12, 18), m = null;
    for (let i = 0; i < 3; i++) {
      step(`Dialing in loudness… ${i + 1} of 3`);
      m = await measureMix(withMaster(project, { drive }), what);
      const err = pr.target - m.lufs;
      if (Math.abs(err) < 0.4 || i === 2) break;
      const next = clamp(drive + err, -12, 18); if (Math.abs(next - drive) < 0.05) break; drive = next;
    }
    mutate(P => { P.master.drive = Math.round(drive * 10) / 10; }, { render: false });
    ui.masterInfo = { raw: raw.lufs, lufs: m.lufs, peak: m.peakDb, target: pr.target, short: m.lufs < pr.target - 1.5 };
    ui.mixLufs = m.lufs; applyAB();
  } catch (e) { toast(`Mastering didn’t finish: ${e.message}`, { kind: 'error' }); }
  ui.masterBusy = null; if (ui.tab === 'mixer') renderView();
}
function masterCard() {
  const P = project, M = P.master || (P.master = defaultMaster()), busy = ui.masterBusy, info = ui.masterInfo;
  const card = el('section', { class: 'panel master-card', id: 'masterCard', 'aria-label': 'Mastering and reference' });
  const pb = (id, label) => el('button', { 'aria-pressed': String(id === 'off' ? !M.on : M.on && M.preset === id), disabled: !!busy, title: id === 'off' ? 'No mastering' : MASTER_PRESETS[id].note, onclick: () => autoMaster(id) }, label);
  const note = busy ? busy : !M.on ? 'Pick a level. Tapehouse measures the song and sets loudness, glue and a safe peak ceiling.'
    : info ? `${fmtL(info.raw)} → ${fmtL(info.lufs)} LUFS · peak ${fmtL(info.peak)} dB` + (info.short ? '. That’s as loud as it goes cleanly; a busier mix gets louder.' : '') : MASTER_PRESETS[M.preset].note;
  card.append(el('div', { class: 'panel-head' },
    el('span', { class: 'panel-title' }, 'Mastering'),
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Mastering level' }, pb('off', 'Off'), Object.entries(MASTER_PRESETS).map(([id, p]) => pb(id, p.label))),
    el('span', { class: 'mc-note' + (busy ? ' busy' : '') }, note),
    el('span', { class: 'spacer' }),
    M.on ? el('span', { class: 'gr', id: 'limGR', title: 'How hard the limiter is holding peaks down right now' }, 'Limiter 0.0 dB') : null,
    M.on ? el('button', { class: 'btn sm', disabled: !!busy, onclick: () => autoMaster(M.preset), title: 'Measure again and reset loudness to the target' }, 'Re-measure') : null));
  if (M.on) {
    const k = (key, label, min, max, def, fmt, o = {}) => knob({ value: M[key], min, max, def, label, fmt, step: o.step, bipolar: !!o.bipolar, onStart: pushUndo,
      onInput: v => { M[key] = v; if (engine) engine.syncMaster(); }, onEnd: () => { if (key === 'drive' || key === 'glue') ui.masterInfo = null; changed({ render: false }); } });
    const db = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' dB';
    card.append(el('div', { class: 'knobs' },
      k('low', 'Low', -6, 6, 0, db, { bipolar: true, step: 0.5 }), k('mid', 'Mid', -6, 6, 0, db, { bipolar: true, step: 0.5 }), k('high', 'High', -6, 6, 0, db, { bipolar: true, step: 0.5 }),
      k('glue', 'Glue', 0, 1, MASTER_PRESETS[M.preset].glue, v => Math.round(v * 100) + '%'), k('drive', 'Loudness', -12, 18, 0, db, { step: 0.1 }), k('ceiling', 'Ceiling', -3, -0.1, -1, db, { step: 0.1 }),
      el('p', { class: 'hint mc-hint' }, 'Low, Mid and High shape the tone. Glue pulls the mix together. Loudness pushes into the limiter, and Ceiling is the highest a peak can reach.')));
  }
  card.append(referenceBlock());
  return card;
}

/* ---------- reference A/B ---------- */
function referenceBlock() {
  const P = project, refId = P.reference && P.reference.id, ref = refId && lib.get(refId), R = ui.refInfo && ui.refInfo.id === refId ? ui.refInfo : null;
  const songs = sortedLib().filter(s => s.duration >= 20 || s.id === refId);
  const box = el('div', { class: 'ref-block' });
  const text = !ref ? 'Load a finished song you love, then flip between it and yours at the same loudness to hear what’s different.'
    : !R || R.busy ? 'Measuring the reference…' : `Reference measures ${fmtL(R.lufs)} LUFS, so it plays ${refGain() > 0 ? '+' : refGain() < 0 ? '−' : ''}${Math.abs(refGain()).toFixed(1)} dB to sit at your loudness.`;
  box.append(el('div', { class: 'panel-head' },
    el('span', { class: 'panel-title' }, 'Reference'),
    el('select', { 'aria-label': 'Reference song', value: ref ? refId : '', onchange: e => setReference(e.target.value) },
      el('option', { value: '' }, ref ? 'No reference' : songs.length ? 'Choose a song…' : 'No songs in your library yet'), songs.map(s => el('option', { value: s.id }, s.name))),
    el('button', { class: 'btn sm', onclick: importReference }, 'Import a song'),
    ref ? el('div', { class: 'seg ab', role: 'group', 'aria-label': 'Compare your mix with the reference' },
      el('button', { 'aria-pressed': String(ui.ab !== 'B'), onclick: () => setAB('A') }, 'A · Your mix'), el('button', { 'aria-pressed': String(ui.ab === 'B'), onclick: () => setAB('B') }, 'B · Reference')) : null,
    ref ? el('button', { class: 'btn sm ghost', onclick: () => { ui.refPos = 0; if (T.playing && ctx) startReference(ctx.currentTime + 0.02); toast('The reference will play from the start.', { ms: 1500 }); } }, 'From start') : null,
    ref ? el('button', { class: 'btn sm', disabled: !!ui.toneBusy, onclick: compareTone, title: 'Compare where the energy sits, from sub bass to air' }, ui.toneBusy ? 'Comparing…' : 'Compare tone') : null));
  box.append(el('p', { class: 'hint ref-note' }, text, ref && R && !R.busy ? el('button', { class: 'linkish', onclick: rematchReference }, 'Match again') : null));
  if (ui.tone && ui.tone.id === refId) box.append(toneChart(ui.tone));
  return box;
}
async function setReference(id) {
  ui.tone = null; ui.refPos = 0;
  if (!id) { mutate(P => { delete P.reference; }); ui.refInfo = null; ui.ab = 'A'; applyAB(); return; }
  mutate(P => { P.reference = { id }; });
  await measureReference();
}
async function measureReference() {
  const id = project.reference && project.reference.id; if (!id) return;
  ui.refInfo = { id, busy: true }; refreshMasterCard();
  try {
    const buf = await getBuffer(id);
    const lufs = gatedLoudness(await filterPass(buf, buf.length, K_CHAIN));
    if (!Number.isFinite(ui.mixLufs)) ui.mixLufs = (await measureMix(project, songOrPattern())).lufs;
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; } }
    ui.refInfo = { id, lufs, peak };
  } catch (e) { ui.refInfo = null; toast(`Couldn’t read that reference: ${e.message}`, { kind: 'error' }); }
  refreshMasterCard(); applyAB();
}
async function rematchReference() {
  if (!project.reference) return;
  ui.refInfo = { ...(ui.refInfo || {}), busy: true }; refreshMasterCard();
  try { ui.mixLufs = (await measureMix(project, songOrPattern())).lufs; } catch (e) { toast(e.message, { kind: 'error' }); }
  ui.refInfo = { ...ui.refInfo, busy: false }; refreshMasterCard(); applyAB();
}
function importReference() {
  const fi = el('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac' });
  fi.addEventListener('change', async () => {
    const f = fi.files && fi.files[0]; if (!f) return;
    const was = ui.importFolder; ui.importFolder = 'References';
    let res; try { res = await importFiles([f]); } finally { ui.importFolder = was; }
    const s = res && res.audio && res.audio[0]; if (!s) return;
    if (ui.tab !== 'mixer') setTab('mixer');
    await setReference(s.id);
  });
  fi.click();
}
const BANDS = [{ label: 'Sub', range: '20–60 Hz', lo: 20, hi: 60, g: 'low' }, { label: 'Bass', range: '60–250 Hz', lo: 60, hi: 250, g: 'low' }, { label: 'Low mids', range: '250–500 Hz', lo: 250, hi: 500, g: 'mid' },
  { label: 'Mids', range: '0.5–2 kHz', lo: 500, hi: 2000, g: 'mid' }, { label: 'Upper mids', range: '2–4 kHz', lo: 2000, hi: 4000, g: null }, { label: 'Presence', range: '4–8 kHz', lo: 4000, hi: 8000, g: 'high' }, { label: 'Air', range: '8–16 kHz', lo: 8000, hi: 16000, g: 'high' }];
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function bandProfile(buf, frames) {
  const N = 4096, sr = buf.sampleRate, chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const re = new Float64Array(N), im = new Float64Array(N), acc = new Float64Array(BANDS.length), count = Math.floor(frames / N) - 1;
  if (count < 2) throw new Error('It’s too short to compare.');
  const hop = Math.max(1, Math.floor(count / 180)); let used = 0;
  for (let f = 0; f < count; f += hop) {
    const o = f * N; let e = 0;
    for (let i = 0; i < N; i++) { let v = 0; for (const d of chs) v += d[o + i]; v /= chs.length; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    if (e / N < 1e-5) continue;
    fft(re, im);
    BANDS.forEach((b, bi) => { const k0 = Math.max(1, Math.floor(b.lo * N / sr)), k1 = Math.min(N / 2, Math.ceil(b.hi * N / sr)); let s = 0; for (let k = k0; k < k1; k++) s += re[k] * re[k] + im[k] * im[k]; acc[bi] += s; });
    used++;
  }
  if (!used) throw new Error('It’s silent.');
  const tot = acc.reduce((a, b) => a + b, 0);
  return [...acc].map(x => 10 * Math.log10((x + 1e-12) / tot));
}
async function compareTone() {
  const id = project.reference && project.reference.id; if (!id || ui.toneBusy) return;
  ui.toneBusy = true; refreshMasterCard();
  try {
    const buf = await getBuffer(id), { buffer, frames } = await renderOffline(project, songOrPattern(), 44100);
    const mine = bandProfile(buffer, frames), ref = bandProfile(buf, buf.length);
    ui.tone = { id, bands: BANDS.map((b, i) => ({ ...b, diff: mine[i] - ref[i] })) };
  } catch (e) { toast(`Couldn’t compare: ${e.message}`, { kind: 'error' }); }
  ui.toneBusy = false; refreshMasterCard();
}
function toneChart(t) {
  const NS = 'http://www.w3.org/2000/svg', W = 700, H = 170, top = 22, mid = 82, half = 56, colW = W / t.bands.length, R = 9;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Tone compared with the reference: ' + t.bands.map(b => `${b.label} ${b.diff > 0 ? '+' : ''}${b.diff.toFixed(1)} dB`).join(', '));
  const mk = (tag, attrs, txt) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; svg.append(e); return e; };
  mk('text', { x: 4, y: 12, class: 'tc-axis' }, 'More than the reference');
  mk('text', { x: 4, y: mid + half + 16, class: 'tc-axis' }, 'Less');
  mk('line', { x1: 0, x2: W, y1: mid, y2: mid, class: 'tc-zero' });
  t.bands.forEach((b, i) => {
    const d = clamp(b.diff, -R, R), hpx = Math.max(2, Math.abs(d) / R * half), x = i * colW + colW * 0.3, w = colW * 0.4;
    const g = document.createElementNS(NS, 'g'); svg.append(g);
    const tt = document.createElementNS(NS, 'title'); tt.textContent = `${b.label} (${b.range}): ${b.diff > 0 ? '+' : ''}${b.diff.toFixed(1)} dB compared with the reference`; g.append(tt);
    const hitR = document.createElementNS(NS, 'rect'); hitR.setAttribute('x', i * colW); hitR.setAttribute('y', top); hitR.setAttribute('width', colW); hitR.setAttribute('height', half * 2 + 10); hitR.setAttribute('fill', 'transparent'); g.append(hitR);
    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('x', x); bar.setAttribute('width', w); bar.setAttribute('y', d >= 0 ? mid - hpx : mid); bar.setAttribute('height', hpx); bar.setAttribute('rx', 3);
    bar.setAttribute('class', Math.abs(b.diff) < 1.5 ? 'tc-bar even' : d > 0 ? 'tc-bar more' : 'tc-bar less'); g.append(bar);
    const val = document.createElementNS(NS, 'text'); val.setAttribute('x', x + w / 2); val.setAttribute('y', d >= 0 ? mid - hpx - 5 : mid + hpx + 12); val.setAttribute('class', 'tc-val'); val.textContent = (b.diff > 0 ? '+' : b.diff < 0 ? '−' : '') + Math.abs(b.diff).toFixed(1); g.append(val);
    const lb = document.createElementNS(NS, 'text'); lb.setAttribute('x', i * colW + colW / 2); lb.setAttribute('y', H - 4); lb.setAttribute('class', 'tc-lbl'); lb.textContent = b.label; g.append(lb);
  });
  const big = t.bands.filter(b => Math.abs(b.diff) >= 2.5).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 2);
  const groups = { low: [], mid: [], high: [] }; t.bands.forEach(b => { if (b.g) groups[b.g].push(b.diff); });
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const nudge = () => mutate(P => {
    const M = P.master; M.on = true;
    for (const g of ['low', 'mid', 'high']) M[g] = clamp(Math.round((M[g] - avg(groups[g]) * 0.5) * 2) / 2, -6, 6);
    ui.tone = null; ui.masterInfo = null;
  });
  return el('div', { class: 'tone' }, svg,
    el('div', { class: 'tone-notes' },
      big.length ? big.map(b => el('span', {}, `${b.label} (${b.range}): yours has ${Math.abs(b.diff).toFixed(1)} dB ${b.diff > 0 ? 'more' : 'less'} than the reference.`)) : el('span', {}, 'Your balance is close to the reference across the whole range.'),
      big.length ? el('button', { class: 'btn sm', onclick: nudge, title: 'Moves the master Low, Mid and High halfway toward the reference' }, 'Nudge my master EQ toward it') : null));
}

/* ---------- command palette ---------- */
function studioCommands(add) {
  const recording = REC.state === 'rec' || REC.state === 'count';
  add('Record', recording ? 'Stop recording' : 'Record', recordToggle, 'R mic vocal voice sing guitar');
  add('Record', ui.rec.metro ? 'Metronome off' : 'Metronome on', toggleMetro, 'M click');
  add('Vocal', 'Make me sound like my preset (fit it to my voice)', () => { const i = suiteIns() || suiteEnsureTrack(); setTab('vocal'); suiteMatch(i, { src: ui.vsSrc }); }, 'listen match auto mix instinct analyse analyze sound like fit voice');
  add('Record', REC.mon ? 'Stop hearing myself' : 'Hear myself through the vocal sound', () => { const i = suiteIns() || suiteEnsureTrack(); suiteLive(i); }, 'monitor hear myself live mic autotune auto-tune sing headphones');
  add('Record', 'Import a take', importTake, 'voice memo audio file');
  suitePresetList().forEach(p => add('Vocal', `Vocal preset: ${p.name}`, () => { const i = suiteIns() || suiteEnsureTrack(); suiteLoadPreset(i, p); setTab('vocal'); }, 'vocal chain preset sound artist autotune'));
  add('Automate', 'Add an automation lane', openAutoPicker, 'fade sweep volume filter');
  add('Automate', 'Build-ups into each chorus', recipeBuildups, 'filter riser sweep');
  add('Automate', 'Silence before each chorus', recipeGap, 'drop gap');
  add('Automate', 'Fade in the start', recipeFadeIn, 'intro');
  add('Automate', 'Fade out the end', recipeFadeOut, 'outro ending');
  Object.entries(MASTER_PRESETS).forEach(([id, p]) => add('Master', `Master it: ${p.label}`, () => autoMaster(id), `${p.note} loudness lufs limiter`));
  add('Master', 'Turn mastering off', () => autoMaster('off'));
  add('Master', 'Load a reference song', importReference, 'compare a/b');
}
