# context の目次

作業の中で参照する、このリポジトリの規約と事実。変更を取り込むまでの手順は [CONTRIBUTING.md](../CONTRIBUTING.md) にある。

- [コードベースの構造](codebase.md) — モジュールの境界、依存してよい向き、状態の置き場、新しいコードの置き場。コードから読み取れる構造は書かない
- [コードと文書の規約](conventions.md) — 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない（draft）
- [業務の知識](domain.md) — 用語の定義と、概念ごとの文書の一覧。状態と遷移、不変条件は概念ごとに domain/ に置く（draft）
- [draft と確定](domain/draft-and-confirmation.md) — エージェントと利用者の編集を draft に置き、人間の承認で確定済みのデータへ反映する規則。確定の 3 つの対象と、承認の前後で成り立つ条件
- [基盤と運用](operations.md) — 環境の種類、デプロイと切り戻しの条件、監視、秘密情報の置き場の方針（draft）
- [技術スタック](tech-stack.md) — 採用しているツールの役割とバージョンの所在、バージョンの更新の確認、新しいモジュールの作り始め。バージョンそのものと選んだ理由は書かない（draft）
- [テスト](testing.md) — テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト（draft）

## Design Doc

- [Screen Contract PRD](../PRD.md) — 画面への到達手順、画面要素、構成番号、生成物の関係を 1 つの DSL で管理し、画面仕様書の作成と変更の検知を再現できるようにする（draft）
- [Web UI](../apps/web/DesignDoc.md) — Web UI の画面構成、実行イベントと再生 UI の同期、選択モードと操作モード、要素選択と承認の流れ、映像の中継の構成（draft）
- [Screen Contract Design Doc](../design/DesignDoc.md) — Screen Contract の全体像。C4 の L2、層とモジュールの責務と依存、Port、機能ごとの設計の一覧、判断の優先順位（draft）
- [AI 候補生成](../design/features/ai-suggestions/DesignDoc.md) — 要素の候補と DSL の修正の候補をエージェントに作らせる仕組みとして、提案依頼キュー、送る情報の境界、応答の扱いを定める。（draft）
- [ローカル実行のセキュリティ](../design/features/local-security/DesignDoc.md) — Workflow Server の接続先とローカルトークン、接続ごとの認証、Origin と Host のチェック、認証状態と secret の暗号化の設計（draft）
- [AI エージェント操作](../packages/agent/DesignDoc.md) — agent モジュールの tool の語彙、MCP と App Server 型 JSON-RPC の対応、実行イベントの配信、draft と確定の境界の公開方法（draft）
- [仕様成果物の生成](../packages/core-artifact/DesignDoc.md) — core/artifact が DSL と撮影結果から注釈画像、Markdown のテーブル、Playwright の POM を決定的に生成する規則と、書き換えの抑止を定める。（draft）
- [変更差分の検知](../packages/core-diff/DesignDoc.md) — core/diff が持つ Baseline の構造、要素差分の分類の語彙、画像差分の 2 段階の判定と mask、番号対応表、差分レポートを定める。（draft）
- [画面要素マッピング](../packages/core-element/DesignDoc.md) — core/element が持つ永続要素 ID、Locator のモデルと解決結果の分類、状態ごとの読み順の再採番、要素候補の正規化、AI Port の契約を定める。（draft）
- [冪等実行と再生制御](../packages/core-execution/DesignDoc.md) — core/execution が持つステップ実行の規則、冪等スキップ、run の状態遷移と再生制御、Browser Port の契約、実行イベントを定める。（draft）
- [ワークフロー定義](../packages/core-workflow/DesignDoc.md) — Screen と Workflow の 2 文書からなる YAML DSL の構造、状態の木、Expectation の語彙、Workflow IR への正規化、Schema によるチェックとバージョンを定める。（draft）
