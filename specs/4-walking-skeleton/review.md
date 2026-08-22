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

## Review 2026-08-22 (2 回目) — clarify gate

Verdict: **NEEDS_WORK**

### 1 回目の指摘 10 件の解消状況

| #   | 指摘                      | 判定 | 残る問題                                                           |
| --- | ------------------------- | ---- | ------------------------------------------------------------------ |
| 1   | D11 が Why/What を覆す    | 一部 | PRD 影響節が「変更なし」のまま。artifact-generation が影響表に無い |
| 2   | 記録開始と ADR-0008       | 一部 | `paused` と `completed` の優先順位が未定義                         |
| 3   | 起動時検査の残り 2 件     | 解消 | —                                                                  |
| 4   | D2 の波及先               | 解消 | —                                                                  |
| 5   | Workflow 文書がスコープ外 | 一部 | Screen 文書の初期 draft を誰がいつ作るかが未記載                   |
| 6   | D1 と element-mapping     | 一部 | Reuse Policy の「同じ規則を使う」が D18 と矛盾                     |
| 7   | メタ情報の同期            | 一部 | 「clarify で確定させる」等の古い記述が残る                         |
| 8   | `## 備考` 欠落            | 解消 | —                                                                  |
| 9   | D3 の計測値               | 解消 | —                                                                  |
| 10  | 未確定事項の追跡先        | 解消 | —                                                                  |

観点別では未解決論点 / 外部依存の健全性 / 実装対象明示 / EARS acceptance が PASS、上位文書整合と template 必須節が NEEDS_WORK。

### 指摘 (2 回目)

1. **PRD 影響節が Design Doc 影響節と矛盾する。** メタの「PRD 更新要否: 不要」と PRD 影響表「Why/What に変更なし」が、Design Doc 影響表の「Why/What → 成功条件を一般化する」と逆のことを述べている。統合モードでは Why/What が PRD 相当 (`context/project.yml` の `design.prd: integrated`) である。あわせて `design/features/artifact-generation/DesignDoc_artifact-generation.md:34` (同じ成功条件の再掲) を feature doc 影響の対象節へ足す。
2. **Reuse Policy が D18 と矛盾する。** 「記録の座標解決は element-mapping feature の要素選択と**同じ規則**を使う」が残っており、D18 (祖先候補列と `label` / `testid` を使わず role+name に絞る) と食い違う。
3. **Screen 文書の初期 draft が User Flow に無い。** run は Screen 文書 (id / title / entry 参照 / `default` 状態) を必要とし、「遷移元は run の到達状態 (`default`) から決まる」もその存在を前提にしている。誰がいつ作るかが読めない。あわせて Flow 9 の `run.start` が新しいセッションで `open` から実行されること、Flow 10 の `rerun_step` がその run と同じセッションで行われることを明示しないと、「9 で再現され 10 で全 skip」の観測が成立しない。
4. **`paused` と `completed` の優先順位が上位文書に無い。** D15 の根拠 2 は「pause の予約で表現できるため新しい概念が要らない」とするが、記録時点の実行ステップ列は entry の `open` 1 件だけで、`design/features/execution/DesignDoc_execution.md:121` は「全ステップ完了 → `completed`」を定めている。**最終ステップの完了と pause 予約が重なったときにどちらが勝つかが決まっていない。** `completed` に倒れると ADR-0008 の中継条件を満たさず、記録経路が丸ごと成立しない。
5. **実装対象テーブルの責務列がスコープ更新に追随していない。** `workflow` 行に Workflow 文書 (D17) が無く、`infra` 行が「起動時のブラウザ検査」のままで起動時検査 3 件 (D16) を反映していない。
6. **clarify 完了後の古い記述が残る。** 「clarify を先に通す」「clarify で確定させる」「clarify と diagram を経てから」。
7. **pnpm の `engines` を外れて運用することが決定として書かれていない。** F3 / F18 に事実は揃ったが、可否の判断が無い。

### 今回あらためて確認した整合 (問題なし)

- D16 と `context/infrastructure.md` の検査 3 項目、およびエラーケースが一対一で対応する。
- D17 は `workflow-dsl` の「`open` だけを使う Workflow は `params` を省略できる」と噛み合う。
- D18 は element-mapping の祖先候補列・優先順位ポリシーが要素選択の機能であることと一致する。
- F17 / F18 の追加により、D2 / D3 の根拠がすべて F の表から辿れる。

### レビュー環境の制約

`gh` を実行する手段が無いため issue #4 本文を直接読めていない。判定は spec 内の成功条件とテスト観点の対応のみに基づく。

## Review 2026-08-22 (3 回目) — clarify gate

Verdict: **NEEDS_WORK**

### 2 回目の指摘 7 件の解消状況

6 件が解消。指摘 4 (`paused` と `completed` の優先順位) のみ一部で、D19 の結論と D15 根拠 2 の書き換えは妥当だが、正本の所在 (ADR-0002) と Flow 10 の扱いが残る。

観点別では **未解決論点 / 外部依存の健全性 / 実装対象明示 / template 必須節 / EARS acceptance が PASS**。NEEDS_WORK は上位文書整合のみ。

### 指摘 (3 回目)

1. **Flow 10 の `rerun_step` が `completed` の run に掛かる。** Flow 9 の run は全ステップを実行して終わるため `completed` になる。`design/features/execution/DesignDoc_execution.md:134` は `rerun_step` を「一時停止中に任意の通過済みステップを指定して再実行できる」と定め、`adr/0002-pause-semantics.md:36` の状態遷移図でも `completed` は終端である。**D19 が塞いだのと同じ種類の穴が 1 つ残っている。** 9 の run にも pause を予約し、最終ステップ完了時に `paused` で止めれば (D19 の規則をそのまま再利用)、追加の上位文書変更なしで閉じられる。
2. **entry の `open` step に `expect` が書かれていない。** `design/features/execution/DesignDoc_execution.md:92` は「Expectation を持たないステップは評価を省いて必ず action を実行する」と定めるため、`expect` が無いと Flow 10 の「全ステップが `skipped`」が成立しない。`open` の step に `url` の Expectation を書くことを明記する必要がある。なお D20 の「`default` の `expect` は空のまま」は、`default` が遷移 step を持たない状態であるため同 92 行と衝突しない。
3. **ADR-0002 が整合表に無い。** pause の意味論 (「ステップ境界でのみ効く」「完了後に停止する予約」) を決めた正本は `adr/0002-pause-semantics.md` であり、D15 / D19 はその決定を拡張している。feature doc だけを直すと ADR-0002 の状態遷移図 (`running --> [*] : completed`) が優先順位を持たないまま残り、**正本が 2 つに割れる**。整合表・関連資料・ADR 影響表へ載せ、改訂か新規 ADR かを記録すべきである。
4. **変更点表が拾えていない確定判断がある。** D12 (Expectation 候補を「操作の前後で変化した項目」に絞る) は `adr/0026-operation-recording.md:26` の「操作後の Snapshot から URL・可視要素などの候補を出し」を実質的に狭める決定だが、ADR-0026 行に入っていない。D21 は `context/toolchain.md:122` の「現時点で未確定のものは無い」に関わる。D7 / D9 も `context/architecture.md` / `adr/0017` が方式まで定めていないため、反映先の判定が要る。`phase-sync.md` は解決済みの論点を全行走査して判定を付けることを求めており、現状では D6 / D7 / D9 / D12 / D13 / D16 / D17 / D20 / D21 が未判定で sync に入る。

### 今回あらためて確認した整合 (問題なし)

- D19 の結論 (pause 予約優先) は `execution:129` の予約の意味論と矛盾せず、`paused → resume → completed` の復帰経路も既存の遷移として存在する。新しい状態を増やしていない。
- D15 の記録経路は ADR-0008 の中継 3 条件をすべて満たし、web-editor feature の「モード切替は一時停止中だけ有効」とも衝突しない。記録中のセッション生存も `execution:141` と一致する。
- Flow 9 の「run ごとに新しいセッション」は `execution:141` のセッション抽象と整合し、Flow 10 の「同一セッション」も D4 の「黙って再作成しない」と噛み合う。
- D20 の Screen 文書骨格の手書きは `workflow-dsl:142,222` の entry / `default` の定義と一致する。
