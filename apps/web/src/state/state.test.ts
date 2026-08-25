import type { ApprovalRequest, ExecutionEvent, RecordedStep } from "@screen-contract/api";
import { describe, expect, it } from "vitest";
import {
  expectationWarnings,
  INITIAL_APPROVAL_UI,
  rejectApprove,
  setPending,
  showDiff,
} from "./approval.js";
import { authFrame, httpBase, isAllowedTarget, streamUrl } from "./connection.js";
import {
  forwardsToPage,
  INITIAL_UI_STATE,
  reduceUi,
  rejectUiAction,
  syncWithRun,
  type UiState,
} from "./mode.js";
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
  it("同じイベント列から同じ表示状態になる", () => {
    // 時刻や乱数を混ぜない。混ぜると同じ履歴が違う画面になる。
    expect(reduceViewerAll(RUN)).toEqual(reduceViewerAll(RUN));
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

describe("モード切替", () => {
  const PAUSED = { paused: true };
  const RUNNING = { paused: false };

  it("既定は選択モードで記録は切り", () => {
    // 操作モードを既定にすると、意図しない操作が対象へ届く。
    expect(INITIAL_UI_STATE).toEqual({ mode: "view", recording: false });
  });

  it("再生中は操作モードへ入れない", () => {
    expect(rejectUiAction(INITIAL_UI_STATE, { kind: "set-mode", mode: "operate" }, RUNNING)).toBe(
      "not-paused",
    );
    expect(reduceUi(INITIAL_UI_STATE, { kind: "set-mode", mode: "operate" }, RUNNING)).toEqual(
      INITIAL_UI_STATE,
    );
  });

  it("一時停止中は操作モードへ入れる", () => {
    expect(reduceUi(INITIAL_UI_STATE, { kind: "set-mode", mode: "operate" }, PAUSED)).toEqual({
      mode: "operate",
      recording: false,
    });
  });

  it("選択モードへ戻すのは再生中でも許す", () => {
    const operating: UiState = { mode: "operate", recording: false };
    expect(reduceUi(operating, { kind: "set-mode", mode: "view" }, RUNNING)).toEqual(
      INITIAL_UI_STATE,
    );
  });

  it("選択モードのクリックを対象ページへ転送しない", () => {
    // 選択モードのクリックは要素選択の座標 query である。
    expect(forwardsToPage({ mode: "view", recording: false }, PAUSED)).toBe(false);
  });

  it("再生中は操作モードでも入力が無効", () => {
    expect(forwardsToPage({ mode: "operate", recording: true }, RUNNING)).toBe(false);
  });

  it("一時停止中の操作モードだけ転送する", () => {
    expect(forwardsToPage({ mode: "operate", recording: false }, PAUSED)).toBe(true);
  });

  it("選択モードでは記録を始められない", () => {
    expect(rejectUiAction(INITIAL_UI_STATE, { kind: "start-recording" }, PAUSED)).toBe(
      "not-operate-mode",
    );
  });

  it("記録の開始と停止は明示操作である", () => {
    const operating: UiState = { mode: "operate", recording: false };
    const recording = reduceUi(operating, { kind: "start-recording" }, PAUSED);
    expect(recording.recording).toBe(true);
    expect(reduceUi(recording, { kind: "stop-recording" }, PAUSED).recording).toBe(false);
  });

  it("記録中にもう一度開始しない", () => {
    const recording: UiState = { mode: "operate", recording: true };
    expect(rejectUiAction(recording, { kind: "start-recording" }, PAUSED)).toBe(
      "already-recording",
    );
  });

  it("記録していないのに停止しない", () => {
    expect(rejectUiAction(INITIAL_UI_STATE, { kind: "stop-recording" }, PAUSED)).toBe(
      "not-recording",
    );
  });

  it("選択モードへ戻すと記録も止まる", () => {
    // 入力が届かなくなるのに「記録中」の表示だけ残ると、何が起きているか読めない。
    const recording: UiState = { mode: "operate", recording: true };
    expect(reduceUi(recording, { kind: "set-mode", mode: "view" }, PAUSED)).toEqual(
      INITIAL_UI_STATE,
    );
  });

  it("run が動き出したら操作モードと記録を降ろす", () => {
    const recording: UiState = { mode: "operate", recording: true };
    expect(syncWithRun(recording, RUNNING)).toEqual(INITIAL_UI_STATE);
    expect(syncWithRun(recording, PAUSED)).toBe(recording);
  });
});

describe("承認の導線", () => {
  const REQUEST = { id: "r-1", key: "screens/login", revision: "abc" } as ApprovalRequest;
  const OTHER = { id: "r-2", key: "screens/settings", revision: "def" } as ApprovalRequest;

  function pending(...requests: ApprovalRequest[]) {
    return setPending(INITIAL_APPROVAL_UI, requests);
  }

  it("差分を表示していない依頼を承認させない", () => {
    // 見ずに確定できると、承認が「内容を確かめた」ことの証拠にならない。
    expect(rejectApprove(pending(REQUEST), REQUEST.id)).toBe("not-reviewed");
  });

  it("差分を表示したら承認できる", () => {
    const shown = showDiff(pending(REQUEST), { requestId: REQUEST.id, before: "A", after: "B" });
    expect(rejectApprove(shown, REQUEST.id)).toBeUndefined();
  });

  it("別の依頼の差分を見ても承認できない", () => {
    const shown = showDiff(pending(REQUEST, OTHER), {
      requestId: OTHER.id,
      before: "A",
      after: "B",
    });
    expect(rejectApprove(shown, REQUEST.id)).toBe("not-reviewed");
  });

  it("知らない依頼を承認させない", () => {
    expect(rejectApprove(pending(REQUEST), "r-999")).toBe("unknown-request");
  });

  it("消えた依頼の既読を持ち越さない", () => {
    const shown = showDiff(pending(REQUEST), { requestId: REQUEST.id, before: "A", after: "B" });
    const refreshed = setPending(shown, [OTHER]);
    expect(refreshed.reviewed.has(REQUEST.id)).toBe(false);
  });
});

describe("Expectation を選ばずに承認できることの明示", () => {
  function step(overrides: Partial<RecordedStep> = {}): RecordedStep {
    return { action: { kind: "click", ref: "el-open" }, expect: [], ...overrides } as RecordedStep;
  }

  it("期待状態を持たないステップを警告する", () => {
    // 選ばないと冪等スキップが効かず、再生のたびに実行される。
    const warnings = expectationWarnings([step(), step()]);
    expect(warnings[0]).toContain("2 件");
    expect(warnings[0]).toContain("冪等スキップ");
  });

  it("解決できなかった操作を警告する", () => {
    const warnings = expectationWarnings([
      step({ action: { kind: "clickPoint", x: 1, y: 2 }, warning: "座標を含む要素がありません" }),
    ]);
    expect(warnings.some((w) => w.includes("座標のまま"))).toBe(true);
  });

  it("問題が無ければ警告を出さない", () => {
    expect(expectationWarnings([step({ expect: [{ kind: "url", path: "/settings" }] })])).toEqual(
      [],
    );
  });
});

describe("接続先", () => {
  const TARGET = { address: "127.0.0.1", port: 5173 };

  it("Workflow Server の単一エンドポイントへ繋ぐ", () => {
    expect(httpBase(TARGET)).toBe("http://127.0.0.1:5173");
    expect(streamUrl(TARGET)).toBe("ws://127.0.0.1:5173/stream");
  });

  it.each([
    ["別ホスト", { address: "example.test", port: 5173 }],
    ["localhost 名", { address: "localhost", port: 5173 }],
    ["全アドレス", { address: "0.0.0.0", port: 5173 }],
    ["ポートが 0", { address: "127.0.0.1", port: 0 }],
  ])("%s へ繋がない", (_label, target) => {
    // 実行基盤のポートへは接続しない (ADR-0008)。
    expect(isAllowedTarget(target)).toBe(false);
    expect(() => streamUrl(target)).toThrow();
  });

  it("トークンを URL の query に載せない", () => {
    // URL は履歴・Referer・アクセスログに残る。
    const url = streamUrl(TARGET);
    expect(url).not.toContain("?");
    expect(url).not.toContain("token");
  });

  it("接続後の最初のフレームで認証する", () => {
    expect(authFrame("s3cr3t")).toEqual({ kind: "auth", token: "s3cr3t" });
  });
});
