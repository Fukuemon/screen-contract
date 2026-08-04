---
type: context
title: Infrastructure & Operations
description: 公開基盤・環境戦略・secret の扱いの契約。MVP はローカル実行前提で、公開方式は DesignDoc の Open Question
keywords: [infrastructure, deployment, environment, secret]
governs:
  - <実装ディレクトリ確定後に記入>
verified_commit: unverified
---

# Infrastructure & Operations

公開基盤・環境戦略・運用・セキュリティの契約。本書は **app 側が依存する contract** を定義する。infra 実体を別 repo で管理する場合はその境界も記す ([context/project.yml](project.yml) のリポジトリマップ)。

> 前提: MVP はローカル実行 (利用者の開発マシン上で Workflow Server と agent-browser を起動) とする。リモート公開・Browser Stream の公開方式・認証状態の保存方式は DesignDoc の Open Questions を参照し、確定後に本書へ反映する。秘密情報を DSL / ログ / Snapshot / 成果物へ平文で保存しないことは DesignDoc の前提として確定済み。

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
