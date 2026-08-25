import { describe, expect, it } from "vitest";
import { isValidViewport } from "./session.js";

/**
 * `apps/web/src/entities/target.test.ts` と同じ表を持つ。
 *
 * web は app を参照できない (context/architecture.md の Runtime Boundary) ため
 * 規則が二重にある。**両方にテストを置く。** 片方だけだと、server 側の判定が
 * 変わったことに誰も気付かない。
 */
describe("isValidViewport", () => {
  it.each([
    ["モバイル", { width: 375, height: 667 }],
    ["デスクトップ", { width: 1440, height: 900 }],
    ["下限", { width: 200, height: 200 }],
    ["上限", { width: 4096, height: 4096 }],
  ])("%s を通す", (_label, size) => {
    expect(isValidViewport(size)).toBe(true);
  });

  it.each([
    ["0", { width: 0, height: 600 }],
    ["負", { width: -1, height: 600 }],
    ["桁外れ", { width: 100_000, height: 600 }],
    ["下限未満", { width: 199, height: 600 }],
    ["整数でない", { width: 375.5, height: 600 }],
    ["高さも見る", { width: 375, height: 0 }],
    ["NaN", { width: Number.NaN, height: 600 }],
  ])("%s を弾く", (_label, size) => {
    expect(isValidViewport(size)).toBe(false);
  });
});
