import { createHash } from "node:crypto";

/**
 * draft の版。
 *
 * **内容ハッシュとする。** カウンタの永続化が要らず、内容が同じなら同じ値に
 * なるため、編集して元に戻した draft は `stale` にならない (ADR-0017)。
 */
export type Revision = string & { readonly __brand: "Revision" };

/**
 * SHA-256 を使う。
 *
 * **この値は承認ゲートの判定に使う。** 脅威モデルは ADR-0017 自身が置く
 * 「AI 出力を信用しない」であり、draft の内容は攻撃者が完全に選べる。
 * 非暗号学的ハッシュでは、人間がレビューした内容と同じ版になる別の内容を
 * 作れてしまい、承認待ちの間の差し替えを検出できない。
 *
 * IR 版 (core/workflow) とは方式を揃えない。あちらは core であり Node を
 * 参照できず、目的も偶発的な差分の検出である。**同じ「内容ハッシュ」という
 * 考え方を共有するだけで、実装は別である。**
 */
export function contentRevision(content: string): Revision {
  return createHash("sha256").update(content, "utf8").digest("hex") as Revision;
}
