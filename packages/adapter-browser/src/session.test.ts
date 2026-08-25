import { describe, expect, it } from "vitest";
import { readObservedElements } from "./index.js";

describe("readObservedElements", () => {
  it("注釈スクリーンショットの応答から box 付き要素一覧を取り出す", () => {
    // box は Accessibility Snapshot の応答に含まれない。注釈の応答から得る。
    const elements = readObservedElements({
      annotations: [
        {
          box: { height: 48, width: 1264, x: 8, y: 21 },
          name: "設定画面",
          number: 1,
          role: "heading",
        },
        {
          box: { height: 27, width: 83, x: 8, y: 91 },
          name: "設定を開く",
          number: 2,
          role: "button",
        },
      ],
    });
    expect(elements).toEqual([
      { role: "heading", name: "設定画面", box: { x: 8, y: 21, width: 1264, height: 48 } },
      { role: "button", name: "設定を開く", box: { x: 8, y: 91, width: 83, height: 27 } },
    ]);
  });

  it("番号を持ち込まない", () => {
    // 実行基盤が振る番号は本システムの構成番号とは別物である。構成番号は
    // 状態ごとの badges 順序リストが正本であり、こちらへ混ぜない。
    const [element] = readObservedElements({
      annotations: [
        { box: { height: 1, width: 1, x: 0, y: 0 }, name: "a", number: 7, role: "button" },
      ],
    });
    expect(element).not.toHaveProperty("number");
  });

  it.each([
    ["role が無い", { box: { height: 1, width: 1, x: 0, y: 0 }, name: "a" }],
    ["name が無い", { box: { height: 1, width: 1, x: 0, y: 0 }, role: "button" }],
    ["box が無い", { name: "a", role: "button" }],
    ["box の項目が欠ける", { box: { x: 0, y: 0 }, name: "a", role: "button" }],
    ["box が数値でない", { box: { height: "1", width: 1, x: 0, y: 0 }, name: "a", role: "button" }],
  ])("Semantic Locator へ解決できない要素を落とす: %s", (_name, entry) => {
    expect(readObservedElements({ annotations: [entry] })).toEqual([]);
  });

  it("annotations が無い応答を拒否する", () => {
    expect(() => readObservedElements({})).toThrow();
  });

  it("オブジェクトでない応答を拒否する", () => {
    expect(() => readObservedElements(null)).toThrow();
  });
});
