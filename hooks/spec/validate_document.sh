#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/../lib/tool_use_input.sh"

FILE_PATH="$(resolve_tool_use_file_path || true)"

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if ! echo "$FILE_PATH" | grep -qE 'specs/[^/]+/index\.md$'; then
  exit 0
fi

ERRORS=()

REQUIRED_SECTIONS=(
  "## メタ情報"
  "## 設計フェーズ状況"
  "## 上位文書整合"
  "## 関連資料"
  "## 背景"
  "## スコープ"
  "## 要件の解釈"
  "## 設計時の論点"
  "## 解決済みの論点"
  "## 未確定事項"
  "## 実装対象"
  "## 機能仕様"
  "## Interface 設計"
  "## Content / Data 設計"
  "## Performance / Security 設計"
  "## Error / Fallback 設計"
  "## テスト / 評価方針"
  "## フロー / シーケンス"
  "## 実装分割"
  "## 上位資料からの変更点"
  "## レビュー"
  "## 変更履歴"
)

has_exact_line() {
  local line="$1"
  grep -qFx "$line" "$FILE_PATH" 2>/dev/null
}

extract_level2_section() {
  local heading="$1"
  awk -v heading="$heading" '
    $0 == heading {
      in_section = 1
      next
    }
    in_section && /^## / {
      exit
    }
    in_section {
      print
    }
  ' "$FILE_PATH"
}

section_has_exact_line() {
  local heading="$1"
  local line="$2"
  extract_level2_section "$heading" | grep -qFx "$line" 2>/dev/null
}

for section in "${REQUIRED_SECTIONS[@]}"; do
  if ! has_exact_line "$section"; then
    ERRORS+=("必須セクション欠落: $section")
  fi
done

PHASE_COUNT=$(
  extract_level2_section "## 設計フェーズ状況" \
    | grep -cE '^\|[[:space:]]*[0-9]+[[:space:]]*\|' 2>/dev/null \
    || echo "0"
)
if [ "$PHASE_COUNT" -lt 11 ]; then
  ERRORS+=("設計フェーズ状況に 11 フェーズ必要ですが ${PHASE_COUNT} 件しかありません")
fi

if has_exact_line "## スコープ"; then
  if ! section_has_exact_line "## スコープ" '### やること'; then
    ERRORS+=("スコープに「やること」がありません")
  fi
  if ! section_has_exact_line "## スコープ" '### やらないこと'; then
    ERRORS+=("スコープに「やらないこと」がありません")
  fi
fi

SPEC_DESIGN_TOPICS=(
  "### Performance"
  "### Routing / URL State"
  "### Content / Assets"
  "### UI Reuse"
  "### Testing"
)

for topic in "${SPEC_DESIGN_TOPICS[@]}"; do
  if ! section_has_exact_line "## 機能仕様" "$topic"; then
    ERRORS+=("機能仕様の設計論点の節がありません: $topic")
  fi
done

# 正本境界 (Source-of-Truth Boundary): spec-sync 済なら design 正本リンクを促す。
# spec 作成段階 (未 sync) は spec 自身が作業正本でよいため対象外。非ブロッキング警告。
WARNINGS=()
# 正本ハンドオフ先は feature doc / landscape DesignDoc / ADR / context のいずれでもよい (Contract「正本境界」)
SOT_LINK_PATTERN='design/features/[^)]+/DesignDoc_[^)]+\.md|design/DesignDoc\.md|adr/[0-9]+-[^)]+\.md|context/[^)]+\.md'
if extract_level2_section "## 上位資料からの変更点" | grep -q "反映済" 2>/dev/null; then
  if ! grep -qE "$SOT_LINK_PATTERN" "$FILE_PATH" 2>/dev/null; then
    WARNINGS+=("spec-sync 済 (「反映済」行あり) ですが design 側 (feature doc / DesignDoc / ADR / context) への正本リンクが見つかりません。durable な設計成果 (IA / フロー / データモデル / 技術判断等) は design 側を正本にし、spec の該当節は snapshot に降格して正本リンクを張ってください (正本境界)。")
  fi
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo "" >&2
  echo "------------------------------------------------------------" >&2
  echo "[WARN] spec 正本境界チェック" >&2
  echo "ファイル: $FILE_PATH" >&2
  echo "------------------------------------------------------------" >&2
  for warn in "${WARNINGS[@]}"; do
    echo "- $warn" >&2
  done
  echo "------------------------------------------------------------" >&2
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "" >&2
  echo "============================================================" >&2
  echo "[BLOCKED] spec 文書品質ゲート不合格" >&2
  echo "ファイル: $FILE_PATH" >&2
  echo "============================================================" >&2
  for err in "${ERRORS[@]}"; do
    echo "- $err" >&2
  done
  echo "templates/specs/template.md に沿って補完してください。" >&2
  echo "============================================================" >&2
  exit 2
fi

exit 0
