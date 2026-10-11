# ADR-0029: 型情報を使う lint を oxlint だけで行い、eslint を採らない

## Status

承認

## Context

lint は oxlint と oxfmt で行うと決めている。  
ADR-0001: [技術スタック](0001-tech-stack.md)

型情報を使う lint を何で行うか、eslint を併用するかを決める必要がある。  
決定に関わる事実は次のとおり。

- TypeScript は 7 を使う。
- typescript-eslint は、TypeScript 7 を型情報の元として扱えない。
- oxlint の type-aware は TypeScript 7 以上を要求し、typescript-eslint の type-aware の 61 のルールのうち 59 を実装している。
- 層の間の依存の向きは、dependency-cruiser でチェックする。
  - [context/codebase.md](../context/codebase.md#dependency-rules)

## Decision

型情報を使う lint は、oxlint だけで行う。  
eslint は採らない。

eslint を残す理由になりうるのは、層の依存の境界のルールである。  
依存の境界は dependency-cruiser が担うため、lint のプロセスと設定を 2 系統持つ利点がない。

## Considered Options

| 選択肢                                            | 強み                                                                                                                                     | 弱み                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **採用:** 型情報を使う lint を oxlint だけで行う  | TypeScript 7 を型情報の元にできる。typescript-eslint の type-aware のルールの 61 のうち 59 を実装している。プロセスと設定が 1 系統で済む | 別のパッケージ `oxlint-tsgolint` が要る                                              |
| typescript-eslint で型情報を使う lint を行う      | —                                                                                                                                        | TypeScript 7 を型情報の元として扱えない                                              |
| 層の依存の境界のルールのために、eslint を併用する | —                                                                                                                                        | 依存の境界は dependency-cruiser が担う。lint のプロセスと設定を 2 系統持つことになる |

## Consequences

### Positive

- lint の設定とプロセスが oxlint の 1 つになる。

### Negative

- oxlint の type-aware は `oxlint-tsgolint` を要求する。入っていないと、警告を 1 行出して終了コード 0 で終わる。
  - 外れないよう、ルートの `devDependencies` に宣言する。
  - [context/tech-stack.md](../context/tech-stack.md#toolchain)
