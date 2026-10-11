---
type: context
title: コードと文書の規約
description: 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
status: draft
governs:
  - package.json
  - turbo.json
  - lefthook.yml
  - .oxlintrc.json
  - .oxfmtignore
  - .prettierignore
  - .dependency-cruiser.cjs
  - knip.json
  - packages/config/
verified_commit: 44fda9132f6702cb66ed18224f22d878c85be4aa
---

# コードと文書の規約

## Naming

- パッケージの名前は `@screen-contract/<module>` にする。
- コンポーネントの名前は PascalCase にする。
- 識別子、型、API の名前は、日本語に訳さずに原語のまま使う。
- 利用者に見える文字列リテラルは、コメントや文書を日本語にするときにも変えない。CLI の出力、エラーメッセージ、API の値が当たる。
  - これらは観測できる契約で、テストが固定している。

## Comments

コードに書いたことを、コメントに書き写さない。  
情報は次のように分けて置く。

- コード: どう実現しているか
- テストのコード: 何が成り立つべきか
- コミットと pull request: なぜこの変更をしたか
- コードの中のコメント: なぜ他の方法を採らなかったか
- 関数と型の doc: 何をするものか

コードの中のコメントには、主に「なぜ他の方法を採らなかったか」を書く。  
書かないと、後から単純に書き換えられて動かなくなる。

- 書かないもの: コードを言い換えただけの行、型を繰り返すだけの doc、変更の経緯、issue の番号
- コメント、文書、コミット、pull request は日本語で書く。
- コメントから spec と issue を引用しない。spec は issue を閉じるときに消す。
- 理由を残すときのリンク先は、ADR、`context/` の文書、機能ごとの Design Doc に限る。

## Documents

文書の書き方のうち、このリポジトリだけの規則は未定。

## Shared Configuration

共有の設定は次のように置く。  
各パッケージは、共有の設定を `extends` するか参照するだけにする。

- `packages/config`: tsconfig の base、node、browser と、vitest の base、integration を `exports` で配る。
  - `packages/config` も、他のパッケージと同じくビルドする。
- リポジトリのルート: `turbo.json`、`pnpm-workspace.yaml`、oxlint、整形、依存のチェック、未使用の検出の設定を置く。
  - oxlint の設定は `packages/config` に置かず、ルートの 1 つの設定の `overrides` で層ごとのルールを書く。
- パッケージ固有の上書きは、そのパッケージでだけ意味を持つ設定に限る。
  - 同じ上書きが 2 つのパッケージで重なったら、共有の設定へ移す。

整形のツールは、扱うファイルを分ける。

- oxfmt は `.oxfmtignore` を使い、TypeScript と JavaScript を整形する。
  - oxfmt には `--ignore-path .oxfmtignore` を必ず渡す。渡さないと `.prettierignore` を読み、担当の `.ts` を飛ばす。
- prettier は `.prettierignore` を使い、Markdown、YAML、JSON を整形する。
  - prettier はパスを明示して渡しても `.prettierignore` に従うため、TypeScript を二重に整形しない。

品質のチェックは、次の 3 つのツールで分担する。

| ツール             | 設定                      | チェックすること                                 | チェックしないこと               |
| ------------------ | ------------------------- | ------------------------------------------------ | -------------------------------- |
| oxlint             | `.oxlintrc.json`          | 通常の lint と、型情報を使う lint                | 層とディレクトリごとの依存の向き |
| dependency-cruiser | `.dependency-cruiser.cjs` | 層の依存の向き、循環する依存、宣言していない依存 | export ごとの未使用              |
| knip               | `knip.json`               | 使っていない export、型の export、依存、ファイル | 依存の向き                       |

ルートのタスクは、パッケージ単位に分かれるものだけを turborepo に載せる。

- turborepo に載せるのは `build`、`test`、`test:integration`、`e2e` である。
  - `test` と `test:integration` は、依存するパッケージの `dist` を使うため `^build` に依存する。
  - `e2e` は `@screen-contract/server#build` に依存する。
  - 成果物を生まないタスクどうしをつながない。
- リポジトリ全体を 1 度に見るものは、ルートで 1 つのプロセスとして実行する。turborepo に載せると、実装するパッケージが 1 つもないタスクがエラーを出さずに成功する。
  - `typecheck` と `dev` は、ルートの solution tsconfig に `tsc --build` を実行する。
  - `lint` と `format` は、ルートの設定で oxlint、oxfmt、prettier を実行する。
  - `boundaries` と `knip` は、リポジトリ全体のグラフを見る。
- `typecheck` に別の `--noEmit` を足さない。composite なプロジェクトでは、型チェックと `.d.ts` の生成が同じ処理になる。

Git のフックで動かすコマンドは `lefthook.yml` にあり、次の規則で書く。

- 型チェックを pre-commit に置かない。`tsc` にファイルのパスを渡せないため、変更したファイルだけを型チェックできない。型チェックは `lint` に含め、pre-push で実行する。
- pre-commit の oxlint には `--type-aware` を付けない。type-aware はプログラム全体の型情報を要求し、変更したファイルだけでは検出しない。
- 整形した結果は、lefthook の `stage_fixed` で staging へ戻す。`git add` を書くと、一部だけ stage したファイルの未 stage の変更までコミットに入る。
- Node を使うコマンドは `scripts/run-with-node.sh` を通して呼ぶ。
  - Git のフックは mise を有効にしていないシェルで動き、システムの Node を使うため、dependency-cruiser が起動を拒否する。
  - `scripts/run-with-node.sh` は、mise がない環境ではコマンドをそのまま実行する。

dependency-cruiser の設定は、次のどれかを外すとチェックが成り立たなくなる。

- Node を LTS に固定する。奇数系では dependency-cruiser が起動しない。
- `exports` と `conditionNames` は `enhancedResolveOptions` の下に置く。外に置くと設定の検証で弾かれる。
- `dist/` を `exclude` しない。除くと、パッケージの間の依存がすべて消える。
- `boundaries` はビルドしてから実行する。clone した直後や `dist` を消した後は、パッケージの間の依存が消える。
- `includeOnly` で外部の依存を絞らない。解決できなかった依存が評価の前に捨てられ、`not-unresolvable` と `no-non-package-json` が発火しなくなる。
- 走査の起点は、各パッケージの `src` と `packages/config/vitest` に絞る。広げると、型を消した成果物を二重に辿る。

## Check Exclusions

- チェックからの除外は、各ツールの設定に集める。ソースにチェックを無効にするコメントを書かない。
- 例外が要るときは、ルールそのものを見直す。除外の理由は ADR かこの節に残す。
- dependency-cruiser の `--ignore-known` による baseline は作らない。違反のない状態を保つ。
- knip の `includeEntryExports` は `false` のままにする。
  - 各パッケージの `src/index.ts` の export は、`exports` で公開する契約そのものになる。
  - エントリ以外のファイルの未使用の export は、`false` のままでも検出される。
  - 各パッケージに実装が入ったら `true` に切り替える。内部のパッケージは全部 `private` で、公開する API を持たない。
- `.prettierignore` は TypeScript と JavaScript を除き、`.oxfmtignore` はそれ以外を除く。
