---
type: feature-design
title: Web UI (web-editor)
description: web モジュールの画面構成、live viewport と再生 UI の実行イベント同期、選択モードと操作モードの切替、要素選択・採番・差分承認のフロー、Stream の Proxy 接続
status: 進行中
keywords:
  [
    Web UI,
    live viewport,
    再生制御,
    選択モード,
    要素選択,
    差分承認,
    TanStack Start,
    web,
  ]
governs:
  - <実装ディレクトリ確定後に記入 (packages/ の interface/web)>
verified_commit: unverified
---

# Feature 設計: Web UI (web)

Feature 単位の設計 doc。仕様 (What) をどう実現するか (How) を、データ構造・画面・フロー単位で記述する。責務・範囲・方針の層に留め、実装レベルの手順は spec へ委譲する。全体像は [design/DesignDoc.md](../../DesignDoc.md)、横断規約は [context/](../../../context/) を参照する。

**現在の設計だけを書く。** 判断の経緯は ADR を参照する ([adr/0008](../../../adr/0008-stream-proxy.md)、framework 選定は [adr/0001](../../../adr/0001-tech-stack.md)、dashboard 非 fork は [adr/0015](../../../adr/0015-web-ui-own-implementation.md))。

## 概要

web は、人間の利用者が本システムを操作するための interface 層である。本書は次の 4 つを定義する。

1. **画面構成** — エディタを中心とした画面の分割と、各画面が担う操作。
2. **再生 UI と同期** — 実行イベント (ExecutionEvent) をどう購読し、viewport 上のアノテーションとタイムラインへ反映するか。
3. **選択モードと操作モード** — 一時停止中のクリックを「要素選択の座標 query」と「実ページ操作」に振り分ける仕組み。
4. **Stream の接続構成** — ライブ映像と入力転送の経路 (Workflow Server 経由の Proxy)。

web はドメインロジックを持たず、すべての操作は api 経由で app 層の use case を呼ぶ (agent interface と同じ use case。DesignDoc の設計方針)。framework は TanStack Start、live viewport の実装は agent-browser dashboard のパターンを参考にする (DesignDoc の Background)。

## 背景・要件解釈

- 本設計が満たすべき成功条件 (DesignDoc の What から):
  - Web UI 上で画面要素を選択し、名称、種別、構成番号、Locator を編集できる。
  - DSL の実行をステップ単位で自動再生し、対象要素と検証結果をライブ映像上にアノテーション表示できる。
  - 再生を任意のステップで一時停止し、要素定義を編集した後、そのステップから再開または再実行できる。
  - Baseline と構成番号の確定 (承認) は Web UI 上の人間だけが行える。

## スコープ

### やること

- 画面構成 (一覧 / エディタ / 承認キュー / 差分ビュー) と各画面の責務
- live viewport の表示・入力転送と、選択モード / 操作モードの切替
- 再生 UI (タイムライン・アノテーション) と実行イベントの同期方法
- 要素選択 → 候補提示 → draft 反映 → 再採番のフロー
- 承認 (DSL 変更 / NumberingPlan / Baseline) と差し戻しの UI フロー
- client 状態の持ち方 (正本を持たない、の具体化)

### やらないこと

- use case・ドメインロジック → app / core (web は呼ぶだけ)
- HTTP / WebSocket エンドポイントの定義 → api (本書は接続構成のみ示す)
- 要素候補の解決規則 → element-mapping feature
- 差分の分類規則 → change-detection feature
- 認可・ログイン → Open Question「agent interface の認可方式」と合わせて実装フェーズで扱う (MVP はローカル単一利用者)
- 視覚デザイン (配色・コンポーネントの見た目) → 実装時に確定する

## 設計

### 画面構成

| 画面                   | 責務                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Screens (一覧)         | Screen 文書の一覧・draft / 正本の別・最終実行結果の表示。エディタへの入口                                 |
| Editor (エディタ)      | 中心画面。live viewport + タイムライン + インスペクタの 3 領域 (後述)                                     |
| Approvals (承認キュー) | 承認待ち draft (DSL 変更 / NumberingPlan / Baseline) の一覧と、承認・差し戻し                             |
| Diff (差分ビュー)      | DiffReport の表示: 要素差分テーブル、画像比較 (Baseline / 今回 / ヒートマップ)、番号対応表、mask 適用領域 |

Editor の 3 領域:

- **viewport (中央)**: ライブ映像。要素の bounding box と番号バッジを **UI 上のオーバーレイ**として重ね描きする (成果物の注釈画像とは別物。オーバーレイは表示専用で保存しない)。
- **タイムライン (下)**: 実行ステップ列と各ステップの結果 (skipped / executed / failed)。再生・一時停止・再開・ステップ指定の再実行の操作点。
- **インスペクタ (右)**: 選択中の要素の定義編集 (名称・種別・Locator・note)、状態の切替と badges の並び確認、要素候補列の提示。

URL は `screen / state / run` を表し、リロードしても同じ文脈に戻れる (client 状態の節)。

### 再生 UI と実行イベントの同期

- web は run の ExecutionEvent 列を api 経由で購読し、イベントだけからタイムラインとアノテーションを更新する (イベントに必要情報を含める契約は execution feature)。
- 巻き戻し (`rolled-back`) を受けたらタイムラインの該当区間を無効表示に戻す。切断時はカーソル付き取得で追いつく (agent interface の `run.events` と同じ仕組み)。
- アノテーションは「現在ステップの対象要素」「検証した Expectation の結果」を bounding box + バッジで示す。

### 選択モードと操作モード

一時停止中のクリックには 2 つの意味がありうるため、**明示のモード切替**で振り分ける (暗黙の判定はしない)。

| モード            | クリックの意味                 | 実装                                                                                            |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| 選択モード (既定) | 要素選択。実ページへ転送しない | 座標を `element.candidates` の query に使う (execution の「座標 query は操作に含まない」に対応) |
| 操作モード        | 実ページ操作。転送する         | 入力を Stream 経路で agent-browser へ転送 (再開時の前提再検証は execution の責務)               |

- 再生中 (running) は viewport への入力を受け付けない (閲覧のみ)。モード切替は一時停止中だけ有効。
- 操作モード中は「再開時に前提の再検証が走る」ことを UI 上に明示する (黙って巻き戻さない)。

### 要素選択 → draft → 再採番のフロー

```mermaid
flowchart TD
    A["一時停止 + 選択モードで<br/>viewport をクリック"] --> B["element.candidates で<br/>候補列を取得"]
    B --> C["インスペクタに候補を表示<br/>(最小ノード + 祖先方向の候補)"]
    C --> D["利用者が選択・編集<br/>(名称 / 種別 / Locator)"]
    D --> E["screen.save_draft で<br/>要素定義を draft 保存"]
    E --> F["element.renumber で<br/>badges の並び直し案を draft へ"]
    F --> G["approval.request または<br/>そのまま編集を継続"]
```

### 承認と差し戻し

- Approvals には承認待ちが由来 (人間の編集 / エージェントの依頼) を問わず並ぶ。対象は DSL 変更・NumberingPlan・Baseline 更新の 3 種。
- 承認の前に対象の差分を必ず表示する (DSL 変更はテキスト差分、NumberingPlan は番号対応表、Baseline は DiffReport)。
- 差し戻しには構造化コメントを付け、エージェント由来の依頼には agent interface 経由で返す (承認フローの契約は agent-interface feature)。

### Stream の接続構成 (Proxy)

```mermaid
flowchart LR
    web["web (viewport)"] -- "映像 / 入力転送<br/>(単一エンドポイント)" --> api["api (Stream Proxy)"]
    api -- 中継 --> ab["agent-browser<br/>(WebSocket stream)"]
    web -- "ExecutionEvent 購読 / use case 呼び出し" --> api
```

- web の接続先は Workflow Server (api) の単一エンドポイントのみ ([adr/0008](../../../adr/0008-stream-proxy.md))。agent-browser のポートには接続しない。
- 映像はフレーム列の中継、入力転送は操作モード時のみ逆方向に流す。

### client 状態の持ち方

- 正本 (DSL・Baseline・実行履歴) は client に持たない。表示に使うデータはすべて api から再取得できる ([context/architecture.md](../../../context/architecture.md) の State Boundary)。
- client が持つのは表示状態のみ: 選択中の要素・モード・タイムラインのスクロール位置など。リロードで失われてよいものに限る。
- 編集中の未保存入力はフォーム内の一時状態とし、保存 = draft 反映 (`save_draft`) を明示操作にする。

## 主要シナリオ / フロー

- 利用者が一覧から Screen を開き、再生を開始してライブ映像とタイムラインで進行を追う。
- 一時停止して選択モードで要素をクリックし、候補から Locator を選んで名称を整え、draft 保存 → 再採番案を確認する。
- 操作モードに切り替えてドロップダウンを開き (探索)、再開時に前提再検証で巻き戻ることを UI の明示で理解した上で再開する。
- エージェントが依頼した承認 (DSL 変更) を Approvals で開き、テキスト差分を確認して差し戻しコメントを返す。
- 画面改修後の DiffReport を差分ビューで確認し、Baseline 更新を承認する。

## テスト観点

- 横断規約は [context/testing.md](../../../context/testing.md)。web の unit test は表示ロジックの純粋な部分に絞る。
- イベント → タイムライン / アノテーションの reducer: 同じイベント列から同じ表示状態になること (決定性)、`rolled-back` の巻き戻し表示。
- オーバーレイの座標変換: viewport の表示倍率・clip・スクロールに対する bounding box の写像。
- モード切替: 選択モードでクリックが転送されないこと、再生中に入力が無効なこと。
- 承認フロー: 差分表示なしに承認ボタンが押せないこと、差し戻しコメントの伝搬。
- 切断・再接続: イベントの取りこぼしなしに表示が追いつくこと。
