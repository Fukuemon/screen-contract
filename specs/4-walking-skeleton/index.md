# walking skeleton: 記録 → 再現 → 成果物を 1 画面で通す

## メタ情報

- Issue: `#4`
- ステータス: `Draft`
- 作成日: 2026-08-22
- 更新日: 2026-08-22
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
| 5   | 論点解決                    | 進行中 | 2026-08-22 | D1〜D4 確定。D5〜D13 が未決                         |
| 6   | Interface / Routing 設計    | 未着手 |            |                                                     |
| 7   | Content / Data 設計         | 未着手 |            |                                                     |
| 8   | Performance / Security 設計 | 未着手 |            |                                                     |
| 9   | Test / Metrics 設計         | 未着手 |            |                                                     |
| 10  | 実装分割                    | 未着手 |            |                                                     |
| 11  | レビュー済                  | 未着手 |            |                                                     |

## 上位文書整合

正本 ([Design Doc](../../design/DesignDoc.md) / [feature doc](../../design/features/) / [context](../../context/) / ADR) のどの節と、どう整合させたかを記録する。PRD は統合モードのため Design Doc の Why/What 節が該当する。

- PRD 更新要否: 不要 (統合モード。Why/What に変更なし)
- Design Doc 更新要否: 要 (下記 context 起因の記述 1 件。clarify の結論次第)
- ADR 起票要否: 未定 (D2 / D3 の結論次第。既存 ADR の改訂で足りる見込み)

| 上位文書                         | 節 / 該当箇所                                             | 整合方針 (継承 / 補足 / 変更提案) |
| -------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Design Doc                       | スコープ → 冪等実行 / 要素同一性 / 成果物生成 / 記録      | 継承                              |
| Design Doc                       | モジュール責務 → core 層 / adapter/browser / 合成ルート   | 継承                              |
| Design Doc                       | Non Goals → 任意 JS の無制限実行                          | 継承 (D1 の選択肢が接触する)      |
| feature doc: workflow-dsl        | 文書構造 / 状態モデル / action 語彙 / Expectation 語彙    | 補足 (skeleton の最小部分集合)    |
| feature doc: execution           | ステップ実行のルール / Browser Port の契約 / 実行イベント | 補足 (D4 が契約に 1 項目を足す)   |
| feature doc: element-mapping     | 座標からの要素解決と候補の正規化                          | 補足 (D1 が取得手段を確定する)    |
| feature doc: artifact-generation | 注釈画像の描画規則 / 書き換え抑止                         | 補足 (D11 が描画手段を確定する)   |
| feature doc: web-editor          | 操作の記録 → draft のフロー / Stream の接続構成           | 継承                              |
| context: architecture            | Package Boundary / 依存方向 / Port の定義場所             | 継承                              |
| context: architecture            | Runtime Boundary → agent-browser の起動と管理             | 変更提案 (実測と生存期間がずれる) |
| context: testing                 | テスト責務の分担 / fixture 対象アプリ / runtime contract  | 補足 (D10 が隔離手段を確定する)   |
| ADR-0008                         | Stream Proxy の経路と入力転送の検証                       | 継承 (実測で裏付け済み)           |
| ADR-0012                         | 永続要素 ID と構成番号の分離                              | 継承 (実測で必要性を再確認)       |
| ADR-0017                         | draft と確定の境界 / revision 固定                        | 継承                              |
| ADR-0026                         | 操作の記録 / 座標を残さない / 未確認事項                  | 変更提案 (未確認事項が解決した)   |
| ADR-0027                         | agent-browser の同梱 / ブラウザの起動時検査 / 未確認事項  | 変更提案 (根拠と手段が実測と違う) |

> 変更提案を 3 件検出した。durable な反映は `spec-lifecycle` の sync phase で行う。いずれも clarify の結論に依存するため、clarify を先に通す。

## 関連資料

- `design/DesignDoc.md`: スコープ / Goal / モジュール責務 / Non Goals
- `design/features/workflow-dsl/DesignDoc_workflow-dsl.md`: Screen 文書の構造、状態モデル、action と Expectation の語彙
- `design/features/execution/DesignDoc_execution.md`: ステップ実行のルール、Browser Port の契約、実行イベント
- `design/features/element-mapping/DesignDoc_element-mapping.md`: 座標からの要素解決、Locator モデル
- `design/features/artifact-generation/DesignDoc_artifact-generation.md`: 注釈画像とテーブルの生成、書き換え抑止
- `design/features/web-editor/DesignDoc_web-editor.md`: 記録の UI フロー、Stream の接続構成
- `context/architecture.md`: 依存方向、Port の定義場所、Runtime Boundary
- `context/testing.md`: テスト 3 層の責務、fixture 対象アプリ、runtime contract
- `adr/0008-stream-proxy.md` / `adr/0012-element-id-number-separation.md` / `adr/0017-agent-draft-boundary.md` / `adr/0026-operation-recording.md` / `adr/0027-agent-browser-bundling.md`
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

| #   | 確定した事実                                                                                                                                                                                                                                                      | 影響する論点              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| F1  | `agent-browser install` に版指定フラグが無い。Chrome for Testing は `~/.agent-browser/browsers/chrome-<version>/` に版ごとのディレクトリで入り、`--executable-path` で明示指定できる。指定しないとシステムの Chrome を自動検出する経路がある                      | D2                        |
| F2  | 全プラットフォームのネイティブバイナリが npm tarball に同梱される。postinstall はダウンロードではなく実行ビットの付与が主。pnpm では実行ビットが 644 に落ちるが、`.bin` の JS wrapper が初回起動時に自分で chmod するため動作はする                               | D3                        |
| F3  | `engines` は `node >=24` / `pnpm >=11` だが、pnpm 10.27.0 で警告なく install できた。engines は install をブロックしない                                                                                                                                          | D3                        |
| F4  | streaming は常時有効で、セッションごとに localhost の WebSocket が開く。プロトコルはフレーム受信 (`frame`) と入力送信 (`input_mouse` / `input_keyboard` / `input_touch`)。実際に `input_mouse` の mousePressed / mouseReleased を座標指定で送るとモーダルが開いた | D5                        |
| F5  | 入力は CDP 生の座標のみで、要素情報を含まない。よって座標から要素への解決は必須である                                                                                                                                                                             | D1                        |
| F6  | `snapshot` の `refs` は role と name を返すが、**ref は snapshot ごとに振り直される**。クリック前の `e2` はボタン A、クリック後の `e2` はボタン B になった                                                                                                        | 継承 (ADR-0012 の裏付け)  |
| F7  | `snapshot` の応答に bounding box が含まれない。box を得る手段は `--annotate screenshot` (全要素の box + role + name + 番号を JSON で返す)、`eval` の `document.elementFromPoint`、`get box <sel>` の反復の 3 つ                                                   | D1 / D11                  |
| F8  | 同一状態で 8 回撮ったスクリーンショットがすべてバイト同一だった。`snapshot` の 2 回出力も一致した                                                                                                                                                                 | 継承 (決定性の前提が成立) |
| F9  | `Page.captureScreenshot` の CDP タイムアウトにより、**スクリーンショットだけが恒久的に詰まる**セッションが発生した。同じセッションで `snapshot` は成功し続けるため、部分的に壊れる。単一セッションでの 8 連続は成功したため回数依存ではない。原因は未特定         | D4                        |
| F10 | daemon は最初のコマンドで自動起動し、CLI プロセスの終了後も生存する。既定は 1 時間のアイドルで終了し、`--idle-timeout` で変更できる。セッションは `close` で明示的に閉じられる                                                                                    | D4 / context への変更提案 |
| F11 | Semantic Locator は `find role <role> --name <name> <action>` の形で解決できる                                                                                                                                                                                    | 継承                      |
| F12 | F9 の詰まりは**再現条件を特定できていない**。単一セッションでの 20 連続、3 セッション同時に各 6 枚、`--annotate screenshot` の 10 回反復、`reload` 直後の撮影の 4 通りでは再現しなかった                                                                          | D4                        |

## スコープ

### やること

- `packages/fixture-app` に 1 画面 1 遷移の対象アプリを置く。ボタンを 1 つ押すとモーダルが開く静的 HTML とし、role と accessible name を付けて Semantic Locator で一意に解決できることを保証する
- Screen 文書の最小 DSL (`default` と、そこから 1 回の `click` で到達する状態の 2 つ) を扱う core/workflow の Schema 検証と IR 正規化
- 操作の記録: Stream Proxy を通る入力を要素へ解決し、`click` の step と要素定義を draft へ入れる
- 記録停止後の Expectation 候補の提示と、選んだ候補の step への反映
- draft と正本の分離、承認キュー、承認依頼の revision 固定と `stale` 判定
- `run.start` による再現と、同一セッションでの `rerun_step` による冪等スキップ
- 実行イベント列だけからステップ結果を再構成できること
- バッジ 1 個の注釈画像と 1 行の Markdown テーブルの生成、および同一入力での書き換え抑止
- `agent-browser` の npm 依存としての同梱と版固定、Chrome for Testing の自前取得と版固定、起動時のブラウザ検査、`runtime.json` の生成と削除
- agent-browser を実起動する統合テスト

### やらないこと

| 除外するもの                     | 理由                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| 状態木の複数分岐・`fragments`    | 2 状態あれば記録と再現は検証できる                            |
| 再採番 (`element.renumber`)      | 要素が 1 つなので番号は 1 固定                                |
| 差分検知 (core/diff)             | Baseline の 2 回目が要り、範囲が倍になる                      |
| POM 生成                         | `outputs: [spec]` のみ。生成規則は独立した関心                |
| 認証プロファイル                 | 匿名のみ。fixture-app にログインを置かない                    |
| agent interface (MCP / JSON-RPC) | 記録は Web UI からの経路                                      |
| 提案依頼キュー / AI Port         | AI が居なくても完結する経路だけを通す                         |
| 差し戻しのループ                 | 承認のみ。差し戻しは厚くする段階で                            |
| E2E (Playwright)                 | `context/testing.md` のとおり Web UI の実装が動いてから入れる |

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

| #   | 論点                                                                                            | 決定候補                                                                                                                                 | 決定 |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| D5  | 記録時の Snapshot をどの時点で取るか (F4)                                                       | (a) 入力イベントごとに操作の直前に取る (b) 操作の直後に取り、直前の状態は 1 つ前の Snapshot を使う (c) フレームの `seq` と対応づけて取る | 未決 |
| D6  | fixture-app をどう配信するか                                                                    | (a) 静的 HTTP サーバをテスト起動時に立てる (b) `file://` で直接開く                                                                      | 未決 |
| D7  | draft と正本をどう分けて保存するか (adapter/store のレイアウト)                                 | (a) 同一ファイルの版として持つ (b) draft と正本を別の置き場に分ける                                                                      | 未決 |
| D8  | skeleton で実装する DSL Schema の範囲                                                           | (a) 2 状態 1 遷移に必要な項目だけを Schema 化する (b) workflow-dsl feature の語彙を一通り Schema 化する                                  | 未決 |
| D9  | 承認依頼の revision をどう表すか (`stale` 判定の実体)                                           | (a) draft の内容ハッシュ (b) 単調増加する版番号                                                                                          | 未決 |
| D10 | 統合テストで agent-browser をどう隔離するか (F10)                                               | (a) テスト専用の `--namespace` と session 名を使う (b) `XDG_STATE_HOME` と `AGENT_BROWSER_*` をテスト専用に向ける (c) 両方               | 未決 |
| D11 | 注釈画像のバッジ描画に何を使うか (F7)                                                           | (a) 画像ライブラリで PNG へ直接描く (b) SVG を重ねてラスタライズする (c) agent-browser の `--annotate` 出力をそのまま使う                | 未決 |
| D12 | Expectation 候補を操作後 Snapshot から何として出すか                                            | (a) 出現した要素の `element.visible` のみ (b) `url` と `title` も候補に含める                                                            | 未決 |
| D13 | Chrome for Testing の版番号をどこに書くか (D2 の帰結。npm 依存ではないため lockfile に載らない) | (a) `package.json` の独自フィールド (b) 専用の設定ファイル (c) `context/project.yml`                                                     | 未決 |

## 解決済みの論点

- **D1: 座標解決の入力は `--annotate screenshot` が返す bounding box を使う。**
  - 根拠: element-mapping が要求する box + role + name が 1 回の CLI 呼び出しで揃う。バッジ描画 (D11) も同じ経路で材料を得られ、取得の系統が 1 本で済む。
  - トレードオフ: スクリーンショット生成を伴うため、`Page.captureScreenshot` が詰まると記録そのものが止まる (F9)。扱いは D4 で決める。生成された注釈済み画像は保存せず捨てる (差分検知の対象は生スクリーンショットであるため)。
  - 却下した代替案: `eval` の `document.elementFromPoint` は対象ページで任意 JS を実行し、ADR-0026 が却下した「JS を注入して DOM イベントを拾う」と擦れるため却下。`get box` の反復は要素数に比例して CLI 呼び出しが増え、厚くする段階で作り直しになるため却下。

- **D2: Chrome for Testing を自前で版指定取得し、`--executable-path` で常に明示する。**
  - 根拠: 決定性が `decision_priority` の 1 位であり、実行基盤を勝手に動かさない形を最初から取る。自前取得は実行ファイルのパスが決定的に返るため、`doctor --json` の message 文字列を解析する経路が消える。
  - 併せて決まること: 起動時のブラウザ検査が案内するのは**本リポジトリの導入コマンド**とする (暫定名 `pnpm browser:install`)。システムの Chrome を自動検出させない。
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

## 未確定事項

- D5〜D13 が未決である。clarify phase で 1 件ずつ確定させる。D1 / D2 / D3 / D4 は確定した。D13 は D2 の帰結として新たに起票した。
- 上位文書への変更提案 3 件 (ADR-0026 / ADR-0027 / context/architecture.md) のうち、context/architecture.md の反映内容は D4 で確定した。ADR-0027 は D2 と D3 で反映内容が確定した。ADR-0026 は D1 が `eval` を選ばなかったため、未確認事項の解決記録だけを反映する。
- F9 の詰まりの再現条件が特定できていない (F12)。原因が agent-browser 側か利用側かを切り分けられていないため、上流への報告は行わない。
- 入力転送で `hover` と `scroll` が扱えるかは未検証である。`input_mouse` の `mouseMoved` / `mouseWheel` で表現できる見込みだが、実測していない。skeleton は `click` だけで足りるため、確認は厚くする段階に送る。

## 実装対象

正規 target は `context/project.yml` の対象ドメイン一覧を正本とする。

| モジュール  | 実装有無 | 主な責務                                                                                              |
| ----------- | :------: | ----------------------------------------------------------------------------------------------------- |
| `workflow`  |    ◯     | 2 状態 1 遷移の Screen 文書の Schema 検証と IR 正規化                                                 |
| `execution` |    ◯     | ステップ実行、冪等スキップ、Browser Port の契約と agent-browser 実装、実行イベント                    |
| `element`   |    ◯     | 要素定義、座標からの要素解決、Semantic Locator の生成                                                 |
| `artifact`  |    ◯     | バッジ 1 個の注釈画像、1 行の Markdown テーブル、書き換え抑止                                         |
| `diff`      |    -     | 範囲外 (Baseline の 2 回目が要る)                                                                     |
| `web`       |    ◯     | 記録の開始と停止、Expectation 候補の選択、承認キュー、live viewport                                   |
| `agent`     |    -     | 範囲外 (MCP / JSON-RPC は通さない)                                                                    |
| `infra`     |    ◯     | agent-browser と Chrome for Testing の同梱と版固定、起動時のブラウザ検査、`runtime.json` の生成と削除 |

## 機能仕様

### User Flow

1. 利用者が Workflow Server を起動する。ブラウザ本体が無ければ導入コマンドを案内して中止する。
2. 利用者が Web UI で fixture-app を開き、操作モードに切り替えて記録を開始する。
3. 利用者がボタンをクリックする。server が入力を要素へ解決し、`click` の step と要素定義を draft へ入れる。
4. 利用者が記録を停止する。操作後の Snapshot から Expectation 候補が提示される。
5. 利用者が候補を 1 つ選び、step の `expect` に入れる。
6. 利用者が承認依頼を出し、差分を確認して承認する。draft が Screen 文書の正本になる。
7. 利用者が `run.start` で実行する。記録どおりに操作が再現される。
8. モーダルが開いた状態のまま、同一セッションで最初のステップから `rerun_step` する。全ステップが `skipped` になり `completed` で終わる。
9. 到達した状態で成果物を生成する。バッジ 1 個の注釈画像と 1 行の Markdown テーブルが出る。
10. もう一度生成する。ファイルは書き換わらない。

### Reuse Policy

- 第一原則は feature / colocation とする。skeleton は各 core の最小実装を置くだけで、共通化を先回りしない。
- agent-browser の CLI 呼び出しは `packages/adapter-browser` に閉じる。CLI の引数組み立て、`--json` のパース、プラットフォーム別のバイナリパス解決 (D3) を他層へ漏らさない。
- 記録の座標解決は element-mapping feature の要素選択と**同じ規則**を使う (ADR-0026)。記録専用の解決規則を作らない。

### Performance

- CLI の呼び出し回数を実行ステップ数に対して線形に保つ。D1 の決定により、座標解決 1 回あたりの CLI 呼び出しは `--annotate screenshot` の 1 回で済む (要素数に依存しない)。
- `--annotate screenshot` は呼ぶたびに画像を生成する。**記録中に生成した注釈済み画像は保存せず捨てる。** 残すと成果物の注釈画像と紛らわしく、差分検知の対象を誤らせる。
- CLI はネイティブバイナリを直接 spawn する (D3)。1 回あたり約 6ms で、JS wrapper 経由の約 100ms を避ける。

### Routing / URL State

- Web UI の URL は `screen / state / run` を表し、リロードしても同じ文脈に戻る (web-editor feature)。skeleton では 1 画面 2 状態しか無いため、状態の切替は URL に載せるだけとする。

### Content / Assets

- fixture-app の HTML は `packages/fixture-app` に置き、**内容を固定する** (`context/testing.md`)。外部サイトを対象にしない。
- 成果物の既定の出力先は `artifacts/screens/<screen-id>/<authProfile>/` とする (artifact-generation feature)。skeleton の `authProfile` は匿名固定。

### UI Reuse

- 記録の開始・停止と Expectation 候補の選択は `apps/web` に閉じる。共有 UI へ切り出さない。

### Testing

- 記録の解決ロジック・承認・再現・成果物は `apps/server/src/**/*.integration.test.ts` で agent-browser を実起動して検証する (`context/testing.md`)。
- 成果物の決定性と座標解決の規則は core の unit test で検証する。座標解決は「座標 + box 付き要素一覧」を入力とする純粋関数として書き、CLI の呼び出しをまたがせない。
- **記録の UI 操作だけは手動確認が残る。** E2E は Browser Port を fake に置き換える設計のため、記録の実挙動を E2E では検証できない。
- E2E (Playwright) は skeleton の範囲に含めない。

## Interface 設計

### UI / API / Event Interface

clarify で確定させる。現時点で必要と見込む面を列挙する。

- HTTP: 記録の開始・停止、draft の取得、承認依頼、承認、`run.start`、`rerun_step`、成果物生成。
- WebSocket: Stream Proxy (映像フレームの中継と入力転送)、実行イベントの購読。
- 実行イベント: `run-started / step-started / expectation-evaluated / step-skipped / step-executed / paused / resumed / run-completed` のうち skeleton で発行するものを確定する。セッション再作成を行った場合は、ページ状態を失ったことがイベント列から読めるようにする (D4)。

### Props / Request / Response

- clarify と diagram を経てから記述する。

## Content / Data 設計

### 保存・管理するデータ

- Screen 文書 (draft / 正本)、承認依頼 (対象 draft の revision つき)、実行履歴 (入力・StepResult・Snapshot 参照・スクリーンショット参照)、成果物と `meta.json`。
- 実行中の一時状態 (agent-browser の ref、実行途中のステップ状態) は永続化しない (`context/architecture.md` の State Boundary)。
- ref は snapshot ごとに振り直されるため (F6)、**DSL にも実行履歴にも保存しない**。
- 記録中に `--annotate screenshot` が生成する注釈済み画像は保存しない (D1)。使うのは応答に含まれる box だけである。

### コンテンツ配置 / package / route

- `packages/adapter-store` がファイルとして保存する。draft と正本の分け方は D7 で確定する。

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

| #   | ケース                                      | ユーザーへの見せ方                                                                                                                            | リカバリ                                                             |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | ブラウザ本体が見つからない                  | 本リポジトリの導入コマンドを案内して起動を中止する                                                                                            | 利用者が導入コマンド (暫定名 `pnpm browser:install`) を 1 回実行する |
| 2   | 記録した操作を一意な Locator へ解決できない | `clickPoint` として残し警告を出す。記録は止めない                                                                                             | 利用者が要素定義を手で整える                                         |
| 3   | 承認待ちの間に対象 draft が編集された       | `stale` として表示し確定させない                                                                                                              | 依頼を出し直す                                                       |
| 4   | 実行後も Expectation を満たさない           | 失敗ステップと評価結果をイベントで提示し run を `failed` にする                                                                               | DSL か要素定義を直して再実行する                                     |
| 5   | daemon またはセッションが応答しない (F9)    | Browser Port が構造化エラーを返し、run を止めるか再作成するかを core/execution が決める。再作成した場合はページ状態を失うことをイベントに残す | 利用者が run をやり直す                                              |

### Fallback

- Expectation を選ばずに承認できてしまう点を UI で明示する。選ばないと冪等スキップが効かず毎回実行される (web-editor feature)。

## テスト / 評価方針

### テスト観点

- 記録: 解決した step が `ref` を指すこと。要素定義が同時に draft へ入ること。既存定義に一致する場合に重複定義を作らないこと。
- 承認: draft と正本が別のものとして保存されていること。承認前の draft を承認後の正本が上書きしないこと。`stale` 判定が効くこと。
- 再現: 同一セッションでの `rerun_step` で全ステップが `skipped` になり `completed` で終わること。イベント列だけからステップ結果を再構成できること。
- 成果物: 同一入力での再生成でファイルの mtime が変わらないこと。バッジ位置とテーブル内容の決定性。
- 基盤: ブラウザ本体が無い状態で起動が中止すること。`runtime.json` が終了時に消えること。
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

clarify と diagram を経てから確定する。現時点の見込みを置く。

| Phase | 対象                        | 概要                                                                                     | 依存       |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| P1    | infra                       | agent-browser と Chrome for Testing の同梱と版固定、起動時のブラウザ検査、`runtime.json` | なし       |
| P2    | fixture-app                 | 1 画面 1 遷移の静的 HTML と配信                                                          | なし       |
| P3    | execution / adapter-browser | Browser Port の契約と agent-browser 実装、Snapshot 取得                                  | P1, P2     |
| P4    | workflow / element          | 最小 Schema と IR 正規化、座標からの要素解決                                             | P3         |
| P5    | app / api / web             | 記録、Expectation 候補、draft と承認                                                     | P4         |
| P6    | execution                   | `run.start` と `rerun_step`、実行イベント                                                | P4         |
| P7    | artifact                    | 注釈画像と Markdown テーブル、書き換え抑止                                               | P6         |
| P8    | 横断                        | 統合テストと `pnpm boundaries`                                                           | P5, P6, P7 |

### prompts 生成方針

- `context/project.yml` の対象ドメイン境界で分ける。
- P1 と P2 は独立して並列実装できる。P3 以降は直列になる見込み。

## 上位資料からの変更点

本 spec で Design Doc / feature doc / context / 既存 ADR から変更・追加した内容を、反映先別に記録する。track / sync phase で更新する。

### PRD への影響

統合モードのため PRD 単独の文書は無い。Design Doc の Why/What 節に変更はない。

| 対象節 | 変更内容 | 理由                      |
| ------ | -------- | ------------------------- |
| なし   | なし     | Why/What に変更が無いため |

### Design Doc への影響

| 対象節 | 変更内容                                                                           | 理由                                                   |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 未定   | context/architecture.md の Runtime Boundary の改訂に合わせて表現を揃えるか判断する | agent-browser の生存期間の記述が実測とずれるため (F10) |

### feature doc への影響

| 対象 doc / 節                        | 変更内容                                                                                                             | 理由                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| execution → Browser Port の契約      | セッションの不応答を表す構造化エラーを Port の語彙に足し、再作成の判断が core にあることを明記する (source: clarify) | セッションは部分的に壊れ、生存確認では検出できない (F9)。再現条件も特定できていない (F12)      |
| element-mapping → 座標からの要素解決 | 座標解決の入力となる bounding box を `--annotate screenshot` から得ることを明示する (source: clarify)                | `snapshot` の応答に box が含まれないため (F7)。取得手段を書かないと adapter ごとに解釈が割れる |

### context への影響

| 対象 doc / 節                        | 変更内容                                                                                                                                                                        | 理由                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture.md → Runtime Boundary   | 「agent-browser は Workflow Server の子プロセスとして adapter/browser が起動・管理する」を実態に合わせる。daemon の生存期間とセッションの回収範囲を書き分ける (source: clarify) | daemon は CLI プロセスの終了後も生存し、既定は 1 時間のアイドルで終了する (F10)。ADR-0027 の「daemon を明示的に終了させない」とも噛み合わない |
| testing.md → テスト runtime contract | 統合テストでの agent-browser の隔離手段を書き足す                                                                                                                               | D10 の結論に依存                                                                                                                              |

### ADR の新規 / 更新

| ADR ID   | 変更内容                                                                                                                                                                                                                                                           | 理由                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0026 | 未確認事項「入力転送でどこまでの操作種別を扱えるか」を解決済みとして記録する。座標解決の手段を D1 の結論で明記する                                                                                                                                                 | `input_mouse` / `input_keyboard` / `input_touch` が使え、`click` は実測で通った (F4)。D1 が `eval` を選ぶ場合、却下した代替案「JS を注入して DOM イベントを拾う」との境界を書き分ける必要がある |
| ADR-0027 | 未確認事項「Chrome for Testing の版を固定できるか」を解決済みとして記録する。ブラウザ本体を自前で版指定取得し `--executable-path` で明示する方針、起動時検査が案内する導入コマンドの変更、`onlyBuiltDependencies` を足す根拠の書き直しを反映する (source: clarify) | `install` では固定できない (F1)。`onlyBuiltDependencies` は「無いと壊れる」ではなく「ネイティブバイナリを直接 spawn し 1 回あたり約 94ms の node 起動を避ける」ことが根拠である (F2 / D3)       |

## レビュー

`spec-review` (fresh-context evaluator) の最新結果。完全な記録は `review.md` を参照する。

| 日付   | 結果 (PASS / NEEDS_WORK) | 指摘要点                | 対応 |
| ------ | ------------------------ | ----------------------- | ---- |
| 未実施 | -                        | clarify gate で実施する | -    |

## 変更履歴

| 日付       | 変更者   | 変更内容                                                                       |
| ---------- | -------- | ------------------------------------------------------------------------------ |
| 2026-08-22 | Fukuemon | scaffold phase で新規作成。事前調査 F1〜F11 と論点 D1〜D12 を記載              |
| 2026-08-22 | Fukuemon | clarify phase で D1 を確定 (座標解決の入力は `--annotate` の box)              |
| 2026-08-22 | Fukuemon | clarify phase で D2 を確定 (Chrome for Testing を自前で版指定取得)。D13 を起票 |
| 2026-08-22 | Fukuemon | clarify phase で D3 を確定 (ネイティブバイナリを直接 spawn)                    |
| 2026-08-22 | Fukuemon | clarify phase で D4 を確定 (不応答を Port の構造化エラーに)。F12 を追記        |
