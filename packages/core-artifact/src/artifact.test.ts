import type { ElementDefinition } from "@screen-contract/core-workflow";
import { describe, expect, it } from "vitest";
import {
  annotatedImageName,
  ArtifactPathError,
  assertOutputPath,
  assertResolvedWithinRoot,
  decideArtifacts,
  decideRawImage,
  decideTextArtifact,
  defaultArtifactDir,
  escapeCell,
  escapeLinkText,
  escapeXml,
  layoutBadges,
  parseArtifactSegment,
  rawImageName,
  renderAnnotatedImage,
  renderElementTable,
} from "./index.js";

function element(overrides: Partial<ElementDefinition> & { id: string }): ElementDefinition {
  return {
    name: overrides.id,
    type: "button",
    states: ["default"],
    hiddenIn: [],
    optional: false,
    ...overrides,
  };
}

const ELEMENTS: ElementDefinition[] = [
  element({ id: "el-username", name: "ユーザー名", type: "textbox" }),
  element({ id: "el-open", name: "設定を開く" }),
  element({ id: "el-toast", name: "通知", type: "alert", optional: true }),
  element({ id: "el-detail", name: "詳細画面", type: "link", childDoc: "detail.md" }),
];
const ALL_IDS = ELEMENTS.map((e) => e.id);

/** golden を読める大きさに保つための最小の PNG バイト列 (中身は問わない)。 */
const RAW = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const LAYOUT = layoutBadges({
  badges: ["el-username", "el-open"],
  boxes: new Map([
    ["el-username", { x: 100, y: 100, width: 60, height: 30 }],
    ["el-open", { x: 100, y: 200, width: 60, height: 30 }],
  ]),
  image: { width: 400, height: 300 },
});

describe("renderAnnotatedImage", () => {
  const svg = renderAnnotatedImage({
    width: 400,
    height: 300,
    rawImage: RAW,
    placements: LAYOUT.placements,
  });

  it("同じ入力から常に同じテキストを返す", () => {
    // 書き換え抑止がテキスト比較 (完全一致) で成り立つ前提 (ADR-0028)。
    // 全文を固定する。属性順や空白が 1 文字揺れれば全成果物が更新候補になる。
    expect(svg).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300" viewBox="0 0 400 300">
        <image x="0" y="0" width="400" height="300" href="data:image/png;base64,iVBORw0KGgo=" xlink:href="data:image/png;base64,iVBORw0KGgo="/>
        <g data-element-id="el-username">
          <circle cx="86" cy="86" r="10" fill="#d93025"/>
          <text x="86" y="86" fill="#ffffff" font-family="sans-serif" font-size="12" text-anchor="middle" dominant-baseline="central">1</text>
        </g>
        <g data-element-id="el-open">
          <circle cx="86" cy="186" r="10" fill="#d93025"/>
          <text x="86" y="186" fill="#ffffff" font-family="sans-serif" font-size="12" text-anchor="middle" dominant-baseline="central">2</text>
        </g>
      </svg>
      "
    `);
  });

  it("生スクリーンショットを data URI で埋め込む", () => {
    // <img src="x.svg"> で読んだ SVG は外部参照を一切読み込まない。
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).not.toContain(".raw.png");
  });

  it("href と xlink:href の両方を出す", () => {
    // SVG 2 は href、SVG 1.1 のレンダラは xlink:href を見る。
    expect(svg).toContain(' href="data:image/png;base64,iVBORw0KGgo="');
    expect(svg).toContain(' xlink:href="data:image/png;base64,iVBORw0KGgo="');
  });

  it("badges に載る要素の数だけバッジを描く", () => {
    expect(svg.match(/<circle /g)).toHaveLength(2);
  });

  it("要素 ID と配色をエスケープして埋める", () => {
    const injected = renderAnnotatedImage({
      width: 10,
      height: 10,
      rawImage: RAW,
      placements: [{ number: 1, elementId: '"><script/>', x: 0, y: 0, size: 4 }],
      fill: '"/><script/>',
    });
    expect(injected).not.toContain("<script/>");
    expect(injected).toContain("&lt;script/&gt;");
    expect(injected.match(/<script/g)).toBeNull();
  });
});

describe("renderElementTable", () => {
  const { markdown, warnings } = renderElementTable({
    badges: ["el-username", "el-open"],
    elementIds: ALL_IDS,
    elements: ELEMENTS,
  });

  it("行の並びと列の内容を固定する", () => {
    expect(markdown).toMatchInlineSnapshot(`
      "| 番号 | 名称 | 種別 | 備考 |
      | --- | --- | --- | --- |
      | 1 | ユーザー名 | textbox |  |
      | 2 | 設定を開く | button |  |
      | - | 通知 | alert |  |
      |  | [詳細画面](detail.md) | link |  |
      "
    `);
    expect(warnings).toEqual([]);
  });

  it("Locator をテーブルに載せない", () => {
    // type と別の語を role に置く。同じ語だと、載っているのが type なのか
    // Locator なのか区別できず assertion が意味を持たない。
    const { markdown: withLocator } = renderElementTable({
      badges: ["el-x"],
      elementIds: ["el-x"],
      elements: [element({ id: "el-x", name: "X", locator: { role: "menuitem", name: "押す" } })],
    });
    expect(withLocator).not.toContain("menuitem");
    expect(withLocator).not.toContain("押す");
  });

  it("要素定義に無い badge を欠番のまま出さず、警告する", () => {
    // 行だけ落とすと `1 | 3` のような欠番が出る (ADR-0005 違反)。
    const result = renderElementTable({
      badges: ["el-username", "el-ghost", "el-open"],
      elementIds: ALL_IDS,
      elements: ELEMENTS,
    });
    expect(result.warnings).toEqual([{ elementId: "el-ghost", reason: "unknown-badge" }]);
    expect(result.markdown).not.toContain("| 2 |");
  });

  it("その状態に現れない要素を描かず、警告する", () => {
    // 継承展開の結果で消えた要素が badges に残っているケース。
    const result = renderElementTable({
      badges: ["el-username", "el-toast"],
      elementIds: ["el-username"],
      elements: ELEMENTS,
    });
    expect(result.warnings).toEqual([{ elementId: "el-toast", reason: "badge-not-in-state" }]);
    expect(result.markdown).not.toContain("通知");
  });

  it("リンクの表示テキストでリンク先を差し替えられない", () => {
    const result = renderElementTable({
      badges: [],
      elementIds: ["el-evil"],
      elements: [
        element({ id: "el-evil", name: "x](javascript:alert(1))", childDoc: "detail.md" }),
      ],
    });
    expect(result.markdown).toContain("[x\\](javascript:alert(1))](detail.md)");
    expect(result.markdown).not.toContain("](javascript:alert(1)) |");
  });

  it("素の Markdown に書けないリンク先はリンクにせず警告する", () => {
    // URL にセル用のエスケープを掛けるとリンク先そのものが変わる。
    const result = renderElementTable({
      badges: [],
      elementIds: ["el-x"],
      elements: [element({ id: "el-x", name: "詳細", childDoc: "a|b.md" })],
    });
    expect(result.warnings).toEqual([{ elementId: "el-x", reason: "unsafe-child-doc" }]);
    expect(result.markdown).toContain("| 詳細 |");
    expect(result.markdown).not.toContain("](");
  });

  it("セルの `|` と改行を壊さずに書く", () => {
    expect(escapeCell("a|b\nc")).toBe("a\\|b c");
    expect(escapeCell("a\rb")).toBe("a b");
    expect(escapeLinkText("a[b]c")).toBe("a\\[b\\]c");
  });
});

describe("書き換え抑止", () => {
  it("入力が同じなら書き換えない", () => {
    expect(decideTextArtifact("<svg/>", "<svg/>")).toBe("unchanged");
    expect(decideRawImage("h1", "h1")).toBe("unchanged");
  });

  it("既存が無ければ書き換え対象にする", () => {
    expect(decideTextArtifact(undefined, "<svg/>")).toBe("changed");
    expect(decideRawImage(undefined, "h1")).toBe("changed");
  });

  it("1 箇所の変更で該当成果物だけが更新候補になる", () => {
    const existing = {
      svg: "<svg>1</svg>",
      table: "| 1 |",
      meta: { rawImageHashes: { default: "h1" } },
    };
    expect(
      decideArtifacts(
        { stateId: "default", svg: "<svg>2</svg>", table: "| 1 |", rawImageHash: "h1" },
        existing,
      ),
    ).toEqual({ svg: "changed", table: "unchanged", rawImage: "unchanged" });
  });

  it("再採番で生スクリーンショットが書き換わらない", () => {
    // badges の並べ替えで変わるのは SVG のテキスト数行だけ。
    const boxes = new Map([
      ["el-a", { x: 100, y: 100, width: 20, height: 20 }],
      ["el-b", { x: 100, y: 200, width: 20, height: 20 }],
    ]);
    const image = { width: 400, height: 300 };
    const render = (badges: string[]) =>
      renderAnnotatedImage({
        ...image,
        rawImage: RAW,
        placements: layoutBadges({ badges, boxes, image }).placements,
      });
    const before = render(["el-a", "el-b"]);
    const after = render(["el-b", "el-a"]);
    expect(before).not.toBe(after);
    expect(
      decideArtifacts(
        { stateId: "default", svg: after, table: "| 1 |", rawImageHash: "h1" },
        { svg: before, table: "| 1 |", meta: { rawImageHashes: { default: "h1" } } },
      ),
    ).toEqual({ svg: "changed", table: "unchanged", rawImage: "unchanged" });
  });

  it("別の状態のハッシュを流用しない", () => {
    expect(
      decideArtifacts(
        { stateId: "modal-open", svg: "s", table: "t", rawImageHash: "h1" },
        { svg: "s", table: "t", meta: { rawImageHashes: { default: "h1" } } },
      ).rawImage,
    ).toBe("changed");
  });
});

describe("出力先の格納範囲", () => {
  it.each([
    ["/etc/passwd", "absolute"],
    ["C:\\Windows", "absolute"],
    ["\\\\server\\share", "absolute"],
    ["../../../.git/hooks/pre-commit", "parent-traversal"],
    ["artifacts/../../etc", "parent-traversal"],
    ["artifacts\\..\\..\\etc", "parent-traversal"],
    ["~/.zshrc", "home-expansion"],
    ["", "empty"],
  ])("文字列検査が %s を拒否する", (value, code) => {
    expect(() => assertOutputPath(value)).toThrow(expect.objectContaining({ code }));
  });

  it("ルート配下の相対パスを通す", () => {
    expect(() => assertOutputPath("artifacts/screens/login")).not.toThrow();
  });

  it("解決後にルート外を指すものを拒否する", () => {
    // 文字列検査だけではシンボリックリンクを通してしまう。
    expect(() => assertResolvedWithinRoot("/repo", "/etc/passwd")).toThrow(ArtifactPathError);
  });

  it("ルートと接頭辞が同じだけの別ディレクトリを拒否する", () => {
    expect(() => assertResolvedWithinRoot("/repo", "/repo-evil/x")).toThrow(ArtifactPathError);
  });

  it("ルート自身を出力先にしない", () => {
    expect(() => assertResolvedWithinRoot("/repo", "/repo")).toThrow(ArtifactPathError);
  });

  it("解決後がルート配下なら通す", () => {
    expect(() => assertResolvedWithinRoot("/repo", "/repo/artifacts/x.svg")).not.toThrow();
    expect(() => assertResolvedWithinRoot("/repo/", "/repo/artifacts/x.svg")).not.toThrow();
  });

  it("区切りを渡せば Windows のパスも判定できる", () => {
    expect(() =>
      assertResolvedWithinRoot("C:\\repo", "C:\\repo\\artifacts\\x.svg", "\\"),
    ).not.toThrow();
    expect(() => assertResolvedWithinRoot("C:\\repo", "C:\\other\\x.svg", "\\")).toThrow();
  });

  it("エラーメッセージに入力値を入れない", () => {
    // 解決済みの絶対パスはローカルの構成をそのまま露出する。
    try {
      assertResolvedWithinRoot("/repo", "/Users/someone/secret/x.svg");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("someone");
    }
  });
});

describe("パスのセグメント", () => {
  it.each(["../..", "a/b", "a\\b", "", "con", "COM1", "a.", "a ", "x".repeat(65), "-a"])(
    "%s を拒否する",
    (raw) => {
      expect(() => parseArtifactSegment(raw)).toThrow(
        expect.objectContaining({ code: "unsafe-segment" }),
      );
    },
  );

  it("通常の識別子を通す", () => {
    expect(parseArtifactSegment("modal-open")).toBe("modal-open");
    expect(parseArtifactSegment("profile.admin")).toBe("profile.admin");
  });

  it("未検証の文字列からパスを組み立てられない", () => {
    // 型で塞ぐ。`screen.id = "../../.."` が defaultArtifactDir へ届かない。
    const stateId = parseArtifactSegment("modal-open");
    expect(annotatedImageName(stateId)).toBe("modal-open.svg");
    expect(rawImageName(stateId)).toBe("modal-open.raw.png");
  });

  it("認証プロファイルごとに出力先を分ける", () => {
    // 混ぜると、権限差で見える範囲の違う画像とテーブルが上書きし合う (ADR-0022)。
    // 鍵は core-execution の authContextKey が返す `anon` / `profile.<name>`。
    const login = parseArtifactSegment("login");
    expect(defaultArtifactDir(login, parseArtifactSegment("anon"))).toBe(
      "artifacts/screens/login/anon",
    );
    expect(defaultArtifactDir(login, parseArtifactSegment("profile.admin"))).not.toBe(
      defaultArtifactDir(login, parseArtifactSegment("anon")),
    );
  });
});

describe("escapeXml", () => {
  it("XML の特殊文字をすべて置き換える", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});
