#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/../lib/tool_use_input.sh"

FILE_PATH="$(resolve_tool_use_file_path || true)"

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if ! echo "$FILE_PATH" | grep -qE 'specs/[^/]+/prompts/.*\.md$'; then
  exit 0
fi

# 引数 injection 防止: 外部入力の path が "-" で始まる場合は扱わない
case "$FILE_PATH" in -*) exit 0 ;; esac
[ -f "$FILE_PATH" ] || exit 0

ERRORS=()

REQUIRED_SECTIONS=(
  "## 絶対ルール"
  "## 作業ステップ"
  "## 実装コンテキスト"
  "## 前提条件"
  "## 不明点ハンドリング"
  "## タスク境界"
  "## 設計仕様"
  "## テスト観点"
  "## 検証コマンド"
  "## 完了条件"
)

for section in "${REQUIRED_SECTIONS[@]}"; do
  if ! grep -qF -- "$section" "$FILE_PATH" 2>/dev/null; then
    ERRORS+=("必須セクション欠落: $section")
  fi
done

if grep -qF -- "## タスク境界" "$FILE_PATH" 2>/dev/null; then
  if ! grep -qF -- '### 実装する範囲' "$FILE_PATH" 2>/dev/null; then
    ERRORS+=("タスク境界に「実装する範囲」がありません")
  fi
  if ! grep -qF -- '### 実装しない範囲' "$FILE_PATH" 2>/dev/null; then
    ERRORS+=("タスク境界に「実装しない範囲」がありません")
  fi
fi

if grep -qF -- "## 完了条件" "$FILE_PATH" 2>/dev/null; then
  if ! grep -qE -- '^\s*- \[ \]' "$FILE_PATH" 2>/dev/null; then
    ERRORS+=("完了条件がチェックリスト形式ではありません")
  fi
fi

if grep -qF -- "## 絶対ルール" "$FILE_PATH" 2>/dev/null; then
  if ! grep -qF -- '実装アンチパターンの回避' "$FILE_PATH" 2>/dev/null; then
    ERRORS+=("絶対ルールに実装アンチパターンの回避ブロックがありません (spec-lifecycle/references/antipatterns.md を注入)")
  fi
fi

# 機械可読 frontmatter: 先頭が --- で始まり、実行契約 5 キーを持つこと
# (後段のツール・実行者が本文を読まずに実行順・対象・実依存を解決する契約)
if [ "$(head -1 -- "$FILE_PATH" 2>/dev/null)" != "---" ]; then
  ERRORS+=("先頭に機械可読 frontmatter (--- 〜 ---) がありません: phase / seq / target / issue / depends_on を記載してください")
else
  FRONTMATTER="$(awk 'NR==1{next} /^---$/{exit} {print}' "$FILE_PATH")"
  for key in phase seq target issue depends_on; do
    if ! echo "$FRONTMATTER" | grep -qE "^${key}:"; then
      ERRORS+=("frontmatter にキー \`${key}:\` がありません")
    fi
  done
fi

# 探索誘発表現: 自己完結性 (探索禁止) を破る表現を検出する
EXPLORATION_PATTERNS=(
  '既存コードを参照'
  '既存実装を参照'
  '既存コードを確認'
  '既存実装を確認'
  '既存の.*配下.*参照'
  '既存の.*配下.*確認'
  '実装パターンを参照'
  'コードベースを調査'
  '配下の既存実装'
  '既存コードを参考に'
)
for pattern in "${EXPLORATION_PATTERNS[@]}"; do
  match="$(grep -nE -- "$pattern" "$FILE_PATH" 2>/dev/null | head -1 || true)"
  if [ -n "$match" ]; then
    ERRORS+=("探索誘発表現 (L$(echo "$match" | cut -d: -f1): 「${pattern}」に一致)。具体的な path 参照 (context/impact-index.yaml の read: など) に置き換えてください")
  fi
done


if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "" >&2
  echo "============================================================" >&2
  echo "[BLOCKED] spec prompt 品質ゲート不合格" >&2
  echo "ファイル: $FILE_PATH" >&2
  echo "============================================================" >&2
  for err in "${ERRORS[@]}"; do
    echo "- $err" >&2
  done
  echo ".rulesync/skills/spec-lifecycle/references/prompt-template.md に沿って補完してください。" >&2
  echo "============================================================" >&2
  exit 2
fi

exit 0
