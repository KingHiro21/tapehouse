# Tapehouse

A browser DAW: FL Studio–style editing with AI song generation, built to be easier than FL.

- `src/` — the app, split into files (engine, vocal, app, plus, studio, listen, suite, create) plus `style.css` and `body.html`.
- `build.sh` — assembles `src/` into `dist/`.
  - `dist/tapehouse.html` — the page for claude.ai (the mic does not work inside a preview).
  - `dist/Tapehouse.html` — the recording edition: open it in Chrome or Edge to record with your mic.

Build:

    ./build.sh

Version: see `APP_VERSION` in `src/engine.js`.
