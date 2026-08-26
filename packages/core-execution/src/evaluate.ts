import type { Expectation } from "@screen-contract/core-workflow";

/**
 * Expectation の評価。
 *
 * **Snapshot を入力とする純粋関数**とし、同じ観測に対する評価結果は常に同じに
 * する (execution feature)。ブラウザへ問い合わせない。
 */

/**
 * 評価に使う観測値。
 *
 * `elements` は**解決できた要素だけ**を持ち、値が可視かどうかを表す。
 * 「解決できたが不可視」と「そもそも解決できない」を同じ「集合に無い」で
 * 表すと、未解決の要素に対する `visible: false` が満たされたことになり、
 * action が一度も実行されないまま skip される。
 */
export interface Observation {
  readonly url: string;
  readonly title: string;
  readonly elements: ReadonlyMap<string, boolean>;
  readonly counts: ReadonlyMap<string, number>;
}

/** `unevaluatable` は「観測できていない」であり、「満たさない」と混ぜない。 */
export type EvaluationOutcome = "satisfied" | "unsatisfied" | "unevaluatable";

export interface EvaluationResult {
  readonly expectation: Expectation;
  readonly outcome: EvaluationOutcome;
}

function outcomeOf(expectation: Expectation, observation: Observation): EvaluationOutcome {
  switch (expectation.kind) {
    case "url":
      return observation.url === expectation.path ? "satisfied" : "unsatisfied";
    case "title":
      return observation.title === expectation.value ? "satisfied" : "unsatisfied";
    case "element": {
      const visible = observation.elements.get(expectation.ref);
      // Locator が解決できない要素は、可視でも不可視でもない。
      return visible === undefined
        ? "unevaluatable"
        : visible === expectation.visible
          ? "satisfied"
          : "unsatisfied";
    }
    case "count": {
      const count = observation.counts.get(expectation.ref);
      return count === undefined
        ? "unevaluatable"
        : count === expectation.value
          ? "satisfied"
          : "unsatisfied";
    }
  }
}

export function evaluate(
  expectations: readonly Expectation[],
  observation: Observation,
): readonly EvaluationResult[] {
  return expectations.map((expectation) => ({
    expectation,
    outcome: outcomeOf(expectation, observation),
  }));
}

/** 全て満たしたか。空集合は真 (述語として素直な定義を保つ)。 */
export function allSatisfied(results: readonly EvaluationResult[]): boolean {
  return results.every((result) => result.outcome === "satisfied");
}

/**
 * 冪等スキップの判定。
 *
 * **空集合ではスキップしない。** 空集合は「期待状態を宣言していない」ことを
 * 意味し、「既に満たしている」ことを意味しない。`allSatisfied` をそのまま
 * 使うと常に真になり、action が一度も実行されないまま skip される。
 */
export function canSkip(results: readonly EvaluationResult[]): boolean {
  return results.length > 0 && allSatisfied(results);
}
