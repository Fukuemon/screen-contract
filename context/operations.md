---
type: context
title: 基盤と運用
description: 環境の種類、デプロイと切り戻しの条件、監視、秘密情報の置き場の方針
status: draft
governs:
  - .github/
verified_commit: 44fda9132f6702cb66ed18224f22d878c85be4aa
---

# 基盤と運用

## Environments

MVP は、利用者の開発マシンで動かす local の 1 つの環境だけを持つ。  
preview と production は作らない。  
公開する先を持たないため、次の環境へ進む条件もない。

- Workflow Server は 127.0.0.1 にだけ bind し、クラウドへ公開しない。
- リモートに公開するときは、OAuth か OIDC を足し、この文書を作り直す。
  - ADR-0021: [agent interface の認可](../adr/0021-agent-interface-authz.md)

Workflow Server が操作してよい対象アプリの origin は、プロダクトの設定で列挙する。  
列挙していない origin への `open` は拒否する。  
ADR-0017: [エージェントの操作範囲](../adr/0017-agent-draft-boundary.md)

- 設定は秘密情報ではないため、レビューできるリポジトリの中のプロダクトの設定に置く。
- 既定は空にする。1 つも列挙していなければ実行できない。
- 拒否した実行は、理由を付けて記録する。
- 本番の環境も列挙できる。このことを設定と文書に明記する。対象アプリの取り消せない操作をこのシステムは判別できず、対象を選ぶ責任は利用者が負う。

## Deployment Conditions

配布物は 1 つの Node のパッケージで、基盤のリポジトリは持たない。  
MVP はデプロイする先を持たない。  
配布物を出してよい条件は未定。

## Health and Monitoring

- 常駐するプロセスは Workflow Server の 1 つだけにする。障害の一次の観測点は、Workflow Server の標準出力にする。
- CI での実行は MVP の対象外にする。

Workflow Server は起動するときに次を確かめ、満たさなければ理由と対処を出して起動を中止する。  
実行の途中で失敗させない。

- 秘密情報の置き場が条件を満たす。条件は [Secrets](#secrets) にある。
- ブラウザの本体が使える。使えなければ `agent-browser install` の実行を案内する。
  - ADR-0027: [agent-browser の同梱](../adr/0027-agent-browser-bundling.md)
- 実行してよい origin が 1 つ以上ある。なければ設定への追記を案内する。
- 常駐するサーバーが二重に起動していない。既存の `runtime.json` が生きているプロセスを指していれば、そのプロセスの停止を案内する。

## Rollback

戻すときの手順と、戻せない変更の扱いは未定。

## Secrets

秘密情報を含むローカルの状態は、リポジトリの配下に置かない。  
置き場は XDG Base Directory に従い、macOS でも同じ配置にする。

- `$XDG_STATE_HOME/screen-contract/`: 既定は `~/.local/state/screen-contract/` で、権限は 0700 にする。
  - `runtime.json`: 待受のアドレス、ポート、ローカルトークン、プロセス ID を持つ。権限は 0600 にする。
  - `secrets.enc`: DSL が名前で参照する入力の値を、暗号化して持つ。権限は 0600 にする。
  - `auth/<authProfile>.enc`: 暗号化した Storage State を持つ。権限は 0600 にする。
- 暗号の鍵は OS のキーストアにだけ置く。macOS Keychain、libsecret、DPAPI が当たる。
  - service は `screen-contract` にする。
  - account は、Storage State の鍵を `storage-state-key`、入力の値の鍵を `secrets-key` にする。
  - ADR-0022: [認証状態の保存](../adr/0022-auth-state-storage.md)

`XDG_STATE_HOME` の値は信用しない。  
起動するときに次を確かめ、満たさなければ起動を中止する。  
警告だけを出して続けない。

- 絶対パスである。
- symlink を解決した後のパスで判定する。
- リポジトリと worktree の配下にない。
- ディレクトリの権限が 0700 である。ファイルの権限が 0600 である。

秘密情報を置かない場所は次のとおり。

- 認証の情報と Storage State を、DSL、ログ、Snapshot、生成した成果物に平文で保存しない。
- DSL に入力の値そのものを書かない。DSL の `fill` は `secret: <名前>` で値を参照する。
- 解決した入力の値は、実行のときのメモリにだけ置く。StepResult、ExecutionEvent、ログ、成果物のどれにも書かない。
- ローカルトークンを、ログ、エラーメッセージ、成果物に出さない。URL の query に載せない。
- Web UI へ渡してよいのはローカルトークンだけにする。Storage State と暗号の鍵は Workflow Server の内側に留める。
