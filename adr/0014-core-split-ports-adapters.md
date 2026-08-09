# ADR-0014: core を機能単位に分割し Ports and Adapters を採用する

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- 本システムは、ブラウザ実行基盤・AI サービス・保存方式の 3 つを将来差し替えられる必要がある (DesignDoc の設計方針)。
- ワークフロー定義・実行・要素同一性・成果物生成・差分検知は互いに独立した関心事であり、並行して設計・実装・テストしたい。

## 決定

- **モジュールを interface / app / core / adapter の 4 区分に分け、core は機能単位 (workflow / execution / element / artifact / diff) に分割する**。
- 外部技術への依存は Port (interface) で切り、**Port はそれを使う core が定義する** (Ports and Adapters)。保存だけは機能横断のため Store Port を app 層で定義する。
- core 同士は型の参照以外で依存しない。interface 層と app 層はドメインロジックを持たない。

## 代替案

- **単一 core のレイヤードアーキテクチャ**: 層は分かれても機能境界が曖昧になり、機能単位の並行開発・テスト分離・差し替えが難しくなるため却下。
- **技術単位の分割 (MVC 等)**: ドメインロジックが技術レイヤに散り、「実行のルール」「採番の規則」といった機能の正本が定まらないため却下。
- **core から adapter への直接依存**: 実装は単純だが、agent-browser・AI サービス・保存方式の固有処理が core に漏れ、差し替え要件を満たせないため却下。

## 影響

### 良い影響

- ブラウザ実行基盤 (Browser Port)・AI (AI Port / DSL Fix Port)・保存 (Store Port) が実装差し替え可能になり、CLI / CI 実行も interface の追加だけで対応できる。
- core が純粋ロジックになり、fake 実装による unit test が機能単位で成立する。

### 悪い影響 / トレードオフ

- Port と adapter の間接層が増え、小さな機能でも定義するファイルが多くなる。

### 影響範囲

- 対象モジュール / package: workflow / execution / element / artifact / diff / web / agent / infra (全モジュール構成)

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否: [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新 — 本 commit で実施。実装規約は [context/architecture.md](../context/architecture.md) を正本とする

## 関連ドキュメント / チケット

- [design/DesignDoc.md](../design/DesignDoc.md): モジュール責務
- [context/architecture.md](../context/architecture.md)
- spec / PR: なし
