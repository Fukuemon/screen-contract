# ADR-0008: ライブ映像は Workflow Server 経由の Proxy で配信する

## 状態

承認

## 決定日

2026-08-08

## 背景

- agent-browser はライブ映像 (JPEG フレーム) と入力転送を WebSocket で提供するが、Web UI がどの経路で接続するかが Open Question「Browser Stream の公開方式」として残っていた。
- MVP はローカル実行前提だが、将来のリモート利用 (DesignDoc の Open Question「認証状態の保存方式」や agent 認可と同じ文脈) を見据えた経路設計が必要。

## 決定

- **Web UI は Workflow Server の単一エンドポイントにのみ接続し、server が agent-browser のストリームを中継 (Proxy) する**。映像フレームの配信と、操作モード時の入力転送 (逆方向) を同じ経路で行う。
- agent-browser のポートは外部に公開せず、Workflow Server のみが接続する。
- **逆方向の入力転送は素通ししない。** server 側で、対象 run が `paused` かつ操作モードであることを検証してから中継する。満たさない入力は破棄する。

### 入力転送を server で検証する理由

「再生中は入力を受け付けない」という規則は、Web UI が守るだけでは**規則ではなく画面の都合**にすぎない。認証を通したクライアントは Proxy へ直接フレームを送れるため、client 側の制御は迂回できる。迂回されると、実行中の run の途中でページ状態が変わり、**Expectation の評価が実際の操作と噛み合わなくなる**。冪等実行と巻き戻しの前提が崩れる。

| 中継の条件                    | 満たさない場合 |
| ----------------------------- | -------------- |
| 対象 run が `paused`          | 破棄する       |
| 操作モードである              | 破棄する       |
| 対象 run が要求元のものである | 破棄する       |

**破棄したことをイベントとして残す。** 黙って捨てると、UI 側の不具合と迂回の試みを区別できない。

イベントの名前は `input-discarded` とし、**破棄の理由 (`paused` でない / 操作モードでない / 要求元の run でない) を含める**。

**このイベントを実行イベント列 (ExecutionEvent) へ混ぜない。** 実行イベントは core/execution が定義し run 単位で発行順序が決定的である一方、入力の破棄は Stream Proxy で起き、破棄条件の 1 つ「対象 run が要求元のものでない」では**結びつけるべき run が定まらない**。加えて api から core/execution の語彙のイベントを起こす形は、interface → core の直接依存を禁じる [context/architecture.md](../context/architecture.md) と擦れる。`input-discarded` は Stream Proxy 側の語彙とする。

## 代替案

- **agent-browser へ直接接続**: ホップが 1 つ減り低遅延だが、無認証ポートの公開と接続先の分散 (UI が実行基盤のポートを知る) が残り、リモート化した時点で構成変更が必要になるため却下。ローカル利用での遅延差は 1 中継分であり、体験を左右する規模ではないと判断した。
- **ハイブリッド (ローカルは直接・リモートは Proxy)**: 経路が 2 系統になり検証コストが倍になる割に、ローカルでの利得が小さいため却下。

## 影響

### 良い影響

- 接続先が 1 つに揃い、認可・CORS・ポート公開の問題を server に集約できる。実行イベントと同じ経路になり UI 実装が単純になる。
- 実行基盤を差し替えても (Browser Port の別実装)、UI の接続先は変わらない。

### 悪い影響 / トレードオフ

- 中継 1 ホップ分の遅延とサーバ負荷が乗る (フレーム転送はバイト列の中継であり、実害は小さい見込み)。

### 影響範囲

- 対象モジュール / package: web / execution / infra

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md) に接続構成を反映 — 本 commit で実施
  - [design/DesignDoc.md](../design/DesignDoc.md) の Open Question「Browser Stream の公開方式」を削除 — 本 commit で実施
  - [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md) に、入力転送を server 側で検証する契約を追加する — 実施済み
  - **追記 (2026-08-23)**: `input-discarded` を Stream Proxy 側のイベントとして [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md) の「Stream の接続構成」へ定義する — 本 commit で実施 (`specs/4-walking-skeleton/` の D25 / D27)

## 関連ドキュメント / チケット

- [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md)
- [context/infrastructure.md](../context/infrastructure.md): MVP はローカル実行前提
- spec / PR: `specs/4-walking-skeleton/` の D27 (破棄のイベント語彙)
