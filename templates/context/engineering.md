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

# Engineering Conventions

shared config / root task / repository quality gate の境界規約。toolchain 一覧は [toolchain.md](toolchain.md)、プロジェクト固有コマンドは [context/project.yml](project.yml)。

## Code Comment Boundary

### 何をどこに書くか

情報の置き場を次のとおり分ける。**コードから読み取れることをコメントに書き写さない。**

| 置き場           | 書くこと                                               |
| ---------------- | ------------------------------------------------------ |
| コード           | **How** — どう実現しているか。コード自身が語る         |
| テストコード     | **What** — 何が成り立つべきか                          |
| commit / PR      | **Why** — なぜこの変更をしたか                         |
| コード内コメント | **Why not** — なぜ他の手を採らなかったか               |
| 関数・型の doc   | **What** — 何をするものか (公開 API の doc 規約に従う) |

コード内コメントの主役は **Why not**。「どう動くか」はコードを読めば分かるが、
「なぜ素直な方法を採らなかったか」は読んでも分からない。書かないと後から
不用意に「単純化」されて壊れる。

書かないもの: コードを言い換えただけの行、型を繰り返すだけの doc、
変更の経緯や issue 番号 (commit と ADR が持つ)。

### 言語

- コード内コメント / ドキュメント / commit / PR で使う言語を決める。
- **ユーザーに見える文字列リテラル (CLI 出力 / エラーメッセージ / API の値) は変えない。**
  観測可能な契約であり、テストが固定している。
- 識別子・型名・API 名は原語のまま使う。

### 参照の張り方

- **コメントから spec / issue を引用しない。** spec は issue close 時に削除される
  作業文書であり、コードから参照すると宙に浮いたリンクが残る。
- 理由を残すときのリンク先は ADR と長く残る決まりのドキュメント (`adr/*.md` /
  `context/*.md` / feature doc) に限る。

## Shared Config Boundary

- 共有設定 (tsconfig / lint / test 等) をどこで export し、どう参照するか。

## Root Task Boundary

- どのタスクを root から束ねるか、どれを直実行するか。
- commit 前に通す自動検査 (pre-commit hook 等)。

## Repository Quality Gate

- repository 全体に対する検査 (依存境界 / dead code / 型) の正本 config と実行点。
- false positive を避けるための除外方針。
