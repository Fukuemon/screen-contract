import type { BrowserPort, BrowserSession } from "@screen-contract/core-execution";
import { describe, expect, it, vi } from "vitest";
import { createViewport } from "./viewport.js";

vi.mock("@screen-contract/adapter-browser", () => ({
  connectStream: vi.fn((options: { onFrame: (uri: string) => void }) => {
    sent.length = 0;
    emit = options.onFrame;
    return { send: (payload: string) => void sent.push(payload), close: () => void (closed += 1) };
  }),
}));

let emit: ((uri: string) => void) | undefined;
const sent: string[] = [];
let closed = 0;
const sizes: { width: number; height: number }[] = [];
const restored: unknown[] = [];

/** Port の相手は fake を使う (context/testing.md)。 */
function fakePort(): BrowserPort & { readonly opened: string[]; sessions: number } {
  const opened: string[] = [];
  const port = {
    opened,
    sessions: 0,
    createSession: () => {
      port.sessions += 1;
      const session = {
        perform: (action: { kind: string; url?: string }) => {
          if (action.url !== undefined) {
            opened.push(action.url);
          }
          return Promise.resolve();
        },
        stream: () => Promise.resolve({ endpoint: "ws://127.0.0.1:1" }),
        setViewport: (size: { width: number; height: number }) => {
          sizes.push(size);
          return Promise.resolve();
        },
        captureStorageState: () => Promise.resolve({ cookies: [], localStorage: {} }),
        restoreStorageState: (state: unknown) => {
          restored.push(state);
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      } as unknown as BrowserSession;
      return Promise.resolve(session);
    },
  };
  return port as BrowserPort & { readonly opened: string[]; sessions: number };
}

describe("createViewport", () => {
  it("列挙した origin を開く", async () => {
    // 列挙外へ open しない (ADR-0017)。
    const browser = fakePort();
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    await viewport.subscribe(() => undefined);
    expect(browser.opened).toEqual(["http://127.0.0.1:5174"]);
  });

  it("フレームを購読者へ流す", async () => {
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    const frames: string[] = [];
    await viewport.subscribe((uri) => void frames.push(uri));
    emit?.("data:image/jpeg;base64,AAA");
    expect(frames).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("同時に繋いでも 1 セッションに収める", async () => {
    // 人数分開くとブラウザが増える。
    const browser = fakePort();
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    await Promise.all([viewport.subscribe(() => undefined), viewport.subscribe(() => undefined)]);
    expect(browser.sessions).toBe(1);
  });

  it("全員が離れるまでセッションを閉じない", async () => {
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    closed = 0;
    const first = await viewport.subscribe(() => undefined);
    const second = await viewport.subscribe(() => undefined);
    await first.close();
    expect(closed).toBe(0);
    await second.close();
    expect(closed).toBe(1);
  });

  it("離れた購読者へフレームを流さない", async () => {
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    const frames: string[] = [];
    const subscription = await viewport.subscribe((uri) => void frames.push(uri));
    await viewport.subscribe(() => undefined);
    await subscription.close();
    emit?.("data:image/jpeg;base64,AAA");
    expect(frames).toEqual([]);
  });

  it("入力を対象セッションへ転送する", async () => {
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    const subscription = await viewport.subscribe(() => undefined);
    subscription.send("input_mouse");
    expect(sent).toEqual(["input_mouse"]);
  });

  it("開けなければ握り潰さず投げ、後始末する", async () => {
    // 必須データの欠落を隠さない。
    const browser = {
      createSession: () => Promise.reject(new Error("開けません")),
    } as unknown as BrowserPort;
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    await expect(viewport.subscribe(() => undefined)).rejects.toThrow("開けません");
  });
});

describe("対象と寸法の切り替え", () => {
  it("開き直す", async () => {
    const browser = fakePort();
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    await viewport.subscribe(() => undefined);
    await viewport.navigate("http://127.0.0.1:5174/settings");
    expect(browser.opened).toEqual(["http://127.0.0.1:5174", "http://127.0.0.1:5174/settings"]);
  });

  it("viewport の寸法を変える", async () => {
    sizes.length = 0;
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    await viewport.subscribe(() => undefined);
    await viewport.setSize({ width: 375, height: 667 });
    expect(sizes).toEqual([{ width: 375, height: 667 }]);
  });

  it("セッションが開いていなければ黙って開かない", async () => {
    // 開くと run の開始が暗黙になる。
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    await expect(viewport.navigate("http://127.0.0.1:5174/x")).rejects.toThrow("開いていません");
  });
});

describe("認証状態", () => {
  it("対象を開く前に注入する", async () => {
    // 開いた後では、既に描画された画面が未ログインのままになる (ADR-0022)。
    restored.length = 0;
    const browser = fakePort();
    const state = { cookies: [{ name: "session" }], localStorage: {} };
    const viewport = createViewport({
      browser,
      entryUrl: "http://127.0.0.1:5174",
      storageState: () => Promise.resolve(state),
    });
    await viewport.subscribe(() => undefined);
    expect(restored).toEqual([state]);
    expect(browser.opened).toEqual(["http://127.0.0.1:5174"]);
  });

  it("無ければ注入しない", async () => {
    restored.length = 0;
    const viewport = createViewport({
      browser: fakePort(),
      entryUrl: "http://127.0.0.1:5174",
      storageState: () => Promise.resolve(undefined),
    });
    await viewport.subscribe(() => undefined);
    expect(restored).toEqual([]);
  });

  it("いまの認証状態を取り出せる", async () => {
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    await viewport.subscribe(() => undefined);
    expect(await viewport.captureStorageState()).toEqual({ cookies: [], localStorage: {} });
  });
});
