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

/**
 * Semantic Locator。要素の同一性は永続要素 ID が持ち、画面上の実要素は
 * これで見つける (element-mapping feature)。
 *
 * 実行基盤の一時的な要素参照は保存しない。撮影ごとに振り直されるため、
 * 版をまたいで持ち越せない。
 */
export interface SemanticLocator {
  readonly role: string;
  readonly name: string;
}

/** 画面上の位置。撮影時の viewport ピクセル座標。 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * box 付きの要素 1 件。座標から要素を解決する入力になる。
 *
 * Accessibility Snapshot の応答に box が含まれるとは限らないため、取得手段は
 * adapter に閉じる。core は入力値として受け取るだけで、取得手段を問わない
 * (element-mapping feature)。
 */
export interface ObservedElement {
  readonly role: string;
  readonly name: string;
  readonly box: BoundingBox;
}
