#!/bin/bash
# Builds Tapehouse from src/ into dist/: tapehouse-preview.html (for claude.ai) and Tapehouse.html (open as a file; mic works there).
# The actual assembly lives in tools/build.mjs so Windows can build without bash.
set -e
cd "$(dirname "$0")"
exec node tools/build.mjs
