# ADR-0015: Web UI は dashboard の fork ではなく自前実装とする

## Status

承認

## Context

Web UI の live viewport を、どう作るかを決める必要がある。

agent-browser には、Next.js で作った組み込みの dashboard がある。  
dashboard は、WebSocket による JPEG のフレームの配信と入力の転送を行う live viewport と、コマンドの実行の履歴を示す activity feed を提供する。  
本システムの Web UI にも live viewport が要り、dashboard を fork して拡張する選択肢がある。

## Decision

Web UI は dashboard を fork せず、live viewport の配信と入力の転送のパターンを参考にして、自前で実装する。  
framework は TanStack Start にする。  
ADR-0001: [技術スタックを TypeScript monorepo（TanStack Start、中間層なし）にする](0001-tech-stack.md)

ライブ映像の配信の構成は ADR-0008 が決めている。  
ADR-0008: [ライブ映像は Workflow Server 経由の Proxy で配信する](0008-stream-proxy.md)

## Considered Options

| 選択肢                                                         | 強み                                                                                                                                                      | 弱み                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **採用:** 配信と入力の転送のパターンを参考にして自前で実装する | UI の構造を固有の機能（選択、採番、承認）を中心に設計でき、framework と状態の管理をプロジェクトの規約にそろえられる。dashboard の変更に追従する義務がない | live viewport（フレームの描画、入力の転送、座標の変換）を自前で実装して確かめるコストがかかる                                                                                                                               |
| dashboard を fork して拡張する                                 | —                                                                                                                                                         | 要素の選択、採番、差分の承認、承認キューという固有の機能が UI の大半を占め、fork による upstream への追従のコストが参照の利益を上回る。dashboard は Next.js で作られ、ADR-0001 の framework（TanStack Start）とも一致しない |
| dashboard を iframe などで埋め込む                             | —                                                                                                                                                         | viewport と自前の UI（選択モード、注釈の重ね描き、タイムライン）を、埋め込みの境界をまたいで統合できない。選択モードのクリックを捕まえられない                                                                              |

## Consequences

### Positive

- UI の構造を固有の機能（選択、採番、承認）を中心に設計でき、framework と状態の管理をプロジェクトの規約にそろえられる。
- agent-browser の dashboard の変更に追従する義務がない。

### Negative

- live viewport（フレームの描画、入力の転送、座標の変換）を自前で実装して確かめるコストがかかる。
