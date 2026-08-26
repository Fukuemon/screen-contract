import { describe, expect, it } from "vitest";
import { selectNodes } from "./cdp.js";

const node = (
  nodeId: string,
  role: string,
  name: string,
  extra: { parentId?: string; backendDOMNodeId?: number } = {},
) => ({
  nodeId,
  role: { value: role },
  name: { value: name },
  backendDOMNodeId: extra.backendDOMNodeId ?? Number(nodeId),
  ...(extra.parentId === undefined ? {} : { parentId: extra.parentId }),
});

describe("selectNodes", () => {
  it("地の文を残す", () => {
    // **ここが本題である。** CLI の要素参照は role と name を持つ要素にしか
    // 振られず、説明文へ番号を振れない (ADR-0030)。
    const nodes = [
      node("1", "paragraph", ""),
      node("2", "StaticText", "walking skeleton が操作する対象アプリです。", { parentId: "1" }),
    ];
    expect(selectNodes(nodes).map((n) => n.nodeId)).toEqual(["2"]);
  });

  it("名前を持たない入れ物を落とす", () => {
    // Locator は role と name で引く。名前が無いと指せない。
    expect(selectNodes([node("1", "paragraph", "")])).toEqual([]);
  });

  it("親と同じ文字の地の文を落とす", () => {
    // ボタンのラベルは親のボタンとして既に数えている。両方出すと枠が二重になる。
    const nodes = [
      node("1", "button", "設定を開く"),
      node("2", "StaticText", "設定を開く", { parentId: "1" }),
    ];
    expect(selectNodes(nodes).map((n) => n.nodeId)).toEqual(["1"]);
  });

  it.each([
    ["none", "none"],
    ["generic", "generic"],
    ["文字の断片", "InlineTextBox"],
    ["ページ全体", "RootWebArea"],
  ])("%s を落とす", (_label, role) => {
    expect(selectNodes([node("1", role, "何か")])).toEqual([]);
  });

  it("DOM に対応しないノードを落とす", () => {
    // box を引けない。枠も番号も置けない。
    const orphan = { nodeId: "1", role: { value: "StaticText" }, name: { value: "文字" } };
    expect(selectNodes([orphan])).toEqual([]);
  });
});
