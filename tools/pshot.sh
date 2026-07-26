#!/bin/sh
# tools/pshot.sh <out.png> [pose] [dist] [extra-js]
OUT="$1"; POSE="${2:-idle}"; DIST="${3:-2.6}"; EXTRA="${4:-}"
JS="window.__POSE__='$POSE';window.__DIST__=$DIST;window.__NOHUD__=1;$EXTRA;$(cat tools/portrait.js)"
timeout 260 node tools/shot.js --qa=2 --out="$OUT" --wait=23000 --eval="$JS" 2>&1 | head -30
