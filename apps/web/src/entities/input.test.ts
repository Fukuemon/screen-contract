import { describe, expect, it } from "vitest";
import { buttonOf, modifiersOf, pointerInput, scrollInput, toViewportPoint } from "./input.js";

const RECT = { left: 100, top: 50, width: 640, height: 360 };
const VIEWPORT = { width: 1280, height: 720 };

describe("toViewportPoint", () => {
  it("表示の縮尺を viewport の論理サイズへ戻す", () => {
    // 戻さないと、対象ページの別の場所を押すことになる。
    expect(toViewportPoint({ x: 100, y: 50 }, RECT, VIEWPORT)).toEqual({ x: 0, y: 0 });
    expect(toViewportPoint({ x: 420, y: 230 }, RECT, VIEWPORT)).toEqual({ x: 640, y: 360 });
    expect(toViewportPoint({ x: 740, y: 410 }, RECT, VIEWPORT)).toEqual({ x: 1280, y: 720 });
  });

  it("等倍なら座標をそのまま移す", () => {
    const same = { left: 0, top: 0, width: 1280, height: 720 };
    expect(toViewportPoint({ x: 10, y: 20 }, same, VIEWPORT)).toEqual({ x: 10, y: 20 });
  });

  it("描画前は座標を作らない", () => {
    // 0 除算の結果を座標として送らない。
    expect(toViewportPoint({ x: 1, y: 1 }, { ...RECT, width: 0 }, VIEWPORT)).toBeUndefined();
    expect(toViewportPoint({ x: 1, y: 1 }, { ...RECT, height: 0 }, VIEWPORT)).toBeUndefined();
  });
});

describe("入力の組み立て", () => {
  const NONE = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  it("ボタンを名前へ写す", () => {
    expect(buttonOf(0)).toBe("left");
    expect(buttonOf(1)).toBe("middle");
    expect(buttonOf(2)).toBe("right");
    expect(buttonOf(9)).toBe("none");
  });

  it("修飾キーを名前で持つ", () => {
    // **ビットフラグを画面で作らない。** 実行基盤の都合であり、基盤を
    // 差し替えると意味が変わる (ADR-0013)。
    expect(modifiersOf(NONE)).toEqual({ alt: false, ctrl: false, meta: false, shift: false });
    expect(modifiersOf({ ...NONE, shiftKey: true })).toMatchObject({ shift: true });
  });

  it("押下を組み立てる", () => {
    expect(pointerInput("down", { x: 1, y: 2 }, 0, NONE)).toEqual({
      kind: "pointer",
      phase: "down",
      x: 1,
      y: 2,
      button: "left",
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    });
  });

  it("入力に秘密情報を載せない", () => {
    // 送る項目を増やすときは、対象ページへ渡ってよい値かを見る。
    expect(Object.keys(pointerInput("down", { x: 1, y: 2 }, 0, NONE)).sort()).toEqual([
      "button",
      "kind",
      "modifiers",
      "phase",
      "x",
      "y",
    ]);
  });

  it("実行基盤の語彙を持たない", () => {
    // CDP の `input_mouse` / `mousePressed` / ビットフラグが混ざっていたら、
    // 基盤を差し替えたときに画面まで直すことになる。
    const serialized = JSON.stringify(pointerInput("down", { x: 1, y: 2 }, 0, NONE));
    expect(serialized).not.toContain("input_mouse");
    expect(serialized).not.toContain("mousePressed");
  });
});

describe("scrollInput", () => {
  const NONE = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

  it("スクロール量を載せる", () => {
    expect(scrollInput({ x: 10, y: 20 }, { deltaX: 0, deltaY: 120 }, NONE)).toEqual({
      kind: "scroll",
      x: 10,
      y: 20,
      dx: 0,
      dy: 120,
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    });
  });
});
