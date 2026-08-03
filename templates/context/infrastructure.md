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

# Infrastructure & Operations

公開基盤・環境戦略・運用・セキュリティの契約。本書は **app 側が依存する contract** を定義する。infra 実体を別 repo で管理する場合はその境界も記す ([context/project.yml](project.yml) のリポジトリマップ)。

## Infrastructure / Deployment

- 公開基盤と配信モデル。app repo に置くもの / infra repo へ委譲するものの境界。

## Infrastructure Contract (app → infra)

- app 側から infra 側へ受け渡す contract (project 名 / domain / secret 名 / 参照リンク等)。実値は repo に保存しない。

## Environment Strategy

| Environment | Purpose | Role |
| ----------- | ------- | ---- |
| local       |         |      |
| preview     |         |      |
| production  |         |      |

- 各環境の昇格トリガ (どのイベントで production へ出るか)。

## Operations / Observability

- 監視 / ログ / 分析の一次観測点と、リリース判定に含める確認。

## Security / Privacy

- secret / token の分離方針 (client へ露出させない)。
- 個人情報・認証・権限を扱う場合の方針の所在 (feature / spec)。
