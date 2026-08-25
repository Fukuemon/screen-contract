import { useState } from "react";
import type { ApprovalRequest, RecordedStep } from "@screen-contract/api";
import {
  expectationWarnings,
  INITIAL_APPROVAL_UI,
  rejectApprove,
  showDiff,
  type ApprovalUiState,
  type DiffView,
} from "../state/approval.js";

/**
 * 承認画面。
 *
 * **承認の前に対象の差分を必ず表示する。** 見ずに確定できると、承認が
 * 「人間が内容を確かめた」ことの証拠にならない (ADR-0017)。
 */

export interface ApprovalScreenProps {
  readonly initial?: ApprovalUiState | undefined;
  readonly steps?: readonly RecordedStep[] | undefined;
  readonly loadDiff?: ((request: ApprovalRequest) => DiffView) | undefined;
  readonly onApprove?: ((requestId: string) => void) | undefined;
}

export function ApprovalScreen(props: ApprovalScreenProps) {
  const [state, setState] = useState<ApprovalUiState>(props.initial ?? INITIAL_APPROVAL_UI);
  const warnings = expectationWarnings(props.steps ?? []);

  return (
    <main>
      <h1>承認</h1>

      {warnings.length > 0 && (
        <section aria-label="警告">
          {/* **Expectation を選ばずに承認できてしまう点を明示する。** */}
          <ul>
            {warnings.map((warning) => (
              <li key={warning} role="alert">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul>
        {state.pending.map((request) => {
          const rejection = rejectApprove(state, request.id);
          return (
            <li key={request.id}>
              <span>{request.key}</span>
              <button
                type="button"
                onClick={() =>
                  setState((current) =>
                    showDiff(
                      current,
                      props.loadDiff?.(request) ?? {
                        requestId: request.id,
                        before: "",
                        after: "",
                      },
                    ),
                  )
                }
              >
                差分を表示
              </button>
              <button
                type="button"
                disabled={rejection !== undefined}
                onClick={() => props.onApprove?.(request.id)}
              >
                承認
              </button>
              {rejection === "not-reviewed" && <span>差分を表示してから承認できます。</span>}
            </li>
          );
        })}
      </ul>

      {state.shown !== undefined && (
        <section aria-label="差分" data-testid="diff">
          <pre>{state.shown.before}</pre>
          <pre>{state.shown.after}</pre>
        </section>
      )}
    </main>
  );
}
