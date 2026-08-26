import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { ApprovalRequest } from "@screen-contract/api";
import { ApprovalView } from "../components/features/approval/approval-view.js";
import {
  forgetMissing,
  INITIAL_APPROVAL_UI,
  rejectApprove,
  showDiff,
  type ApprovalUiState,
} from "../entities/approval.js";
import { Button } from "../components/ui/button.js";
import type { RecordedStepView, WorkflowServerClient } from "../gateways/workflow-server.js";
import { useWorkflowServer } from "../gateways/use-workflow-server.js";

export const Route = createFileRoute("/approvals")({ component: ApprovalsRoute });

/** 承認画面。承認待ちの正本は server が持ち、ここは写しを表示する。 */
function ApprovalsRoute() {
  const { client, error: clientError } = useWorkflowServer();
  const [pending, setPending] = useState<readonly ApprovalRequest[]>([]);
  const [state, setState] = useState<ApprovalUiState>(INITIAL_APPROVAL_UI);
  /**
   * 依頼のもとになった手順。
   *
   * **skeleton は run を 1 本しか持たない** ため、いま記録している手順が依頼の
   * 中身である。run を複数持つ段では、依頼ごとに引く経路が要る。
   */
  const [steps, setSteps] = useState<readonly RecordedStepView[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback((api: WorkflowServerClient) => {
    void Promise.all([api.listApprovals(), api.viewport()])
      .then(([next, snapshot]) => {
        setPending(next);
        setSteps(snapshot.steps);
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

  const showing = error ?? clientError;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line/40 px-4">
        <Link
          to="/"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-elevated hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          エディタ
        </Link>
        <span className="text-sm font-semibold">承認</span>
        <span className="text-xs text-muted">確定すると画面仕様書の正本になります</span>
        {/* **開いたまま届いた依頼が見えないと「ありません」と誤表示する。** */}
        <Button
          className="ml-auto"
          onClick={() => {
            if (client !== undefined) {
              refresh(client);
            }
          }}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          読み直す
        </Button>
      </header>

      <ApprovalView
        pending={pending}
        steps={steps}
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
          // 判定の正本はここ。disabled は表示上の補助にすぎない。
          if (client === undefined || rejectApprove(state, pending, requestId) !== undefined) {
            return;
          }
          void client
            .approve(requestId)
            .then(() => refresh(client))
            .catch((cause: Error) => setError(cause.message));
        }}
      />

      {showing !== undefined && (
        <p
          role="alert"
          className="shrink-0 border-t border-danger/50 bg-danger/10 px-4 py-2 text-sm text-danger-fg"
        >
          {showing}
        </p>
      )}
    </div>
  );
}
