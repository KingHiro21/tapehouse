# Tapehouse

A browser DAW: FL Studio–style editing with AI song generation, built to be easier than FL.

- `src/` — the app, split into files (engine, vocal, app, plus, studio, listen, suite, create) plus `style.css` and `body.html`.
- `build.sh` — assembles `src/` into `dist/`.
  - `dist/tapehouse.html` — the page for claude.ai (the mic does not work inside a preview).
  - `dist/Tapehouse.html` — the recording edition: open it in Chrome or Edge to record with your mic.

Build:

    ./build.sh

Version: see `APP_VERSION` in `src/engine.js`.

## Windows app

Tapehouse also runs as a Windows desktop app (Electron), so the mic, saving and your
projects work without a browser tab and without the claude.ai preview limits.

    npm install
    npm start            # builds dist/ and opens the app on this machine
    npm run pack:win     # out/Tapehouse-win32-x64/Tapehouse.exe (portable, works from any OS)
    npm run installer    # release/Tapehouse-Setup-<version>.exe (NSIS installer)

The portable build works from any OS. The installer goes through electron-builder's
NSIS toolchain, which shells out to Wine for its Windows helpers when it is not run
on Windows — so build it on Windows, or on Linux/macOS with Wine installed.

Needs Node 18+. `npm run build` (or `./build.sh`) still just writes `dist/`.

How the shell works: `electron/main.js` serves `dist/Tapehouse.html` from a secure
`app://` origin, so the AudioWorklet engine, the mic, storage and Google Fonts behave
as they do in Chrome. WAV bounces, project bundles and library backups use the normal
Windows Save dialog. Your projects, samples and plugins live in the app's own profile
(`%APPDATA%\Tapehouse`), separate from any browser copy of the page.

The icon is drawn by `tools/make-icon.py` (needs Pillow) into `build/icon.png` and
`build/icon.ico`, which `npm run pack:win` embeds in `Tapehouse.exe`.
