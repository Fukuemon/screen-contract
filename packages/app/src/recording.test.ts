import type { ElementDef, ObservedElement, SemanticLocator } from "@screen-contract/core-element";
import type { ExecutionStep } from "@screen-contract/core-workflow";
import type { ElementId } from "@screen-contract/domain";
import { describe, expect, it } from "vitest";
import {
  expectationCandidates,
  recordClick,
  startRecording,
  stopRecording,
  type ClickInput,
  type RecordedAction,
  type RecordedObservation,
} from "./index.js";

function observed(role: string, name: string, x: number, y: number): ObservedElement {
  return { role, name, box: { x, y, width: 100, height: 40 } };
}

const OPEN = observed("button", "設定を開く", 10, 10);
const SUBMIT = observed("button", "送信", 10, 100);
const ELEMENTS = [OPEN, SUBMIT];

function nextId(locator: SemanticLocator): ElementId {
  return `el-${locator.name}` as ElementId;
}

const KNOWN: ElementDef[] = [
  {
    id: "el-open" as ElementId,
    name: "設定を開く",
    type: "button",
    locator: { role: "button", name: "設定を開く" },
  },
];

function click(x: number, y: number, known: ElementDef[] = []) {
  return recordClick({ elements: ELEMENTS, known, x, y, nextId });
}

describe("recordClick", () => {
  it("解決した step は座標ではなく ref を指す", () => {
    const result = click(20, 20);
    expect(result.action).toEqual({ kind: "click", ref: "el-設定を開く" });
    expect(JSON.stringify(result.action)).not.toContain("20");
  });

  it("要素定義が同時に draft へ入る", () => {
    expect(click(20, 20).newElement).toEqual({
      id: "el-設定を開く",
      name: "設定を開く",
      type: "button",
      locator: { role: "button", name: "設定を開く" },
    });
  });

  it("既存定義に一致する場合は重複定義を作らない", () => {
    const result = click(20, 20, KNOWN);
    expect(result.action).toEqual({ kind: "click", ref: "el-open" });
    expect(result.newElement).toBeUndefined();
  });

  it("解決できない操作は clickPoint として残り警告が付く", () => {
    // 記録を止めない。止めると 1 手のために記録全体を捨てることになる。
    const result = click(500, 500);
    expect(result.action).toEqual({ kind: "clickPoint", x: 500, y: 500 });
    expect(result.warning).toBe("座標を含む要素がありません");
  });

  it("一意に解決できない Locator を提案しない", () => {
    // 提案すると、実行時に別の要素へ当たる DSL ができる。
    const duplicated = [observed("button", "送信", 0, 0), observed("button", "送信", 0, 200)];
    const result = recordClick({ elements: duplicated, known: [], x: 10, y: 10, nextId });
    expect(result.action.kind).toBe("clickPoint");
    expect(result.warning).toContain("一意に解決できません");
  });
});

describe("expectationCandidates", () => {
  function observation(overrides: Partial<RecordedObservation> = {}): RecordedObservation {
    return { url: "/", title: "設定画面", visibleRefs: [], ...overrides };
  }

  it("変化した項目だけを候補にする", () => {
    // 機械的に条件を起こすと壊れやすいステップが量産される (ADR-0026)。
    const before = observation({ visibleRefs: ["el-open" as ElementId] });
    const after = observation({
      url: "/settings",
      visibleRefs: ["el-open", "el-modal"] as ElementId[],
    });
    expect(expectationCandidates(before, after)).toEqual([
      { kind: "url", path: "/settings" },
      { kind: "element", ref: "el-modal", visible: true },
    ]);
  });

  it("変化が無ければ候補を出さない", () => {
    const same = observation({ visibleRefs: ["el-open" as ElementId] });
    expect(expectationCandidates(same, same)).toEqual([]);
  });

  it("消えた要素は visible: false の候補になる", () => {
    const before = observation({ visibleRefs: ["el-toast" as ElementId] });
    expect(expectationCandidates(before, observation())).toEqual([
      { kind: "element", ref: "el-toast", visible: false },
    ]);
  });

  it("title の変化も候補にする", () => {
    expect(expectationCandidates(observation(), observation({ title: "別画面" }))).toEqual([
      { kind: "title", value: "別画面" },
    ]);
  });

  it("変化していない url を候補に混ぜない", () => {
    const after = observation({ visibleRefs: ["el-modal" as ElementId] });
    expect(expectationCandidates(observation(), after).some((c) => c.kind === "url")).toBe(false);
  });

  it("重複した ref から同じ候補を 2 度出さない", () => {
    const after = observation({ visibleRefs: ["el-modal", "el-modal"] as ElementId[] });
    expect(expectationCandidates(observation(), after)).toEqual([
      { kind: "element", ref: "el-modal", visible: true },
    ]);
  });
});

describe("startRecording", () => {
  const BEFORE: RecordedObservation = { url: "/", title: "設定画面", visibleRefs: [] };
  const AFTER: RecordedObservation = {
    url: "/",
    title: "設定画面",
    visibleRefs: ["el-modal" as ElementId],
  };

  /** 転送のたびに観測が before → after へ進む fake。 */
  function harness() {
    const forwarded: RecordedAction[] = [];
    /** 観測した時点のスナップショット列。転送の前後関係を検査する。 */
    const observedAt: ("before" | "after")[] = [];
    let moved = false;
    return {
      forwarded,
      observedAt,
      forward: (action: RecordedAction) => {
        forwarded.push(action);
        moved = true;
        return Promise.resolve();
      },
      observe: () => {
        observedAt.push(moved ? "after" : "before");
        return Promise.resolve(moved ? AFTER : BEFORE);
      },
      input: (x: number, y: number): ClickInput => ({ elements: ELEMENTS, x, y, nextId }),
    };
  }

  it("遷移元を run の到達状態から持つ", () => {
    expect(startRecording("modal-open").finish().fromState).toBe("modal-open");
  });

  it("解決してから転送する", async () => {
    // 操作後の状態で解決すると、ページが自律的に変化していたときに間違った
    // 要素へ解決する。前者は clickPoint で気付けるが、後者は静かに壊れる。
    const h = harness();
    const session = startRecording("default");
    await session.click(h.input(20, 20), h.forward, h.observe);
    expect(h.observedAt).toEqual(["before", "after"]);
    expect(h.forwarded).toEqual([{ kind: "click", ref: "el-設定を開く" }]);
  });

  it("記録した step に候補の Expectation が入る", async () => {
    const h = harness();
    const session = startRecording("default");
    await session.click(h.input(20, 20), h.forward, h.observe);
    expect(session.finish().steps).toEqual([
      {
        action: { kind: "click", ref: "el-設定を開く" },
        expect: [{ kind: "element", ref: "el-modal", visible: true }],
        warning: undefined,
      },
    ]);
  });

  it("選ばれた候補だけを step へ入れられる", async () => {
    const h = harness();
    const session = startRecording("default");
    await session.click(h.input(20, 20), h.forward, h.observe, (candidates) =>
      candidates.filter((c) => c.kind === "title"),
    );
    expect(session.finish().steps[0]?.expect).toEqual([]);
  });

  it("既知の要素定義があれば新しく起こさない", async () => {
    const h = harness();
    const session = startRecording("default", KNOWN);
    await session.click(h.input(20, 20), h.forward, h.observe);
    expect(session.finish().newElements).toEqual([]);
    expect(h.forwarded).toEqual([{ kind: "click", ref: "el-open" }]);
  });

  it("同じ新しい要素を 2 回押しても定義を重複させない", async () => {
    // 記録中に起こした定義も既知として扱う。
    const h = harness();
    const session = startRecording("default");
    await session.click(h.input(20, 20), h.forward, h.observe);
    await session.click(h.input(20, 20), h.forward, h.observe);
    expect(session.finish().newElements.map((e) => e.id)).toEqual(["el-設定を開く"]);
  });

  it("別の新しい要素はそれぞれ draft へ入る", async () => {
    const h = harness();
    const session = startRecording("default");
    await session.click(h.input(20, 20), h.forward, h.observe);
    await session.click(h.input(20, 110), h.forward, h.observe);
    expect(session.finish().newElements.map((e) => e.id)).toEqual(["el-設定を開く", "el-送信"]);
  });

  it("解決できない操作を記録しても止まらない", async () => {
    const h = harness();
    const session = startRecording("default");
    await session.click(h.input(500, 500), h.forward, h.observe);
    await session.click(h.input(20, 20), h.forward, h.observe);
    const draft = session.finish();
    expect(draft.steps.map((s) => s.action.kind)).toEqual(["clickPoint", "click"]);
    expect(draft.steps[0]?.warning).toBeDefined();
    // 解決できなくても転送はする。記録の途中で止めない。
    expect(h.forwarded).toHaveLength(2);
  });

  it("finish のたびに独立した配列を返す", async () => {
    const h = harness();
    const session = startRecording("default");
    const first = session.finish();
    await session.click(h.input(20, 20), h.forward, h.observe);
    expect(first.steps).toEqual([]);
  });
});

describe("stopRecording", () => {
  const STEP: ExecutionStep = {
    action: { kind: "click", ref: "el-open" },
    expect: [{ kind: "element", ref: "el-modal", visible: true }],
    origin: { document: "screen", documentId: "settings", stateId: "default", index: 0 },
  };

  const RUNNER = {
    observe: () =>
      Promise.resolve({
        url: "/",
        title: "設定画面",
        elements: new Map([["el-modal", true]]),
        counts: new Map<string, number>(),
      }),
    perform: () => Promise.resolve(),
  };

  it("記録に使った run を resume して run-completed で終える", async () => {
    // 記録は draft を書く操作なので、pause 中に draft が変わる。したがって
    // 再開時に IR の版が差し替わる (ADR-0018)。
    const outcome = await stopRecording({
      session: startRecording("default"),
      irVersion: "v1",
      currentIrVersion: "v2",
      steps: [STEP],
      runner: RUNNER,
    });
    expect(outcome.run.events.map((event) => event.kind)).toEqual([
      "ir-version-changed",
      "resumed",
      "step-started",
      "expectation-evaluated",
      "step-skipped",
      "run-completed",
    ]);
    expect(outcome.run.status).toBe("completed");
  });

  it("draft を返す", async () => {
    const outcome = await stopRecording({
      session: startRecording("modal-open"),
      irVersion: "v1",
      currentIrVersion: "v1",
      steps: [STEP],
      runner: RUNNER,
    });
    expect(outcome.draft.fromState).toBe("modal-open");
  });

  it("draft が変わっていなければ ir-version-changed を出さない", async () => {
    const outcome = await stopRecording({
      session: startRecording("default"),
      irVersion: "v1",
      currentIrVersion: "v1",
      steps: [STEP],
      runner: RUNNER,
    });
    expect(outcome.run.events.map((event) => event.kind)).not.toContain("ir-version-changed");
  });
});
