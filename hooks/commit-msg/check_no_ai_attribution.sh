#!/bin/bash
# commit message に AI の attribution が入っていないか検査する。
#
# `.claude/settings.json` は `attribution: {commit: "", pr: ""}` で attribution を
# 無効にしている (scripts/fix-claude-settings.sh がその状態を維持する)。
# それでも trailer が入った commit が 332 件積み上がっていたため、機械検査を置く。
#
# 落とす対象:
#   Co-Authored-By: Claude ...
#   Claude-Session: ...
#   Generated with [Claude Code](...)
set -uo pipefail

COMMIT_MSG_FILE="${1:-}"
[ -n "$COMMIT_MSG_FILE" ] || exit 0
[ -f "$COMMIT_MSG_FILE" ] || exit 0

# コメント行 (`#` 始まり) は commit に残らないので検査しない。
BODY="$(grep -v '^#' "$COMMIT_MSG_FILE" || true)"

hits=""
while IFS= read -r pattern; do
  [ -n "$pattern" ] || continue
  found="$(printf '%s\n' "$BODY" | grep -inE "$pattern" || true)"
  [ -n "$found" ] && hits="${hits}${found}"$'\n'
done <<'PATTERNS'
^co-authored-by:[[:space:]]*claude
^claude-session:
generated with \[claude code\]
PATTERNS

if [ -n "$hits" ]; then
  echo "commit-msg blocked: AI の attribution が含まれています。" >&2
  printf '%s' "$hits" | sed 's/^/  /' >&2
  echo "" >&2
  echo "本リポジトリは .claude/settings.json で attribution を無効にしています" >&2
  echo "(attribution: {commit: \"\", pr: \"\"})。該当行を削除してください。" >&2
  exit 1
fi

exit 0
