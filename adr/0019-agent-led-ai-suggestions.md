# ADR-0019: AI 候補生成をエージェント主導とし adapter/ai を MVP 実装対象外とする

## Status

承認

## Context

AI による候補生成で、推論をどこで行い、adapter/ai をどの認証で実装するかを決める必要がある。  
ADR-0009 は adapter/ai の認証を API キーと OAuth（サブスクリプション連携）の両対応と決めた。  
想定する利用者の主な動線はサブスクリプションの保有者であり、サブスクリプションの credential をプログラムから使えるかどうかが adapter/ai の設計の前提を左右する。  
ADR-0009: [adapter/ai の認証は API キーと OAuth の両対応とする](0009-ai-adapter-auth.md)

MVP はローカル実行と単一の利用者を前提とし、チームでの利用、クラウドでの利用、CI での実行は範囲の外にする。  
出典: [PRD の MVP](../PRD.md#mvp)

サブスクリプションの credential の扱いについて、次の 3 点が分かっている。

- Anthropic は、事前の承認がない限り、サードパーティの開発者が自社の製品に claude.ai のログインとレート制限を提供することを認めていない。Claude Agent SDK で構築したエージェントも対象に含まれ、API キー認証を使うよう指示されている。
  - 出典: [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- スクリプトと SDK からの呼び出しで推奨されるモード `--bare` は、OAuth の credential とシステムのキーチェーンを読まず、`ANTHROPIC_API_KEY` を要求する。将来は `-p` の既定になる予定である。
  - 出典: [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- MCP の sampling（サーバーがクライアントへ推論を依頼する機能）は、仕様版 2026-07-28 で deprecated になった。移行先は「LLM provider の API を直接統合する」と示され、新しい実装には採らないよう求めている。
  - 出典: [MCP Deprecated Features](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)

この 3 点から、本システムが利用者のサブスクリプションの枠を使って AI の補完を提供する構成は、規約の上でも MCP の仕様の上でも成り立たない。

## Decision

AI 候補生成の主な動線を、エージェント自身の推論にする。  
エージェントは agent interface から Snapshot の断片と機械的に抽出した要素候補の列を取得し、名称、種別、Locator を自身のコンテキストで判断して、draft として書き戻す。  
本システムは LLM の credential を持たない。  
推論と credential の位置は [AI 候補生成](../design/features/ai-suggestions/DesignDoc.md) にある。

adapter/ai は MVP の実装の対象から外す。  
core/element の AI Port と core/workflow の DSL Fix Port は定義だけを残し、実装は Lower-Priority Goals へ移す。

adapter/ai を実装するときの認証は API キーだけにする。  
利用者のサブスクリプションを本システムが使う構成は採らない。

AI なしでも要素マッピングが完結することを、MVP の必須の要件にする。  
要素候補は Accessibility Snapshot と DOM からの機械的な抽出だけで作れ、AI はその上に載る補完に位置づける。  
PRD の利用者の物語も「システムか AI が候補を示す」と定めている。  
出典: [PRD の User Stories](../PRD.md#user-stories)

## Verification

OpenAI（Codex）の側も、Anthropic の側と同じく、第三者の製品にサブスクリプションの credential を使わせる形は取れない。

- OpenAI の利用規約は、サービスを「自動的またはプログラム的に」利用し、抽出することを禁じている。
- Codex にはプログラムから使う向けの料金表が別にあり、サブスクリプションとは課金の枠が分かれている。
- サブスクリプションの認証を前提とするモデルもあるが、第三者の製品が代理で使う形は規約の上でグレーである。

Codex の側で許されても、この決定は変わらない。  
Claude Code の利用者には提供できない機能になり、製品として成り立たないためである。

## Considered Options

| 選択肢                                                                                    | 強み                                                                                                                                                                         | 弱み                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **採用:** 推論をエージェント自身が行い、adapter/ai を MVP で実装しない                    | 本システムが LLM の credential を持たない。データが利用者の手元を出ない。AI サービスの障害、規約の変更、レート制限がコアの機能を止めない。サーバーをリモートにしても成り立つ | Web UI だけを操作する利用者は、機械的に抽出した候補を自分で名付ける。ai-suggestions の設計（provider の抽象、credential の解決層、両対応の認証）が MVP で使われない                                                                                                                                              |
| OAuth でサブスクリプションを直接使う（ADR-0009 の決定）                                   | 技術的には成り立つ。Claude Agent SDK の Streaming Input Mode は常駐セッションと `--json-schema` による構造化した出力を提供し、AI Port の契約にそのまま合う                   | Context に挙げた規約が禁じる形に当たる                                                                                                                                                                                                                                                                           |
| CLI をサーバーから動かす（Codex App Server への接続か、`claude -p` の subprocess の起動） | —                                                                                                                                                                            | サーバーが利用者の CLI を起動し、自製品の機能のためにサブスクリプションの枠を使う形で、同じ規約の対象と解釈される。Claude Code と Codex で機構が違い（常駐の JSON-RPC と一度きりの起動）、provider の抽象が再び要り、実装の量が想定を超える。サーバーと CLI が同じマシンにいる必要があり、クラウドへ移す道を塞ぐ |
| MCP sampling でクライアントへ推論を任せる                                                 | サーバーが credential を持たずに済み、目的に最も合う                                                                                                                         | 仕様の上で deprecated で、新しい実装には推奨されず、将来の削除の対象である                                                                                                                                                                                                                                       |
| API キーだけで adapter/ai を MVP に実装する                                               | 規約の上の問題がない                                                                                                                                                         | サブスクリプションの保有者に、API の従量課金の二重の負担を強いる。チームでの利用と CI での実行が MVP の外なので、API キーの運用を前提とする利用者が MVP の時点でいない                                                                                                                                           |

## Consequences

### Positive

- 本システムが LLM の credential を持たないため、credential の保存、失効、漏えいに関する設計と運用が MVP から消える。
- ADR-0010 が扱う送信の境界の相手が、外部の AI サービスから利用者のマシンで動くエージェントに変わり、データが利用者の手元を出ない。
  - ADR-0010: [AI サービスへの送信の境界](0010-ai-data-boundary.md)
- エージェントが動いていない環境でも要素マッピングが完結するため、AI サービスの障害、規約の変更、レート制限がコアの機能を止めない。
- adapter/ai の実装（provider の抽象、credential の解決層、エラーの分類）が MVP から外れ、core と interface の実装に集中できる。
- エージェントが利用者の側で動くため、サーバーを将来リモートにしても成り立つ。CLI をサーバーから動かす案は、この性質を持たない。

### Negative

- Web UI だけを操作している利用者は、機械的に抽出した候補を自分で名付ける。緩和は ADR-0020 で扱う。
  - ADR-0020: [人間起点の提案依頼を pull 型キューで実現する](0020-suggestion-pull-queue.md)
- ai-suggestions の設計（provider の抽象、credential の解決層、API キーと OAuth の両対応）が MVP では使われない。
