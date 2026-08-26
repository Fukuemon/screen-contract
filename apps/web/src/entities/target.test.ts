import { describe, expect, it } from "vitest";
import { isValidViewport, originOf, resolveTarget, VIEWPORT_PRESETS } from "./target.js";

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

describe("resolveTarget", () => {
  const BASE = "http://127.0.0.1:5174/settings";

  it("完全な URL はそのまま使う", () => {
    expect(resolveTarget("https://note.com/x", BASE)).toBe("https://note.com/x");
  });

  it("path の直打ちを今の画面へ寄せる", () => {
    // **省けないと、対象を切り替えるたびに origin を打ち直すことになる。**
    expect(resolveTarget("/login/", BASE)).toBe("http://127.0.0.1:5174/login/");
  });

  it("先頭のスラッシュが無くても受ける", () => {
    expect(resolveTarget("login/", BASE)).toBe("http://127.0.0.1:5174/login/");
  });

  it("query と fragment を保つ", () => {
    expect(resolveTarget("/items?page=2#top", BASE)).toBe("http://127.0.0.1:5174/items?page=2#top");
  });

  it("前後の空白を落とす", () => {
    expect(resolveTarget("  /login/  ", BASE)).toBe("http://127.0.0.1:5174/login/");
  });

  it("origin が入れ替わる入力を受けない", () => {
    // 受けると、列挙という安全装置を URL 欄から迂回できる (ADR-0017)。
    expect(resolveTarget("//evil.test/", BASE)).toBeUndefined();
  });

  it.each([
    ["空", "", BASE],
    ["空白だけ", "   ", BASE],
    ["寄せる先が無い", "/login/", ""],
    ["寄せる先が URL でない", "/login/", "not-a-url"],
  ])("%s なら解決しない", (_label, input, base) => {
    expect(resolveTarget(input, base)).toBeUndefined();
  });
});
