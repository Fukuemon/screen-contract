# Workflow Server

利用者が起動する常駐プロセス。**127.0.0.1 にのみ bind する**
([context/infrastructure.md](../../context/infrastructure.md))。

`apps/web` (ブラウザで動く SPA) とは別プロセスで、こちらが web を静的ファイル
として配信する ([context/architecture.md](../../context/architecture.md) の
Runtime Boundary)。

## 何を持つか

**合成ルートである。** adapter の具象を選んでよい唯一の場所で
([adr/0023](../../adr/0023-composition-root.md))、HTTP のアプリ本体は
`packages/api` が Hono で組み立てたものを受け取って listen する
([adr/0024](../../adr/0024-http-framework.md))。

```text
src/
├── bin/serve.ts     プロセスの入口。環境を渡すだけ
├── run-server.ts    起動の本体。検査 → listen の順に進める
├── compose.ts       adapter の具象を選ぶ
├── startup/         起動時検査 (置き場・ブラウザ・設定・トークン生成)
├── runtime/         listen と接続先ファイル (runtime.json) の寿命
├── viewport/        ブラウザのセッション、run、対象 origin、認証プロファイル
└── serving/         Web UI の配信とトークンの埋め込み
```

| ディレクトリ | 責務                                                        |
| ------------ | ----------------------------------------------------------- |
| `startup/`   | **起動してよいかを決める。** 満たさなければ中止する         |
| `runtime/`   | **プロセスの寿命に紐づくもの。** listen と `runtime.json`   |
| `viewport/`  | **対象ブラウザの操作。** セッション、run の状態、記録の材料 |
| `serving/`   | **Web UI の配信。** トークンは HTML へ埋め込む              |

## 依存の向き

`apps/server` だけが全層に依存してよい。`packages/api` は Hono のアプリを
返すだけで listen せず、`packages/app` は Port の型だけを持つ。
