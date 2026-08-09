# ADR-0017: エージェントの操作範囲を draft までとし確定に人間の承認を要する

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- 本システムは AI ネイティブに設計し、エージェントが workflow 定義・実行・要素定義を人間の操作なしに作成・編集できることが成功条件 (DesignDoc の What)。
- 一方、画面仕様書は参照される正本であり、その信頼性 (Baseline と構成番号の正しさ) を AI 出力の正しさに依存させられない。

## 決定

- **エージェントと AI 出力の操作範囲は draft までとし、Baseline と構成番号の確定は人間の承認後にのみ行う**。
- interface 上もこの境界を強制する: 正本 (Baseline・確定済み DSL) を変更する tool は存在せず、エージェントができるのは承認依頼 (`approval.request`) までとする。
- 承認は非ブロッキングとし、承認待ちの間もエージェントは他の draft 作業を継続できる。差し戻しは構造化コメントで返し、修正 → 再依頼のループを回せるようにする。

## 代替案

- **エージェントにも確定を許す**: 仕様書の信頼性が AI 出力の正しさに直接依存し、誤った Baseline・採番の混入を確定後にしか発見できないため却下。差分検知の比較基準 (Baseline) が無承認で動くと、検知結果自体が信頼できなくなる。
- **すべての操作に人間の承認を要求する**: draft 編集まで承認制にすると、エージェントによる自律的な作成・編集・自己修正のループが成立せず、AI ネイティブの成功条件を満たせないため却下。

## 影響

### 良い影響

- 正本の信頼性が人間の承認に紐づき、エージェントの試行錯誤 (draft 空間) と切り離される。
- 「tool の組み合わせでは正本を変更できない」という性質を interface のテストで機械的に検証できる。

### 悪い影響 / トレードオフ

- 人間の承認がスループットの上限になる (承認キューの滞留)。非ブロッキング承認と差分表示つきの承認 UI で緩和する。

### 影響範囲

- 対象モジュール / package: agent / web (承認 UI)

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否: [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新、[design/features/agent-interface/DesignDoc_agent-interface.md](../design/features/agent-interface/DesignDoc_agent-interface.md) の ADR 参照を更新 — 本 commit で実施

## 関連ドキュメント / チケット

- [design/features/agent-interface/DesignDoc_agent-interface.md](../design/features/agent-interface/DesignDoc_agent-interface.md): 公開原則と承認依頼のフロー
- [design/features/web-editor/DesignDoc_web-editor.md](../design/features/web-editor/DesignDoc_web-editor.md): 承認と差し戻しの UI
- spec / PR: なし
