import { useCallback, useEffect, useState } from "react";
import type { ApiClient, PickedElementView, ViewportSnapshot } from "../../shared/api/client.js";

/**
 * run の状態と操作。
 *
 * 正本は server が持つ。ここは直近の写しを保持し、操作のたびに取り直す
 * (context/architecture.md)。
 */
export function useViewportRun(client: ApiClient | undefined): {
  snapshot: ViewportSnapshot | undefined;
  origins: readonly string[];
  picked: PickedElementView | undefined;
  error: string | undefined;
  run: (action: (api: ApiClient) => Promise<ViewportSnapshot>) => void;
  addOrigin: (origin: string) => void;
  pick: (point: { readonly x: number; readonly y: number }) => void;
} {
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | undefined>(undefined);
  const [origins, setOrigins] = useState<readonly string[]>([]);
  const [picked, setPicked] = useState<PickedElementView | undefined>(undefined);
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
    (action: (api: ApiClient) => Promise<ViewportSnapshot>) => {
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
        .then(setPicked)
        .catch((cause: Error) => setError(cause.message));
    },
    [client],
  );

  return { snapshot, origins, picked, error, run, addOrigin, pick };
}
