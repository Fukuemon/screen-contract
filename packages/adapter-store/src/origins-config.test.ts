import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOriginsConfig } from "./origins-config.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sc-origins-"));
  path = join(dir, "screen-contract.config.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createOriginsConfig", () => {
  it("書いたものを読み戻せる", () => {
    const config = createOriginsConfig(path);
    config.write({ allowedOrigins: ["https://example.test"] });
    expect(config.read()).toEqual({ allowedOrigins: ["https://example.test"] });
  });

  it("他の項目を消さない", () => {
    // 設定には列挙以外の項目も入る。丸ごと書き戻すため、読み側が保つ。
    writeFileSync(path, JSON.stringify({ $comment: "残すべき項目", allowedOrigins: [] }));
    const config = createOriginsConfig(path);
    config.write({ ...config.read(), allowedOrigins: ["https://example.test"] });
    expect((JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)["$comment"]).toBe(
      "残すべき項目",
    );
  });

  it("一時ファイルを残さない", () => {
    createOriginsConfig(path).write({ allowedOrigins: [] });
    expect(readdirSync(dir).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it.each([
    ["ファイルが無い", undefined],
    ["JSON でない", "{"],
    ["配列", "[1,2]"],
    ["null", "null"],
    ["文字列", '"x"'],
  ])("%s なら空として読む", (_label, content) => {
    // 投げると起動が止まる。読めない設定は「まだ何も書いていない」と同じに扱う。
    if (content !== undefined) {
      writeFileSync(path, content);
    }
    expect(createOriginsConfig(path).read()).toEqual({});
  });
});
