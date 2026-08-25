import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  authFrame,
  inputFrame,
  readEmbeddedToken,
  serverTargetOf,
  streamUrl,
} from "../state/connection.js";
import { EditorScreen } from "../ui/editor-screen.js";

export const Route = createFileRoute("/")({ component: EditorRoute });

/**
 * live viewport を Stream Proxy へ繋ぐ。
 *
 * **接続先は Workflow Server の単一エンドポイントのみ。** 実行基盤のポートへは
 * 接続しない (ADR-0008)。**トークンを URL の query に載せず、接続後の最初の
 * フレームで認証する** (context/infrastructure.md)。
 */
function EditorRoute() {
  const socket = useRef<WebSocket | undefined>(undefined);
  const [frame, setFrame] = useState<string | undefined>(undefined);

  useEffect(() => {
    const target = serverTargetOf(globalThis.location.origin);
    const token = readEmbeddedToken(globalThis.document);
    const ws = new WebSocket(streamUrl(target));
    socket.current = ws;
    ws.addEventListener("open", () => {
      // **最初のフレームで認証する。**
      ws.send(JSON.stringify(authFrame(token, currentRunId())));
    });
    ws.addEventListener("message", (event: MessageEvent<string>) => {
      setFrame(event.data);
    });
    return () => {
      socket.current = undefined;
      ws.close();
    };
  }, []);

  const onPageClick = useCallback((point: { readonly x: number; readonly y: number }) => {
    // 中継してよいかは server 側が判定する。client の制御だけでは規則にならない。
    socket.current?.send(JSON.stringify(inputFrame(JSON.stringify({ kind: "click", ...point }))));
  }, []);

  return <EditorScreen frame={frame} onPageClick={onPageClick} />;
}

/**
 * 表示している run。
 *
 * skeleton では 1 本しか動かないため固定する。複数 run の切り替えは
 * ルーティングの関心であり、本 issue の範囲に無い。
 */
function currentRunId(): string {
  return "current";
}
