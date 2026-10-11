# ADR-0024: HTTP / WebSocket framework に Hono を採用する

## Status

承認

## Context

`packages/api` の HTTP と WebSocket の framework を決める必要がある。  
ADR-0001 は Hono を第一の候補とし、確定を feature の設計の時点に置いた。  
feature の設計では、framework を分ける判断の材料が出なかった。  
ADR-0001: [技術スタックを TypeScript monorepo（TanStack Start、中間層なし）にする](0001-tech-stack.md)

決めないまま実装へ入ると、`packages/api` の公開面（ハンドラの型、ミドルウェアの形）が決まらず、interface 層の設計を 2 度書くことになる。

求めることは次の 3 つ。

- 同じプロセスで HTTP と WebSocket を扱う。Web UI、agent interface、Stream Proxy は、すべて 1 つの常駐サーバーへつなぐ。
  - ADR-0021: [agent interface の認可をループバック限定とローカルトークンで行う](0021-agent-interface-authz.md)
- listen しない形で組み立てられる。プロセスにするのは合成ルートで、`packages/api` はアプリケーションを返すだけである。
  - ADR-0023: [合成ルートを apps/server に置き app から adapter への依存を禁じる](0023-composition-root.md)
- TypeScript 7 で型が通る。言語サービスのために TypeScript 6 を併置する構成で動く。
  - 出典: [context/tech-stack.md の Toolchain](../context/tech-stack.md#toolchain)

## Decision

- `packages/api` の HTTP と WebSocket の framework を Hono にする。
- `packages/api` は Hono のアプリケーションを組み立てて返すだけにし、listen しない。プロセスにするのは `apps/server` で、`@hono/node-server` を使う。
  - `packages/api` と `apps/server` の分け方は [context/codebase.md](../context/codebase.md#module-boundaries) にある。
- WebSocket は `@hono/node-server` の組み込みの機能を使う。別のパッケージの `@hono/node-ws` は非推奨で、Node アダプタの v2 が `upgradeWebSocket` を内蔵する。
  - 出典: [Hono の Node.js アダプタ](https://hono.dev/docs/getting-started/nodejs)
  - 出典: [WebSocket Helper](https://hono.dev/docs/helpers/websocket)
  - 出典: [honojs/node-server](https://github.com/honojs/node-server)
- 認可（ローカルトークンの検証、Origin と Host のチェック）は Hono のミドルウェアとして実装し、interface 層に閉じる。
  - ADR-0021: [agent interface の認可をループバック限定とローカルトークンで行う](0021-agent-interface-authz.md)

## Considered Options

| 選択肢                                | 強み                                                                                                                                                                                                                               | 弱み                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **採用:** Hono                        | HTTP と WebSocket が 1 つのアプリケーションに載り、認可のミドルウェアを両方へ同じ形で掛けられる。Web 標準の `Request` と `Response` を扱い、ハンドラを listen せずにテストから直接呼べる。ランタイムに依存しない形で組み立てられる | WebSocket は `ws` パッケージに依存し、Node アダプタに固有の設定が `apps/server` に入る。アダプタのバージョンに追随する保守が要る                                                                                         |
| Fastify                               | Node に特化し、プラグインと WebSocket の実績が厚い                                                                                                                                                                                 | Web 標準の `Request` と `Response` を扱わないため、テストでハンドラを直接呼ぶときに Node の `req` と `res` を模す必要がある。`packages/api` を listen しない組み立てに閉じる設計と合わない                               |
| Elysia                                | 型推論が強く、記述の量も少ない                                                                                                                                                                                                     | Bun を主な対象とし、Node は副次的である。TypeScript 7 と Node の LTS で固めたランタイムの前提と合わない                                                                                                                  |
| 素の `node:http` と自前のルーティング | 依存が増えない                                                                                                                                                                                                                     | ルーティング、ミドルウェア、WebSocket のアップグレードの処理を自作し、認可を確実に全部の接続へ掛ける仕組みも自前になる。認可を掛け忘れると直接セキュリティの欠陥になるため、既製のミドルウェアの機構に載せる利点が大きい |
| 確定を実装の issue まで先送りする     | —                                                                                                                                                                                                                                  | 判断を遅らせても材料は増えない。先送りしている間、`packages/api` の公開面が決まらず、interface 層の設計が進まない                                                                                                        |

## Consequences

### Positive

- HTTP と WebSocket が 1 つのアプリケーションに載るため、認可のミドルウェアを両方へ同じ形で掛けられる。接続ごとに認可の実装が分かれない。
- Web 標準の `Request` と `Response` を扱うため、`packages/api` のハンドラを listen せずにテストから直接呼べる。統合テストが api を直接呼ぶ方針と合う。
  - 出典: [context/testing.md の Test Types and Guarantees](../context/testing.md#test-types-and-guarantees)
- ランタイムに依存しない形で組み立てられるため、将来 Node のほかへ載せ替える場合も `packages/api` を書き換えずに済む。

### Negative

- WebSocket は `ws` パッケージに依存する。Web 標準だけでは完結せず、Node アダプタに固有の設定が `apps/server` に入る。
- Hono の Node アダプタは、v2 で WebSocket の扱いが変わった。アダプタのバージョンに追随する保守が要る。
