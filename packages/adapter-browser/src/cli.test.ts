import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliResponse, resolveCliPath, runCli, type CliOptions } from "./index.js";

const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sc-cli-"));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveCliPath", () => {
  it("同梱のネイティブバイナリを指し、実体がある", () => {
    // JS wrapper 経由は呼び出しごとに node の起動が挟まる。バイナリを直接
    // spawn するため、パスの解決もこちらで行う。
    const path = resolveCliPath();
    expect(existsSync(path)).toBe(true);
    expect(path).toContain("agent-browser/bin/agent-browser-");
    expect(path).not.toContain(".bin");
  });
});

describe("parseCliResponse", () => {
  it("成功の応答を読む", () => {
    expect(parseCliResponse('{"success":true,"data":{"a":1},"error":null}')).toEqual({
      success: true,
      data: { a: 1 },
      error: null,
    });
  });

  it("失敗の応答を読む", () => {
    expect(parseCliResponse('{"success":false,"data":null,"error":"CDP timeout"}')).toEqual({
      success: false,
      data: null,
      error: "CDP timeout",
    });
  });

  it("data が無い応答も受け入れる", () => {
    expect(parseCliResponse('{"success":true}').data).toBeNull();
  });

  it("解析できない応答の文言に中身を含めない", () => {
    // 応答にはページの内容やトークンが混ざりうる。例外の文言と stack trace は
    // 端末とログに残る。
    const secretish = "9f2a1c4e8b7d6a5f3e2d1c0b9a8f7e6d";
    try {
      parseCliResponse(`{"token":"${secretish}"`);
      expect.unreachable("例外にならなかった");
    } catch (error) {
      expect((error as Error).message).not.toContain(secretish);
    }
  });

  it.each([
    ["オブジェクトでない", '"text"'],
    ["null", "null"],
    ["success が無い", '{"data":{}}'],
    ["success が真偽値でない", '{"success":"yes"}'],
  ])("形の合わない応答を拒否する: %s", (_name, raw) => {
    expect(() => parseCliResponse(raw)).toThrow();
  });
});

function fakeCli(body: string): string {
  // 基底引数は先頭に付くため、node へ直接渡すと node 自身のフラグとして
  // 解釈される。実行可能なスクリプトを CLI に見立てる。
  const path = join(tempDir(), "fake-cli.mjs");
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return path;
}

const fakeOptions = (cliPath: string): CliOptions => ({
  cliPath,
  executablePath: "/path with space/chrome",
  session: "sc-anonymous-1",
  namespace: "ns",
});

describe("runCli", () => {
  it("非ゼロ終了でも標準出力の応答を読む", async () => {
    // CLI は失敗時に非ゼロで終了するが、`--json` の応答は標準出力へ出ている。
    // 例外をそのまま投げると、失敗の理由が終了コードに化けて構造化エラーへ写せない。
    const cli = fakeCli(
      'process.stdout.write(JSON.stringify({success:false,data:null,error:"CDP command timed out"}));process.exit(1);',
    );
    await expect(runCli(fakeOptions(cli), ["snapshot"])).resolves.toEqual({
      success: false,
      data: null,
      error: "CDP command timed out",
    });
  });

  it("応答が無いまま失敗したら不応答として投げる", async () => {
    const cli = fakeCli("process.exit(3);");
    await expect(runCli(fakeOptions(cli), ["snapshot"])).rejects.toMatchObject({
      code: "browser/unresponsive",
    });
  });

  it("引数を配列で渡し、実行ファイルのパスを常に明示する", async () => {
    // 文字列を連結してシェルに解釈させない。ブラウザ本体の自動検出にも任せない。
    const cli = fakeCli(
      "process.stdout.write(JSON.stringify({success:true,data:{argv:process.argv.slice(2)},error:null}));",
    );
    const response = await runCli(fakeOptions(cli), ["snapshot"]);
    const argv = (response.data as { argv: string[] }).argv;
    expect(argv).toEqual([
      "--session",
      "sc-anonymous-1",
      "--executable-path",
      "/path with space/chrome",
      "--json",
      "--namespace",
      "ns",
      "snapshot",
    ]);
  });
});
