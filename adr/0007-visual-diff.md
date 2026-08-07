# ADR-0007: 画像差分は生スクリーンショットを対象に、Pixel Diff → 知覚差分の 2 段階で判定する

## 状態

承認

## 決定日

2026-08-07

## 背景

- DesignDoc の Open Question「Visual Diff の実装方式」「既定閾値」が change-detection の設計前の決定事項だった。
- 本製品の比較対象は「viewport 固定 + fixture で決定的に再現した画面」同士であり、レンダリング環境の揺れは小さい前提がある。一方、日時表示のように fixture でも固定しきれない動的領域は実画面に存在する。
- 注釈済み画像 (バッジ焼き込み後) を比較すると、番号の変更が画面の実変化と混ざり分類できない。

## 決定

- **画像差分の対象は生スクリーンショット** (バッジ合成前。`clip` 適用後) とする。注釈済み画像は差分検知の対象にしない。構造の変化は要素差分 (Snapshot ベース) が受け持ち、画像差分と分離する。
- **判定は 2 段階**とする:
  1. **Pixel Diff** (アンチエイリアス許容つきのピクセル比較) で差分ピクセル比率を計算し、閾値以下なら「画像変更なし」。
  2. 閾値を超えた場合のみ**知覚差分** (構造類似度) を計算し、「画像変更 (意味のある変化)」と「軽微な揺れ (要確認)」に分類する。両指標をレポートに併記する。
- **閾値は差分ピクセル比率の既定値をシステム設定に持ち、状態単位で上書きできる**。
- **動的領域は DSL の state に `mask` (除外領域のセレクタ列) を宣言して除外する**。マスクは撮影時に解決した bounding box の矩形として適用し、適用領域をレポートに明示する (黙って無視しない)。

## 代替案

- **Pixel Diff のみ**: 最も単純だが、閾値をわずかに超えるレンダリング揺れ (フォントヒンティング等) がすべて「画像変更」として提示され、確認コストが利用者に乗る。段階適用なら知覚差分の計算は閾値超過時だけで、コスト増は限定的なため採らず。
- **知覚差分のみ**: 人間の見え方に近いが、小さくても意味のある変化 (アイコンの 1px の欠け等) を「類似」と判定しうる。検知の一次判定は機械的な Pixel Diff に置く。
- **注釈済み画像を比較する**: 生成物同士の比較で実装は楽だが、番号変更・バッジ移動が画像差分として混入し、差分の分類可能性 (本製品の中核価値) を壊すため却下。
- **mask なし (fixture で全て固定する)**: 理想だが、対象アプリの協力度に依存する。fixture 整備を推奨しつつ、mask を明示的な逃げ道として残す。

## 影響

### 良い影響

- 「番号を変えただけで画像差分が出る」ことがなくなり、差分レポートが画面の実変化だけを指す。
- 2 段階判定により、確認が必要な差分の数が実変化に絞られる。
- mask の適用領域がレポートに残るため、「除外しすぎて見逃す」リスクを可視化できる。

### 悪い影響 / トレードオフ

- 知覚差分の類似閾値というチューニング項目が増える (既定値をシステム設定に持ち、まず既定で運用する)。
- mask は除外である以上、領域内の真の変化は検知できない。乱用を防ぐため適用領域の明示を必須とする。

### 影響範囲

- 対象モジュール / package: workflow / diff / artifact / web

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [design/features/change-detection/DesignDoc_change-detection.md](../design/features/change-detection/DesignDoc_change-detection.md) に判定規則を反映 — 本 commit で実施
  - [design/features/workflow-dsl/DesignDoc_workflow-dsl.md](../design/features/workflow-dsl/DesignDoc_workflow-dsl.md) の state に `mask` を追加 — 本 commit で実施
  - [design/DesignDoc.md](../design/DesignDoc.md) の Open Question 2 件を解決済みとして削除 — 本 commit で実施

## 関連ドキュメント / チケット

- [adr/0005-renumbering.md](0005-renumbering.md): 番号対応表 (差分成果物)
- [design/features/change-detection/DesignDoc_change-detection.md](../design/features/change-detection/DesignDoc_change-detection.md)
- spec / PR: なし
