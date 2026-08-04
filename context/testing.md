---
type: context
title: Testing Conventions
description: テスト責務の分担と runtime contract の横断規約。現在は技術スタック ADR 待ちで大半が未確定
keywords: [testing, unit test, e2e, テスト方針]
governs:
  - <実装ディレクトリ確定後に記入>
verified_commit: unverified
---

# Testing Conventions

テストの横断規約。feature 固有のテスト観点は各 [design/features/](../design/features/) に置く。プロジェクト固有のテストコマンドは [context/project.yml](project.yml)。

> 未確定: テストツールと配置は技術スタック ADR (未作成) の確定後に埋める。core 層 (冪等判定・採番規則・決定的生成・差分分類) は外部依存を持たない純粋ロジックとして設計するため、unit test の主対象とする方針だけ先に確定する。

## テスト責務の分担

| 種別      | 配置 | 主担当範囲 |
| --------- | ---- | ---------- |
| Unit test |      |            |
| E2E       |      |            |

## テスト runtime contract

- E2E / 統合テストの起動契約 (env 変数 / 対象選択 / port 等)。新しい対象を追加する手順を含める。

## 横断テスト方針

- 公開 / リリース判定に含めるテスト観点。
