---
type: context
title: コードベースの構造
description: モジュールの境界、依存してよい向き、状態の置き場、新しいコードの置き場。コードから読み取れる構造は書かない
status: stable
governs:
  - apps/
  - packages/
  - e2e/
  - .dependency-cruiser.cjs
verified_commit: 44fda9132f6702cb66ed18224f22d878c85be4aa
---

# コードベースの構造

## Module Boundaries

モジュールは interface、app、core、adapter の 4 つの層に分け、どの層にも入らない合成ルートを 1 つ置く。  
層ごとの責務は [Design Doc の Components](../design/DesignDoc.md#components) にある。

`apps/` と `packages/` は、デプロイされるかどうかで分ける。  
再利用できるかどうかでは分けない。

- `apps/`: デプロイの単位を置く。合成ルートの `apps/server`、Web UI の `apps/web`、MCP ブリッジの `apps/mcp-bridge` が入る。
  - `apps/` のパッケージは、`packages/` からも他の app からも依存されない。
  - `apps/` の `package.json` は `exports` を持たない。パッケージ名で解決できないため、依存のグラフの終端になる。
- `packages/`: デプロイの単位にならないものを置く。core、app、adapter、api、agent、共有する型が入る。
  - `api` と `agent` は listen せずに Hono のアプリケーションとハンドラを組み立てるだけなので、`packages/` に置く。プロセスにするのは `apps/server` である。
  - ADR-0024: [HTTP framework](../adr/0024-http-framework.md)
- `e2e/`: Playwright のテストを置く。`apps/server` を import せず、ビルドした bin をプロセスとして起動する。
  - ビルドの順は、turborepo の `@screen-contract/server#build` への依存で決める。

合成ルートの `apps/server` は次の 4 つだけを担い、ドメインのロジックと use case を持たない。  
ADR-0023: [合成ルート](../adr/0023-composition-root.md)

- adapter の具象を選ぶ。実装か fake かもここで選ぶ。
- `app` の factory へ Port の実装を注入する。
- `api` と `agent` を 1 つのプロセスに載せる。
- 起動と終了を管理する。agent-browser のセッションの回収も含む。

プロセスの境界は次のとおり。

- Web UI と Workflow Server は別のプロセスにする。Web UI はブラウザの操作と成果物の生成を直接実行しない。
- Workflow Server の api 層を唯一の backend にする。TanStack Start の server function のような web の server の機能に、API のロジックを置かない。BFF や別の言語の backend を足さない。
  - ADR-0001: [技術スタック](../adr/0001-tech-stack.md)
- agent-browser は、adapter/browser が Workflow Server の子プロセスとして起動し、管理する。
- AI エージェントは、interface の agent（MCP server と App Server 型 JSON-RPC）からだけ接続する。
- ライブ映像は、agent-browser の WebSocket のストリームを Workflow Server が中継して配信する。
  - ADR-0008: [Stream Proxy](../adr/0008-stream-proxy.md)
- 秘密情報を client、DSL、成果物へ出さない。置き場は [operations.md](operations.md#secrets) にある。

## Dependency Rules

依存してよい向きは次のとおり。  
「型だけ」は `import type` による参照だけを許すことを指す。

- interface（web、api、agent）は app だけに依存する。core、adapter、domain へ直接依存しない。
  - `apps/web` は `packages/api` に型だけで依存する。
- app は core に依存する。adapter と interface へは依存しない。Port の実装は合成ルートから注入される。
- core は、他の core と domain に型だけで依存する。app、adapter、interface へ依存しない。
- domain は何にも依存しない。実行時の値を持たない。
- adapter は、自身が実装する Port を定義するモジュール（core か app）と domain に、型だけで依存する。interface と他の adapter へは依存しない。
- 合成ルートの `apps/server` は全部の層に依存してよい。adapter の具象を選ぶのは `apps/server` だけにする。
- `apps/mcp-bridge` は何にも依存しない。JSON-RPC のフレームを転送するだけで、tool の語彙を解釈しない。
  - ADR-0021: [agent interface の認可](../adr/0021-agent-interface-authz.md)

禁止する依存は次のとおり。

- interface から core、adapter、domain への直接の依存
- core から adapter への依存
- core の間でのロジックの共有
- domain に値を置くこと
- app から adapter への依存
  - ADR-0023: [合成ルート](../adr/0023-composition-root.md)
- app から interface への依存
- adapter から interface と、他の adapter への依存
- `packages/` から `apps/` への依存
- `apps/` の間の依存
- 循環する依存と、`package.json` に宣言していない依存

Port を定義するモジュールと実装するモジュールは次のとおり。  
Store Port だけは、保存が機能をまたぐため app に置く。  
app に Port を置く例外は Store Port の 1 つに限る。

| Port         | 定義するモジュール | 実装するモジュール | 実装が参照するもの  |
| ------------ | ------------------ | ------------------ | ------------------- |
| Browser Port | core/execution     | adapter/browser    | core/execution の型 |
| AI Port      | core/element       | MVP では実装しない | core/element の型   |
| DSL Fix Port | core/workflow      | MVP では実装しない | core/workflow の型  |
| Store Port   | app                | adapter/store      | app の型            |

ADR-0019: [AI 候補生成をエージェント主導にする](../adr/0019-agent-led-ai-suggestions.md)

依存の規則は、dependency-cruiser の設定 `.dependency-cruiser.cjs` を基準にする。  
ルールは、禁止する依存の一覧と 1 対 1 で対応させる。

- 型だけの依存と値の依存は、`dependencyTypesNot: ["type-only"]` で区別する。
- oxlint の `no-restricted-imports` にも層ごとの禁止を書き、エディタで早く気付けるようにする。oxlint にだけあるルールは作らない。
- `not-to-dev-dep` は workspace のパッケージへの依存には発火しない。`apps/web` から `packages/api` への依存を型だけに限るのは `web-to-api-type-only` である。
- `apps-not-to-apps` は、相対パスで隣の app へ入ったときに発火する。パッケージ名での import は、`not-unresolvable` が先に失敗させる。
- 宣言していない依存は、pnpm が解決させないため、`not-unresolvable` で検出される。

## State Ownership

- ほかのデータを作る元は DSL と Baseline で、adapter/store が保存する。
- 注釈画像と Markdown のテーブルは生成物で、直接編集しない。
- エージェントと利用者の編集は draft に置き、確定済みのデータへは人間の承認を経て反映する。規則は [draft と確定](domain/draft-and-confirmation.md) にある。
- 実行中の一時的な状態は永続化しない。agent-browser の要素参照と、実行の途中のステップの状態が当たる。
- 永続化するのは実行の履歴だけにする。入力、ステップの結果、Snapshot、スクリーンショット、差分の結果が当たる。
- Web UI の表示の状態は、DSL と Baseline を自分では持たない。再読み込みで取得し直せる情報だけを持つ。

## Placement Rules

- デプロイの単位になるコードは `apps/` に、それ以外は `packages/` に置く。
- core の間で共有したいロジックは、domain へ型として切り出すか、app 層の use case に置く。
- app と adapter をつないで確かめるテストは、合成ルートの `apps/server` に置く。置き場の詳細は [testing.md](testing.md) にある。
- パッケージの間の import は、パッケージ名 `@screen-contract/<module>` で書く。
  - 相対パスで他のパッケージへ入らない。
  - tsconfig の `paths` で alias を作らない。tsconfig、vite、vitest、依存のチェックの 4 か所で定義が食い違うのを防ぐ。
- 共有の設定へ移す条件は [conventions.md](conventions.md#shared-configuration) にある。
