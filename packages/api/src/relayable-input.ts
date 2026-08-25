/**
 * 対象ページへ中継してよい入力。
 *
 * **語彙を列挙し、通す項目だけを組み直して送る。** 素通しにすると、認証を
 * 通した client が実行基盤の配信ソケットへ任意の JSON を送れる。中継の口は
 * 「操作モードのマウスとキー入力」のためにあり、実行基盤の全機能を開けるため
 * ではない (ADR-0008)。
 */

/** マウスの種別。ここに無いものは中継しない。 */
const MOUSE_EVENTS = new Set(["mousePressed", "mouseReleased", "mouseMoved", "mouseWheel"]);
const KEY_EVENTS = new Set(["keyDown", "keyUp", "rawKeyDown", "char"]);
const TOUCH_EVENTS = new Set(["touchStart", "touchEnd", "touchMove", "touchCancel"]);
/** ボタン名も列挙で縛る。任意の文字列を通すと「組み直す」方針から外れる。 */
const BUTTONS = new Set(["none", "left", "middle", "right", "back", "forward"]);

/** 押しっぱなしの回数。桁外れを渡すと実行基盤側で意味を失う。 */
const MAX_CLICK_COUNT = 3;
/** 座標の上限。viewport の上限 (4096) より十分大きく取り、負も許す (画面外への drag)。 */
const MAX_COORDINATE = 100_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function coordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE
    ? value
    : undefined;
}

function optionalNumber(value: unknown, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= max
    ? value
    : undefined;
}

function optionalString(value: unknown, max = 64): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

/** undefined の項目を落とす。実行基盤へ `"key": undefined` を送らない。 */
function compact(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

function mouse(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const eventType = optionalString(raw["eventType"]);
  const x = coordinate(raw["x"]);
  const y = coordinate(raw["y"]);
  if (
    eventType === undefined ||
    !MOUSE_EVENTS.has(eventType) ||
    x === undefined ||
    y === undefined
  ) {
    return undefined;
  }
  return compact({
    type: "input_mouse",
    eventType,
    x,
    y,
    button: BUTTONS.has(raw["button"] as string) ? (raw["button"] as string) : undefined,
    clickCount: optionalNumber(raw["clickCount"], MAX_CLICK_COUNT),
    modifiers: optionalNumber(raw["modifiers"], 15),
    deltaX: coordinate(raw["deltaX"]),
    deltaY: coordinate(raw["deltaY"]),
  });
}

function keyboard(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const eventType = optionalString(raw["eventType"]);
  if (eventType === undefined || !KEY_EVENTS.has(eventType)) {
    return undefined;
  }
  return compact({
    type: "input_keyboard",
    eventType,
    key: optionalString(raw["key"], 32),
    code: optionalString(raw["code"], 32),
    // 貼り付けもここを通る。長さの上限だけ掛け、中身は解釈しない。
    text: optionalString(raw["text"], 4096),
    modifiers: optionalNumber(raw["modifiers"], 15),
    windowsVirtualKeyCode: optionalNumber(raw["windowsVirtualKeyCode"], 255),
  });
}

/** 同時に触る点の上限。実機でも 10 点を超えない。 */
const MAX_TOUCH_POINTS = 10;

function touch(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const eventType = optionalString(raw["eventType"]);
  const points = raw["touchPoints"];
  if (eventType === undefined || !TOUCH_EVENTS.has(eventType) || !Array.isArray(points)) {
    return undefined;
  }
  if (points.length > MAX_TOUCH_POINTS) {
    return undefined;
  }
  const mapped: Record<string, unknown>[] = [];
  for (const point of points) {
    const item = record(point);
    const x = coordinate(item?.["x"]);
    const y = coordinate(item?.["y"]);
    if (x === undefined || y === undefined) {
      return undefined;
    }
    mapped.push({ x, y });
  }
  return { type: "input_touch", eventType, touchPoints: mapped };
}

/**
 * 中継してよい形なら、通す項目だけで組み直した payload を返す。
 *
 * **元の文字列を返さない。** 返すと、列挙に無い項目がそのまま実行基盤へ届く。
 */
export function relayableInput(payload: string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return undefined;
  }
  const raw = record(value);
  if (raw === undefined) {
    return undefined;
  }
  const built =
    raw["type"] === "input_mouse"
      ? mouse(raw)
      : raw["type"] === "input_keyboard"
        ? keyboard(raw)
        : raw["type"] === "input_touch"
          ? touch(raw)
          : undefined;
  return built === undefined ? undefined : JSON.stringify(built);
}
