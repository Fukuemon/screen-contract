import { describe, expect, it } from "vitest";
import {
  createAllowedOrigins,
  OriginError,
  parseOrigin,
  type OriginsConfigPort,
} from "./origins.js";

/** Port の相手は fake を使う (context/testing.md)。 */
function fakeConfig(initial: Record<string, unknown> = { $comment: "残すべき項目" }) {
  let stored = { ...initial };
  const port: OriginsConfigPort = {
    read: () => ({ ...stored }),
    write: (config) => {
      stored = { ...config };
    },
  };
  return { port, saved: () => stored };
}

function store(initial: readonly string[] = ["http://127.0.0.1:5174"]) {
  const config = fakeConfig();
  return { origins: createAllowedOrigins({ config: config.port, initial }), saved: config.saved };
}

describe("parseOrigin", () => {
  it("origin をそのまま受ける", () => {
    expect(parseOrigin("https://example.test")).toBe("https://example.test");
    expect(parseOrigin("http://127.0.0.1:5174")).toBe("http://127.0.0.1:5174");
  });

  it("末尾のスラッシュを許す", () => {
    expect(parseOrigin("https://example.test/")).toBe("https://example.test");
  });

  it.each([
    ["パスを含む", "https://example.test/a"],
    ["query を含む", "https://example.test?a=1"],
    ["URL でない", "example.test"],
    ["file スキーム", "file:///tmp/x"],
    ["空", ""],
  ])("%s を拒否する", (_label, raw) => {
    expect(() => parseOrigin(raw)).toThrow(OriginError);
  });
});

describe("列挙の追加", () => {
  it("足すと一覧に出る", () => {
    const s = store();
    expect(s.origins.add("https://example.test")).toEqual([
      "http://127.0.0.1:5174",
      "https://example.test",
    ]);
    expect(s.origins.has("https://example.test")).toBe(true);
  });

  it("設定へ書き戻す", () => {
    // **明示的な追加操作として記録に残す。** 残さないと、次の起動で消える。
    const s = store();
    s.origins.add("https://example.test");
    expect(s.saved()["allowedOrigins"]).toEqual(["http://127.0.0.1:5174", "https://example.test"]);
  });

  it("設定の他の項目を消さない", () => {
    const s = store();
    s.origins.add("https://example.test");
    expect(s.saved()["$comment"]).toBe("残すべき項目");
  });

  it("同じ origin を二重に足さない", () => {
    const s = store();
    s.origins.add("https://example.test");
    expect(s.origins.add("https://example.test")).toEqual([
      "http://127.0.0.1:5174",
      "https://example.test",
    ]);
  });

  it("末尾のスラッシュ違いを別物として足さない", () => {
    const s = store();
    s.origins.add("https://example.test");
    expect(s.origins.add("https://example.test/")).toHaveLength(2);
  });

  it("規則に合わない origin を足さない", () => {
    const s = store();
    expect(() => s.origins.add("https://example.test/path")).toThrow(OriginError);
    expect(s.origins.list()).toEqual(["http://127.0.0.1:5174"]);
    // 弾いた入力で設定を書き換えない。
    expect(s.saved()["allowedOrigins"]).toBeUndefined();
  });
});
