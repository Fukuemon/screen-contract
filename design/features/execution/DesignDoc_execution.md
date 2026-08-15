---
type: feature-design
title: 冪等実行と再生制御
description: core/execution のステップ実行ルール、期待状態評価と冪等スキップ、実行状態と遷移 (pause / resume / 巻き戻し)、Browser Port 契約、実行イベント
status: 進行中
keywords:
  [
    冪等実行,
    期待状態,
    再生制御,
    一時停止,
    巻き戻し,
    Browser Port,
    実行イベント,
    core/execution,
  ]
governs:
  - packages/core-execution/
  - packages/adapter-browser/
verified_commit: 06294328869e7cee3dcd9a1f51659dff7edf05d7
---

# Feature 設計: 冪等実行と再生制御 (core/execution)

Feature 単位の設計 doc。仕様 (What) をどう実現するか (How) を、データ構造・フロー単位で記述する。責務・範囲・方針の層に留め、実装レベルの手順は spec へ委譲する。全体像は [design/DesignDoc.md](../../DesignDoc.md)、横断規約は [context/](../../../context/) を参照する。

**現在の設計だけを書く。** 判断の経緯は ADR を参照する (pause の意味論は [adr/0002](../../../adr/0002-pause-semantics.md)、実行基盤の選定は [adr/0013](../../../adr/0013-agent-browser-runtime.md))。

## 概要

core/execution は「DSL に書かれたステップ列を、ブラウザ上で再現可能に実行する」機能の中核である。本書は次の 4 つを定義する。

1. **ステップ実行のルール** — 各ステップを「期待状態を確認してから操作する」形で処理し、既に満たされていれば操作しない (冪等スキップ)。
2. **実行状態と再生制御** — 実行がどの状態を取り、一時停止・再開・巻き戻し・再実行でどう遷移するか。
3. **Browser Port の契約** — ブラウザ操作を外部 (agent-browser) へ委ねるために core が定める interface。
4. **実行イベント** — 実行の進行を UI・エージェント・実行履歴へ伝える通知の語彙。

本書で使う **Workflow IR** (Intermediate Representation) とは、YAML で書かれた DSL を実行しやすい形へ正規化した内部表現である。core/workflow が DSL の検証と正規化を行って IR を生成し、core/execution は YAML を直接読まず、IR のうち**実行ステップ列** (対象状態への平坦化ビュー) だけを入力に取る。IR の構造 (Screen IR / 実行ステップ列の 2 ビュー) は workflow-dsl feature が定義する。

## 背景・要件解釈

- ブラウザ操作の再現が担当者の手順に依存する問題を、DSL の宣言的実行で解消する (DesignDoc の Why)。
- 本設計が満たすべき成功条件 (DesignDoc の What から):
  - 同じ初期状態と入力で同じ DSL を実行した場合、同じ期待状態へ到達する。
  - 既に期待状態を満たしている操作は再実行せず、変更なしとして記録する (冪等実行)。
  - DSL の実行をステップ単位で自動再生し、任意のステップで一時停止・再開・再実行できる。
  - 各実行について、入力、ステップ結果、Snapshot、スクリーンショット、差分結果を追跡できる。

## スコープ

### やること

- ステップ実行のルール (期待状態の評価 → 冪等スキップ判定 → 操作 → 検証)
- 実行状態と遷移 (run / step が取りうる状態、一時停止・再開・巻き戻し・ステップ単位の再実行)
- Browser Port の契約 (セッションライフサイクル、型付きコマンド、Snapshot / スクリーンショット取得)
- 実行イベントの語彙と発行順序 (web / agent interface / 実行履歴が共通に購読する)
- 実行履歴として永続化する記録内容の定義 (保存自体は Store Port 経由で app が行う)

### やらないこと

- DSL の構文と期待状態の宣言語彙 → workflow-dsl feature (core/execution は正規化済みの Workflow IR だけを受け取り、YAML を直接扱わない)
- 要素の同一性・採番 → element-mapping feature
- 成果物生成・差分検知 → artifact-generation / change-detection feature
- 再生 UI の表現・ライブ映像の描画 → web-editor feature
- イベントの外部公開形式 (WebSocket / MCP notification 等) → agent-interface feature
- 分散実行・複数ブラウザ並列 (DesignDoc の Lower-Priority Goals)

## 設計

### データ構造 / コンテンツモデル

| 型             | 内容                                                                                                                             | 備考                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Run            | 1 回の実行。workflow 参照、固定した IR 版、認証コンテキスト、入力、RunStatus、StepResult の列                                    | 実行履歴の単位                                |
| RunStatus      | `idle → running → paused → (running…) → completed / failed / aborted`                                                            | 遷移は後述の「実行状態と再生制御」            |
| Step (IR)      | 操作 (action) と期待状態 (expectation) の組。core/workflow が正規化して渡す                                                      | core/execution は IR を変更しない             |
| Expectation    | 実行後に満たされるべき宣言的条件の集合                                                                                           | 語彙は workflow-dsl が定義。評価は本 feature  |
| StepResult     | outcome (`skipped / executed / failed`)、評価した Expectation の結果、実行前後の Snapshot 参照、スクリーンショット参照、所要時間 | `skipped` = 冪等スキップ (「変更なし」の記録) |
| ExecutionEvent | 実行中に発行するイベント (後述)                                                                                                  | append-only。順序は決定的                     |

### ステップ実行のルール

各ステップを次の手順で処理する。

1. **評価**: 現在の画面状態に対して Expectation を評価する。
2. **冪等スキップ**: すべて満たしていれば action を実行せず `skipped` として記録する。
3. **実行**: 満たしていなければ action を Browser Port 経由で実行する。
4. **検証**: 実行後に Expectation を再評価する。満たせば `executed`、満たさなければ `failed` として run を `failed` に遷移する。

Expectation の評価は Snapshot (Accessibility ツリー + 補助情報) を入力とする純粋関数として実装し、Browser Port は Snapshot の取得までを担う。同じ Snapshot に対する評価結果は常に同じである (再現性の要)。

**Expectation を持たないステップは、評価を省いて必ず action を実行する。** 「すべて満たす」を空集合へ素直に適用すると常に真になり、action が一度も実行されないまま `skipped` になる。空集合は「期待状態を宣言していない」ことを意味し、「既に満たしている」ことを意味しない。

### 実行中は Workflow IR の版を固定する

run は開始時に Workflow IR の版を固定し、**実行中は差し替えない** ([adr/0018](../../../adr/0018-ir-version-pinning.md))。固定しないと、途中で要素定義を編集したときにステップ列が入れ替わり、既に記録した StepResult がどの版に対するものか決まらなくなる。

版は Schema のバージョンとは別物で、**正規化した IR の内容から決まる値**とする。編集していなければ同じ値になり、1 文字でも変われば別の値になる。run が使った IR は、後から評価結果を再構成できるよう変更されない形で保存する。

差し替えるのは `resume` と `rerun_step` の直前だけである。差し替えたときは `ir-version-changed` を発行し、前提の再検証と巻き戻しを通常どおり行う。UI はこれを利用者へ明示する (web-editor feature)。

### 実行状態と再生制御

run の状態遷移を示す。

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> running : run 開始
    running --> running : ステップ完了 → 次ステップ
    running --> paused : pause 要求<br/>(実行中ステップの完了後に停止)
    paused --> paused : 要素選択 (座標 query) /<br/>実ページ操作 (許可)
    paused --> pin : resume / ステップ指定の再実行
    state "IR の版を差し替える<br/>(draft が変わっていれば ir-version-changed)" as pin
    pin --> verify
    state verify <<choice>>
    verify --> running : 前提をすべて満たす<br/>→ 次ステップから続行
    verify --> rollback : 前提不一致
    state "巻き戻し" as rollback
    rollback --> running : 崩れた最初のステップから再実行<br/>(変化のない区間は冪等スキップ)
    running --> completed : 全ステップ完了
    running --> failed : 検証失敗
    running --> aborted : 中断要求
    completed --> [*]
    failed --> [*]
    aborted --> [*]
```

- **一時停止はステップ境界でのみ効く**。pause 要求は「実行中ステップの完了後に停止する」予約として扱う。
- **一時停止中の実ページ操作は許可する**。要素選択のための座標問い合わせ (Element Inspector への query) は操作に含めず、常に可能。
- **再開時は前提を再検証する**: それまでに通過したステップの Expectation を再評価し、
  - すべて満たしていれば次のステップから続行する。
  - 満たさないステップがあれば、**満たさなくなった最初のステップまで巻き戻して再実行する** (冪等スキップがあるため、変わっていない区間は skipped で高速に通過する)。
- **ステップ単位の再実行**: 利用者は一時停止中に任意の通過済みステップを指定して再実行できる。指定ステップ以降の StepResult は無効化し、そこから再生し直す。
- **IR の版の差し替えは再検証の前に行う**。差し替えた後の Expectation で前提を評価しないと、古い版の期待状態で巻き戻し先を決めることになる。

### Browser Port の契約 (core/execution が定義)

| 区分       | 契約                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| セッション | `createSession / closeSession / keepalive`。セッションはページ状態・要素参照を保持する第一級の抽象。一時停止中もセッションを生存させる (keepalive は adapter の責務として契約に含める) |
| 認証       | `createSession` は**認証コンテキストを必須の引数で受ける** ([adr/0022](../../../adr/0022-auth-state-storage.md))。Storage State の復号と注入は adapter/browser の責務                  |
| コマンド   | 型付きの action 実行。CLI / SDK の呼び出し形式・JSON パースは adapter 内に閉じ、Port は型付き結果のみ返す                                                                              |
| 取得       | Snapshot (Accessibility ツリー)、スクリーンショット (バイナリ参照)、現在 URL 等の状態取得                                                                                              |
| 配信       | ライブ映像ストリームのハンドル取得 (描画は web-editor、転送は adapter/browser の責務)                                                                                                  |

認証コンテキストは省略可能にしない。省略できると「認証なし」が既定になり、意図しないプロファイルでの実行と Baseline の汚染を招く。認証しない場合も匿名であることを明示する。

**復号した Storage State を core / app へ渡さない。** Port が受け取るのはプロファイルの名前だけで、実体の復号と注入は adapter に閉じる。

構造化エラーの語彙に `auth/expired` を持つ。認証状態が失効したときに、呼び出し側が「取り込み直しを促す」判断を機械的にできるようにするためである。

#### `auth/expired` を断定できる条件

サーバ側の失効や SSO の期限切れは、**ログイン画面への遷移**として現れる。通常の画面改修や Locator の解決失敗と見分けがつかないため、**失敗したというだけで `auth/expired` を返さない** ([adr/0022](../../../adr/0022-auth-state-storage.md))。

認証プロファイルごとに「認証済みであることの検証条件」を宣言し、run の開始時に評価する。条件は Expectation と同じ語彙で書く (新しい語彙を増やさない)。

| 状況                               | 返すもの                                  |
| ---------------------------------- | ----------------------------------------- |
| 検証条件を満たさない               | `auth/expired`                            |
| 検証条件を宣言していない           | **断定しない。** 通常の実行失敗として返す |
| 検証条件を満たすが後続の操作が失敗 | 通常の実行失敗として返す                  |

誤って `auth/expired` を返すと、利用者は画面改修のたびに認証を取り込み直すことになる。**断定できないときは断定しない**方を選ぶ。

### コンポーネント構成 (C4 L3)

```mermaid
flowchart TD
    subgraph core/execution
        sm["RunStateMachine<br/>(再生制御・巻き戻し)"]
        interp["StepInterpreter<br/>(ステップ実行ルール)"]
        eval["ExpectationEvaluator<br/>(純粋関数)"]
        port["Browser Port<br/>(interface 定義)"]
    end
    appuc["app: Run use case"] --> sm
    sm --> interp
    interp --> eval
    interp --> port
    adapter["adapter/browser"] -. 実装 .-> port
    sm -- ExecutionEvent --> appuc
```

### フロー / シーケンス (1 ステップの処理)

```mermaid
flowchart TD
    A["ステップ開始"] --> B["Snapshot 取得<br/>(Browser Port)"]
    B --> C["Expectation を評価<br/>(純粋関数)"]
    C -->|すべて満たす| D["skipped として記録<br/>(action は実行しない)"]
    C -->|満たさない| E["action を実行<br/>(Browser Port)"]
    E --> F["Snapshot 再取得 → Expectation を再評価"]
    F -->|満たす| G["executed として記録"]
    F -->|満たさない| H["failed として記録<br/>run を failed へ"]
    D --> I["次ステップへ"]
    G --> I
```

### 実行イベント

発行順序が決定的な append-only のイベント列。web (再生表示の同期)、agent interface (エージェントへの通知)、実行履歴 (永続化) が同じ列を購読する。

`run-started / step-started / expectation-evaluated / step-skipped / step-executed / step-failed / paused / ir-version-changed / resumed / rolled-back / run-completed / run-failed / run-aborted`

イベントには step id、Expectation の評価結果、Snapshot / スクリーンショット参照を含め、UI 側が注釈表示に必要な情報をイベントだけで組み立てられるようにする。

`ir-version-changed` は `resume` と `rerun_step` で IR の版を差し替えたときに発行し、差し替え前後の版を含める ([adr/0018](../../../adr/0018-ir-version-pinning.md))。**イベント列だけを読んで、どのステップがどの版に対する結果かを判別できるようにする**ためである。

**秘密情報をイベントへ入れない。** 入力値のうち secret 指定されたものは、イベント・StepResult・ログのいずれでも伏せる ([workflow-dsl feature](../workflow-dsl/DesignDoc_workflow-dsl.md))。実行履歴は永続化されるため、一度入ると後から取り除けない。

## 主要シナリオ / フロー

- 利用者 (または AI エージェント) が run を開始し、全ステップが自動再生され、各ステップの注釈がライブ表示される。
- 2 回目の実行で画面状態が既に期待状態を満たしており、全ステップが skipped で完了し「変更なし」と記録される。
- 利用者が一時停止し、要素を選択して要素定義を編集し、再開する。ページ状態が変わっていなければそのまま続行される。
- 利用者が一時停止中にドロップダウンを開くなどの探索操作を行い、再開時に前提が崩れたステップから自動で巻き戻し再実行される。
- ステップの Expectation が実行後も満たされず、run が failed になり、失敗ステップと評価結果がイベントで提示される。

## テスト観点

- 横断規約は [context/testing.md](../../../context/testing.md)。core/execution は純粋ロジックとして unit test の主対象。
- ExpectationEvaluator: 同一 Snapshot 入力に対する評価の決定性。満たす / 満たさない / 評価不能 (Locator 未解決) の分岐。
- 冪等スキップ判定: 満たしているときに action が呼ばれないこと (fake Browser Port で検証)。
- 状態遷移: pause 予約がステップ境界まで遅延すること、resume 時の巻き戻し先の決定 (不一致が複数ある場合は最初のステップ)。
- ステップ再実行: 指定ステップ以降の StepResult 無効化とイベントの整合。
- イベント: 発行順序の決定性と、履歴から run を再構成できること。
- IR 版の固定: 実行中に draft を編集しても走行中の run のステップ列が変わらないこと。`resume` で差し替わったとき `ir-version-changed` が発行され、その後の再検証が新しい版で行われること。
- 認証: `createSession` に認証コンテキストが必ず渡ること。失効時に `auth/expired` の構造化エラーが返ること。
- Expectation を持たないステップが `skipped` にならず必ず実行されること。
- secret 指定した入力値が、StepResult・イベント・ログのいずれにも現れないこと。
