#!/usr/bin/env node
/* Launches the packaged Windows app and checks what actually renders. Fails on a
   blank page, a console error, any network request, or a missing bundled font.
   Talks to Chromium's DevTools protocol directly, so it needs no extra npm packages
   — just Node 22+, which has fetch and WebSocket built in.

   Usage: node tools/smoke-win.mjs [path-to-exe]   (default: out/Tapehouse-win32-x64/Tapehouse.exe) */
import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const exe = path.resolve(process.argv[2] || path.join('out', 'Tapehouse-win32-x64', 'Tapehouse.exe'));
const START_TIMEOUT = 60_000;
const LOAD_TIMEOUT = 20_000;

if (!existsSync(exe)) {
  console.error(`smoke: no packaged app at ${exe} — run "npm run pack:win" first.`);
  process.exit(1);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* Ask for a free port: a shared runner may already own a fixed one. */
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const port = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : await freePort();

/* A throwaway profile keeps the run hermetic and leaves a real install's data alone. */
const profile = path.join(os.tmpdir(), `tapehouse-smoke-${process.pid}`);
rmSync(profile, { recursive: true, force: true });

console.log(`smoke: launching ${path.basename(exe)} on port ${port}`);
const app = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: ['ignore', 'pipe', 'pipe'] });

/* Keep the shell's own output: a failing page often explains itself there. */
const appLog = [];
const collect = chunk => {
  appLog.push(String(chunk));
  if (appLog.length > 400) appLog.shift();
  process.stderr.write(chunk);
};
app.stdout.on('data', collect);
app.stderr.on('data', collect);

const problems = [];
const SHOT = path.resolve('smoke-failure.png');
const REPORT = path.resolve('smoke-failure.txt');
let attached = false;
let lastState = null;

/* A blank page is hard to diagnose from a log line, so a failed run leaves the
   window's pixels and a short report behind for the workflow to upload. */
async function captureFailure() {
  if (!attached) return;
  try {
    const shot = await Promise.race([
      send('Page.captureScreenshot', { format: 'png' }),
      sleep(5000).then(() => { throw new Error('timed out'); }),
    ]);
    writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`smoke: screenshot saved to ${SHOT}`);
  } catch (err) {
    console.error(`smoke: could not capture a screenshot (${err.message})`);
  }
  try {
    const lines = [
      `page: ${lastState ? lastState.title : '(not read)'}`,
      `elements: ${lastState ? lastState.state.elements : '?'}, text: ${lastState ? lastState.state.text : '?'} chars`,
      `fonts: ${lastState ? JSON.stringify(lastState.fonts) : '(not checked)'}`,
      '',
      ...(problems.length ? problems : ['(no captured messages)']),
      '',
      'app output:',
      ...(appLog.length ? appLog.join('').trim().split('\n').slice(-15) : ['(none)']),
    ];
    writeFileSync(REPORT, lines.join('\n') + '\n');
    console.log(`smoke: report saved to ${REPORT}`);
  } catch (err) {
    console.error(`smoke: could not write the report (${err.message})`);
  }
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
  if (app.exitCode === null && app.signalCode === null) {
    if (process.platform === 'win32') {
      const kill = spawn('taskkill', ['/pid', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
      await new Promise(resolve => kill.once('exit', resolve));
    } else {
      app.kill();
    }
    await Promise.race([new Promise(resolve => app.once('exit', resolve)), sleep(5000)]);
  }
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
}

/* 1. Wait for the shell to publish a page target for the app:// origin. */
let target = null;
const startedAt = Date.now();
while (!target) {
  if (app.exitCode !== null) await stop(1, `the app exited with code ${app.exitCode} before it opened a page`);
  if (Date.now() - startedAt > START_TIMEOUT) await stop(1, 'the app never exposed a DevTools page');
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find(entry => entry.type === 'page' && String(entry.url).startsWith('app://'));
  } catch { /* the DevTools endpoint is not up yet */ }
  if (!target) await sleep(500);
}

/* 2. Watch the page: console errors, exceptions, failed loads, network use. */
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('could not attach to the DevTools socket')), { once: true });
});
attached = true;

// Chromium asks for a favicon nobody ships; that is not a reason to fail a build.
const benign = text => /favicon\.ico/i.test(text);
let loaded = false;
let nextId = 1;
const pending = new Map();

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
    else resolve(message.result);
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

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async expression => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
};

await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map(method => send(method)));

/* 3. Reload with the listeners attached, so startup errors and early requests are seen. */
await send('Page.reload', { ignoreCache: true });
const reloadAt = Date.now();
while (!loaded && Date.now() - reloadAt < LOAD_TIMEOUT) await sleep(200);
if (!loaded) await stop(1, 'the page never finished loading');

await sleep(1000); // let the app paint and any late requests fire

const state = await evaluate(`(() => ({
  title: document.title,
  elements: document.body.querySelectorAll('*').length,
  text: document.body.innerText.trim().length,
  fontsTag: !!document.getElementById('th-fonts'),
}))()`);
const fonts = await evaluate(`Promise.all([
  document.fonts.load('16px Michroma'),
  document.fonts.load('16px "IBM Plex Mono"'),
]).then(([display, mono]) => ({ display: display.length > 0, mono: mono.length > 0 }))`);

lastState = { title: state.title, state, fonts };
console.log(`smoke: ${state.title || '(no title)'} — ${state.elements} elements, ${state.text} chars of text`);

if (state.elements < 200 || state.text < 200) await stop(1, `the page looks blank (${state.elements} elements, ${state.text} chars)`);
if (!state.fontsTag) problems.push('fonts: the page has no #th-fonts block');
if (!fonts.display || !fonts.mono) problems.push(`fonts: not loaded (Michroma ${fonts.display}, IBM Plex Mono ${fonts.mono})`);

if (problems.length) await stop(1, `${problems.length} problem(s):\n  ${problems.join('\n  ')}`);

console.log('smoke ok');
await stop(0, null);
