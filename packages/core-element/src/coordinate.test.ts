import { describe, expect, it } from "vitest";
import type { ElementId } from "@screen-contract/domain";
import {
  elementAt,
  resolve,
  resolveCoordinate,
  type ElementDef,
  type ObservedElement,
  type SemanticLocator,
} from "./index.js";

const button: ObservedElement = {
  role: "button",
  name: "設定を開く",
  box: { x: 8, y: 90, width: 82, height: 27 },
};
const card: ObservedElement = {
  role: "group",
  name: "カード",
  box: { x: 0, y: 0, width: 400, height: 300 },
};

const nextId = (locator: SemanticLocator): ElementId => `el-${locator.name}` as ElementId;

describe("elementAt", () => {
  it("座標を含む要素のうち最小のものを選ぶ", () => {
    // 大きい要素を先に選ぶと、常に外側のコンテナが当たって操作対象へ届かない。
    expect(elementAt([card, button], 40, 100)).toBe(button);
    expect(elementAt([button, card], 40, 100)).toBe(button);
  });

  it("含まない座標では何も返さない", () => {
    expect(elementAt([button], 500, 500)).toBeUndefined();
  });

  it("境界の座標を含む", () => {
    expect(elementAt([button], 8, 90)).toBe(button);
    expect(elementAt([button], 90, 117)).toBe(button);
  });

  it("同じ入力から同じ出力になる", () => {
    const first = elementAt([card, button], 40, 100);
    const second = elementAt([card, button], 40, 100);
    expect(first).toBe(second);
  });
});

describe("resolve", () => {
  it.each([
    ["一意に解決できる", [button], { kind: "resolved" }],
    ["要素が無い", [card], { kind: "not-found" }],
  ])("分類する: %s", (_name, elements, expected) => {
    expect(resolve(elements, { role: "button", name: "設定を開く" })).toMatchObject(expected);
  });

  it("複数一致を ambiguous として区別する", () => {
    // ambiguous は Locator の絞り込みで直せるが、not-found は要素そのものが無い。
    // 呼び出し側の対処が違うため混ぜない。
    const resolution = resolve([button, { ...button, box: { ...button.box, y: 200 } }], {
      role: "button",
      name: "設定を開く",
    });
    expect(resolution).toEqual({
      kind: "ambiguous",
      locator: { role: "button", name: "設定を開く" },
      matches: 2,
    });
  });
});

describe("resolveCoordinate", () => {
  it("既存定義に一致すればその ref を使う", () => {
    // 記録のたびに同じ要素が重複定義されないようにする。
    const known: ElementDef[] = [
      {
        id: "el-open" as ElementId,
        name: "設定を開く",
        type: "button",
        locator: { role: "button", name: "設定を開く" },
      },
    ];
    expect(resolveCoordinate({ elements: [button], known, x: 40, y: 100, nextId })).toEqual({
      kind: "existing",
      ref: "el-open",
      locator: { role: "button", name: "設定を開く" },
    });
  });

  it("既存定義に無ければ要素定義を作る", () => {
    const result = resolveCoordinate({ elements: [button], known: [], x: 40, y: 100, nextId });
    expect(result).toEqual({
      kind: "new",
      element: {
        id: "el-設定を開く",
        name: "設定を開く",
        type: "button",
        locator: { role: "button", name: "設定を開く" },
      },
    });
  });

  it("永続 ID を実行基盤の一時的な参照から作らない", () => {
    // 実行基盤の ref は撮影ごとに振り直される。版をまたいで持ち越せない。
    const result = resolveCoordinate({ elements: [button], known: [], x: 40, y: 100, nextId });
    expect(JSON.stringify(result)).not.toMatch(/"e\d"/);
  });

  it("座標を含む要素が無ければ clickPoint と警告を残す", () => {
    // 記録の途中で止めない。止めると、解決できない 1 操作で記録全体が失われる。
    expect(resolveCoordinate({ elements: [button], known: [], x: 999, y: 999, nextId })).toEqual({
      kind: "unresolved",
      x: 999,
      y: 999,
      warning: "座標を含む要素がありません",
    });
  });

  it("一意にならない Locator を提案しない", () => {
    // 提案すると、実行時に別の要素へ当たる DSL ができる。
    const duplicated = [button, { ...button, box: { x: 8, y: 200, width: 82, height: 27 } }];
    const result = resolveCoordinate({ elements: duplicated, known: [], x: 40, y: 100, nextId });
    expect(result.kind).toBe("unresolved");
    expect(result).toMatchObject({ warning: expect.stringContaining("複数") });
  });

  it("同じ入力から同じ出力になる", () => {
    const args = { elements: [card, button], known: [], x: 40, y: 100, nextId };
    expect(resolveCoordinate(args)).toEqual(resolveCoordinate(args));
  });
});
