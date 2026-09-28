#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/checkin.js"

# 依次尝试：PATH 中的 node → Homebrew node → Trae 自带 Electron（以 Node 模式运行）
if command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT"
elif [ -x /opt/homebrew/bin/node ]; then
  exec /opt/homebrew/bin/node "$SCRIPT"
elif [ -x "/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "/Applications/TRAE SOLO CN.app/Contents/MacOS/Electron" "$SCRIPT"
else
  echo "ERROR: Node.js runtime not found (need Node 18+)" >&2
  exit 1
fi