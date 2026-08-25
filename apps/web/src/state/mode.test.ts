import { describe, expect, it } from "vitest";
import {
  forwardsToPage,
  INITIAL_UI_STATE,
  reduceUi,
  rejectUiAction,
  syncWithRun,
  type UiState,
} from "./mode.js";

const PAUSED = { paused: true };
const RUNNING = { paused: false };

describe("モード切替", () => {
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
