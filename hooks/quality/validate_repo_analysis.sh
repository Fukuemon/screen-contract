#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"

# Node workspace が無い repo (Go 等) では対象外として skip する (hook は汎用に保つ)
[ -f package.json ] || { echo "[quality] skip (package.json なし)"; exit 0; }

echo "[quality] dependency-cruiser"
pnpm depcruise

echo "[quality] knip"
pnpm knip
