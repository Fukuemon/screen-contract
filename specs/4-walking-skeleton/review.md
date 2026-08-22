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

## Review 2026-08-23 (4 回目) — clarify gate

Verdict: **NEEDS_WORK**

### 3 回目の指摘 4 件の解消状況

| #   | 指摘                                   | 判定 | 残る問題                                       |
| --- | -------------------------------------- | ---- | ---------------------------------------------- |
| 1   | Flow 10 が `completed` の run へ rerun | 解消 | —                                              |
| 2   | entry の `open` の Expectation         | 解消 | —                                              |
| 3   | ADR-0002 が整合表・ADR 影響表に無い    | 一部 | 整合表と関連資料には載ったが、ADR 影響表に無い |
| 4   | 確定判断の反映先判定                   | 一部 | 判定表と ADR 影響表が食い違う。D7 の判定に疑義 |

観点別では **未解決論点 / 外部依存の健全性 / 実装対象明示 / template 必須節 / EARS acceptance が PASS**。NEEDS_WORK は上位文書整合のみ。

### 指摘 (4 回目)

1. **ADR-0002 / ADR-0017 / ADR-0026 の変更内容が誤った表にある。** `## 上位文書整合` の表に書かれ、`## 上位資料からの変更点 → ADR の新規 / 更新` の表に無い。`phase-sync.md` は「`## 上位資料からの変更点` から未反映の変更提案行を抜き出す」と定めるため、このままでは sync phase が取りこぼす。
2. **上位文書整合表の列の意味が崩れている。** テンプレートの列は `上位文書 / 節・該当箇所 / 整合方針` だが、追加行は「節」列に変更内容、「整合方針」列に理由が入っている。結果 ADR-0017 が「継承」と「変更提案」の 2 つの方針を持ち、ADR-0026 が整合方針の値を失っている。
3. **メタの「ADR 起票要否」が未同期。** ADR-0002 と ADR-0017 の改訂が加わったことを反映していない。
4. **D7 の「spec で閉じる」判定が疑わしい。** `phase-sync.md` は「選択肢を比較して決めた判断は、影響が単一 feature 内でも **ADR 化を既定**とする。spec で閉じられるのは、選択の余地がなかった作業上の決定のみ」と定める。D7 は却下案を持つ比較判断で、draft と正本の置き場という **issue が閉じても残る保存構造**を決めている。`context/architecture.md` の State Boundary は「draft と確定を分離する」までしか定めておらず、置き場を分ける判断の根拠は spec の削除とともに失われる。D13 (却下案 3 件) も同じ理由で境界上にある。

### 今回あらためて確認した整合 (問題なし)

- **D22 と D15 の読み分けは成立している。** スコープが両方を 1 行で示し、Flow 9 が「記録に使った run とは別の run」、Flow 10 が「9 の run と同じセッション」と明示するため混同なく読める。
- D22 は `execution:134` と `adr/0002:36` の両方を満たし、D19 の規則の再適用だけで閉じている。上位文書の追加変更が要らないという主張も正しい。
- D23 は `execution:92` を直接根拠にしており、D20 とも衝突しない。
- 反映先判定表の他の行は妥当。D8 / D16 / D17 / D20 / D22 / D23 を spec で閉じる判定は、skeleton の範囲判断か既存契約の適用であり妥当である。
- 軽微な確認事項: pause 予約が 1 回で消費されることが D19 / D22 に明記されていない。ADR-0002 の「pause 要求 = 予約」から読めるため矛盾ではないが、feature doc へ書き足す際に 1 語添えておくとよい。

### 親 agent の対応 (指摘 1〜3 と軽微な確認事項)

指摘 1 と 2 は親 agent の作業ミス。ADR-0002 / ADR-0017 の改訂行と ADR-0026 の変更内容を上位文書整合表へ入れてしまい、整合表の列の意味も壊していた。3 行を ADR 影響表へ移し、整合表を 3 列形式へ戻した (ADR-0017 は「変更提案 (D9 が revision の方式を定める)」、ADR-0026 は「変更提案 (D5 / D12 が候補の範囲を絞る)」)。指摘 3 のメタも同期し、pause 予約の one-shot 性を D19 と feature doc 影響表へ添えた。

## Review 2026-08-23 (5 回目) — clarify gate

Verdict: **NEEDS_WORK**

### 4 回目の指摘 4 件の解消状況

3 件が解消。指摘 4 (D7 の判定) は反映先が移ったが、根拠の置き場が契約と合わない点が残った。

観点別では **未解決論点 / 外部依存の健全性 / 実装対象明示 / template 必須節 / EARS acceptance が PASS**。NEEDS_WORK は上位文書整合のみ。**設計内容そのものの矛盾は検出されなかった。**

### 指摘 (5 回目)

1. **反映先判定表の 2 セルが他の表と食い違う。**
   - D22: 判定は「spec で閉じる」だが、ADR-0002 行・execution 行・メタのいずれもが D22 を改訂の理由に挙げている。
   - D1: 判定は「feature doc: element-mapping」だけだが、ADR-0026 行とメタは D1 を ADR-0026 の改訂に含めている。
   - あわせて上位文書整合表の execution 行が、最も大きく変わる**実行状態と再生制御**を節にも整合方針にも載せていない。
2. **D7 / D13 の根拠の置き場が契約と噛み合わない。** context へ寄せた判断は**規則の置き場としては妥当**である (`phase-sync.md` の「context = architecture / toolchain 規約の変更」に合致し、`context/architecture.md` の State Boundary は分離の方針までしか持たない)。ただし `spec-contract.md` は「design 側は現在の設計だけを持つ。なぜ変えたかは書かない。書きたくなったらそれは ADR にすべき判断」と定める。D7 と D13 は却下案を持つ比較判断であり、context へ規則だけを書くと**却下案と理由が spec 削除とともに消える**。D7 は ADR-0017、D13 は ADR-0027 が既に改訂対象であるため、そこへ 1 項足せば ADR は増えない。

### 確認した整合 (問題なし)

- 反映先判定表 → 影響表の順方向は D22 と D1 を除く全行に対応行がある。逆方向で判定表に載らないのは実測事実 (F10 / F14) に紐づく行のみで、判定表の対象外である。
- 「pause 予約は 1 回で消費される」が ADR-0002 行と execution 行の両方に入り、Flow 10 の「`completed` で終わる」と整合した。
- 上位文書整合表の 3 列形式が回復し、ADR 4 本の整合方針が ADR 影響表の内容と一致する。context 側も infrastructure / toolchain / architecture State Boundary が両方の表に揃った。
- **残るのは反映先の帰属 2 セル、整合表の 1 行、根拠の置き場 2 件で、いずれも表の編集で閉じられる。これらを直せば全観点で PASS を出せる状態である。**

### 親 agent の対応

指摘 1 は表を確定済みの決定へ揃えた (D22 → ADR-0002 / feature doc: execution、D1 → ADR-0026 を追加、整合表の execution 行に実行状態と再生制御を追加)。指摘 2 はユーザー確認のうえ、規則を context、判断 (却下案と理由) を既存 ADR へ分ける形にした。D7 は ADR-0017、D13 は ADR-0027 へ 1 項足す。どちらも既に改訂対象であるため ADR は増えない。

## Review 2026-08-23 (6 回目) — clarify gate

Verdict: **PASS**

### 5 回目の指摘 2 件

いずれも解消。判定表の D1 / D22 が他表と一致し、D7 / D13 は「(規則) / (判断)」の 2 段で context と既存 ADR へ分かれた。

### 観点別評価

| 観点               | 結果 |
| ------------------ | ---- |
| 上位文書整合       | PASS |
| 未解決論点         | PASS |
| 外部依存の健全性   | PASS |
| 実装対象明示       | PASS |
| template 必須節    | PASS |
| EARS acceptance    | PASS |
| prompts 自己完結性 | N/A  |
| 正本境界           | N/A  |

整合表の全 21 行に節と整合方針が入り、変更提案はすべて対応する影響表の行を持つ。判定表 23 行を順方向に追跡し、durable な反映先を持つ 15 件がすべて影響表に存在することを確認。逆方向で判定表に載らないのは実測事実 (F10 / F14) 起点の 2 行のみ。メタの ADR 起票要否も ADR 影響表と一致する。

「(規則) / (判断)」の 2 段表記は誤読を招かないと判断。sync phase が処理するのは影響表の行であり、D7 / D13 はどちらも context 側と ADR 側に別々の行を持つ。判定表はその索引として機能する。

「spec で閉じる」に残った D8 / D16 / D17 / D20 / D23 は、skeleton の範囲判断・既存契約の適用・既存語彙での DSL の書き方であり、`phase-sync.md` の「選択の余地がなかった作業上の決定」に収まる。却下案を持つ判断はすべて ADR へ振られた。

**1〜5 回目に挙げた指摘 27 件はすべて解消。設計内容の矛盾、未決の持ち越し、テンプレート逸脱はいずれも残っていない。diagram phase へ進んでよい状態である。**

### 非ブロッキングの推奨 (反映済み)

1. 整合表の整合方針欄が挙げる D 番号が部分集合になっていた (element-mapping / ADR-0002 / ADR-0026)。全件を挙げる形へ揃えた。
2. context 側の変更内容に `(判断の正本は ADR-0017)` / `(判断の正本は ADR-0027)` の 1 行参照を書く指示を添えた。`spec-contract.md` が design 側に理由を書かず ADR への 1 行参照を置くと定めるためである。

### レビュー環境の制約と、親 agent による補完

`gh` を実行する手段が無いため、レビュアーは issue #4 本文を直接読めていない。判定は spec 内の成功条件と User Flow、テスト観点の対応に基づく。**issue 側の受け入れ条件との突合は親 agent が実施し、差異なしを確認した** (結果は `index.md` の `## 備考`)。

## Review 2026-08-23 (track gate) — diagram + track を累積

Verdict: **NEEDS_WORK**

### 図の検証結果

3 図と spec の記述の対応を 1 本ずつ追い、User Flow 1〜12 / D5 / D12 / D15 / D19 / D22 / ADR-0008 の中継条件 / D9 の stale / D23 と冪等スキップの 8 項目が一致することを確認。**エラーケース 5 (D4) だけが 3 図のどこにも現れていなかった。**

### 指摘 (track gate)

1. **`## Interface 設計` が未記入のままフェーズ表が phase 6 を「完了」としている。** さらに Sequence 2 が使う `step-failed` が本文の列挙に無く、**図が本文より先に進んでいる**。
2. **エラーケース 5 (D4) が図に無い。** `diagram-rules.md` は sequence diagram に「エラーコード一覧の全コードに対する alt 分岐」を求めている。ケース 4 も「step-executed または step-failed」のラベル併記で、run を `failed` にする経路が分岐として読めない。
3. **メタの Design Doc 更新要否が同期漏れ。** track で差し替えた影響表 (モジュール責務 → 合成ルート) と食い違う。
4. **整合表が同じ節に 2 つの方針を持つ。** 「モジュール責務 → core 層 / adapter/browser / 合成ルート」を継承としたまま、「モジュール責務 → 合成ルート」を変更提案とする行を足していた。
5. **レビュー表と備考の数値が食い違う。** 受け入れ条件が「21 件 / 差異なし」と「20 件 / 差異 1 点」。

### 確認された整合 (問題なし)

- 変更点表 19 行に漏れ・重複・空欄なし。PRD 行と Design Doc 行の重複は統合モードの帰結として説明されている。
- **Design Doc の反映先を「モジュール責務 → 合成ルート」に変えた判断は妥当。** Design Doc を daemon / 子プロセス / 起動 / 終了 / 生存 で走査した結果、「子プロセスとして起動・管理する」の文は `context/architecture.md` にしか無く、F10 と読み合わせて誤読を生むのは「終了」を含む合成ルートの行だった。
- 前回 PASS 後の退行は ADR-0002 行の 1 件で、復元は正しい。新たな退行は指摘 3・4・5 の 3 件で、いずれも track の編集に伴うメタ側の同期漏れ。図と決定内容そのものに退行は無い。

### 親 agent の対応

指摘 3・4・5 は同期漏れとして直した。受け入れ条件は `gh issue view 4` で数え直し、**20 件**が正しいことを確認した。

指摘 1・2 は決定を伴うため、ユーザー確認のうえ D24 と D25 を確定した。

- **D24**: 発行する実行イベントを受け入れ条件の再構成に必要な 10 件に限る。`ir-version-changed` / `rolled-back` / `run-aborted` は skeleton で発行機会が無い。
- **D25**: `session-recreated` と `input-discarded` の 2 件を語彙へ足す。上位文書が「イベントに残す」と定めながら語彙を持っていなかった箇所である。

`## Interface 設計` を上記で埋め、Sequence 1 に `input-discarded`、Sequence 2 に D4 の alt 分岐と `step-failed` → `run-failed` の分岐を足した。3 図とも実レンダリングで再検証済み。

## Review 2026-08-23 (track gate 2 回目)

Verdict: **NEEDS_WORK**

前回の 5 件は 4 件が解消、1 件 (D4 を図へ) が一部。観点別では上位文書整合のみ NEEDS_WORK で、他は PASS / N/A。

### 指摘 (track gate 2 回目)

1. **D24 の `rolled-back` 除外理由と、図に足した再作成の分岐が矛盾する。** D4 は「セッションの再作成はページ状態を失う操作」と述べ、execution feature は前提が崩れた状況を「満たさなくなった最初のステップまで巻き戻して再実行する」と定め、そのイベントが `rolled-back` である。図は再作成後そのまま次の評価へ進むため、**ページ状態を失ったまま後続ステップを評価する**。エラーケース 5 も「止めるか再作成するか」の両方を残しながら復旧欄は「run をやり直す」で、図に「止める」分岐が無い。
2. **`input-discarded` の置き場が層と噛み合わない。** ExecutionEvent は core/execution が定義し run 単位で発行順序が決定的。入力の破棄は api (Stream Proxy) で起き、破棄条件の 1 つ「対象 run が要求元のものでない」では **run が定まらない**。図も `API->>App: input-discarded` で、interface が core の語彙のイベントを起こす形になっている (`context/architecture.md` は interface → core の直接依存を禁じる)。外部タイミングの事象を混ぜると「発行順序が決定的」が成り立たない。
3. **`ir-version-changed` の除外理由が spec 内の記述と食い違う。** 「記録と再現の間に draft を編集しない」とあるが、**記録そのものが draft を書く操作**である。正確な理由は「記録に使った run を `resume` も `rerun_step` もしない」。結論は妥当だが、理由のままだと実装者が読み違える。
4. (軽微) **記録に使った run の終わり方が spec に無い。** 別 run で再現へ移るため記録用 run は `paused` のまま残り、`run-aborted` を除外した D24 の下では**イベント列上で終端を持たない**。

### 確認された整合 (問題なし)

- D24 の 3 件の除外は、理由を直せば妥当。`rolled-back` は `rerun_step` そのものでは発行されず、Flow 10 では通過済みステップの Expectation が満たされたままなので巻き戻しに入らない。`ir-version-changed` も再現の run では draft が変わらない。ただし再作成経路を残す限り `rolled-back` の除外は成立しない。
- Sequence 2 の評価まわりの分岐は execution のステップ実行ルール 4 手順と一致する。`createSession (匿名)` も認証コンテキスト必須の契約を満たす。
- 反映先判定表は D25 まで拡張され影響表と対応している。

### 親 agent の対応

指摘 3 は理由の文言を直した。指摘 1・2・4 はユーザー確認のうえ D26 / D27 / D28 を確定した。

- **D26**: skeleton ではセッション不応答時に**再作成せず `run-failed` で終える**。`rolled-back` を持たない D24 と整合し、エラーケース 5 の復旧とも一致する。D4 の Port 契約は変えず、skeleton の方針を「止める」に固定するだけである。`session-recreated` は語彙として足すが skeleton では発行経路を持たない。
- **D27**: `input-discarded` を **Stream Proxy 側の語彙**として定義する。反映先を ADR-0008 と web-editor feature に分け、core/execution へは足さない。整合表の ADR-0008 も「継承」から「変更提案」へ変えた。
- **D28**: 記録に使った run は記録の停止後に `resume` して `run-completed` で終える。D24 の語彙で足り、終端を持たない run が残らない。

Sequence 2 の再作成分岐を「止める」へ、Sequence 1 の `input-discarded` を Stream Proxy 内で完結する形へ直し、3 図とも実レンダリングで再検証した。
