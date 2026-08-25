import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { ApprovalRequest } from "@screen-contract/api";
import {
  forgetMissing,
  INITIAL_APPROVAL_UI,
  rejectApprove,
  showDiff,
  type ApprovalUiState,
} from "../features/approval/approval.js";
import { ApprovalView } from "../features/approval/approval-view.js";
import { createApiClient, type ApiClient } from "../shared/api/client.js";
import { readEmbeddedToken, serverTargetOf } from "../shared/api/connection.js";

export const Route = createFileRoute("/approvals")({ component: ApprovalsRoute });

/**
 * 承認画面 (container)。
 *
 * **client state は正本を持たない。** 承認待ちは server から取り直す
 * (context/architecture.md)。
 */
function ApprovalsRoute() {
  const [client, setClient] = useState<ApiClient | undefined>(undefined);
  const [pending, setPending] = useState<readonly ApprovalRequest[]>([]);
  const [state, setState] = useState<ApprovalUiState>(INITIAL_APPROVAL_UI);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      setClient(
        createApiClient({
          target: serverTargetOf(globalThis.location.origin),
          token: readEmbeddedToken(globalThis.document),
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  const refresh = useCallback((api: ApiClient) => {
    void api
      .listApprovals()
      .then((next) => {
        setPending(next);
        // 消えた依頼の既読を持ち越さない。
        setState((current) => forgetMissing(current, next));
        setError(undefined);
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (client !== undefined) {
      refresh(client);
    }
  }, [client, refresh]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line/40 px-4">
        <Link
          to="/"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line/60 bg-elevated px-3 text-sm transition-colors duration-150 hover:bg-line/40"
        >
          <ArrowLeft className="size-4" aria-hidden />
          エディタへ
        </Link>
        <span className="text-sm font-semibold">承認</span>
        <span className="text-xs text-muted">確定すると画面仕様書の正本になります</span>
      </header>

      <ApprovalView
        pending={pending}
        steps={[]}
        state={state}
        onShowDiff={(request) => {
          if (client === undefined) {
            return;
          }
          void Promise.all([client.loadAuthoritative(request.key), client.loadDraft(request.key)])
            .then(([before, after]) => {
              setState((current) =>
                showDiff(current, {
                  requestId: request.id,
                  revision: request.revision,
                  before,
                  after,
                }),
              );
            })
            .catch((cause: Error) => setError(cause.message));
        }}
        onApprove={(requestId) => {
          // **判定の正本はここ。** disabled は表示上の補助にすぎない。
          if (client === undefined || rejectApprove(state, pending, requestId) !== undefined) {
            return;
          }
          void client
            .approve(requestId)
            .then(() => refresh(client))
            .catch((cause: Error) => setError(cause.message));
        }}
      />

      {error !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-t border-line/40 bg-danger/10 px-4 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
