import { describe, expect, it } from "vitest";
import { isValidViewport, originOf, VIEWPORT_PRESETS } from "./target.js";

describe("originOf", () => {
  it("URL から origin を取り出す", () => {
    expect(originOf("http://127.0.0.1:5174/settings?a=1#b")).toBe("http://127.0.0.1:5174");
  });

  it("既定ポートを省いた形へ揃える", () => {
    // 揃えないと列挙との突合が外れ、許可済みの対象が未許可に見える。
    expect(originOf("https://note.com:443/x")).toBe("https://note.com");
  });

  it("解釈できない入力では undefined を返す", () => {
    // 入力途中の URL 欄はここを何度も通る。投げると画面が落ちる。
    expect(originOf("http://")).toBeUndefined();
    expect(originOf("")).toBeUndefined();
    expect(originOf("/settings")).toBeUndefined();
  });
});

describe("isValidViewport", () => {
  it("プリセットはすべて通る", () => {
    for (const preset of VIEWPORT_PRESETS) {
      expect(isValidViewport(preset)).toBe(true);
    }
  });

  it.each([
    ["0", { width: 0, height: 600 }],
    ["負", { width: -1, height: 600 }],
    ["桁外れ", { width: 100_000, height: 600 }],
    ["小さすぎ", { width: 199, height: 600 }],
    ["整数でない", { width: 375.5, height: 600 }],
    ["高さも見る", { width: 375, height: 0 }],
  ])("%s は弾く", (_label, size) => {
    expect(isValidViewport(size)).toBe(false);
  });

  it("境界を通す", () => {
    expect(isValidViewport({ width: 200, height: 200 })).toBe(true);
    expect(isValidViewport({ width: 4096, height: 4096 })).toBe(true);
  });
});
