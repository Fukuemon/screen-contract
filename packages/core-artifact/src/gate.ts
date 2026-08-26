/**
 * 書き換え抑止の判定。
 *
 * 意味上の変更がなければ書き換えず、タイムスタンプも更新しない
 * (artifact-generation feature)。判定規則はテキスト比較 (完全一致) に統一した
 * (ADR-0028)。生スクリーンショットだけはバイナリなのでハッシュで比べる。
 */

export type ChangeDecision = "unchanged" | "changed";

/** テキスト成果物 (SVG / Markdown / POM)。`undefined` は既存が無いことを表す。 */
export function decideTextArtifact(existing: string | undefined, next: string): ChangeDecision {
  return existing === next ? "unchanged" : "changed";
}

/**
 * 生スクリーンショット。ハッシュの計算は core の外 (app) で行う。
 * core は純粋計算に留め、バイナリと暗号ライブラリを持ち込まない。
 */
export function decideRawImage(existingHash: string | undefined, nextHash: string): ChangeDecision {
  return existingHash === nextHash ? "unchanged" : "changed";
}

/** `meta.json` の中身。書き換え抑止と差分検知のための機械可読情報である。 */
export interface ArtifactMeta {
  /** 状態 ID → 生スクリーンショットのハッシュ。 */
  readonly rawImageHashes: Readonly<Record<string, string>>;
}

export interface GateInput {
  readonly stateId: string;
  readonly svg: string;
  readonly table: string;
  readonly rawImageHash: string;
}

export interface GateExisting {
  readonly svg?: string | undefined;
  readonly table?: string | undefined;
  readonly meta?: ArtifactMeta | undefined;
}

export interface GateResult {
  readonly svg: ChangeDecision;
  readonly table: ChangeDecision;
  readonly rawImage: ChangeDecision;
}

/**
 * 状態 1 つ分の判定。**再採番では生スクリーンショットを触らない。**
 * `badges` の並べ替えで変わるのは SVG のテキスト数行だけである。
 */
export function decideArtifacts(input: GateInput, existing: GateExisting): GateResult {
  return {
    svg: decideTextArtifact(existing.svg, input.svg),
    table: decideTextArtifact(existing.table, input.table),
    rawImage: decideRawImage(existing.meta?.rawImageHashes[input.stateId], input.rawImageHash),
  };
}
