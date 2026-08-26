# ADR-0030: 画面の観測に CDP を直接使う

## 状態

承認

## 決定日

2026-08-26

## 背景

- [adr/0027](0027-agent-browser-bundling.md) は実行基盤を agent-browser とし、**呼び出しを CLI に閉じる**と定めた。プロセス境界が 1 つで済み、版の固定も配布も CLI の同梱で完結するためである。
- ところが CLI が返す要素一覧には**地の文が含まれない**。`snapshot` も `screenshot --annotate` も、要素参照を振るのは **role と accessible name の両方を持つ要素**だけである。

  ```text
  - heading "設定画面" [ref=e1]      ← 参照あり
  - paragraph                         ← 参照なし (name が空)
    - StaticText "walking skeleton…"  ← 参照なし (テキストノード)
  - button "設定を開く" [ref=e2]      ← 参照あり
  ```

- 画面仕様書は**説明文や注意書きにも番号を振る**。構成番号を振れる対象が「見出し・ボタン・リンク・入力欄」に限られるのでは、[adr/0005](0005-badge-renumbering.md) が定める採番の対象を満たせない。
- CLI に増やす向きのオプションは無い。`snapshot` の `-i` / `-c` / `-d` / `-s` はいずれも**絞る**方向である。
- あわせて、`--annotate` は box を返す代わりに**対象ページへ赤い枠と番号を描き込む**ことが実測で分かった。描画は配信の映像に映り、直後の操作とも競合する。

## 決定

- **観測にだけ CDP を直接使う。** agent-browser が公開する `get cdp-url` からタブの endpoint を引き、`Accessibility.getFullAXTree` と `DOM.getBoxModel` で box 付きの要素一覧を得る。
- **操作は CLI のままとする。** `open` / `click` / `press` / `fill` / `cookies` / `storage` / 配信は変えない。CDP へ寄せない。
- **対象ページで JS を実行しない。** `Runtime.evaluate` は使わない。使うと対象アプリの挙動を変えうるうえ、注入したコードが仕様書の対象に混ざる。
- 地の文は `actionable: false` として区別する。**番号は振れるが、クリックの記録には使わない** — テキストノードは Locator で探せず、再現できない ([adr/0026](0026-operation-recording.md))。
- ADR-0027 の「CLI に閉じる」は**操作について維持し、観測を例外とする**。

## 代替案

- **CLI のまま、地の文を諦める**: プロセス境界が 1 つで済む。しかし説明文へ番号を振れず、画面仕様書として成立しない。却下。
- **対象アプリ側に `role` / `aria-label` を付けてもらう**: 実行基盤を変えずに解ける。しかし**仕様書を作るために対象を直す**ことになり、既存アプリの現状を記録するという目的と逆になる。却下。
- **`agent-browser eval` で DOM を走査する**: CLI に閉じたまま地の文を取れる。しかし対象ページで任意 JS を実行することになり、走査のためのコードが対象の挙動に影響しうる。値が argv に載る問題もある。却下。
- **CDP へ全面移行する**: 語彙が 1 つになる。しかし agent-browser が持つセッション管理・配信・認証状態の注入を作り直すことになり、ADR-0027 で得たものを失う。却下。

## 影響

### 良い影響

- 地の文へ番号を振れる。実測で対象要素が 518 → 1208 件に増えた (note.com)。
- **対象ページへ描き込まない。** `--annotate` の枠が配信へ映る問題と、描画中のクリックが競合する問題が同時に消える。
- 速い。実測で 1208 要素 809ms (CLI の `snapshot` + `get box` は 518 要素 892ms)。

### 悪い影響 / トレードオフ

- **プロセス境界が 1 つ増える。** CLI に加えて CDP の WebSocket を持つ。接続が切れたら繋ぎ直す必要がある。
- **CDP の版に依存する。** `Accessibility.getFullAXTree` は安定しているが、Chrome の実装に紐づく。実行基盤を差し替えるときは、この経路も書き直すことになる。
- タブを選ぶ必要がある。`get cdp-url` が返すのはブラウザの endpoint であり、`/json/list` からページを選ぶ。開いている URL と一致するものを選び、無ければ最初のページを使う — 選べないまま失敗させると、URL の表記揺れだけで観測が止まる。

### 影響範囲

- 対象モジュール / package: adapter/browser (観測のみ) / core-element (`actionable`) / app (選択と記録の切り分け)

## 実装・運用への反映

- spec 更新要否: 要 — `specs/4-walking-skeleton/index.md` の D1 (「座標解決の入力は `--annotate screenshot` を使う」) を本 ADR が覆す
- context / AI 向け設定更新要否:
  - [context/testing.md](../context/testing.md) の実測表を更新する — 本 commit で実施
  - [design/features/element-mapping/DesignDoc_element-mapping.md](../design/features/element-mapping/DesignDoc_element-mapping.md) の「box の取得手段」を改める — 本 commit で実施

## 関連ドキュメント / チケット

- [adr/0027](0027-agent-browser-bundling.md): 実行基盤の同梱と CLI に閉じる判断 (本 ADR が観測について例外を作る)
- [adr/0013](0013-browser-port.md): Browser Port (差し替え可能性)
- [adr/0005](0005-badge-renumbering.md): 構成番号の採番対象
- [adr/0026](0026-operation-recording.md): 操作の記録 (地の文をクリックとして記録しない理由)
- spec / PR: `specs/4-walking-skeleton/` の D1
