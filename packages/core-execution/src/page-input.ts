/**
 * 対象ページへ届ける入力。
 *
 * **実行基盤の語彙を使わない。** CDP の `input_mouse` / `mousePressed` /
 * 修飾キーのビットフラグをそのまま流すと、その語彙が interface 層 (api / web)
 * まで漏れ、実行基盤を差し替えられなくなる (ADR-0013)。写像は adapter に閉じる。
 *
 * **語彙を列挙し、通す項目だけを組み直して送る。** 素通しにすると、認証を
 * 通した client が実行基盤の配信ソケットへ任意の命令を送れる。中継の口は
 * 「操作モードのマウスとキー入力」のためにある (ADR-0008)。
 */

export type PointerPhase = "down" | "up" | "move";
export type PointerButton = "left" | "middle" | "right" | "none";
export type KeyPhase = "down" | "up" | "text";

export interface InputModifiers {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

export type PageInput =
  | {
      readonly kind: "pointer";
      readonly phase: PointerPhase;
      readonly x: number;
      readonly y: number;
      readonly button: PointerButton;
      readonly modifiers: InputModifiers;
    }
  /**
   * スクロール。
   *
   * **操作モードを要求しない。** 要素選択の前提であり、画面の外にある要素へ
   * 届くために要る (ADR-0008)。
   */
  | {
      readonly kind: "scroll";
      readonly x: number;
      readonly y: number;
      readonly dx: number;
      readonly dy: number;
      readonly modifiers: InputModifiers;
    }
  | {
      readonly kind: "key";
      readonly phase: KeyPhase;
      readonly key?: string | undefined;
      /** 貼り付けもここを通る。長さの上限だけ掛け、中身は解釈しない。 */
      readonly text?: string | undefined;
      readonly modifiers: InputModifiers;
    };

/** 座標の上限。viewport の上限 (4096) より十分大きく取り、負も許す (画面外への drag)。 */
const MAX_COORDINATE = 100_000;
const MAX_TEXT = 4096;
const MAX_KEY = 32;

const POINTER_PHASES = new Set<string>(["down", "up", "move"]);
const BUTTONS = new Set<string>(["left", "middle", "right", "none"]);
const KEY_PHASES = new Set<string>(["down", "up", "text"]);

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

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

/** 修飾キー。欠けていれば押していないものとして読む。 */
function modifiers(value: unknown): InputModifiers {
  const raw = record(value) ?? {};
  return {
    alt: raw["alt"] === true,
    ctrl: raw["ctrl"] === true,
    meta: raw["meta"] === true,
    shift: raw["shift"] === true,
  };
}

function pointer(raw: Record<string, unknown>): PageInput | undefined {
  const phase = raw["phase"];
  const x = coordinate(raw["x"]);
  const y = coordinate(raw["y"]);
  const button = raw["button"];
  if (
    typeof phase !== "string" ||
    !POINTER_PHASES.has(phase) ||
    x === undefined ||
    y === undefined ||
    typeof button !== "string" ||
    !BUTTONS.has(button)
  ) {
    return undefined;
  }
  return {
    kind: "pointer",
    phase: phase as PointerPhase,
    x,
    y,
    button: button as PointerButton,
    modifiers: modifiers(raw["modifiers"]),
  };
}

function scroll(raw: Record<string, unknown>): PageInput | undefined {
  const x = coordinate(raw["x"]);
  const y = coordinate(raw["y"]);
  const dx = coordinate(raw["dx"]);
  const dy = coordinate(raw["dy"]);
  if (x === undefined || y === undefined || dx === undefined || dy === undefined) {
    return undefined;
  }
  return { kind: "scroll", x, y, dx, dy, modifiers: modifiers(raw["modifiers"]) };
}

function key(raw: Record<string, unknown>): PageInput | undefined {
  const phase = raw["phase"];
  if (typeof phase !== "string" || !KEY_PHASES.has(phase)) {
    return undefined;
  }
  return {
    kind: "key",
    phase: phase as KeyPhase,
    key: text(raw["key"], MAX_KEY),
    text: text(raw["text"], MAX_TEXT),
    modifiers: modifiers(raw["modifiers"]),
  };
}

/**
 * 中継してよい形なら、通す項目だけで組み直したものを返す。
 *
 * **元の文字列を通さない。** 通すと、列挙に無い項目がそのまま実行基盤へ届く。
 */
export function parsePageInput(payload: string): PageInput | undefined {
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
  switch (raw["kind"]) {
    case "pointer":
      return pointer(raw);
    case "scroll":
      return scroll(raw);
    case "key":
      return key(raw);
    default:
      return undefined;
  }
}
