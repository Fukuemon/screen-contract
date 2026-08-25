import { describe, expect, it } from "vitest";
import { createStreamProxy, discardReason, type RunState, type StreamSink } from "./index.js";

function state(overrides: Partial<RunState> = {}): RunState {
  return { runId: "run-1", paused: true, mode: "operate", ...overrides };
}

function sink(): StreamSink & { readonly sent: string[] } {
  const sent: string[] = [];
  return { sent, send: (payload) => void sent.push(payload) };
}

/** `current` を必須にする。既定値にすると、undefined を明示しても既定が効く。 */
function proxy(current: RunState | undefined) {
  const upstream = sink();
  const downstream = sink();
  return {
    upstream,
    downstream,
    proxy: createStreamProxy({ upstream, downstream, runState: { current: () => current } }),
  };
}

const MINE = { requesterRunId: "run-1" };

describe("中継条件", () => {
  it("条件を満たす入力を転送する", () => {
    const { upstream, proxy: p } = proxy(state());
    expect(p.forwardInput(MINE, "input_mouse")).toBeUndefined();
    expect(upstream.sent).toEqual(["input_mouse"]);
  });

  it.each([
    ["再生中", state({ paused: false }), MINE, "not-paused"],
    ["閲覧モード", state({ mode: "view" }), MINE, "not-operate-mode"],
    ["他人の run", state(), { requesterRunId: "run-2" }, "foreign-run"],
    ["run が無い", undefined, MINE, "no-run"],
  ])("%s の入力を破棄する", (_label, current, claim, reason) => {
    const { upstream, proxy: p } = proxy(current);
    expect(p.forwardInput(claim, "input_mouse")).toEqual({
      kind: "input-discarded",
      reason,
      requesterRunId: claim.requesterRunId,
    });
    expect(upstream.sent).toEqual([]);
  });

  it("client の自称で中継条件を満たせない", () => {
    // ADR-0008 が塞いだ迂回そのもの。paused / mode / runId は server 側から
    // 引き、client が渡せるのは要求元の run だけである。
    const { upstream, proxy: p } = proxy(state({ paused: false, mode: "view" }));
    p.forwardInput({ requesterRunId: "run-1" }, "input_mouse");
    expect(upstream.sent).toEqual([]);
    // 型の上でも paused / mode を渡す口が無い。
    expect(Object.keys(MINE)).toEqual(["requesterRunId"]);
  });

  it("他人の run の判定を paused より先に行う", () => {
    // 他人の run への入力は、その run が paused かどうか以前に中継しない。
    expect(discardReason(state({ paused: false }), { requesterRunId: "run-2" })).toBe(
      "foreign-run",
    );
  });

  it("破棄を記録として残す", () => {
    // 黙って捨てると UI の不具合と迂回の試みを区別できない。
    const { proxy: p } = proxy(state({ paused: false }));
    p.forwardInput(MINE, "a");
    p.forwardInput(MINE, "b");
    expect(p.discarded().map((e) => e.reason)).toEqual(["not-paused", "not-paused"]);
    expect(p.discardedCount()).toBe(2);
  });

  it("破棄の記録が無制限に伸びない", () => {
    // 迂回を試みる側が意図的に大量発生させられる。
    const { proxy: p } = proxy(state({ paused: false }));
    for (let i = 0; i < 500; i += 1) {
      p.forwardInput(MINE, "x");
    }
    expect(p.discarded().length).toBeLessThanOrEqual(128);
    expect(p.discardedCount()).toBe(500);
  });

  it("破棄の記録が実行イベントの語彙を持たない", () => {
    // 実行イベント列へ混ぜない。破棄は Stream Proxy で起き、foreign-run では
    // 結びつける run が定まらない (ADR-0008)。
    const { proxy: p } = proxy(state({ paused: false }));
    p.forwardInput(MINE, "a");
    const executionEventKinds = new Set([
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
      "session-recreated",
    ]);
    for (const event of p.discarded()) {
      expect(executionEventKinds.has(event.kind)).toBe(false);
    }
  });
});

describe("映像の配信", () => {
  it("フレームを Web UI へ流す", () => {
    const { downstream, proxy: p } = proxy(state());
    p.publishFrame("frame-1");
    expect(downstream.sent).toEqual(["frame-1"]);
  });

  it("フレームの配信に中継条件を掛けない", () => {
    // 検査が要るのは逆方向 (入力転送) だけである。
    const { downstream, upstream, proxy: p } = proxy(state({ paused: false }));
    p.publishFrame("frame-1");
    expect(downstream.sent).toHaveLength(1);
    expect(upstream.sent).toEqual([]);
  });
});
