import { CircleCheck, FileDiff, TriangleAlert } from "lucide-react";
import type { ApprovalRequest, RecordedStep } from "@screen-contract/api";
import { Badge } from "../../shared/ui/badge.js";
import { Button } from "../../shared/ui/button.js";
import { EmptyState, Panel } from "../../shared/ui/panel.js";
import {
  expectationWarnings,
  rejectApprove,
  type ApprovalUiState,
  type ApproveRejection,
} from "./approval.js";

/**
 * 承認画面 (presentation)。
 *
 * **承認の前に対象の差分を必ず表示する。** 見ずに確定できると、承認が
 * 「人間が内容を確かめた」ことの証拠にならない (ADR-0017)。
 */

const REJECTION_TEXT: Readonly<Record<ApproveRejection, string>> = {
  "not-reviewed": "差分を表示してから承認できます。",
  "stale-review": "表示した差分から内容が変わりました。もう一度表示してください。",
  "unknown-request": "この依頼はもうありません。",
};

export interface ApprovalViewProps {
  readonly pending: readonly ApprovalRequest[];
  readonly steps: readonly RecordedStep[];
  readonly state: ApprovalUiState;
  readonly onShowDiff: (request: ApprovalRequest) => void;
  readonly onApprove: (requestId: string) => void;
}

export function ApprovalView(props: ApprovalViewProps) {
  const warnings = expectationWarnings(props.steps);

  return (
    <div className="flex min-h-0 flex-1">
      <Panel title="承認待ち" className="w-96 shrink-0 border-r border-line/40">
        {warnings.length > 0 && (
          <ul className="flex flex-col gap-1 border-b border-line/40 p-3">
            {warnings.map((warning) => (
              <li key={warning} role="alert" className="flex gap-1.5 text-xs text-warn">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {warning}
              </li>
            ))}
          </ul>
        )}

        {props.pending.length === 0 ? (
          <EmptyState>承認待ちはありません。記録した手順を依頼すると並びます。</EmptyState>
        ) : (
          <ul className="divide-y divide-line/30">
            {props.pending.map((request) => {
              const rejection = rejectApprove(props.state, props.pending, request.id);
              return (
                <li key={request.id} className="flex flex-col gap-2 p-3">
                  <code className="truncate text-xs">{request.key}</code>
                  <div className="flex gap-1.5">
                    <Button onClick={() => props.onShowDiff(request)}>
                      <FileDiff className="size-3.5" aria-hidden />
                      差分を表示
                    </Button>
                    <Button
                      tone="primary"
                      disabled={rejection !== undefined}
                      onClick={() => props.onApprove(request.id)}
                    >
                      <CircleCheck className="size-3.5" aria-hidden />
                      承認
                    </Button>
                  </div>
                  {rejection !== undefined && (
                    <p className="text-xs text-muted">{REJECTION_TEXT[rejection]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="差分" className="min-h-0 flex-1">
        {props.state.shown === undefined ? (
          <EmptyState>「差分を表示」を押すと、確定する内容がここに出ます。</EmptyState>
        ) : (
          <div className="grid min-h-0 grid-cols-2 divide-x divide-line/30">
            <section aria-label="いまの正本" className="flex min-h-0 flex-col">
              <h3 className="border-b border-line/40 px-3 py-1.5 text-xs text-muted">いまの正本</h3>
              <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                {props.state.shown.before === "" ? "(まだありません)" : props.state.shown.before}
              </pre>
            </section>
            <section aria-label="確定する内容" className="flex min-h-0 flex-col">
              <h3 className="border-b border-line/40 px-3 py-1.5 text-xs text-muted">
                確定する内容
              </h3>
              <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                {props.state.shown.after}
              </pre>
            </section>
          </div>
        )}
        {props.state.shown !== undefined && (
          <Badge tone="muted" className="m-3">
            版 {props.state.shown.revision.slice(0, 12)}
          </Badge>
        )}
      </Panel>
    </div>
  );
}
