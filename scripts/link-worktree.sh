#!/usr/bin/env bash
# 今いる git worktree に、共有プロセス層の symlink を張り直す。
#
# 配布は symlink で追跡されないため、`git worktree add` (git wt) で作った
# worktree には AI 設定も hook も 1 つも来ない。lefthook の post-checkout から
# 呼ぶことで、worktree を作った直後に自動で繋がるようにする。
#
# テンプレの場所は「メイン worktree の CLAUDE.md が指す先」から逆算する。
# 消費 repo にテンプレの絶対パスを書かないため。
#
# 配布 worktree の更新 (fetch) はしない。重いうえ、ref を進めるのは
# `make sync` の役目である。
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
MAIN="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
[ -n "$MAIN" ] || exit 0
[ "$MAIN" != "$ROOT" ] || exit 0 # メイン worktree では何もしない

# メイン側が未接続なら、ここで張る先も無い。
LINK_TARGET="$(readlink "$MAIN/CLAUDE.md" 2>/dev/null)" || true
if [ -z "$LINK_TARGET" ]; then
  exit 0
fi

# <template>/.wt/dist/dist/CLAUDE.md から <template> を取り出す
TEMPLATE_DIR="${LINK_TARGET%/.wt/dist/dist/CLAUDE.md}"
if [ "$TEMPLATE_DIR" = "$LINK_TARGET" ] || [ ! -x "$TEMPLATE_DIR/scripts/link.sh" ]; then
  echo "link-worktree: テンプレの場所を特定できませんでした ($LINK_TARGET)" >&2
  echo "  手動: sdd-template 側で bash scripts/link.sh $ROOT" >&2
  exit 0
fi

SDD_SKIP_SYNC=1 SDD_LINK_WORKTREES=0 bash "$TEMPLATE_DIR/scripts/link.sh" "$ROOT" >/dev/null 2>&1 || {
  echo "link-worktree: 接続に失敗しました。手動で実行してください:" >&2
  echo "  bash $TEMPLATE_DIR/scripts/link.sh $ROOT" >&2
  exit 0
}
echo "link-worktree: 共有プロセス層を接続しました ($ROOT)"
