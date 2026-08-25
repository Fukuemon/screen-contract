# Web UI

Workflow Server が配信する SPA。**ドメインロジックを持たない** — すべての操作は
api 経由で app 層の use case を呼ぶ ([context/architecture.md](../../context/architecture.md))。

## ディレクトリの分け方

**package by feature** で切る。技術種別 (`components/` `hooks/`) では切らない。
1 つの機能を直すときに触るファイルが 1 つのディレクトリに揃う (collocation)。

```text
src/
├── features/
│   ├── viewport/     live viewport、URL とサイズの切り替え、入力転送
│   ├── recording/    モード切替、記録、記録した手順
│   ├── approval/     承認キューと差分
│   └── auth/         認証プロファイルの選択と保存
├── shared/
│   ├── api/          Workflow Server の HTTP / WebSocket クライアント
│   └── ui/           feature をまたぐ部品 (Button / Panel / Badge)
└── routes/           TanStack Router のファイルルート
```

各 feature は次の 3 つを持つ。**同じ名前で揃える。**

| ファイル           | 役割                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `<name>.ts`        | 判断。純粋関数だけを置き、React にも fetch にも依存しない         |
| `<name>.test.ts`   | 上の単体テスト。**判断はここで固定する**                          |
| `<name>-view.tsx`  | 描画 (presentation)。props を受け取るだけで、状態も通信も持たない |
| `<name>-panel.tsx` | 接続 (container)。状態と通信を持ち、view へ props を渡す          |

**container / presentation を分ける理由。** 判断を純粋関数へ、描画を props だけの
コンポーネントへ寄せると、判断はテストで固定でき、描画は目で確かめられる。混ぜると
どちらも確かめにくくなる。

## デザインの基準

[design-system/screen-contract/MASTER.md](design-system/screen-contract/MASTER.md)
が正本。`ui-ux-pro-max` skill が生成した。色・タイポ・スペーシングを部品へ直書き
しない。
