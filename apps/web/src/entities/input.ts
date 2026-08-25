import type { PageInput } from "@screen-contract/api";

/**
 * viewport のマウス入力を対象ページの座標へ写す。
 *
 * **表示は縮尺されている。** `<img>` の実寸ではなく viewport の論理サイズへ
 * 変換しないと、対象ページの別の場所を押すことになる。
 *
 * **実行基盤の語彙を組み立てない。** CDP の `input_mouse` や修飾キーのビット
 * フラグをここで作ると、基盤を差し替えたときに画面まで直すことになる
 * (ADR-0013)。写像は adapter に閉じる。
 */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function toViewportPoint(
  client: Point,
  rect: Rect,
  viewport: ViewportSize,
): Point | undefined {
  if (rect.width <= 0 || rect.height <= 0) {
    // 描画前は縮尺が決まらない。0 除算の結果を座標として送らない。
    return undefined;
  }
  return {
    x: Math.round((client.x - rect.left) * (viewport.width / rect.width)),
    y: Math.round((client.y - rect.top) * (viewport.height / rect.height)),
  };
}

export type PointerPhase = "down" | "up" | "move";

/** DOM の `MouseEvent.button`。既定は左。 */
export function buttonOf(button: number): "left" | "middle" | "right" | "none" {
  switch (button) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return "none";
  }
}

export interface Modifiers {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export function modifiersOf(event: Modifiers) {
  return {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  };
}

export function pointerInput(
  phase: PointerPhase,
  point: Point,
  button: number,
  modifiers: Modifiers,
): PageInput {
  return {
    kind: "pointer",
    phase,
    x: point.x,
    y: point.y,
    button: buttonOf(button),
    modifiers: modifiersOf(modifiers),
  };
}

/** ホイールを対象ページのスクロールとして送る。 */
export function scrollInput(
  point: Point,
  delta: { readonly deltaX: number; readonly deltaY: number },
  modifiers: Modifiers,
): PageInput {
  return {
    kind: "scroll",
    x: point.x,
    y: point.y,
    dx: delta.deltaX,
    dy: delta.deltaY,
    modifiers: modifiersOf(modifiers),
  };
}

/**
 * キー入力を対象ページへ送る。
 *
 * **文字は `text` として送る。** キーコードから文字を組み立てると、配列や IME に
 * 依存する。1 文字の入力はそのまま文字として渡し、制御キーだけ名前で渡す。
 */
export function keyInput(
  event: { readonly key: string; readonly ctrlKey: boolean; readonly metaKey: boolean } & Modifiers,
): PageInput | undefined {
  // 修飾キー単体は送らない。押しっぱなしの間ずっと届き、対象が誤動作する。
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    return { kind: "key", phase: "text", text: event.key, modifiers: modifiersOf(event) };
  }
  // 名前付きのキーだけを通す。ここに無いものは対象ページで意味を持たない。
  const named = new Set([
    "Enter",
    "Tab",
    "Backspace",
    "Delete",
    "Escape",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
  ]);
  return named.has(event.key)
    ? { kind: "key", phase: "down", key: event.key, modifiers: modifiersOf(event) }
    : undefined;
}
