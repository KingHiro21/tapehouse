#!/bin/bash
# Builds Tapehouse from src/ into dist/: tapehouse.html (for claude.ai) and Tapehouse.html (open as a file; mic works there)
set -e
cd "$(dirname "$0")"
mkdir -p dist
OUT=dist/tapehouse.html
{
echo '<title>Tapehouse</title>'
echo '<meta name="claude:viewport-fit-sides" content="cover">'
echo '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Michroma&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600&display=swap">'
echo '<style id="th-style">'; cat src/style.css; echo '</style>'
cat src/body.html
echo '<script id="th-app">'; for f in engine vocal app plus studio listen suite create; do cat src/$f.js; echo; done; echo '</script>'
} > $OUT
{ echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0}</style></head><body>'; cat $OUT; echo '</body></html>'; } > dist/Tapehouse.html
echo "built dist/tapehouse.html and dist/Tapehouse.html"
