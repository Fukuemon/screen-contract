import { describe, expect, it } from "vitest";
import { buildTargetUrl, isValidViewport, VIEWPORT_PRESETS } from "./target.js";

const ALLOWED = ["http://127.0.0.1:5174", "https://example.test"];

describe("buildTargetUrl", () => {
  it("列挙した origin とパスを組み合わせる", () => {
    expect(buildTargetUrl({ origin: ALLOWED[0]!, path: "/settings" }, ALLOWED)).toEqual({
      url: "http://127.0.0.1:5174/settings",
    });
  });

  it("パスが空ならルートを開く", () => {
    expect(buildTargetUrl({ origin: ALLOWED[0]!, path: "" }, ALLOWED)).toEqual({
      url: "http://127.0.0.1:5174/",
    });
  });

  it("query と fragment を保つ", () => {
    expect(buildTargetUrl({ origin: ALLOWED[0]!, path: "/a?b=1#c" }, ALLOWED)).toEqual({
      url: "http://127.0.0.1:5174/a?b=1#c",
    });
  });

  it("列挙外の origin を拒否する", () => {
    // 弾かないと、設定の列挙という安全装置が UI から迂回できる (ADR-0017)。
    expect(buildTargetUrl({ origin: "http://evil.test", path: "/" }, ALLOWED)).toEqual({
      rejection: "unknown-origin",
    });
  });

  it("origin が空なら拒否する", () => {
    expect(buildTargetUrl({ origin: "", path: "/" }, ALLOWED)).toEqual({
      rejection: "empty-origin",
    });
  });

  it.each(["//evil.test/", "https://evil.test/x", "http://evil.test"])(
    "パスから origin を入れ替えさせない: %s",
    (path) => {
      expect(buildTargetUrl({ origin: ALLOWED[0]!, path }, ALLOWED)).toEqual({
        rejection: "bad-path",
      });
    },
  );

  it("相対パスの .. でも origin を越えない", () => {
    // URL の正規化で潰れるため、origin は変わらない。
    expect(buildTargetUrl({ origin: ALLOWED[0]!, path: "/a/../../b" }, ALLOWED)).toEqual({
      url: "http://127.0.0.1:5174/b",
    });
  });
});

describe("viewport のプリセット", () => {
  it("すべて実行してよい寸法である", () => {
    for (const preset of VIEWPORT_PRESETS) {
      expect(isValidViewport(preset)).toBe(true);
    }
  });

  it("id が重複しない", () => {
    expect(new Set(VIEWPORT_PRESETS.map((p) => p.id)).size).toBe(VIEWPORT_PRESETS.length);
  });

  it.each([
    ["0", { width: 0, height: 600 }],
    ["負", { width: -1, height: 600 }],
    ["小さすぎる", { width: 100, height: 600 }],
    ["大きすぎる", { width: 5000, height: 600 }],
    ["整数でない", { width: 375.5, height: 600 }],
  ])("%s の寸法を対象へ渡さない", (_label, size) => {
    expect(isValidViewport(size)).toBe(false);
  });
});
