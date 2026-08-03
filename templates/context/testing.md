---
type: context
title: <文書名>
description: <索引に出す 1 行説明。何が書いてあるかを具体的に>
keywords: [<検索の手掛かり>, <API 名>, <用語>]
governs:
  # この文書が語る契約の実装場所。コードだけでなく設定ファイルでもよい。
  # 鮮度検査の対象外にするなら governs と verified_commit の両方を消す。
  - <path/to/impl>
# 最後に実装と突き合わせた commit。未確認なら unverified のままにする。
verified_commit: unverified
---

# Testing Conventions

テストの横断規約。feature 固有のテスト観点は各 [design/features/](../design/features/) に置く。プロジェクト固有のテストコマンドは [context/project.yml](project.yml)。

## テスト責務の分担

| 種別      | 配置 | 主担当範囲 |
| --------- | ---- | ---------- |
| Unit test |      |            |
| E2E       |      |            |

## テスト runtime contract

- E2E / 統合テストの起動契約 (env 変数 / 対象選択 / port 等)。新しい対象を追加する手順を含める。

## 横断テスト方針

- 公開 / リリース判定に含めるテスト観点。
