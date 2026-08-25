import type { ApprovalRequest, RecordedStep } from "@screen-contract/api";

/**
 * 承認の導線。
 *
 * **承認の前に対象の差分を必ず表示する。** 見ずに確定できると、承認が
 * 「人間が内容を確かめた」ことの証拠にならない (ADR-0017)。
 */

export interface DiffView {
  readonly requestId: string;
  readonly before: string;
  readonly after: string;
}

export interface ApprovalUiState {
  readonly pending: readonly ApprovalRequest[];
  /** 差分を表示済みの依頼。表示していない依頼は確定させない。 */
  readonly reviewed: ReadonlySet<string>;
  readonly shown: DiffView | undefined;
}

export const INITIAL_APPROVAL_UI: ApprovalUiState = {
  pending: [],
  reviewed: new Set(),
  shown: undefined,
};

export function showDiff(state: ApprovalUiState, diff: DiffView): ApprovalUiState {
  return { ...state, shown: diff, reviewed: new Set([...state.reviewed, diff.requestId]) };
}

export function setPending(
  state: ApprovalUiState,
  pending: readonly ApprovalRequest[],
): ApprovalUiState {
  const ids = new Set(pending.map((request) => request.id));
  // 消えた依頼の既読を持ち越さない。同じ id が再利用されることは無いが、
  // 持ち越すと「見ていない依頼が既読」に見える状態を許すことになる。
  return {
    ...state,
    pending,
    reviewed: new Set([...state.reviewed].filter((id) => ids.has(id))),
  };
}

export type ApproveRejection = "not-reviewed" | "unknown-request";

/** 承認ボタンを押せるか。押せない理由を返す。 */
export function rejectApprove(
  state: ApprovalUiState,
  requestId: string,
): ApproveRejection | undefined {
  if (!state.pending.some((request) => request.id === requestId)) {
    return "unknown-request";
  }
  return state.reviewed.has(requestId) ? undefined : "not-reviewed";
}

/**
 * Expectation を選ばずに承認できてしまうことを、利用者へ示す文言。
 *
 * **黙らせない。** 選ばないと期待状態を持たないステップになり、冪等スキップが
 * 効かず毎回実行される (web-editor feature)。
 */
export function expectationWarnings(steps: readonly RecordedStep[]): readonly string[] {
  const warnings: string[] = [];
  const withoutExpect = steps.filter((step) => step.expect.length === 0).length;
  if (withoutExpect > 0) {
    warnings.push(
      `${String(withoutExpect)} 件のステップが期待状態を持ちません。冪等スキップが効かず、再生のたびに実行されます。`,
    );
  }
  const unresolved = steps.filter((step) => step.warning !== undefined).length;
  if (unresolved > 0) {
    warnings.push(`${String(unresolved)} 件の操作を要素へ解決できず、座標のまま記録しました。`);
  }
  return warnings;
}
