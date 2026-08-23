# ADR-0028: 注釈画像を SVG とし生スクリーンショットを別ファイルで参照する

## 状態

承認

## 決定日

2026-08-23

## 背景

- [adr/0007](0007-visual-diff.md) と [artifact-generation feature](../design/features/artifact-generation/DesignDoc_artifact-generation.md) は、**撮影と注釈を 2 段に分離**することを既に定めている。生スクリーンショットと bounding box を保存し、バッジは何度でも再合成する。差分検知の対象は生スクリーンショットであり、バッジを焼き込んだ画像は対象にしない。
- 一方、成果物の形式は PNG に固定されていた。[design/DesignDoc.md](../design/DesignDoc.md) の成功条件が「構成番号付き **PNG** 画像と Markdown テーブルを生成できる」と書き、artifact-generation feature も同じ文を再掲している。
- この固定が 2 つの歪みを生んでいた。
  - **書き換え抑止の判定規則が 2 本ある。** Markdown と POM は「テキスト比較 (完全一致)」だが、注釈画像 PNG だけは「生成入力の比較」(スクリーンショットのハッシュ + badges の要素列と各 (番号, bounding box, バッジ位置) の組) という別規則を要する。PNG は描画エンジンの環境差でバイトが揺れるためである。
  - **core/artifact に画像合成ライブラリが要る。** [context/architecture.md](../context/architecture.md) は core を外部技術に依存しない純粋ロジックとするが、画像合成ライブラリの多くはネイティブバインディングを持つ。

## 決定

- **注釈画像は SVG として出力する。** 生スクリーンショットを別ファイルとして保存し、SVG から相対参照する (`<image href="<state-id>.raw.png">`)。
- 既定のファイル名は `<state-id>.svg` (注釈画像) と `<state-id>.raw.png` (生スクリーンショット) とし、同じディレクトリに置く。
- **書き換え抑止の判定を、SVG のテキスト比較 (完全一致) へ統一する。** 生成入力の比較という別規則を持たない。
- core/artifact は **SVG 文字列を生成する純粋計算**のままとする。画像合成ライブラリを core へ入れない。
- [design/DesignDoc.md](../design/DesignDoc.md) の成功条件を「構成番号付きの**注釈画像**と Markdown テーブルを生成できる」へ一般化する。形式の判断は本 ADR を正本とする。

差分検知との関係を明示する。**注釈画像の形式は差分検知に影響しない。** 差分検知の対象は生スクリーンショット (`<state-id>.raw.png`) であり、バッジを焼き込んだ画像は対象にしないという既存の判断 (artifact-generation feature) をそのまま引き継ぐ。

## 代替案

- **SVG を生成して PNG へラスタライズする**: 成果物が PNG のままで配布先を選ばない。しかしラスタライズのために Port が 1 つ増え、artifact-generation feature の「Port なし」を変えることになる。加えて**書き換え抑止が生成入力の比較のまま残る**ため、判定規則が 2 本ある状態が解消しない。得るものが配布先の自由度だけであるため却下。
- **SVG を正本とし配布用に PNG も出す**: 上位文書の変更が小さい。しかし成果物が 1 状態あたり 1 つ増え、**どちらが正本か曖昧になる**。生成物が生成物を持つ構造は書き換え抑止の判定も複雑にするため却下。
- **pure-JS の PNG ライブラリで直接描く**: ネイティブ依存を core へ入れずに済み、数字のグリフを埋め込めばフォント環境にも依存しない。上位文書の変更も要らない。しかし**判定規則が 2 本のまま残る**。SVG を採れば規則が 1 本に減るため却下。
- **core が native の画像合成ライブラリを直接使う**: 実装が最も楽で描画能力も高い。しかし core にネイティブ依存が入り、[context/architecture.md](../context/architecture.md) の「core は純粋ロジック」と擦れる。フォント環境で出力が揺れる点も決定性を損なうため却下。

## 影響

### 良い影響

- **書き換え抑止の判定規則が 1 本になる。** Markdown・POM・注釈画像のすべてがテキスト比較 (完全一致) で判定でき、生成入力の比較という別経路が消える。
- **再採番で画像を触らない。** `badges` の並べ替えでは SVG のテキスト数行だけが変わり、生スクリーンショットは変更されない。git の差分としても読める。
- core/artifact が純粋計算のままでいられる。画像合成ライブラリのネイティブ依存が core に入らない。

### 悪い影響 / トレードオフ

- **外部参照する SVG は単体で配れない。** `raw.png` と一緒に動かさないと壊れる。Word や Confluence へ貼る運用では PNG が要るが、[design/DesignDoc.md](../design/DesignDoc.md) の Goal は配布先を規定していない。PNG が必要になった場合は、ラスタライズを adapter として後から足せる。
- 生成物が 1 状態あたり 2 ファイル (SVG + raw.png) になる。ただし生スクリーンショットの保存は artifact-generation feature が既に要求しており、実質的な増加ではない。

### 影響範囲

- 対象モジュール / package: artifact / diff

## 実装・運用への反映

- spec 更新要否: 要 — `specs/4-walking-skeleton/index.md` の D11 が本 ADR を参照する (実施済み)
- context / AI 向け設定更新要否:
  - [design/DesignDoc.md](../design/DesignDoc.md) の Why/What の成功条件を「構成番号付きの注釈画像」へ一般化する — 本 commit で実施
  - [design/features/artifact-generation/DesignDoc_artifact-generation.md](../design/features/artifact-generation/DesignDoc_artifact-generation.md) の背景・要件解釈 / 成果物の種類と生成単位 / 書き換え抑止 / ファイル配置を改訂する — 本 commit で実施
  - [design/DesignDoc.md](../design/DesignDoc.md) の ADR 表へ本 ADR を追加する — 本 commit で実施

## 関連ドキュメント / チケット

- [design/features/artifact-generation/DesignDoc_artifact-generation.md](../design/features/artifact-generation/DesignDoc_artifact-generation.md): 撮影と注釈の 2 段分離、バッジ配置と書き換え抑止の規則 (本 ADR の反映後は同 doc が形式以外の正本)
- [adr/0007](0007-visual-diff.md): 差分検知の対象が生スクリーンショットであること
- [adr/0025](0025-image-diff-library.md): 画像差分のライブラリ (本 ADR は差分検知の対象を変えない)
- [context/architecture.md](../context/architecture.md): core を純粋ロジックとする規約
- spec / PR: `specs/4-walking-skeleton/` の D11
