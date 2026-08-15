# ADR-0013: MVP のブラウザ実行基盤に agent-browser を使用する

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- 本システムの実行には、ブラウザ操作・Accessibility Snapshot・スクリーンショット・ライブ映像配信 (入力転送を含む) の 4 つが必要。
- agent-browser はこの 4 つを揃えて提供し、AI エージェントからの操作を前提に設計されている。一方、コマンド列だけでは操作の目的・期待状態・構成番号の意味を表現できない (DesignDoc の Background)。

## 決定

- **MVP のブラウザ実行基盤に agent-browser を使用する**。対応ブラウザは agent-browser が対応する Chromium 系とする。
- agent-browser は core/execution が定義する Browser Port の背後の内部実装とし、本システムが同梱して adapter/browser が管理する。利用者は agent-browser を直接導入・操作しない。
  - 同梱の手段は npm 依存とする ([adr/0027](0027-agent-browser-bundling.md))。**ブラウザ本体の取得だけは利用者の 1 回の明示操作を残す。** 「直接導入・操作しない」は、日常の操作に agent-browser が現れないという意味に限定する。
- 利用者の資産 (DSL・仕様書・POM) は実行基盤に依存しない語彙で書き、Browser Port の別実装で実行基盤を差し替えても引き継がれるようにする。

## 代替案

- **Playwright を直接使う**: 操作・撮影は揃うが、ライブ映像の WebSocket 配信と入力転送、Snapshot ベースの要素参照を自作する必要があり、MVP の実装量が大きく増えるため却下。Browser Port の別実装として将来の差し替え候補には残る。
- **remote-agent-browser (Vercel Sandbox wrapper) を組み込む**: Vercel OIDC / vercel link に密結合でロックインするため採用しない (2026-08-04 判断)。セッションを第一級の抽象にする wrapper パターンのみ Browser Port の契約設計の参考にした。
- **CDP (Chrome DevTools Protocol) を直接叩く**: 抽象度が低く、要素参照・Snapshot の語彙をすべて自作することになるため却下。

## 影響

### 良い影響

- 操作・Snapshot・撮影・ライブ配信を 1 つの基盤で賄え、MVP の実装が adapter 1 つに集約される。
- 固有処理が adapter/browser に閉じ、agent-browser の仕様変更への追従が局所化される。

### 悪い影響 / トレードオフ

- MVP の対応ブラウザが Chromium 系に限られる。agent-browser の機能上限 (提供しない操作) が Browser Port の実現可能範囲を制約する。

### 影響範囲

- 対象モジュール / package: execution / web / infra (adapter/browser)

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否: [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新 — 本 commit で実施

## 関連ドキュメント / チケット

- [design/features/execution/DesignDoc_execution.md](../design/features/execution/DesignDoc_execution.md): Browser Port の契約
- [adr/0008](0008-stream-proxy.md): ライブ映像の配信経路
- spec / PR: なし
