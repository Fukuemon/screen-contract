---
phase: 3
seq: 2
target: element
issue: 4
depends_on: [P2_01_execution_browser_port.md]
---

# 座標から要素を解決し要素定義の候補を作る

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

### ステップ 1: 座標解決の純粋関数

1. テストを先に書く (座標が box に当たる / 当たらない / 複数に当たる)
2. `packages/core-element` に「座標 + box 付き要素一覧」を入力とする純粋関数を実装する
3. 座標を含む要素のうち、**操作可能で意味のある role を持つ最小のもの**を第一候補にする
4. 検証コマンドを実行する
5. diff レビューを回し、指摘を対応する

### ステップ 2: Locator の生成と分類

1. テストを先に書く (`resolved` / `not-found` / `ambiguous`)
2. 候補について **role + name** の Locator を生成する。その一覧の中で一意に解決できるものだけを提案する
3. 一意にならない場合は `ambiguous` として分類する
4. 検証コマンドを実行する
5. diff レビューを回し、指摘を対応する

### ステップ 3: 要素定義の生成と既存定義との突合

1. テストを先に書く (既存定義に一致する場合に重複を作らないこと)
2. 既存の要素定義に一致すれば、新しい候補を作らずその `ref` を使う
3. 一致しなければ、永続要素 ID を持つ要素定義を新規に作る
4. **一意な Locator へ解決できない場合は `clickPoint` として残し、警告を付ける**
5. 検証コマンドを実行する
6. diff レビューを回し、指摘を対応する

### ステップ最終: 最終確認

1. 全テスト / lint / typecheck がパスすることを確認する
2. spec の `## 上位資料からの変更点` に必要な追記がないかを確認する (durable な変更が出た場合のみ)
3. PR を Ready に変更しレビュアーを指名する

## 実装コンテキスト

- spec: `specs/4-walking-skeleton/index.md` (D1 / D18、実装対象の `element`)
- 参照する path:
  - `context/architecture.md` (core は純粋ロジック、Port の定義場所)
  - `design/features/element-mapping/DesignDoc_element-mapping.md` (永続要素 ID、Locator モデル、座標からの要素解決と候補の正規化)
  - `adr/0012-element-id-number-separation.md` (ID と番号の分離)
  - `adr/0026-operation-recording.md` (記録が同じ規則を使うこと)
  - `packages/core-element/`
  - `packages/domain/`

## 前提条件

- 完了しているべき依存 prompt: `P2_01_execution_browser_port.md`
- 完了後に着手可能になる後続 prompt: `P5_02_web_stream_proxy_and_recording.md`
- 必要な repo 状態: なし
- 本 prompt は `P3_01_workflow_dsl_schema_ir.md` と**並列実行できる** (target が異なり変更ファイルが衝突しない)

## タスク境界

### 実装する範囲

- 座標 + box 付き要素一覧を入力とする純粋関数
- role + name の Locator 生成と `resolved` / `not-found` / `ambiguous` の分類
- 既存の要素定義との突合と、永続要素 ID を持つ要素定義の生成
- 解決できない場合の `clickPoint` と警告

### 実装しない範囲

- **祖先方向の候補列** (要素選択の機能であり skeleton のスコープに無い)
- **`label` / `testid` の優先順位** (fixture が role と name で一意に解決できることを保証するため不要)
- 構成番号の再採番 (要素が 1 つで番号は 1 固定)
- AI Port の実装 (MVP 実装なし)
- box 付き要素一覧の取得 (`P2_01` の Browser Port が返す)

## 設計仕様

- **入力値として受け取る。** core/element はブラウザへ直接アクセスしない。Snapshot・座標・box は引数である。
- **bounding box は Accessibility Snapshot の応答に含まれるとは限らない。** 取得手段は adapter/browser に閉じており、core/element は取得手段を問わない。
- **永続要素 ID を実行基盤の一時的な要素参照に載せない。** 実行基盤の ref は撮影ごとに振り直される。Locator は毎回の Snapshot に対して解決する。
- **skeleton の解決は role+name までとする。** 祖先方向の候補列は「ボタンではなくカード全体を選びたい」場合の切り替え用で、要素選択の機能である。記録では第一候補だけで足りる。
- **記録も要素選択と同じ規則の部分集合を使う。** 記録専用の解決規則を作らない。違いは 2 点だけで、既存定義に一致すればその `ref` を使うことと、解決できない場合に記録では止めずに `clickPoint` と警告を残すことである。

## テスト観点

- 座標 → 最小ノードの選択が正しいこと
- `resolved` / `not-found` / `ambiguous` の分類
- 一意にならない Locator を提案しないこと
- 既存定義に一致する場合に重複定義を作らないこと
- 解決できない場合に `clickPoint` と警告が残ること
- 同じ入力から同じ出力になること (決定性)

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
