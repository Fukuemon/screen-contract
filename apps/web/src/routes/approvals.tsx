import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { ApprovalRequest } from "@screen-contract/api";
import { createApiClient } from "../api-client.js";
import { readEmbeddedToken, serverTargetOf } from "../state/connection.js";
import type { DiffView } from "../state/approval.js";
import { ApprovalScreen } from "../ui/approval-screen.js";

export const Route = createFileRoute("/approvals")({ component: ApprovalsRoute });

/**
 * 承認画面を api へ繋ぐ。
 *
 * **client state は正本を持たない。** 承認待ちは server から取り直す
 * (context/architecture.md)。
 */
function ApprovalsRoute() {
  const [pending, setPending] = useState<readonly ApprovalRequest[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const client = useCallback(
    () =>
      createApiClient({
        // 接続先は**自分が配信された origin**である。選ばせない。
        target: serverTargetOf(globalThis.location.origin),
        token: readEmbeddedToken(globalThis.document),
      }),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      setPending(await client().listApprovals());
      setError(undefined);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadDiff = useCallback(
    async (request: ApprovalRequest): Promise<DiffView> => {
      const api = client();
      const [before, after] = await Promise.all([
        api.loadAuthoritative(request.key),
        api.loadDraft(request.key),
      ]);
      return { requestId: request.id, revision: request.revision, before, after };
    },
    [client],
  );

  const onApprove = useCallback(
    (requestId: string) => {
      void client()
        .approve(requestId)
        .then(() => refresh());
    },
    [client, refresh],
  );

  return (
    <>
      {error !== undefined && <p role="alert">{error}</p>}
      <ApprovalScreen pending={pending} steps={[]} loadDiff={loadDiff} onApprove={onApprove} />
    </>
  );
}
