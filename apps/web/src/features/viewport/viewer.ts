import type { ExecutionEvent } from "@screen-contract/api";

/**
 * 実行イベントから表示状態を組み立てる。
 *
 * **client state は正本を持たない。** 表示に使うデータはすべて api から
 * 再取得できる。ここが持つのは、同じイベント列から必ず同じ形になる導出値だけ
 * である (context/architecture.md)。
 */

export type StepView = "pending" | "running" | "skipped" | "executed" | "failed";

export interface ViewerState {
  /** run が一時停止しているか。モード切替の可否がこれで決まる。 */
  readonly paused: boolean;
  readonly finished: boolean;
  readonly steps: readonly StepView[];
  /** 実行中または直近に触れたステップ。 */
  readonly activeIndex: number | undefined;
  /** IR の版。差し替わったら表示も追随する。 */
  readonly irVersion: string | undefined;
  readonly failureReason: string | undefined;
}

export const INITIAL_VIEWER_STATE: ViewerState = {
  paused: false,
  finished: false,
  steps: [],
  activeIndex: undefined,
  irVersion: undefined,
  failureReason: undefined,
};

function withStep(steps: readonly StepView[], index: number, view: StepView): StepView[] {
  const next = [...steps];
  // 飛んだ index が来ても穴を空けない。穴があると、表示側が undefined を
  // 「未実行」と読むか「壊れた」と読むかで分かれる。
  while (next.length <= index) {
    next.push("pending");
  }
  next[index] = view;
  return next;
}

/**
 * 1 件のイベントを畳み込む。
 *
 * **同じイベント列からは必ず同じ表示状態になる。** 時刻や乱数を混ぜない。
 */
export function reduceViewer(state: ViewerState, event: ExecutionEvent): ViewerState {
  switch (event.kind) {
    case "run-started":
      return { ...INITIAL_VIEWER_STATE, irVersion: event.irVersion };
    case "step-started":
      return {
        ...state,
        activeIndex: event.index,
        steps: withStep(state.steps, event.index, "running"),
      };
    case "step-skipped":
      return { ...state, steps: withStep(state.steps, event.index, "skipped") };
    case "step-executed":
      return { ...state, steps: withStep(state.steps, event.index, "executed") };
    case "step-failed":
      return { ...state, steps: withStep(state.steps, event.index, "failed") };
    case "paused":
      return { ...state, paused: true, activeIndex: event.atIndex };
    case "resumed":
      return { ...state, paused: false };
    case "ir-version-changed":
      return { ...state, irVersion: event.to };
    case "run-completed":
      return { ...state, finished: true, paused: false };
    case "run-failed":
      return { ...state, finished: true, paused: false, failureReason: event.reason };
    // 評価の中身は step の結果に現れる。表示状態を動かさない。
    case "expectation-evaluated":
    case "session-recreated":
      return state;
    default:
      // 語彙が増えたら型エラーで気付く。黙って握り潰さない。
      return assertNever(event);
  }
}

function assertNever(event: never): never {
  throw new Error(`未知の実行イベントです: ${JSON.stringify(event)}`);
}

export function reduceViewerAll(events: readonly ExecutionEvent[]): ViewerState {
  return events.reduce(reduceViewer, INITIAL_VIEWER_STATE);
}
