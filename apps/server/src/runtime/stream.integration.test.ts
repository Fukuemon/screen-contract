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

/**
 * 接続して 1 往復させる。
 *
 * **閉じられたかだけでは足りない。** 中継してはいけない入力が上流へ届いても、
 * 接続が開いたままなら気付けない。上流の fake が受けたものも返す。
 */
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
      // **フレームを間を空けて送る。** 続けて送ると、認証の後に張られる購読が
      // 間に合わず、入力が中継の手前で落ちる。中継条件を外しても落ちない
      // テストになってしまう。
      frames.forEach((frame, index) => {
        setTimeout(() => {
          if (!closed) {
            ws.send(frame);
          }
        }, index * 150);
      });
      // 閉じられなければ通ったとみなす。
      setTimeout(
        () => {
          if (!closed) {
            ws.close();
            resolve({ closed: false, code: undefined });
          }
        },
        300 + frames.length * 150,
      );
    });
    ws.addEventListener("close", (event) => {
      closed = true;
      resolve({ closed: event.code === 1008, code: event.code });
    });
    ws.addEventListener("error", reject);
  });
}

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
    perform: () => Promise.resolve(),
    navigate: () => Promise.resolve(),
    setSize: () => Promise.resolve(),
    captureStorageState: () => Promise.resolve({ cookies: [], localStorage: {} }),
    reset: () => Promise.resolve(),
    resolveAt: () => Promise.resolve(undefined),
    observe: () => Promise.resolve([]),
    observeVisible: () => Promise.resolve([]),
    currentUrl: () => Promise.resolve("http://127.0.0.1:5174/"),
    entryUrl: () => "http://127.0.0.1:5174/",
    authWarnings: () => [],
    consoleMessages: () => Promise.resolve([]),
  };
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

  it("接続先の URL にトークンを載せない", async () => {
    // URL は履歴・Referer・アクセスログに残る (context/infrastructure.md)。
    // 「閉じられなかった」では、query に載せた場合との区別が付かない。
    const running = await start();
    const url = `ws://127.0.0.1:${String(running.port)}/stream`;
    expect(url).not.toContain(running.token);
    const result = await connect(running, [
      JSON.stringify({ kind: "auth", token: running.token, runId: "run-1" }),
    ]);
    expect(result.closed).toBe(false);
  });

  it("run が無ければ認証を通っても入力を中継しない", async () => {
    // 中継条件は server 側の run 状態で判定する (ADR-0008)。**上流へ届いて
    // いないことを見る。** 接続が閉じないことだけを見ると、中継が素通しに
    // なっても緑のままになる。
    const relayed: string[] = [];
    server = await listen({
      browser: fakeBrowser,
      stateDir,
      host: fakeHost(),
      viewport: {
        ...fakeViewport([]),
        subscribe: () =>
          Promise.resolve({
            send: (payload: string) => void relayed.push(payload),
            close: () => Promise.resolve(),
          }),
      } as never,
    });
    const result = await connect(server, [
      JSON.stringify({ kind: "auth", token: server.token, runId: "run-1" }),
      JSON.stringify({
        kind: "input",
        payload: JSON.stringify({ type: "input_mouse", eventType: "mousePressed", x: 1, y: 2 }),
      }),
    ]);
    // 破棄しても接続は保つ (UI の不具合と迂回の試みを区別するため記録に残す)。
    expect(result.closed).toBe(false);
    expect(relayed).toEqual([]);
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
  function collectFrames(
    running: RunningServer,
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
    });
  }

  it("認証を通したら映像が届く", async () => {
    server = await listen({
      browser: fakeBrowser,
      stateDir,
      host: fakeHost(),
      viewport: fakeViewport(["data:image/jpeg;base64,AAA"]),
    });
    expect(await collectFrames(server, true)).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("認証を通す前に映像を流さない", async () => {
    // 流すと、トークンを持たない接続へ対象アプリの画面が届く。
    server = await listen({
      browser: fakeBrowser,
      stateDir,
      host: fakeHost(),
      viewport: fakeViewport(["data:image/jpeg;base64,AAA"]),
    });
    expect(await collectFrames(server, false)).toEqual([]);
  });

  it("viewport を渡さなければ映像は流れない", async () => {
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost() });
    expect(await collectFrames(server, true)).toEqual([]);
  });
});

describe("Web UI の配信", () => {
  const WEB_ROOT = fileURLToPath(new URL("../../../web/dist/client/", import.meta.url));

  it("起動チケット付きの URL へトークンを埋め込む", async () => {
    // ブラウザは runtime.json を読めず、URL の query には載せられない
    // (context/infrastructure.md)。
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost(), webRoot: WEB_ROOT });
    const response = await fetch(server.openUrl);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<meta name="screen-contract-token" content="${server.token}">`);
  });

  it("チケット無しではトークンを埋め込まない", async () => {
    // **ここが本題である。** 埋め込むと、ループバックへ繋げる同一マシンの任意
    // プロセスが curl 1 本でトークンを取り、以後すべての endpoint を呼べる。
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost(), webRoot: WEB_ROOT });
    const html = await (await fetch(`http://127.0.0.1:${server.port}/`)).text();
    expect(html).not.toContain(server.token);
    expect(html).not.toContain("screen-contract-token");
  });

  it("チケットを使うと cookie が出て、次からは query が要らない", async () => {
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost(), webRoot: WEB_ROOT });
    const first = await fetch(server.openUrl);
    const cookie = first.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    const second = await fetch(`http://127.0.0.1:${server.port}/`, {
      headers: { cookie: (cookie ?? "").split(";")[0] ?? "" },
    });
    expect(await second.text()).toContain(server.token);
  });

  it("違うチケットではトークンを埋め込まない", async () => {
    server = await listen({ browser: fakeBrowser, stateDir, host: fakeHost(), webRoot: WEB_ROOT });
    const html = await (
      await fetch(`http://127.0.0.1:${server.port}/?boot=${"x".repeat(43)}`)
    ).text();
    expect(html).not.toContain(server.token);
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
    // 認可ミドルウェアへ落ちる。**500 でも通る形にしない。**
    expect(response.status).toBe(401);
  });
});
