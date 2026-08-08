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

## 関連ドキュメント / チケット

- [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md)
- [context/infrastructure.md](../context/infrastructure.md): MVP はローカル実行前提
- spec / PR: なし
