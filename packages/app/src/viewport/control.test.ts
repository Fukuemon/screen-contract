import { describe, expect, it } from "vitest";
import type { AuthProfileStore } from "./auth-profiles.js";
import { createViewportControl } from "./control.js";
import type { RunSession } from "./run-session.js";
import type { Viewport } from "./session.js";

const ALLOWED = ["http://127.0.0.1:5174", "https://example.test"];

function setup() {
  const navigated: string[] = [];
  const sizes: { width: number; height: number }[] = [];
  const saved = new Map<string, unknown>();
  let resets = 0;
  let active: string | undefined;

  const viewport = {
    navigate: (url: string) => {
      navigated.push(url);
      return Promise.resolve();
    },
    setSize: (size: { width: number; height: number }) => {
      sizes.push(size);
      return Promise.resolve();
    },
    captureStorageState: () => Promise.resolve({ cookies: [{ name: "s" }], localStorage: {} }),
    reset: () => {
      resets += 1;
      return Promise.resolve();
    },
  } as unknown as Viewport;

  const generations = new Map<string, number>();
  const authProfiles = {
    assertName: (name: string) => {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || name === "anonymous") {
        throw new Error("認証プロファイル名の規則に合いません");
      }
    },
    list: () => [...saved.keys()].sort(),
    save: (name: string, state: unknown) => {
      saved.set(name, state);
      const next = (generations.get(name) ?? 0) + 1;
      generations.set(name, next);
      return next;
    },
    generation: (name: string) => generations.get(name) ?? 0,
    load: (name: string) => saved.get(name),
    remove: (name: string) => void saved.delete(name),
  } as AuthProfileStore;

  let runResets = 0;
  let starts = 0;
  const states: string[] = [];
  const run = {
    snapshot: () => ({ status: "paused" }),
    enterState: (url: string) => void states.push(url),
    start: () => {
      starts += 1;
      return Promise.resolve({ status: "paused" });
    },
    reset: () => {
      runResets += 1;
      return { status: "idle" };
    },
  } as unknown as RunSession;

  const added: string[] = [];
  const origins = [...ALLOWED];
  const allowedOrigins = {
    list: () => [...origins],
    has: (origin: string) => origins.includes(origin),
    add: (origin: string) => {
      added.push(origin);
      origins.push(origin);
      return [...origins];
    },
  };

  const control = createViewportControl({
    run,
    viewport,
    allowedOrigins,
    authProfiles,
    setActiveProfile: (name) => {
      active = name;
    },
  });

  return {
    control,
    added,
    navigated,
    sizes,
    saved,
    resets: () => resets,
    runResets: () => runResets,
    starts: () => starts,
    states,
    active: () => active,
  };
}

describe("対象の切り替え", () => {
  it("列挙した origin を開く", async () => {
    const s = setup();
    await s.control.navigate("http://127.0.0.1:5174/settings");
    expect(s.navigated).toEqual(["http://127.0.0.1:5174/settings"]);
  });

  it("列挙外の origin を開かない", async () => {
    // 列挙という安全装置を UI から迂回させない (ADR-0017)。
    const s = setup();
    await expect(s.control.navigate("http://evil.test/")).rejects.toThrow("列挙されていません");
    expect(s.navigated).toEqual([]);
  });

  it("URL として解釈できないものを開かない", async () => {
    const s = setup();
    await expect(s.control.navigate("not-a-url")).rejects.toThrow("解釈できません");
  });

  it("列挙をそのまま返す", () => {
    expect(setup().control.allowedOrigins()).toEqual(ALLOWED);
  });

  it("列挙へ足すと開けるようになる", async () => {
    // **列挙は残す。** 任意の URL を開けるようにしても、追加は明示的な操作
    // として記録する (ADR-0017)。
    const s = setup();
    await expect(s.control.navigate("https://added.test/x")).rejects.toThrow();
    s.control.addAllowedOrigin("https://added.test");
    expect(s.added).toEqual(["https://added.test"]);
    await s.control.navigate("https://added.test/x");
    expect(s.navigated).toEqual(["https://added.test/x"]);
  });

  it("開く先を渡すと run を起こしてからそこへ移る", async () => {
    // run の 1 ステップは entry への open のままにする。順を入れ替えると
    // pause 意味論 (ステップ完了後に停止) を変えることになる (ADR-0002)。
    const s = setup();
    await s.control.start("https://example.test/login");
    expect(s.starts()).toBe(1);
    expect(s.navigated).toEqual(["https://example.test/login"]);
  });

  it("開く先を渡さなければ entry のままにする", async () => {
    const s = setup();
    await s.control.start();
    expect(s.starts()).toBe(1);
    expect(s.navigated).toEqual([]);
  });

  it("列挙外を渡されたら run を起こさない", async () => {
    // 起こしてから断ると、開けない run が paused で残る。
    const s = setup();
    await expect(s.control.start("http://evil.test/")).rejects.toThrow("列挙されていません");
    expect(s.starts()).toBe(0);
  });

  it("移動したら構成番号の帳簿もその画面へ切り替える", () => {
    // 番号は画面ごとに別である (ADR-0005)。切り替えないと前の画面の番号が残る。
    const s = setup();
    return s.control.navigate("https://example.test/a").then(() => {
      expect(s.states).toEqual(["https://example.test/a"]);
    });
  });

  it("run を未開始へ戻せる", () => {
    // 終端まで走らせると paused を離れ、操作モードと記録が使えなくなる。
    // 戻る経路が無いと、そこで行き止まりになる (ADR-0002)。
    const s = setup();
    expect(s.control.stop()).toEqual({ status: "idle" });
    expect(s.runResets()).toBe(1);
  });

  it("viewport の寸法を変える", async () => {
    const s = setup();
    await s.control.setViewport({ width: 375, height: 667 });
    expect(s.sizes).toEqual([{ width: 375, height: 667 }]);
  });
});

describe("認証プロファイル", () => {
  it("いま開いている画面の状態を取り込む", async () => {
    const s = setup();
    await s.control.saveAuthProfile("admin");
    expect(s.saved.get("admin")).toEqual({ cookies: [{ name: "s" }], localStorage: {} });
  });

  it("保存すると一覧に出る", async () => {
    const s = setup();
    expect(await s.control.saveAuthProfile("admin")).toMatchObject({ profiles: ["admin"] });
    expect(s.control.listAuthProfiles().profiles).toEqual(["admin"]);
  });

  it("切り替えるとセッションを作り直す", async () => {
    // **開いたままの画面へ注入しても、既に描画されたものは前の状態のまま。**
    const s = setup();
    await s.control.useAuthProfile("admin");
    expect(s.active()).toBe("admin");
    expect(s.resets()).toBe(1);
    // run も戻す。戻さないと、捨てたセッションへ入力を中継し続ける。
    expect(s.runResets()).toBe(1);
  });

  it("規則に合わない名前へ切り替えない", async () => {
    // 通すと不正な名前が保持され、失敗が次にセッションを開くときまで遅れる。
    const s = setup();
    await expect(s.control.useAuthProfile("../../etc/passwd")).rejects.toThrow("規則に合いません");
    expect(s.active()).toBeUndefined();
    expect(s.resets()).toBe(0);
  });

  it("予約語へ切り替えない", async () => {
    const s = setup();
    await expect(s.control.useAuthProfile("anonymous")).rejects.toThrow("規則に合いません");
  });

  it("匿名へ戻せる", async () => {
    const s = setup();
    await s.control.useAuthProfile("admin");
    await s.control.useAuthProfile(undefined);
    expect(s.active()).toBeUndefined();
    expect(s.resets()).toBe(2);
  });

  it("削除できる", async () => {
    const s = setup();
    await s.control.saveAuthProfile("admin");
    expect(s.control.removeAuthProfile("admin")).toMatchObject({ profiles: [] });
  });
});
