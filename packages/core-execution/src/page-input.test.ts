import { describe, expect, it } from "vitest";
import { parsePageInput } from "./page-input.js";

const NONE = { alt: false, ctrl: false, meta: false, shift: false };
const parsed = (payload: unknown): unknown => parsePageInput(JSON.stringify(payload));

describe("中継してよい入力", () => {
  it("押下を通す", () => {
    expect(parsed({ kind: "pointer", phase: "down", x: 10, y: 20, button: "left" })).toEqual({
      kind: "pointer",
      phase: "down",
      x: 10,
      y: 20,
      button: "left",
      modifiers: NONE,
    });
  });

  it("スクロールを通す", () => {
    // 要素選択の前提であり、画面の外にある要素へ届くために要る (ADR-0008)。
    expect(parsed({ kind: "scroll", x: 1, y: 2, dx: 0, dy: -120 })).toEqual({
      kind: "scroll",
      x: 1,
      y: 2,
      dx: 0,
      dy: -120,
      modifiers: NONE,
    });
  });

  it("キー入力と貼り付けを通す", () => {
    expect(parsed({ kind: "key", phase: "text", text: "あ" })).toEqual({
      kind: "key",
      phase: "text",
      key: undefined,
      text: "あ",
      modifiers: NONE,
    });
  });

  it("修飾キーを通す", () => {
    expect(
      parsed({
        kind: "pointer",
        phase: "down",
        x: 1,
        y: 2,
        button: "left",
        modifiers: { shift: true, ctrl: true },
      }),
    ).toMatchObject({ modifiers: { shift: true, ctrl: true, alt: false, meta: false } });
  });
});

describe("中継しない入力", () => {
  it("実行基盤の生の語彙を落とす", () => {
    // **ここが本題である。** CDP の形をそのまま通すと、その語彙が interface 層
    // まで漏れ、実行基盤を差し替えられなくなる (ADR-0013)。
    expect(parsed({ type: "input_mouse", eventType: "mousePressed", x: 1, y: 2 })).toBeUndefined();
  });

  it("列挙に無い命令を落とす", () => {
    // 素通しにすると、認証を通した client が配信ソケットへ任意の命令を送れる。
    expect(parsed({ kind: "navigate", url: "file:///etc/passwd" })).toBeUndefined();
    expect(parsed({ kind: "eval", expression: "fetch(1)" })).toBeUndefined();
  });

  it.each([
    ["列挙に無い phase", { kind: "pointer", phase: "hover", x: 1, y: 2, button: "left" }],
    ["列挙に無い button", { kind: "pointer", phase: "down", x: 1, y: 2, button: "back" }],
    ["座標が無い", { kind: "pointer", phase: "down", y: 2, button: "left" }],
    ["座標が数値でない", { kind: "pointer", phase: "down", x: "1", y: 2, button: "left" }],
    ["座標が桁外れ", { kind: "pointer", phase: "down", x: 1e9, y: 2, button: "left" }],
    ["NaN", { kind: "pointer", phase: "down", x: Number.NaN, y: 2, button: "left" }],
    ["スクロール量が無い", { kind: "scroll", x: 1, y: 2, dx: 0 }],
    ["列挙に無いキーの phase", { kind: "key", phase: "press" }],
    ["配列", [1, 2]],
    ["null", null],
    ["文字列", "x"],
  ])("%s を落とす", (_label, payload) => {
    expect(parsed(payload)).toBeUndefined();
  });

  it("JSON でない文字列を落とす", () => {
    expect(parsePageInput("{")).toBeUndefined();
  });

  it("列挙に無い項目を混ぜても通さない", () => {
    // **組み直して返す。** 元の文字列を通すと、列挙に無い項目がそのまま届く。
    expect(
      parsed({
        kind: "pointer",
        phase: "down",
        x: 1,
        y: 2,
        button: "left",
        script: "alert(1)",
        url: "file:///etc/passwd",
      }),
    ).toEqual({ kind: "pointer", phase: "down", x: 1, y: 2, button: "left", modifiers: NONE });
  });

  it("長すぎるテキストを落とす", () => {
    expect(parsed({ kind: "key", phase: "text", text: "a".repeat(4097) })).toEqual({
      kind: "key",
      phase: "text",
      key: undefined,
      text: undefined,
      modifiers: NONE,
    });
  });
});
