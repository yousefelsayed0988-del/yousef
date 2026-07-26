#!/usr/bin/env sh
#  Orebound needs a real http:// origin -- module scripts and worker threads
#  are both blocked over file://. This serves the game locally and opens it.
cd "$(dirname "$0")" || exit 1

if command -v node >/dev/null 2>&1; then
  exec node serve.mjs 8080 --open
fi

if command -v python3 >/dev/null 2>&1; then
  echo "Node not found, serving with Python instead."
  (sleep 2; (command -v xdg-open >/dev/null && xdg-open http://localhost:8080/) \
    || (command -v open >/dev/null && open http://localhost:8080/)) &
  exec python3 -m http.server 8080
fi

echo "Orebound needs Node.js or Python 3 to serve the game locally."
echo "Install Node from https://nodejs.org/ and run this again."
exit 1
