import { useCallback, useEffect, useState } from "react";
import type { AuthProfilesView } from "@screen-contract/api";
import type { WorkflowServerClient } from "./workflow-server.js";

export interface AuthProfiles {
  readonly profiles: readonly string[];
  readonly active: string | undefined;
  /** 取り込みの世代。Baseline の識別に入る (ADR-0022)。 */
  readonly generation: number;
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
 *
 * **いま使っているものを画面側で数えない。** server が返す写しをそのまま持つ。
 * 数えると、切り替えに失敗したときに画面だけが切り替わったつもりになる。
 */
export function useAuthProfiles(client: WorkflowServerClient | undefined): AuthProfiles {
  const [view, setView] = useState<AuthProfilesView>({
    profiles: [],
    active: null,
    generation: 0,
  });
  const [error, setError] = useState<string | undefined>(undefined);

  const run = useCallback(
    (action: (api: WorkflowServerClient) => Promise<AuthProfilesView>) => {
      if (client === undefined) {
        return;
      }
      void action(client)
        .then((next) => {
          setView(next);
          setError(undefined);
        })
        .catch((cause: Error) => setError(cause.message));
    },
    [client],
  );

  useEffect(() => {
    run((api) => api.listAuthProfiles());
  }, [run]);

  return {
    profiles: view.profiles,
    active: view.active ?? undefined,
    generation: view.generation,
    error,
    save: (name) => run((api) => api.saveAuthProfile(name)),
    use: (name) => run((api) => api.useAuthProfile(name)),
    remove: (name) => run((api) => api.removeAuthProfile(name)),
  };
}
