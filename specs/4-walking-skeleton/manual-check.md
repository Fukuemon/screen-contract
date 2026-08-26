# 動作確認の手順

**E2E では検証できない範囲がある。** E2E は Browser Port を fake へ置き換える設計
(入れ子ブラウザを避けるため) であり、記録の実挙動が通らない
([context/testing.md](../../context/testing.md))。記録の UI 操作は手動で確かめ、
結果を末尾の表へ記録する。

以下の手順は 2026-08-25 に実際に通して確認している。

## 0. 前提

```sh
pnpm install
pnpm browser:install   # Chrome for Testing (未取得のとき)
```

## 1. 自動検査を通す

```sh
pnpm check             # lint / format / test / build
pnpm boundaries        # 依存境界
pnpm knip              # 未使用の検出
pnpm test:integration  # 実ブラウザでの通し検証
```

`test:integration` は agent-browser を実起動する。`browser:install` が済んでいないと落ちる。

## 2. fixture 対象アプリを起動する

**ポートを固定する。** プロダクト設定へ書く origin が起動のたびに変わると、手順が組めない。

```sh
pnpm --filter @screen-contract/fixture-app run build
FIXTURE_PORT=5174 node packages/fixture-app/dist/bin/serve.js
# => http://127.0.0.1:5174
```

別の端末で続ける。

## 3. 実行してよい origin を確かめる

本リポジトリの `screen-contract.config.json` は、手順 2 の fixture (`http://127.0.0.1:5174`)
を既に列挙している。**別のポートや別の対象を使うなら書き足す。**

```jsonc
// screen-contract.config.json
{ "allowedOrigins": ["http://127.0.0.1:5174"] }
```

列挙が空だと起動を中止する ([adr/0017](../../adr/0017-agent-draft-boundary.md))。
これは安全装置であり、**列挙しない限り何も操作しない**ことを保証する。空のまま
起動すると次で止まる。

```
screen-contract-server: 実行してよい origin が 1 つも列挙されていません
対処: screen-contract.config.json の allowedOrigins へ対象を追記してください
```

## 4. Workflow Server を起動する

**プロジェクトルートから起動する。** プロダクト設定はカレントディレクトリから読む。
`pnpm --filter` 経由だとパッケージのディレクトリが cwd になり、設定が見つからない。

```sh
pnpm serve
# => screen-contract-server: 次の URL を開いてください
#    http://127.0.0.1:<port>/?boot=<起動チケット>
```

**出力された URL をそのまま開く。** origin だけを開くとトークンが埋め込まれず、
画面が動かない。チケットは起動ごとに変わり、1 度使うと cookie へ移る
([context/infrastructure.md](../../context/infrastructure.md))。

ポートは既定で OS が割り当てる。固定したいときはプロダクト設定へ書く。

```jsonc
// screen-contract.config.json
{ "allowedOrigins": ["http://127.0.0.1:5174"], "port": 5900 }
```

接続先は `runtime.json` に入る。

```sh
cat "${XDG_STATE_HOME:-$HOME/.local/state}/screen-contract/runtime.json"
```

### 画面を触りながら直す (HMR)

`pnpm serve` は web をビルドしてから静的に配信する。web を触るたびに build が要る。
開発中は `pnpm dev` を使う。

```sh
pnpm dev
# Vite (127.0.0.1:5175) と Workflow Server が並んで上がる
# 開くのは Workflow Server の URL (チケット付き)
```

**Vite の URL (5175) を直接開かない。** Origin 検査とトークンの埋め込みのどちらも
通らず、画面が一切動かない。Workflow Server が Vite の前に立ち、画面は server の
origin から配られる。

## 5. 確認する

出力された URL をブラウザで開く。画面上部に使い方が出る。

| #   | 操作                                 | 期待する結果                                                              |
| --- | ------------------------------------ | ------------------------------------------------------------------------- |
| 1   | `http://127.0.0.1:<port>/` を開く    | エディタ画面。右上は「未接続」。viewport は「接続」を促す                 |
| 2   | ページのソースを見る                 | `<meta name="screen-contract-token" ...>` がある。URL に token を含まない |
| 3   | 「操作」を押す                       | 押せない (接続していないため)。理由が読める                               |
| 4   | 「接続」を押す                       | 対象アプリが viewport に映り、右上が「接続中 — 操作できます」になる       |
| 5   | 「操作」を押す                       | 押せるようになっている。「要素の枠」は押せなくなる                        |
| 6   | viewport のボタンをクリックする      | 対象アプリのモーダルが開く。**1 回目から効く**                            |
| 7   | 「記録」タブ →「記録を開始」         | 赤い「記録中」が出る。手順の前提条件が 3 段で見える                       |
| 8   | viewport をクリックする              | 「記録」タブの件数が増え、手順が積まれる (数秒で反映)                     |
| 9   | 「選択」へ戻す                       | 記録が止まる                                                              |
| 10  | 「要素の枠」を押す                   | 枠と構成番号が出る。**対象ページ側に赤い枠は出ない**                      |
| 11  | 選択モードで viewport をクリックする | モーダルは開かず、選んだ要素の role と name が出る                        |
| 12  | 「番号を付ける」→ 別の対象へ移る     | 番号が引き継がれない。戻ると番号も戻る                                    |
| 12b | URL 欄へ `/login/` だけ打つ          | いま見ている対象の origin へ寄せて移動する                                |
| 12c | 枠を出したままスクロールする         | 枠が追従する。押し直さなくてもずれたままにならない                        |
| 12d | 説明文をクリックする                 | 地の文も選べて、番号を振れる                                              |
| 13  | ログイン画面 (`/login/`) で入力する  | 文字が入る。記録した手順に値が残らず `secret` バッジが付く                |
| 14  | 「再生」を押す                       | 記録した手順が最初から実行され、ログインが再現される                      |
| 15  | 「承認へ回す」を押す                 | 承認へ回した旨が出る                                                      |
| 16  | `/approvals` を開く                  | 依頼が並ぶ。「承認」が押せない (差分を表示していないため)                 |
| 17  | 「差分を表示」を押す                 | 差分が出て、「承認」が押せるようになる                                    |
| 18  | 「切断」→「接続」                    | 何度でも繋ぎ直せる。行き止まりにならない                                  |

### 認可の負例 (curl)

```sh
PORT=<port>; TOKEN=<runtime.json の token>
# 起動チケット無しではトークンを配らない (同一マシンの他プロセス対策)
curl -s "http://127.0.0.1:$PORT/" | grep -c screen-contract-token                                 # 0
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$PORT/approvals"                       # 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  -H "Origin: http://127.0.0.1:$PORT" "http://127.0.0.1:$PORT/approvals"                          # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  -H "Origin: http://evil.test" "http://127.0.0.1:$PORT/approvals"                                # 403
```

## 6. 後始末

```sh
# Workflow Server と fixture を Ctrl-C で止める
cat "${XDG_STATE_HOME:-$HOME/.local/state}/screen-contract/runtime.json"  # => 無いこと
```

`runtime.json` が消えることまで確かめる。残ると、次に起動した利用者が死んだプロセスへ繋ぎに行く。

## 確認するときの注意

**別のブラウザ自動化ツールで UI を操作しない。** agent-browser を 2 つ同時に動かすと
片方の配信が切れ、映像が止まる。製品の不具合と見分けが付かない
([context/testing.md](../../context/testing.md) の実測表)。人が触るか、HTTP と
WebSocket を直接叩いて確かめる。

## 未実装で確認できない項目

- **Web Storage を使う対象のログイン維持。** 実行基盤が値を argv でしか受けず、
  秘密が他プロセスから読めるため復元していない。cookie だけで認証が通らない対象では、
  手でログインし直す (画面に注意書きが出る)。
- 同じ URL 上のモーダル開閉を別の画面状態として扱うこと
  ([adr/0029](../../adr/0029-recording-state-key.md))。

残りは [index.md](index.md) の `## 実装で見つかった上位資料の欠落` を参照する。

## 確認記録

| 日付       | 確認者   | 結果                                                 | 備考                                 |
| ---------- | -------- | ---------------------------------------------------- | ------------------------------------ |
| 2026-08-25 | Fukuemon | 手順 1〜3 と認可の負例まで確認。4〜11 は未実装で保留 | run の pause endpoint が無いため中断 |
