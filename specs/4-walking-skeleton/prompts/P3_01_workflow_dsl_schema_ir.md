---
phase: 3
seq: 1
target: workflow
issue: 4
depends_on: [P2_01_execution_browser_port.md]
---

# DSL の語彙を Schema 化し Workflow IR へ正規化する

## 絶対ルール

- spec に明記された範囲だけを対象にする
- 不明点は推測で埋めず、停止してユーザーに確認する
- 参照 path を外れて広く探索しない (Grep / Glob / 既存実装の探索は禁止)
- 別 app / package を追加探索せず、この prompt 内の情報だけで判断する
- 各作業ステップに含まれる検証 / レビュー手順をスキップしない
- **完了条件のタスク化**: 作業開始前に「完了条件」セクションの各項目を todo として登録し、各ステップ完了時に状態を更新すること。タスク化せずに作業を開始することは禁止

### 実装アンチパターンの回避 (必守)

- スコープ厳守: spec / 本 prompt に明記された機能のみ実装する。未要求の機能追加・先回りの抽象化・無関係なリファクタ・暗黙の互換維持をしない。
- 既存規約への整合: 命名・エラー処理・ログ・テスト・API 連携方式は、対象コードベースの既存パターンに合わせる。新方式を持ち込む場合は理由を述べて確認を取る。
- 観測可能な契約の保持: UI 文言・イベント名・戻り値・エラーメッセージ・ログ形式・API を要求なく変更しない。変更が必要なら理由と影響を明記する。
- 推測の排除: 要件・業務ルール・API 仕様が不明なら停止して確認する。それらしいが誤った実装 (存在しない API 呼び出し / 非互換な引数) を避け、import と API の実在を確認する。
- fallback の最小化: `??` / `||` / 既定引数 / 多段 fallback / 暗黙のエラー握り潰しは「任意データ」に限定する。必須データの欠落は隠さず明示的に失敗させる。
- 過剰実装の排除: 単純な条件分岐を strategy / handler map に置換しない。要求も計測もない caching / memoization を入れない。
- dead code を残さない: 到達不能コード・未使用の変数 / 関数 / import / export・変更後に不要化した型定義を削除する。
- 判断の記録: 非自明な設計判断は理由 (or spec / ADR へのリンク) を残す。

## 作業ステップ (この順序で実行する)

### ステップ 0: ブランチ準備と着手記録

ブランチ命名と base branch は `context/project.yml` の `naming.branch` および `workflow-git` に従う。

1. 対象 issue の `status:*` が `status:implementing` でなければ付け替え、状態遷移コメントを残す (`workflow-git` の `references/issue-status.md`。既に implementing なら何もしない)
2. 最新の base branch を取得する
3. 作業ブランチ `feature/4` を作成する (既にある場合は最新へ追従させる)
4. PR テンプレートを確認し、完了条件を description に転記する
5. Draft PR を作成して push する

### ステップ 1: Schema 検証

1. テストを先に書く (正例と負例の両方)
2. `packages/core-workflow` に Screen 文書と Workflow 文書の JSON Schema を置く
3. **workflow-dsl feature の語彙を一通り**定義する (action / Expectation / 状態モデル / 要素定義 / badges / fragments)
4. 検証コマンドを実行する
5. diff レビューを回し、指摘を対応する

### ステップ 2: IR 正規化

1. テストを先に書く
2. 参照解決 (`entry.workflow` / `use` / `ref`)、継承と遷移の展開、既定値の補完と変数展開、ID と badges の検査を実装する
3. Screen IR と実行ステップ列の 2 ビューを生成する
4. 展開の停止性 (循環参照 / 入れ子の深さ / 展開後のステップ数) を構造化エラーで返す
5. 検証コマンドを実行する
6. diff レビューを回し、指摘を対応する

### ステップ 3: 未対応語彙の構造化エラー

1. テストを先に書く (skeleton が対応しない語彙が弾かれること)
2. **Schema は受け付けるが実行系が対応していない語彙**を IR 正規化で弾く
3. `action/unimplemented` / `expect/unimplemented` として、どの語彙が未対応かを返す
4. 検証コマンドを実行する
5. diff レビューを回し、指摘を対応する

### ステップ最終: 最終確認

1. 全テスト / lint / typecheck がパスすることを確認する
2. spec の `## 上位資料からの変更点` に必要な追記がないかを確認する (durable な変更が出た場合のみ)
3. PR を Ready に変更しレビュアーを指名する

## 実装コンテキスト

- spec: `specs/4-walking-skeleton/index.md` (D8 / D14 / D23、実装対象の `workflow`)
- 参照する path:
  - `context/architecture.md` (依存方向、core は純粋ロジック)
  - `design/features/workflow-dsl/DesignDoc_workflow-dsl.md` (文書構造、状態モデル、語彙、IR 正規化、Schema 検証とバージョン)
  - `adr/0011-dsl-as-source-of-truth.md`
  - `packages/core-workflow/`
  - `packages/domain/`

## 前提条件

- 完了しているべき依存 prompt: `P2_01_execution_browser_port.md`
- 完了後に着手可能になる後続 prompt: `P4_01_execution_run_and_events.md` / `P4_02_artifact_svg_and_table.md` / `P5_01_web_store_and_approval.md`
- 必要な repo 状態: なし

## タスク境界

### 実装する範囲

- Screen 文書と Workflow 文書の Schema (語彙を一通り)
- IR 正規化 (参照解決 / 継承展開 / 既定値補完 / ID と badges の検査 / 停止性の検査)
- Screen IR と実行ステップ列の 2 ビュー
- 未対応語彙の構造化エラー

### 実装しない範囲

- ステップの実行と Expectation の評価 (`P4_01`)
- 構成番号の再採番 (skeleton は要素が 1 つで番号は 1 固定)
- POM 生成 (`outputs: [spec]` のみ)
- DSL Fix Port の実装 (MVP 実装なし)

## 設計仕様

- **Screen と Workflow の 2 文書構成。** `open` は Screen 文書ではなく、entry として参照する Workflow 文書に置かれる。実行ステップ列は `entry → default → 対象状態` の順で平坦化する。
- **skeleton が通すのは `open` と `click`、Expectation は `url` と `element` に限る。** Schema は語彙を一通り受け付けるが、実行系が対応しない語彙は IR 正規化で構造化エラーにする。黙って無視すると、書いたステップが実行されないまま `skipped` として記録されうる。
- **entry の `open` step には `url` の Expectation を書く。** Expectation を持たないステップは評価を省いて必ず action を実行するため、`expect` が無いと「全ステップが `skipped`」が成立しない。
- **`default` 状態の `expect` は空でよい。** `default` は遷移 step を持たない状態であり実行対象ではないため、上の規則の影響を受けない。
- **`badges` のリスト位置がそのまま構成番号になる。** 要素定義は番号を持たない。
- IR のステップは `action + expectation + 由来` を持つ。由来情報により実行イベントや差分を DSL の該当箇所へ逆引きできる。

## テスト観点

- Schema: workflow-dsl の語彙を一通り検証できること。負例 (未知の action / 型違い / 必須欠落) が弾かれること
- 参照解決: `entry.workflow` / `use` / `ref` の未解決参照がエラーになること
- 停止性: 自己参照と相互参照が展開前に検出されること。深さとステップ数の上限を超えたらエラーになること
- 実行系が未対応の語彙が `action/unimplemented` / `expect/unimplemented` になること
- 同じ DSL からは同じ IR が出ること (決定性)

## 検証コマンド

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm boundaries`

## 不明点ハンドリング

- 矛盾 / 欠落 / 未定義を見つけたら作業を止める
- 推測で実装を進めない
- 質問するときは「止まっている作業単位 / 判断が必要な論点 / 選択肢」を整理して提示する
- spec と実装が食い違う場合、spec を正としてよいか確認してから進む

## 完了条件

- [ ] ステップ 0 でブランチと Draft PR を作成した
- [ ] 全ステップを順序通りに実行した
- [ ] 各ステップで diff レビューを実施し、指摘を対応した
- [ ] `## 検証コマンド` がすべてパスする
- [ ] `## タスク境界` の「実装しない範囲」に手を出していない
- [ ] PR を Ready に変更しレビュアーを指名した
- [ ] 未解決の仕様質問が残っていない
