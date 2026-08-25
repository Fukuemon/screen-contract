import { useCallback, useEffect, useState } from "react";
import { forwardsToPage, rejectUiAction, type UiAction } from "../../../entities/mode.js";
import { originOf } from "../../../entities/target.js";
import { useAuthProfiles } from "../../../gateways/use-auth-profiles.js";
import { useStream } from "../../../gateways/use-stream.js";
import { useViewportRun } from "../../../gateways/use-viewport-run.js";
import { useWorkflowServer } from "../../../gateways/use-workflow-server.js";
import type { ObservedElementView } from "../../../gateways/workflow-server.js";
import type { ConsoleMessage } from "../logs/log-panel.js";

/** run は 1 本しか動かさない。Stream Proxy へ名乗る要求元も固定でよい。 */
const RUN_ID = "current";

/**
 * エディタ画面の状態と通信。
 *
 * 正本は server が持つ。ここは直近の写しと、写しから導ける表示条件だけを持つ
 * (context/architecture.md)。
 */
export function useEditor() {
  const { client, error: clientError } = useWorkflowServer();
  const viewport = useViewportRun(client);
  const stream = useStream(RUN_ID);
  const auth = useAuthProfiles(client);

  const [draftUrl, setDraftUrl] = useState<string | undefined>(undefined);
  const [elements, setElements] = useState<readonly ObservedElementView[]>([]);
  const [messages, setMessages] = useState<readonly ConsoleMessage[]>([]);
  const [overlay, setOverlay] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // **object ごと依存に載せない。** `viewport` は描画のたびに別の object になり、
  // 載せると effect が毎回走って取得が積み上がる。安定な関数だけを取り出す。
  const { clearPick, refresh: refreshSnapshot, run: dispatch } = viewport;

  const snapshot = viewport.snapshot;
  const status = snapshot?.status ?? "idle";
  /**
   * 操作と記録ができる状態か。
   *
   * `paused` の run の枠内でしか使えない (ADR-0002)。終端 (completed / failed)
   * は接続の続きではなく、接続し直せる状態として扱う。
   */
  const connected = status === "paused";
  const mode = snapshot?.mode ?? "view";
  const recording = snapshot?.recording ?? false;
  const url = draftUrl ?? snapshot?.entryUrl ?? "";
  const origin = originOf(url);

  /**
   * 枠に使う要素を取り直す。
   *
   * **フレームごとに取り直さない。** 取得は `--annotate` の CLI 呼び出しで
   * 1 回 70ms ほどかかり、フレームは連続で届く。取得が積み上がって遅れ、
   * 失敗すると一覧が消える。
   */
  const refreshElements = useCallback(() => {
    if (client === undefined) {
      return;
    }
    void client
      .observeElements()
      .then(setElements)
      .catch((cause: Error) => setError(cause.message));
    // 枠と一緒に構成番号も取り直す。番号は画面状態ごとに別である (ADR-0005)。
    refreshSnapshot();
  }, [client, refreshSnapshot]);

  useEffect(() => {
    if (overlay && connected) {
      refreshElements();
    }
  }, [connected, overlay, refreshElements]);

  const clearSteps = useCallback(() => dispatch((api) => api.clearSteps()), [dispatch]);

  const clearLogs = useCallback(() => setMessages([]), []);

  const refreshLogs = useCallback(() => {
    if (client === undefined) {
      return;
    }
    void client
      .consoleMessages()
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [client]);

  const { sendInput } = stream;
  const onUi = useCallback(
    (action: UiAction) => {
      if (rejectUiAction({ mode, recording }, action, { paused: connected }) !== undefined) {
        return;
      }
      switch (action.kind) {
        case "set-mode":
          dispatch((api) => api.setMode(action.mode));
          return;
        case "start-recording":
          dispatch((api) => api.setRecording(true));
          return;
        case "stop-recording":
          dispatch((api) => api.setRecording(false));
      }
    },
    [connected, dispatch, mode, recording],
  );

  /**
   * 対象へ移る。
   *
   * 移った先には、選んでいた要素も前の画面の枠も無い。**どちらも降ろす。**
   * 残すと、居ない要素へ番号を付けられるように見える。
   */
  const navigateTo = useCallback(
    (target: string) => {
      setDraftUrl(target);
      clearPick();
      dispatch((api) => api.navigate(target));
      refreshElements();
    },
    [clearPick, dispatch, refreshElements],
  );

  /** 対象を選ぶ。**繋がっていればその場で移る。** 選んだのに何も起きないと読めない。 */
  const selectTarget = useCallback(
    (target: string) => {
      const next = target.endsWith("/") ? target : `${target}/`;
      if (connected) {
        navigateTo(next);
        return;
      }
      setDraftUrl(next);
    },
    [connected, navigateTo],
  );

  return {
    auth,
    busy: viewport.busy,
    clearLogs,
    clearSteps,
    connected,
    dispatch,
    elements,
    error: error ?? clientError ?? viewport.error ?? stream.error ?? auth.error,
    forwards: forwardsToPage({ mode, recording }, { paused: connected }),
    frame: stream.frame,
    messages,
    mode,
    navigateTo,
    onUi,
    origin,
    origins: viewport.origins,
    overlay,
    recording,
    refreshElements,
    refreshLogs,
    selectTarget,
    sendInput,
    setOverlay,
    setUrl: setDraftUrl,
    snapshot,
    url,
    viewport,
  };
}
