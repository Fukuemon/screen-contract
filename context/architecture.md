---
type: context
title: Codebase Architecture
description: interface / app / core / adapter の 4 層構造と依存方向、Port 境界、draft-確定の状態境界の規約
keywords: [architecture, 依存方向, Port, core, adapter, draft, 冪等実行]
governs:
  - <実装ディレクトリ確定後に記入>
verified_commit: unverified
---

# Codebase Architecture

コードベースの **package / runtime / state boundary と依存方向**。全体像 (system landscape, モジュール責務) は [design/DesignDoc.md](../design/DesignDoc.md) を正本とし、本書は境界規約を扱う。プロジェクト固有の構成は [context/project.yml](project.yml) を参照する。

実装言語・パッケージ構成は技術スタック ADR (未作成) の確定後に追記する。本書の規約は実装技術に依存しない。

## Package Boundary

モジュールは interface / app / core / adapter の 4 区分に分ける (責務は [design/DesignDoc.md](../design/DesignDoc.md) のモジュール責務が正本)。加えて、4 区分のどれでもない **合成ルート**を置く。

### apps と packages の分け方

配置の基準は「再利用できるか」ではなく **デプロイされるか**とする。Turborepo は Application Package を「will be deployed from your workspace」、Library Package を「aren't independently deployable」と定義し、Application Package が他から依存されないことを求めている。

| 置き場      | 入るもの                                                   | 制約                               |
| ----------- | ---------------------------------------------------------- | ---------------------------------- |
| `apps/`     | デプロイ単位 (合成ルート、Web UI、bin を持つプロセス)      | **他のパッケージから依存されない** |
| `packages/` | それ以外のすべて (core / app / adapter / api / agent / 型) | デプロイ単位にならない             |
| `e2e/`      | Playwright                                                 | `apps/` に依存してよい唯一の例外   |

`api` と `agent` を `packages/` に置くのは、listen せず Hono インスタンスとハンドラを組み立てるだけで、プロセスにするのが `apps/server` だからである。

### 依存方向

- interface (web / api / agent) → app のみに依存する。core / adapter へ直接依存しない。
- app → core に依存する。**adapter へは依存しない**。Port の実装は合成ルートから注入される ([adr/0023](../adr/0023-composition-root.md))。
- core → 他の core と domain へは型の参照のみ許可する。app / adapter / interface へ依存しない。
- adapter → 自身が実装する Port を定義するモジュール (core または app) の型を通じてのみ依存する。
- 合成ルート (`apps/server`) → 全層に依存してよい。**adapter の具象を選ぶ唯一の場所**とする。

### 禁止経路

- interface から core / adapter への直接依存 (use case を経由せず境界が崩れるため)
- core から adapter への依存 (Port の逆流。差し替え可能性が失われるため)
- core 同士のロジック共有 (共有したくなったら domain へ型として切り出すか、app 層の use case に置く)
- **app から adapter への依存** (Store Port が app にあるため循環し、fake の差し替えが実行時分岐になるため。[adr/0023](../adr/0023-composition-root.md))
- **`packages/` から `apps/` への依存** (`apps/` は依存グラフの終端であるため)

### Port の定義場所と参照元

| Port         | 定義するモジュール | 実装するモジュール | 実装側が参照するもの |
| ------------ | ------------------ | ------------------ | -------------------- |
| Browser Port | core/execution     | adapter/browser    | core/execution の型  |
| AI Port      | core/element       | (MVP 実装なし)     | core/element の型    |
| DSL Fix Port | core/workflow      | (MVP 実装なし)     | core/workflow の型   |
| Store Port   | app                | adapter/store      | app の型             |

Store Port を app に置くのは保存が機能横断のためであり、**例外はこの 1 つに限る**。adapter/ai を MVP で実装しない判断は [adr/0019](../adr/0019-agent-led-ai-suggestions.md)。

### 合成ルートの責務

`apps/server` は次だけを担い、ドメインロジックと use case を持たない。

- adapter の具象を選ぶ (実装か fake か)
- `app` の factory へ Port の実装を注入する
- `api` と `agent` を 1 つのプロセスへ載せる
- 起動と終了を管理する (agent-browser のセッション回収を含む)

Nx が「an application project contains the deployable shell: entry point, configuration, and composition of features」「the majority of your code in `libs/`, with `apps/` reduced to wiring」と定める形に一致する。

循環依存・未宣言依存・上記の禁止経路は [engineering.md](engineering.md) の quality gate で検査する (検査コマンドは scaffold 作成時に定義)。

参考: [Turborepo Package types](https://turborepo.dev/docs/core-concepts/package-types) / [Turborepo best practices](https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/best-practices/RULE.md) / [Nx Folder Structure](https://nx.dev/docs/kb/folder-structure)

## Runtime Boundary

- Web UI と Workflow Server は別プロセスとする。Web UI はブラウザ操作・成果物生成を直接実行しない。
- Workflow Server (api 層) を唯一の backend とする。web 側の server 機能 (TanStack Start の server function 等) に API ロジックを置かない。中間層 (BFF / 別言語 backend) を追加しない判断は [adr/0001-tech-stack.md](../adr/0001-tech-stack.md)。
- agent-browser は Workflow Server の子プロセスとして adapter/browser が起動・管理する。
- AI エージェント (Claude Code / Codex 等) は interface/agent (MCP server / App Server 型 JSON-RPC) からのみ接続する。
- ライブ映像は agent-browser の WebSocket ストリーミングを Workflow Server 経由で配信する。公開方式は DesignDoc の Open Question (Browser Stream の公開方式) を参照。
- 秘密情報 (認証情報・トークン) を client / DSL / 成果物へ露出させない ([infrastructure.md](infrastructure.md))。

## State Boundary

- 正本は DSL と Baseline であり、adapter/store が保存する。画像・Markdown テーブルは生成物で、直接編集しない。
- draft と確定を分離する: エージェント・利用者の編集は draft に置き、人間の承認によってのみ Baseline・構成番号を確定する (用語は [project.yml](project.yml) の glossary)。
- 実行中の一時状態 (agent-browser の要素参照、実行途中のステップ状態) は永続化しない。永続化するのは実行履歴 (入力、ステップ結果、Snapshot、スクリーンショット、差分結果) のみ。
- client state (Web UI の表示状態) は正本を持たない。リロードで再取得できる情報のみ保持する。
