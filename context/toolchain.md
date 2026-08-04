---
type: context
title: Toolchain
description: 標準 toolchain (package manager / task runner / linter 等) の一覧。現在は技術スタック ADR 待ちで未確定
keywords: [toolchain, package manager, task runner, linter, formatter]
governs:
  - <実装ディレクトリ確定後に記入>
verified_commit: unverified
---

# Toolchain

採用する標準 toolchain。採否の根拠は [adr/](../adr/) を参照する。プロジェクト固有のコマンドは [context/project.yml](project.yml) の `commands` を正本とする。

> 未確定: 実装言語・ツールは技術スタック ADR (未作成) で確定する。下表と `commands` はそれまで空のまま残す。

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
