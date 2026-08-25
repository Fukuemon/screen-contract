import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runtimeFilePath } from "./runtime-file.js";

/**
 * 接続先ファイルがプロセスの寿命に結びついていることを、**実プロセスで**確かめる。
 *
 * 同一プロセス内では `exit` も既定のシグナル終了も起こせないため、単体テストで
 * 差し替えた host では「本当に消えるか」を示せない。
 */

// 子プロセスは TypeScript を読めない。ビルド済みの dist を指す
// (`test:integration` は `^build` に依存する)。
const LIFECYCLE = fileURLToPath(
  new URL("../../dist/startup/runtime-lifecycle.js", import.meta.url),
);
let stateDir: string;
let child: ChildProcess | undefined;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "sc-life-int-"));
  chmodSync(stateDir, 0o700);
});

afterEach(() => {
  child?.kill("SIGKILL");
  child = undefined;
  rmSync(stateDir, { recursive: true, force: true });
});

/**
 * state ディレクトリへ接続先を書いたまま待つ子プロセスを起こす。
 *
 * **書き終えてから ready を送り、そこで一度止まる。** 書く前に終了させると、
 * 1 バイトも書かなくても「消えた」と読める空虚な検査になる。
 */
function spawnHolder(): Promise<ChildProcess> {
  const script = `
    const { startRuntimeFile, processLifecycleHost } = await import(${JSON.stringify(LIFECYCLE)});
    startRuntimeFile(${JSON.stringify(stateDir)}, { address: "127.0.0.1", port: 5173, token: "a".repeat(64) }, processLifecycleHost);
    process.send?.("ready");
    process.on("message", (m) => { if (m === "exit") process.exit(0); });
    setInterval(() => {}, 1000);
  `;
  return new Promise((resolve, reject) => {
    const spawned = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let stderr = "";
    spawned.stderr?.on("data", (chunk: Buffer) => void (stderr += chunk.toString()));
    spawned.once("error", reject);
    spawned.once("message", () => resolve(spawned));
    spawned.once("exit", (code) => {
      reject(new Error(`子プロセスが早期に終了しました (code=${String(code)})\n${stderr}`));
    });
  });
}

/** 終了コードを見る。クラッシュを成功扱いにしない。 */
function exitCodeOf(spawned: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => spawned.once("exit", (code) => resolve(code)));
}

async function waitUntilGone(path: string): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    if (!existsSync(path)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

describe("接続先ファイルの寿命", () => {
  it("起動した子プロセスが接続先ファイルを書く", async () => {
    child = await spawnHolder();
    expect(existsSync(runtimeFilePath(stateDir))).toBe(true);
  });

  it("通常終了で消える", async () => {
    child = await spawnHolder();
    // 書けていることを先に確かめる。確かめないと、書かなくても緑になる。
    expect(existsSync(runtimeFilePath(stateDir))).toBe(true);
    const exited = exitCodeOf(child);
    child.send("exit");
    expect(await exited).toBe(0);
    expect(await waitUntilGone(runtimeFilePath(stateDir))).toBe(true);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("%s で消える", async (signal) => {
    // exit だけでは足りない。既定のシグナル終了では exit が発火しない。
    child = await spawnHolder();
    expect(existsSync(runtimeFilePath(stateDir))).toBe(true);
    child.kill(signal);
    expect(await waitUntilGone(runtimeFilePath(stateDir))).toBe(true);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("%s を受けたら実際に終了する", async (signal) => {
    // ハンドラを付けた時点で既定が無効になるため、付けたまま何もしないと終われない。
    child = await spawnHolder();
    const exited = exitCodeOf(child);
    child.kill(signal);
    await expect(
      Promise.race([
        exited,
        new Promise((_, reject) => setTimeout(() => reject(new Error("終了しません")), 3000)),
      ]),
    ).resolves.not.toBeUndefined();
  });

  it("他プロセスが書いた接続先ファイルを消さない", async () => {
    // 無条件に消すと、二重起動が競り合ったときに先に終了した側が、生きている
    // サーバの接続先を消してしまう。
    child = await spawnHolder();
    const path = runtimeFilePath(stateDir);
    const { readRuntimeFile, writeRuntimeFile } = await import("./runtime-file.js");
    const held = readRuntimeFile(stateDir);
    expect(held?.pid).toBe(child.pid);
    // 別プロセスが書き換えた状況を作る。子はこれを消さずに終わる。
    writeRuntimeFile(stateDir, { ...held!, pid: 999_999 });
    const exited = exitCodeOf(child);
    child.send("exit");
    await exited;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(existsSync(path)).toBe(true);
    expect(readRuntimeFile(stateDir)?.pid).toBe(999_999);
  });
});
