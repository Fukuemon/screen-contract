import type { UseCases, ViewportControl, ViewportSnapshot } from "@screen-contract/app";
import { describe, expect, it } from "vitest";
import { createHttpApp } from "./http.js";
import type { AuthPolicy } from "./auth.js";

/**
 * HTTP の公開面。
 *
 * 認可は interface 層に閉じる (ADR-0021)。ここで確かめるのは、**外部入力が
 * use case へ届く前にどこで止まるか**である。
 */

const TOKEN = "t".repeat(43);
const ORIGIN = "http://127.0.0.1:4000";
const HOST = "127.0.0.1:4000";
const POLICY: AuthPolicy = { token: TOKEN, port: 4000 };

const SNAPSHOT: ViewportSnapshot = {
  runId: "current",
  status: "paused",
  mode: "view",
  recording: false,
  events: [],
  entryUrl: "http://127.0.0.1:5174",
  stateUrl: "http://127.0.0.1:5174/",
  steps: [],
  newElements: [],
  badges: [],
};

function fakeUseCases(calls: string[] = []): UseCases & { readonly calls: string[] } {
  return {
    calls,
    startRun: async (input) => void calls.push(`startRun:${input.runId}`),
    saveDraft: async () => "rev" as never,
    loadDraft: async () => undefined,
    loadAuthoritative: async () => undefined,
    requestApproval: async () => ({ id: "a", key: "k", revision: "r" }) as never,
    approve: async () => ({ kind: "approved" }) as never,
    listPendingApprovals: () => [],
  };
}

function fakeViewport(calls: string[]): ViewportControl {
  const snapshot = (label: string): ViewportSnapshot => {
    calls.push(label);
    return SNAPSHOT;
  };
  return {
    start: (url) => Promise.resolve(snapshot(`start:${url ?? "-"}`)),
    resume: () => Promise.resolve(snapshot("resume")),
    stop: () => snapshot("stop"),
    setMode: (mode) => snapshot(`mode:${mode}`),
    setRecording: (recording) => snapshot(`recording:${String(recording)}`),
    snapshot: () => SNAPSHOT,
    navigate: (url) => Promise.resolve(snapshot(`navigate:${url}`)),
    setViewport: (size) =>
      Promise.resolve(snapshot(`size:${String(size.width)}x${String(size.height)}`)),
    resolveAt: (point) =>
      Promise.resolve(
        point.x < 0
          ? undefined
          : {
              locator: { role: "button", name: "開く" },
              box: { x: 0, y: 0, width: 1, height: 1 },
              unique: true,
              matches: 1,
            },
      ),
    observeElements: () => Promise.resolve([]),
    consoleMessages: () => Promise.resolve([{ level: "log", text: "こんにちは" }]),
    addBadge: (locator) => snapshot(`addBadge:${locator.role}/${locator.name}`),
    removeBadge: (id) => snapshot(`removeBadge:${id}`),
    moveBadge: (id, to) => snapshot(`moveBadge:${id}/${String(to)}`),
    allowedOrigins: () => ["http://127.0.0.1:5174"],
    addAllowedOrigin: (origin) => {
      calls.push(`addOrigin:${origin}`);
      return ["http://127.0.0.1:5174", origin];
    },
    listAuthProfiles: () => ({ profiles: ["admin"], active: null, generation: 0 }),
    saveAuthProfile: (name) => {
      calls.push(`saveAuth:${name}`);
      return Promise.resolve({ profiles: [name], active: null, generation: 1 });
    },
    useAuthProfile: (name) => {
      calls.push(`useAuth:${name ?? "-"}`);
      return Promise.resolve({ profiles: ["admin"], active: name ?? null, generation: 1 });
    },
    removeAuthProfile: (name) => {
      calls.push(`removeAuth:${name}`);
      return { profiles: [], active: null, generation: 0 };
    },
  };
}

function setup(options: { policy?: AuthPolicy | undefined } = {}) {
  const calls: string[] = [];
  const app = createHttpApp({
    useCases: fakeUseCases(calls),
    policy: () => ("policy" in options ? options.policy : POLICY),
    viewport: fakeViewport(calls),
  });

  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    // **Host を明示する。** Host 検査は DNS rebinding の主防御であり、
    // 渡さないと `bad-host` で 403 になって認可の他の分岐を確かめられない。
    return app.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: ORIGIN,
        host: HOST,
        "content-type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  return { app, calls, call };
}

describe("認可", () => {
  it("トークンが無ければ 401", async () => {
    const s = setup();
    const response = await s.app.request(`${ORIGIN}/viewport`, {
      headers: { origin: ORIGIN, host: HOST },
    });
    expect(response.status).toBe(401);
    expect(s.calls).toEqual([]);
  });

  it("トークンが違えば 401", async () => {
    const s = setup();
    expect(
      (await s.call("GET", "/viewport", undefined, { authorization: "Bearer x" })).status,
    ).toBe(401);
  });

  it("Bearer の大小を区別しない", async () => {
    // RFC 7235 のスキーム名は大小を区別しない。区別すると原因の分からない 401 になる。
    const s = setup();
    expect(
      (await s.call("GET", "/viewport", undefined, { authorization: `bearer ${TOKEN}` })).status,
    ).toBe(200);
  });

  it("別 origin からは 403", async () => {
    const s = setup();
    expect(
      (await s.call("GET", "/viewport", undefined, { origin: "http://evil.test" })).status,
    ).toBe(403);
  });

  it("listen 前は 503 で、通さない", async () => {
    // ポートが決まる前は Origin も Host も検査できない。検査を飛ばして通さない。
    const s = setup({ policy: undefined });
    const response = await s.call("GET", "/viewport");
    expect(response.status).toBe(503);
    expect(s.calls).toEqual([]);
  });
});

describe("live viewport の操作", () => {
  it("接続で run を起こす", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/start", {})).status).toBe(200);
    expect(s.calls).toEqual(["start:-"]);
  });

  it("開く先を渡せる", async () => {
    const s = setup();
    await s.call("POST", "/viewport/start", { url: "http://127.0.0.1:5174/settings" });
    expect(s.calls).toEqual(["start:http://127.0.0.1:5174/settings"]);
  });

  it("本文なしの接続も受ける", async () => {
    // 開く先の指定は任意である。本文が無いだけで 400 にしない。
    const s = setup();
    const response = await s.app.request(`${ORIGIN}/viewport/start`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, origin: ORIGIN, host: HOST },
    });
    expect(response.status).toBe(200);
    expect(s.calls).toEqual(["start:-"]);
  });

  it("開く先が文字列でなければ 400", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/start", { url: 1 })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("run を未開始へ戻せる", async () => {
    // 終端まで走らせると paused を離れ、操作モードと記録が使えなくなる (ADR-0002)。
    const s = setup();
    expect((await s.call("POST", "/viewport/stop")).status).toBe(200);
    expect(s.calls).toEqual(["stop"]);
  });

  it.each([
    ["view", 200],
    ["operate", 200],
  ])("モード %s を受ける", async (mode, status) => {
    const s = setup();
    expect((await s.call("POST", "/viewport/mode", { mode })).status).toBe(status);
    expect(s.calls).toEqual([`mode:${mode}`]);
  });

  it.each([
    ["語彙に無い", "edit"],
    ["数値", 1],
    ["欠落", undefined],
  ])("モードが %s なら 400", async (_label, mode) => {
    const s = setup();
    expect((await s.call("POST", "/viewport/mode", { mode })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("記録の開始と停止を受ける", async () => {
    const s = setup();
    await s.call("POST", "/viewport/recording", { recording: true });
    await s.call("POST", "/viewport/recording", { recording: false });
    expect(s.calls).toEqual(["recording:true", "recording:false"]);
  });

  it("記録の指定が真偽値でなければ 400", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/recording", { recording: "true" })).status).toBe(400);
  });
});

describe("viewport の寸法", () => {
  it("プリセットの寸法を受ける", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/size", { width: 375, height: 667 })).status).toBe(200);
    expect(s.calls).toEqual(["size:375x667"]);
  });

  it.each([
    ["0", { width: 0, height: 600 }],
    ["負", { width: -1, height: 600 }],
    ["桁外れ", { width: 100000, height: 600 }],
    ["小数", { width: 375.5, height: 600 }],
    ["文字列", { width: "375", height: 600 }],
    ["高さの欠落", { width: 375 }],
  ])("%s を弾く", async (_label, size) => {
    // **client 側の検証を規則にしない。** 素通しすると実行基盤側で失敗し、
    // 原因が読めない。
    const s = setup();
    expect((await s.call("POST", "/viewport/size", size)).status).toBe(400);
    expect(s.calls).toEqual([]);
  });
});

describe("要素の解決", () => {
  it("解決できたら picked を返す", async () => {
    const s = setup();
    const body = (await (await s.call("POST", "/viewport/resolve", { x: 1, y: 2 })).json()) as {
      picked: { locator: { role: string } } | null;
    };
    expect(body.picked?.locator.role).toBe("button");
  });

  it("解決できなければ picked を null にする", async () => {
    // 見つからないことは失敗ではない。地の文には要素が無い。
    const s = setup();
    const body = (await (await s.call("POST", "/viewport/resolve", { x: -1, y: 2 })).json()) as {
      picked: unknown;
    };
    expect(body.picked).toBeNull();
  });

  it("座標が数値でなければ 400", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/resolve", { x: "1", y: 2 })).status).toBe(400);
  });
});

describe("構成番号", () => {
  it("Locator で番号を付ける", async () => {
    const s = setup();
    await s.call("POST", "/viewport/badges", { role: "button", name: "開く" });
    expect(s.calls).toEqual(["addBadge:button/開く"]);
  });

  it("Locator が欠けていれば 400", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/badges", { role: "button" })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("番号を外す", async () => {
    const s = setup();
    await s.call("DELETE", "/viewport/badges/el-a");
    expect(s.calls).toEqual(["removeBadge:el-a"]);
  });

  it("識別子を URL 符号化したまま渡さない", async () => {
    // 日本語を含む ID が来る。復号しないと保存側の照合が外れる。
    const s = setup();
    await s.call("DELETE", `/viewport/badges/${encodeURIComponent("el-button-開く")}`);
    expect(s.calls).toEqual(["removeBadge:el-button-開く"]);
  });

  it("並べ替える", async () => {
    const s = setup();
    await s.call("POST", "/viewport/badges/el-a/move", { to: 1 });
    expect(s.calls).toEqual(["moveBadge:el-a/1"]);
  });

  it.each([
    ["小数", 1.5],
    ["文字列", "1"],
    ["欠落", undefined],
  ])("移動先が %s なら 400", async (_label, to) => {
    const s = setup();
    expect((await s.call("POST", "/viewport/badges/el-a/move", { to })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });
});

describe("対象 origin の列挙", () => {
  it("列挙を返す", async () => {
    const s = setup();
    const body = (await (await s.call("GET", "/viewport/origins")).json()) as {
      origins: string[];
    };
    expect(body.origins).toEqual(["http://127.0.0.1:5174"]);
  });

  it("足す", async () => {
    const s = setup();
    const body = (await (
      await s.call("POST", "/viewport/origins", { origin: "https://example.test" })
    ).json()) as { origins: string[] };
    expect(body.origins).toContain("https://example.test");
    expect(s.calls).toEqual(["addOrigin:https://example.test"]);
  });

  it("origin が文字列でなければ 400", async () => {
    const s = setup();
    expect((await s.call("POST", "/viewport/origins", { origin: 1 })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });
});

describe("認証プロファイル", () => {
  it("一覧を返す", async () => {
    const s = setup();
    const body = (await (await s.call("GET", "/auth/profiles")).json()) as { profiles: string[] };
    expect(body.profiles).toEqual(["admin"]);
  });

  it("取り込む", async () => {
    const s = setup();
    await s.call("POST", "/auth/profiles", { name: "admin" });
    expect(s.calls).toEqual(["saveAuth:admin"]);
  });

  it("匿名へ戻せる", async () => {
    // null は「匿名」であって「指定なし」ではない。区別しないと戻せなくなる。
    const s = setup();
    await s.call("POST", "/auth/use", { name: null });
    expect(s.calls).toEqual(["useAuth:-"]);
  });

  it("名前が文字列でも null でもなければ 400", async () => {
    const s = setup();
    expect((await s.call("POST", "/auth/use", { name: 1 })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("消す", async () => {
    const s = setup();
    await s.call("DELETE", "/auth/profiles/admin");
    expect(s.calls).toEqual(["removeAuth:admin"]);
  });
});

describe("コンソール出力", () => {
  it("実行基盤の生の形ではなく畳んだ形を返す", async () => {
    // CDP の語彙が interface 層まで漏れないようにする (ADR-0013)。
    const s = setup();
    const body = (await (await s.call("GET", "/viewport/console")).json()) as {
      messages: { level: string; text: string }[];
    };
    expect(body.messages).toEqual([{ level: "log", text: "こんにちは" }]);
  });
});

describe("失敗の分類", () => {
  it("検証由来の失敗を 400 にする", async () => {
    const app = createHttpApp({
      useCases: fakeUseCases(),
      policy: () => POLICY,
      viewport: {
        ...fakeViewport([]),
        navigate: () => Promise.reject(new Error("実行してよい origin として列挙されていません")),
      },
    });
    const response = await app.request(`${ORIGIN}/viewport/navigate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: ORIGIN,
        host: HOST,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "http://evil.test/" }),
    });
    expect(response.status).toBe(400);
  });

  it("想定外の失敗を 500 にし、中身を出さない", async () => {
    // 想定外の失敗にはパスや secret が載りうる。詳細は server 側にだけ残す。
    class Unexpected extends Error {
      override name = "TypeError";
    }
    const app = createHttpApp({
      useCases: fakeUseCases(),
      policy: () => POLICY,
      viewport: {
        ...fakeViewport([]),
        navigate: () => Promise.reject(new Unexpected("/Users/someone/.ssh/id_rsa が読めません")),
      },
    });
    const response = await app.request(`${ORIGIN}/viewport/navigate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: ORIGIN,
        host: HOST,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "http://127.0.0.1:5174/" }),
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("id_rsa");
  });
});

describe("viewport を渡さないとき", () => {
  it("/viewport 系の endpoint を生やさない", async () => {
    const app = createHttpApp({ useCases: fakeUseCases(), policy: () => POLICY });
    const response = await app.request(`${ORIGIN}/viewport`, {
      headers: { authorization: `Bearer ${TOKEN}`, origin: ORIGIN, host: HOST },
    });
    expect(response.status).toBe(404);
  });
});
