#!/bin/sh
# git hook 用のコマンドラッパー。
#
# git hook は対話シェルではないため mise が activate されておらず、
# PATH にはシステムの Node が乗る。この repo は Node を 24 (LTS) に
# 固定しており (mise.toml)、dependency-cruiser は奇数系の Node で
# 起動を拒否する。素で叩くと **hook が常に失敗する**。
#
# 解決するツールを node に限る。`mise exec --` は利用者の global 設定に
# ある全ツールを解決しようとするため、無関係なツールの導入失敗で
# **hook が巻き添えで落ちる**。
#
# mise が無い環境ではそのまま実行する。hook を壊さないためである。
set -eu

if command -v mise >/dev/null 2>&1; then
  exec mise exec node -- "$@"
fi

exec "$@"
