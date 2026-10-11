---
type: context
title: 業務の知識
description: 用語の定義と、概念ごとの文書の一覧。状態と遷移、不変条件は概念ごとに domain/ に置く
status: draft
---

# 業務の知識

## Glossary

- 冪等実行: 期待状態をすでに満たしているステップを再実行せず、「変更なし」として記録する実行の方式
- 期待状態: DSL がステップごとに宣言する、実行の後に満たされるべき画面の状態
- 永続要素 ID: 画面要素の同一性を追うための識別子。表示用の構成番号とは独立している
- 構成番号: 画面仕様書の画像とテーブルで要素を参照するための、表示用の番号
  - 状態ごとに 1 から振る。state の `badges` の順序のリストを基準にし、読み順で振り直して管理する。
  - ADR-0005: [構成番号の再採番](../adr/0005-renumbering.md)
- Baseline: 人間が承認した時点の実行結果のセット。生のスクリーンショット、Snapshot、`badges`、Screen IR を含む
  - `(screen, state, authProfile)` の組で識別する。差分を比べる基準で、承認によってだけ更新される。
- draft: 承認の前の作業の状態。エージェントと利用者が自由に作って編集でき、確定済みのデータには反映されない
- 確定: 人間の承認によって、draft を確定済みのデータへ反映する操作。対象は DSL の変更、構成番号（NumberingPlan）、Baseline の更新の 3 つ
- agent interface: AI エージェントが use case を操作するための interface。MCP server と App Server 型 JSON-RPC の 2 つがある
- POM（Page Object Model）: 画面を 1 つのクラス、要素を locator のプロパティ、操作をメソッドとして表す E2E テストの設計のパターン
  - このシステムは、Workflow IR から編集を禁じた生成物として POM を出力する。
  - ADR-0006: [Playwright POM の出力](../adr/0006-playwright-pom-output.md)
- Workflow IR: YAML の DSL を、実行しやすい形へ正規化した内部の表現。core/workflow が生成し、実行系は YAML ではなく Workflow IR を入力に取る
- Screen IR: Screen 文書を正規化した内部の表現。要素の定義、状態、構成番号を持ち、成果物の生成と差分検知の入力になる
- DSL: 画面の操作と画面の仕様を宣言する、YAML の形式の記法。Screen 文書と Workflow 文書の 2 種類に分かれる
  - ADR-0003: [DSL の構造](../adr/0003-dsl-structure.md)
- MVP: PRD の Milestones に挙げた最初の段階。User Stories の一続きの操作を通しで完了できる範囲。クラウドでの利用、チームでの利用、CI での実行は含まない
- CI: 継続的インテグレーション。差分検知の CI での実行は MVP の対象外で、PRD の Lower-Priority Goals に置く
- C4 モデル: システムを Context、Container、Component、Code の 4 つの階層で描く図法。PRD では L1 の System Context を、全体像の Design Doc では L2 の Container を使う
- 認証プロファイル: 対象アプリへログインした状態に付ける名前。コードでは `authProfile` と書く
  - run を実行するときのパラメータで指定し、DSL には書かない。
  - ADR-0022: [認証状態の保存](../adr/0022-auth-state-storage.md)
- 提案依頼キュー: 人間が候補の生成を依頼し、エージェントが取りに来る pull 型のキュー
  - 依頼を 1 つのエージェントに割り当てない。期限を過ぎた依頼は expired にし、手動の操作へ戻す。
  - ADR-0020: [提案依頼の pull 型キュー](../adr/0020-suggestion-pull-queue.md)
- 合成ルート: adapter の具象を選んで use case へ注入する唯一の場所。`apps/server` が担う
  - ADR-0023: [合成ルート](../adr/0023-composition-root.md)

## Concepts

- [draft と確定](domain/draft-and-confirmation.md): エージェントと利用者の編集を draft に置き、人間の承認で確定済みのデータへ反映する。
- ほかの概念を `domain/` に分けるかどうかは未定。
