import type { Observation, StepRunner } from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";
import { describe, expect, it } from "vitest";
import type { ElementId } from "@screen-contract/domain";
import { createRunSession } from "./run-session.js";

const ENTRY = "http://127.0.0.1:5174/";

function observation(url: string): Observation {
  return { url, title: "", elements: new Map(), counts: new Map() };
}

/** Port の相手は fake を使う (context/testing.md)。 */
function fakeRunner(initialUrl = "/other"): StepRunner & { readonly performed: ExecutionStep[] } {
  const performed: ExecutionStep[] = [];
  let url = initialUrl;
  return {
    performed,
    observe: () => Promise.resolve(observation(url)),
    perform: (step) => {
      performed.push(step);
      url = "/";
      return Promise.resolve();
    },
  };
}

function session(runner: StepRunner | undefined) {
  return createRunSession({ entryUrl: ENTRY, runner: () => runner });
}

describe("run の入口", () => {
  it("接続で 1 ステップ実行して paused に入る", async () => {
    // 操作モードと記録は paused の run の枠内でしか使えない (ADR-0002 / ADR-0026)。
    const runner = fakeRunner();
    const snapshot = await session(runner).start();
    expect(snapshot.status).toBe("paused");
    expect(runner.performed.map((step) => step.action)).toEqual([{ kind: "open", url: ENTRY }]);
  });

  it("既に到達していれば冪等スキップで開き直さない", async () => {
    const runner = fakeRunner("/");
    const snapshot = await session(runner).start();
    expect(runner.performed).toEqual([]);
    expect(snapshot.status).toBe("paused");
  });

  it("実行の相手がいなければ黙って idle に留めない", async () => {
    await expect(session(undefined).start()).rejects.toThrow("セッションがありません");
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
    expect(after.badges).toEqual(["el-button-保存", "el-link-戻る"]);
    expect(s.moveBadge("el-link-戻る" as ElementId, 0).badges).toEqual([
      "el-link-戻る",
      "el-button-保存",
    ]);
  });

  it("同じ要素へ二重に番号を付けない", () => {
    const s = session(fakeRunner());
    s.addBadge(button);
    expect(s.addBadge(button).badges).toEqual(["el-button-保存"]);
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
    expect(s.snapshot().badges).toEqual(["el-link-戻る"]);
    s.enterState(ENTRY);
    expect(s.snapshot().badges).toEqual(["el-button-保存"]);
  });

  it("query と fragment の違いで画面を分けない", () => {
    // 分けると同じ画面が別の状態として増え、番号を振り直す先が分からなくなる。
    const s = session(fakeRunner());
    s.addBadge(button);
    s.enterState("http://127.0.0.1:5174/?tab=1#top");
    expect(s.snapshot().badges).toEqual(["el-button-保存"]);
  });

  it("要素の定義は画面をまたいで残す", () => {
    // 定義は要素の同一性であって番号ではない。消すと枠の表示名が引けなくなる。
    const s = session(fakeRunner());
    s.addBadge(button);
    s.enterState("http://127.0.0.1:5174/settings");
    expect(s.snapshot().newElements.map((element) => element.id)).toEqual(["el-button-保存"]);
  });

  it("いま採番している画面を写しに載せる", () => {
    const s = session(fakeRunner());
    s.enterState("http://127.0.0.1:5174/settings?a=1");
    expect(s.snapshot().stateUrl).toBe("http://127.0.0.1:5174/settings");
  });
});

describe("入力の記録と転送", () => {
  const press = (x: number, y: number): string =>
    JSON.stringify({ type: "input_mouse", eventType: "mousePressed", x, y });
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
      runner: () => fakeRunner(),
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
    expect(s.snapshot().steps[0]?.expect).toEqual([
      { kind: "element", ref: "el-heading-設定", visible: true },
    ]);
  });

  it("転送で消えた要素も期待状態に入る", async () => {
    const page = fakePage([{ role: "heading", name: "設定" }]);
    const s = await record(page);
    expect(s.snapshot().steps[0]?.expect).toContainEqual({
      kind: "element",
      ref: "el-button-開く",
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
    for (const eventType of ["mouseMoved", "mouseReleased", "mouseWheel"]) {
      await s.handleInput(
        JSON.stringify({ type: "input_mouse", eventType, x: 5, y: 5 }),
        () => (page.forwards += 1),
      );
    }
    expect(page.forwards).toBe(3);
    expect(s.snapshot().steps).toEqual([]);
  });

  it("解釈できない payload も転送する", async () => {
    const page = fakePage([]);
    const s = recording(page);
    await s.start();
    await s.handleInput("{", () => (page.forwards += 1));
    expect(page.forwards).toBe(1);
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
    expect(s.snapshot().newElements.map((element) => element.id)).toEqual(["el-button-開く"]);
  });

  it("反映を待つ", async () => {
    // 転送の直後はまだ何も変わっていないことがある。1 回見て諦めると、期待状態が
    // 空になる。
    const page = fakePage([]);
    let ticks = 0;
    let elements = [{ role: "button", name: "開く", box: box(0, 0) }];
    const s = createRunSession({
      entryUrl: ENTRY,
      runner: () => fakeRunner(),
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
      ref: "el-heading-設定",
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
