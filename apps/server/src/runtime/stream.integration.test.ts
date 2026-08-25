import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listen, type RunningServer } from "./listen.js";
import type { LifecycleEvent, LifecycleHost } from "./runtime-lifecycle.js";
import type { BrowserPort } from "@screen-contract/core-execution";

/**
 * Browser Port の fake。
 *
 * **合成ルートが 1 つだけ作る契約を守る。** テストでも同じ形で渡すことで、
 * 差し替え口が実際に効くことを確かめられる (context/testing.md)。
 */
const fakeBrowser: BrowserPort = {
  connect: () => ({ send: () => undefined, close: () => undefined }),
  createSession: () => Promise.reject(new Error("テストではセッションを開かない")),
};

/**
 * Stream Proxy の接続を実プロセスで確かめる。
 *
 * WebSocket の upgrade は Hono のミドルウェア経路と別に扱うため、単体テストでは
 * 「認可が掛かっている」ことを示せない。
 */

let stateDir: string;
let server: RunningServer | undefined;

function fakeHost(): LifecycleHost {
  const listeners = new Map<LifecycleEvent, (() => void)[]>();
  return {
    pid: process.pid,
    on: (event, listener) => void listeners.set(event, [...(listeners.get(event) ?? []), listener]),
    off: (event, listener) =>
      void listeners.set(
        event,
        (listeners.get(event) ?? []).filter((l) => l !== listener),
      ),
    kill: () => undefined,
  };
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "sc-stream-"));
  chmodSync(stateDir, 0o700);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(stateDir, { recursive: true, force: true });
});

async function start() {
  server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost() });
  return server;
}

/** 接続して 1 往復させ、閉じられたかを返す。 */
function connect(
  running: RunningServer,
  frames: readonly string[],
  origin: string = `http://127.0.0.1:${running.port}`,
): Promise<{ readonly closed: boolean; readonly code: number | undefined }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${running.port}/stream`, {
      headers: { origin },
    } as never);
    let closed = false;
    ws.addEventListener("open", () => {
      for (const frame of frames) {
        ws.send(frame);
      }
      // 閉じられなければ通ったとみなす。
      setTimeout(() => {
        if (!closed) {
          ws.close();
          resolve({ closed: false, code: undefined });
        }
      }, 300);
    });
    ws.addEventListener("close", (event) => {
      closed = true;
      resolve({ closed: event.code === 1008, code: event.code });
    });
    ws.addEventListener("error", reject);
  });
}

describe("Stream Proxy の接続", () => {
  it("最初のフレームが正しい auth なら閉じない", async () => {
    const running = await start();
    const result = await connect(running, [
      JSON.stringify({ kind: "auth", token: running.token, runId: "run-1" }),
    ]);
    expect(result.closed).toBe(false);
  });

  it("誤ったトークンで閉じる", async () => {
    const running = await start();
    const result = await connect(running, [
      JSON.stringify({ kind: "auth", token: "0".repeat(64), runId: "run-1" }),
    ]);
    expect(result.closed).toBe(true);
  });

  it("認証前の入力で閉じる", async () => {
    // 最初のフレームは必ず auth である。
    const running = await start();
    const result = await connect(running, [JSON.stringify({ kind: "input", payload: "x" })]);
    expect(result.closed).toBe(true);
  });

  it("トークンを URL の query に載せずに通る", async () => {
    // URL は履歴・Referer・アクセスログに残る。
    const running = await start();
    const result = await connect(running, [
      JSON.stringify({ kind: "auth", token: running.token, runId: "run-1" }),
    ]);
    expect(result.closed).toBe(false);
  });

  it("run が無ければ認証を通っても入力を中継しない", async () => {
    // 中継条件は server 側の run 状態で判定する (ADR-0008)。
    const running = await start();
    const result = await connect(running, [
      JSON.stringify({ kind: "auth", token: running.token, runId: "run-1" }),
      JSON.stringify({ kind: "input", payload: "input_mouse" }),
    ]);
    // 破棄しても接続は保つ (UI の不具合と迂回の試みを区別するため記録に残す)。
    expect(result.closed).toBe(false);
  });

  it("別 origin からの upgrade を拒否する", async () => {
    const running = await start();
    await expect(
      connect(
        running,
        [JSON.stringify({ kind: "auth", token: running.token, runId: "run-1" })],
        "http://evil.test",
      ),
    ).rejects.toThrow();
  });
});

describe("live viewport の映像", () => {
  /** フレームを 1 枚だけ流す fake。実ブラウザを起こさない。 */
  function fakeViewport(frames: readonly string[]) {
    return {
      subscribe: (onFrame: (uri: string) => void) => {
        for (const frame of frames) {
          setTimeout(() => onFrame(frame), 10);
        }
        return Promise.resolve({ send: () => undefined, close: () => Promise.resolve() });
      },
      // run を起こさないため、実行の相手は無い。
      runner: () => undefined,
      navigate: () => Promise.resolve(),
      setSize: () => Promise.resolve(),
      captureStorageState: () => Promise.resolve({ cookies: [], localStorage: {} }),
      reset: () => Promise.resolve(),
      resolveAt: () => Promise.resolve(undefined),
      observe: () => Promise.resolve([]),
      currentUrl: () => Promise.resolve("http://127.0.0.1:5174/"),
      authWarnings: () => [],
      consoleMessages: () => Promise.resolve([]),
    };
  }

  function collectFrames(
    running: RunningServer,
    frames: readonly string[],
    authenticate: boolean,
  ): Promise<readonly string[]> {
    return new Promise((resolve, reject) => {
      const received: string[] = [];
      const ws = new WebSocket(`ws://127.0.0.1:${running.port}/stream`);
      ws.addEventListener("open", () => {
        if (authenticate) {
          ws.send(JSON.stringify({ kind: "auth", token: running.token, runId: "run-1" }));
        }
        setTimeout(() => {
          ws.close();
          resolve(received);
        }, 400);
      });
      ws.addEventListener("message", (event) => {
        const { data } = event as { data: unknown };
        if (typeof data === "string" && data.startsWith("data:")) {
          received.push(data);
        }
      });
      ws.addEventListener("error", reject);
      void frames;
    });
  }

  it("認証を通したら映像が届く", async () => {
    server = await listen({
      browser: fakeBrowser,
      stateDir,
      host: fakeHost(),
      viewport: fakeViewport(["data:image/jpeg;base64,AAA"]),
    });
    expect(await collectFrames(server, [], true)).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("認証を通す前に映像を流さない", async () => {
    // 流すと、トークンを持たない接続へ対象アプリの画面が届く。
    server = await listen({
      browser: fakeBrowser,
      stateDir,
      host: fakeHost(),
      viewport: fakeViewport(["data:image/jpeg;base64,AAA"]),
    });
    expect(await collectFrames(server, [], false)).toEqual([]);
  });

  it("viewport を渡さなければ映像は流れない", async () => {
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost() });
    expect(await collectFrames(server, [], true)).toEqual([]);
  });
});

describe("Web UI の配信", () => {
  const WEB_ROOT = fileURLToPath(new URL("../../../web/dist/client/", import.meta.url));

  it("配信する HTML へトークンを埋め込む", async () => {
    // ブラウザは runtime.json を読めず、URL の query には載せられない
    // (context/infrastructure.md)。
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost(), webRoot: WEB_ROOT });
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<meta name="screen-contract-token" content="${server.token}">`);
  });

  it("配信ルートの外を読ませない", async () => {
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost(), webRoot: WEB_ROOT });
    const response = await fetch(
      `http://127.0.0.1:${server.port}/assets/..%2f..%2f..%2f..%2fpackage.json`,
    );
    expect(response.status).toBe(404);
  });

  it("配信を渡さなければ shell を返さない", async () => {
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost() });
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    // 認可ミドルウェアへ落ちる (トークンが無いため 401)。
    expect(response.status).not.toBe(200);
  });
});
