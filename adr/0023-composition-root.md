# ADR-0023: 合成ルートを apps/server に置き app から adapter への依存を禁じる

## Status

承認

## Context

Port の実装を誰が選んで app へ渡すかを決める必要がある。  
Store Port は、保存が機能をまたぐため app に置き、app に Port を置く例外はこの 1 つに限る。  
この配置のまま app が core と adapter に依存すると、`adapter/store` と `app` が互いを参照し、パッケージの境界を引いたときにビルドの順が決まらない。  
出典: [context/codebase.md の Dependency Rules](../context/codebase.md#dependency-rules)

- `adapter/store` は、Store Port の型を得るために `app` を参照する。
- `app` は、Store Port の実装を得るために `adapter/store` を参照する。

Browser Port はこの問題を持たない。  
`core/execution` が定義し、`adapter/browser` がそれだけを参照するため、向きが一方になる。  
循環は、Store Port が `app` にあることだけから起きる。

E2E では Browser Port を fake に置き換える。  
`app` が adapter を直接参照していると、この差し替えは `app` の内部の実行時の分岐になり、テストのためだけの処理が本番のコードに残る。  
出典: [context/testing.md の Mocking and Test Data](../context/testing.md#mocking-and-test-data)  
ADR-0030: [E2E では Browser Port を fake に置き換え、実行系は統合テストで確かめる](0030-fake-browser-port-in-e2e.md)

monorepo は pnpm workspace で構成する。  
ADR-0001: [技術スタックを TypeScript monorepo（TanStack Start、中間層なし）にする](0001-tech-stack.md)

core は機能単位に分け、Ports and Adapters を採っている。  
ADR-0014: [core を機能単位に分割し Ports and Adapters を採用する](0014-core-split-ports-adapters.md)

`apps/` と `packages/` の役割は、採るツールの公式の文書が次のように定めている。

- Turborepo は、2 種類のパッケージを次のように定義する。
  - Application Package: 「will be deployed from your workspace」
  - Library Package: 「aren't independently deployable.」  
    「Instead, they support the Application Packages to create the final deployables」
  - 出典: [Package types](https://turborepo.dev/docs/core-concepts/package-types)
- Vercel が turborepo のリポジトリに同梱する skill は、次の 2 文を書いている。
  - 「Apps shouldn't be dependencies of other packages」
  - 「Applications are the 'endpoints' of your package graph」
  - 出典: [Turborepo best practices（Vercel 公式 skill）](https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/best-practices/RULE.md)
- Nx は、次の 2 つを定める。
  - 「an application project contains the deployable shell: entry point, configuration, and composition of features.」  
    「The features themselves live in libraries」
  - 「the majority of your code in `libs/`, with `apps/` reduced to wiring」
  - 出典: [Nx Folder Structure](https://nx.dev/docs/kb/folder-structure)

つまり、合成（composition）と配線（wiring）を担い、ほかから依存されない層は、`apps/` に置くものの定義そのものである。

## Decision

- `app` は adapter を参照しない。Port の実装は合成ルートが注入する。
  - `app` が公開するのは `createUseCases(deps)` の形の factory で、`deps` の型は Port だけで作る。
- 合成ルートを `apps/server` に置き、adapter の具象を選ぶ唯一の場所にする。
- `apps/server` は全部の層を参照してよい。`apps/` が、ほかから依存されない終端であることと引き換えに成り立つ。
- adapter は、自身が実装する Port の定義元（core か app）へ型だけで依存し、誰からも依存されない。`apps/server` だけが adapter を知る。この形で循環が消える。
- 禁止する依存に、app から adapter への依存を加える。Store Port の循環を生み、fake の差し替えが実行時の分岐になるためである。

依存の向きと禁止する依存は [context/codebase.md](../context/codebase.md#dependency-rules) に、層と依存の図は [Design Doc の依存の向き](../design/DesignDoc.md#依存の向き) にある。

## Considered Options

| 選択肢                                                                         | 強み                                                                                                                                                                                           | 弱み                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **採用:** 合成ルートを `apps/server` に置き、app から adapter への依存を禁じる | 依存のグラフに循環がなくなる。fake の差し替えが合成ルートの引数だけで済む。4 層の依存の規約が `apps/` と `packages/` の公式の役割の分け方と一致する。adapter の具象を選ぶ場所が 1 か所に閉じる | `app` の公開 API が factory の形に固定される。依存を注入し忘れても、コンパイル時に見つかるとは限らない。`apps/server` だけは依存のチェックの対象外になる                          |
| Store Port を core のどれかへ移す                                              | 循環が消える                                                                                                                                                                                   | Store Port は保存が機能をまたぐことを理由に app に置いており、core の 1 つに置くとほかの core から参照できない。「例外はこの 1 つに限る」という但し書きの前提が失われる           |
| Port の型だけを持つパッケージ（`app-contract`）を切り出す                      | `adapter/store → app-contract ← app` の形になり、循環が消える                                                                                                                                  | E2E で fake に差し替えるために合成ルートはどのみち要り、合成ルートがあれば `app-contract` は要らない。パッケージを 1 つ増やす利点がない                                           |
| adapter を `app` パッケージの内部のディレクトリに入れる                        | パッケージの間の循環が消える                                                                                                                                                                   | adapter が差し替えられる独立した単位でなくなり、Ports and Adapters を採った意義が薄れる。実行基盤の将来の差し替え（Browser Port の別の実装）が、pnpm の依存のグラフに現れなくなる |
| 規約を変えず、`app` が adapter を参照する                                      | —                                                                                                                                                                                              | 循環に加えて、E2E の fake の差し替えが `app` の内部の実行時の分岐になり、テストのためだけの処理を本番のコードへ持ち込む                                                           |

## Consequences

### Positive

- パッケージの依存のグラフに循環がなくなり、pnpm と turborepo がビルドの順を決められる。
- fake の差し替えが合成ルートの引数だけで済み、`app`、`api`、`agent` にテストのための分岐が入らない。
- 4 層の依存の規約が、`apps/` と `packages/` の公式の役割の分け方と一致するため、規約を独自に説明せずに済む。
- adapter の具象を選ぶ場所が 1 か所に閉じるため、実行基盤や保存の方式の差し替えが `apps/server` の変更だけで済む。

### Negative

- `app` の公開 API が factory の形に固定される。use case を呼ぶ側は依存を組み立ててから使うことになり、素朴な import より 1 段増える。
- 依存を注入し忘れても、コンパイル時に見つかるとは限らない。`deps` の型を Port だけで作り、省略できる依存を作らない運用が要る。
- `apps/server` が全部の層を知るため、この 1 つのパッケージだけは依存のチェックの対象外になる。ここに use case のロジックが入っていないことは、別の手段（行数の監視、レビュー）で見る必要がある。
