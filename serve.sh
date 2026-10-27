#!/usr/bin/env bash
# Build and serve locally: ./serve.sh -> http://localhost:8138 (en), /ru/ (ru)
set -euo pipefail
cd "$(dirname "$0")"
node build.mjs
python3 -m http.server 8138 -d dist
