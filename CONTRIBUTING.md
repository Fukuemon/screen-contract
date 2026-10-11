# 開発の準備

必要なものは mise である。Node.js と apm のバージョンは `mise.toml` に、pnpm のバージョンは `package.json` の `packageManager` にある。

```sh
mise install
pnpm install
```

`pnpm install` は、`prepare` で lefthook の Git のフックを入れる。

スキルとフックは apm で配置し、Git で追跡しない。clone した後の最初のセッションで、セッションの開始のフックが配置する。手で配置するときは次を実行する。

```sh
apm install --frozen
```

`apm install` の後に配置先を `.gitignore` に足す post-install は、マシンごとに 1 度信頼させる。

```sh
apm lifecycle trust
```

## 文書を直すとき

文章の規則は textlint で、経緯の混入とリンクは docs のスクリプトで確かめる。指摘された語は言い換え、`--fix` は使わない。

```sh
pnpm exec textlint <直した Markdown>
node .claude/hooks/docs/hooks/check-history.mjs
node .claude/hooks/docs/hooks/check-links.mjs
```

既存の文書には textlint の指摘が残っている。直した文書だけに掛け、CI も pull request で変えた Markdown だけを見る。

`verified_commit` の後に実装が変わった文書は、`node .claude/hooks/docs/hooks/list-drift.mjs` で一覧する。実装と読み比べてから `verified_commit` を進める。

## コミットするとき

コミットと push の前に、lefthook が次を確かめる。設定は `lefthook.yml` にある。Node.js を使うコマンドは、`scripts/run-with-node.sh` が `mise.toml` の版で実行する。

- 保護するブランチへの直接のコミットと push を止める。
- ステージしたファイルを prettier と oxfmt で整形し、oxlint と textlint を掛ける。
- commit-msg のフックで、commitlint がメッセージの形式を確かめる。規則は `commitlint.config.mjs` にある。
- push の前に、`pnpm check`、`pnpm boundaries`、`pnpm knip` を実行する。

- 変更の分け方とメッセージの書き方は、スキル write-commit に従う。

## ブランチとリリース

<!-- 次は既定の運用。運用が違えば本文と図を書き換える -->

ブランチは、`main`、`develop`、issue ごとの作業用のブランチにする。

- `main` はリリース済みの状態を指す。`develop` は次のリリースに向けて変更を集める。
- 作業用のブランチは `develop` から切る。名前は `feature/<issue 番号>` にし、不具合は `fix/<issue 番号>` にする。`develop` へは、pull request を通して取り込む。
- リリースは、`develop` を `main` へ pull request で取り込み、`main` のコミットにタグを付ける。バージョンはセマンティック バージョニングに従う。
- リリース後の緊急の修正は、`main` から `hotfix/<issue 番号>` を切り、`main` と `develop` の両方へ取り込む。
- 保護するブランチは `main`、`develop` である。直接はコミットせず、pull request を通して取り込む。直接コミットを許す場面があれば、この行の下に場面と理由を書く。

<!-- 次のバージョンを何から決めるか。コミットメッセージからなら release-please、変更ごとの記述からなら changesets -->

```mermaid
gitGraph
    commit id: "v1.0.0" tag: "v1.0.0"
    branch develop
    checkout develop
    commit id: "dev-1"
    branch "feature/12"
    checkout "feature/12"
    commit id: "12-1"
    checkout develop
    branch "fix/13"
    checkout "fix/13"
    commit id: "13-1"
    checkout develop
    merge "fix/13" id: "PR #13"
    checkout "feature/12"
    commit id: "12-2"
    checkout develop
    merge "feature/12" id: "PR #12"
    checkout main
    merge develop id: "release" tag: "v1.1.0"
```

## issue と pull request

issue と pull request は GitHub で扱い、`gh` で操作する。

- 作業は issue から始める。pull request は 1 つの issue に対応させる。
- 題と本文の書き方は、スキル write-issue-pr に従う。

ラベルは `<軸>:<値>` の形にし、軸ごとに色をそろえる。

| 軸          | 値                                                                                                                                                            | 色        | 付け方                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| `type:*`    | `type:feature`、`type:bug`、`type:research`、`type:task`、`type:chore`                                                                                        | `#1d76db` | すべての issue に 1 件                                                           |
| `phase:*`   | `phase:design`、`phase:implementation`                                                                                                                        | `#5319e7` | 設計の issue は `phase:design`、実装の issue は `phase:implementation`           |
| `domain:*`  | `domain:workflow`、`domain:execution`、`domain:element`、`domain:artifact`、`domain:diff`、`domain:web`、`domain:agent`、`domain:infra`、横断は `domain:core` | `#0e8a16` | 実装の対象が決まる issue に 1 件以上                                             |
| `epic`      | `epic`                                                                                                                                                        | `#fbca04` | 複数の段階や spec にまたがる親の issue                                           |
| `status:*`  | `status:designing`、`status:ready-to-implement`、`status:implementing`                                                                                        | `#0052cc` | 設計の対象の issue に常に 1 件                                                   |
| `quality:*` | `quality:requirement-gap`、`quality:design-gap`                                                                                                               | `#d93f0b` | 前の段階の取りこぼしから派生した issue にだけ付ける。変更元の issue には付けない |

`domain:*` の値は、モジュールの名前に対応する。モジュールを増やすときは、ラベルも足す。
