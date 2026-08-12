# ADR-0009: adapter/ai の認証は API キーと OAuth の両対応とする

## 状態

[ADR-0019](0019-agent-led-ai-suggestions.md) に置換

本 ADR は「OAuth によるサブスクリプション連携」を成立する選択肢として扱っていた。しかし本 ADR が未確認事項として残していた「サブスクリプション credential のプログラム利用に関する利用規約の確認」の結果、サードパーティ製品が利用者のサブスクリプション枠を消費する構成は規約上成立しないと判明した。未確認事項の確認結果が決定そのものを覆したため、[ADR-0019](0019-agent-led-ai-suggestions.md) で置き換える。詳細と出典は同 ADR を参照。

## 決定日

2026-08-08

## 背景

- adapter/ai が外部 AI サービスへ問い合わせるための認証方式が Open Question「adapter/ai の認証方式」として残っていた。選択肢は API キーのみ、サブスクリプションの OAuth 連携のみ、両対応の 3 つ。
- 想定利用者には、個人開発者 (既に Claude Pro 等の AI サブスクリプションを保有) と、チーム利用 (API キーを組織で発行・管理) の両方がいる。主要な CLI エージェント (Claude Code / Codex 等) はサブスクリプションの OAuth 連携を標準の導入経路にしており、個人利用者の主要動線はサブスクリプション側にある。

## 決定

- **API キーと OAuth (サブスクリプション連携) の両方に対応する**。
- 認証方式の差は adapter/ai 内の credential 解決層に閉じ込め、AI Port / DSL Fix Port の契約と core には露出しない。
- credential の保存は [context/infrastructure.md](../context/infrastructure.md) の secret 規約に従い、DSL・ログ・Snapshot・生成成果物へ平文で残さない (DesignDoc の設計上の前提)。

## 代替案

- **API キーのみ**: 実装が最も単純だが、サブスクリプション保有者に API 従量課金の二重コストを強いる。個人利用の導入障壁が主要動線上にあるため却下。
- **OAuth のみ**: チーム利用・CI 実行で共有 credential (API キー) を使う運用ができない。将来の CI 差分検知 (Future Work) と両立しないため却下。

## 影響

### 良い影響

- 個人 (サブスクリプション) とチーム (API キー) のどちらの導入経路も塞がない。
- 認証差を adapter 内に閉じたため、core・app は認証方式を知らない。

### 悪い影響 / トレードオフ

- 認証 2 系統の実装・検証コストがかかる。OAuth は provider ごとに仕様と利用規約が異なり、対応 provider ごとの確認が必要。

### 影響範囲

- 対象モジュール / package: element / workflow / infra (adapter/ai とその credential 管理)

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [design/features/ai-suggestions/DesignDoc_ai-suggestions.md](../design/features/ai-suggestions/DesignDoc_ai-suggestions.md) に認証の設計を反映 — 本 commit で実施
  - [design/DesignDoc.md](../design/DesignDoc.md) の Open Question「adapter/ai の認証方式」を削除 — 本 commit で実施
- 未確認事項: 対応 provider の OAuth 仕様と、サブスクリプション credential のプログラム利用に関する利用規約の確認 (adapter/ai 実装 spec で provider を確定するときに行う)

## 関連ドキュメント / チケット

- [design/features/ai-suggestions/DesignDoc_ai-suggestions.md](../design/features/ai-suggestions/DesignDoc_ai-suggestions.md)
- [context/infrastructure.md](../context/infrastructure.md): secret の置き場と扱い
- spec / PR: なし
