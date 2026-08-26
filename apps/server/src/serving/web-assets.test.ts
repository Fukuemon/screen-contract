import { describe, expect, it } from "vitest";
import { embedToken } from "./web-token-embed.js";
import { TOKEN_META } from "./web-token.js";

const SHELL = "<!doctype html><html><head><title>x</title></head><body></body></html>";

describe("embedToken", () => {
  it("head の末尾へ meta を差し込む", () => {
    // ブラウザは runtime.json を読めず、URL の query には載せられない
    // (context/infrastructure.md)。
    const html = embedToken(SHELL, "a".repeat(64));
    expect(html).toContain(`<meta name="${TOKEN_META}" content="${"a".repeat(64)}">`);
    expect(html.indexOf(TOKEN_META)).toBeLessThan(html.indexOf("</head>"));
  });

  it("元の中身を保つ", () => {
    expect(embedToken(SHELL, "x")).toContain("<title>x</title>");
    expect(embedToken(SHELL, "x")).toContain("<body></body>");
  });

  it("属性を壊す文字をエスケープする", () => {
    // 埋め込みの安全をトークンの形に依存させない。
    const html = embedToken(SHELL, '"><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("head が無ければ配信しない", () => {
    // 埋め込めないまま配信すると、原因の分からない 401 になる。
    expect(() => embedToken("<html><body></body></html>", "x")).toThrow("head がありません");
  });

  it("トークンを URL へ載せない形で渡す", () => {
    const html = embedToken(SHELL, "s3cr3t");
    expect(html).not.toContain("?token=");
    expect(html).not.toContain("&token=");
  });
});
