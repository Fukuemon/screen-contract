import type { ElementId } from "@screen-contract/domain";

/**
 * 画面上の実要素と、仕様書上の要素定義を対応づける。
 *
 * core/element は純粋ロジックであり、ブラウザへ直接アクセスしない。Snapshot・
 * 座標・box は入力値として受け取る (element-mapping feature)。**bounding box が
 * Accessibility Snapshot の応答に含まれるとは限らない**ため、取得手段は問わない。
 */

/** 画面上の位置。撮影時の viewport ピクセル座標。 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 観測した要素 1 件。取得手段は adapter に閉じる。 */
export interface ObservedElement {
  readonly role: string;
  readonly name: string;
  readonly box: BoundingBox;
}

/**
 * Semantic Locator。
 *
 * skeleton は role+name までとする。祖先方向の候補列と label / testid の
 * 優先順位は要素選択 (Web UI で「ボタンではなくカード全体を選ぶ」) の機能で
 * あり、記録では第一候補だけで足りる。
 */
export interface SemanticLocator {
  readonly role: string;
  readonly name: string;
}

export interface ElementDef {
  readonly id: ElementId;
  readonly name: string;
  readonly type: string;
  readonly locator: SemanticLocator;
}

/**
 * Locator 解決の分類。
 *
 * `ambiguous` を `not-found` と混ぜない。前者は Locator の絞り込みで直せるが、
 * 後者は要素そのものが無い。呼び出し側の対処が違う。
 */
export type Resolution =
  | { readonly kind: "resolved"; readonly locator: SemanticLocator }
  | { readonly kind: "not-found" }
  | { readonly kind: "ambiguous"; readonly locator: SemanticLocator; readonly matches: number };

/** 座標が box の内側にあるか。境界は含める。 */
function contains(box: BoundingBox, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

function area(box: BoundingBox): number {
  return box.width * box.height;
}

/**
 * 座標を含む要素のうち、**最小のもの**を第一候補にする。
 *
 * 大きい要素を先に選ぶと、常に外側のコンテナが当たって操作対象へ届かない。
 * 面積が同じときは一覧の並び順を保つ。同じ入力から同じ出力になるようにする。
 */
export function elementAt(
  elements: readonly ObservedElement[],
  x: number,
  y: number,
): ObservedElement | undefined {
  let best: ObservedElement | undefined;
  for (const element of elements) {
    if (!contains(element.box, x, y)) {
      continue;
    }
    if (best === undefined || area(element.box) < area(best.box)) {
      best = element;
    }
  }
  return best;
}

/** その一覧の中で Locator が一意に解決できるかを分類する。 */
export function resolve(
  elements: readonly ObservedElement[],
  locator: SemanticLocator,
): Resolution {
  const matches = elements.filter((e) => e.role === locator.role && e.name === locator.name).length;
  if (matches === 0) {
    return { kind: "not-found" };
  }
  if (matches > 1) {
    return { kind: "ambiguous", locator, matches };
  }
  return { kind: "resolved", locator };
}

/**
 * 座標を要素へ解決した結果。
 *
 * 記録は要素選択と同じ規則の部分集合を使う。違いは 2 点だけで、既存定義に
 * 一致すればその `ref` を使うことと、解決できない場合に記録では止めずに
 * `clickPoint` と警告を残すことである。
 */
export type CoordinateResolution =
  | { readonly kind: "existing"; readonly ref: ElementId; readonly locator: SemanticLocator }
  | { readonly kind: "new"; readonly element: ElementDef }
  | {
      readonly kind: "unresolved";
      readonly x: number;
      readonly y: number;
      readonly warning: string;
    };

export interface ResolveCoordinateInput {
  readonly elements: readonly ObservedElement[];
  readonly known: readonly ElementDef[];
  readonly x: number;
  readonly y: number;
  /** 新しい要素定義に付ける永続 ID。生成規則は呼び出し側が持つ。 */
  readonly nextId: (locator: SemanticLocator) => ElementId;
}

export function resolveCoordinate(input: ResolveCoordinateInput): CoordinateResolution {
  const target = elementAt(input.elements, input.x, input.y);
  if (target === undefined) {
    return {
      kind: "unresolved",
      x: input.x,
      y: input.y,
      warning: "座標を含む要素がありません",
    };
  }
  const locator: SemanticLocator = { role: target.role, name: target.name };
  const resolution = resolve(input.elements, locator);
  if (resolution.kind !== "resolved") {
    // 一意にならない Locator を提案しない。提案すると、実行時に別の要素へ
    // 当たる DSL ができる。
    return {
      kind: "unresolved",
      x: input.x,
      y: input.y,
      warning:
        resolution.kind === "ambiguous"
          ? "同じ role と名前の要素が複数あり、一意に解決できません"
          : "要素を一意に解決できません",
    };
  }
  const existing = input.known.find(
    (e) => e.locator.role === locator.role && e.locator.name === locator.name,
  );
  if (existing !== undefined) {
    // 記録のたびに同じ要素が重複定義されないようにする。
    return { kind: "existing", ref: existing.id, locator };
  }
  return {
    kind: "new",
    element: {
      id: input.nextId(locator),
      // 名称と種別は Accessible Name と role から機械的に初期値を作る。
      // より良い候補が必要な場合はエージェントが draft を直す (ADR-0019)。
      name: locator.name,
      type: locator.role,
      locator,
    },
  };
}

/** 候補生成の Port。MVP では実装しない。推論はエージェント自身が行う (ADR-0019)。 */
export interface AiPort {
  suggestName(input: unknown): Promise<string>;
}
