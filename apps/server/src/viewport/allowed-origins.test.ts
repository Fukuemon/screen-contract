import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAllowedOrigins, OriginError, parseOrigin } from "./allowed-origins.js";

let dir: string;
let configPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sc-origins-"));
  configPath = join(dir, "screen-contract.config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      { $comment: "残すべき項目", allowedOrigins: ["http://127.0.0.1:5174"] },
      null,
      2,
    ),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function store(initial: readonly string[] = ["http://127.0.0.1:5174"]) {
  return createAllowedOrigins({ configPath, initial });
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
    const origins = store();
    expect(origins.add("https://example.test")).toEqual([
      "http://127.0.0.1:5174",
      "https://example.test",
    ]);
    expect(origins.has("https://example.test")).toBe(true);
  });

  it("設定ファイルへ書き戻す", () => {
    // **明示的な追加操作として記録に残す。** 残さないと、次の起動で消える。
    store().add("https://example.test");
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as { allowedOrigins: string[] };
    expect(saved.allowedOrigins).toEqual(["http://127.0.0.1:5174", "https://example.test"]);
  });

  it("設定ファイルの他の項目を消さない", () => {
    store().add("https://example.test");
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(saved["$comment"]).toBe("残すべき項目");
  });

  it("同じ origin を二重に足さない", () => {
    const origins = store();
    origins.add("https://example.test");
    expect(origins.add("https://example.test")).toEqual([
      "http://127.0.0.1:5174",
      "https://example.test",
    ]);
  });

  it("末尾のスラッシュ違いを別物として足さない", () => {
    const origins = store();
    origins.add("https://example.test");
    expect(origins.add("https://example.test/")).toHaveLength(2);
  });

  it("規則に合わない origin を足さない", () => {
    const origins = store();
    expect(() => origins.add("https://example.test/path")).toThrow(OriginError);
    expect(origins.list()).toEqual(["http://127.0.0.1:5174"]);
  });

  it("一時ファイルを残さない", () => {
    store().add("https://example.test");
    expect(readdirSync(dir).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });
});
