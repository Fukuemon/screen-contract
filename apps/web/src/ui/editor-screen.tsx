import { useCallback, useReducer, useState } from "react";
import type { ExecutionEvent } from "@screen-contract/api";
import {
  forwardsToPage,
  INITIAL_UI_STATE,
  reduceUi,
  rejectUiAction,
  syncWithRun,
  type UiAction,
  type UiState,
} from "../state/mode.js";
import { INITIAL_VIEWER_STATE, reduceViewer, type ViewerState } from "../state/viewer.js";

/**
 * エディタ画面。live viewport とモード切替、記録の導線を置く。
 *
 * **web はドメインロジックを持たない。** 判断は `state/` の純粋関数にあり、
 * ここは描画と入力の受け渡しだけを行う。視覚デザインは skeleton の範囲外。
 */

interface Screen {
  readonly viewer: ViewerState;
  readonly ui: UiState;
  readonly rejection: string | undefined;
}

type ScreenAction =
  | { readonly kind: "execution-event"; readonly event: ExecutionEvent }
  | { readonly kind: "ui"; readonly action: UiAction };

function reduceScreen(state: Screen, action: ScreenAction): Screen {
  if (action.kind === "execution-event") {
    const viewer = reduceViewer(state.viewer, action.event);
    // run が動き出したら操作モードと記録を降ろす。
    return { viewer, ui: syncWithRun(state.ui, viewer), rejection: undefined };
  }
  const rejection = rejectUiAction(state.ui, action.action, state.viewer);
  return {
    ...state,
    ui: reduceUi(state.ui, action.action, state.viewer),
    rejection: REJECTION_TEXT[rejection ?? "none"],
  };
}

const REJECTION_TEXT: Readonly<Record<string, string | undefined>> = {
  none: undefined,
  "not-paused": "一時停止中だけ操作モードへ切り替えられます。",
  "not-operate-mode": "記録は操作モードの中で始めます。",
  "already-recording": "すでに記録中です。",
  "not-recording": "記録していません。",
};

export function EditorScreen() {
  const [screen, dispatch] = useReducer(reduceScreen, {
    viewer: INITIAL_VIEWER_STATE,
    ui: INITIAL_UI_STATE,
    rejection: undefined,
  });
  const [frame, setFrame] = useState<string | undefined>(undefined);

  const onViewportClick = useCallback(
    (event: { readonly clientX: number; readonly clientY: number }) => {
      if (!forwardsToPage(screen.ui, screen.viewer)) {
        // 選択モードのクリックは要素選択の座標 query であり、対象ページへ
        // 届けない。再生中は入力そのものを受け付けない。
        return;
      }
      void event;
    },
    [screen.ui, screen.viewer],
  );

  return (
    <main>
      <h1>screen-contract</h1>

      <section aria-label="live viewport">
        {/* 映像は Workflow Server の単一エンドポイントから来る (ADR-0008)。 */}
        <div
          role="presentation"
          data-testid="viewport"
          onClick={onViewportClick}
          style={{ width: 640, height: 400, background: "#eee" }}
        >
          {frame === undefined ? "接続していません" : <img src={frame} alt="" />}
        </div>
      </section>

      <section aria-label="モード">
        <button
          type="button"
          aria-pressed={screen.ui.mode === "operate"}
          disabled={!screen.viewer.paused}
          onClick={() => dispatch({ kind: "ui", action: { kind: "set-mode", mode: "operate" } })}
        >
          操作モード
        </button>
        <button
          type="button"
          aria-pressed={screen.ui.mode === "view"}
          onClick={() => dispatch({ kind: "ui", action: { kind: "set-mode", mode: "view" } })}
        >
          選択モード
        </button>
        {!screen.viewer.paused && <p>再生中は入力を受け付けません (閲覧のみ)。</p>}
      </section>

      <section aria-label="記録">
        {/* **記録中であることを常時表示する。** 黙って記録しない。 */}
        <p aria-live="polite" data-testid="recording-indicator">
          {screen.ui.recording ? "記録中" : "記録していません"}
        </p>
        <button
          type="button"
          disabled={
            rejectUiAction(screen.ui, { kind: "start-recording" }, screen.viewer) !== undefined
          }
          onClick={() => dispatch({ kind: "ui", action: { kind: "start-recording" } })}
        >
          記録を開始
        </button>
        <button
          type="button"
          disabled={!screen.ui.recording}
          onClick={() => dispatch({ kind: "ui", action: { kind: "stop-recording" } })}
        >
          記録を停止
        </button>
      </section>

      {screen.rejection !== undefined && <p role="alert">{screen.rejection}</p>}

      <section aria-label="ステップ">
        <ol>
          {screen.viewer.steps.map((step, index) => (
            <li key={index} data-state={step}>
              {step}
            </li>
          ))}
        </ol>
        {screen.viewer.failureReason !== undefined && (
          <p role="alert">{screen.viewer.failureReason}</p>
        )}
      </section>

      {/* 接続は P6_01 の範囲では組み立てまで。フレームの受信は結線後に入る。 */}
      <button type="button" onClick={() => setFrame(undefined)} hidden>
        再接続
      </button>
    </main>
  );
}
