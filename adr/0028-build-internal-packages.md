# ADR-0028: `packages/` の内部パッケージを `tsc --build` でビルドし、`exports` で `dist` を指す

## Status

承認

## Context

`packages/` の内部パッケージを、ビルドするか、ビルドせずにソースのまま使わせるかを決める必要がある。  
Turborepo は、前者を Compiled Package、後者を Just-in-Time Package と呼ぶ。  
出典: [Turborepo Internal Packages](https://turborepo.dev/docs/core-concepts/internal-packages)

決定に関わる事実は次のとおり。

- 内部パッケージを使う側が 2 系統ある。`apps/server` は Node で動き、`apps/web` は Vite で動く。
- 内部パッケージは 13 個ある。
- 設計の判断では、再現性と決定性を最も優先する。
  - [Design Doc の判断の優先順位](../design/DesignDoc.md#判断の優先順位)
- 依存のチェック（dependency-cruiser）は、`exports` が指す先を辿ってパッケージの間の依存を作る。

## Decision

`packages/` の内部パッケージはビルドする。  
`exports` は `dist` を指し、ビルドには bundler を使わずに `tsc --build` を使う。  
tsconfig では `composite`、`declaration`、`declarationMap` を有効にし、`outDir` を `dist` にする。  
出典: [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

ビルドしない構成を採らない理由は 3 つある。

- 使う側が 2 系統ある。ビルドしないと Node の側にトランスパイルの層が要り、解決の道筋が 2 本になる。再現性と決定性を最も優先する方針と合わない。
- パッケージが 13 個ある。ビルドしない構成では、依存する側の型エラーが使う側へ伝わり、発生元を特定する手間がかかる。
- ビルドの段がないため、turborepo のキャッシュを使えない。

ビルドする構成とビルドしない構成は、どちらか一方を選ぶ。  
`dist` を生成しながら `exports` が `src` を指す折衷は、誰も読まない成果物を作り続けることになるため採らない。

## Considered Options

| 選択肢                                                                                           | 強み                                                                                                                                   | 弱み                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **採用:** ビルドする（Compiled Package）。`exports` は `dist` を指し、`tsc --build` でビルドする | 使う側が Node でも Vite でも、`dist` という 1 つの道筋で解決する。型エラーが発生元のパッケージで止まる。turborepo のキャッシュを使える | 開発中に watch のプロセスが 3 つ動く（`tsc -b --watch`、`apps/server`、`apps/web`）                                      |
| ビルドしない（Just-in-Time Package）                                                             | —                                                                                                                                      | Node の側にトランスパイルの層が要り、解決の道筋が 2 本になる。型エラーが使う側へ伝わる。turborepo のキャッシュを使えない |
| `dist` を生成しながら、`exports` で `src` を指す                                                 | —                                                                                                                                      | 誰も読まない成果物を作り続ける                                                                                           |

## Consequences

### Positive

- 依存する側が見るのは常に `dist` で、`src` を直接見ない。依存のチェックも同じ道筋を辿る。
- 定義へのジャンプは、`declarationMap` で元のソースへ飛ぶ。

### Negative

- 開発中に watch のプロセスが 3 つ動く。
  - TypeScript 7 の `tsc --build` は `--builders` で参照するプロジェクトを並列にビルドでき、公式が monorepo で特に有効としているため、全体の再ビルドにはならない。
- `dist` がないと、依存のチェックでパッケージの間の依存が消える。clone した直後や `dist` を消した後は、ビルドしてからチェックする。
  - 手順は [context/conventions.md](../context/conventions.md#shared-configuration) にある。
