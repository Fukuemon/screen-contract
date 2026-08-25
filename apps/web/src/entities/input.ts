/**
 * viewport のマウス入力を CDP の座標へ写す。
 *
 * **表示は縮尺されている。** `<img>` の実寸ではなく viewport の論理サイズへ
 * 変換しないと、対象ページの別の場所を押すことになる。
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

export type MouseEventType = "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel";

/** CDP のボタン名。既定は左。 */
export function cdpButton(button: number): "left" | "middle" | "right" | "none" {
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

/** CDP の修飾キーはビットフラグ (Alt=1, Ctrl=2, Meta=4, Shift=8)。 */
export function cdpModifiers(event: Modifiers): number {
  return (
    (event.altKey ? 1 : 0) |
    (event.ctrlKey ? 2 : 0) |
    (event.metaKey ? 4 : 0) |
    (event.shiftKey ? 8 : 0)
  );
}

export interface MouseInput {
  readonly type: "input_mouse";
  readonly eventType: MouseEventType;
  readonly x: number;
  readonly y: number;
  readonly button: string;
  readonly clickCount: number;
  readonly modifiers: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
}

export function mouseInput(
  eventType: MouseEventType,
  point: Point,
  button: number,
  modifiers: Modifiers,
): MouseInput {
  return {
    type: "input_mouse",
    eventType,
    x: point.x,
    y: point.y,
    button: cdpButton(button),
    // 押下だけが「何回目のクリックか」を持つ。離す側に入れると二重に数える。
    clickCount: eventType === "mousePressed" ? 1 : 0,
    modifiers: cdpModifiers(modifiers),
  };
}

/** ホイールを対象ページのスクロールとして送る。 */
export function wheelInput(
  point: Point,
  delta: { readonly deltaX: number; readonly deltaY: number },
  modifiers: Modifiers,
): MouseInput {
  return {
    type: "input_mouse",
    eventType: "mouseWheel",
    x: point.x,
    y: point.y,
    button: "none",
    clickCount: 0,
    modifiers: cdpModifiers(modifiers),
    deltaX: delta.deltaX,
    deltaY: delta.deltaY,
  };
}
