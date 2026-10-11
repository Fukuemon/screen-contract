# ADR-0001: 技術スタックを TypeScript monorepo（TanStack Start、中間層なし）にする

## Status

承認

## Context

interface、app、core、adapter の 4 層の構造と、機能単位の core の分割を前提に、実装の言語とツールを決める必要がある。  
層の構造は [Design Doc の層の分け方](../design/DesignDoc.md#層の分け方) にある。

- 実行基盤の agent-browser は Rust 製の CLI である。
  - 操作の SDK、組み込みの dashboard（Next.js と React 19）、MCP server の SDK は、どれも JS/TS のエコシステムにある。
- Web UI は、live viewport と注釈の編集を中心とする SPA 型のエディタで、SEO と初期表示の SSR の要件がない。
- 判断の優先順位は、再現性と決定性、AI ネイティブ、拡張性、開発体験、パフォーマンスの順である。
  - 出典: [Design Doc の判断の優先順位](../design/DesignDoc.md#判断の優先順位)

## Decision

- 言語と runtime: TypeScript と Node.js LTS
- パッケージ管理とタスク: pnpm workspace と turborepo
  - packages/ は 4 層のモジュール単位で切り、package 名は `@screen-contract/<module>` にする。
  - apps/ と packages/ の分け方と、合成ルートの位置は、ADR-0023 が置き換える。
  - ADR-0023: [合成ルートを apps/server に置き app から adapter への依存を禁じる](0023-composition-root.md)
- web の framework: TanStack Start
- 中間層: 置かない
  - Workflow Server（api 層）を唯一の backend とし、web の側の server の機能に API のロジックを置かない。
  - 規約は [context/codebase.md の Module Boundaries](../context/codebase.md#module-boundaries) にある。
- lint と format: oxlint と oxfmt
  - md と yml は、oxfmt の対応が安定するまで、既存の prettier を併用する。
- unit test: vitest
- api の HTTP と WebSocket の framework: Hono
  - ADR-0024: [HTTP / WebSocket framework に Hono を採用する](0024-http-framework.md)

web に TanStack Start を採るのは、client ファーストで Vite の DX を持つためである。  
Next.js の RSC ファーストの思想は SPA 型のエディタと合わない。SSR の要件もないため、Next.js の利点を回収できない。  
agent-browser の dashboard から参照するのは、WebSocket の viewport のパターンと React のコンポーネントの範囲であり、framework の差の影響がない。

## Considered Options

| 選択肢                                                                                                            | 強み                                                                                                                                                                       | 弱み                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **採用:** TypeScript と Node.js の monorepo。web は TanStack Start、中間層なし、lint と format は oxlint と oxfmt | agent-browser の SDK、dashboard の参考実装、MCP SDK と同じエコシステムで、境界をまたいで型を共有できる。client ファーストで Vite の DX を持つ。backend が 1 つに固定される | TanStack Start のエコシステムは Next.js より小さい。oxfmt は beta で、version の更新で format の結果が変わりうる。性能が重要な処理で TS の限界に当たる可能性がある |
| web を Next.js にする                                                                                             | 参考実装（agent-browser の dashboard）と同じで、エコシステムが最大（npm の DL 数で TanStack Start の約 30 倍）                                                             | RSC ファーストの思想が SPA 型のエディタと合わない。SSR の要件がないため、利点を回収できない                                                                        |
| TypeScript と Bun                                                                                                 | runtime、PM、test を 1 つのツールに集約できる                                                                                                                              | TanStack Start と、注釈画像の生成のネイティブの依存との互換の検証が先に要る。検証する動機（性能の要件）が現時点でない                                              |
| core を Rust か Go で書く（Go の backend を足す案を含む）                                                         | 決定的な生成と差分の分類は純粋なロジックなので、実現できる                                                                                                                 | Port の境界がプロセスの境界か FFI になり、MVP には過剰                                                                                                             |
| BFF を置く                                                                                                        | —                                                                                                                                                                          | backend が Workflow Server の 1 つしかなく、BFF が解決する複数の backend の集約とクライアントごとの整形の問題が存在しない。ホップが増えるだけ                      |
| ESLint と Prettier                                                                                                | プラグインの資産が豊富                                                                                                                                                     | 設定の量と実行の速度で oxlint と oxfmt に劣る                                                                                                                      |

core を Rust か Go で書く案は、性能の問題を測って確かめたモジュールだけを後から切り出す方針にする。  
oxfmt は beta（v0.6x）だが、Prettier の互換の移植が進んでおり、コードの側では許容できると判断した。

## Consequences

### Positive

- agent-browser の SDK、dashboard の参考実装、MCP SDK と同じエコシステムで、境界をまたいで型を共有できる。
- packages/ の依存のグラフが 4 層の依存の規約とそのまま一致し、turborepo で規約の違反を見つけやすい。
- backend が 1 つに固定され、draft と確定の状態の管理が分散しない。

### Negative

- TanStack Start のエコシステムは Next.js より小さく、事例とライブラリの選択肢が限られる。
- oxfmt は beta のため、version の更新で format の結果が変わりうる。
  - lockfile で固定して緩和する。
- 性能が重要な処理（画像の差分など）で、TS の限界に当たる可能性がある。
  - 該当する箇所だけを後から切り出す。
