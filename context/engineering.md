---
type: context
title: Engineering Conventions
description: コメント境界・shared config・root task・quality gate の横断規約
keywords: [engineering, quality gate, code comment, shared config]
governs:
  - <実装ディレクトリ確定後に記入>
verified_commit: unverified
---

# Engineering Conventions

shared config / root task / repository quality gate の境界規約。toolchain 一覧は [toolchain.md](toolchain.md)、プロジェクト固有コマンドは [context/project.yml](project.yml)。

## Code Comment Boundary

### 何をどこに書くか

情報の置き場を次のとおり分ける。**コードから読み取れることをコメントに書き写さない。**

| 置き場           | 書くこと                                               |
| ---------------- | ------------------------------------------------------ |
| コード           | **How** — どう実現しているか。コード自身が語る         |
| テストコード     | **What** — 何が成り立つべきか                          |
| commit / PR      | **Why** — なぜこの変更をしたか                         |
| コード内コメント | **Why not** — なぜ他の手を採らなかったか               |
| 関数・型の doc   | **What** — 何をするものか (公開 API の doc 規約に従う) |

コード内コメントの主役は **Why not**。「どう動くか」はコードを読めば分かるが、
「なぜ素直な方法を採らなかったか」は読んでも分からない。書かないと後から
不用意に「単純化」されて壊れる。

書かないもの: コードを言い換えただけの行、型を繰り返すだけの doc、
変更の経緯や issue 番号 (commit と ADR が持つ)。

### 言語

- コード内コメント / ドキュメント / commit / PR は**日本語**で書く。
- **利用者に見える文字列リテラル (CLI 出力 / エラーメッセージ / API の値) は変えない。**
  観測可能な契約であり、テストが固定している。
- 識別子・型名・API 名は原語のまま使う。

### 参照の張り方

- **コメントから spec / issue を引用しない。** spec は issue close 時に削除される
  作業文書であり、コードから参照すると宙に浮いたリンクが残る。
- 理由を残すときのリンク先は ADR と長く残る決まりのドキュメント (`adr/*.md` /
  `context/*.md` / feature doc) に限る。

## Shared Config Boundary

共有設定は `packages/config` が `exports` で配り、各パッケージは `extends` か参照だけを持つ。

| 置き場            | 対象                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `packages/config` | tsconfig の base / node / browser、oxlint の base、vitest の base |
| リポジトリルート  | `turbo.json`、`pnpm-workspace.yaml`、依存境界の検査 config        |
| 各パッケージ      | 上記を `extends` / 参照する数行のみ                               |

パッケージ固有の上書きは、そのパッケージでしか意味を持たない設定に限る。**同じ上書きが 2 パッケージで重複したら共有設定へ引き上げる**。

pnpm の設定は `pnpm-workspace.yaml` に書く。`.npmrc` は認証と registry のみを扱う (pnpm の現行仕様)。

## Root Task Boundary

root から束ねるのは [project.yml](project.yml) の `commands` と 1 対 1 のタスクで、turborepo 経由で実行する。

turborepo のタスク依存は次のとおり。`typecheck` と `test` が `^build` に依存するのは、依存パッケージの `.d.ts` と `dist` を必要とするためである。成果物を生まないタスク同士を繋がない。

```jsonc
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true },
  },
}
```

root の `test` から外すもの:

- **統合テスト** (`test:integration`) — agent-browser を実起動するため。直実行と pre-push に置く
- **E2E** (`e2e`) — Playwright と Workflow Server の起動を伴うため

自動検査の実行点は次のように分ける。実行時間で分けている。

| 実行点     | 通すもの                                                         | 理由                              |
| ---------- | ---------------------------------------------------------------- | --------------------------------- |
| pre-commit | oxfmt、oxlint (型情報を使わないルール)                           | 数百ミリ秒で終わる                |
| pre-push   | `check` (lint + format + test + build)、dependency-cruiser、knip | 秒オーダー。commit のたびには重い |

**pre-commit に型検査を置かない。** TypeScript 7 は `tsc` にファイルパスを渡せないため、変更ファイルだけを型検査する構成が組めない ([toolchain.md](toolchain.md))。型検査は `lint` に含めて pre-push で通す。

## Repository Quality Gate

3 つのツールで担当を分ける。役割は重複しない。

| ツール                 | 正本 config               | 担当                                          | 担当しないこと                 |
| ---------------------- | ------------------------- | --------------------------------------------- | ------------------------------ |
| **oxlint**             | `.oxlintrc.json` (ルート) | 通常の lint。native ルールと type-aware       | 層やディレクトリ単位の依存方向 |
| **dependency-cruiser** | `.dependency-cruiser.cjs` | 層の依存方向、循環依存、依存の宣言漏れ        | export 粒度の未使用検出        |
| **knip**               | `knip.json`               | 未使用の export / 型 export / 依存 / ファイル | 依存の方向                     |

tsconfig と vitest の共有設定は `packages/config` が持つ。oxlint の設定はパッケージごとに分けず、ルート 1 本と `overrides` で層別のルールを表現する。

### eslint を採らない

型情報を使う lint は oxlint だけを使う。理由は 2 つ。

- typescript-eslint は TypeScript 7 を型情報源として未対応である
- oxlint の type-aware は TypeScript 7 以上を要求し、typescript-eslint の type-aware 61 ルールのうち 59 を実装している

eslint を残す理由になりうるのは層の依存境界ルールだが、それは dependency-cruiser が担う。プロセスと設定を 2 系統維持する利得がない。

### 依存境界の検査

依存方向を dependency-cruiser に置くのは、**type-only と value の import を区別できる**ためである (`dependencyTypesNot: ["type-only"]`)。[architecture.md](architecture.md) が「core → 他の core へは型の参照のみ」「adapter → Port の型を通じてのみ」と定めており、この区別ができないと規約を検査できない。パッケージ分割だけでは両者を区別しないため、粒度を細かくしても代替にならない。

ルールは [architecture.md](architecture.md) の禁止経路と 1 対 1 で対応させる。

| ルール名                        | from                       | to                                                             |
| ------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `no-circular`                   | 全体                       | `circular: true`                                               |
| `packages-not-to-apps`          | `^packages/`               | `^apps/`                                                       |
| `interface-not-to-core-adapter` | `^packages/(api\|agent)/`  | `^packages/(core-\|adapter-\|domain)`                          |
| `app-not-to-adapter`            | `^packages/app/`           | `^packages/adapter-`                                           |
| `core-not-outward`              | `^packages/core-`          | `^packages/(adapter-\|app/\|api/\|agent/)`                     |
| `core-cross-module-type-only`   | `^packages/core-([a-z]+)/` | 他の core + `dependencyTypesNot: ["type-only"]`                |
| `adapter-only-port-types`       | `^packages/adapter-`       | `^packages/(core-\|app)` + `dependencyTypesNot: ["type-only"]` |
| `no-non-package-json`           | 全体                       | 未宣言の外部依存                                               |
| `not-to-dev-dep`                | ランタイムコード           | devDependencies                                                |

`no-restricted-imports` による層別の禁止を oxlint 側にも書く。エディタ上で即座に赤くなる一次防御であり、**正本は dependency-cruiser 側**とする。

### 除外方針

- 除外は各ツールの config に集約する。**ソースへ無効化コメントを書かない**。書くと検査が意味を失う
- 例外が要るときはルールそのものを見直し、理由を ADR か本書に残す
- 実装 0 行から始めるため、dependency-cruiser の `--ignore-known` による baseline は作らない。**最初から違反ゼロで始める**

### scaffold 時に確認する項目

- dependency-cruiser の正規表現キャプチャが `to` 側の否定先読みで機能するか。機能しなければ `core-cross-module-type-only` を core 5 モジュールぶんの 5 ルールへ展開する
- `dependencyTypesNot: ["type-only"]` が `tsPreCompilationDeps: true` の下で期待どおり判定するか
- dependency-cruiser の pnpm workspace 対応 (FAQ に肯定的な記述はあるが、pnpm 固有の記載は公式ドキュメントに見当たらない)
- oxlint の `overrides` と `no-restricted-imports` の互換範囲
