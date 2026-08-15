# ADR-0006: 正本は YAML DSL のまま、Playwright の Page Object コードを生成物として提供する

## 状態

承認

## 決定日

2026-08-07

## 背景

- 本プロダクトの再現実行は agent-browser を基盤にしているが、利用者側の資産としては「Playwright のコードとして再現可能」であることに価値がある (E2E テストへの流用、開発者にとって既知の形式)。
- そこで「TS の Page Object Model (POM) 形式を正本として管理する」案を検討した。
- 一方、本システムの中核ループは正本への機械的な書き戻しで成立している: Web UI での要素選択の反映、AI 候補の承認反映、再採番 (`badges` の書き戻し)、エージェントの draft 編集と構造化エラーによる自己修正。

## 決定

- **正本は YAML DSL (Screen / Workflow) のまま**とし、Workflow IR を中間表現とする現行構成を維持する。
- **Playwright TS の POM コードを、IR からの決定的 codegen による生成物として提供し、MVP スコープに含める**:
  - Screen 文書 → 画面ごとの Page Object クラス (要素定義 → 型付き locator プロパティ、状態遷移 steps → メソッド)
  - Workflow 文書 → 到達手順の fixture / helper
  - Locator の対応: `role+name` → `getByRole`、`label` → `getByLabel`、`testid` → `getByTestId`、`text` → `getByText`、`css` + `index` → `locator().nth()`
  - **`index` は 1 始まり、`nth()` は 0 始まりである。** 変換時に 1 を引く。引き忘れると生成した POM が隣の要素を操作し、しかも実行しても例外にならない (規則は [artifact-generation feature](../design/features/artifact-generation/DesignDoc_artifact-generation.md))
- 生成コードは**編集禁止・再生成で更新** (生成ヘッダで明示)。個別に編集可能な正本にはしない (DesignDoc の原則) ため、他の成果物と同じ書き換え抑止の対象に入れる。
- 実行基盤は agent-browser のまま変えない。POM 出力は利用者の Playwright 環境で動くコードの提供であり、本システムの Runner を Playwright に置き換える判断ではない。
- **POM 生成はプロダクト設定で明示的に有効にしたときだけ行う**。本システム自体は Playwright に依存せず (codegen はテキスト生成)、依存が生じるのは生成された POM を利用者のテストで import する場合のみ。Playwright を使わない利用者は仕様書生成だけで完結する。

## 代替案

- **TS の POM を正本にする**: 開発者に既知で IDE 支援も強いが、(1) 正本への機械的な書き戻しが AST 操作になり、人間のフォーマット・コメントを保ちながらの安全な編集という難問を抱える、(2) Turing 完全なコードが正本になると「同じ正本 → 同じ成果物」の決定性を静的に保証できず、decision_priority 最上位 (再現性・決定性) と「任意 JS を実行しない」の Non Goals に矛盾する、(3) JSON Schema 検証と構造化エラー (エージェント自己修正の要) が型検査どまりになる、ため却下。
- **宣言的サブセットに制限した TS DSL (`defineScreen({...})` 型) を正本にする**: 制限を守らせる lint、書き戻しの AST 編集、読み込み時のコード評価 (サンドボックス) が必要になり、YAML に対する優位が IDE 補完程度しか残らない。IDE 補完は JSON Schema (yaml-language-server) で同等が得られるため却下。
- **POM 生成を Lower-Priority のまま据え置く**: IR がある限り後付けできるが、「仕様書と E2E の Page Object が同じ正本から出る」ことはプロダクトの差別化価値であり、MVP に含める判断とした。

## 影響

### 良い影響

- 仕様書と Page Object が同じ正本から生成され、画面変更への追従が「DSL 更新 → 再生成」に一本化される。
- 書き戻し・検証・決定性という中核ループの性質を一切損なわずに、Playwright 資産としての価値を提供できる。

### 悪い影響 / トレードオフ

- MVP の成果物が 1 種類増え、core/artifact の実装範囲が広がる。
- 生成コードを手で編集したくなる誘惑が残る (編集禁止ヘッダと再生成の規律で抑える。拡張はクラス継承など生成物の外側で行う)。
- agent-browser と Playwright の Locator 意味論の差 (Accessible Name の解決規則等) により、生成コードの動作が実行基盤と完全一致しない可能性がある。差異は codegen の対応表で吸収し、吸収できないものは生成時警告にする。

### 影響範囲

- 対象モジュール / package: workflow / artifact

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- 追補: `index` の 0/1 始まりの変換規則を [artifact-generation feature](../design/features/artifact-generation/DesignDoc_artifact-generation.md) へ追加した — 実施済み
- context / AI 向け設定更新要否:
  - [design/DesignDoc.md](../design/DesignDoc.md) のスコープ・成功条件・Lower-Priority Goals を更新する — 本 commit で実施
  - [design/features/artifact-generation/DesignDoc_artifact-generation.md](../design/features/artifact-generation/DesignDoc_artifact-generation.md) に POM 生成の規則を追記する — 本 commit で実施

## 関連ドキュメント / チケット

- [adr/0003-dsl-structure.md](0003-dsl-structure.md): DSL の文書構造
- [design/features/artifact-generation/DesignDoc_artifact-generation.md](../design/features/artifact-generation/DesignDoc_artifact-generation.md)
- spec / PR: なし
