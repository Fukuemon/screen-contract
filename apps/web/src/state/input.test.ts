import { describe, expect, it } from "vitest";
import { cdpButton, cdpModifiers, mouseInput, toViewportPoint } from "./input.js";

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

describe("CDP への写像", () => {
  it("ボタンを名前へ写す", () => {
    expect(cdpButton(0)).toBe("left");
    expect(cdpButton(1)).toBe("middle");
    expect(cdpButton(2)).toBe("right");
    expect(cdpButton(9)).toBe("none");
  });

  it("修飾キーをビットフラグへ写す", () => {
    const none = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(cdpModifiers(none)).toBe(0);
    expect(cdpModifiers({ ...none, altKey: true })).toBe(1);
    expect(cdpModifiers({ ...none, ctrlKey: true })).toBe(2);
    expect(cdpModifiers({ ...none, metaKey: true })).toBe(4);
    expect(cdpModifiers({ ...none, shiftKey: true })).toBe(8);
    expect(cdpModifiers({ altKey: true, ctrlKey: true, metaKey: true, shiftKey: true })).toBe(15);
  });

  it("押下だけがクリック回数を持つ", () => {
    // 離す側に入れると二重に数える。
    const none = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(mouseInput("mousePressed", { x: 1, y: 2 }, 0, none).clickCount).toBe(1);
    expect(mouseInput("mouseReleased", { x: 1, y: 2 }, 0, none).clickCount).toBe(0);
    expect(mouseInput("mouseMoved", { x: 1, y: 2 }, 0, none).clickCount).toBe(0);
  });

  it("入力に秘密情報を載せない", () => {
    const none = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(Object.keys(mouseInput("mousePressed", { x: 1, y: 2 }, 0, none)).sort()).toEqual([
      "button",
      "clickCount",
      "eventType",
      "modifiers",
      "type",
      "x",
      "y",
    ]);
  });
});
