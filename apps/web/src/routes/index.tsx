import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient, type ApiClient, type ViewportSnapshot } from "../api-client.js";
import {
  authFrame,
  inputFrame,
  readEmbeddedToken,
  serverTargetOf,
  streamUrl,
} from "../state/connection.js";
import type { mouseInput } from "../state/input.js";
import { rejectUiAction, type UiAction, type UiRejection } from "../state/mode.js";
import { INITIAL_VIEWER_STATE, reduceViewerAll } from "../state/viewer.js";
import { EditorScreen } from "../ui/editor-screen.js";

export const Route = createFileRoute("/")({ component: EditorRoute });

/**
 * live viewport を Stream Proxy へ繋ぐ。
 *
 * **接続先は Workflow Server の単一エンドポイントのみ** (ADR-0008)。
 * **トークンを URL の query に載せず、接続後の最初のフレームで認証する**
 * (context/infrastructure.md)。
 *
 * **run の状態は server が持つ。** client state は正本を持たない
 * (context/architecture.md)。画面が持つのは表示に使う写しだけである。
 */
function EditorRoute() {
  const socket = useRef<WebSocket | undefined>(undefined);
  const client = useRef<ApiClient | undefined>(undefined);
  const [frame, setFrame] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<{ x: number; y: number } | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | undefined>(undefined);
  const [rejection, setRejection] = useState<UiRejection | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let api: ApiClient;
    let ws: WebSocket;
    try {
      const target = serverTargetOf(globalThis.location.origin);
      const token = readEmbeddedToken(globalThis.document);
      api = createApiClient({ target, token });
      client.current = api;
      ws = new WebSocket(streamUrl(target));
    } catch (cause) {
      setError((cause as Error).message);
      return undefined;
    }
    socket.current = ws;
    ws.addEventListener("open", () => {
      // **最初のフレームで認証する。**
      ws.send(JSON.stringify(authFrame(token(), "current")));
    });
    ws.addEventListener("message", (event: MessageEvent<string>) => {
      if (event.data.startsWith("data:")) {
        setFrame(event.data);
      }
    });
    void api
      .viewport()
      .then(setSnapshot)
      .catch((cause: Error) => setError(cause.message));
    return () => {
      socket.current = undefined;
      ws.close();
    };

    function token(): string {
      return readEmbeddedToken(globalThis.document);
    }
  }, []);

  const guard = useCallback(async (action: () => Promise<ViewportSnapshot>) => {
    try {
      setSnapshot(await action());
      setError(undefined);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  const ui = { mode: snapshot?.mode ?? "view", recording: snapshot?.recording ?? false };
  const viewer =
    snapshot === undefined
      ? INITIAL_VIEWER_STATE
      : { ...reduceViewerAll(snapshot.events), paused: snapshot.status === "paused" };

  const onUi = useCallback(
    (action: UiAction) => {
      // 押せない操作は理由を出す。判定の正本は core の純粋関数にある。
      const reason = rejectUiAction(ui, action, viewer);
      setRejection(reason);
      if (reason !== undefined || client.current === undefined) {
        return;
      }
      const api = client.current;
      switch (action.kind) {
        case "set-mode":
          void guard(() => api.setMode(action.mode));
          return;
        case "start-recording":
          void guard(() => api.setRecording(true));
          return;
        case "stop-recording":
          void guard(() => api.setRecording(false));
      }
    },
    [guard, ui, viewer],
  );

  const onPageInput = useCallback((input: ReturnType<typeof mouseInput>) => {
    // 中継してよいかは server 側が判定する。client の制御だけでは規則にならない。
    socket.current?.send(JSON.stringify(inputFrame(JSON.stringify(input))));
  }, []);

  return (
    <EditorScreen
      frame={frame}
      ui={ui}
      viewer={viewer}
      rejection={rejection}
      connected={snapshot !== undefined && snapshot.status !== "idle"}
      entryUrl={snapshot?.entryUrl ?? "(未接続)"}
      steps={[]}
      events={snapshot?.events ?? []}
      error={error}
      onConnect={() => {
        if (client.current !== undefined) {
          const api = client.current;
          void guard(() => api.startRun());
        }
      }}
      onResume={() => {
        if (client.current !== undefined) {
          const api = client.current;
          void guard(() => api.resumeRun());
        }
      }}
      onUi={onUi}
      onPageInput={onPageInput}
      picked={picked}
      onPick={setPicked}
    />
  );
}
