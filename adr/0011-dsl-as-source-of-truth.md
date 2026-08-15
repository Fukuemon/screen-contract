# ADR-0011: YAML DSL を画面操作と画面仕様の唯一の正本とする

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- 画面仕様を手動管理すると、画像・構成要素テーブル・操作スクリプトがそれぞれ別の正本になり、番号の不一致・古い画像の残存・要素定義の重複割当が起きる (DesignDoc の Why)。
- 操作をコマンド列や一時的なスクリプトとして記録するだけでは、操作対象・期待状態・構成番号・変更差分の意味が残らない。

## 決定

- **YAML DSL (Screen / Workflow の 2 文書) を、画面操作と画面仕様の唯一の正本とする**。
- 注釈画像・Markdown テーブル・Playwright POM はすべて DSL からの生成物とし、個別に編集可能な正本にしない (POM の編集禁止は [adr/0006](0006-playwright-pom-output.md))。
- 実行系は YAML を直接扱わず、core/workflow が正規化した Workflow IR を使用する。

## 代替案

- **成果物 (画像・テーブル・スクリプト) をそれぞれ編集可能な正本にする**: 現状の手動管理と同じ同期問題 (番号不一致・古い成果物の残存) が再発するため却下。
- **Playwright スクリプト等のコードを正本にする**: 操作の再現はできるが、期待状態・構成番号・仕様書の文書化語彙を持たず、非エンジニアの編集と AI エージェントの安全な部分編集 (Schema 検証で守られた draft 編集) が成立しないため却下。
- **録画 (操作記録) を正本にする**: 再現は座標・タイミング依存で脆く、宣言的な期待状態や冪等スキップを表現できないため却下。

## 影響

### 良い影響

- 画像・テーブル・POM・実行が常に同じ正本から導出され、同期ずれが構造的に起きない。
- Schema 検証と構造化エラーにより、人間とエージェントの双方が安全に編集できる。

### 悪い影響 / トレードオフ

- 生成物の直接編集を禁止する運用制約が生まれる。表現力の不足はその都度 DSL の語彙拡張 (version 互換規則) で吸収する必要がある。

### 影響範囲

- 対象モジュール / package: workflow / execution / element / artifact / diff

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否: [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新 — 本 commit で実施

## 関連ドキュメント / チケット

- [design/features/workflow-dsl/DesignDoc_workflow-dsl.md](../design/features/workflow-dsl/DesignDoc_workflow-dsl.md)
- [adr/0003](0003-dsl-structure.md): DSL の 2 文書分離 / [adr/0006](0006-playwright-pom-output.md): POM は生成物
- spec / PR: なし
