import type { ExecutionStep } from "@screen-contract/core-workflow";
import { describe, expect, it } from "vitest";
import {
  allSatisfied,
  canSkip,
  evaluate,
  reconstruct,
  rerunStep,
  resumeRun,
  runSteps,
  type EvaluationResult,
  type ExecutionEvent,
  type Observation,
  type RunOutcome,
  type StepRunner,
} from "./index.js";

const AT = { document: "screen", documentId: "settings", stateId: "default", index: 0 } as const;

const openStep: ExecutionStep = {
  action: { kind: "open", url: "http://127.0.0.1:5173/" },
  expect: [{ kind: "url", path: "/" }],
  origin: AT,
};
const clickStep: ExecutionStep = {
  action: { kind: "click", ref: "el-open" },
  expect: [{ kind: "element", ref: "el-modal", visible: true }],
  origin: { ...AT, index: 1 },
};
const bareStep: ExecutionStep = { ...clickStep, expect: [] };

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    url: "/",
    title: "設定画面",
    elements: new Map([["el-modal", false]]),
    counts: new Map(),
    ...overrides,
  };
}

/** el-modal が見えている状態。open も click も期待状態を満たす。 */
const REACHED = observation({ elements: new Map([["el-modal", true]]) });

function unresponsive(): Error & { code: string } {
  const error = new Error("セッションが応答しません") as Error & { code: string };
  error.code = "browser/unresponsive";
  return error;
}

/** Port の相手は fake を使う (context/testing.md)。perform のたびに次の観測へ進む。 */
function fakeRunner(states: readonly Observation[]): StepRunner & {
  readonly performed: ExecutionStep[];
} {
  let cursor = 0;
  const performed: ExecutionStep[] = [];
  return {
    performed,
    observe: () => Promise.resolve(states[Math.min(cursor, states.length - 1)] ?? REACHED),
    perform: (step) => {
      performed.push(step);
      cursor += 1;
      return Promise.resolve();
    },
  };
}

function kinds(events: readonly ExecutionEvent[]): string[] {
  return events.map((event) => event.kind);
}

/**
 * 発行経路を持つイベントを一通り通す run の集合。
 *
 * 語彙の検査と再構成の検査の両方がここを使う。他のテストの実行順に依存させると、
 * 並べ替えで検査が静かに弱くなる。
 */
const SCENARIOS: readonly (readonly [string, () => Promise<RunOutcome>])[] = [
  [
    "完了した run",
    () =>
      runSteps({
        steps: [openStep, clickStep],
        irVersion: "v1",
        runner: fakeRunner([observation(), REACHED]),
      }),
  ],
  [
    "検証で失敗した run",
    () =>
      runSteps({
        steps: [clickStep],
        irVersion: "v1",
        runner: fakeRunner([observation(), observation()]),
      }),
  ],
  [
    "宣言の無いステップだけの run",
    () => runSteps({ steps: [bareStep], irVersion: "v1", runner: fakeRunner([observation()]) }),
  ],
  [
    "一時停止した run",
    () =>
      runSteps({
        steps: [openStep, clickStep],
        irVersion: "v1",
        runner: fakeRunner([REACHED]),
        shouldPause: () => true,
      }),
  ],
  [
    "不応答で止まった run",
    () =>
      runSteps({
        steps: [clickStep],
        irVersion: "v1",
        runner: {
          observe: () => Promise.resolve(observation()),
          perform: () => Promise.reject(unresponsive()),
        },
      }),
  ],
  [
    "版が差し替わって再開した run",
    () =>
      resumeRun({
        steps: [clickStep],
        irVersion: "v1",
        currentIrVersion: "v2",
        runner: fakeRunner([REACHED]),
      }),
  ],
];

describe("evaluate", () => {
  it("同じ観測に対して常に同じ結果を返す", () => {
    expect(evaluate(clickStep.expect, REACHED)).toEqual(evaluate(clickStep.expect, REACHED));
  });

  it("Locator を解決できない要素を「満たさない」と混ぜない", () => {
    // 解決の失敗が期待状態の不一致として記録されると、原因が読めなくなる。
    const result = evaluate(
      [{ kind: "element", ref: "el-unknown", visible: false }],
      observation(),
    );
    expect(result[0]?.outcome).toBe("unevaluatable");
  });

  it("解決できた要素の可視・不可視は満たす / 満たさないで分かれる", () => {
    expect(
      evaluate([{ kind: "element", ref: "el-modal", visible: false }], observation())[0],
    ).toMatchObject({ outcome: "satisfied" });
    expect(
      evaluate([{ kind: "element", ref: "el-modal", visible: true }], observation())[0],
    ).toMatchObject({ outcome: "unsatisfied" });
  });

  it("観測できていない件数も評価不能とする", () => {
    expect(evaluate([{ kind: "count", ref: "el-row", value: 3 }], observation())[0]?.outcome).toBe(
      "unevaluatable",
    );
  });

  it("url と title を突き合わせる", () => {
    expect(allSatisfied(evaluate([{ kind: "url", path: "/" }], observation()))).toBe(true);
    expect(allSatisfied(evaluate([{ kind: "title", value: "別画面" }], observation()))).toBe(false);
  });

  it("allSatisfied は述語として素直に振る舞う (空集合は真)", () => {
    expect(allSatisfied([])).toBe(true);
  });

  it("canSkip は空集合でスキップしない", () => {
    // 空集合は「宣言していない」であり「既に満たしている」ではない。
    expect(canSkip([])).toBe(false);
    const satisfied: EvaluationResult[] = [
      { expectation: { kind: "url", path: "/" }, outcome: "satisfied" },
    ];
    expect(canSkip(satisfied)).toBe(true);
  });
});

describe("runSteps", () => {
  it("満たしていれば action を実行せず skipped にする", async () => {
    const runner = fakeRunner([REACHED]);
    const outcome = await runSteps({ steps: [clickStep], irVersion: "v1", runner });
    expect(runner.performed).toEqual([]);
    expect(outcome.results[0]?.outcome).toBe("skipped");
    expect(outcome.status).toBe("completed");
  });

  it("満たしていなければ実行して検証する", async () => {
    const runner = fakeRunner([observation(), REACHED]);
    const outcome = await runSteps({ steps: [clickStep], irVersion: "v1", runner });
    expect(runner.performed).toHaveLength(1);
    expect(outcome.results[0]?.outcome).toBe("executed");
  });

  it("Expectation を持たないステップは評価を省いて必ず実行する", async () => {
    const runner = fakeRunner([observation()]);
    const outcome = await runSteps({ steps: [bareStep], irVersion: "v1", runner });
    expect(runner.performed).toHaveLength(1);
    expect(outcome.results[0]?.outcome).toBe("executed");
    // 評価していないので、意味のない空の評価イベントを出さない。
    expect(kinds(outcome.events)).not.toContain("expectation-evaluated");
  });

  it("実行後も満たさなければ run を failed にする", async () => {
    const runner = fakeRunner([observation(), observation()]);
    const outcome = await runSteps({ steps: [clickStep], irVersion: "v1", runner });
    expect(outcome.status).toBe("failed");
    expect(outcome.results.at(-1)?.outcome).toBe("failed");
    const failed = outcome.events.find((event) => event.kind === "run-failed");
    expect(failed?.reason).toBe("実行後も期待状態を満たしません");
  });

  it("実行後に評価できないときは理由を分ける", async () => {
    const unknown = observation({ elements: new Map() });
    const outcome = await runSteps({
      steps: [clickStep],
      irVersion: "v1",
      runner: fakeRunner([unknown]),
    });
    const failed = outcome.events.find((event) => event.kind === "run-failed");
    expect(failed?.reason).toBe("実行後の期待状態を評価できません");
  });

  it("後続のステップを実行しない", async () => {
    const runner = fakeRunner([observation(), observation()]);
    const outcome = await runSteps({ steps: [clickStep, openStep], irVersion: "v1", runner });
    expect(kinds(outcome.events).filter((k) => k === "step-started")).toHaveLength(1);
  });
});

describe("pause の予約", () => {
  const three = [openStep, clickStep, bareStep];

  it("予約が立ったステップの完了直後に止まり、後続を実行しない", async () => {
    // 予約は「実行中ステップの完了後に停止する」意味である (ADR-0002)。
    let completed = 0;
    // 1 件目を **実行** させる。skip で終わると skip 経路の判定しか測れない。
    const runner = fakeRunner([observation({ url: "/other" }), REACHED]);
    const outcome = await runSteps({
      steps: three,
      irVersion: "v1",
      runner,
      shouldPause: () => {
        completed += 1;
        return completed === 1;
      },
    });
    expect(outcome.status).toBe("paused");
    expect(outcome.events.find((event) => event.kind === "paused")?.atIndex).toBe(0);
    expect(kinds(outcome.events).filter((k) => k === "step-started")).toHaveLength(1);
  });

  it("最終ステップの完了と予約が重なったら pause を優先する", async () => {
    // 優先順位が無いと、ステップが 1 件だけの run で completed に倒れ、
    // 記録と rerun_step の両方が成立しない。
    const outcome = await runSteps({
      steps: [openStep],
      irVersion: "v1",
      runner: fakeRunner([observation({ url: "/other" }), REACHED]),
      shouldPause: () => true,
    });
    expect(outcome.status).toBe("paused");
    expect(kinds(outcome.events)).not.toContain("run-completed");
  });

  it("予約が無ければ最後まで進んで completed になる", async () => {
    const outcome = await runSteps({
      steps: [openStep],
      irVersion: "v1",
      runner: fakeRunner([REACHED]),
      shouldPause: () => false,
    });
    expect(outcome.status).toBe("completed");
  });

  it("skip したステップの直後でも予約が効く", async () => {
    const outcome = await runSteps({
      steps: [openStep, clickStep],
      irVersion: "v1",
      runner: fakeRunner([REACHED]),
      shouldPause: () => true,
    });
    expect(outcome.status).toBe("paused");
    expect(outcome.events.find((event) => event.kind === "paused")?.atIndex).toBe(0);
  });
});

describe("不応答", () => {
  it("評価前の不応答で再作成せず run-failed にする", async () => {
    // 再作成はページ状態を失う操作であり、失ったまま後続を評価すると前提が崩れる。
    const runner: StepRunner = {
      observe: () => Promise.reject(unresponsive()),
      perform: () => Promise.resolve(),
    };
    const outcome = await runSteps({ steps: [openStep], irVersion: "v1", runner });
    expect(outcome.status).toBe("failed");
    expect(kinds(outcome.events)).not.toContain("session-recreated");
  });

  it("実行中の不応答でも step-failed と StepResult を残す", async () => {
    // 終端イベントを持たない step-started を宙に浮かせない。
    const runner: StepRunner = {
      observe: () => Promise.resolve(observation()),
      perform: () => Promise.reject(unresponsive()),
    };
    const outcome = await runSteps({ steps: [clickStep], irVersion: "v1", runner });
    expect(kinds(outcome.events)).toContain("step-failed");
    expect(outcome.results).toEqual([
      { index: 0, outcome: "failed", evaluated: evaluate(clickStep.expect, observation()) },
    ]);
  });

  it("検証時の不応答でも同じ形で終わる", async () => {
    let calls = 0;
    const runner: StepRunner = {
      observe: () => {
        calls += 1;
        return calls === 1 ? Promise.resolve(observation()) : Promise.reject(unresponsive());
      },
      perform: () => Promise.resolve(),
    };
    const outcome = await runSteps({ steps: [clickStep], irVersion: "v1", runner });
    expect(kinds(outcome.events).at(-2)).toBe("step-failed");
    expect(outcome.results.at(-1)?.outcome).toBe("failed");
  });

  it("不応答でない失敗は握り潰さない", async () => {
    const runner: StepRunner = {
      observe: () => Promise.reject(new Error("想定外")),
      perform: () => Promise.resolve(),
    };
    await expect(runSteps({ steps: [openStep], irVersion: "v1", runner })).rejects.toThrow(
      "想定外",
    );
  });

  it("語彙にないコードを不応答として扱わない", async () => {
    const error = new Error("別の失敗") as Error & { code: string };
    error.code = "browser/whatever";
    const runner: StepRunner = {
      observe: () => Promise.reject(error),
      perform: () => Promise.resolve(),
    };
    await expect(runSteps({ steps: [openStep], irVersion: "v1", runner })).rejects.toThrow(
      "別の失敗",
    );
  });
});

describe("resumeRun", () => {
  it("draft が変わっていれば ir-version-changed を出してから再開する", async () => {
    // 差し替えは前提の再検証より前に行う。古い版の期待状態で判断しない。
    const outcome = await resumeRun({
      steps: [clickStep],
      irVersion: "v1",
      currentIrVersion: "v2",
      runner: fakeRunner([REACHED]),
    });
    expect(kinds(outcome.events).slice(0, 2)).toEqual(["ir-version-changed", "resumed"]);
    const changed = outcome.events.find((event) => event.kind === "ir-version-changed");
    expect(changed).toMatchObject({ from: "v1", to: "v2" });
  });

  it("draft が変わっていなければ ir-version-changed を出さない", async () => {
    const outcome = await resumeRun({
      steps: [clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      runner: fakeRunner([REACHED]),
    });
    expect(kinds(outcome.events)).not.toContain("ir-version-changed");
    expect(kinds(outcome.events)[0]).toBe("resumed");
  });

  it("予約は持ち越されず、再開後の完了では completed へ進む", async () => {
    // pause 予約は 1 回で消費される (ADR-0002)。resume には予約を渡さない。
    const outcome = await resumeRun({
      steps: [clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      runner: fakeRunner([REACHED]),
    });
    expect(outcome.status).toBe("completed");
  });

  it("run-started を再開で出さない", async () => {
    // 1 つの run に 2 度現れると、イベント列から別の run に見える。
    const outcome = await resumeRun({
      steps: [clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      runner: fakeRunner([REACHED]),
    });
    expect(kinds(outcome.events)).not.toContain("run-started");
  });

  it("到達済みの状態から再開すると全て skipped で終わる", async () => {
    const outcome = await resumeRun({
      steps: [openStep, clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      runner: fakeRunner([REACHED]),
    });
    expect(outcome.results.map((result) => result.outcome)).toEqual(["skipped", "skipped"]);
  });
});

describe("rerunStep", () => {
  const previous = [
    { index: 0, outcome: "executed" as const, evaluated: [] },
    { index: 1, outcome: "failed" as const, evaluated: [] },
  ];

  it("指定ステップ以降の結果を捨てて手前だけを残す", async () => {
    // 残すと、再実行で結果が変わったステップに古い結果が残り履歴が食い違う。
    const outcome = await rerunStep({
      steps: [openStep, clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      fromIndex: 1,
      previousResults: previous,
      runner: fakeRunner([REACHED]),
    });
    expect(outcome.results.map((result) => [result.index, result.outcome])).toEqual([
      [0, "executed"],
      [1, "skipped"],
    ]);
    // 手前の結果は作り直さない。
    expect(outcome.results[0]).toBe(previous[0]);
  });

  it("指定ステップより手前を再生しない", async () => {
    const outcome = await rerunStep({
      steps: [openStep, clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      fromIndex: 1,
      previousResults: previous,
      runner: fakeRunner([REACHED]),
    });
    const started = outcome.events.filter((event) => event.kind === "step-started");
    expect(started.map((event) => event.index)).toEqual([1]);
  });

  it("先頭から掛け直すと過去の結果を全て捨てる", async () => {
    const outcome = await rerunStep({
      steps: [openStep, clickStep],
      irVersion: "v1",
      currentIrVersion: "v1",
      fromIndex: 0,
      previousResults: previous,
      runner: fakeRunner([REACHED]),
    });
    expect(outcome.results.map((result) => result.outcome)).toEqual(["skipped", "skipped"]);
  });

  it("draft が変わっていれば差し替えてから再実行する", async () => {
    const outcome = await rerunStep({
      steps: [openStep, clickStep],
      irVersion: "v1",
      currentIrVersion: "v2",
      fromIndex: 1,
      previousResults: previous,
      runner: fakeRunner([REACHED]),
    });
    expect(kinds(outcome.events).slice(0, 2)).toEqual(["ir-version-changed", "resumed"]);
  });
});

describe("実行イベント", () => {
  it("発行順序が決定的である", async () => {
    const outcome = await runSteps({
      steps: [openStep, clickStep],
      irVersion: "v1",
      runner: fakeRunner([observation(), REACHED]),
    });
    expect(kinds(outcome.events)).toEqual([
      "run-started",
      "step-started",
      "expectation-evaluated",
      "step-skipped",
      "step-started",
      "expectation-evaluated",
      "expectation-evaluated",
      "step-executed",
      "run-completed",
    ]);
  });

  it("同じ index の 2 度の評価を局面で見分けられる", async () => {
    const outcome = await runSteps({
      steps: [clickStep],
      irVersion: "v1",
      runner: fakeRunner([observation(), REACHED]),
    });
    const evaluated = outcome.events.filter((event) => event.kind === "expectation-evaluated");
    expect(evaluated.map((event) => event.phase)).toEqual(["before", "after"]);
  });

  it.each(SCENARIOS)("イベント列だけから %s を再構成できる", async (_label, run) => {
    const outcome = await run();
    expect(reconstruct(outcome.events)).toEqual({
      status: outcome.status,
      results: outcome.results,
    });
  });

  it("秘密情報が入りうる action と入力値をイベントへ載せない", async () => {
    // 実行履歴は永続化されるため、一度入ると後から取り除けない。
    const secret: ExecutionStep = {
      action: { kind: "open", url: "https://example.test/?token=s3cr3t" },
      expect: [],
      origin: AT,
    };
    const outcome = await runSteps({
      steps: [secret],
      irVersion: "v1",
      runner: fakeRunner([observation()]),
    });
    expect(JSON.stringify(outcome.events)).not.toContain("s3cr3t");
  });

  it("発行するのは skeleton の 11 件に限る", async () => {
    // 上限と下限の両方を見る。部分集合判定だと、12 件目を足しても
    // 「このテストが流す経路に出ない」だけで緑のままになる。
    const emitted = new Set<string>();
    for (const [, run] of SCENARIOS) {
      for (const kind of kinds((await run()).events)) {
        emitted.add(kind);
      }
    }
    expect(emitted).toEqual(
      new Set([
        "run-started",
        "step-started",
        "expectation-evaluated",
        "step-skipped",
        "step-executed",
        "step-failed",
        "paused",
        "ir-version-changed",
        "resumed",
        "run-completed",
        "run-failed",
      ]),
    );
  });
});

/** 語彙の網羅を型で押さえる。union が増減すると型エラーになる。 */
const VOCABULARY: Record<ExecutionEvent["kind"], true> = {
  "run-started": true,
  "step-started": true,
  "expectation-evaluated": true,
  "step-skipped": true,
  "step-executed": true,
  "step-failed": true,
  paused: true,
  "ir-version-changed": true,
  resumed: true,
  "run-completed": true,
  "run-failed": true,
  // 語彙としては持つが、skeleton では発行経路を持たない。
  "session-recreated": true,
};

describe("イベントの語彙", () => {
  it("語彙は 12 件で、発行されないのは session-recreated だけである", async () => {
    expect(Object.keys(VOCABULARY)).toHaveLength(12);
    const emitted = new Set<string>();
    for (const [, run] of SCENARIOS) {
      for (const kind of kinds((await run()).events)) {
        emitted.add(kind);
      }
    }
    expect(Object.keys(VOCABULARY).filter((kind) => !emitted.has(kind))).toEqual([
      "session-recreated",
    ]);
  });
});
