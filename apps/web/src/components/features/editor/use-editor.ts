import { useCallback, useEffect, useRef, useState } from "react";
import type { PageInput } from "@screen-contract/api";
import { forwardsToPage, rejectUiAction, type UiAction } from "../../../entities/mode.js";
import { originOf, resolveTarget } from "../../../entities/target.js";
import { useAuthProfiles } from "../../../gateways/use-auth-profiles.js";
import { useStream } from "../../../gateways/use-stream.js";
import { useViewportRun } from "../../../gateways/use-viewport-run.js";
import { useWorkflowServer } from "../../../gateways/use-workflow-server.js";
import type { ObservedElementView } from "../../../gateways/workflow-server.js";
import type { ConsoleMessage } from "../logs/log-panel.js";

/** run は 1 本しか動かさない。Stream Proxy へ名乗る要求元も固定でよい。 */
const RUN_ID = "current";

/**
 * 入力が止まってから枠を取り直すまで。
 *
 * 短くすると、スクロールの最中に何度も取りに行って遅れが積み上がる。長くすると、
 * ずれた枠を見ている時間が伸びる。
 */
const STALE_DELAY_MS = 350;

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
  /**
   * 入力の解決先。
   *
   * **path の直打ちを受ける。** origin を省いた入力は、いま見ている画面へ寄せる。
   * 寄せる先は `stateId` (いま居る画面) であり、列挙の先頭ではない。
   */
  const target = resolveTarget(url, snapshot?.stateId ?? snapshot?.entryUrl ?? "");
  const origin = originOf(target ?? url);

  /**
   * 枠に使う要素を取り直す。
   *
   * **フレームごとに取り直さない。** 取得は要素数に比例し、実物では 1 回
   * 800ms ほどかかる。フレームは連続で届くため、取得が積み上がって遅れる。
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

  /**
   * 記録中は写しを追いかける。
   *
   * **記録は Stream Proxy 経由で進む。** 画面は HTTP の応答からしか状態を知ら
   * ないため、追いかけないと手順が積まれていることに気付けない。実際、server 側
   * に手順があるのに画面は「まだありません」を出し続けていた。
   *
   * 間隔は反映を待つ上限 (server 側 12 回 x 150ms) より長く取る。短くすると、
   * 確定する前の写しを何度も取り直すだけになる。
   */
  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const timer = setInterval(() => refreshSnapshot(), 2000);
    return () => clearInterval(timer);
  }, [recording, refreshSnapshot]);

  const clearSteps = useCallback(() => dispatch((api) => api.clearSteps()), [dispatch]);
  const replay = useCallback(() => dispatch((api) => api.replay()), [dispatch]);

  /** 承認へ回した結果。**黙って進めない** — どの鍵で回したかを出す。 */
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  const submit = useCallback(() => {
    if (client === undefined) {
      return;
    }
    void client
      .submit()
      .then((result) => {
        setSubmitted(
          result.warnings.length === 0
            ? `${result.key} を承認へ回しました。`
            : `${result.key} を承認へ回しました (注意 ${String(result.warnings.length)} 件)。`,
        );
        setError(undefined);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [client]);

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
  /**
   * 対象ページへ入力を送る。
   *
   * **枠を出しているなら取り直す。** box は対象ページの viewport 座標であり、
   * スクロールで一斉にずれる。押した時点の枠が残ると、別の要素に枠が付いて
   * いるように見える。
   *
   * 取り直しは要素数に比例して重い (実物で 800ms) ため、入力が止まってから
   * 1 度だけ行う。
   */
  const stale = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const send = useCallback(
    (input: PageInput) => {
      sendInput(input);
      if (!overlay) {
        return;
      }
      clearTimeout(stale.current);
      stale.current = setTimeout(() => refreshElements(), STALE_DELAY_MS);
    },
    [overlay, refreshElements, sendInput],
  );

  // 画面を離れるときに残さない。残すと、消えた画面へ向けて取得が走る。
  useEffect(() => () => clearTimeout(stale.current), []);

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
    (input: string) => {
      const to = resolveTarget(input, snapshot?.stateId ?? snapshot?.entryUrl ?? "");
      if (to === undefined) {
        setError("URL として解釈できません。path だけを打つときは、先に対象を選んでください。");
        return;
      }
      setDraftUrl(to);
      clearPick();
      dispatch((api) => api.navigate(to));
      refreshElements();
    },
    [clearPick, dispatch, refreshElements, snapshot?.entryUrl, snapshot?.stateId],
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
    replay,
    submit,
    submitted,
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
    sendInput: send,
    setOverlay,
    setUrl: setDraftUrl,
    snapshot,
    url,
    viewport,
  };
}
