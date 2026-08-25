import { useCallback, useEffect, useState } from "react";
import type {
  WorkflowServerClient,
  PickedElementView,
  ViewportSnapshot,
} from "./workflow-server.js";

/**
 * run の状態と操作。
 *
 * 正本は server が持つ。ここは直近の写しを保持し、操作のたびに取り直す
 * (context/architecture.md)。
 */
export function useViewportRun(client: WorkflowServerClient | undefined): {
  snapshot: ViewportSnapshot | undefined;
  origins: readonly string[];
  picked: PickedElementView | undefined;
  pickFailed: boolean;
  error: string | undefined;
  run: (action: (api: WorkflowServerClient) => Promise<ViewportSnapshot>) => void;
  addOrigin: (origin: string) => void;
  pick: (point: { readonly x: number; readonly y: number }) => void;
} {
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | undefined>(undefined);
  const [origins, setOrigins] = useState<readonly string[]>([]);
  const [picked, setPicked] = useState<PickedElementView | undefined>(undefined);
  const [pickFailed, setPickFailed] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (client === undefined) {
      return;
    }
    void Promise.all([client.viewport(), client.allowedOrigins()])
      .then(([current, allowed]) => {
        setSnapshot(current);
        setOrigins(allowed);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [client]);

  const run = useCallback(
    (action: (api: WorkflowServerClient) => Promise<ViewportSnapshot>) => {
      if (client === undefined) {
        return;
      }
      void action(client)
        .then((next) => {
          setSnapshot(next);
          setError(undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [client],
  );

  const addOrigin = useCallback(
    (origin: string) => {
      if (client === undefined) {
        return;
      }
      void client
        .addAllowedOrigin(origin)
        .then((next) => {
          setOrigins(next);
          setError(undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [client],
  );

  const pick = useCallback(
    (point: { readonly x: number; readonly y: number }) => {
      if (client === undefined) {
        return;
      }
      void client
        .resolveAt(point)
        .then((next) => {
          // 解決できない位置を黙って無視しない。地の文には要素が無い。
          setPicked(next ?? picked);
          setPickFailed(next === undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [client, picked],
  );

  return { snapshot, origins, picked, pickFailed, error, run, addOrigin, pick };
}
