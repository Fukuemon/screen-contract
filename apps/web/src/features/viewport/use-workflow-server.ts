import { useCallback, useEffect, useRef, useState } from "react";
import {
  createApiClient,
  type ApiClient,
  type PickedElementView,
  type ViewportSnapshot,
} from "../../shared/api/client.js";
import {
  authFrame,
  inputFrame,
  readEmbeddedToken,
  serverTargetOf,
  streamUrl,
} from "../../shared/api/connection.js";

/**
 * Workflow Server との接続を 1 箇所へまとめる。
 *
 * **client state は正本を持たない。** 表示に使うデータはすべて server から
 * 取り直す (context/architecture.md)。ここが持つのは接続そのものと、直近に
 * 受け取った写しだけである。
 */

export interface WorkflowServer {
  readonly client: ApiClient | undefined;
  readonly frame: string | undefined;
  readonly snapshot: ViewportSnapshot | undefined;
  readonly origins: readonly string[];
  readonly profiles: readonly string[];
  readonly activeProfile: string | undefined;
  readonly picked: PickedElementView | undefined;
  readonly error: string | undefined;
  /** server を叩き、結果の写しを取り込む。失敗は画面へ出す。 */
  run(action: (client: ApiClient) => Promise<ViewportSnapshot>): void;
  call(action: (client: ApiClient) => Promise<void>): void;
  sendInput(payload: unknown): void;
  pick(point: { readonly x: number; readonly y: number }): void;
  setActiveProfile: (name: string | undefined) => void;
  setProfiles: (profiles: readonly string[]) => void;
}

export function useWorkflowServer(): WorkflowServer {
  const socket = useRef<WebSocket | undefined>(undefined);
  const client = useRef<ApiClient | undefined>(undefined);
  const [frame, setFrame] = useState<string | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | undefined>(undefined);
  const [origins, setOrigins] = useState<readonly string[]>([]);
  const [profiles, setProfiles] = useState<readonly string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<PickedElementView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let ws: WebSocket;
    let api: ApiClient;
    try {
      // 接続先は**自分が配信された origin**である。選ばせない (ADR-0008)。
      const target = serverTargetOf(globalThis.location.origin);
      const token = readEmbeddedToken(globalThis.document);
      api = createApiClient({ target, token });
      client.current = api;
      ws = new WebSocket(streamUrl(target));
      ws.addEventListener("open", () => {
        // **最初のフレームで認証する。** URL の query には載せない。
        ws.send(JSON.stringify(authFrame(token, "current")));
      });
    } catch (cause) {
      setError((cause as Error).message);
      return undefined;
    }
    socket.current = ws;
    ws.addEventListener("message", (event: MessageEvent<string>) => {
      if (event.data.startsWith("data:")) {
        setFrame(event.data);
      }
    });

    void Promise.all([api.viewport(), api.allowedOrigins(), api.listAuthProfiles()])
      .then(([current, allowed, saved]) => {
        setSnapshot(current);
        setOrigins(allowed);
        setProfiles(saved);
      })
      .catch((cause: Error) => setError(cause.message));

    return () => {
      socket.current = undefined;
      ws.close();
    };
  }, []);

  const run = useCallback((action: (api: ApiClient) => Promise<ViewportSnapshot>) => {
    const api = client.current;
    if (api === undefined) {
      return;
    }
    void action(api)
      .then((next) => {
        setSnapshot(next);
        setError(undefined);
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const call = useCallback((action: (api: ApiClient) => Promise<void>) => {
    const api = client.current;
    if (api === undefined) {
      return;
    }
    void action(api)
      .then(() => setError(undefined))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const sendInput = useCallback((payload: unknown) => {
    // 中継してよいかは server 側が判定する。client の制御だけでは規則にならない。
    socket.current?.send(JSON.stringify(inputFrame(JSON.stringify(payload))));
  }, []);

  const pick = useCallback((point: { readonly x: number; readonly y: number }) => {
    const api = client.current;
    if (api === undefined) {
      return;
    }
    void api
      .resolveAt(point)
      .then(setPicked)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  return {
    client: client.current,
    frame,
    snapshot,
    origins,
    profiles,
    activeProfile,
    picked,
    error,
    run,
    call,
    sendInput,
    pick,
    setActiveProfile,
    setProfiles,
  };
}
