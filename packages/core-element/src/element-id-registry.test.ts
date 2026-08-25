import type { ElementId } from "@screen-contract/domain";
import type { ElementDef } from "./index.js";
import { describe, expect, it } from "vitest";
import { createElementIdRegistry } from "./element-id.js";

const button = { role: "button", name: "設定を開く" };
const other = { role: "button", name: "閉じる" };

describe("createElementIdRegistry", () => {
  it("同じ Locator には同じ ID を返す", () => {
    // 一度割り当てた ID は変更しない (element-mapping feature)。
    const registry = createElementIdRegistry();
    const id = registry.idFor(button);
    expect(registry.idFor({ ...button })).toBe(id);
  });

  it("違う Locator には違う ID を振る", () => {
    const registry = createElementIdRegistry();
    expect(registry.idFor(button)).not.toBe(registry.idFor(other));
  });

  it("名称を識別子にしない", () => {
    // **ここが本題である** (ADR-0012)。名称は仕様の改善で変わるため、ID へ
    // 混ぜると文言を直した瞬間に別の要素になる。
    const registry = createElementIdRegistry();
    expect(registry.idFor(button)).not.toContain("設定");
    expect(registry.idFor(button)).not.toContain("button");
  });

  it("同じ画面の同名要素を潰さない", () => {
    // role が違えば別の要素である。名称由来だと片方が黙って消える。
    const registry = createElementIdRegistry();
    const heading = registry.idFor({ role: "heading", name: "設定" });
    const link = registry.idFor({ role: "link", name: "設定" });
    expect(heading).not.toBe(link);
  });

  it("持ち越した定義の ID を再利用する", () => {
    // 渡さないと、記録を止めて再開したときに同じ要素へ別の ID が振られる。
    const known: ElementDef[] = [
      { id: "el-0009" as ElementId, name: "設定を開く", type: "button", locator: button },
    ];
    expect(createElementIdRegistry(known).idFor(button)).toBe("el-0009");
  });

  it("持ち越した連番と衝突させない", () => {
    const known: ElementDef[] = [
      { id: "el-0009" as ElementId, name: "設定を開く", type: "button", locator: button },
    ];
    expect(createElementIdRegistry(known).idFor(other)).toBe("el-0010");
  });

  it("連番でない ID を持ち越しても壊れない", () => {
    // 旧い形式の ID が混ざっても、採番は続けられる。
    const known: ElementDef[] = [
      {
        id: "el-button-設定を開く" as ElementId,
        name: "設定を開く",
        type: "button",
        locator: button,
      },
    ];
    const registry = createElementIdRegistry(known);
    expect(registry.idFor(button)).toBe("el-button-設定を開く");
    expect(registry.idFor(other)).toBe("el-0001");
  });

  it("桁を揃える", () => {
    // 揃えないと辞書順の並びが番号順と食い違う。
    expect(createElementIdRegistry().idFor(button)).toBe("el-0001");
  });
});
