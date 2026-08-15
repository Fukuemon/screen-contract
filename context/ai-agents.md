---
type: context
title: AI Agent Registry
description: 非対話で並列起動できる CLI エージェントの一覧と invocation / 上限判定 / 用途別ルーティング
keywords: [ai agent, cli, orchestration, review, codex, cursor-agent, opencode]
governs:
  - .ai-out/
verified_commit: 6422cca632d7f5e4851fb0597cea65904a1ed28d
---

# AI Agent Registry

`agent-orchestrate` skill が読む正本。スキーマは同 skill の `references/agent-registry-schema.md` に従う。

**CLI 名・モデル・flag をここ以外に書かない。** skill 側は固有値を持たず、常に本書を引く。

## 共通既定

エージェントブロックに明示が無いときの値。

| 項目               | 既定                       | 補足                                                                 |
| ------------------ | -------------------------- | -------------------------------------------------------------------- |
| `timeout`          | 900 秒                     | 大きい差分のレビューを 1 回で通す想定                                |
| 出力先 dir         | `.ai-out/agent-runs/<ts>/` | `.gitignore` 済み。`<ts>` は run ごとの時刻                          |
| `max_input_tokens` | 200000                     | これを超える差分はファイル単位の chunk に分ける                      |
| リトライ           | 1 回                       | `limit` と一過性 `error` のみ。バックオフ後に再実行し、駄目なら skip |

## 用途別ルーティング

| 用途        | 既定の対象                      | 補足                                                           |
| ----------- | ------------------------------- | -------------------------------------------------------------- |
| `review`    | `enabled: yes` の全エージェント | 認証が通っている CLI が 1 台以下ならクロスチェックが成立しない |
| `implement` | 明示指定のみ                    | ファイルを書き換えるため、既定で対象にしない                   |

**`review` で外部 CLI が 1 台以下のときは、Claude の観点別 subagent (`review-*`) を併用する。** 別モデルの視点を 1 つ以上確保するためである。併用したことはレポートに明示する。

## エージェント

### codex

- `enabled`: yes
- `model`: (CLI 既定)
- `invocation`: `codex exec --sandbox read-only --color never $PROMPT`
- `verified`: yes
- `limit_patterns`: `usage limit`, `rate limit`, `429`, `quota`
- `auth_note`: `codex login` 済みであること。ChatGPT のサブスクリプションを消費する
- `timeout`: 900
- `max_input_tokens`: 300000

`--sandbox read-only` を既定にする。レビュー用途でファイルを書き換えさせないためである。`--dangerously-bypass-approvals-and-sandbox` は使わない。

出力には hook のログとトークン数が混じる。`agent-orchestrate` の前処理で捨てる。

### cursor-agent

- `enabled`: yes
- `model`: (CLI 既定)
- `invocation`: `cursor-agent -p --output-format text --mode ask --trust $PROMPT`
- `verified`: yes
- `limit_patterns`: `rate limit`, `quota`, `429`
- `auth_note`: `cursor-agent login` 済みか `CURSOR_API_KEY` が要る
- `timeout`: 900

`--mode ask` は読み取り専用の Q&A モードであり、レビュー用途に合う。

`--trust` が要る。未指定だと「このディレクトリを信頼するか」を対話で尋ねて終了コード 1 で抜けるため、非対話で使えない。**`--yolo` / `-f` は使わない。** これらはコマンド実行を許可するもので、読み取り専用のレビューには要らない。

### opencode

- `enabled`: no
- `model`: (CLI 既定)
- `invocation`: `opencode run $PROMPT`
- `verified`: yes
- `limit_patterns`: `rate limit`, `429`, `Token refresh failed`
- `auth_note`: **未認証**。`Token refresh failed: 401` で終了する。`opencode auth login` が要る
- `timeout`: 900

## 認証状態の確認

疎通は次で確かめる。応答が返れば `enabled: yes` にしてよい。

```sh
codex exec --sandbox read-only --color never '「疎通確認」とだけ返してください。'
cursor-agent -p --output-format text --mode ask '「疎通確認」とだけ返してください。'
opencode run '「疎通確認」とだけ返してください。'
```

`enabled` を変えたら、本書の `verified_commit` も更新する。
