---
type: context
title: Testing Conventions
description: テスト 3 層 (unit / 統合 / E2E) の責務分担、fixture 対象アプリ、実行時の起動契約
keywords: [testing, unit test, 統合テスト, e2e, fixture, テスト方針]
governs:
  - <実装ディレクトリ確定後に記入>
verified_commit: unverified
---

# Testing Conventions

テストの横断規約。feature 固有のテスト観点は各 [design/features/](../design/features/) に置く。プロジェクト固有のテストコマンドは [context/project.yml](project.yml) を正本とする。

## テスト責務の分担

3 層に分ける。層の境界は **agent-browser を実起動するか** で引く。

| 種別 | ツール     | 配置                         | 主担当範囲                                                                    | agent-browser |
| ---- | ---------- | ---------------------------- | ----------------------------------------------------------------------------- | ------------- |
| unit | vitest     | 各 package 内                | core 5 モジュールの純粋ロジック、web の表示ロジック、agent の共通マッピング層 | 使わない      |
| 統合 | vitest     | `packages/app/` 配下のテスト | app + adapter の結線。実行系を api から直接叩く                               | **実起動**    |
| E2E  | Playwright | リポジトリルートの `e2e/`    | Web UI からの通し操作。要素選択、採番、承認、成果物の受け取り                 | fake で置換   |

配置の具体パスは scaffold 作成時に確定する。

### unit test

core 層は外部依存を持たない純粋ロジックとして設計するため、unit test の主対象になる。判定境界と決定性がここで担保される。各 feature doc のテスト観点が対象を列挙する。

Port の相手は fake 実装を使う。Browser Port は fake、AI Port は fake provider とする。

### 統合テスト

**本プロダクトの中核ロジックはここで検証する。** 冪等スキップ、前提の再検証と巻き戻し、Locator の解決、Snapshot の取得を、実際の agent-browser を起動して確かめる。

Web UI を介さず api から直接叩く。ブラウザスタックが 1 段で済み、実行系の挙動を直接観察できる。

### E2E

Web UI の操作、表示、承認フローを検証する。**Browser Port は fake へ置き換える**。

理由は入れ子ブラウザを避けるためである。素直に組むと Playwright がブラウザで Web UI を操作し、その Web UI が agent-browser を起動し、agent-browser がさらに対象アプリを操作する形になり、ブラウザスタックが 2 段重なる。起動コストと不安定さが乗る割に、実行系の検証は統合テストが既に持つ。

Playwright を採るのは、Web UI が TanStack Start であること、および本プロダクト自身が Playwright の Page Object Model を出力するため ([adr/0006](../adr/0006-playwright-pom-output.md))、出力形式の妥当性確認を兼ねられることによる。

## fixture 対象アプリ

統合テストと、将来の実ブラウザ検証には、操作する相手が要る。

- リポジトリ内に最小の対象アプリを置き、**内容を固定する**。外部サイトを対象にしない
- 対象は、要素の種別 (ボタン、入力欄、リンク、選択、テーブル)、状態遷移 (モーダルの開閉、タブ切り替え)、Locator の解決が難しい形 (アイコンのみのボタン、同名要素の複数出現) を含める
- 差分検知の検証用に、意図的に変更を加えた版を別途持つ

固定するのは再現性・決定性を最優先とするため ([context/project.yml](project.yml) の `decision_priority`)。外部サイトを対象にすると、こちらの変更と相手の変更を区別できない。

## テスト runtime contract

起動時に次を与える。具体値は scaffold 作成時に確定する。

| 対象             | 与えるもの                                                         |
| ---------------- | ------------------------------------------------------------------ |
| 統合テスト       | fixture 対象アプリの URL、agent-browser の起動設定                 |
| E2E              | Workflow Server の URL、ローカルトークン                           |
| 認証を伴うテスト | 認証プロファイル名 ([adr/0022](../adr/0022-auth-state-storage.md)) |

Workflow Server は 127.0.0.1 のみに bind し、トークンを要求する ([adr/0021](../adr/0021-agent-interface-authz.md))。テストもこの契約に従う。

新しい対象を追加する手順は scaffold 作成時に書く。

## 横断テスト方針

- **決定性を検証対象にする。** 同じ入力から同じ出力になることを、成果物生成・採番・差分分類の各層で確かめる。これは本プロダクトの中核価値であり、テストで担保する
- Port の実装を差し替えても core の振る舞いが変わらないことを、fake と実装の両方で同じ観点を通して確かめる
- 継続的インテグレーション (CI) 上での実行は実用最小限の製品 (MVP) の対象外とする (DesignDoc の Future Work)

## 今後の拡張: ユースケース手順書に沿った検証

E2E で Browser Port を fake に置き換えるため、**通しの実挙動は MVP のテストで検証されない**。実装を進めて必要と判断した時点で、次を足す。

- ユースケースごとに手順書を用意し、それを正本として検証する。手順書は「対象アプリを開く、要素を選択する、名前を付ける、成果物を生成する」のように、利用者の操作単位で書く
- 手順書に沿って実際のブラウザ操作を行う検証を足す。人間が使う Web UI の操作は、AI エージェントも同じ use case を通るため ([adr/0017](../adr/0017-agent-draft-boundary.md))、実操作での確認に意味がある
- 手順書は E2E のテストケースと、利用者向けドキュメントの両方の入力になる

導入時期と手順書の置き場は、Web UI の実装が動いてから決める。
