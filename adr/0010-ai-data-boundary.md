# ADR-0010: AI サービスへの送信は既定 Snapshot 断片のみとし設定で明示的に許可したときだけ拡張する

## 状態

承認

## 決定日

2026-08-08

## 背景

- 候補生成のために外部 AI サービスへ送ってよい情報の範囲が Open Question「AI サービスへ送信できる情報」として残っていた。選択肢は Snapshot のみ、画像を含む、DOM 情報を含む、の 3 段階。
- 送る情報が増えるほど候補精度は上がるが、対象 Web アプリケーションの画面には業務データや個人情報が含まれうる。可否は対象プロダクトのデータ分類に依存し、システム側で一律に決められない。

## 決定

- **既定は Accessibility Snapshot 断片 (対象要素 + 周辺文脈) と画面メタ情報のみを送信する**。
- **スクリーンショット画像と DOM 断片は、対象プロダクト単位の設定で明示的に許可したときだけ送信する** (既定は不許可)。
- パスワード等の secret 系フィールドの値は、設定に関わらず送信前に常に除去する。
- 何をどの種別 (Snapshot / 画像 / DOM) で送ったかを実行記録に残し、後から監査できるようにする。
- **上記の規則は送信先を問わず適用する**。送信先は次の 2 経路であり、[adr/0019](0019-agent-led-ai-suggestions.md) により MVP で使うのは前者だけである。

| 送信先                         | 経路                                                       | 適用時期          | データが出る範囲                     |
| ------------------------------ | ---------------------------------------------------------- | ----------------- | ------------------------------------ |
| 利用者のマシン上のエージェント | [adr/0020](0020-suggestion-pull-queue.md) の提案依頼キュー | MVP               | **エージェントが使うモデルの提供者** |
| 外部 AI サービス               | adapter/ai (AI Port の実装)                                | adapter/ai 実装時 | 外部のモデル提供者                   |

**エージェント経路でもデータは利用者のマシンの外へ出る。** Claude Code や Codex はローカルで動くプロセスだが、推論はモデル提供者のサーバで行う。渡した Snapshot・画像・DOM はそこへ送信される。**プロセスがローカルであることと、データがローカルに留まることは別である。**

したがって既定の不許可 (画像・DOM を送らない) は、**両経路で維持する**。エージェント経路だから緩めてよい、という理由は成り立たない。

送信先によらず維持するのは次の 3 点である。

- **既定の不許可**: 画像と DOM は明示的に許可しない限り送らない。
- **secret 系フィールドの値の除去**: 依頼内容はエージェントのコンテキストへ入り、そのセッション履歴に残る。除去の理由は送信先ではなく、認証情報を Snapshot 経由で拡散させないことにある。
- **送信種別の記録**: 何をどの種別で渡したかを実行記録に残す。監査可能性は両経路で必要である。

違うのは**利用者から見た送信先の名前**だけで、境界の扱いは変わらない。利用者へは「どのモデル提供者へ渡るか」を示す。

## 代替案

- **Snapshot のみに固定**: 情報管理は最も単純だが、視覚的な手掛かり (アイコンのみのボタン等) に基づく名称提案ができず、候補精度の上限が低い。拡張の逃げ道がないため却下。
- **常に画像・DOM を送信**: 候補精度は最大だが、データ分類が厳しいプロダクトで採用できなくなる。既定を「送る」に置くと送信範囲の把握が利用者任せになるため却下。

## 影響

### 良い影響

- 既定が最小送信のため、データ分類の確認前でも安全に使い始められる。可否判断が「プロダクト設定を変えるか」という明示的な操作になる。
- 送信種別の記録により、AI サービスへ渡った情報の範囲を後から説明できる。
- 規則を送信先から独立させたため、adapter/ai を後から実装しても送信境界の設計を作り直さずに済む。

### 悪い影響 / トレードオフ

- 既定設定では候補精度が Snapshot の情報量に制限される。送信境界のフィルタと監査記録の実装コストがかかる。

### 影響範囲

- 対象モジュール / package: element / workflow / infra (送信境界のフィルタと監査記録)

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [design/features/ai-suggestions/DesignDoc_ai-suggestions.md](../design/features/ai-suggestions/DesignDoc_ai-suggestions.md) に送信境界の設計を反映 — 実施済み
  - [design/features/element-mapping/DesignDoc_element-mapping.md](../design/features/element-mapping/DesignDoc_element-mapping.md) の AI Port 制約の Open Question 参照を本 ADR 参照へ更新 — 実施済み
  - [design/DesignDoc.md](../design/DesignDoc.md) の Open Question「AI サービスへ送信できる情報」を削除 — 実施済み
  - [design/features/ai-suggestions/DesignDoc_ai-suggestions.md](../design/features/ai-suggestions/DesignDoc_ai-suggestions.md) の送信境界を、エージェント経路にも適用される形へ書き直す — 実施済み
- 未決事項: なし。エージェント経路でも既定は「不許可」で確定した (推論がモデル提供者のサーバで行われるため、送信先の扱いを変える理由がない)。

## 関連ドキュメント / チケット

- [adr/0019](0019-agent-led-ai-suggestions.md): AI 候補生成をエージェント主導とする決定
- [adr/0020](0020-suggestion-pull-queue.md): エージェント経路での提案依頼キュー
- [design/features/ai-suggestions/DesignDoc_ai-suggestions.md](../design/features/ai-suggestions/DesignDoc_ai-suggestions.md)
- [design/features/element-mapping/DesignDoc_element-mapping.md](../design/features/element-mapping/DesignDoc_element-mapping.md): AI Port の契約 (入力)
- spec / PR: なし
