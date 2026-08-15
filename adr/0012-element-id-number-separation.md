# ADR-0012: 永続要素 ID と表示用構成番号を分離する

## 状態

承認

## 決定日

2026-08-09 (設計初期からの前提を ADR として明文化)

## 背景

- 画面仕様書では要素を構成番号 (1..N) で参照する慣習があるが、番号は要素の追加・削除・読み順変更のたびに振り直される。
- 番号を要素の識別子として使うと、再採番のたびに Locator・Expectation・差分追跡のすべての参照が壊れ、同じ要素へ異なる番号や名称が割り当てられる問題も検知できない (DesignDoc の Why)。

## 決定

- **要素の同一性は永続要素 ID (画面内で一意の slug、変更禁止) で表し、構成番号は表示専用とする**。
- DSL 内の参照 (`ref`: Locator の対象、Expectation、操作対象、badges) はすべて要素 ID で行い、構成番号を識別子として使用しない。
- 構成番号は状態単位の `badges` 順序リストの位置として表現し、要素定義自体は番号を持たない ([adr/0005](0005-renumbering.md))。

## 代替案

- **構成番号を識別子として使う**: 再採番で全参照が壊れ、版間・状態間の要素追跡 (差分検知の基盤) が成立しないため却下。
- **要素名称を識別子として使う**: 名称は仕様の改善で変わり、重複も許したい (同名ボタンが複数ある画面) ため却下。

## 影響

### 良い影響

- 再採番・読み順変更が参照を壊さない安全な操作になり、番号対応表 (旧 → 新) を要素 ID 基準で機械的に作れる。
- 版間・状態間の要素追跡が ID で安定し、要素差分 (Role 変更・文言変更等) の分類が可能になる。

### 悪い影響 / トレードオフ

- 利用者は仕様書に現れない内部 ID を DSL 編集時に扱う必要がある (Web UI の要素選択と候補提示で軽減する)。

### 影響範囲

- 対象モジュール / package: element / workflow / diff / artifact

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否: [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表を更新 — 本 commit で実施

## 関連ドキュメント / チケット

- [design/features/element-mapping/DesignDoc_element-mapping.md](../design/features/element-mapping/DesignDoc_element-mapping.md)
- [adr/0005](0005-renumbering.md): 状態単位の採番と badges リスト
- spec / PR: なし
