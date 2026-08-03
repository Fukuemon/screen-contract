# {{title}}

> spec 本体テンプレート。
> 機能固有の追加節 (API endpoint / ER 図 / 認可マトリクス / data-testid 等) は `templates/specs/appendices/<topic>.md` から該当 appendix を取り込む。
> 必須節・必須サブ節は `hooks/spec/validate_document.sh` が検査し、レビュー観点は subagent 定義 `.rulesync/subagents/spec-reviewer.md` が評価する。
>
> **記入規律 (テンプレ残骸を残さない)**:
>
> - テンプレの指示文 (この blockquote や括弧書きの説明) と、空のままの表行 (`| | |`) は記入時に削除する
> - 必須節で該当が無い場合は節を残して「なし」と理由を書く。必須以外の節・appendix は使わないなら節ごと削除する
> - 残骸は `spec-review` の観点「template 必須節」で NEEDS_WORK になる
>
> **後日追記の語彙 (3 種に固定)**: 子箇条書きに `**追記 (YYYY-MM-DD)**:` = 情報の補足 / `**改訂 (YYYY-MM-DD)**:` = 決定内容の変更 / `**逸脱 (YYYY-MM-DD)**:` = 実装が設計と異なった記録、として足す。日付は記録日を ISO 形式で書き、これ以外の語 (拡張 / 進捗注記 等) を作らない。

## メタ情報

- Issue: `#{{issue-id}}`
- ステータス: `Draft / In Progress / Review / Done`
- 作成日: YYYY-MM-DD
- 更新日: YYYY-MM-DD
- Branch: `feature/{{issue-id}}`
- Owner:

## 設計フェーズ状況

状態は `未着手 / 進行中 / 完了 / レビュー済 / 保留` のいずれか。保留の場合は理由を備考に残す。

| #   | フェーズ                    | 状態   | 最終更新 | 備考 |
| --- | --------------------------- | ------ | -------- | ---- |
| 1   | 起票                        | 未着手 |          |      |
| 2   | 下書き                      | 未着手 |          |      |
| 3   | 上位文書突合                | 未着手 |          |      |
| 4   | 論点整理                    | 未着手 |          |      |
| 5   | 論点解決                    | 未着手 |          |      |
| 6   | Interface / Routing 設計    | 未着手 |          |      |
| 7   | Content / Data 設計         | 未着手 |          |      |
| 8   | Performance / Security 設計 | 未着手 |          |      |
| 9   | Test / Metrics 設計         | 未着手 |          |      |
| 10  | 実装分割                    | 未着手 |          |      |
| 11  | レビュー済                  | 未着手 |          |      |

## 上位文書整合

正本 ([PRD](../../PRD.md) / [Design Doc](../../design/DesignDoc.md) / [feature doc](../../design/features/) / [context](../../context/) / ADR) のどの節と、どう整合させたかを記録する。

- PRD 更新要否: 要 / 不要
- Design Doc 更新要否: 要 / 不要
- ADR 起票要否: 要 / 不要

| 上位文書      | 節 / 該当箇所 | 整合方針 (継承 / 補足 / 変更提案) |
| ------------- | ------------- | --------------------------------- |
| PRD           |               | 継承                              |
| Design Doc    |               | 継承                              |
| feature doc   |               |                                   |
| context       |               |                                   |
| ADR (なら ID) |               |                                   |

> 矛盾を検出した場合は `spec-lifecycle` の sync phase で PRD / Design Doc / feature doc / context / ADR への back-propagation を提案する。

## 関連資料

- `PRD.md`:
- `design/DesignDoc.md`:
- 関連 issue / ticket:

## 背景

- なぜこの spec が必要か
- Phase 1 のどの完成条件に関わるか
- コーポレートサイト / 業務アプリ / 共通 package のどれに影響するか

## スコープ

### やること

-

### やらないこと

-

## 要件の解釈

### 実現したいユーザー価値

-

### 成功条件

-

### 対象ユーザー / 操作主体

-

EARS 風で振る舞いを記述する (`<who>` `<trigger>` 時、システムは `<expected behavior>` する)。

- WHEN ... システムは ... する
- IF ... システムは ... する
- WHERE ... システムは ... する
- THE SYSTEM SHALL ...

## 設計時の論点

設計 / 実装フェーズへ持ち越す残課題を 1 件ずつ管理する。確定したものは「解決済みの論点」へ移す。

| #   | 論点 | 決定候補 | 決定 |
| --- | ---- | -------- | ---- |
| D1  |      |          | 未決 |

## 解決済みの論点

(`spec-lifecycle` の clarify phase で確定したものを「設計時の論点」から移す。
1 論点 1 項目。結論行は `**D<n>: <結論>**` を 1 文で立て、根拠・トレードオフは子箇条書きへ分解する。
決定・理由・背景・前提を 1 つの段落に詰め込まない。1 項目の目安は 300 字以内、超えるなら子箇条書きが不足している)

- **D1: <結論を 1 文で書く>**
  - 根拠:
  - トレードオフ / 却下した代替案:

## 未確定事項

(決定できない項目を理由とともに残す。1 件でも残っていれば下流 phase は止める)

-

## 実装対象

正規 target は `context/project.yml` の対象ドメイン一覧を正本とする。

| モジュール   | 実装有無 | 主な責務 |
| ------------ | :------: | -------- |
| `<target-a>` |  ◯ / -   |          |
| `<target-b>` |  ◯ / -   |          |

## 機能仕様

### User Flow

1.
2.
3.

### Reuse Policy

- 第一原則は feature / colocation とする
- 共通化は複数 feature / app をまたぐ再利用が明確になってから行う
- app や feature 内で閉じる UI / utility / asset はローカルに置く

### Performance

- performance / runtime budget の方針 ([context/architecture.md](../../context/architecture.md))

### Routing / URL State

- URL に寄せる state / routing の責務境界

### Content / Assets

- コンテンツ更新フロー / 静的 asset 配置 / 配信前提 ([context/infrastructure.md](../../context/infrastructure.md))

### UI Reuse

- 共有 UI 経由か、feature / colocation 内で閉じるか ([context/architecture.md](../../context/architecture.md))

### Testing

- unit / e2e のどこで何を担保するか ([context/testing.md](../../context/testing.md))

## Interface 設計

### UI / API / Event Interface

-

### Props / Request / Response

-

## Content / Data 設計

### 保存・管理するデータ

-

### コンテンツ配置 / package / route

-

## Performance / Security 設計

### Performance

-

### Security / Privacy

-

## Error / Fallback 設計

### エラーケース

| #   | ケース | ユーザーへの見せ方 | リカバリ |
| --- | ------ | ------------------ | -------- |
| 1   |        |                    |          |

### Fallback

-

## テスト / 評価方針

### テスト観点

-

### 計測指標

-

## フロー / シーケンス

(`spec-lifecycle` の diagram phase で生成。spec の主要操作を Mermaid 図に落とす)

### Flowchart (ユーザー操作起点)

```mermaid
flowchart TD
```

### Sequence

```mermaid
sequenceDiagram
```

## 実装分割

### 実装タスク案

| Phase | 対象 | 概要 | 依存 |
| ----- | ---- | ---- | ---- |
| P1    |      |      |      |

### prompts 生成方針

- `context/project.yml` の対象ドメインのどこで分けるか
- 並列実装できる境界

## 上位資料からの変更点

本 spec で PRD / Design Doc / feature doc / context / 既存 ADR から変更・追加した内容を、反映先別に記録する。`spec-lifecycle` の track / sync phase で更新する。

### PRD への影響

| 対象節 | 変更内容 | 理由 |
| ------ | -------- | ---- |
|        |          |      |

### Design Doc への影響

| 対象節 | 変更内容 | 理由 |
| ------ | -------- | ---- |
|        |          |      |

### feature doc への影響

| 対象 doc / 節 | 変更内容 | 理由 |
| ------------- | -------- | ---- |
|               |          |      |

### context への影響

| 対象 doc / 節 | 変更内容 | 理由 |
| ------------- | -------- | ---- |
|               |          |      |

### ADR の新規 / 更新

| ADR ID | 変更内容 | 理由 |
| ------ | -------- | ---- |
|        |          |      |

## レビュー

`spec-review` (fresh-context evaluator) の最新結果。完全な記録は `review.md` を参照。

| 日付 | 結果 (PASS / NEEDS_WORK) | 指摘要点 | 対応 |
| ---- | ------------------------ | -------- | ---- |
|      |                          |          |      |

## 変更履歴

| 日付 | 変更者 | 変更内容 |
| ---- | ------ | -------- |
|      |        |          |

## 備考

<!--
追加 appendix が必要な spec は、templates/specs/appendices/ から該当 topic を取り込むこと:

- API endpoint / request / response → appendices/api.md
- ER 図 / DDL / シードデータ → appendices/database.md
- ロール別 UI 制御 / API 認可マトリクス → appendices/authorization.md
- 画面コンポーネントツリー / 表示条件 → appendices/screen-spec.md
- data-testid 一覧 → appendices/testid.md
-->
