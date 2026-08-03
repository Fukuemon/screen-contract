#!/bin/bash

load_hook_input_json() {
  if [ -n "${HOOK_INPUT_JSON_LOADED:-}" ]; then
    return 0
  fi

  HOOK_INPUT_JSON="$(cat)"
  export HOOK_INPUT_JSON
  HOOK_INPUT_JSON_LOADED=1
  export HOOK_INPUT_JSON_LOADED
}

resolve_tool_use_file_path() {
  load_hook_input_json

  if [ -z "${HOOK_INPUT_JSON:-}" ]; then
    return 1
  fi

  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$HOOK_INPUT_JSON" | jq -r '
      .tool_input.file_path
      // .tool_input.filePath
      // .toolInput.file_path
      // .toolInput.filePath
      // .file_path
      // .filePath
      // empty
    '
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    HOOK_INPUT_JSON="$HOOK_INPUT_JSON" python3 - <<'PY'
import json
import os

raw = os.environ.get("HOOK_INPUT_JSON", "")
if not raw.strip():
    raise SystemExit(1)

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    raise SystemExit(1)

candidates = [
    data.get("tool_input", {}).get("file_path") if isinstance(data.get("tool_input"), dict) else None,
    data.get("tool_input", {}).get("filePath") if isinstance(data.get("tool_input"), dict) else None,
    data.get("toolInput", {}).get("file_path") if isinstance(data.get("toolInput"), dict) else None,
    data.get("toolInput", {}).get("filePath") if isinstance(data.get("toolInput"), dict) else None,
    data.get("file_path"),
    data.get("filePath"),
]

for candidate in candidates:
    if candidate:
        print(candidate)
        break
PY
    return 0
  fi

  return 1
}
