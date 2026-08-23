---
phase: 2
seq: 1
target: execution
issue: 4
depends_on: [P1_01_infra_agent_browser_bundling.md, P1_02_infra_fixture_app.md]
---

# Browser Port の契約を定め agent-browser で実装する

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

### ステップ 1: Browser Port の契約定義 (core/execution)

1. テストを先に書く (fake 実装で契約を満たすこと)
2. `packages/core-execution` に Browser Port を型として定義する
   - セッション: `createSession` / `closeSession` / `keepalive`
   - 認証: `createSession` は**認証コンテキストを必須の引数で受ける** (skeleton は匿名を明示的に渡す)
   - コマンド: 型付きの action 実行
   - 取得: Snapshot、スクリーンショット、**box 付き要素一覧**、現在 URL
   - 配信: ライブ映像ストリームのハンドル取得
   - 不応答: `browser/unresponsive` の構造化エラー
3. 検証コマンドを実行する
4. diff レビューを回し、指摘を対応する

### ステップ 2: adapter/browser の実装

1. テストを先に書く (CLI の引数組み立てと `--json` のパース)
2. `packages/adapter-browser` に Port の実装を置く
   - プラットフォーム別のバイナリパス解決 (`darwin` / `linux` / `linux-musl` / `win32` × `arm64` / `x64`)
   - **ネイティブバイナリを直接 spawn** し、引数は配列で渡す
   - Chrome for Testing の実行ファイルのパスを**常に明示**する
   - box 付き要素一覧は注釈スクリーンショットの応答から得る。**生成された注釈済み画像は保存せず捨てる**
   - 不応答を `browser/unresponsive` の構造化エラーへ変換する。**黙ってセッションを作り直さない**
3. 検証コマンドを実行する
4. diff レビューを回し、指摘を対応する

### ステップ 3: 合成ルートへの結線

1. `apps/server` の合成ルートで adapter の具象を選び、app へ注入する
2. セッションの回収を終了処理へ入れる (**daemon は落とさない**)
3. 検証コマンドを実行する
4. diff レビューを回し、指摘を対応する

### ステップ最終: 最終確認

1. 全テスト / lint / typecheck がパスすることを確認する
2. spec の `## 上位資料からの変更点` に必要な追記がないかを確認する (durable な変更が出た場合のみ)
3. PR を Ready に変更しレビュアーを指名する

## 実装コンテキスト

- spec: `specs/4-walking-skeleton/index.md` (D1 / D3 / D4 / D26、実装対象の `execution`)
- 参照する path:
  - `context/architecture.md` (依存方向、Port の定義場所、Runtime Boundary)
  - `design/features/execution/DesignDoc_execution.md` (Browser Port の契約、不応答の扱い)
  - `adr/0027-agent-browser-bundling.md` (CLI の呼び方)
  - `adr/0022-auth-state-storage.md` (認証コンテキスト必須の理由)
  - `packages/core-execution/`
  - `packages/adapter-browser/`
  - `apps/server/src/compose.ts`

## 前提条件

- 完了しているべき依存 prompt: `P1_01_infra_agent_browser_bundling.md` / `P1_02_infra_fixture_app.md`
- 完了後に着手可能になる後続 prompt: `P3_01_workflow_dsl_schema_ir.md` / `P3_02_element_coordinate_resolution.md`
- 必要な repo 状態: ブラウザ本体が導入済みで起動時検査が通ること

## タスク境界

### 実装する範囲

- Browser Port の型定義 (core/execution)
- adapter/browser の実装 (CLI 呼び出し、パス解決、`--json` のパース、構造化エラー)
- 合成ルートでの注入とセッションの回収

### 実装しない範囲

- ステップ実行のルールと冪等スキップ (`P4_01`)
- 座標から要素への解決規則 (`P3_02`)
- Stream Proxy の中継と入力の検証 (`P5_02`)
- 認証プロファイルの復号と注入 (skeleton は匿名のみ。契約としては受け取る)

## 設計仕様

- **CLI / SDK の呼び出し形式・JSON パースは adapter 内に閉じ、Port は型付き結果のみ返す。** プラットフォーム別のバイナリパス解決も adapter に閉じる。
- **認証コンテキストは省略可能にしない。** 省略できると「認証なし」が既定になり、意図しないプロファイルでの実行と Baseline の汚染を招く。認証しない場合も匿名であることを明示する。
- **`browser/unresponsive` を adapter が握りつぶさない。** セッションは部分的に壊れる (Snapshot は成功し続けるのにスクリーンショットだけが恒久的に失敗する状態が実在する) ため生存確認では検出できない。再作成はページ状態を失う操作であり、adapter が黙って作り直すと同一セッションでの再実行を前提とする検証が静かに壊れる。再作成の可否は core/execution が決める。
- **box 付き要素一覧は注釈スクリーンショットの応答から得る。** Accessibility Snapshot の応答に bounding box は含まれない。生成された注釈済み画像は保存しない (差分検知の対象は生スクリーンショットであり、注釈済み画像と紛らわしくなる)。
- **daemon は落とさない。** 回収するのはセッションまでである。

## テスト観点

- Port の相手を fake にした unit test で契約が満たされること
- `createSession` に認証コンテキストが必ず渡ること
- `browser/unresponsive` の構造化エラーが返ること。**adapter が黙ってセッションを作り直さないこと**
- CLI の引数が配列で渡ること (文字列連結でシェルに解釈させないこと)
- 実起動する統合テストは `P7_01` で書く。本 prompt では fake での検証に留める

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
