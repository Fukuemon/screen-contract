import { describe, expect, it } from "vitest";
import { forwardsToPage, rejectUiAction, type UiState } from "./mode.js";

const PAUSED = { paused: true };
const RUNNING = { paused: false };
const VIEWING: UiState = { mode: "view", recording: false };

describe("受け付けない操作", () => {
  it("再生中は操作モードへ入れない", () => {
    expect(rejectUiAction(VIEWING, { kind: "set-mode", mode: "operate" }, RUNNING)).toBe(
      "not-paused",
    );
  });

  it("一時停止中は操作モードへ入れる", () => {
    expect(rejectUiAction(VIEWING, { kind: "set-mode", mode: "operate" }, PAUSED)).toBeUndefined();
  });

  it("選択モードへ戻すのは再生中でも許す", () => {
    const operating: UiState = { mode: "operate", recording: false };
    expect(rejectUiAction(operating, { kind: "set-mode", mode: "view" }, RUNNING)).toBeUndefined();
  });

  it("選択モードでは記録を始められない", () => {
    // 選択モードのクリックは要素選択の query であり、対象ページへ届かない。
    expect(rejectUiAction(VIEWING, { kind: "start-recording" }, PAUSED)).toBe("not-operate-mode");
  });

  it("接続していなければ記録を始められない", () => {
    const operating: UiState = { mode: "operate", recording: false };
    expect(rejectUiAction(operating, { kind: "start-recording" }, RUNNING)).toBe("not-paused");
  });

  it("記録中にもう一度開始しない", () => {
    const recording: UiState = { mode: "operate", recording: true };
    expect(rejectUiAction(recording, { kind: "start-recording" }, PAUSED)).toBe(
      "already-recording",
    );
  });

  it("記録していないのに停止しない", () => {
    expect(rejectUiAction(VIEWING, { kind: "stop-recording" }, PAUSED)).toBe("not-recording");
  });

  it("記録中なら停止できる", () => {
    const recording: UiState = { mode: "operate", recording: true };
    expect(rejectUiAction(recording, { kind: "stop-recording" }, PAUSED)).toBeUndefined();
  });
});

describe("対象ページへの転送", () => {
  it("選択モードのクリックを転送しない", () => {
    // 選択モードのクリックは要素選択の座標 query である。
    expect(forwardsToPage(VIEWING, PAUSED)).toBe(false);
  });

  it("再生中は操作モードでも転送しない", () => {
    expect(forwardsToPage({ mode: "operate", recording: true }, RUNNING)).toBe(false);
  });

  it("一時停止中の操作モードだけ転送する", () => {
    expect(forwardsToPage({ mode: "operate", recording: false }, PAUSED)).toBe(true);
  });
});
