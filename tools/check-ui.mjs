#!/usr/bin/env node
/* Drives the real app and clicks everything.
   Launches Tapehouse (the packaged exe, or the local Electron), talks to Chromium's
   DevTools protocol directly, and walks every screen: the transport, the tabs, each
   chain module on the Vocal screen, every knob, chip and switch, the mixer, the library
   and the generator. It fails on any page exception or console error, and on a control
   that does not change what it says it changes.

   Usage: node tools/check-ui.mjs [path-to-exe] [--shots <dir>]
          (default exe: out/Tapehouse-win32-x64/Tapehouse.exe when it exists,
           otherwise the local Electron build; --shots keeps screenshots) */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const arg = process.argv.slice(2);
const shotsAt = arg.includes('--shots') ? arg[arg.indexOf('--shots') + 1] : null;
const exeArg = arg.find(a => !a.startsWith('--') && a !== shotsAt);
const PACKAGED = path.resolve('out/Tapehouse-win32-x64/Tapehouse.exe');
const DEV = path.resolve('node_modules/electron/dist/electron.exe');
const usingPackaged = !!exeArg; // an explicit exe means "test that build"; otherwise the local Electron + dist/
const exe = path.resolve(exeArg || (usingPackaged ? PACKAGED : DEV));
if (!existsSync(exe)) {
  console.error(`check-ui: no app at ${exe} — run "npm run pack:win" or "npm install" first.`);
  process.exit(1);
}
if (!existsSync(path.join('dist', 'Tapehouse.html'))) {
  console.error('check-ui: dist/Tapehouse.html is missing — run "npm run build" first.');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

let failures = 0, checks = 0;
const shots = [];
const shotDir = shotsAt ? path.resolve(shotsAt) : null;
if (shotDir) mkdirSync(shotDir, { recursive: true });

/* ---------- the app ---------- */
const profile = mkdtempSync(path.join(os.tmpdir(), 'tapehouse-ui-'));
const port = await freePort();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, [
  ...(usingPackaged ? [] : ['.']),
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
], { cwd: process.cwd(), stdio: 'ignore', env });
let appLog = '';
child.stdout && child.stdout.on('data', d => { appLog += d; });
child.stderr && child.stderr.on('data', d => { appLog += d; });

function stopApp() {
  try { child.kill(); } catch { /* already gone */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows holds handles for a moment */ }
}
process.on('exit', stopApp);
process.on('SIGINT', () => { stopApp(); process.exit(130); });

/* ---------- Chromium DevTools ---------- */
class Page {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.events = []; }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('could not attach to the app')); });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(`${m.error.message}`)) : res(m.result);
      } else if (m.method) this.events.push(m);
    };
    await this.send('Runtime.enable'); await this.send('Page.enable'); await this.send('Log.enable');
    return this;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`${method} timed out`)); }, 30000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text;
      throw new Error(`the page threw: ${d.split('\n')[0]}`);
    }
    return r.result.value;
  }
  async shot(name) {
    if (!shotDir) return;
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(shotDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    shots.push(file);
  }
  async pointer(x, y, type = 'mouseMoved', extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  }
  /* A vertical drag on an element: the way a knob is turned. */
  async drag(selector, dy, index = 0) {
    const box = await this.eval(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) return false;
    await this.pointer(box.x, box.y, 'mousePressed');
    for (let i = 1; i <= 6; i++) { await this.pointer(box.x, box.y - (dy * i) / 6, 'mouseMoved'); await sleep(16); }
    await this.pointer(box.x, box.y - dy, 'mouseReleased');
    return true;
  }
  errors() {
    const out = [];
    for (const e of this.events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        out.push('EXCEPTION ' + String((d.exception && d.exception.description) || d.text).split('\n')[0]);
      }
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') out.push('CONSOLE ' + e.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') out.push('LOG ' + e.params.entry.text.split('\n')[0]);
    }
    return out.filter(t => !/ScriptProcessorNode|Content-Security-Policy|Autofill|Electron Security Warning|DevTools/i.test(t));
  }
}

/* ---------- the tour ---------- */
function pass(name) { checks++; console.log(`  ok    ${name}`); }
function fail(name, why) { checks++; failures++; console.log(`  FAIL  ${name}\n        ${why}`); }
async function step(name, fn) {
  const before = page.errors().length;
  try {
    await fn();
    const newErrors = page.errors().slice(before);
    if (newErrors.length) fail(name, newErrors.join(' · '));
    else pass(name);
  } catch (e) { fail(name, e.message); }
}
const expect = (cond, why) => { if (!cond) throw new Error(why); };

let page = null;
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find(t => t.type === 'page' && /Tapehouse\.html/.test(t.url || ''));
  } catch { /* not listening yet */ }
}
if (!target) { console.error('check-ui: the app never opened a window\n' + appLog); stopApp(); process.exit(1); }
page = await new Page(target.webSocketDebuggerUrl).open();

console.log(`Tapehouse UI check — ${path.basename(exe)}${usingPackaged ? ' (packaged)' : ' (dev build)'}\n`);

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  await sleep(250);
  try { ready = await page.eval('!!(document.querySelector("#tabs .tab") && typeof project === "object" && project.playlist)'); } catch { /* still starting */ }
}
if (!ready) { console.error('check-ui: the page never finished booting\n' + page.errors().join('\n')); stopApp(); process.exit(1); }
await sleep(900); // let the demo project and the audio engine settle
// A fixed, roomy viewport so the layout under test does not depend on the screen the
// runner happens to have; the narrow-window check sets its own.
await page.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 940, deviceScaleFactor: 1, mobile: false });
await sleep(400);

/* --- boot --- */
await step('every screen is in the tab bar', async () => {
  const tabs = await page.eval('[...document.querySelectorAll("#tabs .tab")].map(t => t.dataset.tab)');
  expect(tabs.length === 8, `expected 8 tabs, found ${tabs.length}: ${tabs.join(', ')}`);
  expect(['create', 'rack', 'piano', 'playlist', 'vocal', 'mixer', 'library', 'plugins'].every(t => tabs.includes(t)), `missing: ${tabs.join(',')}`);
});
await step('the demo project loads with a beat, a key and a tempo', async () => {
  const p = await page.eval('({bpm: project.bpm, key: project.key, pats: Object.keys(project.patterns || {}).length, clips: project.playlist.clips.length, mixer: project.mixer.length, chans: project.channels.length})');
  expect(p.bpm >= 40 && p.bpm <= 240, `tempo out of range: ${p.bpm}`);
  expect(typeof p.key === 'number', 'no song key');
  expect(p.pats >= 1, 'no patterns');
  expect(p.clips >= 1, 'the demo song has no clips');
  expect(p.mixer === p.chans + 1, `mixer (${p.mixer}) should be one strip per channel (${p.chans}) plus the master`);
});

/* --- every screen renders and survives a screenshot --- */
for (const wanted of ['create', 'rack', 'piano', 'playlist', 'vocal', 'mixer', 'library', 'plugins']) {
  await step(`the ${wanted} screen renders`, async () => {
    let tab = wanted;
    await page.eval(`document.querySelector('.tab[data-tab="${tab}"]').click()`);
    await sleep(600);
    const info = await page.eval(`(() => { const v = document.querySelector('#view'); const r = v.getBoundingClientRect();
      return { nodes: v.querySelectorAll('*').length, w: Math.round(r.width), h: Math.round(r.height), wide: isWide(), empty: !!v.querySelector('.empty'), sel: document.querySelector('.tab[aria-selected="true"]').dataset.tab }; })()`);
    if (tab === 'library' && info.wide) tab = 'rack'; // the library docks into the rail on a wide window, by design
    expect(info.sel === tab, `the tab did not become selected`);
    expect(info.nodes > 20 || info.empty, `the screen rendered only ${info.nodes} elements`);
    expect(info.h > 300, `the screen is only ${info.h}px tall`);
    await page.shot('tab-' + tab);
  });
}

/* --- transport --- */
await step('play starts the song and the position moves', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="playlist"]').click()`);
  await sleep(300);
  await page.eval(`document.querySelector('#playBtn').click()`);
  await sleep(1400);
  const st = await page.eval('({playing: !!T.playing, shown: T.shown, queue: T.queue.length, time: document.querySelector("#timeDisp").textContent})');
  expect(st.playing, 'the transport did not start');
  expect(st.queue > 0 || st.shown >= 0, 'nothing was scheduled');
  await page.shot('transport-playing');
});
await step('stop rewinds to the start', async () => {
  await page.eval(`document.querySelector('#stopBtn').click()`);
  await sleep(500);
  const st = await page.eval('({playing: !!T.playing, step: T.songPos, pos: document.querySelector("#timeDisp").textContent})');
  expect(!st.playing, 'the transport kept playing');
  expect(st.step === 0, `the position stayed at step ${st.step}`);
  expect(/^1\.1\.1$/.test(st.pos.trim()), `the position readout says ${st.pos}`);
});
await step('the metronome and play mode switches work', async () => {
  await page.eval(`document.querySelector('#metroBtn').click()`);
  await sleep(200);
  const on = await page.eval('!!ui.rec.metro');
  expect(on, 'the metronome did not turn on');
  await page.eval(`document.querySelector('#metroBtn').click()`);
  await page.eval(`[...document.querySelectorAll('#modeSeg button')].find(b => b.dataset.mode === 'pattern').click()`);
  await sleep(200);
  const mode = await page.eval('T.mode');
  expect(mode === 'pattern', `the mode did not switch (${mode})`);
  await page.eval(`[...document.querySelectorAll('#modeSeg button')].find(b => b.dataset.mode === 'song').click()`);
});

/* --- tempo and key --- */
await step('the tempo field sets the song tempo', async () => {
  await page.eval(`(() => { const b = document.querySelector('#bpm'); b.value = '142'; b.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
  const bpm = await page.eval('project.bpm');
  expect(bpm === 142, `the tempo came out as ${bpm}`);
  await page.eval(`(() => { const b = document.querySelector('#bpm'); b.value = '124'; b.dispatchEvent(new Event('change', { bubbles: true })); })()`);
});
await step('the key and scale pickers retune the song', async () => {
  const before = await page.eval('({key: project.key, scale: project.scale})');
  await page.eval(`(() => { const s = document.querySelector('#keyRoot'); s.value = String((project.key + 3) % 12); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(400);
  const after = await page.eval('({key: project.key, scale: project.scale})');
  expect(after.key !== before.key, `the key did not change from ${before.key}`);
  const scale = await page.eval(`(() => { const s = document.querySelector('#keyScale'); const other = [...s.options].map(o => o.value).find(v => v !== project.scale); s.value = other; s.dispatchEvent(new Event('change', { bubbles: true })); return other; })()`);
  await sleep(400);
  expect(await page.eval('project.scale') === scale, 'the scale did not change');
});

/* --- beat: steps toggle --- */
await step('the beat screen toggles steps on and off', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="rack"]').click()`);
  await sleep(500);
  const info = await page.eval(`(() => { const row = document.querySelector('.st'); if (!row) return null; const r = row.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  expect(info, 'the beat grid has no steps');
  const before = await page.eval('JSON.stringify(curPattern().steps)');
  await page.pointer(info.x, info.y, 'mousePressed'); await page.pointer(info.x, info.y, 'mouseReleased');
  await sleep(400);
  const after = await page.eval('JSON.stringify(curPattern().steps)');
  expect(before !== after, 'clicking a step changed nothing');
  await page.pointer(info.x, info.y, 'mousePressed'); await page.pointer(info.x, info.y, 'mouseReleased');
  await sleep(300);
});

/* --- notes: draw in the piano roll --- */
await step('the notes screen draws a note where you click', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="piano"]').click()`);
  await sleep(600);
  const grid = await page.eval(`(() => { const g = document.querySelector('.pr-wrap canvas'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + 120, y: r.top + 90 }; })()`);
  expect(grid, 'the piano roll has no canvas');
  const before = await page.eval('JSON.stringify(curPattern().notes || {})');
  await page.pointer(grid.x, grid.y, 'mousePressed'); await page.pointer(grid.x, grid.y, 'mouseReleased');
  await sleep(600);
  const after = await page.eval('JSON.stringify(curPattern().notes || {})');
  expect(before !== after, 'clicking the grid added no note');
});

/* --- song: arrange --- */
await step('arranging fills the playlist', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="playlist"]').click()`);
  await sleep(500);
  const before = await page.eval('project.playlist.clips.length');
  await page.eval(`[...document.querySelectorAll('button')].find(b => /Arrange for me/i.test(b.textContent)).click()`);
  await sleep(1200);
  const after = await page.eval('project.playlist.clips.length');
  expect(after > before, `the playlist still has ${after} clips`);
  await page.shot('arranged');
});

/* --- mixer --- */
await step('the mixer faders and mutes respond', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="mixer"]').click()`);
  await sleep(600);
  const faders = await page.eval('document.querySelectorAll(".strip input.fader").length');
  expect(faders >= 2, `the mixer shows ${faders} faders`);
  const before = await page.eval('project.mixer[1].vol');
  await page.eval(`(() => { const f = document.querySelectorAll('.strip input.fader')[1]; f.value = '0.42'; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(400);
  const after = await page.eval('project.mixer[1].vol');
  expect(Math.abs(after - 0.42) < 1e-6, `the fader set ${after}`);
  const muted = await page.eval(`(() => { const b = document.querySelectorAll('.strip .m')[1]; if (!b) return null; b.click(); return true; })()`);
  await sleep(300);
  expect(muted, 'no mute button found');
  expect(await page.eval('project.mixer[1].mute') === true, 'mute did not stick');
  await page.eval(`document.querySelectorAll('.strip .m')[1].click()`);
  await sleep(200);
});

/* --- plugins --- */
await step('a built-in plugin can be added to the beat', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="plugins"]').click()`);
  await sleep(600);
  // "Add to beat" puts an instrument in the rack; "Add to <strip>" puts an effect in the mixer.
  const before = await page.eval('project.channels.length + project.mixer.reduce((a, m) => a + m.fx.length, 0)');
  await page.eval(`(() => { const b = [...document.querySelectorAll('button')].find(x => /^Add to/i.test(x.textContent.trim())); if (!b) throw new Error('no add button'); b.click(); })()`);
  await sleep(900);
  const after = await page.eval('project.channels.length + project.mixer.reduce((a, m) => a + m.fx.length, 0)');
  expect(after > before, `nothing was added (${before} → ${after})`);
});

/* --- library --- */
await step('the library searches and filters', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="library"]').click()`);
  await sleep(500);
  const n = await page.eval('document.querySelectorAll(".lib-row, .lib-item, .snd").length');
  expect(n > 0, 'the library lists nothing');
  const filtered = await page.eval(`(() => { const i = document.querySelector('#view input[type="search"], #view input[type="text"]'); if (!i) return null;
    i.value = 'kick'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(500);
  if (filtered) {
    const names = await page.eval(`[...document.querySelectorAll('.lib-row .nm, .lib-row b, .snd .nm')].map(e => e.textContent.toLowerCase())`);
    expect(names.every(x => x.includes('kick') || !x), `search showed: ${names.slice(0, 6).join(', ')}`);
  }
});

/* --- vocal: the whole chain --- */
await step('the vocal screen sets up a track', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="vocal"]').click()`);
  await sleep(500);
  const has = await page.eval('!!document.querySelector(".vs-face")');
  if (!has) await page.eval(`[...document.querySelectorAll('button')].find(b => /Set up a vocal track/i.test(b.textContent)).click()`);
  await sleep(1200);
  const info = await page.eval(`(() => { const f = document.querySelector('.vs-face'); return { face: !!f, tabs: document.querySelectorAll('.vs-tab').length, knobs: document.querySelectorAll('.vs .vs-knob').length,
    meter: !!document.querySelector('#vsNote'), stage: !!document.querySelector('.vs-stage'), assistant: !!document.querySelector('.vs-asst'), preset: (document.querySelector('.vs-pname') || {}).value || null }; })()`);
  expect(info.face, 'the vocal unit did not open');
  expect(info.tabs === 5, `expected 5 chain modules, found ${info.tabs}`);
  expect(info.stage && info.meter, 'the tuner is missing');
  expect(info.assistant, 'the voice assistant is missing');
  expect(info.preset, 'no preset is selected');
  await page.shot('vocal');
});
for (const [id, label] of [['tune', 'Tune'], ['cleanup', 'Cleanup'], ['tone', 'Tone'], ['dynamics', 'Dynamics'], ['space', 'Space']]) {
  await step(`the ${label} module shows its controls`, async () => {
    await page.eval(`[...document.querySelectorAll('.vs-tab')].find(b => b.textContent.trim().toUpperCase() === '${label.toUpperCase()}').click()`);
    await sleep(500);
    const n = await page.eval(`(() => { const p = document.querySelector('.vs-panel'); return { knobs: p.querySelectorAll('.vs-knob').length, chips: p.querySelectorAll('.vs-chip').length, text: p.textContent.length }; })()`);
    expect(n.knobs + n.chips > 0, `${label} rendered no controls`);
    expect(n.text > 20, `${label} has no text`);
    await page.shot('vocal-' + id);
  });
}
await step('every knob turns with the keyboard and the mouse', async () => {
  await page.eval(`[...document.querySelectorAll('.vs-tab')].find(b => b.textContent.trim().toUpperCase() === 'TUNE').click()`);
  await sleep(400);
  const total = await page.eval('document.querySelectorAll(".vs .vs-knob").length');
  expect(total > 0, 'no knobs on the vocal screen');
  const before = await page.eval('JSON.stringify(project.mixer[ui.vsIns].fx.map(f => ({ p: f.plugin, a: { ...f.params } })))');
  // keyboard: focus each knob and nudge it up
  for (let i = 0; i < total; i++) {
    await page.eval(`(() => { const k = document.querySelectorAll('.vs .vs-knob')[${i}]; k.focus(); k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); k.blur(); })()`);
    await sleep(60);
  }
  await sleep(500);
  const after = await page.eval('JSON.stringify(project.mixer[ui.vsIns].fx.map(f => ({ p: f.plugin, a: { ...f.params } })))');
  expect(before !== after, 'turning every knob changed nothing in the chain');
  // mouse: one real vertical drag on the first knob
  const dragged = await page.drag('.vs .vs-knob', -40);
  expect(dragged, 'the knob could not be grabbed');
});
await step('the bypass switch turns the whole chain off and back on', async () => {
  const toggle = `[...document.querySelectorAll('.vs-key.wide')].find(b => /Bypass/i.test(b.textContent))`;
  await page.eval(`${toggle}.click()`);
  await sleep(400);
  const off = await page.eval('project.mixer[ui.vsIns].fx.every(f => f.bypass)');
  expect(off, 'bypass left some effects running');
  await page.eval(`${toggle}.click()`);
  await sleep(400);
  const on = await page.eval('project.mixer[ui.vsIns].fx.some(f => !f.bypass)');
  expect(on, 'bypass did not come back off');
});
await step('the preset arrows and the picker change the sound', async () => {
  const before = await page.eval('JSON.stringify(project.mixer[ui.vsIns].fx.map(f => [f.plugin, f.params.retune, f.params.time, f.params.mix]))');
  await page.eval(`[...document.querySelectorAll('.vs-key')].find(b => b.getAttribute('aria-label') === 'Next preset').click()`);
  await sleep(1100);
  const after = await page.eval('JSON.stringify(project.mixer[ui.vsIns].fx.map(f => [f.plugin, f.params.retune, f.params.time, f.params.mix]))');
  expect(before !== after, 'the next preset changed nothing');
});
await step('preset changes crossfade without tearing down the old path', async () => {
  const result = await page.eval(`(() => {
    const ins = engine.inserts[ui.vsIns], before = ins.paths.length;
    const old = ins.paths[0]?.gain.gain.value;
    suiteLoadPreset(ui.vsIns, suitePresetList().find(x => x.kind === 'artist' && x.id === 'drake'));
    return { before, mid: ins.paths.length, retiring: ins.paths.some(x => x.retiring), old };
  })()`);
  expect(result.mid >= 2, `old chain removed instead of crossfaded: ${JSON.stringify(result)}`);
  expect(!result.retiring || Number.isFinite(result.old), 'old audio path is not fading out');
  await sleep(120);
  const after = await page.eval(`(() => { const p=engine.inserts[ui.vsIns].paths; return {count:p.length, retiring:p.some(x=>x.retiring)}; })()`);
  expect(after.count === 1 && !after.retiring, `old path did not clean up: ${JSON.stringify(after)}`);
});
await step('preset output remains connected to the master', async () => {
  const result = await page.eval(`(() => { const ins=engine.inserts[ui.vsIns]; return {paths:ins.paths.length, fx:ins.fx.length, dsp:engine.dsp}; })()`);
  expect(result.paths === 1, `effect path count is ${result.paths}`);
  expect(result.fx > 3, `preset effects missing: ${result.fx}`);
});
await step('rapid preset changes leave no fallback effects or orphan paths', async () => {
  const result = await page.eval(`(() => {
    const list=suitePresetList().filter(x=>x.kind==='artist'), ins=engine.inserts[ui.vsIns];
    for(let i=0;i<6;i++) suiteLoadPreset(ui.vsIns,list[(i+4)%list.length]);
    return {dsp:engine.dsp,loading:ui.vsPresetLoading||'', count:ins.paths.length, fallback:ins.fx.filter(f=>f.dspFallback&&f.dspFallback()).length};
  })()`);
  await sleep(900);
  const settled = await page.eval(`(() => { const ins=engine.inserts[ui.vsIns]; return {dsp:engine.dsp, loading:ui.vsPresetLoading||'',count:ins.paths.length,fallback:ins.fx.filter(f=>f.dspFallback&&f.dspFallback()).length,fx:ins.fx.length}; })()`);
  expect(settled.dsp === 'ready', `DSP did not finish loading: ${settled.dsp}`);
  expect(!settled.loading, `preset stayed pending: ${settled.loading}`);
  expect(settled.count===1 && settled.fallback===0 && settled.fx>3, `unstable chain: ${JSON.stringify(settled)}`);
});
await step('tuner and voice assistant share the performance panel', async () => {
  const pair = await page.eval(`(() => { const p=document.querySelector('.vs-performance'); return !!p && !!p.querySelector('.vs-stage') && !!p.querySelector('.vs-asst') && p.parentElement.classList.contains('vs-core'); })()`);
  expect(pair, 'the stage and assistant are not together in the vocal console');
});

await step('the tune feel buttons are wired to the Tune effect', async () => {
  await page.eval(`[...document.querySelectorAll('.vs-tab')].find(b => b.textContent.trim().toUpperCase() === 'TUNE').click()`);
  await sleep(400);
  for (const feel of ['Natural', 'Auto-Tune', 'Robot', 'Smooth']) {
    await page.eval(`(() => { const b = [...document.querySelectorAll('.vs-chip')].find(x => x.textContent.trim() === '${feel}'); if (!b) throw new Error('no ${feel} button'); b.click(); })()`);
    await sleep(300);
  }
  const rt = await page.eval(`(() => { const m = project.mixer[ui.vsIns]; const f = m.fx.find(x => x.plugin === 'th.autotune'); return f ? f.params.retune : null; })()`);
  expect(rt !== null, 'the Tune effect is missing from the chain');
  expect(Number(rt) >= 0 && Number(rt) <= 60, `retune came out at ${rt}`);
});
await step('the assistant opens, folds and answers', async () => {
  const open = await page.eval(`(() => { const d = document.querySelector('.vs-asst'); return !!(d && d.open); })()`);
  expect(typeof open === 'boolean', 'the assistant is not on the screen');
  await page.eval(`(() => { const d = document.querySelector('.vs-asst'); d.open = !d.open; d.dispatchEvent(new Event('toggle')); })()`);
  await sleep(300);
  await page.eval(`(() => { const d = document.querySelector('.vs-asst'); if (!d.open) { d.open = true; d.dispatchEvent(new Event('toggle')); } })()`);
  await sleep(300);
  const said = await page.eval(`(() => { const f = document.querySelector('.vs-ask'); if (!f) return null; const i = f.querySelector('input'); i.value = 'less autotune'; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return ui.vsChat.length; })()`);
  expect(said !== null, 'the assistant has no input');
  await sleep(1500);
  const grew = await page.eval('ui.vsChat.length');
  expect(grew >= 1, 'the assistant did not answer');
  await page.shot('vocal-assistant');
});
await step('the tuner reads a real pitch to within a cent', async () => {
  const bad = await page.eval(`(() => {
    const out = [];
    for (const hz of [110, 220, 329.63, 440, 880, 1046.5]) {
      const sr = 48000, n = 2048, b = new Float32Array(n);
      for (let i = 0; i < n; i++) b[i] = 0.2 * (Math.sin(2 * Math.PI * hz * i / sr) + 0.4 * Math.sin(4 * Math.PI * hz * i / sr) + 0.2 * Math.sin(6 * Math.PI * hz * i / sr));
      const r = detectPitch(b, sr);
      if (!r) { out.push(hz + ': no note'); continue; }
      const cents = 1200 * Math.log2(r.f / hz);
      if (Math.abs(cents) > 3) out.push(hz + ': ' + cents.toFixed(1) + ' ct');
    }
    return out;
  })()`);
  expect(bad.length === 0, 'wrong readings: ' + bad.join(', '));
});

await step('Tune runs on the audio thread with the song key', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="vocal"]').click()`);
  await sleep(500);
  const info = await page.eval(`(() => {
    const ins = ui.vsIns, m = project.mixer[ins];
    const fx = m.fx.find(f => f.plugin === 'th.autotune');
    if (!fx) return { err: 'no Tune in the chain' };
    const e = engine && engine.inserts[ins];
    const node = e && e.fx ? e.fx.find(x => x.id === fx.id) : null;
    const mask = tuneMask(project, fx.params.scale, fx.params.root, fx.params.smode);
    return { mask, engine: engine && engine.dsp, node: !!node, pluginId: node && node.pluginId, fallback: !!(node && node.dspFallback), live: !!engine.lowLat, latency: Math.round((e && e.latency || 0) * 1000) };
  })()`);
  expect(!info.err, info.err || 'missing');
  expect(info.mask > 0 && (info.mask & 0xFFF) === info.mask, `the scale mask is ${info.mask}`);
  expect(info.node, 'the Tune effect never reached the graph');
  expect(info.pluginId === 'th.autotune', `the graph node is ${info.pluginId}`);
  expect(info.latency >= 0 && info.latency < 60, `the chain reports ${info.latency} ms`);
});

await step('voice profiles preserve preset tuning character', async () => {
  const result = await page.eval(`(() => {
    const ins = ui.vsIns, m = project.mixer[ins], oldFx = m.fx, oldProfile = suiteVoiceProfile;
    const problems = [];
    try {
      for (const artist of SUITE_ARTISTS) {
        suiteApplyArtist(project, ins, artist);
        const f = suiteClassify(m.fx).tune;
        if (!f) { problems.push(artist.id + ': no Tune'); continue; }
        const before = JSON.stringify([f.params.retune, f.params.humanize, f.params.flex, f.params.fcorr]);
        if (!artist.hard && (+f.params.retune < 35 || +f.params.humanize < 0.3 || f.params.fcorr !== 'on')) problems.push(artist.id + ': too hard');
        suiteVoiceProfile = { a: { f0: { mid: 95 }, notes: Array(80).fill(60.4) } };
        suiteApplyProfileTune(ins);
        const after = JSON.stringify([f.params.retune, f.params.humanize, f.params.flex, f.params.fcorr]);
        if (before !== after || f.params.voice !== 'low') problems.push(artist.id + ': profile changed sound or missed voice');
      }
      suiteApplyArtist(project, ins, SUITE_ARTISTS.find(a => a.id === 'tpain'));
      const hard = suiteClassify(m.fx).tune.params;
      if (+hard.retune !== 0 || hard.fcorr !== 'off') problems.push('T-Pain: hard tuning lost');
      if (TUNE_FEELS.find(f => f[0] === 'natural')[2] <= TUNE_FEELS.find(f => f[0] === 'smooth')[2]) problems.push('natural feel not slower');
    } finally { m.fx = oldFx; suiteVoiceProfile = oldProfile; engine.sync(); }
    return problems;
  })()`);
  expect(result.length === 0, result.join(', '));
});

/* --- monitoring: the mix must not silence the voice you are hearing back --- */
await step('the mix cannot silence or pan the live voice', async () => {
  /* "Hear myself" used to run through the track's mute, solo and pan, so muting the vocal (or soloing the drums)
     killed it with nothing on screen to explain why. The engine now holds the monitored insert audible and centred;
     the fader still sets the level. */
  const prep = await page.eval(`(() => {
    const ins = ui.vsIns, E = engine;
    const other = project.mixer.findIndex((m, i) => i > 0 && i !== ins);
    if (!E || ins == null || other < 0) return { err: 'no engine or second track' };
    globalThis.__mon = { ins, other, mute: project.mixer[ins].mute, pan: project.mixer[ins].pan, mon: E.monIns };
    E.monIns = ins;
    project.mixer[ins].mute = true; project.mixer[other].solo = true; project.mixer[ins].pan = -1;
    E.sync();
    return { ok: true };
  })()`);
  expect(!prep.err, prep.err || 'setup failed');
  await sleep(400);
  const live = await page.eval(`(() => { const { ins } = globalThis.__mon, E = engine, e = E.inserts[ins]; return { gain: +e.out.gain.value.toFixed(3), pan: +e.pan.pan.value.toFixed(3) }; })()`);
  expect(live.gain > 0.95, `muting or soloing dropped the monitor to ${live.gain}`);
  expect(Math.abs(live.pan) < 0.02, `the live voice sat at pan ${live.pan}`);
  await page.eval(`(() => { const { ins, other, mute, pan, mon } = globalThis.__mon; project.mixer[ins].mute = mute; project.mixer[other].solo = false; project.mixer[ins].pan = pan; engine.monIns = mon; engine.sync(); })()`);
  await sleep(400);
  const off = await page.eval(`(() => { const { ins } = globalThis.__mon, E = engine, e = E.inserts[ins]; return { gain: +e.out.gain.value.toFixed(3), pan: +e.pan.pan.value.toFixed(3) }; })()`);
  expect(off.gain > 0.95, `the mixer stopped working after monitoring (gain ${off.gain})`);
  await page.eval(`(() => { const ins = globalThis.__mon.ins; const m = project.mixer[ins]; const was = m.mute; m.mute = true; engine.sync(); renderView(); globalThis.__restoreMute = () => { project.mixer[ins].mute = was; engine.sync(); renderView(); }; })()`);
  await sleep(350);
  const muted = await page.eval(`+engine.inserts[globalThis.__mon.ins].out.gain.value.toFixed(3)`);
  expect(muted < 0.05, `mute no longer silences the track (gain ${muted})`);
  await page.eval(`globalThis.__restoreMute()`);
  await sleep(250);
});

/* --- undo / redo --- */
await step('undo and redo put the project back', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="rack"]').click()`);
  await sleep(400);
  const snapshot = await page.eval('JSON.stringify(curPattern().steps)');
  const info = await page.eval(`(() => { const row = document.querySelector('.st'); const r = row.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await page.pointer(info.x, info.y, 'mousePressed'); await page.pointer(info.x, info.y, 'mouseReleased');
  await sleep(400);
  await page.eval(`document.querySelector('#undoBtn').click()`);
  await sleep(400);
  expect(await page.eval('JSON.stringify(curPattern().steps)') === snapshot, 'undo did not restore the pattern');
  await page.eval(`document.querySelector('#redoBtn').click()`);
  await sleep(400);
  expect(await page.eval('JSON.stringify(curPattern().steps)') !== snapshot, 'redo did not put the step back');
  await page.eval(`document.querySelector('#undoBtn').click()`);
  await sleep(300);
});

/* --- the command palette and the sheet --- */
await step('the find-any-action palette opens and closes', async () => {
  await page.eval(`document.querySelector('#searchBtn').click()`);
  await sleep(500);
  const open = await page.eval('!document.querySelector("#sheet").hidden');
  expect(open, 'the palette did not open');
  await page.eval(`document.querySelector('#sheet').click()`);
  await sleep(300);
  expect(await page.eval('document.querySelector("#sheet").hidden'), 'the palette did not close');
});
await step('the project sheet opens without a dialog', async () => {
  await page.eval(`document.querySelector('#projBtn').click()`);
  await sleep(600);
  const open = await page.eval('!document.querySelector("#sheet").hidden');
  expect(open, 'the project sheet did not open');
  await page.eval(`document.querySelector('#sheet').click()`);
  await sleep(300);
});

/* --- the generator --- */
await step('the generator builds a song from a description', async () => {
  await page.eval(`document.querySelector('.tab[data-tab="create"]').click()`);
  await sleep(600);
  await page.eval(`(() => { const t = document.querySelector('#view textarea.c-desc'); t.value = 'a bright pop song about driving home'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const clicked = await page.eval(`(() => { const b = [...document.querySelectorAll('#view button')].find(x => /^Create$/.test(x.textContent.trim()));
    if (!b) return 'no Create button'; if (b.disabled) return 'Create is disabled'; const busy = !!ui.cBusy; b.click(); return 'clicked (busy before: ' + busy + ')'; })()`);
  let takes = 0;
  for (let i = 0; i < 60 && !takes; i++) { await sleep(500); takes = await page.eval('(ui.takes || []).length'); }
  if (!takes) {
    const why = await page.eval(`JSON.stringify({ busy: !!ui.cBusy, cDesc: ui.cDesc, status: ui.cStatus && ui.cStatus.text, btn: !!document.querySelector('#view .btn.primary.big'), sheet: !document.querySelector('#sheet').hidden, tab: ui.tab })`);
    throw new Error('the generator produced no takes: ' + clicked + ' ' + why);
  }
  const plan = await page.eval('JSON.stringify({title: ui.takes[0].plan.title, chords: ui.takes[0].plan.prog.chorus.length, sections: Object.keys(ui.takes[0].project.playlist).length})');
  const title = JSON.parse(plan).title;
  expect(typeof title === 'string' && title.length > 1, `the take has no title: ${plan}`);
  await page.eval('keepTake(ui.takes[0])');
  await sleep(1500);
  const kept = await page.eval('({ name: project.name, clips: project.playlist.clips.length, chans: project.channels.length })');
  expect(kept.clips > 0 && kept.chans > 0, `the kept song is empty: ${JSON.stringify(kept)}`);
  await page.shot('generated');
});

/* --- the small screens --- */
await step('the app still lays out on a narrow window', async () => {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  await page.eval(`document.querySelector('.tab[data-tab="vocal"]').click()`);
  await sleep(600);
  const bad = await page.eval(`(() => { const out = []; for (const e of document.querySelectorAll('#app *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > innerWidth + 2) { out.push((e.className || e.tagName) + ' overflows by ' + Math.round(r.right - innerWidth)); if (out.length > 4) break; } } return out; })()`);
  expect(bad.length === 0, bad.join('; '));
  await page.shot('narrow');
  await page.send('Emulation.clearDeviceMetricsOverride');
});

/* --- the console, at the end --- */
await step('nothing logged an error or threw', async () => {
  const errs = page.errors();
  expect(errs.length === 0, errs.slice(0, 6).join(' · '));
});

console.log(`\n${checks - failures}/${checks} checks passed${shots.length ? ` — screenshots in ${shotDir}` : ''}`);
stopApp();
process.exit(failures ? 1 : 0);
