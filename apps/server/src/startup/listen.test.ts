import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listen, type RunningServer } from "./listen.js";
import { readRuntimeFile, runtimeFilePath } from "./runtime-file.js";
import type { LifecycleEvent, LifecycleHost } from "./runtime-lifecycle.js";

let stateDir: string;
let server: RunningServer | undefined;

/** 実プロセスへシグナルを送らない。テストが自分自身を殺す。 */
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
  stateDir = mkdtempSync(join(tmpdir(), "sc-listen-"));
  chmodSync(stateDir, 0o700);
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(stateDir, { recursive: true, force: true });
});

async function start(): Promise<RunningServer> {
  server = await listen({ stateDir, host: fakeHost() });
  return server;
}

/** Host を差し替えて 1 リクエストだけ送る。 */
function statusWithHost(running: RunningServer, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: "127.0.0.1",
        port: running.port,
        path: "/approvals",
        method: "GET",
        setHost: false,
        headers: {
          host,
          authorization: `Bearer ${running.token}`,
          origin: `http://127.0.0.1:${running.port}`,
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.once("error", reject);
    request.end();
  });
}

function headers(running: RunningServer, overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${running.token}`,
    origin: `http://127.0.0.1:${running.port}`,
    host: `127.0.0.1:${running.port}`,
    ...overrides,
  };
}

describe("listen", () => {
  it("127.0.0.1 でだけ待ち受ける", async () => {
    // ループバック以外へ bind しない (ADR-0021)。runtime.json の値ではなく
    // **実際に bind したアドレス**を見る。前者はリテラルの読み戻しにすぎず、
    // 0.0.0.0 へ bind しても緑になる。
    const running = await start();
    expect(running.address).toBe("127.0.0.1");
    expect(readRuntimeFile(stateDir)?.address).toBe("127.0.0.1");
    const response = await fetch(`http://127.0.0.1:${running.port}/approvals`, {
      headers: headers(running),
    });
    expect(response.status).toBe(200);
  });

  it("接続先ファイルを listen の後に 0600 で書く", async () => {
    const running = await start();
    expect(statSync(runtimeFilePath(stateDir)).mode & 0o777).toBe(0o600);
    const runtime = readRuntimeFile(stateDir);
    expect(runtime).toMatchObject({ port: running.port, token: running.token, pid: process.pid });
  });

  it("close で接続先ファイルを消す", async () => {
    const running = await start();
    await running.close();
    server = undefined;
    expect(readRuntimeFile(stateDir)).toBeUndefined();
  });

  it("起動ごとに違うトークンを作る", async () => {
    const first = await start();
    const firstToken = first.token;
    await first.close();
    server = undefined;
    const second = await start();
    expect(second.token).not.toBe(firstToken);
    expect(second.token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("認可", () => {
  it("トークン無しを拒否する", async () => {
    const running = await start();
    const { authorization: _drop, ...rest } = headers(running);
    const response = await fetch(`http://127.0.0.1:${running.port}/approvals`, { headers: rest });
    expect(response.status).toBe(401);
  });

  it("誤ったトークンを拒否する", async () => {
    const running = await start();
    const response = await fetch(`http://127.0.0.1:${running.port}/approvals`, {
      headers: headers(running, { authorization: `Bearer ${"0".repeat(64)}` }),
    });
    expect(response.status).toBe(401);
  });

  it("別プロセスのトークンを拒否する", async () => {
    // 起動ごとに作り直すため、前のプロセスのトークンは通らない。
    const first = await start();
    const stale = first.token;
    await first.close();
    server = undefined;
    const second = await start();
    const response = await fetch(`http://127.0.0.1:${second.port}/approvals`, {
      headers: headers(second, { authorization: `Bearer ${stale}` }),
    });
    expect(response.status).toBe(401);
  });

  it("自分の待受ポート以外の Origin を 403 にする", async () => {
    const running = await start();
    const response = await fetch(`http://127.0.0.1:${running.port}/approvals`, {
      headers: headers(running, { origin: "http://127.0.0.1:1" }),
    });
    expect(response.status).toBe(403);
  });

  it("別ホストの Origin を 403 にする", async () => {
    const running = await start();
    const response = await fetch(`http://127.0.0.1:${running.port}/approvals`, {
      headers: headers(running, { origin: "http://evil.test" }),
    });
    expect(response.status).toBe(403);
  });

  it.each(["localhost:1", "evil.test", "127.0.0.1"])(
    "自分の待受ポート以外の Host (%s) を 403 にする",
    async (host) => {
      // fetch は Host ヘッダを上書きできない (undici が禁止ヘッダとして落とす)。
      // 生の HTTP で送らないと、この検査は素通りする。
      const running = await start();
      expect(await statusWithHost(running, host)).toBe(403);
    },
  );

  it("自分の待受ポートの Host を通す", async () => {
    const running = await start();
    expect(await statusWithHost(running, `127.0.0.1:${running.port}`)).toBe(200);
  });

  it("応答に拒否の内訳を出さない", async () => {
    // どこで落ちたかを教えると、総当たりの手掛かりになる。
    const running = await start();
    const response = await fetch(`http://127.0.0.1:${running.port}/approvals`, {
      headers: headers(running, { authorization: "Bearer wrong" }),
    });
    const body = await response.text();
    expect(body).not.toContain("token");
    expect(body).not.toContain(running.token);
  });
});

describe("承認の endpoint", () => {
  it("draft を保存し、依頼して、承認できる", async () => {
    const running = await start();
    const base = `http://127.0.0.1:${running.port}`;
    const put = await fetch(`${base}/drafts/screens/login`, {
      method: "PUT",
      headers: headers(running),
      body: "画面の内容",
    });
    expect(put.status).toBe(200);

    const requested = await fetch(`${base}/approvals`, {
      method: "POST",
      headers: { ...headers(running), "content-type": "application/json" },
      body: JSON.stringify({ key: "screens/login" }),
    });
    const request = (await requested.json()) as { id: string };

    const approved = await fetch(`${base}/approvals/${request.id}/approve`, {
      method: "POST",
      headers: headers(running),
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()) as { kind: string }).toMatchObject({ kind: "approved" });
  });

  it("承認待ちの間に編集されたら 409 にする", async () => {
    const running = await start();
    const base = `http://127.0.0.1:${running.port}`;
    await fetch(`${base}/drafts/screens/login`, {
      method: "PUT",
      headers: headers(running),
      body: "最初の内容",
    });
    const requested = await fetch(`${base}/approvals`, {
      method: "POST",
      headers: { ...headers(running), "content-type": "application/json" },
      body: JSON.stringify({ key: "screens/login" }),
    });
    const request = (await requested.json()) as { id: string };
    await fetch(`${base}/drafts/screens/login`, {
      method: "PUT",
      headers: headers(running),
      body: "書き換えた内容",
    });
    const approved = await fetch(`${base}/approvals/${request.id}/approve`, {
      method: "POST",
      headers: headers(running),
    });
    expect(approved.status).toBe(409);
    expect((await approved.json()) as { kind: string }).toMatchObject({ kind: "stale" });
  });

  it("規則に合わない保存の鍵を 400 にし、応答へ値を反射しない", async () => {
    const running = await start();
    const response = await fetch(
      `http://127.0.0.1:${running.port}/drafts/..%2F..%2F.ssh%2Fid_rsa`,
      {
        method: "PUT",
        headers: headers(running),
        body: "x",
      },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("id_rsa");
  });
});
