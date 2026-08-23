---
phase: 5
seq: 2
target: web
issue: 4
depends_on:
  [
    P3_02_element_coordinate_resolution.md,
    P4_01_execution_run_and_events.md,
    P5_01_web_store_and_approval.md,
  ]
---

# Stream Proxy を通して操作を記録し draft を組み立てる

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

### ステップ 1: Stream Proxy と入力転送の検証

1. テストを先に書く (中継条件を満たさない入力が破棄されること)
2. `packages/api` に Stream Proxy を実装する。映像フレームの中継と、逆方向の入力転送を同じ経路で行う
3. **入力転送は server 側で検証する**。対象 run が `paused` かつ操作モードかつ要求元のものであることを確かめてから中継する
4. **破棄した入力を `input-discarded` として残す**。破棄の理由を含める。**実行イベント列へ混ぜない**
5. 検証コマンドを実行する
6. diff レビューを回し、指摘を対応する

### ステップ 2: 記録の use case

1. テストを先に書く (座標が `ref` へ解決されること)
2. `packages/app` に記録の use case を実装する
3. **入力を転送する前に box 付き要素一覧を取得**し、座標を要素へ解決してから転送する
4. 解決できたら `click` の step を draft へ入れる。既存定義に無ければ要素定義も同時に draft へ入れる
5. 解決できなければ `clickPoint` として残し警告を付ける。**記録の途中で止めない**
6. 検証コマンドを実行する
7. diff レビューを回し、指摘を対応する

### ステップ 3: Expectation 候補と記録用 run の終了

1. テストを先に書く (変化した項目だけが候補に出ること)
2. 記録を停止したら、**操作の前後で変化した項目**から Expectation 候補を出す (`url` / `title` / `element` のうち変化したもの)
3. 選ばれた候補を step の `expect` へ入れる
4. 記録した steps の遷移元を run の到達状態から決める
5. **記録に使った run は `resume` して `run-completed` で終える**
6. 検証コマンドを実行する
7. diff レビューを回し、指摘を対応する

### ステップ 4: HTTP API

1. テストを先に書く
2. `packages/api` に endpoint を実装する (記録の開始・停止、draft の取得、承認依頼、承認、`run.start`、`rerun_step`、成果物生成)
3. 127.0.0.1 のみに bind し、ローカルトークンを要求する
4. 検証コマンドを実行する
5. diff レビューを回し、指摘を対応する

### ステップ最終: 最終確認

1. 全テスト / lint / typecheck がパスすることを確認する
2. spec の `## 上位資料からの変更点` に必要な追記がないかを確認する (durable な変更が出た場合のみ)
3. PR を Ready に変更しレビュアーを指名する

## 実装コンテキスト

- spec: `specs/4-walking-skeleton/index.md` (D5 / D12 / D15 / D27 / D28、User Flow、Interface 設計)
- 参照する path:
  - `context/architecture.md` (依存方向、Runtime Boundary)
  - `context/infrastructure.md` (bind アドレスとトークンの扱い)
  - `design/features/web-editor/DesignDoc_web-editor.md` (Stream の接続構成、操作の記録 → draft のフロー)
  - `design/features/element-mapping/DesignDoc_element-mapping.md` (記録が要素選択と同じ規則の部分集合を使うこと)
  - `adr/0008-stream-proxy.md` (中継条件と `input-discarded`)
  - `adr/0026-operation-recording.md` (記録の位置づけ、候補の絞り込み、解決の時点)
  - `adr/0024-http-framework.md` (listen は合成ルートが行う)
  - `packages/api/`
  - `packages/app/`

## 前提条件

- 完了しているべき依存 prompt: `P3_02_element_coordinate_resolution.md` / `P4_01_execution_run_and_events.md` / `P5_01_web_store_and_approval.md`
- 完了後に着手可能になる後続 prompt: `P6_01_web_ui_recording_and_approval.md`
- 必要な repo 状態: 座標解決・run の実行・draft の保存が揃っていること

## タスク境界

### 実装する範囲

- Stream Proxy (映像の中継と入力転送)、中継条件の server 側検証、`input-discarded`
- 記録の use case (転送前の解決、`click` の step と要素定義の draft 追加、`clickPoint` と警告)
- Expectation 候補 (変化した項目のみ) と step への反映
- 記録用 run の `resume` による終了
- HTTP API の endpoint と、bind アドレス・トークンの要求

### 実装しない範囲

- Web UI の描画とモード切替の操作 (`P6_01`)
- 座標解決の規則そのもの (`P3_02`)
- run の状態遷移とイベント発行 (`P4_01`)
- 提案依頼キューと AI 候補 (MVP 実装なし)
- MCP / JSON-RPC の agent interface (skeleton の範囲外)

## 設計仕様

- **入力転送は server 側でも検証する。** client 側の制御だけでは、認証を通したクライアントが Proxy へ直接送って迂回できる。迂回されると実行中の run の途中でページ状態が変わり、Expectation の評価が実際の操作と噛み合わなくなる。
- **`input-discarded` を実行イベント列へ混ぜない。** 実行イベントは run 単位で発行順序が決定的だが、破棄は Stream Proxy で起き「要求元の run でない」場合は結びつける run が定まらない。api から core の語彙のイベントを起こす形は依存方向の規約とも擦れる。
- **入力を転送する前に解決する。** 操作後の状態で解決すると、ページが自律的に変化していたときに「解決できない」ではなく**間違った要素へ解決する**。前者は `clickPoint` と警告で気付けるが、後者は静かに壊れる。記録モード中のクリックが遅れる代償を受け入れる。
- **記録は `paused` の run の枠内で行う。** モード切替が一時停止中だけ有効である以上、記録を始めるには `paused` の run が要る。記録した steps の遷移元は run の到達状態から決まる。
- **Expectation の候補は変化した項目だけに絞る。** 機械的に条件を起こすと無関係な要素まで期待状態に入り、壊れやすいステップが量産される。
- **記録は正本を作らない。** 出力は draft であり、正本への反映は人間の承認を経る。
- api は listen しない。プロセスにするのは合成ルートである。

## テスト観点

- 中継条件を満たさない入力が破棄され、`input-discarded` に理由が残ること。**実行イベント列に混ざらないこと**
- 記録: 解決した step が**座標ではなく `ref`** を指すこと。要素定義が同時に draft へ入ること。既存定義に一致する場合に重複定義を作らないこと
- 解決できない操作が `clickPoint` として残り警告が付くこと。記録が止まらないこと
- Expectation 候補: 操作の前後で**変化した項目だけ**が候補に出ること
- 記録用 run が `resume` で `ir-version-changed` → `resumed` → `run-completed` の順に終わること
- 負例: トークン無し / 誤り / 期限切れで拒否されること。127.0.0.1 以外からの接続が届かないこと。自分の待受ポート以外の Origin と Host が 403 になること

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
