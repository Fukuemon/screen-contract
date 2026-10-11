# ADR-0013: MVP のブラウザ実行基盤に agent-browser を使う

## Status

承認

## Context

MVP のブラウザ実行基盤を決める必要がある。

本システムの実行には、ブラウザの操作、Accessibility Snapshot、スクリーンショット、ライブ映像の配信（入力の転送を含む）の 4 つが要る。  
agent-browser はこの 4 つをそろえて提供し、AI エージェントからの操作を前提に設計されている。  
一方で、コマンドの列だけでは、操作の目的、期待状態、構成番号の意味を表せない。  
出典: [PRD の Background](../PRD.md#background)

## Decision

- MVP のブラウザ実行基盤に agent-browser を使う。対応するブラウザは、agent-browser が対応する Chromium 系にする。
- agent-browser は、core/execution が定義する Browser Port の背後の内部の実装にし、本システムが同梱して adapter/browser が管理する。利用者は agent-browser を直接入れず、直接操作しない。
  - 同梱の手段は npm の依存にする。
  - ブラウザ本体の取得だけは、利用者の 1 回の明示的な操作を残す。
  - 「直接入れず、直接操作しない」は、日常の操作に agent-browser が現れないという意味に限る。
  - ADR-0027: [agent-browser の同梱](0027-agent-browser-bundling.md)
- 利用者の資産（DSL、仕様書、POM）は、実行基盤に依存しない語彙で書く。Browser Port の別の実装で実行基盤を差し替えても、資産を引き継げるようにする。

Browser Port の契約は [冪等実行と再生制御の Design Doc](../packages/core-execution/DesignDoc.md#browser-port-の契約) にある。  
ライブ映像の配信の構成は ADR-0008 が決めている。  
ADR-0008: [ライブ映像は Workflow Server 経由の Proxy で配信する](0008-stream-proxy.md)

## Considered Options

| 選択肢                                                      | 強み                                                                                                                              | 弱み                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **採用:** agent-browser を Browser Port の背後に置いて使う  | 操作、Snapshot、撮影、ライブ配信を 1 つの基盤でまかなえ、MVP の実装が adapter 1 つに集まる。固有の処理が adapter/browser に閉じる | MVP の対応ブラウザが Chromium 系に限られる。agent-browser が提供しない操作は、Browser Port でも実現できない              |
| Playwright を直接使う                                       | 操作と撮影がそろう。Browser Port の別の実装として、将来の差し替えの候補に残る                                                     | ライブ映像の WebSocket の配信と入力の転送、Snapshot に基づく要素の参照を自作する必要があり、MVP の実装の量が大きく増える |
| remote-agent-browser（Vercel Sandbox の wrapper）を組み込む | セッションを第一級の抽象にする wrapper のパターンは、Browser Port の契約の設計の参考になる                                        | Vercel OIDC と vercel link に密結合し、ロックインする                                                                    |
| CDP（Chrome DevTools Protocol）を直接使う                   | —                                                                                                                                 | 抽象度が低く、要素の参照と Snapshot の語彙をすべて自作することになる                                                     |

## Consequences

### Positive

- 操作、Snapshot、撮影、ライブ配信を 1 つの基盤でまかなえ、MVP の実装が adapter 1 つに集まる。
- 固有の処理が adapter/browser に閉じ、agent-browser の仕様の変更への追従が 1 か所で済む。

### Negative

- MVP の対応ブラウザが Chromium 系に限られる。
- agent-browser の機能の上限（提供しない操作）が、Browser Port で実現できる範囲を制約する。
