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
# => screen-contract-server: http://127.0.0.1:<port> で待ち受けています
```

ポートは OS が割り当てる。接続先は `runtime.json` に入る。

```sh
cat "${XDG_STATE_HOME:-$HOME/.local/state}/screen-contract/runtime.json"
```

## 5. 確認する

出力された URL をブラウザで開く。画面上部に使い方が出る。

| #   | 操作                                 | 期待する結果                                                              |
| --- | ------------------------------------ | ------------------------------------------------------------------------- |
| 1   | `http://127.0.0.1:<port>/` を開く    | エディタ画面。右上は「未接続」。viewport は「接続」を促す                 |
| 2   | ページのソースを見る                 | `<meta name="screen-contract-token" ...>` がある。URL に token を含まない |
| 3   | 「操作モード」を押す                 | 押せない (run がまだ無いため)                                             |
| 4   | 「接続」を押す                       | 対象アプリが viewport に映り、右上が「一時停止中」になる                  |
| 5   | 「操作モード」を押す                 | 押せるようになっている。切り替わると案内文が変わる                        |
| 6   | viewport のボタンをクリックする      | 対象アプリのモーダルが開く                                                |
| 7   | 「記録を開始」を押す                 | 右上の記録バッジが赤い「記録中」に変わる                                  |
| 8   | 「選択モード」へ戻す                 | 記録が止まり、バッジが「停止中」へ戻る                                    |
| 9   | 選択モードで viewport をクリックする | モーダルは開かず、「選択した座標」が出る                                  |
| 10  | 「再開」を押す                       | 「再生中」になり、操作モードが押せなくなる                                |
| 11  | `/approvals` を開く                  | 「承認」が押せない (差分を表示していないため)                             |
| 12  | 「差分を表示」を押す                 | 差分が出て、「承認」が押せるようになる                                    |

### 認可の負例 (curl)

```sh
PORT=<port>; TOKEN=<runtime.json の token>
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

## 未実装で確認できない項目

手順 6〜9 で操作と記録の**モードは動く**が、**記録した手順が draft へ積まれない**。
記録の use case (`startRecording` / `stopRecording`) は実装済みだが、Stream Proxy が
中継した入力と結びつける経路がまだ無い。「記録した手順」パネルは常に空になる。

残りは [index.md](index.md) の `## 実装で見つかった上位資料の欠落` を参照する。

## 確認記録

| 日付       | 確認者   | 結果                                                 | 備考                                 |
| ---------- | -------- | ---------------------------------------------------- | ------------------------------------ |
| 2026-08-25 | Fukuemon | 手順 1〜3 と認可の負例まで確認。4〜11 は未実装で保留 | run の pause endpoint が無いため中断 |
