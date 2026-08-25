import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtimeFilePath } from "./runtime-file.js";
import { startRuntimeFile, type LifecycleEvent, type LifecycleHost } from "./runtime-lifecycle.js";

const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sc-life-"));
  chmodSync(dir, 0o700);
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const VALUE = { address: "127.0.0.1", port: 5173, token: "a".repeat(64) };

function fakeHost(): LifecycleHost & {
  fire(event: LifecycleEvent): void;
  readonly killed: LifecycleEvent[];
  count(event: LifecycleEvent): number;
} {
  const listeners = new Map<LifecycleEvent, (() => void)[]>();
  const killed: LifecycleEvent[] = [];
  return {
    pid: 4242,
    killed,
    on: (event, listener) => void listeners.set(event, [...(listeners.get(event) ?? []), listener]),
    off: (event, listener) =>
      void listeners.set(
        event,
        (listeners.get(event) ?? []).filter((l) => l !== listener),
      ),
    // 実プロセスを殺さない。既定動作を起こしたことだけを記録する。
    kill: (_pid, signal) => void killed.push(signal),
    fire: (event) => {
      // 複製してから回す。ハンドラが自分を外すため、元の配列を直接回すと
      // 次のハンドラを飛ばす。
      const current = (listeners.get(event) ?? []).slice();
      for (const listener of current) {
        listener();
      }
    },
    count: (event) => (listeners.get(event) ?? []).length,
  };
}

describe("startRuntimeFile", () => {
  it("接続先ファイルを書く", () => {
    const dir = tempDir();
    startRuntimeFile(dir, VALUE, fakeHost());
    expect(existsSync(runtimeFilePath(dir))).toBe(true);
  });

  it("自分の pid を書く", async () => {
    const dir = tempDir();
    const host = fakeHost();
    startRuntimeFile(dir, VALUE, host);
    const { readRuntimeFile } = await import("./runtime-file.js");
    expect(readRuntimeFile(dir)?.pid).toBe(host.pid);
  });

  it("明示的な停止で消す", () => {
    const dir = tempDir();
    startRuntimeFile(dir, VALUE, fakeHost()).stop();
    expect(existsSync(runtimeFilePath(dir))).toBe(false);
  });

  it("通常終了で消す", () => {
    const dir = tempDir();
    const host = fakeHost();
    startRuntimeFile(dir, VALUE, host);
    host.fire("exit");
    expect(existsSync(runtimeFilePath(dir))).toBe(false);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("%s で消す", (signal) => {
    // exit だけでは足りない。既定のシグナル終了では exit が発火しない。
    const dir = tempDir();
    const host = fakeHost();
    startRuntimeFile(dir, VALUE, host);
    host.fire(signal);
    expect(existsSync(runtimeFilePath(dir))).toBe(false);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("%s では既定の終了を自分で起こす", (signal) => {
    // ハンドラを付けた時点で既定が無効になるため、何もしないと終われない。
    const host = fakeHost();
    startRuntimeFile(tempDir(), VALUE, host);
    host.fire(signal);
    expect(host.killed).toEqual([signal]);
  });

  it("既定を起こす前に自分のハンドラを外す", () => {
    // 外さないと、送り直したシグナルを自分で拾い直して終われない。
    const host = fakeHost();
    startRuntimeFile(tempDir(), VALUE, host);
    host.fire("SIGINT");
    expect(host.count("SIGINT")).toBe(0);
    expect(host.count("exit")).toBe(0);
  });

  it("二度停止しても壊れない", () => {
    const dir = tempDir();
    const host = fakeHost();
    const lifecycle = startRuntimeFile(dir, VALUE, host);
    lifecycle.stop();
    expect(() => lifecycle.stop()).not.toThrow();
    host.fire("exit");
    expect(existsSync(runtimeFilePath(dir))).toBe(false);
  });

  it("停止したあとのシグナルで既定を二度起こさない", () => {
    const host = fakeHost();
    startRuntimeFile(tempDir(), VALUE, host).stop();
    host.fire("SIGINT");
    expect(host.killed).toEqual([]);
  });
});
