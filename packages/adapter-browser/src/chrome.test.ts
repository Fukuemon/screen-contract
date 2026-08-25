import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isChromeAvailable, resolveChromeInstall } from "./index.js";

const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sc-chrome-"));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveChromeInstall", () => {
  it("同梱の版ファイルから版と置き場を読み、実行ファイルの絶対パスを組み立てる", () => {
    // 版ファイルは取得コマンドと起動時検査の両方が読む。実物で確かめないと、
    // $comment を混ぜた JSON の読み違いに気付けない。
    const install = resolveChromeInstall("/home/u");
    expect(install.buildId).toMatch(/^\d+(?:\.\d+){3}$/);
    expect(install.cacheDir.startsWith("/home/u/")).toBe(true);
    expect(install.executablePath.startsWith(install.cacheDir)).toBe(true);
    expect(install.executablePath).toContain(install.buildId);
  });

  it("home が変われば置き場も変わる", () => {
    expect(resolveChromeInstall("/home/a").cacheDir).not.toBe(
      resolveChromeInstall("/home/b").cacheDir,
    );
  });
});

describe("isChromeAvailable", () => {
  it("実行ビットのあるファイルなら使えると判定する", () => {
    const path = join(tempDir(), "chrome");
    writeFileSync(path, "");
    chmodSync(path, 0o755);
    expect(isChromeAvailable(path)).toBe(true);
  });

  it("実行ビットが無いファイルは使えないと判定する", () => {
    // 取得が途中で中断すると実行できないファイルが残る。存在確認だけだと
    // 起動は通って最初の run で落ちる。
    const path = join(tempDir(), "chrome");
    writeFileSync(path, "");
    chmodSync(path, 0o644);
    expect(isChromeAvailable(path)).toBe(false);
  });

  it("ディレクトリは使えないと判定する", () => {
    expect(isChromeAvailable(tempDir())).toBe(false);
  });

  it("存在しないパスは使えないと判定する", () => {
    expect(isChromeAvailable(join(tempDir(), "absent"))).toBe(false);
  });
});
