import type { Observation, StepRunner } from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";
import { describe, expect, it } from "vitest";
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

  it("列挙した origin を開く", async () => {
    const runner = fakeRunner();
    await session(runner).start();
    expect(runner.performed[0]?.action).toEqual({ kind: "open", url: ENTRY });
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
    expect(s.moveBadge("el-link-戻る", 0).badges).toEqual(["el-link-戻る", "el-button-保存"]);
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
