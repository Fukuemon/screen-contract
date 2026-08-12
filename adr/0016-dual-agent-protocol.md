# ADR-0016: agent interface に MCP と App Server 型 JSON-RPC の両方を採用する

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- AI エージェント (Claude Code / Codex 等) が人間と同じ use case を操作できることが成功条件 (DesignDoc の What)。
- MCP は汎用エージェントの標準接続手段だが、現行仕様 (stateless 化) ではサーバからの任意 push が廃止され、実行イベントの低遅延配信にはポーリング (Tasks 拡張 + カーソル付きイベント取得) しか使えない。
- 常駐・低遅延が要る統合 (エディタ拡張等) には、双方向ストリームでサーバ push できる経路が別に必要。
- 人間起点の提案依頼も pull 型キューで受ける ([adr/0020](0020-suggestion-pull-queue.md))。この経路では、エージェントが依頼を取りに来るまでの遅延がそのまま利用者の待ち時間になる。遅延特性はプロトコルによって異なる。

## 決定

- **MCP server と App Server 型 JSON-RPC の両方を提供する**。
- 両プロトコルは同じ tool 語彙・同じ JSON Schema を共有し、agent モジュール内の共通マッピング層が app use case へ 1:1 で変換する。プロトコル固有の処理 (通知・タスク形式) だけを各サーバ実装に置く。
- 分担: 汎用エージェントからの操作は MCP、常駐・低遅延が要る統合は JSON-RPC。
- **提案依頼の取得 (`suggestion.list`) は App Server 型 JSON-RPC でロングポーリングさせる**。MCP ではポーリング間隔がそのまま遅延になる。プロトコル対応の詳細は [design/features/agent-interface/DesignDoc_agent-interface.md](../design/features/agent-interface/DesignDoc_agent-interface.md) を正本とする。

## 代替案

- **MCP のみ**: 汎用エージェントの導入は容易だが、現行仕様の push 制約により常駐統合のライブなイベント受信ができない。提案依頼の取得もポーリング間隔ぶんの遅延が残る。却下。
- **App Server 型 JSON-RPC のみ**: 低遅延は満たすが、エージェントごとに専用クライアント実装が必要になり、設定 1 行で接続できる MCP の導入容易性を失うため却下。
- **REST API の直接利用**: エージェントへの tool 公開の標準形がなく、エージェントごとに tool 定義を作り込むことになるため却下。

## 影響

### 良い影響

- 汎用エージェント (設定 1 行) と常駐統合 (低遅延 push) の両方の導入経路が塞がらない。
- 語彙と Schema の共有により、プロトコル間で機能差が生まれない。差は配信と取得の遅延特性だけに限定される。
- 両プロトコルを併用する根拠が、実行イベントの配信に加えて提案依頼の取得にも及ぶ。片方だけでは両方の経路で遅延が残る。

### 悪い影響 / トレードオフ

- 2 つのサーバ実装の保守が必要になる。共通マッピング層への集約で差分は tool 定義の複製ではなく配信方式に限定する。

### 影響範囲

- 対象モジュール / package: agent

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新、[design/features/agent-interface/DesignDoc_agent-interface.md](../design/features/agent-interface/DesignDoc_agent-interface.md) の ADR 参照を更新 — 実施済み
  - [design/features/agent-interface/DesignDoc_agent-interface.md](../design/features/agent-interface/DesignDoc_agent-interface.md) のプロトコル対応表に、提案依頼の取得における差 (ロングポーリングの可否) を追加する

## 関連ドキュメント / チケット

- [adr/0020](0020-suggestion-pull-queue.md): 提案依頼を pull 型キューで受ける決定
- [design/features/agent-interface/DesignDoc_agent-interface.md](../design/features/agent-interface/DesignDoc_agent-interface.md): プロトコル対応と MCP 現行仕様への適合
- spec / PR: なし
