---
type: context
title: <文書名>
description: <索引に出す 1 行説明。何が書いてあるかを具体的に>
keywords: [<検索の手掛かり>, <API 名>, <用語>]
governs:
  # この文書が語る契約の実装場所。コードだけでなく設定ファイルでもよい。
  # 鮮度検査の対象外にするなら governs と verified_commit の両方を消す。
  - <path/to/impl>
# 最後に実装と突き合わせた commit。未確認なら unverified のままにする。
verified_commit: unverified
---

# Toolchain

採用する標準 toolchain。採否の根拠は [adr/](../adr/) を参照する。プロジェクト固有のコマンドは [context/project.yml](project.yml) の `commands` を正本とする。

## 標準スタック

| 区分            | ツール | 備考 |
| --------------- | ------ | ---- |
| Package manager |        |      |
| Task runner     |        |      |
| Language        |        |      |
| Linter          |        |      |
| Formatter       |        |      |
| Unit test       |        |      |
| E2E             |        |      |

## エージェント補助 (任意)

- bash 出力の token 削減に [RTK](https://github.com/rtk-ai/rtk) を推奨する。導入と注意は `dev-commands` skill の `references/rtk.md` (開発者ごとの global 設定。repo の hook には登録しない)。

## 採用方針

- 採用候補を先行固定する場合は、その根拠と確定タイミング (どの issue / ADR で確定するか) を記す。

## Scaffold Policy

- 新規モジュールの初期 scaffold 手順 (公式 create command を優先する等)。
- 生成後にプロジェクトの contract (命名 / root scripts / 共有 config) へ寄せる手順。
