#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/../lib/tool_use_input.sh"

FILE_PATH="$(resolve_tool_use_file_path || true)"

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if [[ "$FILE_PATH" != *.md ]]; then
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  exit 0
fi

if [ -x "node_modules/.bin/prettier" ]; then
  node_modules/.bin/prettier --write -- "$FILE_PATH" >/dev/null 2>&1 || true
else
  npx --yes prettier@3.6.2 --write -- "$FILE_PATH" >/dev/null 2>&1 || true
fi

exit 0
