#!/usr/bin/env bash
# Linked Task Guard: rebuild dist and restart the OpenClaw gateway.
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run build
openclaw gateway restart
echo "task-guard reloaded. Inspect:"
openclaw plugins inspect task-guard --runtime --json 2>/dev/null | head -c 2000 || true
echo
