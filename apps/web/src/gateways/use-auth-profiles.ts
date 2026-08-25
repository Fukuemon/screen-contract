import { useCallback, useEffect, useState } from "react";
import type { WorkflowServerClient } from "./workflow-server.js";

export interface AuthProfiles {
  readonly profiles: readonly string[];
  readonly active: string | undefined;
  readonly error: string | undefined;
  save(name: string): void;
  use(name: string | undefined): void;
  remove(name: string): void;
}

/**
 * 認証プロファイルの一覧と切り替え。
 *
 * 保存するのはログイン後のブラウザ状態 (Cookie / localStorage) であり、
 * 資格情報そのものではない (ADR-0022)。
 */
export function useAuthProfiles(client: WorkflowServerClient | undefined): AuthProfiles {
  const [profiles, setProfiles] = useState<readonly string[]>([]);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (client === undefined) {
      return;
    }
    void client
      .listAuthProfiles()
      .then(setProfiles)
      .catch((cause: Error) => setError(cause.message));
  }, [client]);

  const save = useCallback(
    (name: string) => {
      if (client === undefined) {
        return;
      }
      void client
        .saveAuthProfile(name)
        .then((next) => {
          setProfiles(next);
          setError(undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [client],
  );

  const use = useCallback(
    (name: string | undefined) => {
      if (client === undefined) {
        return;
      }
      void client
        .useAuthProfile(name)
        .then(() => {
          setActive(name);
          setError(undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [client],
  );

  const remove = useCallback(
    (name: string) => {
      if (client === undefined) {
        return;
      }
      void client
        .removeAuthProfile(name)
        .then((next) => {
          setProfiles(next);
          // 消したプロファイルを使っていたら匿名へ戻す。
          setActive(active === name ? undefined : active);
          setError(undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [active, client],
  );

  return { profiles, active, error, save, use, remove };
}
