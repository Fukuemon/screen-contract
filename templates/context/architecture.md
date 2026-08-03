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

# Codebase Architecture

コードベースの **package / runtime / state boundary と依存方向**。全体像 (system landscape, モジュール責務) は [design/DesignDoc.md](../design/DesignDoc.md) を正本とし、本書は境界規約を扱う。プロジェクト固有の構成は [context/project.yml](project.yml) を参照する。

## Package Boundary

- モジュール間の依存方向を定める (どこからどこへ依存してよいか / 禁止する経路)。
- 共有コードの昇格条件 (いつローカルから共有 package へ移すか)。
- 循環依存・未宣言依存の扱い ([engineering.md](engineering.md) の quality gate で検査)。

## Runtime Boundary

- runtime / 配信モデルの前提 (静的 / サーバ / edge 等)。
- build-time と runtime の env 分離方針。
- 秘密情報を client へ露出させない原則 ([infrastructure.md](infrastructure.md))。

## State Boundary

- server state / client state / URL state の分離方針 (該当する場合)。
