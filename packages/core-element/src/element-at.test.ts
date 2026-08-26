import type { ObservedElement } from "@screen-contract/domain";
import { describe, expect, it } from "vitest";
import { elementAt } from "./index.js";

const button: ObservedElement = {
  role: "button",
  name: "設定を開く",
  box: { x: 0, y: 0, width: 100, height: 40 },
  actionable: true,
};
/** ボタンの中のラベル。**より小さい box を持つ。** */
const label: ObservedElement = {
  role: "StaticText",
  name: "設定を開く",
  box: { x: 10, y: 10, width: 60, height: 20 },
  actionable: false,
};

describe("elementAt", () => {
  it("既定では地の文も選ぶ", () => {
    // 画面仕様書は説明文にも番号を振る。選択では含める。
    expect(elementAt([button, label], 30, 20)).toBe(label);
  });

  it("操作の対象だけに絞れる", () => {
    // **ラベルはボタンより小さい。** 絞らないと、ボタンを押しただけで
    // 「テキストをクリックした」と記録され、再現できない (ADR-0026)。
    expect(elementAt([button, label], 30, 20, { actionableOnly: true })).toBe(button);
  });

  it("絞ると外にある地の文は選ばれない", () => {
    const text: ObservedElement = {
      role: "StaticText",
      name: "説明",
      box: { x: 200, y: 0, width: 100, height: 20 },
      actionable: false,
    };
    expect(elementAt([text], 250, 10, { actionableOnly: true })).toBeUndefined();
    expect(elementAt([text], 250, 10)).toBe(text);
  });

  it("印を持たない要素は操作できるものとして扱う", () => {
    // 取得手段が区別を持たない実行基盤がある。既定で落とすと何も選べなくなる。
    const legacy: ObservedElement = {
      role: "button",
      name: "保存",
      box: { x: 0, y: 0, width: 10, height: 10 },
    };
    expect(elementAt([legacy], 5, 5, { actionableOnly: true })).toBe(legacy);
  });

  it("重なりでは小さい方を選ぶ", () => {
    const outer: ObservedElement = {
      role: "region",
      name: "本文",
      box: { x: 0, y: 0, width: 200, height: 200 },
    };
    expect(elementAt([outer, button], 50, 20)).toBe(button);
  });
});
