#!/usr/bin/env bash
# sdd-template の共有プロセス層が実際に繋がっているかを検査する。
#
# 配布は 2 層: AI 設定 (CLAUDE.md / .claude 等 / .rulesync) は symlink (未追跡)、
# hooks/ / templates/ は実ファイルの上書き配布 (消費 repo が commit)。
# symlink 層は link.sh を実行していない環境には**存在しない**。存在しないこと自体は
# 想定内だが、それに気づかないまま「hook が効いている」と思い込むのが事故になる。
# 本スクリプトはその状態を明示するためにある。
#
# 終了コード: 0 全て接続済み / 1 一部が切れている・古い / 2 未接続 (link.sh 未実行)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# symlink 層 (link.sh が張る。未追跡)
EXPECTED_LINKS=(
  "CLAUDE.md" "AGENTS.md"
  ".claude/skills" ".claude/settings.json"
  ".rulesync"
)
# 実ファイル層 (link.sh が上書きコピーし、消費 repo が commit する)
EXPECTED_FILES=(
  "hooks/protected-branch/git_hook.py" "templates/adr" "templates/features"
)

linked=0
broken=()   # symlink だが参照先が無い
solid=()    # symlink のはずが実体
absent=()   # 何も無い
stale_ln=() # 実ファイルのはずが旧方式の symlink のまま
for rel in "${EXPECTED_LINKS[@]}"; do
  if [ -L "$rel" ]; then
    if [ -e "$rel" ]; then linked=$((linked + 1)); else broken+=("$rel"); fi
  elif [ -e "$rel" ]; then
    solid+=("$rel")
  else
    absent+=("$rel")
  fi
done
for rel in "${EXPECTED_FILES[@]}"; do
  if [ -L "$rel" ]; then
    stale_ln+=("$rel")
  elif [ ! -e "$rel" ]; then
    absent+=("$rel")
  fi
done

if [ "$linked" -eq 0 ] && [ "${#broken[@]}" -eq 0 ]; then
  echo "doctor: 未接続 — AI 設定 (symlink 層) が 1 つも繋がっていません。" >&2
  echo "  操作契約 / skill / エージェント設定はこの環境に存在しません。" >&2
  echo "  接続: sdd-template 側で bash scripts/link.sh $ROOT" >&2
  exit 2
fi

status=0
if [ "${#broken[@]}" -gt 0 ]; then
  echo "doctor: symlink が切れています (${#broken[@]} 件):" >&2
  printf '  %s\n' "${broken[@]}" >&2
  echo "  復旧: sdd-template 側で make sync、または bash scripts/link.sh $ROOT" >&2
  status=1
fi
if [ "${#absent[@]}" -gt 0 ]; then
  echo "doctor: 接続されていない項目があります (${#absent[@]} 件):" >&2
  printf '  %s\n' "${absent[@]}" >&2
  echo "  接続: sdd-template 側で bash scripts/link.sh $ROOT" >&2
  status=1
fi
if [ "${#stale_ln[@]}" -gt 0 ]; then
  echo "doctor: 旧方式の symlink のままです (${#stale_ln[@]} 件)。実ファイル配布へ移行してください:" >&2
  printf '  %s\n' "${stale_ln[@]}" >&2
  echo "  移行: bash scripts/link.sh $ROOT を再実行し、hooks/ templates/ を commit" >&2
  status=1
fi
if [ "${#solid[@]}" -gt 0 ]; then
  echo "doctor: symlink でない実体があります (${#solid[@]} 件):" >&2
  printf '  %s\n' "${solid[@]}" >&2
  echo "  消費 repo 固有の実体なら問題ありません。テンプレ由来なら link.sh を再実行してください。" >&2
  status=1
fi

# hooks / templates がテンプレ (配布 worktree) より古くないかの drift 検出。
# 配布 worktree の場所は CLAUDE.md symlink の指す先から逆算する (このマシンに
# テンプレが無い環境では symlink 層ごと無いので、ここには到達しない)。
LINK_TARGET="$(readlink "CLAUDE.md" 2>/dev/null)" || true
SDD_WT="${LINK_TARGET%/dist/CLAUDE.md}"
if [ -n "$LINK_TARGET" ] && [ "$SDD_WT" != "$LINK_TARGET" ] && [ -d "$SDD_WT/hooks" ]; then
  drift=()
  while IFS= read -r src; do
    rel="${src#"$SDD_WT"/}"
    cmp -s "$src" "$rel" 2>/dev/null || drift+=("$rel")
  done < <({
    find "$SDD_WT/hooks" -type f 2>/dev/null
    find "$SDD_WT/templates" -type f -not -path "*/templates/consumer/*" 2>/dev/null
  } | sort)
  if [ "${#drift[@]}" -gt 0 ]; then
    echo "doctor: hooks / templates がテンプレと異なります (${#drift[@]} 件):" >&2
    printf '  %s\n' "${drift[@]}" >&2
    echo "  取り込み: bash scripts/link.sh $ROOT を再実行し、差分を commit" >&2
    status=1
  fi
fi

[ "$status" -eq 0 ] || exit "$status"
echo "doctor: OK (${linked} links + hooks/templates 同期済み)"
