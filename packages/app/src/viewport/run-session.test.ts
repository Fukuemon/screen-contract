import type { BrowserAction } from "@screen-contract/core-execution";
import { ConflictError } from "../errors.js";
import { describe, expect, it } from "vitest";
import type { ElementId } from "@screen-contract/domain";
import { createRunSession, type RunSession } from "./run-session.js";

const ENTRY = "http://127.0.0.1:5174/";

/**
 * 対象ページの fake (context/testing.md)。
 *
 * `perform` と `currentUrl` を持つ。**観測は run 側が組み立てる** ため、
 * ここは「いまどこに居るか」だけを返す。
 */
function fakeRunner(initialUrl = "/other") {
  const performed: BrowserAction[] = [];
  let path = initialUrl;
  return {
    performed,
    perform: (action: BrowserAction) => {
      performed.push(action);
      if (action.kind === "open") {
        path = new URL(action.url).pathname;
      }
      return Promise.resolve();
    },
    currentUrl: () => Promise.resolve(`http://127.0.0.1:5174${path}`),
  };
}

function session(runner: ReturnType<typeof fakeRunner> | undefined) {
  // セッションが無いときは観測も実行も断る。合成ルートの `Viewport` と同じ形。
  const closed = () => Promise.reject(new ConflictError("セッションが開いていません"));
  return createRunSession({
    entryUrl: ENTRY,
    perform: runner?.perform ?? closed,
    currentUrl: runner?.currentUrl ?? closed,
  });
}

describe("run の入口", () => {
  it("接続で 1 ステップ実行して paused に入る", async () => {
    // 操作モードと記録は paused の run の枠内でしか使えない (ADR-0002 / ADR-0026)。
    const runner = fakeRunner();
    const snapshot = await session(runner).start();
    expect(snapshot.status).toBe("paused");
    expect(runner.performed).toEqual([{ kind: "open", url: ENTRY }]);
  });

  it("既に到達していれば冪等スキップで開き直さない", async () => {
    const runner = fakeRunner("/");
    const snapshot = await session(runner).start();
    expect(runner.performed).toEqual([]);
    expect(snapshot.status).toBe("paused");
  });

  it("実行の相手がいなければ黙って idle に留めない", async () => {
    await expect(session(undefined).start()).rejects.toThrow("セッションが開いていません");
  });

  it("再開すると completed で終わる", async () => {
    const run = session(fakeRunner());
    await run.start();
    expect((await run.resume()).status).toBe("completed");
  });
});

describe("モードと記録", () => {
  it("paused でなければ操作モードへ入れない", () => {
    const run = session(fakeRunner());
    expect(run.setMode("operate").mode).toBe("view");
  });

  it("paused なら操作モードへ入れる", async () => {
    const run = session(fakeRunner());
    await run.start();
    expect(run.setMode("operate").mode).toBe("operate");
  });

  it("選択モードでは記録を始められない", async () => {
    const run = session(fakeRunner());
    await run.start();
    expect(run.setRecording(true).recording).toBe(false);
  });

  it("操作モードなら記録を始められる", async () => {
    const run = session(fakeRunner());
    await run.start();
    run.setMode("operate");
    expect(run.setRecording(true).recording).toBe(true);
  });

  it("選択モードへ戻すと記録も止まる", async () => {
    const run = session(fakeRunner());
    await run.start();
    run.setMode("operate");
    run.setRecording(true);
    expect(run.setMode("view").recording).toBe(false);
  });

  it("再開したら操作モードと記録を降ろす", async () => {
    const run = session(fakeRunner());
    await run.start();
    run.setMode("operate");
    run.setRecording(true);
    const resumed = await run.resume();
    expect(resumed.mode).toBe("view");
    expect(resumed.recording).toBe(false);
  });
});

describe("中継条件へ渡す状態", () => {
  it("run が無ければ undefined を返す", () => {
    // 素通しにしない。入力はすべて no-run として破棄される。
    expect(session(fakeRunner()).relayState()).toBeUndefined();
  });

  it("paused かどうかと mode を server 側から渡す", async () => {
    // client の自称で中継条件を満たせないようにする (ADR-0008)。
    const run = session(fakeRunner());
    await run.start();
    expect(run.relayState()).toEqual({ runId: "current", paused: true, mode: "view" });
    run.setMode("operate");
    expect(run.relayState()).toEqual({ runId: "current", paused: true, mode: "operate" });
  });

  it("再開したら paused でなくなる", async () => {
    const run = session(fakeRunner());
    await run.start();
    await run.resume();
    expect(run.relayState()?.paused).toBe(false);
  });
});

describe("構成番号", () => {
  const button = { role: "button", name: "保存" };
  const link = { role: "link", name: "戻る" };

  it("リストの位置がそのまま番号になる", () => {
    // 番号は 1..N の連番で、欠番を作らない (ADR-0005)。
    const s = session(fakeRunner());
    s.addBadge(button);
    const after = s.addBadge(link);
    // ID は不透明な連番である。名称を識別子にしない (ADR-0012)。
    expect(after.badges).toEqual(["el-0001", "el-0002"]);
    expect(s.moveBadge("el-0002" as ElementId, 0).badges).toEqual(["el-0002", "el-0001"]);
  });

  it("同じ要素へ二重に番号を付けない", () => {
    const s = session(fakeRunner());
    s.addBadge(button);
    expect(s.addBadge(button).badges).toEqual(["el-0001"]);
  });

  it("画面を移ると番号を引き継がない", () => {
    // 引き継ぐと、居ない要素へ番号を振ったまま別の画面を採番することになる。
    const s = session(fakeRunner());
    s.addBadge(button);
    s.enterState("http://127.0.0.1:5174/settings");
    expect(s.snapshot().badges).toEqual([]);
  });

  it("元の画面へ戻ると番号も戻る", () => {
    // 捨てるのではなく画面ごとに持つ。捨てると往復のたびに採番し直しになる。
    const s = session(fakeRunner());
    s.addBadge(button);
    s.enterState("http://127.0.0.1:5174/settings");
    s.addBadge(link);
    expect(s.snapshot().badges).toEqual(["el-0002"]);
    s.enterState(ENTRY);
    expect(s.snapshot().badges).toEqual(["el-0001"]);
  });

  it("query と fragment の違いで画面を分けない", () => {
    // 分けると同じ画面が別の状態として増え、番号を振り直す先が分からなくなる。
    const s = session(fakeRunner());
    s.addBadge(button);
    s.enterState("http://127.0.0.1:5174/?tab=1#top");
    expect(s.snapshot().badges).toEqual(["el-0001"]);
  });

  it("要素の定義は画面をまたいで残す", () => {
    // 定義は要素の同一性であって番号ではない。消すと枠の表示名が引けなくなる。
    const s = session(fakeRunner());
    s.addBadge(button);
    s.enterState("http://127.0.0.1:5174/settings");
    expect(s.snapshot().newElements.map((element) => element.id)).toEqual(["el-0001"]);
  });

  it("いま採番している画面を写しに載せる", () => {
    const s = session(fakeRunner());
    s.enterState("http://127.0.0.1:5174/settings?a=1");
    expect(s.snapshot().stateUrl).toBe("http://127.0.0.1:5174/settings");
  });
});

/** ID は不透明な連番である。どの要素かは定義の locator で引く。 */
function idOf(s: RunSession, locator: { role: string; name: string }): string | undefined {
  return s
    .snapshot()
    .newElements.find(
      (element) => element.locator.role === locator.role && element.locator.name === locator.name,
    )?.id;
}

describe("入力の記録と転送", () => {
  const NONE = { alt: false, ctrl: false, meta: false, shift: false } as const;
  const press = (x: number, y: number) =>
    ({ kind: "pointer", phase: "down", x, y, button: "left", modifiers: NONE }) as const;
  const box = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

  /**
   * 対象ページの fake。
   *
   * **転送を境に見える要素が変わる。** 実物と同じ形にしないと、期待状態が
   * 空のままでもテストが緑になる。
   */
  function fakePage(after: readonly { role: string; name: string }[]) {
    let url = "http://127.0.0.1:5174/";
    let elements = [{ role: "button", name: "開く", box: box(0, 0) }];
    return {
      forwards: 0,
      observe: () => Promise.resolve(elements),
      currentUrl: () => Promise.resolve(url),
      /** 転送されたら画面が変わる。実物のクリックと同じ順序になる。 */
      react: (nextUrl?: string) => {
        elements = after.map((element) => ({ ...element, box: box(0, 0) }));
        if (nextUrl !== undefined) {
          url = nextUrl;
        }
      },
    };
  }

  function recording(page: ReturnType<typeof fakePage>) {
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: () => Promise.resolve(),
      observe: page.observe,
      currentUrl: page.currentUrl,
      // 実時間へ依存させない。fake は転送と同時に変わる。
      settle: { attempts: 0, intervalMs: 0 },
    });
    return s;
  }

  async function record(page: ReturnType<typeof fakePage>, nextUrl?: string) {
    const s = recording(page);
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    await s.handleInput(press(5, 5), () => {
      page.forwards += 1;
      page.react(nextUrl);
    });
    return s;
  }

  it("転送で現れた要素が期待状態に入る", async () => {
    // **ここが中核である。** 転送を記録の外へ出すと、操作前の状態で「後」を
    // 観測して候補が常に空になる。期待状態が無いと冪等スキップが効かない。
    const page = fakePage([
      { role: "button", name: "開く" },
      { role: "heading", name: "設定" },
    ]);
    const s = await record(page);
    expect(page.forwards).toBe(1);
    // ID は不透明である。どの要素かは定義の locator で確かめる。
    const expected = s.snapshot().steps[0]?.expect ?? [];
    expect(expected).toHaveLength(1);
    expect(idOf(s, { role: "heading", name: "設定" })).toBe((expected[0] as { ref: string }).ref);
  });

  it("転送で消えた要素も期待状態に入る", async () => {
    const page = fakePage([{ role: "heading", name: "設定" }]);
    const s = await record(page);
    expect(s.snapshot().steps[0]?.expect).toContainEqual({
      kind: "element",
      ref: idOf(s, { role: "button", name: "開く" }),
      visible: false,
    });
  });

  it("転送で移った先の URL が期待状態に入る", async () => {
    const page = fakePage([{ role: "button", name: "開く" }]);
    const s = await record(page, "http://127.0.0.1:5174/settings");
    expect(s.snapshot().steps[0]?.expect).toContainEqual({ kind: "url", path: "/settings" });
  });

  it("移った先へ構成番号の帳簿を切り替える", async () => {
    const page = fakePage([{ role: "button", name: "開く" }]);
    const s = await record(page, "http://127.0.0.1:5174/settings");
    expect(s.snapshot().stateUrl).toBe("http://127.0.0.1:5174/settings");
  });

  it("記録していなくても転送する", async () => {
    // 記録の有無で操作が効いたり効かなくなったりしない。
    const page = fakePage([]);
    const s = recording(page);
    await s.start();
    await s.handleInput(press(5, 5), () => (page.forwards += 1));
    expect(page.forwards).toBe(1);
    expect(s.snapshot().steps).toEqual([]);
  });

  it("押下以外は 1 手順に数えない", async () => {
    // 移動と離すまで記録すると、1 クリックが 3 手順になる。
    const page = fakePage([{ role: "heading", name: "設定" }]);
    const s = recording(page);
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    const others = [
      { kind: "pointer", phase: "move", x: 5, y: 5, button: "none", modifiers: NONE },
      { kind: "pointer", phase: "up", x: 5, y: 5, button: "left", modifiers: NONE },
      { kind: "scroll", x: 5, y: 5, dx: 0, dy: 10, modifiers: NONE },
    ] as const;
    for (const input of others) {
      await s.handleInput(input, () => (page.forwards += 1));
    }
    expect(page.forwards).toBe(3);
    expect(s.snapshot().steps).toEqual([]);
  });

  it("解決できない座標を clickPoint と警告で残す", async () => {
    // 記録の途中で止めない (ADR-0026)。
    const page = fakePage([{ role: "heading", name: "設定" }]);
    const s = recording(page);
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    await s.handleInput(press(900, 900), () => page.react());
    const step = s.snapshot().steps[0];
    expect(step?.action).toEqual({ kind: "clickPoint", x: 900, y: 900 });
    expect(step?.warning).toBeDefined();
  });

  it("記録を止めて再開しても前の手順を消さない", async () => {
    const page = fakePage([{ role: "heading", name: "設定" }]);
    const s = await record(page);
    s.setRecording(false);
    s.setRecording(true);
    await s.handleInput(press(5, 5), () => page.react());
    const ids = s.snapshot().steps.map((step) => step.id);
    expect(ids).toEqual(["step-0", "step-1"]);
  });

  it("同じ要素を 2 回押しても定義を重複させない", async () => {
    const page = fakePage([{ role: "button", name: "開く" }]);
    const s = await record(page);
    await s.handleInput(press(5, 5), () => page.react());
    expect(s.snapshot().newElements).toHaveLength(1);
  });

  it("反映を待つ", async () => {
    // 転送の直後はまだ何も変わっていないことがある。1 回見て諦めると、期待状態が
    // 空になる。
    const page = fakePage([]);
    let ticks = 0;
    let elements = [{ role: "button", name: "開く", box: box(0, 0) }];
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: () => Promise.resolve(),
      observe: () => {
        ticks += 1;
        // 転送から 3 回目の観測でようやく変わる。
        if (ticks > 4) {
          elements = [{ role: "heading", name: "設定", box: box(0, 0) }];
        }
        return Promise.resolve(elements);
      },
      currentUrl: page.currentUrl,
      settle: { attempts: 5, intervalMs: 0 },
    });
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    await s.handleInput(press(5, 5), () => undefined);
    expect(s.snapshot().steps[0]?.expect).toContainEqual({
      kind: "element",
      ref: idOf(s, { role: "heading", name: "設定" }),
      visible: true,
    });
  });

  it("何も変わらなければ諦める", async () => {
    // 何も変わらないクリックは実在する。待ち続けると操作が固まる。
    const page = fakePage([{ role: "button", name: "開く" }]);
    const s = await record(page);
    expect(s.snapshot().steps[0]?.expect).toEqual([]);
  });
});

describe("入力の順序", () => {
  const NONE = { alt: false, ctrl: false, meta: false, shift: false } as const;
  const at = (phase: "down" | "up") =>
    ({ kind: "pointer", phase, x: 5, y: 5, button: "left", modifiers: NONE }) as const;

  it("受けた順に転送する", async () => {
    // **押下だけが観測を挟む。** 並べないと離すが押下を追い越し、対象ページは
    // クリックとして解釈できない。1 回目が効かない原因になる。
    const order: string[] = [];
    let elements = [{ role: "button", name: "開く", box: { x: 0, y: 0, width: 10, height: 10 } }];
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: () => Promise.resolve(),
      observe: () => Promise.resolve(elements),
      // 観測に時間がかかる状況を作る。実物では要素数に比例して伸びる。
      observeVisible: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return elements.map((element) => ({ role: element.role, name: element.name }));
      },
      currentUrl: () => Promise.resolve(ENTRY),
      settle: { attempts: 0, intervalMs: 0 },
    });
    await s.start();
    s.setMode("operate");
    s.setRecording(true);

    const pressed = s.handleInput(at("down"), () => {
      order.push("down");
      elements = [{ role: "heading", name: "設定", box: { x: 0, y: 0, width: 10, height: 10 } }];
    });
    const released = s.handleInput(at("up"), () => order.push("up"));
    await Promise.all([pressed, released]);

    expect(order).toEqual(["down", "up"]);
  });

  it("記録の失敗で後続の入力を止めない", async () => {
    // 鎖が切れると、以後の操作が一切届かなくなる。
    const order: string[] = [];
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: () => Promise.resolve(),
      observe: () => Promise.reject(new Error("取得できません")),
      currentUrl: () => Promise.resolve(ENTRY),
      settle: { attempts: 0, intervalMs: 0 },
    });
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    await s.handleInput(at("down"), () => order.push("down")).catch(() => undefined);
    await s.handleInput(at("up"), () => order.push("up"));
    expect(order).toContain("up");
  });
});

describe("転送と反映待ちの分離", () => {
  const NONE = { alt: false, ctrl: false, meta: false, shift: false } as const;
  const at = (phase: "down" | "up") =>
    ({ kind: "pointer", phase, x: 5, y: 5, button: "left", modifiers: NONE }) as const;
  const box = { x: 0, y: 0, width: 10, height: 10 };

  it("離すが届いてから変わる画面でも期待状態を取れる", async () => {
    // **反映待ちの中へ離すを閉じ込めない。** 押下の反映はクリックが成立する
    // まで起きないため、閉じ込めると永久に変化せず、期待状態が必ず空になる。
    let elements = [{ role: "button", name: "開く", box }];
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: () => Promise.resolve(),
      observe: () => Promise.resolve(elements),
      observeVisible: () =>
        Promise.resolve(elements.map((element) => ({ role: element.role, name: element.name }))),
      currentUrl: () => Promise.resolve(ENTRY),
      settle: { attempts: 6, intervalMs: 0 },
    });
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    // 解決の材料が揃うのを待つ。
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pressed = s.handleInput(at("down"), () => undefined);
    // 離すは押下の転送が済み次第、反映待ちを待たずに届く。
    const released = s.handleInput(at("up"), () => {
      elements = [{ role: "heading", name: "設定", box }];
    });
    await Promise.all([pressed, released]);

    expect(s.snapshot().steps[0]?.expect).toContainEqual({
      kind: "element",
      ref: idOf(s, { role: "heading", name: "設定" }),
      visible: true,
    });
  });
});

describe("記録の再現", () => {
  const NONE = { alt: false, ctrl: false, meta: false, shift: false } as const;
  const box = { x: 0, y: 0, width: 10, height: 10 };
  const press = (x: number, y: number) =>
    ({ kind: "pointer", phase: "down", x, y, button: "left", modifiers: NONE }) as const;

  /** 記録を 1 手だけ積んだ run。 */
  async function recorded() {
    const performed: BrowserAction[] = [];
    let elements = [{ role: "button", name: "開く", box }];
    let path = "/other";
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: (action) => {
        performed.push(action);
        if (action.kind === "open") {
          path = new URL(action.url).pathname;
        }
        if (action.kind === "click") {
          elements = [{ role: "heading", name: "設定", box }];
        }
        return Promise.resolve();
      },
      currentUrl: () => Promise.resolve(`http://127.0.0.1:5174${path}`),
      observe: () => Promise.resolve(elements),
      observeVisible: () =>
        Promise.resolve(elements.map((element) => ({ role: element.role, name: element.name }))),
      settle: { attempts: 0, intervalMs: 0 },
    });
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await s.handleInput(press(5, 5), () => {
      elements = [{ role: "heading", name: "設定", box }];
    });
    performed.length = 0;
    return {
      session: s,
      performed,
      /** 記録前の画面へ戻す。 */
      reset: () => {
        elements = [{ role: "button", name: "開く", box }];
        path = "/other";
      },
    };
  }

  it("記録した手順を entry から実行する", async () => {
    // 途中の状態から始めない。記録は entry への到達を前提に積まれている。
    const r = await recorded();
    r.reset();
    await r.session.replay();
    expect(r.performed).toEqual([
      { kind: "open", url: ENTRY },
      { kind: "click", locator: { role: "button", name: "開く" } },
    ]);
  });

  it("既に entry に居れば開き直さない", async () => {
    // 冪等スキップが効く。効かないと、再現のたびに画面が巻き戻る。
    const r = await recorded();
    await r.session.replay();
    expect(r.performed.filter((action) => action.kind === "open")).toEqual([]);
  });

  it("要素 ID ではなく Locator で探す", async () => {
    // 記録に残すのは ID だが、実際に探すのは Locator である (ADR-0026)。
    const r = await recorded();
    r.reset();
    await r.session.replay();
    const click = r.performed.find((action) => action.kind === "click");
    expect(click).toEqual({ kind: "click", locator: { role: "button", name: "開く" } });
  });

  it("手順が無ければ再現しない", async () => {
    const s = session(fakeRunner());
    await s.start();
    await expect(s.replay()).rejects.toThrow("再現する手順がありません");
  });

  it("最後まで走らせる", async () => {
    // 途中で止めると、どこまで再現できたか読めない。
    const r = await recorded();
    r.reset();
    const snapshot = await r.session.replay();
    expect(snapshot.status).not.toBe("paused");
  });

  it("再現したら操作モードと記録を降ろす", async () => {
    const r = await recorded();
    r.reset();
    const snapshot = await r.session.replay();
    expect(snapshot.mode).toBe("view");
    expect(snapshot.recording).toBe(false);
  });
});

describe("再現の冪等スキップ", () => {
  const NONE = { alt: false, ctrl: false, meta: false, shift: false } as const;
  const box = { x: 0, y: 0, width: 10, height: 10 };

  it("既に到達している手順をやり直さない", async () => {
    // **知っている要素は「見えない」まで観測する。** 載せないと
    // `visible: false` の期待状態が `unevaluatable` になり、冪等スキップが
    // 効かない。再現のたびに同じ操作をやり直すことになる。
    const performed: BrowserAction[] = [];
    let elements = [{ role: "button", name: "開く", box }];
    const s = createRunSession({
      entryUrl: ENTRY,
      perform: (action) => {
        performed.push(action);
        if (action.kind === "click") {
          elements = [{ role: "heading", name: "設定", box }];
        }
        return Promise.resolve();
      },
      currentUrl: () => Promise.resolve(ENTRY),
      observe: () => Promise.resolve(elements),
      observeVisible: () =>
        Promise.resolve(elements.map((element) => ({ role: element.role, name: element.name }))),
      settle: { attempts: 0, intervalMs: 0 },
    });
    await s.start();
    s.setMode("operate");
    s.setRecording(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await s.handleInput(
      { kind: "pointer", phase: "down", x: 5, y: 5, button: "left", modifiers: NONE },
      () => {
        elements = [{ role: "heading", name: "設定", box }];
      },
    );
    s.setRecording(false);

    // 記録した後の状態のまま再現する。既に満たしているので何もしない。
    performed.length = 0;
    const snapshot = await s.replay();
    expect(performed).toEqual([]);
    expect(snapshot.events.map((event) => event.kind)).toContain("step-skipped");
    expect(snapshot.status).toBe("completed");
  });
});
