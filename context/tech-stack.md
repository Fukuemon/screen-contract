---
type: context
title: 技術スタック
description: 採用しているツールの役割とバージョンの所在、バージョンの更新の確認、新しいモジュールの作り始め。バージョンそのものと選んだ理由は書かない
status: draft
governs:
  - mise.toml
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.json
  - packages/config/tsconfig/
verified_commit: 44fda9132f6702cb66ed18224f22d878c85be4aa
---

# 技術スタック

## Toolchain

ツールのバージョンは、ルートの `package.json` の `packageManager` と `devDependencies`、各パッケージの `package.json`、`pnpm-lock.yaml` にある。  
選定の判断は ADR が持つ。  
ADR-0001: [技術スタック](../adr/0001-tech-stack.md)

- pnpm: workspace でパッケージを管理する。
  - pnpm の設定は `pnpm-workspace.yaml` に書き、`.npmrc` には認証と registry だけを書く。
- turborepo: パッケージ単位に分かれるタスクを、依存の順に実行する。
- TypeScript 7: 型チェックとビルドの CLI `tsc` を提供する。パッケージ名は `@typescript/native` に置き換えて入れている。
- TypeScript 6: 言語サービスの programmatic API を要求するツールのために、`typescript` の名前で併置する。
  - 配るのは実行ファイル `tsc6` と `tsserverlibrary` で、実行ファイル `tsserver` は含まない。
  - tsserver が要るエディタは、エディタが持つ TypeScript を使うか、別に用意する。
- oxlint: lint を行う。型情報を使う lint も oxlint だけで行う。
  - type-aware のルールは `oxlint-tsgolint` を要求するため、ルートの `devDependencies` に宣言する。
- oxfmt: TypeScript と JavaScript を整形する。
- prettier: Markdown、YAML、JSON を整形する。
- vitest: unit テストと統合テストを実行する。
- Playwright: E2E テストを実行する。
- dependency-cruiser: パッケージ間の依存の向きをチェックする。
- knip: 使っていない export、依存、ファイルを検出する。
- lefthook: Git のフックからチェックを実行する。
- Hono: HTTP と WebSocket のアプリケーションを組み立てる。listen は合成ルートが行う。
  - ADR-0024: [HTTP framework](../adr/0024-http-framework.md)
- pixelmatch と ssim.js: 画像の Pixel Diff と知覚差分を計算する。
  - ADR-0025: [画像差分のライブラリ](../adr/0025-image-diff-library.md)
- agent-browser: ブラウザを操作する。npm の依存として同梱し、バージョンを lockfile で固定する。
  - ADR-0027: [agent-browser の同梱](../adr/0027-agent-browser-bundling.md)
- mise: Node のバージョンを `mise.toml` で固定する。
  - Node は LTS の偶数系に固定する。
  - Node のバージョンの宣言は `mise.toml` だけに置き、`.nvmrc` は置かない。

ルートのコマンドは `package.json` の `scripts` にある。  
役割は次のとおり。  
テストのコマンドは [testing.md](testing.md) に、どれを turborepo に載せるかは [conventions.md](conventions.md#shared-configuration) にある。

- `pnpm dev`: `tsc --build --watch` を実行する。
- `pnpm build`: 全パッケージをビルドする。
- `pnpm typecheck`: solution tsconfig に `tsc --build` を実行する。
- `pnpm lint`: oxlint の type-aware と `typecheck` を実行する。
- `pnpm format`: oxfmt と prettier で整形を確かめる。書き換えるときは `pnpm format:write` を使う。
- `pnpm check`: `lint`、`format`、`test`、`build` を順に実行する。
- `pnpm boundaries`: ビルドしてから dependency-cruiser を実行する。
- `pnpm knip`: knip を実行する。
- 依存の追加: `pnpm add --filter <パッケージ名>` を使う。

## Upgrade Checks

- Node を奇数系に上げない。dependency-cruiser は奇数系の Node で起動を拒否する。
- TypeScript 7 では、次の 3 つの変更を踏む。
  - `types` の既定が `[]` になった。`@types/node` を入れても、`"types": ["node"]` の明示が要る。
  - `baseUrl` がなくなった。`paths` はプロジェクトのルートからの相対で書く。
  - `tsc` にファイルのパスを渡せない。変更したファイルだけを型チェックする構成は組めない。
- oxlint の type-aware は TypeScript 7 以上を要求する。typescript-eslint は TypeScript 7 を型情報の元として扱えない。
- `oxlint-tsgolint` が入っていないと、oxlint の type-aware は警告を 1 行出して終了コード 0 で終わる。
- dependency-cruiser の設定を 1 つ間違えると、違反を 1 件も検出せずに成功する。チェックが失敗しないことは、設定が正しいことを意味しない。
  - 満たすべき設定は [conventions.md](conventions.md#shared-configuration) にある。
- バージョンを上げた後の動作確認の方法は未定。

## Scaffolding

- 新しいモジュールは、公式の create コマンドがあればそれで作り始める。作った後に、このリポジトリの命名、ルートのコマンド、共有の設定に合わせる。
- `packages/` のパッケージはビルドする。turborepo の Compiled Package の形にする。
  - `exports` は `dist` を指し、ビルドには bundler を使わずに `tsc --build` を使う。
  - tsconfig は `packages/config` の共有の設定を `extends` し、`composite`、`declaration`、`declarationMap` を有効にして `outDir` を `dist` にする。
  - `dist` を生成しながら `exports` で `src` を指す形にしない。
- パッケージの名前は `@screen-contract/<module>` にする。
- 全パッケージを `"private": true` にする。publish しないため、バージョンを管理するツールを入れない。
- 公開する範囲は `exports` で固定する。内部のファイルへの deep import を成り立たせない。
- 置き場と依存の規則は [codebase.md](codebase.md) に、共有の設定の扱いは [conventions.md](conventions.md#shared-configuration) にある。
