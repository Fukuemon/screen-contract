# Web UI

Workflow Server が配信する SPA。**ドメインロジックを持たない** — すべての操作は
api 経由で app 層の use case を呼ぶ ([context/architecture.md](../../context/architecture.md))。

## 配置

```text
src/
├── entities/     判断。純粋関数と型だけを置き、React にも fetch にも依存しない
├── gateways/     Workflow Server との出入り。HTTP と WebSocket の hook
├── lib/          接続の組み立てと汎用値
├── components/
│   ├── ui/       feature に依らない部品 (Button / Badge / Panel / Tabs)
│   ├── shared/   feature をまたぐ UI (Sidebar)
│   └── features/ 機能ごとの UI
└── routes/       TanStack Router のファイルルート
```

import は `routes/` → `components/` → `gateways/` → `entities/` の向きにのみ流れる。

**判断は `entities/` に置き、テストで固定する。** 描画は props を受け取るだけの
component、状態と通信は route に置く。混ぜると、判断をテストで固定できず描画も
確かめにくくなる。

## デザインの基準

[design-system/screen-contract/MASTER.md](design-system/screen-contract/MASTER.md)
が正本。色・タイポ・スペーシングを部品へ直書きしない。

## 検査

```sh
npx react-doctor@latest --verbose
```
