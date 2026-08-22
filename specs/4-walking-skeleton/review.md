# Review 記録

`spec-review` (fresh-context evaluator `spec-reviewer`) の完全な記録。要約は `index.md` の `## レビュー` を参照する。

## Review 2026-08-22 — clarify gate (scaffold〜clarify を累積)

Verdict: **NEEDS_WORK**

### 観点別評価

| 観点               | 結果       | 要点                                                                                                                      |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 上位文書整合       | NEEDS_WORK | D11 が Design Doc の成功条件「構成番号付き PNG 画像」を覆すのに、PRD / Design Doc への変更提案が無い。ADR-0008 等とも衝突 |
| 未解決論点         | NEEDS_WORK | 論点表は未決ゼロだが、メタ情報に「clarify の結論次第」「未定」が残る                                                      |
| 外部依存の健全性   | NEEDS_WORK | `@puppeteer/browsers` の最終公開日・Node/pnpm 対応・後継の確認記録が無い                                                  |
| 実装対象明示       | PASS       | 8 target が `context/project.yml` の `domains` と一致。責務境界と検証コマンドも一致                                       |
| template 必須節    | NEEDS_WORK | `## 備考` が欠落。clarify 完了後も古い指示文が残る                                                                        |
| EARS acceptance    | PASS       | 9 件がいずれも観測可能で、テスト観点が各条件に対応している                                                                |
| prompts 自己完結性 | N/A        | prompts phase 未実施                                                                                                      |
| 正本境界           | N/A        | sync phase 未実行。spec が作業正本でよい段階                                                                              |

### 指摘

1. **D11 が Design Doc の Why/What を覆す。** `design/DesignDoc.md:64` の成功条件は「DSL から構成番号付き **PNG** 画像と Markdown テーブルを生成できる」。spec は `index.md` のメタで PRD 更新不要・Design Doc 影響を Runtime Boundary 1 件のみとしており、変更提案が欠けている。`design/features/artifact-generation/DesignDoc_artifact-generation.md:34` の同じ成功条件も影響表に入っていない。加えて D11 は選択肢を比較した判断であり、`phase-sync.md` の ADR 化基準に該当する。
2. **記録開始が ADR-0008 の中継条件を満たさない。** User Flow は「fixture-app を開き、操作モードに切り替えて記録を開始する」で始まるが、`adr/0008-stream-proxy.md:26-30` は入力転送の中継条件を「対象 run が `paused` かつ操作モードであること」と定め、web-editor feature もモード切替を一時停止中に限っている。run が存在しない記録開始をどう成立させるかが未記載のまま、ADR-0008 と web-editor を「継承」としている。
3. **起動時検査の残り 2 件がスコープに無い。** `context/infrastructure.md:60-66` の起動時検査は 3 項目 (ブラウザ本体 / 実行してよい origin の列挙 / 二重起動)。**origin 列挙は既定が空で、列挙が無いと実行できない。** spec はブラウザ本体だけを扱い、他 2 件をやること・やらないこと・未確定事項のいずれにも置いていない。
4. **D2 の波及先が影響表に無い。** 起動時検査の案内文の正本は `context/infrastructure.md`、標準スタック表は `context/toolchain.md`。どちらも context 影響表にも関連資料にも現れない。`toolchain.md` は「現時点で未確定のものは無い」と宣言しているため、`@puppeteer/browsers` の追加で更新対象になる。
5. **Workflow 文書がスコープに無い。** DSL は Screen と Workflow の 2 文書構成で、`open` は entry として参照する Workflow 文書に置かれる (`workflow-dsl:142,200-208`)。実行ステップ列は `entry → default → 対象状態` で平坦化される。spec のスコープと実装対象は Screen 文書だけを挙げ、記録の対象も `click` のみとしているため、`open` の step をどう用意するかが読めず「`run.start` による再現」の前提が埋まらない。
6. **D1 が element-mapping の候補生成規則を満たしきれない。** element-mapping は座標解決に「祖先方向の候補列」と「role+name → label → testid の優先順位での候補生成」を要求する。F7 の `--annotate` 応答には祖先関係も label / testid も無い。規則の適用範囲を絞るか、制約として feature doc 影響に書き足す必要がある。
7. **メタ情報が clarify 完了後も同期していない。** ADR 起票要否が「未定 (D2 / D3 の結論次第)」、Design Doc 影響の対象節が「未定」、ADR-0026 行の理由が「D1 が `eval` を選ぶ場合」という既に否定された条件文のまま。
8. **`## 備考` が欠落している。** 該当が無ければ節を残して「なし」と書く運用である。
9. **D3 の計測値が F の表に無い。** 「wrapper 約 100ms / ネイティブ約 6ms」は解決済み論点の本文にしかない。実測事実の正本を 1 箇所に保つため F として追加することを推奨する。
10. **未確定事項に決定者と判断時期が無い。** F9 の再現条件と `hover` / `scroll` の入力転送の 2 件。「厚くする段階」で判断するなら追跡先を明示する必要がある。

### 合格を確認した点

- F1〜F16 と D1〜D14 の対応関係は整合している。F5 / F7 → D1、F9 / F12 → D4、F14 → D5 の却下理由、F15 → D6、F16 → D10、F6 → データ設計はいずれも実測と結論が噛み合う。
- D9 は `adr/0018` の「IR 版は正規化した内容から決まる値」と方式が揃い、`adr/0017` の revision 固定要件も満たす。
- D4 は execution feature の Browser Port 契約 (構造化エラー語彙 `auth/expired`) の延長として矛盾がなく、影響も記録されている。

### 照合結果 (親 agent が上流文書で確認)

指摘 1 / 3 / 4 / 5 / 6 / 8 は該当箇所を直接読んで実在を確認した。指摘 2 も ADR-0008 と web-editor feature の記述で確認した。
