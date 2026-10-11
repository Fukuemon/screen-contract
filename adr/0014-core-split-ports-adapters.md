# ADR-0014: core を機能単位に分割し Ports and Adapters を採用する

## Status

承認

## Context

モジュールの分け方と、外部の技術への依存の切り方を決める必要がある。

本システムは、ブラウザの実行基盤、AI サービス、保存の方式の 3 つを、将来差し替えられる必要がある。  
ワークフローの定義、実行、要素の同一性、成果物の生成、差分の検知は、互いに独立した関心事である。  
これらを並行して設計、実装、テストしたい。

## Decision

- モジュールを interface、app、core、adapter の 4 区分に分け、core は機能単位（workflow、execution、element、artifact、diff）に分割する。
- 外部の技術への依存は Port（interface）で切り、Port はそれを使う core が定義する（Ports and Adapters）。
  - 保存だけは機能をまたぐため、Store Port を app 層で定義する。
- core 同士は、型の参照のほかに依存しない。interface 層と app 層は、ドメインのロジックを持たない。

層ごとの責務は [Design Doc の Components](../design/DesignDoc.md#components) にある。  
依存の向きの規則は [codebase.md の Dependency Rules](../context/codebase.md#dependency-rules) にある。

## Considered Options

| 選択肢                                                             | 強み                                                                                                                            | 弱み                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **採用:** core を機能単位に分け、Port をそれを使う core が定義する | ブラウザの実行基盤、AI、保存の実装を差し替えられる。core が純粋なロジックになり、fake の実装による unit test が機能単位でできる | Port と adapter の間接の層が増え、小さな機能でも定義するファイルが多くなる                                 |
| 単一の core のレイヤードアーキテクチャ                             | —                                                                                                                               | 層は分かれても機能の境界があいまいになり、機能単位の並行開発、テストの分離、差し替えが難しくなる           |
| 技術単位の分割（MVC など）                                         | —                                                                                                                               | ドメインのロジックが技術の層に散り、「実行のルール」「採番の規則」のような機能の規則を置く場所が定まらない |
| core から adapter へ直接依存する                                   | 実装が単純になる                                                                                                                | agent-browser、AI サービス、保存の方式の固有の処理が core に漏れ、差し替えの要件を満たせない               |

## Consequences

### Positive

- ブラウザの実行基盤（Browser Port）、AI（AI Port と DSL Fix Port）、保存（Store Port）の実装を差し替えられる。
  - CLI と CI での実行にも、interface を足すだけで対応できる。
- core が純粋なロジックになり、fake の実装による unit test が機能単位でできる。

### Negative

- Port と adapter の間接の層が増え、小さな機能でも定義するファイルが多くなる。
