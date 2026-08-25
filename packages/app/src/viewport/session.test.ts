import type { BrowserPort, BrowserSession } from "@screen-contract/core-execution";
import { beforeEach, describe, expect, it } from "vitest";
import { createViewport } from "./session.js";

/**
 * fake が観測した副作用。
 *
 * **テストごとに戻す。** 手で 1 箇所ずつ戻すと、書き忘れた瞬間に実行順で
 * 緑にも赤にもなる。
 */
let emit: ((uri: string) => void) | undefined;
const sent: string[] = [];
let closed = 0;
const sizes: { width: number; height: number }[] = [];
/** セッションを開く要求。認証の中身が「開く前」に渡ったかをここで見る。 */
const requests: unknown[] = [];

beforeEach(() => {
  emit = undefined;
  closed = 0;
  sent.length = 0;
  sizes.length = 0;
  requests.length = 0;
});

/** Port の相手は fake を使う (context/testing.md)。 */
function fakePort(): BrowserPort & { readonly opened: string[]; sessions: number } {
  const opened: string[] = [];
  const port = {
    opened,
    sessions: 0,
    // 配信への接続も Port が持つ。app が WebSocket を直接開かない (ADR-0008)。
    connect: (_handle: unknown, onFrame: (uri: string) => void) => {
      emit = onFrame;
      return {
        send: (payload: string) => void sent.push(payload),
        close: () => void (closed += 1),
      };
    },
    createSession: (input: unknown) => {
      port.sessions += 1;
      requests.push(input);
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
        close: () => Promise.resolve(),
      } as unknown as BrowserSession;
      return Promise.resolve(session);
    },
  };
  return port as BrowserPort & { readonly opened: string[]; sessions: number };
}

describe("createViewport", () => {
  it("渡された entry を開く", async () => {
    // **列挙の判定はここではない** (`createViewportControl` が持つ)。ここが
    // 見るのは「渡された URL をそのまま開く」ことだけである。
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

  it("開けなければ握り潰さず投げ、次で開き直せる", async () => {
    // **投げるだけでは足りない。** 開きかけの Promise を残したままにすると、
    // 2 度目の購読が同じ失敗を永久に掴み、二度と開けなくなる。
    let attempts = 0;
    const browser = {
      connect: () => ({ send: () => undefined, close: () => undefined }),
      createSession: () => {
        attempts += 1;
        return Promise.reject(new Error("開けません"));
      },
    } as unknown as BrowserPort;
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    await expect(viewport.subscribe(() => undefined)).rejects.toThrow("開けません");
    await expect(viewport.subscribe(() => undefined)).rejects.toThrow("開けません");
    expect(attempts).toBe(2);
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
  it("セッションを開く要求へ認証の中身を載せる", async () => {
    // **注入は Port の中で行う** (ADR-0022)。開いた後に入れても、既に描画された
    // 画面は未ログインのままである。app が後から注入する形にすると、順序が
    // app 側の実装の約束になり、Port の契約から読めない。
    const browser = fakePort();
    const storageState = { cookies: [{ name: "session" }], localStorage: {} };
    const viewport = createViewport({
      browser,
      entryUrl: "http://127.0.0.1:5174",
      storageState: () => Promise.resolve(storageState),
    });
    await viewport.subscribe(() => undefined);
    expect(requests).toEqual([{ auth: { kind: "anonymous" }, storageState }]);
    expect(browser.opened).toEqual(["http://127.0.0.1:5174"]);
  });

  it("誰として実行しているかを Port へ渡す", async () => {
    // 匿名を名乗ったまま認証状態を注入すると、認証済みの結果が匿名の Baseline
    // へ混ざる (ADR-0022)。
    const auth = { kind: "profile", name: "admin" } as never;
    const viewport = createViewport({
      browser: fakePort(),
      entryUrl: "http://127.0.0.1:5174",
      auth: () => auth,
      storageState: () => Promise.resolve({ cookies: [], localStorage: {} }),
    });
    await viewport.subscribe(() => undefined);
    expect((requests[0] as { auth: unknown }).auth).toBe(auth);
  });

  it("無ければ注入しない", async () => {
    const viewport = createViewport({
      browser: fakePort(),
      entryUrl: "http://127.0.0.1:5174",
      storageState: () => Promise.resolve(undefined),
    });
    await viewport.subscribe(() => undefined);
    expect(requests).toEqual([{ auth: { kind: "anonymous" }, storageState: undefined }]);
  });

  it("いまの認証状態を取り出せる", async () => {
    const viewport = createViewport({ browser: fakePort(), entryUrl: "http://127.0.0.1:5174" });
    await viewport.subscribe(() => undefined);
    expect(await viewport.captureStorageState()).toEqual({ cookies: [], localStorage: {} });
  });
});

describe("開き直し", () => {
  it("購読者が居れば新しいセッションで張り直す", async () => {
    // 落としたままにすると、誰も開き直さないため映像が二度と来ない。
    const browser = fakePort();
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    await viewport.subscribe(() => undefined);
    await viewport.reset();
    expect(browser.sessions).toBe(2);
    expect(viewport.runner()).toBeDefined();
  });

  it("購読者が居なければ開き直さない", async () => {
    const browser = fakePort();
    const viewport = createViewport({ browser, entryUrl: "http://127.0.0.1:5174" });
    const subscription = await viewport.subscribe(() => undefined);
    await subscription.close();
    await viewport.reset();
    expect(browser.sessions).toBe(1);
    expect(viewport.runner()).toBeUndefined();
  });

  it("開き直した後もフレームが届く", async () => {
    const viewport = createViewport({
      browser: fakePort(),
      entryUrl: "http://127.0.0.1:5174",
    });
    const frames: string[] = [];
    await viewport.subscribe((uri) => void frames.push(uri));
    await viewport.reset();
    emit?.("data:image/jpeg;base64,AAA");
    expect(frames).toEqual(["data:image/jpeg;base64,AAA"]);
  });
});
