---
type: context
title: draft と確定
description: エージェントと利用者の編集を draft に置き、人間の承認で確定済みのデータへ反映する規則。確定の 3 つの対象と、承認の前後で成り立つ条件
status: stable
---

# draft と確定

エージェントと利用者の編集は draft に置き、人間の承認によってだけ確定済みのデータへ反映する。  
ADR-0017: [エージェントの操作範囲](../../adr/0017-agent-draft-boundary.md)

## States and Transitions

- draft: 承認の前の作業の状態。エージェントと利用者が自由に作って編集できる。
- 確定済み: 承認を経て反映した状態。対象と、確定済みのデータになるものは次の 3 つ。
  - DSL の変更: 確定済みの Screen 文書と Workflow 文書
  - 構成番号: state の `badges`（NumberingPlan）
  - Baseline の更新: 承認した実行結果のセット
- draft から確定済みへは、人間の承認で移る。
  - エージェントは承認を依頼する `approval.request` までを行う。
  - 依頼は対象の draft の revision を固定する。承認するときに revision が一致しなければ、確定しない。
  - 差し戻しは構造化したコメントで返し、エージェントは直して依頼し直す。

## Invariants

- 確定済みのデータは、人間の承認を経たときにだけ変わる。
- 承認を待つ間も、エージェントは他の draft の作業を続けられる。
- 注釈画像と Markdown のテーブルは確定済みのデータから作る生成物で、確定済みのデータにならない。

## Prohibitions

- 確定済みのデータを変更する tool を agent interface に作らない。エージェントが確定済みのデータを変えられると、その正しさが AI の出力の正しさに左右される。
- 操作の記録の結果を、確定済みのデータへ直接書かない。記録の出力も draft にする。
  - ADR-0026: [操作の記録](../../adr/0026-operation-recording.md)
- 生成物を直接編集しない。
- run の実行（`run.start`、`run.resume`、`run.rerun_step`）は draft に閉じず、対象アプリに副作用を起こす。この規則では守れないため、実行してよい origin の列挙と記録で守る。列挙の規則は [基盤と運用](../operations.md#environments) にある。
