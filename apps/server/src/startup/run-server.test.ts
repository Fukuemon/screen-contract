import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runServer, type ServerEnv } from "./run-server.js";

/**
 * 利用者と自動検査が観測するのは stderr の 1 行と終了コードである。
 * 例外オブジェクトのフィールドまでしか見ないと、中止の分岐や終了コードの
 * 代入が消えてもテストが緑のままになる。
 */

const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sc-run-"));
  chmodSync(dir, 0o700);
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function env(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    home: tempDir(),
    xdgStateHome: tempDir(),
    cwd: tempDir(),
    forbiddenRoots: [],
    ...overrides,
  };
}

describe("runServer", () => {
  it("ブラウザ未取得なら終了コード 1 で中止し、導入コマンドを案内する", () => {
    // home を空の一時ディレクトリにするとブラウザ本体は存在しない。
    const result = runServer(env());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ブラウザ本体が見つかりません");
    expect(result.stderr).toContain("pnpm browser:install");
    expect(result.stderr.endsWith("\n")).toBe(true);
  });

  it("置き場がリポジトリ配下なら中止する", () => {
    const repo = tempDir();
    const inside = join(repo, "state");
    mkdirSync(inside, { mode: 0o700 });
    const result = runServer(env({ xdgStateHome: inside, forbiddenRoots: [repo] }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("リポジトリ");
  });

  it("設定が壊れていても stack trace を出さない", () => {
    // 起動時に読むファイルは secret を含み、出力は端末とログに残る。
    const cwd = tempDir();
    writeFileSync(join(cwd, "screen-contract.config.json"), "{ broken");
    const result = runServer(env({ cwd }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain("at ");
    expect(result.stderr.split("\n").filter((line) => line.length > 0)).toHaveLength(2);
  });

  it("成功終了しない (listen が未実装のため)", () => {
    // 0 を返すと、起動したつもりの利用者と起動を待つ検査の両方が気付けない。
    expect(runServer(env()).exitCode).not.toBe(0);
  });
});
