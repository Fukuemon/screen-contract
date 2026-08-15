/**
 * 全 core が共有する型のみを置く。**実行時の値を置かない。**
 *
 * core → domain は型の参照だけが許される (context/architecture.md)。値を置くと
 * core から呼べない API になり、置いた側は使われないことに気付けない。
 */

/** 画面要素の同一性を追跡する識別子。表示用の構成番号とは独立する (ADR-0012)。 */
export type ElementId = string & { readonly __brand: "ElementId" };

/** ブラウザから観測した画面の構造。生データの解釈は core/element が担う。 */
export interface Snapshot {
  readonly capturedAt: string;
}
