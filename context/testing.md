---
type: context
title: テスト
description: テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト
status: draft
governs:
  - packages/config/vitest/
  - packages/fixture-app/
  - e2e/
verified_commit: 44fda9132f6702cb66ed18224f22d878c85be4aa
---

# テスト

## Test Types and Guarantees

テストは 3 種類に分ける。  
種類の境界は、agent-browser を実際に起動するかどうかで引く。

| 種類 | ツール     | 置き場                                                     | 保証すること                                                                               | agent-browser     |
| ---- | ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| unit | vitest     | `packages/*/src/**/*.test.ts`、`apps/web/src/**/*.test.ts` | core の 5 つのモジュールの純粋なロジック、web の表示のロジック、agent の共通のマッピング層 | 使わない          |
| 統合 | vitest     | `apps/server/src/**/*.integration.test.ts`                 | app と adapter の結線。実行系を api から直接呼ぶ                                           | 実際に起動する    |
| E2E  | Playwright | `e2e/src/`                                                 | Web UI からの通しの操作。要素の選択、採番、承認、成果物の受け取り                          | fake に置き換える |

- unit と統合は、ディレクトリを分けずに、ファイル名の規約で分ける。
  - 振り分けは `packages/config/vitest/` の `base.ts` と `integration.ts` が持つ。
  - 各パッケージの `vitest.config.ts` は、共有の設定を参照するだけにする。
- unit は、core の判定の境界と決定性を保証する。対象は、機能ごとの Design Doc の Interface のチェックが挙げる。
- 統合は、このプロダクトの中心のロジックを保証する。冪等スキップ、前提の再検証と巻き戻し、Locator の解決、Snapshot の取得を、実際の agent-browser で確かめる。
  - Web UI を通さず、api から直接呼ぶ。
  - 置き場は合成ルートの `apps/server` にする。`packages/app` に置くと、app から adapter への依存を禁じるチェックで失敗する。
  - ADR-0023: [合成ルート](../adr/0023-composition-root.md)
- E2E は、Web UI の操作、表示、承認の流れを保証する。
- どの種類でも、同じ入力から同じ出力になる決定性を確かめる。成果物の生成、採番、差分の分類が対象になる。
- Port の実装を差し替えても core の振る舞いが変わらないことを、fake と実装の両方に同じ観点を通して確かめる。

コマンドは次のとおり。

- `pnpm test`: `packages/config/vitest/base.ts` を使い、統合を除く `*.test.ts` を実行する。
- `pnpm test:integration`: `packages/config/vitest/integration.ts` を使い、`*.integration.test.ts` を実行する。
- `pnpm e2e`: Playwright の E2E を実行する。
  - Playwright を依存に入れるまで、`pnpm e2e` は理由を出して失敗する。実行する対象のないタスクを成功させない。

## Runtime Requirements

テストを起動するときに、次を与える。  
環境変数の名前とポートの値は未定。

- 統合テスト: fixture の対象アプリの URL、agent-browser の起動の設定
- E2E: Workflow Server の URL、ローカルトークン
- 認証を伴うテスト: 認証プロファイルの名前
  - ADR-0022: [認証状態の保存](../adr/0022-auth-state-storage.md)

Workflow Server は 127.0.0.1 にだけ bind し、トークンを要求する。  
テストもこの契約に従う。  
ADR-0021: [agent interface の認可](../adr/0021-agent-interface-authz.md)

テストは、利用者の実際の状態を変えない。

- `XDG_STATE_HOME` を、テスト専用の一時ディレクトリへ向ける。
- OS のキーストアを fake に差し替える。

## Mocking and Test Data

- unit では、Port の相手を fake にする。Browser Port は fake に、AI Port は fake の provider にする。
- 統合では、agent-browser を実際に起動し、fixture の対象アプリを操作する。
- E2E では、Browser Port を fake に置き換える。実行系の挙動は統合テストで確かめる。

fixture の対象アプリは `packages/fixture-app` に置く。

- リポジトリの中に最小の対象アプリを置き、内容を固定する。外部のサイトを対象にしない。
- 対象アプリには次を含める。
  - 要素の種類: ボタン、入力欄、リンク、選択、テーブル
  - 状態の遷移: モーダルの開閉、タブの切り替え
  - Locator の解決が難しい形: アイコンだけのボタン、同じ名前の要素が複数ある画面
- 差分検知を確かめるために、意図的に変更を加えた版を別に持つ。
- 新しい fixture の対象を足す手順は未定。

## Required Tests

- 認可と秘密情報を扱う変更では、通ってはいけない要求を確かめる負のテストを足す。観点と種類は次のとおり。
  - トークン: なし、誤り、期限切れで拒否され、正しいときだけ通る。統合で確かめる。
  - bind するアドレス: 127.0.0.1 以外からの接続が届かない。統合で確かめる。
  - Origin と Host: 自分の待受ポート以外の Origin と Host が 403 になる。統合で確かめる。
  - 入力の検証: `../` を含む `authProfile`、`runId`、保存の鍵が拒否される。unit で確かめる。
  - 識別子の可搬性: 末尾がドットの名前と、Windows の予約デバイス名（`con` など）が拒否される。unit で確かめる。
  - ファイルの権限: トークンのファイルが 0600、置き場が 0700 で、緩ければ起動を中止する。統合で確かめる。
  - 終了時の後始末: プロセスの終了でトークンのファイルが消える。統合で確かめる。
  - 暗号化: 改ざんしたファイルの復号が失敗し、復号の結果を使わずに中止する。unit で確かめる。
  - 秘密情報を出さないこと: secret に指定した値が、StepResult、イベント、ログ、成果物のどれにも現れない。統合で確かめる。
  - 例外のメッセージ: 検証のエラーのメッセージに、入力の値そのものが含まれない。unit で確かめる。
- ほかの変更ごとに足すテストの種類は未定。
- 統合テストは手動でだけ実行する。`pnpm test` には含めない。
- CI でのテストの実行は MVP の対象外にする。
- リリースの前に通すテストは未定。
