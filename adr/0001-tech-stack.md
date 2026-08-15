# ADR-0001: 技術スタックを TypeScript monorepo (TanStack Start / 中間層なし) にする

## 状態

承認

## 決定日

2026-08-04

## 背景

- DesignDoc の再編成で interface / app / core / adapter の 4 層構造と機能単位の core 分割が確定し、実装言語・ツールの選定が commands / naming / toolchain の placeholder を埋める前提条件になった。
- 実行基盤の agent-browser は Rust 製 CLI だが、操作 SDK・組み込み dashboard (Next.js + React 19)・MCP server SDK はいずれも JS/TS エコシステムにある。
- Web UI は live viewport と注釈編集を中心とする SPA 型エディタで、SEO・初期表示 SSR の要件がない。
- decision_priority は再現性・決定性 > AI ネイティブ > 拡張性 > 開発体験 > パフォーマンス ([context/project.yml](../context/project.yml))。

## 決定

- 言語 / runtime: TypeScript + Node.js LTS
- パッケージ管理 / タスク: pnpm workspace + turborepo。packages/ は 4 層のモジュール単位で切り、package 名は `@screen-contract/<module>`
- web framework: TanStack Start
- 中間層: 置かない。Workflow Server (api 層) を唯一の backend とし、web 側の server 機能に API ロジックを置かない (規約は [context/architecture.md](../context/architecture.md))
- lint / format: oxlint + oxfmt。md / yml は oxfmt の対応が安定するまで既存の prettier を併用する
- unit test: vitest
- api の HTTP / WebSocket framework は Hono を第一候補とする。確定は `packages/api` の実装 issue で行う (feature 設計では判断材料が出なかったため、確定時期を後ろへ移した)

## 代替案

- **web を Next.js にする**: 参考実装 (agent-browser dashboard) と同一でエコシステム最大 (npm DL 比で TanStack Start の約 30 倍)。ただし RSC ファーストの思想が SPA 型エディタと合わず、SSR 要件もないため利点を回収できない。dashboard の参照は WebSocket viewport パターンと React コンポーネントの範囲であり、framework 差の影響がない。client ファーストで Vite の DX を持つ TanStack Start を採る。
- **TypeScript + Bun**: runtime / PM / test を 1 ツールに集約できるが、TanStack Start・注釈画像生成のネイティブ依存との互換検証コストが先行する。検証する動機 (性能要件) が現時点でないため却下。
- **core を Rust / Go で書く (または Go backend を追加する)**: 決定的生成・差分分類は純粋ロジックなので可能だが、Port 境界がプロセス境界 / FFI になり MVP には過剰。性能問題が実測されたモジュールだけ後から切り出す方針とし、Future Work に置く。
- **BFF を置く**: backend が Workflow Server の 1 つしかなく、BFF が解決する「複数バックエンドの集約・クライアント別整形」の問題が存在しない。ホップが増えるだけのため却下。
- **ESLint + Prettier**: プラグイン資産は豊富だが、設定量と実行速度で oxlint + oxfmt に劣る。oxfmt は beta (v0.6x) だが Prettier 互換移植が進行中で、コード側は許容できると判断した。

## 影響

### 良い影響

- agent-browser SDK / dashboard 参考実装 / MCP SDK と同一エコシステムで、境界をまたぐ型共有ができる
- packages/ の依存グラフが 4 層の依存規約とそのまま一致し、turborepo で規約違反を検出しやすい
- backend が 1 つに固定され、draft-確定の状態管理が分散しない

### 悪い影響 / トレードオフ

- TanStack Start のエコシステムは Next.js より小さく、事例・ライブラリの選択肢が限られる
- oxfmt は beta のため、format 結果の変動が version 更新時に起こりうる (lockfile で固定して緩和)
- 性能クリティカルな処理 (画像 diff 等) で TS の限界に当たる可能性がある (該当箇所のみ後から切り出す)

### 影響範囲

- 対象モジュール / package: workflow / execution / element / artifact / diff / web / agent / infra (全 domains)

## 実装・運用への反映

- spec 更新要否: 不要 (spec 未作成)
- context / AI 向け設定更新要否:
  - [context/project.yml](../context/project.yml) の commands / naming を確定する
  - [context/toolchain.md](../context/toolchain.md) の標準スタック表を埋める
  - [context/architecture.md](../context/architecture.md) に「web 側 server に API ロジックを置かない」を追記する
  - monorepo scaffold (pnpm workspace / turborepo / oxlint / oxfmt / vitest 設定) の作成 — 実施済み
  - パッケージの配置 (`apps/` と `packages/` の分け方、合成ルートの位置) は [adr/0023](0023-composition-root.md) で改訂した

## 関連ドキュメント / チケット

- [design/DesignDoc.md](../design/DesignDoc.md): モジュール責務 / 設計方針
- spec / PR: なし
