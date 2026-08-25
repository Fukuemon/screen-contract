import type { ExecutionEvent } from "@screen-contract/api";
import { describe, expect, it } from "vitest";
import { INITIAL_VIEWER_STATE, reduceViewer, reduceViewerAll, type StepView } from "./viewer.js";

const RUN: readonly ExecutionEvent[] = [
  { kind: "run-started", irVersion: "v1" },
  { kind: "step-started", index: 0 },
  { kind: "expectation-evaluated", index: 0, phase: "before", results: [] },
  { kind: "step-skipped", index: 0 },
  { kind: "step-started", index: 1 },
  { kind: "expectation-evaluated", index: 1, phase: "before", results: [] },
  { kind: "expectation-evaluated", index: 1, phase: "after", results: [] },
  { kind: "step-executed", index: 1 },
  { kind: "run-completed" },
];

describe("reduceViewer", () => {
  it("入力を書き換えない", () => {
    // 破壊的更新は INITIAL_VIEWER_STATE の共有配列を汚す。「2 回呼んで一致」
    // では同じ参照が返るため通ってしまい、検査にならない。
    const frozen = Object.freeze({
      ...INITIAL_VIEWER_STATE,
      steps: Object.freeze(["pending"]) as readonly StepView[],
    });
    expect(() => reduceViewer(frozen, { kind: "step-executed", index: 0 })).not.toThrow();
    expect(frozen.steps).toEqual(["pending"]);
  });

  it("初期値を汚さない", () => {
    reduceViewerAll(RUN);
    expect(INITIAL_VIEWER_STATE.steps).toEqual([]);
  });

  it("途中まで畳んでから続けても、一括で畳んだ結果と一致する", () => {
    // 畳み込みの途中結果が状態をすべて持つ (履歴に依存しない)。
    const half = RUN.slice(0, 4).reduce(reduceViewer, INITIAL_VIEWER_STATE);
    const continued = RUN.slice(4).reduce(reduceViewer, half);
    expect(continued).toEqual(reduceViewerAll(RUN));
  });

  it("ステップの結果を並びどおりに持つ", () => {
    const expected: readonly StepView[] = ["skipped", "executed"];
    expect(reduceViewerAll(RUN)).toEqual({
      paused: false,
      finished: true,
      steps: expected,
      activeIndex: 1,
      irVersion: "v1",
      failureReason: undefined,
    });
  });

  it("run-started で前の run の表示を持ち越さない", () => {
    const dirty = reduceViewerAll(RUN);
    expect(reduceViewer(dirty, { kind: "run-started", irVersion: "v2" })).toEqual({
      ...INITIAL_VIEWER_STATE,
      irVersion: "v2",
    });
  });

  it("一時停止を表示状態に反映する", () => {
    const paused = reduceViewerAll([...RUN.slice(0, 4), { kind: "paused", atIndex: 0 }]);
    expect(paused).toMatchObject({ paused: true, activeIndex: 0, finished: false });
  });

  it("再開で一時停止を降ろす", () => {
    const resumed = reduceViewerAll([
      ...RUN.slice(0, 4),
      { kind: "paused", atIndex: 0 },
      { kind: "resumed" },
    ]);
    expect(resumed.paused).toBe(false);
  });

  it("IR の差し替えを追随する", () => {
    const changed = reduceViewerAll([
      { kind: "run-started", irVersion: "v1" },
      { kind: "ir-version-changed", from: "v1", to: "v2" },
    ]);
    expect(changed.irVersion).toBe("v2");
  });

  it("失敗の理由を持つ", () => {
    const failed = reduceViewerAll([
      { kind: "run-started", irVersion: "v1" },
      { kind: "step-started", index: 0 },
      { kind: "step-failed", index: 0 },
      { kind: "run-failed", reason: "実行後も期待状態を満たしません" },
    ]);
    expect(failed).toMatchObject({
      finished: true,
      steps: ["failed"],
      failureReason: "実行後も期待状態を満たしません",
    });
  });

  it("飛んだ index が来ても穴を空けない", () => {
    // 穴があると、表示側が undefined を「未実行」と読むか「壊れた」と読むかで分かれる。
    const sparse = reduceViewerAll([
      { kind: "run-started", irVersion: "v1" },
      { kind: "step-executed", index: 2 },
    ]);
    expect(sparse.steps).toEqual(["pending", "pending", "executed"]);
  });

  it("評価のイベントで表示状態を動かさない", () => {
    const before = reduceViewerAll(RUN.slice(0, 2));
    expect(
      reduceViewer(before, {
        kind: "expectation-evaluated",
        index: 0,
        phase: "after",
        results: [],
      }),
    ).toBe(before);
  });
});
