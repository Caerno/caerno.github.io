#!/usr/bin/env bash
# Пересобрать и раздать локально: ./serve.sh -> http://localhost:8138
set -euo pipefail
cd "$(dirname "$0")"
node build.mjs
cd dist
python3 -m http.server 8138
