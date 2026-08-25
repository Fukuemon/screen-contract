import { isPortablePathSegment } from "@screen-contract/core-execution";

/**
 * 保存の鍵。
 *
 * 実装は adapter/store のファイルシステムであり、鍵は run や画面の識別子として
 * 外部入力 (HTTP / JSON-RPC / エージェント) 由来になる。検証していない文字列を
 * そのままパス組み立てへ渡すと、`../` で任意のファイルを上書きできる。
 * 生成経路を parseStoreKey に限ることで、未検証の値を型で弾く。
 */
export type StoreKey = string & { readonly __brand: "StoreKey" };

/**
 * 先頭を英数字に縛ることで `.` と `..` のセグメントも同時に弾く。
 *
 * **小文字だけを許す。** macOS と Windows の既定ファイルシステムは大文字小文字を
 * 区別しないため、`screens/Login` と `screens/login` は鍵としては別なのに
 * ファイルとしては同一になり、片方の正本がもう片方を上書きする
 * (`AuthProfileName` と同じ理由)。
 */
const STORE_KEY_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

/** パスの長さと段数の上限。鍵は URL のパスから直接来るため、外から伸ばせる。 */
const MAX_SEGMENT_LENGTH = 64;
const MAX_SEGMENTS = 8;

export function parseStoreKey(raw: string): StoreKey {
  const segments = raw.split("/");
  // 文字種の検査だけでは足りない。Windows は末尾のドットを落とすため `a.` が
  // `a` と衝突し、予約デバイス名 (`con` 等) はそもそもファイルにできない。
  const ok =
    segments.length <= MAX_SEGMENTS &&
    segments.every(
      (segment) =>
        segment.length <= MAX_SEGMENT_LENGTH &&
        STORE_KEY_SEGMENT.test(segment) &&
        isPortablePathSegment(segment),
    );
  if (!ok) {
    // 拒否した値をメッセージへ入れない。ログや API 応答へ外部入力が反射する。
    throw new Error(
      "保存の鍵の規則に合いません (小文字英数で始まるセグメントを / で連結する。1 セグメント 64 文字・8 段まで。末尾のドットとプラットフォーム予約名は使えない)",
    );
  }
  return raw as StoreKey;
}

/**
 * 保存の置き場。
 *
 * **draft と正本を別の置き場に分ける。** 同一ファイルの版として持つ形では
 * 分離が実装の約束になり、「別のものとして保存されている」ことを構造で
 * 示せない (ADR-0017)。承認は draft を正本の置き場へ確定させる操作になる。
 *
 * **実行履歴を正本と混ぜない。** 混ぜると、鍵を合わせた `run.start` が承認を
 * 経ずに正本を上書きできる。`authoritative` へ書くのは承認だけである。
 */
export type StoreSpace = "draft" | "authoritative" | "history";

/**
 * 保存は機能横断のため app が Port を定義する。実装は adapter/store。
 *
 * 実装側は、鍵から組み立てた絶対パスが保存先ディレクトリの配下に収まることを
 * 解決後にもう一度検証する。型は生成経路を縛るだけで、実装の検証を免除しない。
 */
export interface StorePort {
  save(space: StoreSpace, key: StoreKey, value: string): Promise<void>;
  load(space: StoreSpace, key: StoreKey): Promise<string | undefined>;
}

/**
 * 正本へ書ける権限。
 *
 * **承認 use case だけがこれを受け取る。** `StorePort` をそのまま渡すと、
 * どの use case からでも `save("authoritative", ...)` を呼べてしまい、
 * 「正本への反映は人間の承認後にのみ行う」(ADR-0017) が型で守られない。
 */
export interface AuthoritativeWriter {
  commit(key: StoreKey, value: string): Promise<void>;
}

/** draft と履歴だけを扱える窓。正本へは書けない。 */
export interface DraftStore {
  saveDraft(key: StoreKey, value: string): Promise<void>;
  loadDraft(key: StoreKey): Promise<string | undefined>;
  saveHistory(key: StoreKey, value: string): Promise<void>;
}

export function draftStoreOf(store: StorePort): DraftStore {
  return {
    saveDraft: (key, value) => store.save("draft", key, value),
    loadDraft: (key) => store.load("draft", key),
    saveHistory: (key, value) => store.save("history", key, value),
  };
}

export function authoritativeWriterOf(store: StorePort): AuthoritativeWriter {
  return { commit: (key, value) => store.save("authoritative", key, value) };
}
