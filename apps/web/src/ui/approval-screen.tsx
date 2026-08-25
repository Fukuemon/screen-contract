import { useState } from "react";
import type { ApprovalRequest, RecordedStep } from "@screen-contract/api";
import {
  expectationWarnings,
  forgetMissing,
  INITIAL_APPROVAL_UI,
  rejectApprove,
  showDiff,
  type ApprovalUiState,
  type ApproveRejection,
  type DiffView,
} from "../state/approval.js";

/**
 * 承認画面。
 *
 * **承認の前に対象の差分を必ず表示する。** 見ずに確定できると、承認が
 * 「人間が内容を確かめた」ことの証拠にならない (ADR-0017)。
 */

const REJECTION_TEXT: Readonly<Record<ApproveRejection, string>> = {
  "not-reviewed": "差分を表示してから承認できます。",
  "stale-review": "表示した差分から内容が変わりました。もう一度表示してください。",
  "unknown-request": "この依頼はもうありません。",
};

export interface ApprovalScreenProps {
  /** 承認待ちの一覧。**正本は server が持つ。** 画面は写しを保持しない。 */
  readonly pending: readonly ApprovalRequest[];
  readonly steps: readonly RecordedStep[];
  /** 差分の取得。**既定値を持たせない。** 差分は任意データではない。 */
  readonly loadDiff: (request: ApprovalRequest) => Promise<DiffView>;
  readonly onApprove: (requestId: string) => void;
}

export function ApprovalScreen(props: ApprovalScreenProps) {
  const [state, setState] = useState<ApprovalUiState>(INITIAL_APPROVAL_UI);
  const warnings = expectationWarnings(props.steps);

  // 一覧が入れ替わったら消えた依頼の既読を落とす。持ち越すと「見ていない依頼が
  // 既読」に見える。
  const current = forgetMissing(state, props.pending);

  function approve(requestId: string): void {
    // **判定の正本はここ。** disabled は表示上の補助にすぎず、外されただけで
    // 差分を見ずに承認できてはならない。
    if (rejectApprove(current, props.pending, requestId) !== undefined) {
      return;
    }
    props.onApprove(requestId);
  }

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
        {props.pending.map((request) => {
          const rejection = rejectApprove(current, props.pending, request.id);
          return (
            <li key={request.id}>
              <span>{request.key}</span>
              <button
                type="button"
                onClick={() => {
                  void props.loadDiff(request).then((diff) => {
                    setState((previous) => showDiff(previous, diff));
                  });
                }}
              >
                差分を表示
              </button>
              <button
                type="button"
                disabled={rejection !== undefined}
                onClick={() => approve(request.id)}
              >
                承認
              </button>
              {rejection !== undefined && <span>{REJECTION_TEXT[rejection]}</span>}
            </li>
          );
        })}
      </ul>

      {current.shown !== undefined && (
        <section aria-label="差分" data-testid="diff">
          <pre>{current.shown.before}</pre>
          <pre>{current.shown.after}</pre>
        </section>
      )}
    </main>
  );
}
