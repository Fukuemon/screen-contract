import { useCallback, useReducer } from "react";
import type { ExecutionEvent } from "@screen-contract/api";
import {
  forwardsToPage,
  INITIAL_UI_STATE,
  reduceUi,
  rejectUiAction,
  syncWithRun,
  type UiAction,
  type UiRejection,
  type UiState,
} from "../state/mode.js";
import { INITIAL_VIEWER_STATE, reduceViewer, type ViewerState } from "../state/viewer.js";

/**
 * エディタ画面。live viewport とモード切替、記録の導線を置く。
 *
 * **web はドメインロジックを持たない。** 判断は `state/` の純粋関数にあり、
 * ここは描画と入力の受け渡しだけを行う。視覚デザインは skeleton の範囲外。
 */

interface EditorState {
  readonly viewer: ViewerState;
  readonly ui: UiState;
  readonly rejection: UiRejection | undefined;
}

type EditorAction =
  | { readonly kind: "execution-event"; readonly event: ExecutionEvent }
  | { readonly kind: "ui"; readonly action: UiAction };

/** 語彙が増えたら型エラーで気付く。拒否したのに何も出ない状態を作らない。 */
const REJECTION_TEXT: Readonly<Record<UiRejection, string>> = {
  "not-paused": "一時停止中だけ操作モードへ切り替えられます。",
  "not-operate-mode": "記録は操作モードの中で始めます。",
  "already-recording": "すでに記録中です。",
  "not-recording": "記録していません。",
};

function reduceEditor(state: EditorState, action: EditorAction): EditorState {
  if (action.kind === "execution-event") {
    const viewer = reduceViewer(state.viewer, action.event);
    // run が動き出したら操作モードと記録を降ろす。
    return { viewer, ui: syncWithRun(state.ui, viewer), rejection: undefined };
  }
  return {
    ...state,
    ui: reduceUi(state.ui, action.action, state.viewer),
    rejection: rejectUiAction(state.ui, action.action, state.viewer),
  };
}

export interface EditorScreenProps {
  /** live viewport のフレーム。Stream Proxy から届く data URI。 */
  readonly frame?: string | undefined;
  /** viewport のクリックを対象ページへ転送する。 */
  readonly onPageClick: (point: { readonly x: number; readonly y: number }) => void;
}

export function EditorScreen(props: EditorScreenProps) {
  const [editor, dispatch] = useReducer(reduceEditor, {
    viewer: INITIAL_VIEWER_STATE,
    ui: INITIAL_UI_STATE,
    rejection: undefined,
  });

  const { onPageClick } = props;
  const onViewportClick = useCallback(
    (event: { readonly nativeEvent: { readonly offsetX: number; readonly offsetY: number } }) => {
      // 選択モードのクリックは要素選択の座標 query であり、対象ページへ届けない。
      // 再生中は入力そのものを受け付けない。
      if (!forwardsToPage(editor.ui, editor.viewer)) {
        return;
      }
      onPageClick({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY });
    },
    [editor.ui, editor.viewer, onPageClick],
  );

  /** ボタンの可否は必ず `rejectUiAction` で決める。規則を直書きすると片方だけ直す。 */
  const reject = (action: UiAction): UiRejection | undefined =>
    rejectUiAction(editor.ui, action, editor.viewer);

  return (
    <main>
      <h1>screen-contract</h1>

      <section aria-label="live viewport">
        {/* 映像は Workflow Server の単一エンドポイントから来る (ADR-0008)。 */}
        {/* 寸法は座標系を固定するために持つ。転送する座標はこの枠の中の値である。 */}
        <div
          role="presentation"
          data-testid="viewport"
          onClick={onViewportClick}
          style={{ width: 640, height: 400 }}
        >
          {props.frame === undefined ? "接続していません" : <img src={props.frame} alt="" />}
        </div>
      </section>

      <section aria-label="モード">
        <button
          type="button"
          aria-pressed={editor.ui.mode === "operate"}
          disabled={reject({ kind: "set-mode", mode: "operate" }) !== undefined}
          onClick={() => dispatch({ kind: "ui", action: { kind: "set-mode", mode: "operate" } })}
        >
          操作モード
        </button>
        <button
          type="button"
          aria-pressed={editor.ui.mode === "view"}
          disabled={reject({ kind: "set-mode", mode: "view" }) !== undefined}
          onClick={() => dispatch({ kind: "ui", action: { kind: "set-mode", mode: "view" } })}
        >
          選択モード
        </button>
        {!editor.viewer.paused && <p>再生中は入力を受け付けません (閲覧のみ)。</p>}
      </section>

      <section aria-label="記録">
        {/* **記録中であることを常時表示する。** 黙って記録しない。 */}
        <p aria-live="polite" data-testid="recording-indicator">
          {editor.ui.recording ? "記録中" : "記録していません"}
        </p>
        <button
          type="button"
          disabled={reject({ kind: "start-recording" }) !== undefined}
          onClick={() => dispatch({ kind: "ui", action: { kind: "start-recording" } })}
        >
          記録を開始
        </button>
        <button
          type="button"
          disabled={reject({ kind: "stop-recording" }) !== undefined}
          onClick={() => dispatch({ kind: "ui", action: { kind: "stop-recording" } })}
        >
          記録を停止
        </button>
      </section>

      {editor.rejection !== undefined && <p role="alert">{REJECTION_TEXT[editor.rejection]}</p>}

      <section aria-label="ステップ">
        <ol>
          {editor.viewer.steps.map((step, index) => (
            <li key={index} data-state={step}>
              {step}
            </li>
          ))}
        </ol>
        {editor.viewer.failureReason !== undefined && (
          <p role="alert">{editor.viewer.failureReason}</p>
        )}
      </section>
    </main>
  );
}
