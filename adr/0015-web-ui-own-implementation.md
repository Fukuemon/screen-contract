# ADR-0015: Web UI は dashboard の fork ではなく自前実装とする

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- agent-browser には組み込みの dashboard (Next.js 製) があり、WebSocket による JPEG フレーム配信と入力転送を行う live viewport、コマンド実行履歴の activity feed を提供する。
- 本システムの Web UI にも live viewport が必要であり、dashboard を fork して拡張する選択肢があった。

## 決定

- **Web UI は dashboard を fork せず、live viewport の配信・入力転送パターンを参考にした自前実装とする**。framework は TanStack Start ([adr/0001](0001-tech-stack.md))。

## 代替案

- **dashboard を fork して拡張する**: 要素選択・採番・差分承認・承認キューという本システム固有の機能が UI の大半を占め、fork による upstream 追従コストが参照の利益を上回るため却下。dashboard は Next.js 製であり、[adr/0001](0001-tech-stack.md) の framework 選定 (TanStack Start) とも一致しない。
- **dashboard を iframe 等で埋め込む**: viewport と自前 UI (選択モード・注釈オーバーレイ・タイムライン) の統合が embed 境界をまたげず、選択モードのクリック捕捉が実現できないため却下。

## 影響

### 良い影響

- UI の構造を固有機能 (選択・採番・承認) 中心に設計でき、framework・状態管理を自プロジェクトの規約に揃えられる。
- agent-browser の dashboard 変更に追従する義務がない。

### 悪い影響 / トレードオフ

- live viewport (フレーム描画・入力転送・座標変換) を自前で実装・検証するコストがかかる。

### 影響範囲

- 対象モジュール / package: web

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否: [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新 — 本 commit で実施

## 関連ドキュメント / チケット

- [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md)
- [adr/0001](0001-tech-stack.md): framework 選定 / [adr/0008](0008-stream-proxy.md): 配信経路
- spec / PR: なし
