import { describe, expect, it } from "vitest";
import {
  isExecutionFailure,
  type AuthContext,
  type BrowserAction,
  type BrowserPort,
  type BrowserSession,
} from "./index.js";

/**
 * Port の相手は fake 実装を使う (context/testing.md)。ここで確かめるのは
 * 契約の形であり、実行基盤の挙動ではない。
 */
function createFakeSession(overrides: Partial<BrowserSession> = {}): BrowserSession {
  return {
    perform: async () => undefined,
    snapshot: async () => ({ capturedAt: "2026-08-25T00:00:00.000Z" }),
    screenshot: async () => ({ bytes: new Uint8Array([0x89, 0x50]) }),
    observeElements: async () => [
      { role: "button", name: "設定を開く", box: { x: 8, y: 90, width: 82, height: 27 } },
    ],
    currentUrl: async () => "http://127.0.0.1:5173/",
    stream: async () => ({ endpoint: "ws://127.0.0.1:5173/stream" }),
    keepalive: async () => undefined,
    setViewport: async () => undefined,
    captureStorageState: async () => ({ cookies: [], localStorage: {} }),
    restoreStorageState: async () => undefined,
    close: async () => undefined,
    ...overrides,
  };
}

describe("BrowserPort の契約", () => {
  it("認証コンテキストを受け取ってセッションを開く", async () => {
    // 省略できると「認証なし」が既定になり、意図しないプロファイルでの実行と
    // Baseline の汚染を招く (ADR-0022)。匿名も明示して渡す。
    const seen: AuthContext[] = [];
    const port: BrowserPort = {
      createSession: async (auth) => {
        seen.push(auth);
        return createFakeSession();
      },
    };
    await port.createSession({ kind: "anonymous" });
    expect(seen).toEqual([{ kind: "anonymous" }]);
  });

  it("型付きの action を受け取る", async () => {
    const performed: BrowserAction[] = [];
    const session = createFakeSession({
      perform: async (action) => {
        performed.push(action);
      },
    });
    await session.perform({ kind: "open", url: "http://127.0.0.1:5173/" });
    await session.perform({
      kind: "click",
      locator: { role: "button", name: "設定を開く" },
    });
    expect(performed).toEqual([
      { kind: "open", url: "http://127.0.0.1:5173/" },
      { kind: "click", locator: { role: "button", name: "設定を開く" } },
    ]);
  });

  it("box 付きの要素一覧を返す", async () => {
    // 座標から要素を解決する入力になる。Accessibility Snapshot の応答に box が
    // 含まれるとは限らないため、取得手段は adapter に閉じる。
    const [element] = await createFakeSession().observeElements();
    expect(element).toEqual({
      role: "button",
      name: "設定を開く",
      box: { x: 8, y: 90, width: 82, height: 27 },
    });
  });

  it("Snapshot / スクリーンショット / 現在 URL / 配信ハンドルを取得できる", async () => {
    const session = createFakeSession();
    expect((await session.snapshot()).capturedAt).toBe("2026-08-25T00:00:00.000Z");
    expect((await session.screenshot()).bytes.length).toBeGreaterThan(0);
    expect(await session.currentUrl()).toBe("http://127.0.0.1:5173/");
    expect((await session.stream()).endpoint).toMatch(/^ws:/);
  });

  it("一時停止中もセッションを生かし続けられる", async () => {
    let alive = 0;
    const session = createFakeSession({
      keepalive: async () => {
        alive += 1;
      },
    });
    await session.keepalive();
    expect(alive).toBe(1);
  });
});

describe("isExecutionFailure", () => {
  it.each(["auth/expired", "browser/unresponsive"] as const)(
    "語彙にあるコードを持つ失敗を分岐できる: %s",
    (code) => {
      // adapter は core の型だけを参照でき、共通の基底クラスを受け取れない。
      // 構造で判定することで、adapter 側が自前の Error を投げられる。
      class AdapterSideError extends Error {
        constructor(readonly code: string) {
          super("失敗しました");
        }
      }
      expect(isExecutionFailure(new AdapterSideError(code))).toBe(true);
    },
  );

  it.each([
    ["語彙に無いコード", { code: "browser/whatever", message: "x" }],
    ["コードが無い", { message: "x" }],
    ["message が無い", { code: "auth/expired" }],
    ["オブジェクトでない", "auth/expired"],
    ["null", null],
    ["素の Error", new Error("失敗")],
  ])("語彙に無い失敗を分岐対象にしない: %s", (_name, value) => {
    // 未知の失敗を握り潰さない。分岐対象にすると、想定していない壊れ方を
    // 既知のコードとして扱ってしまう。
    expect(isExecutionFailure(value)).toBe(false);
  });

  it("不応答を投げる形で表せる (adapter が黙って再作成しない)", async () => {
    // セッションは部分的に壊れる。Snapshot は成功し続けるのにスクリーンショット
    // だけが恒久的に失敗する状態が実在し、生存確認では検出できない。
    const session = createFakeSession({
      screenshot: () => {
        const error = new Error("セッションが応答しません") as Error & { code: string };
        error.code = "browser/unresponsive";
        return Promise.reject(error);
      },
    });
    await expect(session.snapshot()).resolves.toBeDefined();
    await expect(session.screenshot()).rejects.toSatisfy(isExecutionFailure);
  });
});
