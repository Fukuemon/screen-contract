import { describe, expect, it } from "vitest";
import type { BoundingBox } from "@screen-contract/core-element";
import { DEFAULT_BADGE_STYLE, layoutBadges, type BadgeLayoutInput } from "./index.js";

const IMAGE = { width: 400, height: 300 };

function boxes(entries: Record<string, BoundingBox>): ReadonlyMap<string, BoundingBox> {
  return new Map(Object.entries(entries));
}

function layout(overrides: Partial<BadgeLayoutInput> = {}) {
  return layoutBadges({
    badges: ["el-a"],
    boxes: boxes({ "el-a": { x: 100, y: 100, width: 60, height: 30 } }),
    image: IMAGE,
    ...overrides,
  });
}

describe("layoutBadges", () => {
  it("同じ入力からは常に同じ配置を返す", () => {
    expect(layout()).toEqual(layout());
  });

  it("構成番号は badges リストの位置で決まる", () => {
    // 要素定義は番号を持たない (ADR-0005)。
    const result = layoutBadges({
      badges: ["el-b", "el-a"],
      boxes: boxes({
        "el-a": { x: 10, y: 200, width: 20, height: 20 },
        "el-b": { x: 200, y: 100, width: 20, height: 20 },
      }),
      image: IMAGE,
    });
    expect(result.placements.map((p) => [p.elementId, p.number])).toEqual([
      ["el-b", 1],
      ["el-a", 2],
    ]);
  });

  it("box の左上角の外側に置く", () => {
    const { size, offset } = DEFAULT_BADGE_STYLE;
    expect(layout().placements[0]).toMatchObject({
      x: 100 - size - offset,
      y: 100 - size - offset,
    });
  });

  it("左端にかかるときは box の内側へ倒す", () => {
    const result = layout({ boxes: boxes({ "el-a": { x: 2, y: 100, width: 60, height: 30 } }) });
    expect(result.placements[0]?.x).toBe(2 + DEFAULT_BADGE_STYLE.offset);
    // 倒すのははみ出す辺だけ。y は外側のまま。
    expect(result.placements[0]?.y).toBe(
      100 - DEFAULT_BADGE_STYLE.size - DEFAULT_BADGE_STYLE.offset,
    );
  });

  it("上端にかかるときも同じ規則で内側へ倒す", () => {
    const result = layout({ boxes: boxes({ "el-a": { x: 100, y: 2, width: 60, height: 30 } }) });
    expect(result.placements[0]?.y).toBe(2 + DEFAULT_BADGE_STYLE.offset);
  });

  it("重なるときは読み順で後の要素を右へずらす", () => {
    const result = layoutBadges({
      badges: ["el-a", "el-b"],
      boxes: boxes({
        "el-a": { x: 100, y: 100, width: 20, height: 20 },
        "el-b": { x: 100, y: 100, width: 20, height: 20 },
      }),
      image: IMAGE,
    });
    const [first, second] = result.placements;
    expect(second?.x).toBe((first?.x ?? 0) + DEFAULT_BADGE_STYLE.shift);
    expect(second?.y).toBe(first?.y);
    expect(result.warnings).toEqual([]);
  });

  it("ずらせないまま重なったら重なりとして警告する", () => {
    // ずらしの上限が 0 で、重なりが解消しないケース。位置は動かさず決定性を保つ。
    const style = { ...DEFAULT_BADGE_STYLE, maxShifts: 0 };
    const result = layoutBadges({
      badges: ["el-a", "el-b"],
      boxes: boxes({
        "el-a": { x: 100, y: 100, width: 20, height: 20 },
        "el-b": { x: 100, y: 100, width: 20, height: 20 },
      }),
      image: IMAGE,
      style,
    });
    expect(result.warnings).toEqual([{ elementId: "el-b", reason: "unresolvable-overlap" }]);
    expect(result.placements).toHaveLength(2);
  });

  it("ずらした先が画像の外に出たら警告する", () => {
    // 重なりは解消するが、解消した位置が画像の外なので描いても見えない。
    const result = layoutBadges({
      badges: ["el-a", "el-b"],
      boxes: boxes({
        "el-a": { x: 380, y: 100, width: 20, height: 20 },
        "el-b": { x: 380, y: 100, width: 20, height: 20 },
      }),
      image: { width: 390, height: 300 },
    });
    // 重なりは解消しているので、理由は重なりではなく画像外である。
    expect(result.warnings).toEqual([{ elementId: "el-b", reason: "out-of-image" }]);
    expect(result.placements[1]?.x).toBeGreaterThan(390 - DEFAULT_BADGE_STYLE.size);
  });

  it("clip の範囲より左にある box を無警告で画像外へ置かない", () => {
    // 倒しても x が負のまま残る経路。右下しか見ないと警告が出ない。
    const result = layoutBadges({
      badges: ["el-a"],
      boxes: boxes({ "el-a": { x: 10, y: 100, width: 20, height: 20 } }),
      image: IMAGE,
      clip: { x: 100, y: 0 },
    });
    expect(result.warnings).toEqual([{ elementId: "el-a", reason: "out-of-image" }]);
  });

  it("重なりと画像外は別の理由として報告する", () => {
    const style = { ...DEFAULT_BADGE_STYLE, maxShifts: 0 };
    const result = layoutBadges({
      badges: ["el-a", "el-b"],
      boxes: boxes({
        "el-a": { x: 10, y: 100, width: 20, height: 20 },
        "el-b": { x: 10, y: 100, width: 20, height: 20 },
      }),
      image: IMAGE,
      clip: { x: 100, y: 0 },
      style,
    });
    expect(result.warnings).toEqual([
      { elementId: "el-a", reason: "out-of-image" },
      { elementId: "el-b", reason: "unresolvable-overlap" },
      { elementId: "el-b", reason: "out-of-image" },
    ]);
  });

  it("撮影結果に無い要素を警告し、置かない", () => {
    const result = layoutBadges({
      badges: ["el-a", "el-missing"],
      boxes: boxes({ "el-a": { x: 100, y: 100, width: 20, height: 20 } }),
      image: IMAGE,
    });
    expect(result.warnings).toEqual([{ elementId: "el-missing", reason: "no-box" }]);
    expect(result.placements.map((p) => p.elementId)).toEqual(["el-a"]);
  });

  it("clip 指定時は切り抜き後の画像座標へ変換する", () => {
    const { size, offset } = DEFAULT_BADGE_STYLE;
    const result = layout({ clip: { x: 50, y: 40 } });
    expect(result.placements[0]).toMatchObject({
      x: 100 - 50 - size - offset,
      y: 100 - 40 - size - offset,
    });
  });
});
