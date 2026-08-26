import { useCallback, useEffect, useRef, useState } from "react";
import {
  authFrame,
  inputFrame,
  readEmbeddedToken,
  serverTargetOf,
  streamUrl,
} from "../lib/connection.js";

export interface Stream {
  readonly frame: string | undefined;
  readonly error: string | undefined;
  /** メソッドではなく関数として持つ。取り出して渡す先が this を必要としない。 */
  readonly sendInput: (payload: unknown) => void;
}

/**
 * live viewport の映像と入力転送。
 *
 * トークンを URL の query に載せず、接続後の最初のフレームで認証する
 * (context/infrastructure.md)。
 *
 * @param runId - 要求元として名乗る run
 */
export function useStream(runId: string): Stream {
  const socket = useRef<WebSocket | undefined>(undefined);
  const [frame, setFrame] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    // 接続を組み立てられない時点で購読も無い。cleanup は常に同じ形で返す。
    let ws: WebSocket | undefined;
    let token = "";
    try {
      token = readEmbeddedToken(globalThis.document);
      ws = new WebSocket(streamUrl(serverTargetOf(globalThis.location.origin)));
    } catch (cause) {
      setError((cause as Error).message);
    }

    const opened = ws;
    const onOpen = (): void => opened?.send(JSON.stringify(authFrame(token, runId)));
    const onMessage = (event: MessageEvent<string>): void => {
      if (event.data.startsWith("data:")) {
        setFrame(event.data);
      }
    };
    const onError = (): void => setError("映像の接続が切れました");

    opened?.addEventListener("open", onOpen);
    opened?.addEventListener("message", onMessage);
    opened?.addEventListener("error", onError);
    socket.current = opened;

    return () => {
      opened?.removeEventListener("open", onOpen);
      opened?.removeEventListener("message", onMessage);
      opened?.removeEventListener("error", onError);
      socket.current = undefined;
      opened?.close();
    };
  }, [runId]);

  const sendInput = useCallback((payload: unknown) => {
    // 中継してよいかは server 側が判定する (ADR-0008)。
    socket.current?.send(JSON.stringify(inputFrame(JSON.stringify(payload))));
  }, []);

  return { frame, sendInput, error };
}
