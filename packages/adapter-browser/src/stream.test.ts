import type { PageInput } from "@screen-contract/core-execution";
import { describe, expect, it } from "vitest";
import { toAgentBrowserInput } from "./stream.js";

const NONE = { alt: false, ctrl: false, meta: false, shift: false };
const cdp = (input: PageInput): Record<string, unknown> =>
  JSON.parse(toAgentBrowserInput(input)) as Record<string, unknown>;

/**
 * 中立の入力から実行基盤の語彙への写像。
 *
 * **ここが唯一の写像である。** interface 層 (api / web) が同じ語彙を持つと、
 * 基盤を差し替えたときに画面まで直すことになる (ADR-0013)。
 */
describe("toAgentBrowserInput", () => {
  it("押下を写す", () => {
    expect(
      cdp({ kind: "pointer", phase: "down", x: 1, y: 2, button: "left", modifiers: NONE }),
    ).toEqual({
      type: "input_mouse",
      eventType: "mousePressed",
      x: 1,
      y: 2,
      button: "left",
      clickCount: 1,
      modifiers: 0,
    });
  });

  it("押下だけがクリック回数を持つ", () => {
    // 離す側に入れると二重に数える。
    expect(
      cdp({ kind: "pointer", phase: "up", x: 1, y: 2, button: "left", modifiers: NONE })[
        "clickCount"
      ],
    ).toBe(0);
    expect(
      cdp({ kind: "pointer", phase: "move", x: 1, y: 2, button: "none", modifiers: NONE })[
        "clickCount"
      ],
    ).toBe(0);
  });

  it("スクロールを写す", () => {
    expect(cdp({ kind: "scroll", x: 1, y: 2, dx: 3, dy: -120, modifiers: NONE })).toEqual({
      type: "input_mouse",
      eventType: "mouseWheel",
      x: 1,
      y: 2,
      button: "none",
      clickCount: 0,
      modifiers: 0,
      deltaX: 3,
      deltaY: -120,
    });
  });

  it("修飾キーをビットフラグへ写す", () => {
    // Alt=1, Ctrl=2, Meta=4, Shift=8。
    const at = (modifiers: typeof NONE): unknown =>
      cdp({ kind: "pointer", phase: "down", x: 0, y: 0, button: "left", modifiers })["modifiers"];
    expect(at({ ...NONE, alt: true })).toBe(1);
    expect(at({ ...NONE, ctrl: true })).toBe(2);
    expect(at({ ...NONE, meta: true })).toBe(4);
    expect(at({ ...NONE, shift: true })).toBe(8);
    expect(at({ alt: true, ctrl: true, meta: true, shift: true })).toBe(15);
  });

  it.each([
    ["down", "keyDown"],
    ["up", "keyUp"],
    ["text", "char"],
  ] as const)("キーの %s を写す", (phase, eventType) => {
    expect(cdp({ kind: "key", phase, key: "a", modifiers: NONE })).toEqual({
      type: "input_keyboard",
      eventType,
      key: "a",
      modifiers: 0,
    });
  });

  it("持たない項目を送らない", () => {
    // `undefined` をそのまま載せると、実行基盤側で「空文字を指定した」と
    // 読まれうる。
    expect(cdp({ kind: "key", phase: "text", text: "あ", modifiers: NONE })).toEqual({
      type: "input_keyboard",
      eventType: "char",
      text: "あ",
      modifiers: 0,
    });
  });
});
