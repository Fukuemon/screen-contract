# walking skeleton: 記録 → 再現 → 成果物を 1 画面で通す

## メタ情報

- Issue: `#4`
- ステータス: `Draft`
- 作成日: 2026-08-22
- 更新日: 2026-08-23
- Branch: `feature/4`
- Owner: Fukuemon

## 設計フェーズ状況

状態は `未着手 / 進行中 / 完了 / レビュー済 / 保留` のいずれか。保留の場合は理由を備考に残す。

| #   | フェーズ                    | 状態   | 最終更新   | 備考                                                |
| --- | --------------------------- | ------ | ---------- | --------------------------------------------------- |
| 1   | 起票                        | 完了   | 2026-08-22 | intake checklist で再検証済み。差し戻す欠落なし     |
| 2   | 下書き                      | 完了   | 2026-08-22 | 実装突合: 対象外 (実装は scaffold の stub のみ)     |
| 3   | 上位文書突合                | 完了   | 2026-08-22 | 変更提案 3 件を検出 (ADR-0026 / ADR-0027 / context) |
| 4   | 論点整理                    | 完了   | 2026-08-22 | D1〜D12 を起票                                      |
| 5   | 論点解決                    | 完了   | 2026-08-22 | D1〜D23 を確定。未決ゼロ                            |
| 6   | Interface / Routing 設計    | 未着手 |            |                                                     |
| 7   | Content / Data 設計         | 未着手 |            |                                                     |
| 8   | Performance / Security 設計 | 未着手 |            |                                                     |
| 9   | Test / Metrics 設計         | 未着手 |            |                                                     |
| 10  | 実装分割                    | 未着手 |            |                                                     |
| 11  | レビュー済                  | 進行中 | 2026-08-23 | 4 回目の指摘 4 件を反映。5 回目のレビュー待ち       |

## 上位文書整合

正本 ([Design Doc](../../design/DesignDoc.md) / [feature doc](../../design/features/) / [context](../../context/) / ADR) のどの節と、どう整合させたかを記録する。PRD は統合モードのため Design Doc の Why/What 節が該当する。

- PRD 更新要否: **要**。統合モードのため対象は Design Doc の Why/What 節。成功条件「構成番号付き PNG 画像」の一般化 (D11)
- Design Doc 更新要否: **要**。成功条件「構成番号付き PNG 画像」の一般化 (D11) と、Runtime Boundary の記述 (context/architecture.md 起因) の 2 件
- ADR 起票要否: **要**。注釈画像の形式を SVG とする判断 (D11) を新規 ADR とする。既存 ADR は 0002 (D15 / D19 / D22) / 0017 (D9) / 0026 (D1 / D5 / D12) / 0027 (D2 / D3) を改訂する

| 上位文書                         | 節 / 該当箇所                                             | 整合方針 (継承 / 補足 / 変更提案)        |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Design Doc                       | スコープ → 冪等実行 / 要素同一性 / 成果物生成 / 記録      | 継承                                     |
| Design Doc                       | モジュール責務 → core 層 / adapter/browser / 合成ルート   | 継承                                     |
| Design Doc                       | Non Goals → 任意 JS の無制限実行                          | 継承 (D1 の選択肢が接触する)             |
| Design Doc                       | Why/What → 成功条件「構成番号付き PNG 画像」              | **変更提案** (D11 が SVG へ変える)       |
| feature doc: workflow-dsl        | 文書構造 / 状態モデル / action 語彙 / Expectation 語彙    | 補足 (skeleton の最小部分集合)           |
| feature doc: execution           | ステップ実行のルール / Browser Port の契約 / 実行イベント | 補足 (D4 が契約に 1 項目を足す)          |
| feature doc: element-mapping     | 座標からの要素解決と候補の正規化                          | 補足 (D1 が取得手段を確定する)           |
| feature doc: artifact-generation | 注釈画像の描画規則 / 書き換え抑止                         | 補足 (D11 が描画手段を確定する)          |
| feature doc: web-editor          | 操作の記録 → draft のフロー / Stream の接続構成           | 継承                                     |
| context: architecture            | Package Boundary / 依存方向 / Port の定義場所             | 継承                                     |
| context: architecture            | Runtime Boundary → agent-browser の起動と管理             | 変更提案 (実測と生存期間がずれる)        |
| context: architecture            | State Boundary → draft と確定の分離                       | 変更提案 (D7 が置き場の分割を足す)       |
| context: testing                 | テスト責務の分担 / fixture 対象アプリ / runtime contract  | 補足 (D10 が隔離手段を確定する)          |
| context: infrastructure          | 起動時に検査するもの                                      | 変更提案 (D2 が案内文を変える)           |
| context: toolchain               | 標準スタック / 採用方針                                   | 変更提案 (D2 / D13 / D21 が項目を足す)   |
| ADR-0002                         | pause の意味論 (ステップ境界 / 完了後停止の予約)          | 変更提案 (D15 / D19 が拡張する)          |
| ADR-0008                         | Stream Proxy の経路と入力転送の検証                       | 継承 (実測で裏付け済み)                  |
| ADR-0012                         | 永続要素 ID と構成番号の分離                              | 継承 (実測で必要性を再確認)              |
| ADR-0017                         | draft と確定の境界 / revision 固定                        | 変更提案 (D9 が revision の方式を定める) |
| ADR-0026                         | 操作の記録 / 座標を残さない / 未確認事項                  | 変更提案 (D5 / D12 が候補の範囲を絞る)   |
| ADR-0027                         | agent-browser の同梱 / ブラウザの起動時検査 / 未確認事項  | 変更提案 (根拠と手段が実測と違う)        |

> 変更提案は clarify で結論が出ている。durable な反映は `spec-lifecycle` の sync phase で行う。

## 関連資料

- `design/DesignDoc.md`: スコープ / Goal / モジュール責務 / Non Goals
- `design/features/workflow-dsl/DesignDoc_workflow-dsl.md`: Screen 文書の構造、状態モデル、action と Expectation の語彙
- `design/features/execution/DesignDoc_execution.md`: ステップ実行のルール、Browser Port の契約、実行イベント
- `design/features/element-mapping/DesignDoc_element-mapping.md`: 座標からの要素解決、Locator モデル
- `design/features/artifact-generation/DesignDoc_artifact-generation.md`: 注釈画像とテーブルの生成、書き換え抑止
- `design/features/web-editor/DesignDoc_web-editor.md`: 記録の UI フロー、Stream の接続構成
- `context/architecture.md`: 依存方向、Port の定義場所、Runtime Boundary
- `context/testing.md`: テスト 3 層の責務、fixture 対象アプリ、runtime contract
- `context/infrastructure.md`: 起動時に検査するもの、秘密情報の置き場、常駐サーバの接続先
- `context/toolchain.md`: 標準スタックと採用方針
- `adr/0002-pause-semantics.md` / `adr/0008-stream-proxy.md` / `adr/0012-element-id-number-separation.md` / `adr/0017-agent-draft-boundary.md` / `adr/0026-operation-recording.md` / `adr/0027-agent-browser-bundling.md`
- 関連 issue: `#3` (親 epic: MVP 実装)
- 事前調査: agent-browser 0.34.0 の実挙動確認 (本 spec の「事前調査で確定した事実」節に転記済み)

## 背景

本プロダクトの主な不確実性は 2 つで、どちらも実際に動かすまで設計の妥当性を確かめられない。

- **agent-browser の実挙動。** JS/TS の SDK が無く CLI と `--json` だけである。Browser Port の形が正しいかは呼んでみないと分からない。
- **操作感。** 実ブラウザを操作して撮った画像に対して要素を選ぶことが体験の核であり、モックでは判断できない。

層ごとに積むと、この 2 つが最後まで見えない。全層を薄く貫く skeleton を先に通せば、同じ試行錯誤を**捨てやすい状態で**できる (`#3` の進め方)。

Design Doc の Goal に挙げた 8 つの操作のうち、skeleton は 1・2・5・6 の骨格だけを 1 画面 1 遷移で通す。差分検知 (7・8) と AI による候補提示 (4) は範囲外とする。

### 事前調査で確定した事実

spec 起案前に `agent-browser@0.34.0` を隔離環境で実行し、次を実測した。以降の論点はこの事実を前提とする。

| #   | 確定した事実                                                                                                                                                                                                                                                                                                       | 影響する論点              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| F1  | `agent-browser install` に版指定フラグが無い。Chrome for Testing は `~/.agent-browser/browsers/chrome-<version>/` に版ごとのディレクトリで入り、`--executable-path` で明示指定できる。指定しないとシステムの Chrome を自動検出する経路がある                                                                       | D2                        |
| F2  | 全プラットフォームのネイティブバイナリが npm tarball に同梱される。postinstall はダウンロードではなく実行ビットの付与が主。pnpm では実行ビットが 644 に落ちるが、`.bin` の JS wrapper が初回起動時に自分で chmod するため動作はする                                                                                | D3                        |
| F3  | `engines` は `node >=24` / `pnpm >=11` だが、pnpm 10.27.0 で警告なく install できた。engines は install をブロックしない                                                                                                                                                                                           | D3                        |
| F4  | streaming は常時有効で、セッションごとに localhost の WebSocket が開く。プロトコルはフレーム受信 (`frame`) と入力送信 (`input_mouse` / `input_keyboard` / `input_touch`)。実際に `input_mouse` の mousePressed / mouseReleased を座標指定で送るとモーダルが開いた                                                  | D5                        |
| F5  | 入力は CDP 生の座標のみで、要素情報を含まない。よって座標から要素への解決は必須である                                                                                                                                                                                                                              | D1                        |
| F6  | `snapshot` の `refs` は role と name を返すが、**ref は snapshot ごとに振り直される**。クリック前の `e2` はボタン A、クリック後の `e2` はボタン B になった                                                                                                                                                         | 継承 (ADR-0012 の裏付け)  |
| F7  | `snapshot` の応答に bounding box が含まれない。box を得る手段は `--annotate screenshot` (全要素の box + role + name + 番号を JSON で返す)、`eval` の `document.elementFromPoint`、`get box <sel>` の反復の 3 つ                                                                                                    | D1 / D11                  |
| F8  | 同一状態で 8 回撮ったスクリーンショットがすべてバイト同一だった。`snapshot` の 2 回出力も一致した                                                                                                                                                                                                                  | 継承 (決定性の前提が成立) |
| F9  | `Page.captureScreenshot` の CDP タイムアウトにより、**スクリーンショットだけが恒久的に詰まる**セッションが発生した。同じセッションで `snapshot` は成功し続けるため、部分的に壊れる。単一セッションでの 8 連続は成功したため回数依存ではない。原因は未特定                                                          | D4                        |
| F10 | daemon は最初のコマンドで自動起動し、CLI プロセスの終了後も生存する。既定は 1 時間のアイドルで終了し、`--idle-timeout` で変更できる。セッションは `close` で明示的に閉じられる                                                                                                                                     | D4 / context への変更提案 |
| F11 | Semantic Locator は `find role <role> --name <name> <action>` の形で解決できる                                                                                                                                                                                                                                     | 継承                      |
| F12 | F9 の詰まりは**再現条件を特定できていない**。単一セッションでの 20 連続、3 セッション同時に各 6 枚、`--annotate screenshot` の 10 回反復、`reload` 直後の撮影の 4 通りでは再現しなかった                                                                                                                           | D4                        |
| F13 | 1 回あたりの所要時間は `--annotate screenshot` が約 72ms、`snapshot` が約 7ms、`get box` が約 6ms (fixture-app 相当の小さいページで 5 回ずつ計測)                                                                                                                                                                  | D5                        |
| F14 | `snapshot` と `--annotate` の応答に**フレーム識別子が含まれない**。web-editor が要求する「Snapshot が対応する frame」の対応付けを、agent-browser の応答だけでは作れない                                                                                                                                            | D5                        |
| F15 | `file://` で開くと `open` の応答の URL がマシン固有のフルパス (`file:///private/tmp/.../fixture.html`) になる。`url` の Expectation に環境依存の値が入る                                                                                                                                                           | D6                        |
| F16 | `XDG_STATE_HOME` は agent-browser に**効かない** (state は `~/.agent-browser` のまま)。`--namespace <name>` は state と socket を `~/.agent-browser/namespaces/<name>/state` へ隔離し、ブラウザ本体のキャッシュは共有したままにする。`HOME` を差し替えるとキャッシュを失い、システムの Chrome へフォールバックした | D10                       |
| F17 | `--version` を 5 回ずつ実行した所要時間は、ネイティブバイナリ直接が 1 回あたり約 6ms、`.bin` の JS wrapper 経由が約 100ms。差の約 94ms は node プロセスの起動分                                                                                                                                                    | D3                        |
| F18 | 依存の健全性 (2026-08-22 時点)。`agent-browser` 0.34.0 は 2026-08-10 公開。`@puppeteer/browsers` 3.2.1 は 2026-08-17 公開、`engines.node >=22.12.0` (本 repo は 24)、Apache-2.0、直接依存は `yargs` と `modern-tar` の 2 つ、deprecated 無し、puppeteer 本体と同じ monorepo で保守されている                       | D2                        |

## スコープ

### やること

- `packages/fixture-app` に 1 画面 1 遷移の対象アプリを置く。ボタンを 1 つ押すとモーダルが開く静的 HTML とし、role と accessible name を付けて Semantic Locator で一意に解決できることを保証する
- Screen 文書の最小 DSL (`default` と、そこから 1 回の `click` で到達する状態の 2 つ) と、entry が参照する Workflow 文書 (`open` 1 ステップ) を扱う core/workflow の Schema 検証と IR 正規化
- pause を予約して `paused` で止まる run (記録の前提と、再現後の `rerun_step` の前提。D15 / D22)
- 操作の記録: `paused` の run に対して操作モードへ切り替え、Stream Proxy を通る入力を要素へ解決して `click` の step と要素定義を draft へ入れる
- 記録停止後の Expectation 候補の提示と、選んだ候補の step への反映
- draft と正本の分離、承認キュー、承認依頼の revision 固定と `stale` 判定
- `run.start` による再現と、同一セッションでの `rerun_step` による冪等スキップ
- 実行イベント列だけからステップ結果を再構成できること
- バッジ 1 個の注釈画像 (SVG) と生スクリーンショット (`raw.png`)、1 行の Markdown テーブルの生成、および同一入力での書き換え抑止
- `agent-browser` の npm 依存としての同梱と版固定、Chrome for Testing の自前取得と版固定、起動時検査 3 件 (ブラウザ本体 / 実行してよい origin の列挙 / 二重起動)、`runtime.json` の生成と削除
- agent-browser を実起動する統合テスト

### やらないこと

| 除外するもの                                       | 理由                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| 状態木の複数分岐・`fragments`                      | 2 状態あれば記録と再現は検証できる                                      |
| 再採番 (`element.renumber`)                        | 要素が 1 つなので番号は 1 固定                                          |
| 差分検知 (core/diff)                               | Baseline の 2 回目が要り、範囲が倍になる                                |
| POM 生成                                           | `outputs: [spec]` のみ。生成規則は独立した関心                          |
| 認証プロファイル                                   | 匿名のみ。fixture-app にログインを置かない                              |
| agent interface (MCP / JSON-RPC)                   | 記録は Web UI からの経路                                                |
| 提案依頼キュー / AI Port                           | AI が居なくても完結する経路だけを通す                                   |
| 差し戻しのループ                                   | 承認のみ。差し戻しは厚くする段階で                                      |
| E2E (Playwright)                                   | `context/testing.md` のとおり Web UI の実装が動いてから入れる           |
| URL 入力から entry の Workflow 文書を起こす導線    | skeleton では entry を手で書く (D17)。導線は厚くする段階で足す          |
| 要素選択 (`element.candidates`) と祖先方向の候補列 | 記録が要素定義を作るため、skeleton の受け入れ条件に要素選択が無い (D18) |

## 要件の解釈

### 実現したいユーザー価値

- DSL を書けない利用者が、ブラウザを操作するだけで画面仕様の draft を起こせる。
- 起こした draft を承認すると正本になり、そこから何度でも同じ画面状態を再現できる。
- 再現した状態から、番号バッジ付きの画像と構成要素テーブルが決定的に出る。

### 成功条件

- 記録した step が座標ではなく要素 ID (`ref`) を指す。ここが `clickPoint` に落ちるなら記録の設計が成立していない。
- 同一セッションでの再実行で全ステップが `skipped` になり `completed` で終わる。冪等実行の実在証明である。
- 同じ入力での再生成でファイルが書き換わらない (タイムスタンプも変わらない)。
- `pnpm boundaries` が通る。全層に触れても境界が守られている。

### 対象ユーザー / 操作主体

- 仕様作成者・開発者 (Design Doc の System Context)。skeleton では Web UI からの経路のみを通す。
- AI エージェントは操作主体に含めない (agent interface は範囲外)。

EARS 風で振る舞いを記述する。

- WHEN 利用者が操作モードで記録を開始し fixture-app のボタンをクリックしたとき、システムはその操作を `click` の step として draft に追加する。
- WHEN 記録した操作の対象要素が既存の要素定義に一致しないとき、システムは要素定義も同時に draft へ追加する。
- IF 操作の座標を一意な Semantic Locator へ解決できない場合、システムは `clickPoint` として残し警告を付ける。
- WHEN 利用者が記録を停止したとき、システムは操作後の Snapshot から Expectation の候補を提示する。
- WHILE 承認依頼が承認待ちである間に対象 draft が編集されたとき、システムは依頼を `stale` として扱い確定しない。
- WHEN 既に期待状態を満たしているステップを再実行したとき、システムは action を実行せず `skipped` として記録する。
- IF ブラウザ本体が見つからない状態で Workflow Server を起動した場合、システムは導入コマンドを案内して起動を中止する。
- WHEN 生成入力が前回と意味上同一であるとき、システムは既存の成果物を書き換えない。
- THE SYSTEM SHALL 実行イベント列だけから、どのステップがどの結果になったかを再構成できる情報を発行する。

## 設計時の論点

設計 / 実装フェーズへ持ち越す残課題を 1 件ずつ管理する。確定したものは「解決済みの論点」へ移す。

**未決の論点は無い。** D1〜D23 はすべて「解決済みの論点」へ移した。新たな論点が出たら本節に表を作り直す。

## 解決済みの論点

- **D1: 座標解決の入力は `--annotate screenshot` が返す bounding box を使う。**
  - 根拠: element-mapping が要求する box + role + name が 1 回の CLI 呼び出しで揃う。バッジ描画 (D11) も同じ経路で材料を得られ、取得の系統が 1 本で済む。
  - トレードオフ: スクリーンショット生成を伴うため、`Page.captureScreenshot` が詰まると記録そのものが止まる (F9)。扱いは D4 で決める。生成された注釈済み画像は保存せず捨てる (差分検知の対象は生スクリーンショットであるため)。
  - 却下した代替案: `eval` の `document.elementFromPoint` は対象ページで任意 JS を実行し、ADR-0026 が却下した「JS を注入して DOM イベントを拾う」と擦れるため却下。`get box` の反復は要素数に比例して CLI 呼び出しが増え、厚くする段階で作り直しになるため却下。

- **D2: Chrome for Testing を自前で版指定取得し、`--executable-path` で常に明示する。**
  - 根拠: 決定性が `decision_priority` の 1 位であり、実行基盤を勝手に動かさない形を最初から取る。自前取得は実行ファイルのパスが決定的に返るため、`doctor --json` の message 文字列を解析する経路が消える。
  - 併せて決まること: 起動時のブラウザ検査が案内するのは**本リポジトリの導入コマンド**とする (暫定名 `pnpm browser:install`)。システムの Chrome を自動検出させない。
  - 依存の健全性: `@puppeteer/browsers` 3.2.1 は puppeteer 本体と同じ monorepo で保守され、`engines.node >=22.12.0` (本 repo は 24)、Apache-2.0、直接依存 2 つ、deprecated 無し (F18)。
  - トレードオフ: 依存が 1 つ増える (`@puppeteer/browsers`)。ADR-0027 の案内文 1 箇所を改訂する。「postinstall で自動取得しない」「起動時に検査して中止する」という判断の骨格は変えない。
  - 却下した代替案: `agent-browser install` に任せる案は、ブラウザ更新で描画が変わりシステム Chrome の混入も残るため却下。版を固定せず記録だけ残す案は、パス解決に人間向けメッセージの解析が要るうえ決定性を満たさないため却下。先送りは ADR-0027 の未確認事項を open のまま残し、差分検知の段階で adapter を作り直すため却下。
  - 残る論点: 版番号の置き場は D13 で決める。

- **D3: `onlyBuiltDependencies` に `agent-browser` を足し、adapter/browser はネイティブバイナリを直接 spawn する。**
  - 根拠: `.bin` の JS wrapper 経由は 1 回あたり約 100ms、ネイティブバイナリ直接は約 6ms だった (`--version` を 5 回ずつ実行して計測)。差の約 94ms は node プロセスの起動分で、CLI の呼び出し回数に比例して効く。記録も実行も 1 操作で複数回呼ぶ。
  - 併せて決まること: バイナリのパスをプラットフォーム (`darwin` / `linux` / `linux-musl` / `win32` × `arm64` / `x64`) から解決する処理を adapter/browser に置く。解決は adapter に閉じ、他層へ出さない。
  - トレードオフ: パス解決の分岐を自前で持つ。agent-browser 側の命名規則が変わると追従が要る。
  - 却下した代替案: wrapper を呼ぶ案は実装が単純だが、呼び出しごとの約 94ms を恒常的に払うため却下。`onlyBuiltDependencies` に足さない案は issue の受け入れ条件に反し、wrapper の自己 chmod に依存する形になるため却下。

- **D4: セッションの不応答を Browser Port の構造化エラーとして返し、再作成するかどうかは core/execution が決める。**
  - 根拠: セッションは**部分的に壊れる**。`snapshot` は成功し続けるのに `screenshot` だけが恒久的に失敗するため (F9)、生存確認では検出できない。加えて再現条件が特定できていない (F12) ため、引き金を避ける形では防げない。
  - 併せて決まること: セッションの再作成は**ページ状態を失う操作**であるため、adapter が黙って行わない。issue の受け入れ条件「同一セッションでの再実行で全ステップが `skipped`」は、黙って再作成されると静かに壊れて `skipped` を観測できなくなる。
  - トレードオフ: execution feature の Browser Port 契約に構造化エラーの語彙が 1 つ増える。上位文書の改訂が要る。
  - 却下した代替案: adapter で吸収する案は Port の契約を変えずに済むが、ページ状態の喪失を core が知らないまま冪等実行の前提が崩れるため却下。skeleton で扱わない案は、統合テストが間欠的に落ちたときに原因を切り分けられないため却下。

- **D5: 記録中は入力を転送する前に `--annotate screenshot` を撮り、その結果で座標を解決してから転送する。**
  - 根拠: ADR-0026 と element-mapping feature がどちらも「その時点の Snapshot に対して座標を解決する」と定めている。操作後の状態で解決すると、ページが自律的に変化していたときに**間違った要素へ解決してしまう**。「解決できない」なら `clickPoint` と警告で気付けるが、「間違って解決した」は静かに壊れる。
  - 代償: 記録モード中のクリックが約 72ms 遅れる (F13)。実ページではより遅くなる。記録は人が明示的に開始する探索的な操作であり、この遅延を許容する。
  - 却下した代替案: 操作の直後に取る案は転送を遅らせないが、上記の静かな誤解決を招くため却下。フレームの `seq` と対応づける案は、**agent-browser の応答にフレーム識別子が無い** (F14) ため成立しない。

- **D6: fixture-app は静的 HTTP サーバで配信する。**
  - 根拠: `file://` で開くと URL がマシン固有のフルパスになり (F15)、`url` の Expectation に環境依存の値が入る。決定性が `decision_priority` の 1 位である以上、期待状態に環境の値を持ち込まない。ADR-0017 の「実行してよい origin を列挙する」も `file://` では意味をなさない。
  - 代償: テスト起動時にサーバプロセスが 1 つ増える。ポートの選定と後始末が要る。

- **D7: draft と正本を別の置き場に分けて保存する。**
  - 根拠: 受け入れ条件が「承認前の draft と承認後の正本が別のものとして保存されている」ことを求めている。置き場を分ければ構造で満たせ、テストで直接示せる。同一ファイルの版として持つ形は、分離を実装の約束で保つことになる。
  - 併せて決まること: 承認は「draft を正本の置き場へ確定させる」操作になる。
  - 反映先: `context/architecture.md` の State Boundary。同節は「draft と確定を分離する」までしか定めておらず、置き場の分割は issue が閉じても残る保存構造であるため、spec の削除とともに根拠が失われる。

- **D8: workflow-dsl feature の語彙を一通り Schema 化する。**
  - 根拠: 後から語彙を足すたびに Schema と検証テストを触るより、語彙の全体を最初に固定するほうが手戻りが少ない。
  - トレードオフ: skeleton が除外した機能 (`fragments` / 複数分岐 / 再採番) の Schema が、使われないまま先に入る。**Schema が受け付けるのに実行系が対応しない語彙**が生まれるため、その扱いを D14 として起票した。

- **D9: 承認依頼の revision は draft の内容ハッシュとする。**
  - 根拠: ADR-0018 が Workflow IR の版を「正規化した IR の内容から決まる値」と定めており、方式を揃えると版の意味が 1 つで済む。カウンタの永続化も要らない。
  - 帰結: 編集して元に戻した draft は `stale` にならない。人間が見た差分と確定する内容が一致するため、ADR-0017 の目的 (承認待ちの間の編集が見ていない差分のまま確定するのを防ぐ) は満たす。
  - 却下した代替案: 単調増加する版番号は順序が分かるが、IR 版と方式が食い違い、内容が同じでも `stale` になる誤検出が出るため却下。

- **D10: 統合テストは `--namespace` とテスト専用の session 名で隔離する。**
  - 根拠: `--namespace` は state と socket だけを分け、ブラウザ本体のキャッシュを共有したままにできる (F16)。テストのたびに数百 MB を取り直さずに済み、版も変わらない。
  - 併せて決まること: `context/testing.md` の「`XDG_STATE_HOME` をテスト専用の一時ディレクトリへ向ける」は **agent-browser には効かない** (F16)。同節に agent-browser の隔離手段を書き足す。
  - 却下した代替案: `HOME` の差し替えはブラウザキャッシュを失い、システムの Chrome へフォールバックするため却下 (F16)。`XDG_STATE_HOME` だけに頼る案は実測で効かないため却下。

- **D13: Chrome for Testing の版番号は `packages/adapter-browser` 配下の専用 JSON に書く。**
  - 根拠: 読む側が 2 つある。取得コマンド (node script。TS のビルド前に走る) と起動時検査 (TS)。JSON なら両方から読める。
  - 却下した代替案: `package.json` の独自フィールドはビルド外の設定を混ぜる。TS 定数は型が付くがビルド前の script から読めない。`context/project.yml` は skill が読む固有値の正本であり、実行時設定と責務が混ざる。
  - 反映先: `context/toolchain.md` の標準スタック。D2 / D21 で同節を触るため、版の置き場も同じ行に記録する。

- **D14: Schema が受け付けても skeleton の実行系が対応しない語彙は、IR 正規化で構造化エラーにする。**
  - 根拠: workflow-dsl feature は参照エラーを `ref/cyclic` などの構造化エラーで返し、「規則に反している」として返す方針を持つ。実行前に分かり、エージェントが自己修正できる。
  - 帰結: 実行系が未対応であることを表す構造化エラーの語彙を 1 つ足す。skeleton で通すのは `open` と `click`、Expectation は `url` と `element` に限る。
  - 却下した代替案: 実行時に失敗させる案は、失敗がステップの途中で起き、どこまで実行されたかが状況依存になるため却下。実行系も語彙を一通り実装する案は skeleton の範囲を大きく超えるため却下。

- **D11: 注釈画像は SVG として出力し、生スクリーンショットを `raw.png` として別に保存して SVG から参照する。**
  - 根拠 1: **書き換え抑止の判定が 1 本化される。** 現在の設計は Markdown と POM が「テキスト比較 (完全一致)」、注釈画像 PNG だけが「生成入力の比較」という別ルールだった。PNG は描画エンジンの環境差でバイトが揺れるためである。SVG はテキストなので、他の成果物と同じ完全一致で判定できる。
  - 根拠 2: **再合成が設計の意図と噛み合う。** 再採番や `badges` の並べ替えでは SVG のテキスト数行だけが変わり、画像は触らない。git の差分としても読める。
  - 根拠 3: core/artifact が SVG 文字列を生成する純粋計算のままでいられる。画像合成ライブラリのネイティブ依存が core に入らない。
  - 差分検知との関係: **注釈画像の形式は差分検知に影響しない。** 差分検知の対象は生スクリーンショットであり、バッジを焼き込んだ画像は対象にしない (artifact-generation feature)。
  - **上流の変更が要る。** `design/DesignDoc.md` の成功条件は「DSL から構成番号付き **PNG** 画像と Markdown テーブルを生成できる」であり、SVG 化はこの Why/What を覆す。成功条件を「構成番号付きの注釈画像」へ一般化し、形式の判断は ADR として起こす。
  - トレードオフ: 外部参照する SVG は `raw.png` と一緒に動かさないと壊れる。Word や Confluence へ貼る運用では PNG が要るが、DesignDoc の Goal は配布先を規定していない。
  - 却下した代替案: SVG を PNG へラスタライズする案は配布先を選ばないが、Port が 1 つ増えるうえ書き換え抑止が生成入力の比較のまま残るため却下。両方出す案は成果物が 1 状態あたり 1 つ増え、正本がどちらか曖昧になるため却下。pure-JS で PNG へ直接描く案は上位文書の変更が要らないが、判定規則が 2 本のまま残るため却下。

- **D12: Expectation 候補は、操作の前後で変化した項目だけを出す。**
  - 根拠: D5 で操作の直前にも Snapshot を撮るため、**前後の差分が無償で手に入る**。ADR-0026 は「機械的に条件を起こすと無関係な要素まで期待状態に入り、壊れやすいステップが量産される」ことを懸念しており、候補を変化分に絞ればその懸念が減る。
  - 対象は `url` / `title` / `element` のうち変化したものとする。ADR-0026 の「URL・可視要素などの候補を出す」の範囲内で絞り込む。
  - トレードオフ: 変化していないが期待状態として宣言したい項目 (操作後も URL が変わらないことを明示したい等) は候補に出ない。人が手で足す。

- **D15: 記録は、entry まで実行して `paused` にした run の中で行う。**
  - 根拠 1: ADR-0008 の中継条件 (対象 run が `paused` / 操作モード / 要求元のもの) と、web-editor feature の「モード切替は一時停止中だけ有効」を**どちらも改訂せずに満たす**。
  - 根拠 2: **既存の pause 予約の延長で表せる。** execution feature の pause は「実行中ステップの完了後に停止する予約」であるため、run 開始時に予約すれば entry の最後のステップ完了時に `paused` へ入る。専用の実行モードは作らない。
    - ただし **execution feature への追加が 1 件要る**。記録時点の実行ステップ列は entry の `open` 1 件だけで、同 feature は「全ステップ完了 → `completed`」も定めている。最終ステップの完了と pause 予約が重なったときの優先順位が上位文書に無い。**pause 予約を優先する**と決め、feature doc へ書き足す (D19)。`completed` に倒れると ADR-0008 の中継条件を満たさず、記録経路が丸ごと成立しない。
  - 根拠 3: **遷移元が自動で決まる。** ADR-0026 は「記録した steps をどの状態の遷移として扱うかは機械的に決まらない。人が決める」とするが、run の到達状態が分かっていれば `default` に居る状態で記録した steps は `default` からの遷移だと決まる。人の判断が 1 つ減る。
  - 前提の整理: ADR-0008 の条件が本当に守っているのは「実行中の run のページ状態を勝手に変えられないようにする」ことであり、記録とは衝突しない。衝突していたのは条件の書き方だけである。記録を run の枠内へ置くと、セッションを誰が使ってよいかの判断が run に一元化される。
  - 却下した代替案: 中継条件を「run が `paused` **または** 記録セッションが有効」へ広げる案は、ADR-0008 と web-editor feature の両方を改訂し、「対象 run が要求元のものである」の検証を記録セッションに対して定義し直す必要があるため却下。空の run を自動生成する案は条件を形だけ通し、中身の無い run が実行履歴に並ぶため却下。

- **D16: 起動時検査は `context/infrastructure.md` の 3 件すべてを skeleton の範囲に入れる。**
  - 根拠: **origin 列挙は既定が空で、列挙が無いと `run.start` が実行できない。** 入れなければ skeleton が動かない。二重起動の検査は `runtime.json` を読むだけで、skeleton が既に `runtime.json` を扱うため追加コストが小さい。
  - 却下した代替案: fixture-app の origin を既定値として埋め込む案は、**既定が空であること自体が意図しない対象への実行を防ぐ安全装置**であるため却下。二重起動を範囲外にする案は、契約を部分的にしか満たさない割に節約が小さいため却下。

- **D17: entry の Workflow 文書は skeleton の範囲に入れ、手で書く。**
  - 根拠: D15 を採ると、記録を始める前にページが開いている必要があり、その `open` は run が実行する。**記録が `open` を作る余地が無い** (記録から Workflow 文書を起こす案は鶏と卵になる)。skeleton の Workflow 文書は `open` 1 ステップの YAML 数行で、DSL の 2 文書構成をそのまま通せる。
  - **制約として残ること**: ADR-0026 の価値は「DSL を書けない利用者でも画面仕様を起こせる」ことだが、**entry の Workflow 文書だけは手書きが残る**。「URL を入力すると entry の Workflow 文書の draft を作る」導線は skeleton の範囲外とし、厚くする段階に送る。
  - 却下した代替案: entry を Screen 文書へ直接書ける形へ DSL を変える案は、workflow-dsl feature の Screen / Workflow 分離という大きな判断を覆すため却下。

- **D18: skeleton の座標解決は role+name だけに絞る。**
  - 根拠: element-mapping が要求する「祖先方向の候補列」は「ボタンではなくカード全体を選びたい」場合の切り替え用で、**要素選択 (Web UI) の機能**である。skeleton のスコープは記録だけで要素選択を含まない。`label` / `testid` も、fixture-app が role と accessible name で一意に解決できることを保証するため不要である。
  - 必要になったときの手段: 祖先関係は `snapshot` が返すインデント付きツリーと `--annotate` の box を `ref` で突き合わせれば復元できる (追加は `snapshot` 1 回、約 7ms)。手段が無いのではなく、skeleton で要らないという判断である。
  - 却下した代替案: 追加の CLI 呼び出しで `label` / `testid` まで補う案は、`ref` で属性を引けるかが未実測であり、skeleton では使わないため却下。

- **D19: 最終ステップの完了と pause 予約が重なったときは、pause 予約を優先して `paused` へ入る。**
  - 根拠: 優先順位が決まっていないと、entry が 1 ステップだけの run (記録の前提) で `completed` に倒れうる。倒れると ADR-0008 の中継条件を満たさず、**記録経路が丸ごと成立しない**。
  - 意味論: pause 予約は「利用者がこの run のセッションを使いたい」という意思表示であり、ステップ列を消化しきったことより優先する。`paused` から `resume` すれば `completed` へ進める。
  - 上位文書への反映: execution feature の実行状態と再生制御に優先順位を書き足す。**新しい状態は増やさない。** あわせて **pause 予約は 1 回で消費される** (`resume` すると予約は消え、次の完了では `completed` へ進む) ことを添える。ADR-0002 の「pause 要求 = 予約」から読めるが、明記しないと揺れる。
  - 却下した代替案: `completed` を優先し記録を別の仕組みで成立させる案は D15 の再検討を招き、ADR-0008 の改訂へ戻るため却下。entry にダミーのステップを足して重なりを避ける案は、本質的な未定義を回避するだけで実態と合わないため却下。

- **D20: Screen 文書の初期 draft は、entry の Workflow 文書と一緒に手で書く。**
  - 根拠: run は Screen 文書 (id / title / entry 参照 / `default` 状態) を必要とし、「記録した steps の遷移元は run の到達状態から決まる」(D15) もその存在を前提にする。D17 で entry を手書きと決めた以上、同じ扱いに揃える。
  - 書く範囲: `screen.id` / `title` / `entry.workflow` / `states` の `default` 1 件のみ。`default` の `expect` は空のまま記録に入る。`default` は遷移 step を持たない状態であり実行対象ではないため、Expectation を持たないことの影響 (冪等スキップが効かない) を受けない。
  - 制約として残ること: D17 と同じく手書きが残る範囲が広がる。「URL と画面名を受け取って Screen 文書と entry の draft を同時に作る」導線は skeleton の範囲外とし、厚くする段階に送る。
  - 却下した代替案: 記録停止時に Screen 文書ごと draft を起こす案は、run の開始に Screen 文書が要るため順序が逆になり却下。

- **D21: `agent-browser` が宣言する `engines.pnpm >=11` を外れたまま、pnpm 10.27.0 で運用する。**
  - 根拠: install は警告なく通る (F3)。本システムは agent-browser を **CLI として子プロセスで呼ぶだけ**で、pnpm の API に依存しない。engines の宣言は agent-browser 自身の開発環境の要件である。
  - pnpm 11 への更新は `context/toolchain.md` の別判断とし、skeleton の範囲に含めない。`packageManager` の変更はリポジトリ全体に効くためである。

- **D22: 再現の run にも pause を予約し、全ステップ完了時に `paused` で止めてから `rerun_step` を掛ける。**
  - 根拠: execution feature は `rerun_step` を「**一時停止中に**任意の通過済みステップを指定して再実行できる」と定め、ADR-0002 の状態遷移図でも `completed` は終端である。予約しないと再現の run は `completed` になり、**受け入れ条件「同一セッションでの再実行で全ステップが `skipped`」を観測する経路が無い**。
  - D19 の規則をそのまま再利用するため、**上位文書の追加変更は要らない**。
  - 却下した代替案: `rerun_step` を `completed` からも掛けられるようにする案は、execution feature と ADR-0002 の両方を改訂し、終端状態の意味を変えるため却下。

- **D23: entry の `open` step には `url` の Expectation を書く。**
  - 根拠: execution feature は「**Expectation を持たないステップは、評価を省いて必ず action を実行する**」と定める。`expect` が無いと `open` が毎回実行され、受け入れ条件「全ステップが `skipped`」が成立しない。
  - `default` 状態の `expect` を空のままにする D20 とは衝突しない。`default` は遷移 step を持たない状態であり、実行対象ではないためである。

## 未確定事項

- entry の Workflow 文書と Screen 文書の骨格は手書きが残る (D17 / D20)。「URL を入力すると entry の draft を作る」導線は `#3` の厚くする段階へ送る。**判断者は本 repo の owner、判断時期は skeleton 完了後の次の issue 起票時**とする。
- 上位文書への変更提案 3 件 (ADR-0026 / ADR-0027 / context/architecture.md) のうち、context/architecture.md の反映内容は D4 で確定した。ADR-0027 は D2 と D3 で反映内容が確定した。ADR-0026 は D1 が `eval` を選ばなかったため、未確認事項の解決記録だけを反映する。
- **未決の論点は無い。** D1〜D23 をすべて確定した。
- F9 の詰まりの再現条件が特定できていない (F12)。原因が agent-browser 側か利用側かを切り分けられていないため、上流への報告は行わない。**判断者は本 repo の owner、判断時期は skeleton の統合テストで再発したとき**とする。再発しなければ持ち越さない。
- 入力転送で `hover` と `scroll` が扱えるかは未検証である。`input_mouse` の `mouseMoved` / `mouseWheel` で表現できる見込みだが、実測していない。skeleton は `click` だけで足りるため、確認は厚くする段階に送る。**判断者は本 repo の owner、判断時期は `#3` の「状態遷移と Expectation」を厚くする回**とする (その回の issue 起票時に確認事項として引き継ぐ)。

## 実装対象

正規 target は `context/project.yml` の対象ドメイン一覧を正本とする。

| モジュール  | 実装有無 | 主な責務                                                                                         |
| ----------- | :------: | ------------------------------------------------------------------------------------------------ |
| `workflow`  |    ◯     | Screen 文書と entry の Workflow 文書の Schema 検証と IR 正規化 (2 状態 1 遷移)                   |
| `execution` |    ◯     | ステップ実行、冪等スキップ、Browser Port の契約と agent-browser 実装、実行イベント               |
| `element`   |    ◯     | 要素定義、座標からの要素解決、Semantic Locator の生成                                            |
| `artifact`  |    ◯     | バッジ 1 個の注釈画像 (SVG)、1 行の Markdown テーブル、書き換え抑止                              |
| `diff`      |    -     | 範囲外 (Baseline の 2 回目が要る)                                                                |
| `web`       |    ◯     | 記録の開始と停止、Expectation 候補の選択、承認キュー、live viewport                              |
| `agent`     |    -     | 範囲外 (MCP / JSON-RPC は通さない)                                                               |
| `infra`     |    ◯     | agent-browser と Chrome for Testing の同梱と版固定、起動時検査 3 件、`runtime.json` の生成と削除 |

## 機能仕様

### User Flow

1. 利用者が Workflow Server を起動する。起動時検査 3 件 (ブラウザ本体 / 実行してよい origin の列挙 / 二重起動) のいずれかを満たさなければ、理由と対処を出して中止する。
2. 利用者が Screen 文書の骨格 (id / title / entry 参照 / `default` 状態) と、fixture-app を開く entry の Workflow 文書 (`open` 1 ステップ。`url` の Expectation つき) を手で書く (D20 / D17 / D23)。
3. 利用者が run を開始する。pause を予約しておくため、entry の実行完了時に `paused` で止まる (最終ステップの完了より pause 予約が優先される。D19)。
4. 利用者が操作モードへ切り替え、記録を開始する。記録中であることが常時表示される。
5. 利用者がボタンをクリックする。server は転送の前に `--annotate screenshot` を撮り、座標を要素へ解決して `click` の step と要素定義を draft へ入れてから転送する。
6. 利用者が記録を停止する。操作の前後で変化した項目から Expectation の候補が提示される。
7. 利用者が候補を 1 つ選び、step の `expect` に入れる。記録した steps の遷移元は run の到達状態 (`default`) から決まる。
8. 利用者が承認依頼を出し、差分を確認して承認する。draft が正本の置き場へ移る。
9. 利用者が `run.start` で実行する。**記録に使った run とは別の run で、新しいセッションが開く。** pause を予約しておくため、全ステップの完了時に `paused` で止まる (D22)。`open` から順に実行され、記録どおりに操作が再現される。
10. `paused` のまま、モーダルが開いた状態で、**9 の run と同じセッション**の最初のステップから `rerun_step` する。全ステップが `skipped` になり `completed` で終わる。新規セッションで 2 回目を回すと `open` の期待状態を満たさず必ず実行されるため、`skipped` を観測できない。
11. 到達した状態で成果物を生成する。バッジ 1 個の注釈画像 (SVG) と生スクリーンショット、1 行の Markdown テーブルが出る。
12. もう一度生成する。ファイルは書き換わらない。

### Reuse Policy

- 第一原則は feature / colocation とする。skeleton は各 core の最小実装を置くだけで、共通化を先回りしない。
- agent-browser の CLI 呼び出しは `packages/adapter-browser` に閉じる。CLI の引数組み立て、`--json` のパース、プラットフォーム別のバイナリパス解決 (D3) を他層へ漏らさない。
- 記録の座標解決は element-mapping feature の解決規則の**部分集合**を使う (ADR-0026)。記録専用の規則を作らない。skeleton で使うのは role+name への解決までで、祖先方向の候補列と `label` / `testid` の優先順位は要素選択の機能として範囲外とする (D18)。

### Performance

- CLI の呼び出し回数を実行ステップ数に対して線形に保つ。D1 の決定により、座標解決 1 回あたりの CLI 呼び出しは `--annotate screenshot` の 1 回で済む (要素数に依存しない)。
- 記録モード中は 1 クリックあたり `--annotate screenshot` を 1 回挟むため、約 72ms の遅延が乗る (D5 / F13)。記録モード以外では挟まない。
- `--annotate screenshot` は呼ぶたびに画像を生成する。**記録中に生成した注釈済み画像は保存せず捨てる。** 残すと成果物の注釈画像と紛らわしく、差分検知の対象を誤らせる。
- CLI はネイティブバイナリを直接 spawn する (D3)。1 回あたり約 6ms で、JS wrapper 経由の約 100ms を避ける。

### Routing / URL State

- Web UI の URL は `screen / state / run` を表し、リロードしても同じ文脈に戻る (web-editor feature)。skeleton では 1 画面 2 状態しか無いため、状態の切替は URL に載せるだけとする。

### Content / Assets

- fixture-app の HTML は `packages/fixture-app` に置き、**内容を固定する** (`context/testing.md`)。外部サイトを対象にしない。
- fixture-app は静的 HTTP サーバで配信する (D6)。`file://` を使わない。
- 成果物の既定の出力先は `artifacts/screens/<screen-id>/<authProfile>/` とする (artifact-generation feature)。skeleton の `authProfile` は匿名固定。
- 注釈画像は `<state-id>.svg`、生スクリーンショットは `<state-id>.raw.png` とし、SVG が同じディレクトリの PNG を相対参照する (D11)。

### UI Reuse

- 記録の開始・停止と Expectation 候補の選択は `apps/web` に閉じる。共有 UI へ切り出さない。

### Testing

- 記録の解決ロジック・承認・再現・成果物は `apps/server/src/**/*.integration.test.ts` で agent-browser を実起動して検証する (`context/testing.md`)。
- 成果物の決定性と座標解決の規則は core の unit test で検証する。座標解決は「座標 + box 付き要素一覧」を入力とする純粋関数として書き、CLI の呼び出しをまたがせない。
- **記録の UI 操作だけは手動確認が残る。** E2E は Browser Port を fake に置き換える設計のため、記録の実挙動を E2E では検証できない。
- 統合テストは `--namespace` とテスト専用の session 名で agent-browser を隔離する (D10)。ブラウザ本体のキャッシュは共有する。
- E2E (Playwright) は skeleton の範囲に含めない。

## Interface 設計

### UI / API / Event Interface

diagram phase で確定させる。現時点で必要と見込む面を列挙する。

- HTTP: 記録の開始・停止、draft の取得、承認依頼、承認、`run.start`、`rerun_step`、成果物生成。
- WebSocket: Stream Proxy (映像フレームの中継と入力転送)、実行イベントの購読。
- 実行イベント: `run-started / step-started / expectation-evaluated / step-skipped / step-executed / paused / resumed / run-completed` のうち skeleton で発行するものを diagram phase で確定する。セッション再作成を行った場合は、ページ状態を失ったことがイベント列から読めるようにする (D4)。

### Props / Request / Response

- diagram phase で図を起こしてから記述する。

## Content / Data 設計

### 保存・管理するデータ

- Screen 文書 (draft / 正本)、承認依頼 (対象 draft の内容ハッシュを revision として固定する。D9)、実行履歴 (入力・StepResult・Snapshot 参照・スクリーンショット参照)、成果物と `meta.json`。
- 実行中の一時状態 (agent-browser の ref、実行途中のステップ状態) は永続化しない (`context/architecture.md` の State Boundary)。
- ref は snapshot ごとに振り直されるため (F6)、**DSL にも実行履歴にも保存しない**。
- 記録中に `--annotate screenshot` が生成する注釈済み画像は保存しない (D1)。使うのは応答に含まれる box だけである。

### コンテンツ配置 / package / route

- `packages/adapter-store` がファイルとして保存する。draft と正本は**別の置き場**に分ける (D7)。承認は draft を正本の置き場へ確定させる操作とする。

## Performance / Security 設計

### Performance

- 「機能仕様 → Performance」に記載した 2 点を守る。数値目標は skeleton では置かない。

### Security / Privacy

- Workflow Server は 127.0.0.1 のみに bind し、ローカルトークンを要求する (ADR-0021)。`runtime.json` に接続先とトークンを書き、終了時に消す。
- `token` のファイル権限は 0600、置き場は 0700 とし、緩ければ起動を中止する (`context/testing.md` の負例テスト)。
- CLI の引数は配列で渡す。文字列を連結してシェルに解釈させない (ADR-0027)。
- 成果物の出力先はプロジェクトルート配下に限る。絶対パス・`..`・`~` 始まり・解決後にルート外を指すシンボリックリンクを拒否する (artifact-generation feature)。

## Error / Fallback 設計

### エラーケース

| #   | ケース                                        | ユーザーへの見せ方                                                                                                                            | リカバリ                                                             |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | ブラウザ本体が見つからない                    | 本リポジトリの導入コマンドを案内して起動を中止する                                                                                            | 利用者が導入コマンド (暫定名 `pnpm browser:install`) を 1 回実行する |
| 1b  | 実行してよい origin が 1 つも列挙されていない | 設定への追記を案内して起動を中止する                                                                                                          | 利用者が fixture-app の origin を設定に足す                          |
| 1c  | 常駐サーバが二重起動である                    | 既存の `runtime.json` が指すプロセスの停止を案内して中止する                                                                                  | 利用者が既存プロセスを止める                                         |
| 2   | 記録した操作を一意な Locator へ解決できない   | `clickPoint` として残し警告を出す。記録は止めない                                                                                             | 利用者が要素定義を手で整える                                         |
| 3   | 承認待ちの間に対象 draft が編集された         | `stale` として表示し確定させない                                                                                                              | 依頼を出し直す                                                       |
| 4   | 実行後も Expectation を満たさない             | 失敗ステップと評価結果をイベントで提示し run を `failed` にする                                                                               | DSL か要素定義を直して再実行する                                     |
| 5   | daemon またはセッションが応答しない (F9)      | Browser Port が構造化エラーを返し、run を止めるか再作成するかを core/execution が決める。再作成した場合はページ状態を失うことをイベントに残す | 利用者が run をやり直す                                              |

### Fallback

- Expectation を選ばずに承認できてしまう点を UI で明示する。選ばないと冪等スキップが効かず毎回実行される (web-editor feature)。

## テスト / 評価方針

### テスト観点

- Schema: workflow-dsl の語彙を一通り検証できること。実行系が未対応の語彙 (`fill` / `hover` / `scroll` / `use` / `count` 等) が IR 正規化で構造化エラーになること (D14)。
- 記録の前提: pause を予約した run が entry の完了時に `paused` で止まること (**最終ステップの完了で `completed` に倒れないこと**。D19)。`paused` でない run への入力転送が破棄され、破棄がイベントに残ること (ADR-0008)。
- 記録: 解決した step が `ref` を指すこと。要素定義が同時に draft へ入ること。既存定義に一致する場合に重複定義を作らないこと。
- 承認: draft と正本が別のものとして保存されていること。承認前の draft を承認後の正本が上書きしないこと。`stale` 判定が効くこと。
- 再現: 再現の run が全ステップ完了時に `paused` で止まること (D22)。同一セッションでの `rerun_step` で全ステップが `skipped` になり `completed` で終わること。`open` が `url` の Expectation を持つため `skipped` になること (D23)。イベント列だけからステップ結果を再構成できること。
- 成果物: 同一入力での再生成でファイルの mtime が変わらないこと。バッジ位置とテーブル内容の決定性。SVG が完全一致で判定できること (D11)。
- Expectation 候補: 操作の前後で変化した項目だけが候補に出ること (D12)。変化していない項目が候補に混ざらないこと。
- 基盤: 起動時検査 3 件がそれぞれ単独で起動を中止させること (ブラウザ本体なし / origin 列挙が空 / 二重起動)。`runtime.json` が終了時に消えること。
- 不応答: Browser Port が構造化エラーを返すこと。fake Browser Port で不応答を注入し、core/execution が再作成の判断を下せること (D4)。実起動での再現は条件が未特定のため統合テストの対象にしない。
- 横断: `pnpm boundaries` が通ること。`pnpm test:integration` で agent-browser を実起動する統合テストが 1 本以上通ること。

### 計測指標

- skeleton では数値目標を置かない。「通ること」を指標とする。

## フロー / シーケンス

diagram phase で生成する。現時点では枠のみを置く。

### Flowchart (ユーザー操作起点)

```mermaid
flowchart TD
```

### Sequence

```mermaid
sequenceDiagram
```

## 実装分割

### 実装タスク案

diagram phase の図を経てから確定する。現時点の見込みを置く。

| Phase | 対象                        | 概要                                                                                    | 依存       |
| ----- | --------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| P1    | infra                       | agent-browser と Chrome for Testing の同梱と版固定、起動時検査 3 件、`runtime.json`     | なし       |
| P2    | fixture-app                 | 1 画面 1 遷移の静的 HTML と静的 HTTP サーバでの配信                                     | なし       |
| P3    | execution / adapter-browser | Browser Port の契約と agent-browser 実装、Snapshot 取得                                 | P1, P2     |
| P4    | workflow / element          | DSL 語彙を一通り Schema 化、Screen と Workflow の 2 文書、IR 正規化、座標からの要素解決 | P3         |
| P5    | app / api / web             | entry まで実行して `paused` で止まる run、記録、Expectation 候補、draft と承認          | P4         |
| P6    | execution                   | `run.start` と `rerun_step`、実行イベント                                               | P4         |
| P7    | artifact                    | 注釈画像 (SVG) と生スクリーンショット、Markdown テーブル、書き換え抑止                  | P6         |
| P8    | 横断                        | 統合テストと `pnpm boundaries`                                                          | P5, P6, P7 |

### prompts 生成方針

- `context/project.yml` の対象ドメイン境界で分ける。
- P1 と P2 は独立して並列実装できる。P3 以降は直列になる見込み。

## 上位資料からの変更点

本 spec で Design Doc / feature doc / context / 既存 ADR から変更・追加した内容を、反映先別に記録する。track / sync phase で更新する。

### 確定判断の反映先判定

D1〜D23 を全行走査し、durable な反映先を持つものと spec で閉じるものを分けた。sync phase はこの判定に従う。判定は `phase-sync.md` の ADR 化基準 (選択肢を比較して決めた判断は ADR 化を既定とし、spec で閉じられるのは選択の余地がなかった作業上の決定のみ) に照らして付けている。**spec で閉じる**としたものは、いずれも skeleton の範囲判断か既存契約の適用であり、issue が閉じれば判断そのものが意味を失う。

| 判断 | 反映先                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| D1   | feature doc: element-mapping                                                                                                |
| D2   | ADR-0027 / context: infrastructure.md / context: toolchain.md                                                               |
| D3   | ADR-0027                                                                                                                    |
| D4   | feature doc: execution                                                                                                      |
| D5   | ADR-0026                                                                                                                    |
| D6   | context: testing.md                                                                                                         |
| D7   | **spec で閉じる** (置き場の分割は adapter/store の実装詳細。`context/architecture.md` の「draft と確定を分離する」の範囲内) |
| D8   | **spec で閉じる** (skeleton の実装範囲の判断)                                                                               |
| D9   | ADR-0017                                                                                                                    |
| D10  | context: testing.md                                                                                                         |
| D11  | Design Doc: Why/What → 成功条件 / feature doc: artifact-generation / ADR (新規)                                             |
| D12  | ADR-0026                                                                                                                    |
| D13  | **spec で閉じる** (設定ファイルの配置の実装詳細)                                                                            |
| D14  | feature doc: workflow-dsl                                                                                                   |
| D15  | ADR-0002 / feature doc: execution                                                                                           |
| D16  | **spec で閉じる** (`context/infrastructure.md` の既存契約に従うだけで、契約自体は変えない)                                  |
| D17  | **spec で閉じる** (skeleton の範囲判断。導線の追加は次の issue へ)                                                          |
| D18  | feature doc: element-mapping                                                                                                |
| D19  | ADR-0002 / feature doc: execution                                                                                           |
| D20  | **spec で閉じる** (skeleton の範囲判断)                                                                                     |
| D21  | context: toolchain.md                                                                                                       |
| D22  | **spec で閉じる** (D19 の規則の適用。上位文書の追加変更なし)                                                                |
| D23  | **spec で閉じる** (DSL の書き方。語彙は既存)                                                                                |

### PRD への影響

統合モードのため PRD 単独の文書は無い (`context/project.yml` の `design.prd: integrated`)。**PRD 相当は Design Doc の Why/What 節**であり、下記の変更が要る。反映先は「Design Doc への影響」と同じ節である。

| 対象節              | 変更内容                                                                            | 理由                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Why/What → 成功条件 | 「構成番号付き PNG 画像」を「構成番号付きの注釈画像」へ一般化する (source: clarify) | 注釈画像を SVG とし、生スクリーンショットを別ファイルで持つ形に変えるため (D11) |

### Design Doc への影響

| 対象節                                       | 変更内容                                                                            | 理由                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Why/What → 成功条件                          | 「構成番号付き PNG 画像」を「構成番号付きの注釈画像」へ一般化する (source: clarify) | 注釈画像を SVG とし、生スクリーンショットを別ファイルで持つ形に変えるため (D11) |
| アーキテクチャ概観 → Runtime Boundary の記述 | context/architecture.md の改訂に合わせて表現を揃える                                | agent-browser の生存期間の記述が実測とずれるため (F10)                          |

### feature doc への影響

| 対象 doc / 節                                                                               | 変更内容                                                                                                                                                                                                                 | 理由                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| execution → Browser Port の契約                                                             | セッションの不応答を表す構造化エラーを Port の語彙に足し、再作成の判断が core にあることを明記する (source: clarify)                                                                                                     | セッションは部分的に壊れ、生存確認では検出できない (F9)。再現条件も特定できていない (F12)                                                                                  |
| execution → 実行状態と再生制御                                                              | run 開始時に pause を予約し完了時に `paused` で止める使い方を明記する。**最終ステップの完了と pause 予約が重なったときは pause を優先する**優先順位と、**pause 予約が 1 回で消費される**ことを書き足す (source: clarify) | 記録を run の枠内で行い (D15)、再現後の `rerun_step` も `paused` から掛けるため (D22)。優先順位が無いと 1 ステップの run で `completed` に倒れ、記録経路が成立しない (D19) |
| element-mapping → 座標からの要素解決                                                        | 座標解決の入力となる bounding box を `--annotate screenshot` から得ることを明示する。祖先方向の候補列と `label` / `testid` は要素選択の機能であり記録では使わないことを書き分ける (source: clarify)                      | `snapshot` の応答に box が含まれない (F7)。`--annotate` の応答に祖先関係と `label` / `testid` が無い (D1 / D18)                                                            |
| web-editor → 映像と重ね描きの対応付け                                                       | フレームと Snapshot を結ぶ識別子が agent-browser から得られないことを制約として明記する (source: clarify)                                                                                                                | 応答にフレーム識別子が無い (F14)。「対応が取れない組み合わせは描画しない」の判定材料を時刻の近似に頼ることになる                                                           |
| workflow-dsl → Schema 検証とバージョン                                                      | 実行系が未対応の語彙を表す構造化エラーを語彙に足す (source: clarify)                                                                                                                                                     | Schema は語彙を一通り受け付けるが実行系は skeleton の範囲に限るため (D8 / D14)                                                                                             |
| artifact-generation → 背景・要件解釈 / 成果物の種類と生成単位 / 書き換え抑止 / ファイル配置 | 成功条件の再掲「構成番号付き PNG 画像」を一般化し、注釈画像を SVG とする。生スクリーンショットを別ファイルで持って参照する形に変え、書き換え抑止は SVG のテキスト比較へ統一する (source: clarify)                        | Design Doc の成功条件と同じ文が feature doc にも再掲されており、片方だけ直すとずれる (D11)                                                                                 |

### context への影響

| 対象 doc / 節                                             | 変更内容                                                                                                                                                                                                                                                         | 理由                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture.md → Runtime Boundary                        | 「agent-browser は Workflow Server の子プロセスとして adapter/browser が起動・管理する」を実態に合わせる。daemon の生存期間とセッションの回収範囲を書き分ける (source: clarify)                                                                                  | daemon は CLI プロセスの終了後も生存し、既定は 1 時間のアイドルで終了する (F10)。ADR-0027 の「daemon を明示的に終了させない」とも噛み合わない             |
| architecture.md → State Boundary                          | 「draft と確定を分離する」に、**draft と正本を別の置き場に保存する**ことを書き足す (source: clarify)                                                                                                                                                             | 同節は分離の方針までしか定めていない。置き場の分割は issue が閉じても残る保存構造であり、spec の削除とともに根拠が失われる (D7)                           |
| testing.md → テスト runtime contract / fixture 対象アプリ | agent-browser の隔離は `--namespace` とテスト専用 session 名で行うことを書き足す。**`XDG_STATE_HOME` が agent-browser に効かない**ことを明記する。fixture 対象アプリを静的 HTTP サーバで配信することを書き足す (source: clarify)                                 | 実測で `XDG_STATE_HOME` は無効、`HOME` 差し替えはブラウザキャッシュを失いシステム Chrome へ落ちる (F16)。`file://` は URL に環境依存の値が入る (F15 / D6) |
| infrastructure.md → 起動時に検査するもの                  | ブラウザ本体の案内を `agent-browser install` から本リポジトリの導入コマンドへ変える (source: clarify)                                                                                                                                                            | ブラウザ本体を自前で版指定取得するため (D2)                                                                                                               |
| toolchain.md → 標準スタック / 採用方針                    | `@puppeteer/browsers` と Chrome for Testing の自前取得を標準スタック表へ足す。`agent-browser` の `engines.pnpm >=11` を外れて運用する判断と、**Chrome for Testing の版番号を `packages/adapter-browser` 配下の専用 JSON に置く**ことを記録する (source: clarify) | 同表は「現時点で未確定のものは無い」と宣言しており、依存の追加・engines 逸脱・版の置き場を反映しないと宣言が偽になる (D2 / D21 / D13)                     |

### ADR の新規 / 更新

| ADR ID     | 変更内容                                                                                                                                                                                                                                                           | 理由                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0002   | 決定と状態遷移図に「最終ステップの完了と pause 予約が重なったときは pause を優先する」を追記する。**pause 予約は 1 回で消費される**ことも添える (source: clarify)                                                                                                  | pause の意味論の正本は本 ADR であり、feature doc だけを直すと状態遷移図が優先順位を持たないまま残って正本が割れる (D19 / D22)                                                                                   |
| ADR-0017   | 承認依頼の revision を **draft の内容ハッシュ**とする方式を追記する (source: clarify)                                                                                                                                                                              | 本 ADR は「revision を固定する」とだけ定め方式を書いていない。ADR-0018 の IR 版と方式を揃えるため (D9)                                                                                                          |
| ADR-0026   | 未確認事項「入力転送でどこまでの操作種別を扱えるか」を解決済みとして記録する。座標解決に `--annotate` の box を使うこと (D1)、Snapshot を操作の直前に取ること (D5)、Expectation 候補を**操作の前後で変化した項目に絞る**こと (D12) を明記する (source: clarify)    | `input_mouse` / `input_keyboard` / `input_touch` が使え `click` は実測で通った (F4)。D12 は本 ADR の「操作後の Snapshot から URL・可視要素などの候補を出す」を実質的に狭めるため、書かないと規則が 2 通りになる |
| ADR-0027   | 未確認事項「Chrome for Testing の版を固定できるか」を解決済みとして記録する。ブラウザ本体を自前で版指定取得し `--executable-path` で明示する方針、起動時検査が案内する導入コマンドの変更、`onlyBuiltDependencies` を足す根拠の書き直しを反映する (source: clarify) | `install` では固定できない (F1)。`onlyBuiltDependencies` は「無いと壊れる」ではなく「ネイティブバイナリを直接 spawn し 1 回あたり約 94ms の node 起動を避ける」ことが根拠である (F2 / D3)                       |
| ADR (新規) | 注釈画像を SVG とし、生スクリーンショットを別ファイルで持って参照する判断を新規 ADR として起こす (source: clarify)                                                                                                                                                 | 選択肢を比較した判断であり、Design Doc の成功条件を変えるため (D11)                                                                                                                                             |

## レビュー

`spec-review` (fresh-context evaluator) の最新結果。完全な記録は `review.md` を参照する。

| 日付       | 結果 (PASS / NEEDS_WORK) | 指摘要点                                                                                                                                      | 対応                                                                                                                                       |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-22 | NEEDS_WORK               | 上位文書整合 / 未解決論点 / 外部依存 / template 必須節で指摘 10 件。D11 が Design Doc の成功条件「構成番号付き PNG 画像」を覆す点が最大       | 全 10 件を反映。D11 は維持し Design Doc の成功条件の一般化と新規 ADR を影響表へ追加。設計の穴 4 件を D15〜D18 として確定                   |
| 2026-08-22 | NEEDS_WORK               | 2 回目。1 回目の指摘のうち 5 件が解消、5 件が一部。新規指摘 7 件。`paused` と `completed` の優先順位が上位文書に無い点が最大                  | 全 7 件を反映。優先順位を D19、Screen 文書の初期 draft を D20、pnpm engines を D21 として確定                                              |
| 2026-08-22 | NEEDS_WORK               | 3 回目。2 回目の指摘は 6 件解消・1 件一部。観点別 PASS が 5 つ。新規指摘 4 件。Flow 10 の `rerun_step` が `completed` の run に掛かる点が最大 | 全 4 件を反映。D22 / D23 を確定し ADR-0002 を整合表と ADR 影響表へ追加。確定判断の反映先判定を全行付けた                                   |
| 2026-08-23 | NEEDS_WORK               | 4 回目。D22 / D23 は解消。ADR 3 行が誤った表にあり整合表の列も崩れていた。D7 の「spec で閉じる」判定に疑義                                    | 全 4 件を反映。3 行を ADR 影響表へ移し整合表を 3 列形式へ戻した。D7 は context/architecture.md、D13 は context/toolchain.md を反映先にした |

## 変更履歴

| 日付       | 変更者   | 変更内容                                                                                         |
| ---------- | -------- | ------------------------------------------------------------------------------------------------ |
| 2026-08-22 | Fukuemon | scaffold phase で新規作成。事前調査 F1〜F11 と論点 D1〜D12 を記載                                |
| 2026-08-22 | Fukuemon | clarify phase で D1 を確定 (座標解決の入力は `--annotate` の box)                                |
| 2026-08-22 | Fukuemon | clarify phase で D2 を確定 (Chrome for Testing を自前で版指定取得)。D13 を起票                   |
| 2026-08-22 | Fukuemon | clarify phase で D3 を確定 (ネイティブバイナリを直接 spawn)                                      |
| 2026-08-22 | Fukuemon | clarify phase で D4 を確定 (不応答を Port の構造化エラーに)。F12 を追記                          |
| 2026-08-22 | Fukuemon | clarify phase で D5 を確定 (操作の直前に撮る)。F13 / F14 を追記                                  |
| 2026-08-22 | Fukuemon | clarify phase で D6 / D7 / D8 を確定。F15 と D14 を追記                                          |
| 2026-08-22 | Fukuemon | clarify phase で D9 / D10 / D13 / D14 を確定。F16 を追記                                         |
| 2026-08-22 | Fukuemon | clarify phase で D11 / D12 を確定。全論点の確定を完了                                            |
| 2026-08-22 | Fukuemon | clarify gate が NEEDS_WORK。指摘を反映し D15〜D18 を起票、F17 / F18 を追記                       |
| 2026-08-22 | Fukuemon | clarify phase で D15〜D18 を確定。User Flow と起動時検査を書き直した                             |
| 2026-08-22 | Fukuemon | 2 回目の指摘を反映し D19 / D20 / D21 を確定                                                      |
| 2026-08-23 | Fukuemon | 3 回目の指摘を反映し D22 / D23 を確定。ADR-0002 を整合表へ載せ、確定判断の反映先判定を全行付けた |
| 2026-08-23 | Fukuemon | 4 回目の指摘を反映。ADR 3 行を影響表へ移し整合表を 3 列へ戻した。D7 / D13 に反映先を付けた       |

## 備考

なし。追加 appendix (API / Database / Authorization / Screen / testid) は取り込んでいない。endpoint と画面構成は diagram phase で確定させる。
