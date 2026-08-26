import type { ApprovalRequest, RecordedStep } from "@screen-contract/api";

/**
 * 承認の導線。
 *
 * **承認の前に対象の差分を必ず表示する。** 見ずに確定できると、承認が
 * 「人間が内容を確かめた」ことの証拠にならない (ADR-0017)。
 */

export interface DiffView {
  readonly requestId: string;
  /** 表示した差分がどの版のものか。依頼の revision と突き合わせる。 */
  readonly revision: string;
  readonly before: string;
  readonly after: string;
}

export interface ApprovalUiState {
  /**
   * 差分を表示済みの依頼と、そのときの版。
   *
   * **版まで持つ。** id だけだと、差分を見た後に draft が変わった依頼も既読の
   * まま承認できてしまう。
   */
  readonly reviewed: ReadonlyMap<string, string>;
  readonly shown: DiffView | undefined;
}

export const INITIAL_APPROVAL_UI: ApprovalUiState = { reviewed: new Map(), shown: undefined };

export function showDiff(state: ApprovalUiState, diff: DiffView): ApprovalUiState {
  return {
    shown: diff,
    reviewed: new Map([...state.reviewed, [diff.requestId, diff.revision]]),
  };
}

/** 一覧が入れ替わったら、消えた依頼の既読を落とす。 */
export function forgetMissing(
  state: ApprovalUiState,
  pending: readonly ApprovalRequest[],
): ApprovalUiState {
  const ids = new Set(pending.map((request) => request.id));
  return {
    ...state,
    reviewed: new Map([...state.reviewed].filter(([id]) => ids.has(id))),
  };
}

export type ApproveRejection = "not-reviewed" | "stale-review" | "unknown-request";

/** 承認してよいか。押せない理由を返す。 */
export function rejectApprove(
  state: ApprovalUiState,
  pending: readonly ApprovalRequest[],
  requestId: string,
): ApproveRejection | undefined {
  const request = pending.find((candidate) => candidate.id === requestId);
  if (request === undefined) {
    return "unknown-request";
  }
  const reviewed = state.reviewed.get(requestId);
  if (reviewed === undefined) {
    return "not-reviewed";
  }
  // 見た差分と確定する内容がずれていたら止める。server も stale で弾くが、
  // 押せてしまう時点で「内容を確かめた」ことの証拠にならない。
  return reviewed === request.revision ? undefined : "stale-review";
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
