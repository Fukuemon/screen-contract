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
# 版の解決には `mise which` を使う。`mise exec node -- ...` は版を指定しない
# 要求として扱われ、**mise.toml の固定を無視して最新版を選ぶ**。利用者が
# node 25 を入れていると dependency-cruiser が起動を拒否し、hook が落ちる。
# `mise which node` は mise.toml の固定 (24) を尊重する。
#
# mise が無い環境ではそのまま実行する。hook を壊さないためである。
set -eu

if command -v mise >/dev/null 2>&1; then
  node_bin="$(mise which node 2>/dev/null || true)"
  if [ -n "$node_bin" ]; then
    PATH="$(dirname "$node_bin"):$PATH"
    export PATH
  fi
fi

exec "$@"
