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

モジュールは interface / app / core / adapter の 4 区分に分ける (責務は [design/DesignDoc.md](../design/DesignDoc.md) のモジュール責務が正本)。

依存方向:

- interface (web / api / agent) → app のみに依存する。core / adapter へ直接依存しない。
- app → core と adapter に依存する。
- core → 他の core へは型の参照のみ許可する。app / adapter / interface へ依存しない。
- adapter → core が定義する Port の型を通じてのみ core に依存する。

禁止経路:

- interface から core / adapter への直接依存 (use case を経由せず境界が崩れるため)
- core から adapter への依存 (Port の逆流。差し替え可能性が失われるため)
- core 同士のロジック共有 (共有したくなったら型として切り出すか、app 層の use case に置く)

Port の定義場所:

- Browser Port: core/execution
- AI Port: core/element
- Store Port: app (保存が機能横断のため。例外はこの 1 つに限る)

循環依存・未宣言依存は [engineering.md](engineering.md) の quality gate で検査する (検査コマンドは技術スタック確定後に定義)。

## Runtime Boundary

- Web UI と Workflow Server は別プロセスとする。Web UI はブラウザ操作・成果物生成を直接実行しない。
- agent-browser は Workflow Server の子プロセスとして adapter/browser が起動・管理する。
- AI エージェント (Claude Code / Codex 等) は interface/agent (MCP server / App Server 型 JSON-RPC) からのみ接続する。
- ライブ映像は agent-browser の WebSocket ストリーミングを Workflow Server 経由で配信する。公開方式は DesignDoc の Open Question (Browser Stream の公開方式) を参照。
- 秘密情報 (認証情報・トークン) を client / DSL / 成果物へ露出させない ([infrastructure.md](infrastructure.md))。

## State Boundary

- 正本は DSL と Baseline であり、adapter/store が保存する。画像・Markdown テーブルは生成物で、直接編集しない。
- draft と確定を分離する: エージェント・利用者の編集は draft に置き、人間の承認によってのみ Baseline・構成番号を確定する (用語は [project.yml](project.yml) の glossary)。
- 実行中の一時状態 (agent-browser の要素参照、実行途中のステップ状態) は永続化しない。永続化するのは実行履歴 (入力、ステップ結果、Snapshot、スクリーンショット、差分結果) のみ。
- client state (Web UI の表示状態) は正本を持たない。リロードで再取得できる情報のみ保持する。
