import type { StreamMode } from "@screen-contract/api";

/**
 * モードと記録の状態。
 *
 * **正本は server が持つ。** ここは写しから導ける表示条件だけを扱い、状態機械を
 * 持たない (context/architecture.md の「client state は正本を持たない」)。持つと
 * 同じ遷移規則が 2 つになり、片方を直し忘れると「UI は記録中に見えるのに server
 * は記録していない」が型検査を通る。
 *
 * **モード切替は一時停止中だけ有効。** 再生中は viewport への入力を受け付け
 * ない (閲覧のみ)。**記録中であることは常時表示する。** 黙って記録しない
 * (web-editor feature)。
 */

export interface UiState {
  /** 既定は選択モード。操作モードを既定にすると、意図しない操作が対象へ届く。 */
  readonly mode: StreamMode;
  /** 既定は切り。開始と停止は明示操作とする。 */
  readonly recording: boolean;
}

export type UiAction =
  | { readonly kind: "set-mode"; readonly mode: StreamMode }
  | { readonly kind: "start-recording" }
  | { readonly kind: "stop-recording" };

export interface UiContext {
  /** run が一時停止しているか。`ViewerState.paused` を渡す。 */
  readonly paused: boolean;
}

export type UiRejection = "not-paused" | "not-operate-mode" | "already-recording" | "not-recording";

/**
 * 受け付けない操作の理由。undefined なら受け付ける。
 *
 * **判定の正本は server である。** ここは押す前に理由を出し、通らない要求を
 * 投げないための写しにすぎない。
 */
export function rejectUiAction(
  state: UiState,
  action: UiAction,
  context: UiContext,
): UiRejection | undefined {
  switch (action.kind) {
    case "set-mode":
      // 一時停止していないときに操作モードへ入れない。閲覧へ戻すのは常に許す。
      return action.mode === "operate" && !context.paused ? "not-paused" : undefined;
    case "start-recording":
      if (state.recording) {
        return "already-recording";
      }
      if (!context.paused) {
        return "not-paused";
      }
      // 記録は操作モードの中に置く。選択モードのクリックは要素選択の query で
      // あり、対象ページへ届かない。
      return state.mode === "operate" ? undefined : "not-operate-mode";
    case "stop-recording":
      return state.recording ? undefined : "not-recording";
  }
}

/**
 * viewport のクリックを対象ページへ転送してよいか。
 *
 * 選択モードのクリックは**要素選択の座標 query** であり、対象ページへ届けない。
 * 再生中は入力そのものを受け付けない。
 */
export function forwardsToPage(state: UiState, context: UiContext): boolean {
  return context.paused && state.mode === "operate";
}
