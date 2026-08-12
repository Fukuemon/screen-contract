# ADR-0022: 認証状態を暗号化 Storage State で保持し実行時パラメータで指定する

## 状態

承認

## 決定日

2026-08-11

## 背景

- DesignDoc の Open Question「認証状態の保存方式」が認証画面対応前の決定事項として残っていた。提示されていた選択肢はローカル Profile、暗号化 Storage State、外部 Secrets の 3 つ。
- DesignDoc の設計上の前提として、認証情報を DSL・ログ・Snapshot・生成成果物へ平文で保存しないことは確定している。
- MVP はローカル実行・単一利用者を前提とし、クラウド利用とチーム / CI 実行はスコープ外である。したがって外部 Secrets Manager 連携は MVP では必要にならない。
- 対象アプリが MFA / SSO を要求する可能性は排除できない。汎用のプロダクトである以上、毎回ログイン手順を実行する方式は既定にできない。
- **ログインする利用者が変わると画面が変わる**。Baseline を認証プロファイルで区別しない場合、権限差に由来する差分が core/diff の検知結果を占め、検知したい変更が埋もれる。
- 認証プロファイルを DSL に持たせるか実行時パラメータにするかは、core/workflow の Schema に直接効く。実装開始前に決める必要がある。

## 決定

- 認証状態は **Storage State (cookie / localStorage の JSON) として保持する**。実体は OS のキーストア (macOS Keychain / libsecret / DPAPI) から得た鍵で暗号化してローカルに保存し、キーストアには鍵のみを置く。キーストアは小さい secret 向けであり、Storage State の JSON をそのまま格納する用途に適さないためこの分離を採る。
- 初回は、**人間がブラウザで手動ログインし、その時点の Storage State を取り込む導線**を用意する。MFA / SSO がある場合も初回だけ人間が通れば以降は再現できる。
- **認証プロファイルは実行時パラメータとする**。run の開始時に名前で指定し、DSL には書かない。
- **Baseline は `(screen, state, authProfile)` で識別する**。
- Browser Port の `createSession` は認証コンテキストを受け取る。実際の注入は adapter/browser の責務とする。
- Storage State の失効は `auth/expired` の機械可読コードを持つ構造化エラーとして返す。

取得から利用、失効までの流れを示す。

```mermaid
flowchart TD
    login["人間がブラウザで手動ログイン<br/>(MFA / SSO はここだけ通る)"]
    capture["Storage State を取り込む"]
    store[("暗号化して保存<br/>鍵は OS キーストア")]
    run["run 開始<br/>authProfile を名前で指定"]
    session["Browser Port の createSession へ注入<br/>(注入は adapter/browser の責務)"]
    exec["ステップ実行"]
    base["Baseline を<br/>(screen, state, authProfile) で識別"]
    expired["auth/expired を<br/>構造化エラーで返す"]

    login --> capture --> store
    run --> session
    store -.->|"復号"| session
    session --> exec
    exec --> base
    exec -.->|"失効を検知"| expired
    expired -.->|"取り込み直しを促す"| login
```

DSL には認証への参照を持たせない。同じ Screen 文書を複数の `authProfile` で実行できる。

## 代替案

- **ブラウザ Profile ディレクトリを丸ごと使い回す**: 実装はほぼ不要。しかしプロファイルの中身が不透明で、キャッシュ・拡張機能・履歴など認証と無関係な状態まで再現結果へ混入する。DesignDoc の成功条件「同じ DSL と同じ画面状態からは同じ成果物を生成する」と、[context/project.yml](../context/project.yml) の `decision_priority` 第 1 位である再現性・決定性に反するため却下。環境間で移植もできない。
- **credential を環境変数から渡して毎回ログイン手順を実行する**: 保存状態を持たないため監査は容易。しかし run のたびにログイン往復が入って遅く、MFA / SSO のある画面では成立しない。汎用の既定にはできないため却下。補助手段としては成立するため、将来の選択肢としては残す。
- **認証プロファイルを DSL (Workflow 文書または Screen 文書) に書く**: [adr/0011](0011-dsl-as-source-of-truth.md) の「DSL が正本」と最も一貫する。しかし同じ画面を別の権限で見る場合に文書が重複する。Screen 文書に書く場合は、要素 ID の同一性管理が文書をまたいで複雑になる。**認証コンテキストは実行環境の設定であり画面仕様ではない**という整理を採って却下。DesignDoc の前提「動的データは Fixture、Mock、固定入力のいずれかによって再現可能にする」と同じ扱いになる。
- **外部 Secrets Manager に置く**: チーム利用と CI 実行を前提にすれば妥当。しかしいずれも MVP のスコープ外であり、ローカル単一利用者に対して過剰。却下し、Future Work とする。

## 影響

### 良い影響

- 保存内容が Storage State の JSON に限定されるため、何が再現に寄与しているかを検査でき、環境間で移植できる。
- 認証プロファイルを実行時パラメータにしたことで、1 つの Screen 文書を複数の権限で実行して差分を見る使い方が、文書を複製せずに書ける。
- Baseline を認証プロファイルで区別するため、権限差に由来する差分がノイズとして混入しない。
- 平文の認証情報がリポジトリと生成成果物に入らない。

### 悪い影響 / トレードオフ

- 初回の取り込み導線を実装する必要がある。ブラウザ Profile を使い回す案にはないコストである。
- Storage State には期限がある。失効時は run が失敗するため、`auth/expired` を検知して取り込み直しを促す導線が要る。
- OS ごとにキーストアの API が異なるため、3 系統の実装または抽象化ライブラリの採用が必要になる。

### 影響範囲

- 対象モジュール / package: execution / diff / artifact / infra

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [design/DesignDoc.md](../design/DesignDoc.md) の Open Question「認証状態の保存方式」を削除する
  - [design/features/workflow-dsl/DesignDoc_workflow-dsl.md](../design/features/workflow-dsl/DesignDoc_workflow-dsl.md) に、DSL が認証を持たない決定とその理由を記載する (Schema の決定事項)
  - [design/features/execution/DesignDoc_execution.md](../design/features/execution/DesignDoc_execution.md) の Browser Port 契約に認証コンテキストを追加し、エラーコードに `auth/expired` を追加する
  - [design/features/change-detection/DesignDoc_change-detection.md](../design/features/change-detection/DesignDoc_change-detection.md) と [design/features/artifact-generation/DesignDoc_artifact-generation.md](../design/features/artifact-generation/DesignDoc_artifact-generation.md) の Baseline 識別子に `authProfile` を反映する
  - [context/infrastructure.md](../context/infrastructure.md) に保存場所、暗号化方式、取り込み導線、失効時の扱いを記載する

## 関連ドキュメント / チケット

- [adr/0011](0011-dsl-as-source-of-truth.md): YAML DSL を唯一の正本とする判断
- [adr/0013](0013-agent-browser-runtime.md): MVP のブラウザ実行基盤
- [design/features/execution/DesignDoc_execution.md](../design/features/execution/DesignDoc_execution.md): Browser Port の契約
- [context/infrastructure.md](../context/infrastructure.md): secret の置き場と扱い
- spec / PR: なし
