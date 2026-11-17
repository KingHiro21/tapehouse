#!/usr/bin/env node
/* Launches the packaged Windows app and checks what actually renders. Fails on a
   blank page, a console error, any network request, or a missing bundled font.
   It then does what Explorer does — starts the app with a .tapehouse file, then
   launches a second copy with another file — to prove the window that is already
   open takes the project instead of a second app appearing. The last phase does
   the same while the first copy is still starting, when there is no window yet. A
   last phase hands over a .tapehouse the app cannot read and checks the open
   project survives it.

   Talks to Chromium's DevTools protocol directly, so it needs no extra npm packages
   — just Node 22+, which has fetch, WebSocket and zlib.crc32 built in.

   Usage: node tools/smoke-win.mjs [path-to-exe]   (default: out/Tapehouse-win32-x64/Tapehouse.exe) */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';

const exe = path.resolve(process.argv[2] || path.join('out', 'Tapehouse-win32-x64', 'Tapehouse.exe'));
const START_TIMEOUT = 60_000;
const LOAD_TIMEOUT = 20_000;
const HOOK_TIMEOUT = 20_000;

if (!existsSync(exe)) {
  console.error(`smoke: no packaged app at ${exe} — run "npm run pack:win" first.`);
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ---------- a real .tapehouse file, built the way the app builds one ---------- */

/* Stored (uncompressed) ZIP entries. The app reads the central directory, so a
   plain header, the bytes and the directory are all it takes. */
function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function writeBundle(dir, name) {
  const project = {
    format: 'tapehouse-project',
    version: 1,
    id: `smoke-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    bpm: 120,
    swing: 0,
    key: 9,
    scale: 'minor',
    channels: [],
    patterns: [{ id: 'smoke-pattern', name: 'Pattern 1', length: 16 }],
    updatedAt: Date.now(),
  };
  const manifest = { format: 'tapehouse-bundle', version: 1, project, plugins: [], samples: [] };
  const file = path.join(dir, `${name}.tapehouse`);
  writeFileSync(file, zipStore([{ name: 'tapehouse-project.json', data: Buffer.from(JSON.stringify(manifest)) }]));
  return file;
}

/* The right container with a manifest that holds no project: what a truncated or
   half-written bundle looks like to the app. */
function writeDamagedBundle(dir, name) {
  const file = path.join(dir, `${name}.tapehouse`);
  writeFileSync(file, zipStore([{ name: 'tapehouse-project.json', data: Buffer.from('{"format":"tapehouse-bundle"}') }]));
  return file;
}

/* ---------- letting the app run ---------- */

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const scratch = mkdtempSync(path.join(os.tmpdir(), 'tapehouse-smoke-'));
const problems = [];
const SHOT = path.resolve('smoke-failure.png');
const REPORT = path.resolve('smoke-failure.txt');
const apps = [];
let lastState = null;
let session = null;
let loaded = false;

/* The shell's own output: a failing page often explains itself there. */
const appLog = [];
const watch = (label, proc) => {
  const collect = chunk => {
    appLog.push({ label, text: String(chunk) });
    if (appLog.length > 400) appLog.shift();
    process.stderr.write(chunk);
  };
  proc.stdout.on('data', collect);
  proc.stderr.on('data', collect);
  apps.push(proc);
  return proc;
};

const launch = (label, args) => watch(label, spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] }));

/* What the packaged app actually ships, in case the page it asks for is not there.
   The shell names the file it could not serve in its own output, above. */
function packageNotes() {
  const resources = path.join(path.dirname(exe), 'resources');
  try { return readdirSync(resources).map(name => `resources/${name}`); }
  catch (e) { return [`no resources folder (${e.code})`]; }
}

/* A blank page is hard to diagnose from a log line, so a failed run leaves the
   window's pixels and a short report behind for the workflow to upload. */
async function captureFailure() {
  if (session) {
    try {
      const shot = await Promise.race([
        session.send('Page.captureScreenshot', { format: 'png' }),
        sleep(5000).then(() => { throw new Error('timed out'); }),
      ]);
      writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
      console.log(`smoke: screenshot saved to ${SHOT}`);
    } catch (err) {
      console.error(`smoke: could not capture a screenshot (${err.message})`);
    }
  }
  try {
    const lines = [
      `page: ${lastState ? lastState.title : '(not read)'}`,
      `text: ${lastState ? `${lastState.state.text} chars, ${lastState.state.controls}/6 controls` : '(not read)'}`,
      `fonts: ${lastState ? JSON.stringify(lastState.fonts) : '(not checked)'}`,
      '',
      ...(problems.length ? problems : ['(no captured messages)']),
      '',
      'app output:',
      ...(appLog.length ? appLog.slice(-40).map(part => `${part.label}: ${part.text.trim()}`) : ['(none)']),
      '',
      'package:',
      ...packageNotes(),
    ];
    writeFileSync(REPORT, lines.join('\n') + '\n');
    console.log(`smoke: report saved to ${REPORT}`);
  } catch (err) {
    console.error(`smoke: could not write the report (${err.message})`);
  }
}

const alive = proc => proc.exitCode === null && proc.signalCode === null;

/* A hand-off copy should quit once it passes its project on, not open a window. */
const waitForExit = async (proc, ms = 10_000) => (alive(proc) ? Promise.race([
  new Promise(resolve => proc.once('exit', code => resolve(code))),
  sleep(ms).then(() => 'still running'),
]) : proc.exitCode);

async function closeApp(proc) {
  if (!proc || !alive(proc)) return;
  if (process.platform === 'win32') {
    const kill = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    await new Promise(resolve => kill.once('exit', resolve));
  } else {
    proc.kill();
  }
  await Promise.race([new Promise(resolve => proc.once('exit', resolve)), sleep(5000)]);
}

async function stop(code, message) {
  if (message) {
    console.error(`\nsmoke: ${message}`);
    // Actions turns this into an annotation, which stays readable without the job log.
    if (process.env.GITHUB_ACTIONS) {
      const oneLine = message.replace(/%/g, '%25').replace(/\r?\n/g, ' | ');
      console.log(`::error title=smoke::${oneLine}`);
    }
  }
  if (code !== 0) await captureFailure();
  if (session) { try { session.socket.close(); } catch { /* already gone */ } }
  for (const proc of apps) await closeApp(proc);
  rmSync(scratch, { recursive: true, force: true });
  process.exit(code);
}

/* ---------- the DevTools side ---------- */

const pages = async port => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  return list.filter(entry => entry.type === 'page' && String(entry.url).startsWith('app://'));
};

async function waitForPage(port) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT) {
    try {
      const [page] = await pages(port);
      if (page) return page;
    } catch { /* the DevTools endpoint is not up yet */ }
    await sleep(300);
  }
  return null;
}

// Chromium asks for a favicon nobody ships; that is not a reason to fail a build.
const benign = text => /favicon\.ico/i.test(text);

function connect(target) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;

    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { resolve: res, reject: rej });
      socket.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async expression => {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };

    socket.addEventListener('error', () => reject(new Error('could not attach to the DevTools socket')), { once: true });
    socket.addEventListener('open', () => resolve({ socket, send, evaluate }), { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`));
        else done(message.result);
        return;
      }
      const { method, params } = message;
      if (method === 'Page.loadEventFired') loaded = true;
      if (method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(params.type)) {
        const text = params.args.map(a => a.value ?? a.description ?? '').join(' ');
        if (!benign(text)) problems.push(`console.${params.type}: ${text}`);
      }
      if (method === 'Runtime.exceptionThrown') {
        const text = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
        if (!benign(text)) problems.push(`exception: ${text}`);
      }
      if (method === 'Log.entryAdded' && params.entry.level === 'error') {
        const text = `${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`;
        if (!benign(text)) problems.push(`log: ${text}`);
      }
      if (method === 'Network.requestWillBeSent' && /^https?:/i.test(params.request.url)) {
        problems.push(`network: ${params.request.url}`);
      }
    });
  });
}

/* Waits for the handed-over window, attaches, and records what happens in it. */
async function attach(app, port, how) {
  const target = await waitForPage(port);
  if (!target) {
    const why = alive(app) ? 'the app never exposed a DevTools page' : `the app exited with code ${app.exitCode} ${how}`;
    await stop(1, why);
  }
  session = await connect(target);
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map(method => session.send(method)));
  return target;
}

const readPage = () => session.evaluate(`(() => ({
  title: document.title,
  text: document.body.innerText.trim().length,
  fontsTag: !!document.getElementById('th-fonts'),
  // The controls a working studio shows; a blank page cannot fake them.
  controls: ['#playBtn', '#stopBtn', '#bpm', '#projName', '#importBtn', '#app']
    .filter(sel => document.querySelector(sel)).length,
}))()`);

const readFonts = () => session.evaluate(`Promise.all([
  document.fonts.load('16px Michroma'),
  document.fonts.load('16px "IBM Plex Mono"'),
]).then(([display, mono]) => ({ display: display.length > 0, mono: mono.length > 0 }))`);

/* Problems the page cannot fix are reported in an error toast, not by replacing
   the window; wait for one that mentions the given word. */
async function waitForErrorToast(word) {
  const startedAt = Date.now();
  let seen = '';
  while (Date.now() - startedAt < HOOK_TIMEOUT) {
    seen = await session.evaluate(`(() => {
      const box = document.getElementById('toasts');
      return box ? [...box.querySelectorAll('.toast.error')].map(t => t.innerText).join(' | ') : '';
    })()`);
    if (seen.toLowerCase().includes(word)) return seen;
    await sleep(250);
  }
  return null;
}

async function expectProject(name) {
  const startedAt = Date.now();
  let seen = '';
  while (Date.now() - startedAt < HOOK_TIMEOUT) {
    seen = await session.evaluate(`(document.getElementById('projName') || {}).value || ''`);
    if (seen === name) return;
    await sleep(250);
  }
  await stop(1, `the window shows "${seen}" instead of "${name}"`);
}

/* ---------- 1. the page itself ---------- */

const pagePort = await freePort();
const pageProfile = path.join(scratch, 'page');
console.log(`smoke: launching ${path.basename(exe)} on port ${pagePort}`);
const pageApp = launch('page', [`--remote-debugging-port=${pagePort}`, `--user-data-dir=${pageProfile}`]);
await attach(pageApp, pagePort, 'before it opened a page');

/* Reload with the listeners attached, so startup errors and early requests are seen. */
loaded = false;
await session.send('Page.reload', { ignoreCache: true });
const reloadAt = Date.now();
while (!loaded && Date.now() - reloadAt < LOAD_TIMEOUT) await sleep(200);
if (!loaded) await stop(1, 'the page never finished loading');
await sleep(1000); // let the app paint and any late requests fire

const state = await readPage();
const fonts = await readFonts();
lastState = { title: state.title, state, fonts };
console.log(`smoke: ${state.title || '(no title)'} — ${state.text} chars of text, ${state.controls}/6 controls`);

if (state.controls < 6 || state.text < 100) {
  await stop(1, `the page looks blank (${state.text} chars of text, ${state.controls}/6 controls)`);
}
if (!state.fontsTag) problems.push('fonts: the page has no #th-fonts block');
if (!fonts.display || !fonts.mono) problems.push(`fonts: not loaded (Michroma ${fonts.display}, IBM Plex Mono ${fonts.mono})`);
if (problems.length) await stop(1, `${problems.length} problem(s):\n  ${problems.join('\n  ')}`);

session.socket.close();
session = null;
await closeApp(pageApp);
console.log('smoke: page ok');

/* ---------- 2. starting with a project on the command line ---------- */

const first = writeBundle(scratch, 'Smoke Alpha');
const second = writeBundle(scratch, 'Smoke Beta');
const hookPort = await freePort();
const hookProfile = path.join(scratch, 'hooks');
console.log(`smoke: opening ${path.basename(first)} on launch`);
const hookApp = launch('first launch', [`--remote-debugging-port=${hookPort}`, `--user-data-dir=${hookProfile}`, first]);

const hookTarget = await attach(hookApp, hookPort, 'when given a project');
await expectProject('Smoke Alpha');
console.log('smoke: the project on the command line opened on launch');

/* ---------- 3. Explorer double-clicking a second file ---------- */

console.log(`smoke: launching a second copy with ${path.basename(second)}`);
const secondApp = launch('second launch', [`--user-data-dir=${hookProfile}`, second]);
await expectProject('Smoke Beta');

const after = await pages(hookPort);
if (!alive(hookApp)) await stop(1, 'the first app exited instead of keeping its window');
if (after.length !== 1) await stop(1, `the second launch left ${after.length} app windows instead of one`);
if (after[0].id !== hookTarget.id) await stop(1, 'the second launch replaced the window instead of reusing it');
const secondExit = await waitForExit(secondApp);
if (secondExit !== 0) await stop(1, `the second launch ended with ${secondExit} instead of handing the project over and quitting`);
console.log('smoke: the second launch handed its project to the running window');

/* ---------- 4. a second file arriving before there is a window ---------- */

const early = writeBundle(scratch, 'Smoke Gamma');
const later = writeBundle(scratch, 'Smoke Delta');
const racePort = await freePort();
const raceProfile = path.join(scratch, 'race');
console.log(`smoke: opening ${path.basename(early)}, then ${path.basename(later)} straight after`);
const raceApp = launch('race first', [`--remote-debugging-port=${racePort}`, `--user-data-dir=${raceProfile}`, early]);
// No pause between the two: the second file arrives while the first copy is still
// booting, so its project has to wait for a window instead of being dropped.
const raceSecond = launch('race second', [`--user-data-dir=${raceProfile}`, later]);

const raceTarget = await attach(raceApp, racePort, 'when given two projects');
await expectProject('Smoke Delta');
const raceWindows = await pages(racePort);
if (!alive(raceApp)) await stop(1, 'the first app exited during the quick second launch');
if (raceWindows.length !== 1 || raceWindows[0].id !== raceTarget.id) {
  await stop(1, `the quick second launch left ${raceWindows.length} window(s) instead of the one that was starting`);
}
const raceExit = await waitForExit(raceSecond);
if (raceExit !== 0) await stop(1, `the quick second launch ended with ${raceExit} instead of handing the project over`);
console.log('smoke: the quick second file reached the window that was still starting');

/* ---------- 5. a damaged project bundle ---------- */

const broken = writeDamagedBundle(scratch, 'Smoke Broken');
console.log(`smoke: opening ${path.basename(broken)}, which the app cannot read`);
const beforeDamage = await session.evaluate(`(document.getElementById('projName') || {}).value || ''`);
const brokenApp = launch('damaged launch', [`--user-data-dir=${raceProfile}`, broken]);

if (!await waitForErrorToast('damaged')) await stop(1, 'the damaged bundle was never reported to the user');
if (!alive(raceApp)) await stop(1, 'the app exited on a damaged project bundle');
const afterDamage = await session.evaluate(`(() => ({
  name: (document.getElementById('projName') || {}).value || '',
  controls: ['#playBtn', '#stopBtn', '#bpm', '#projName', '#importBtn', '#app']
    .filter(sel => document.querySelector(sel)).length,
}))()`);
if (afterDamage.name !== beforeDamage) {
  await stop(1, `the damaged bundle changed the project from "${beforeDamage}" to "${afterDamage.name}"`);
}
if (afterDamage.controls < 6) await stop(1, `the page lost its controls after a damaged bundle (${afterDamage.controls}/6)`);
if ((await pages(racePort)).length !== 1) await stop(1, 'the damaged bundle opened a second window');
const brokenExit = await waitForExit(brokenApp);
if (brokenExit !== 0) await stop(1, `the damaged bundle's launch ended with ${brokenExit}`);
console.log('smoke: the damaged bundle was reported and the open project stayed');

if (problems.length) await stop(1, `${problems.length} problem(s):\n  ${problems.join('\n  ')}`);

console.log('smoke ok');
// One annotation per green run, so the file hooks are visible without the job log.
if (process.env.GITHUB_ACTIONS) {
  console.log('::notice title=smoke::page rendered | opened "Smoke Alpha" from the command line | a second launch handed "Smoke Beta" to the running window | two files in quick succession opened "Smoke Delta" | a damaged bundle was reported without dropping "Smoke Delta"');
}
await stop(0, null);
