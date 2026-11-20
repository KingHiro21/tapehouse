# Tapehouse

A browser DAW: FL Studio–style editing with AI song generation, built to be easier than FL.

- `src/` — the app, split into files (engine, vocal, app, plus, studio, listen, suite, create) plus `style.css` and `body.html`.- `build.sh` — assembles `src/` into `dist/`.
  - `dist/tapehouse-preview.html` — the page for claude.ai (the mic does not work inside a preview).
  - `dist/Tapehouse.html` — the recording edition: open it in Chrome or Edge to record with your mic.

  These two names differ by more than case on purpose: Windows cannot store
  `tapehouse.html` and `Tapehouse.html` side by side, and the missing file used to
  drop out of the Windows package.

Build:

    ./build.sh

Version: see `APP_VERSION` in `src/engine.js`.

## Windows app

Tapehouse also runs as a Windows desktop app (Electron), so the mic, saving and your
projects work without a browser tab and without the claude.ai preview limits.

    npm install
    npm start            # builds dist/ and opens the app on this machine
    npm run pack:win     # out/Tapehouse-win32-x64/Tapehouse.exe (portable; data in ./data beside it)
    npm run installer    # release/Tapehouse-Setup-<version>.exe (NSIS installer)

The portable build works from any OS, and it is genuinely portable: `pack:win` writes a
`portable.txt` marker next to `Tapehouse.exe`, and the shell then keeps projects,
samples and plugins in a `data` folder beside the exe, so copying the folder to another
PC brings the work with it. The installer goes through electron-builder's NSIS
toolchain, which shells out to Wine for its Windows helpers when it is not run
on Windows — so build it on Windows, or on Linux/macOS with Wine installed.

Needs Node 18+. `npm run build` (or `./build.sh`) still just writes `dist/`.

### Updating the app (v2.4)

The desktop app keeps itself current. On start it checks GitHub for a newer
release (you can turn that off under **Project › Updates › Auto-check**, or check
any time under **Help › Check for updates…**). When one is out, an amber chip
appears in the top bar and a toast offers **Install**: nothing downloads until you
press it. An installed app hands over to the new setup and restarts; a portable
copy can't replace its own running exe, so it saves the new portable zip into
Downloads and opens the folder — unzip it beside the old folder and run the new
exe. Releases are published by CI whenever a `v…` tag is pushed.

Projects save as `.tapehouse` bundles. The installer registers that extension, so
double-clicking one opens it; a file dropped onto `Tapehouse.exe` (or passed to a
second launch of an open app) opens in the window that is already running.

### The vocal screen (v2.7)

One console: the record card on top, then the note display — the note under your voice, how far
off it is, and the notes Tune will land it on — which stays on screen whichever module you have
open. Under it are the five modules (Tune, Cleanup, Tone, Dynamics, Space) and the voice
assistant, which folds away into a summary bar once it has nothing new to say and opens by
itself while it is matching or when there is a result to show.

The tuner reads the mic through the same YIN detector Tune uses, so the note shown and the note
tuned always agree; it is accurate to a cent from 45 Hz to 1.6 kHz.

### The vocal tools (v2.3)

The Vocal screen carries Tune (pitch correction with formant fix so it doesn't sound robotic),
Cleanup, Tone, Dynamics and Space, artist presets (Chris Brown, Bieber, Kid LAROI, MGK, The Weeknd,
Drake, Travis Scott, Pop Smoke, Kanye, Post Malone, Juice WRLD, Billie Eilish, Ariana, SZA,
Frank Ocean, T-Pain, Future, Bruno Mars), and an assistant you can type to or talk to.

- **Noise Removal** learns the static hiss, hum and fan noise behind your voice (a spectral
  floor tracker frozen while you sing) and turns it down during and between phrases.
- **De-echo** tightens room echo: per-bin envelopes that rise with onsets but decay faster
  than the room, so tails are pulled down while notes and consonants pass through.
- **Voice typing** (the mic in the assistant's chat box) uses the browser's speech service —
  it needs Chrome or Edge with internet; the desktop app explains what to use instead.
- Listen & Match and the assistant set Noise Removal and De-echo by themselves when they hear
  an audible room, and they say so in "What I changed".

### After installing, check the file hooks

Save a project first: press **Project** (or the name field beside it), then in the
**Export** row choose **Project bundle**, and note the folder you save into. The window
title stays "Tapehouse", so check the project by its name field. Then try the three
ways in:

1. **Double-click** the `.tapehouse` file in Explorer. Tapehouse starts with that
   project's name in the name field at the top — not "Untitled".
2. With Tapehouse already open on another project, **double-click a second**
   `.tapehouse` file. The open window comes to the front and switches to it; no
   second Tapehouse appears in the taskbar.
3. **Drag** a `.tapehouse` file onto `Tapehouse.exe` (portable folder) and onto a
   shortcut to the installed app. Same result: it opens in the running window.

If Explorer asks which app to use, pick *Tapehouse* and tick “Always use this app” —
an older install can leave a stale choice behind. If nothing happens at all, check that
`HKEY_CLASSES_ROOT\.tapehouse` names a ProgID whose `shell\open\command` runs
`Tapehouse.exe "%1"`; the installer writes that, a portable folder cannot.

How the shell works: `electron/main.js` serves `dist/Tapehouse.html` from a secure
`app://` origin, so the AudioWorklet engine, the mic and storage behave as they do in
Chrome. The fonts are inlined into the page (`tools/fetch-fonts.mjs` refreshes them from
`src/fonts/`), so the app needs no network to look right. WAV bounces, project bundles and library backups ask where to go
in the normal Windows Save dialog. Your projects, samples and plugins live in the app's
own profile — `%APPDATA%\Tapehouse` for the installer, or `data` beside the exe for the
portable build — separate from any browser copy of the page.

The icon is drawn by `tools/make-icon.py` (needs Pillow) into `build/icon.png` and
`build/icon.ico`, which `npm run pack:win` embeds in `Tapehouse.exe`.

## Checking the desktop wrapper

Run the wrapper without packaging with `npm start` (builds `dist/`, then opens the window)
or `npx electron .` after a build.

`npm run check:ui` drives the real app — the packaged exe if you pass one, otherwise the local
Electron build — over the DevTools protocol. It opens every screen, plays and stops, retunes the
song, toggles steps, draws a note, arranges the playlist, moves faders, adds a plugin, searches
the library, sets up a vocal track, opens all five chain modules, turns every knob with the
keyboard and with the mouse, flips bypass, steps presets, asks the assistant for a change, checks
the tuner against known pitches, undoes and redoes, generates and keeps a song, and finally
asserts that the console logged no error. Add `--shots <dir>` to keep a screenshot of every
screen. The Windows workflow runs it on the packaged build, so a control that stops doing
anything fails the build.

`npm run check:shell` loads `electron/main.js` in plain Node against a stub Electron
(`tools/stub-electron.js`), so it needs no display and no Electron binary. It asserts:

- `app://` registration and serving — `Tapehouse.html`, `/` → `Tapehouse.html`, and 404s
  for missing files, path traversal and foreign hosts.
- Permissions: mic and clipboard write only for the app origin, everything else denied.
- The View/Help menu, the 1100×640 minimum, sandboxed `webPreferences`, show-on-ready,
  external links going to the browser, and About reporting the packaged version.

It reads `dist/`, so build first: `npm run check` does both. On every push to `main` the
Windows workflow runs it, packages the app and launches it with `tools/smoke-win.mjs`.
That smoke run also covers the file hooks above without a human: it writes two
`.tapehouse` bundles, starts the app with the first one and checks the name field, then
starts a second copy with the second bundle and checks that the running window took it
and the second process quit. The NSIS installer is built and uploaded only for a `v*`
tag or a manual run.
