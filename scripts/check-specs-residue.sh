#!/usr/bin/env bash
# closed issue の spec dir が残っていないかを検査する (closeout 契約の機械検査)。
# 契約の正本は `spec-lifecycle` skill の references/closeout.md。
#
#   bash scripts/check-specs-residue.sh
#   SPECS_CHECK_REPO=<owner>/<repo> bash scripts/check-specs-residue.sh   # repo を明示する (既定は gh の origin)
#
# 終了コード: 0 = 残存なし / 1 = 残存あり (closeout 未実施) / 2 = 検査不能 (gh 認証・権限・想定外の値)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_YML="$ROOT/context/project.yml"

# paths.spec_dir (例: `specs/<issue-id>-<slug>/`) の固定部分だけを取り出す
resolve_specs_dir() {
  local value=""
  if [ -f "$PROJECT_YML" ]; then
    value="$(sed -n 's/^[[:space:]]*spec_dir:[[:space:]]*\([^#]*\).*/\1/p' "$PROJECT_YML" | head -1)"
    value="${value%%<*}"                                  # <issue-id> 以降を落とす
    value="$(printf '%s' "$value" | tr -d '"'"'"' ' | sed 's:/*$::')"
  fi
  printf '%s' "${value:-specs}"
}

SPECS_REL="$(resolve_specs_dir)"
SPECS_DIR="$ROOT/$SPECS_REL"

# specs/ 自体が無いのは、closeout がすべて完了した (または spec をまだ 1 つも
# 作っていない) 定常状態。残存ゼロが事実として成立しているため、検査不能 (exit 2)
# ではなく成功として扱う。これは意図した挙動 (issue #16)。
[ -d "$SPECS_DIR" ] || { echo "no $SPECS_REL/; 残存なし (specs dir 自体が無い)"; exit 0; }
command -v gh >/dev/null || { echo "gh CLI が必要です (issue の state を引くため)" >&2; exit 2; }

REPO="${SPECS_CHECK_REPO:-}"
if [ -z "$REPO" ]; then
  # 取れなければ検査不能 (合格にしない)
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
  [ -n "$REPO" ] || {
    echo "repo を解決できません。SPECS_CHECK_REPO=<owner>/<repo> を指定してください" >&2
    exit 2
  }
fi

errfile="$(mktemp)"
trap 'rm -f "$errfile"' EXIT

residue=()
unresolved=()
for dir in "$SPECS_DIR"/*/; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  issue="${name%%-*}"                                     # 先頭の連番のみを issue 番号として扱う
  case "$issue" in
    '' | *[!0-9]*)
      echo "skip: $name (issue 番号を抽出できない)"
      continue
      ;;
  esac

  # stderr を state に混ぜると gh のアップデート通知が値に混入し、CLOSED を取りこぼす
  if state="$(gh issue view "$issue" --repo "$REPO" --json state --jq .state 2>"$errfile")"; then
    case "$state" in
      CLOSED) residue+=("$name (issue #$issue: CLOSED)") ;;
      OPEN) ;;
      # 想定外の値を「OPEN でない」と黙認すると残存を見逃すため、検査不能として扱う
      *) unresolved+=("$name (issue #$issue): 想定外の state [$state]") ;;
    esac
  else
    unresolved+=("$name (issue #$issue): $(tr '\n' ' ' <"$errfile")")
  fi
done

if [ ${#unresolved[@]} -gt 0 ]; then
  echo "issue の state を取得できませんでした (gh の認証 / ネットワーク / 権限を確認してください):" >&2
  printf '  - %s\n' "${unresolved[@]}" >&2
  exit 2
fi

if [ ${#residue[@]} -gt 0 ]; then
  echo "closed issue の spec が残存しています (closeout 未実施):"
  printf '  - %s\n' "${residue[@]}"
  echo "清算手順: spec-lifecycle skill の references/closeout.md"
  exit 1
fi

echo "OK: closed issue の spec 残存なし ($SPECS_REL/)"
