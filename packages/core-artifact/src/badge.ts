/**
 * バッジ配置の計算。
 *
 * 撮影と注釈は 2 段に分離する。撮影は adapter/browser が行い、ここは撮影結果
 * (bounding box) を引数に取る純粋計算である (artifact-generation feature)。
 */

import type { BoundingBox } from "@screen-contract/core-element";

export interface BadgeStyle {
  /** バッジの外接正方形の 1 辺。 */
  readonly size: number;
  /** box の左上角からの外向きオフセット。 */
  readonly offset: number;
  /** 重なりを避けるときの 1 回あたりの右方向のずらし量。 */
  readonly shift: number;
  /** ずらしの上限回数。超えたら解決不能として警告する。 */
  readonly maxShifts: number;
}

export const DEFAULT_BADGE_STYLE: BadgeStyle = {
  size: 20,
  offset: 4,
  shift: 22,
  maxShifts: 8,
};

export interface BadgePlacement {
  /** 構成番号。state の `badges` リストの位置がそのまま番号になる (ADR-0005)。 */
  readonly number: number;
  readonly elementId: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export type BadgeWarningReason = "no-box" | "unresolvable-overlap" | "out-of-image";

export interface BadgeWarning {
  readonly elementId: string;
  readonly reason: BadgeWarningReason;
}

export interface BadgeLayout {
  readonly placements: readonly BadgePlacement[];
  readonly warnings: readonly BadgeWarning[];
}

export interface BadgeLayoutInput {
  /** 構成番号順の要素 ID。state の `badges` をそのまま渡す。 */
  readonly badges: readonly string[];
  readonly boxes: ReadonlyMap<string, BoundingBox>;
  readonly image: { readonly width: number; readonly height: number };
  /** 撮影時に切り抜いた場合の原点。box を切り抜き後の画像座標へ移す。 */
  readonly clip?: { readonly x: number; readonly y: number } | undefined;
  readonly style?: BadgeStyle | undefined;
}

function overlaps(a: BadgePlacement, x: number, y: number, size: number): boolean {
  return a.x < x + size && x < a.x + a.size && a.y < y + size && y < a.y + a.size;
}

/**
 * バッジを box の左上角の**外側**に置く。画像の端にかかる場合は box の内側へ倒す。
 * 重なる場合は読み順 (構成番号順) で後の要素を右へずらす。
 */
export function layoutBadges(input: BadgeLayoutInput): BadgeLayout {
  const style = input.style ?? DEFAULT_BADGE_STYLE;
  const originX = input.clip?.x ?? 0;
  const originY = input.clip?.y ?? 0;
  const placements: BadgePlacement[] = [];
  const warnings: BadgeWarning[] = [];

  input.badges.forEach((elementId, position) => {
    const box = input.boxes.get(elementId);
    if (box === undefined) {
      // 撮影結果に無い要素は描けない。黙って飛ばすと番号が欠けた理由が読めない。
      warnings.push({ elementId, reason: "no-box" });
      return;
    }
    const left = box.x - originX;
    const top = box.y - originY;

    // 既定は左上角の外側。はみ出す辺だけ内側へ倒す。
    let x = left - style.size - style.offset;
    let y = top - style.size - style.offset;
    if (x < 0) {
      x = left + style.offset;
    }
    if (y < 0) {
      y = top + style.offset;
    }

    let shifts = 0;
    while (
      shifts < style.maxShifts &&
      placements.some((placed) => overlaps(placed, x, y, style.size))
    ) {
      x += style.shift;
      shifts += 1;
    }

    // 決定的に解決できない重なりは警告として報告する。位置は動かさず、
    // 生成結果が入力から決まる性質は保つ。
    if (placements.some((placed) => overlaps(placed, x, y, style.size))) {
      warnings.push({ elementId, reason: "unresolvable-overlap" });
    }
    // 重なりとは別に報告する。倒した先が画像外になる経路 (clip の範囲より外の
    // box、ずらしの行き過ぎ) は重なりが無くても起きる。理由を混ぜると、
    // 警告を読んで何を直せばよいかが分からなくなる。
    if (
      x < 0 ||
      y < 0 ||
      x + style.size > input.image.width ||
      y + style.size > input.image.height
    ) {
      warnings.push({ elementId, reason: "out-of-image" });
    }
    placements.push({ number: position + 1, elementId, x, y, size: style.size });
  });

  return { placements, warnings };
}
