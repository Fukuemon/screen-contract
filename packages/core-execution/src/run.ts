import type { ExecutionStep } from "@screen-contract/core-workflow";
import { isExecutionFailure } from "./errors.js";
import { canSkip, evaluate, type EvaluationResult, type Observation } from "./evaluate.js";

/**
 * ステップ実行のルールと再生制御。
 *
 * 各ステップを「評価 → 冪等スキップ → 実行 → 検証」の 4 手順で処理する。
 * 判断は本モジュールが持ち、ブラウザの操作は Browser Port へ委ねる
 * (execution feature)。
 */

export type StepOutcome = "skipped" | "executed" | "failed";

export interface StepResult {
  readonly index: number;
  readonly outcome: StepOutcome;
  readonly evaluated: readonly EvaluationResult[];
}

/** run が停止したときに取りうる状態。`idle` / `running` は run の外の関心である。 */
export type TerminalRunStatus = "paused" | "completed" | "failed";

/** 評価の局面。同じ index で 2 度評価するため、イベントだけで区別できるようにする。 */
export type EvaluationPhase = "before" | "after";

/**
 * 実行イベント。append-only で発行順序が決定的である。
 *
 * skeleton が発行するのは 11 件に限る。`session-recreated` は語彙として持つが、
 * 不応答時に再作成せず止めるため発行経路を持たない。`rolled-back` と
 * `run-aborted` は skeleton に発行機会が無い。
 *
 * **action と入力値をイベントへ載せない。** 実行履歴は永続化されるため、
 * 一度入った秘密情報は後から取り除けない。載せるのは index と評価結果に留める。
 */
export type ExecutionEvent =
  | { readonly kind: "run-started"; readonly irVersion: string }
  | { readonly kind: "step-started"; readonly index: number }
  | {
      readonly kind: "expectation-evaluated";
      readonly index: number;
      readonly phase: EvaluationPhase;
      readonly results: readonly EvaluationResult[];
    }
  | { readonly kind: "step-skipped"; readonly index: number }
  | { readonly kind: "step-executed"; readonly index: number }
  | { readonly kind: "step-failed"; readonly index: number }
  | { readonly kind: "paused"; readonly atIndex: number }
  | { readonly kind: "ir-version-changed"; readonly from: string; readonly to: string }
  | { readonly kind: "resumed" }
  | { readonly kind: "run-completed" }
  | { readonly kind: "run-failed"; readonly reason: string }
  | { readonly kind: "session-recreated"; readonly reason: string; readonly lost: string };

/**
 * 実行の相手。
 *
 * `perform` は `ref` を持つ DSL のステップを受ける。Browser Port が受ける
 * `BrowserAction` は解決済みの Locator を持つ別物であり、その写像は要素定義を
 * 知っている層 (app) が担う。
 */
export interface StepRunner {
  observe(): Promise<Observation>;
  perform(step: ExecutionStep): Promise<void>;
}

export interface RunOptions {
  readonly steps: readonly ExecutionStep[];
  readonly irVersion: string;
  readonly runner: StepRunner;
  /**
   * pause の予約。**各ステップの完了直後に 1 度だけ問い合わせる。**
   * 真を返した時点で `paused` へ入り、後続のステップは実行しない (ADR-0002)。
   * 省略すると止まらない。
   */
  readonly shouldPause?: (() => boolean) | undefined;
}

export interface RunOutcome {
  readonly status: TerminalRunStatus;
  readonly results: readonly StepResult[];
  readonly events: readonly ExecutionEvent[];
}

/** 不応答かどうか。語彙の正本は `errors.ts` に置き、判定を二重に持たない。 */
function unresponsiveReason(error: unknown): string | undefined {
  return isExecutionFailure(error) && error.code === "browser/unresponsive"
    ? error.message
    : undefined;
}

/** 実行を止める理由が出たときの終わり方を 1 箇所に集める。 */
function fail(
  index: number,
  reason: string,
  evaluated: readonly EvaluationResult[],
  results: StepResult[],
  events: ExecutionEvent[],
): RunOutcome {
  results.push({ index, outcome: "failed", evaluated });
  events.push({ kind: "step-failed", index }, { kind: "run-failed", reason });
  return { status: "failed", results, events };
}

interface ReplayInput extends RunOptions {
  readonly fromIndex: number;
  readonly events: ExecutionEvent[];
  readonly results: StepResult[];
}

async function replay(input: ReplayInput): Promise<RunOutcome> {
  const { events, results, runner } = input;
  let lastIndex = input.fromIndex - 1;

  for (const [index, step] of input.steps.entries()) {
    if (index < input.fromIndex) {
      continue;
    }
    events.push({ kind: "step-started", index });

    // 1. 評価。Expectation を持たないステップは評価を省いて必ず実行する。
    let before: readonly EvaluationResult[] = [];
    if (step.expect.length > 0) {
      let observation: Observation;
      try {
        observation = await runner.observe();
      } catch (error) {
        const reason = unresponsiveReason(error);
        if (reason === undefined) {
          throw error;
        }
        return fail(index, reason, [], results, events);
      }
      before = evaluate(step.expect, observation);
      events.push({ kind: "expectation-evaluated", index, phase: "before", results: before });

      // 2. 冪等スキップ。
      if (canSkip(before)) {
        results.push({ index, outcome: "skipped", evaluated: before });
        events.push({ kind: "step-skipped", index });
        lastIndex = index;
        if (input.shouldPause?.() === true) {
          events.push({ kind: "paused", atIndex: lastIndex });
          return { status: "paused", results, events };
        }
        continue;
      }
    }

    // 3. 実行。
    try {
      await runner.perform(step);
    } catch (error) {
      const reason = unresponsiveReason(error);
      if (reason === undefined) {
        throw error;
      }
      // **再作成せず止める。** 再作成はページ状態を失う操作であり、失ったまま
      // 後続を評価すると前提が崩れる。Port の契約は変えず、方針をここで固定する。
      return fail(index, reason, before, results, events);
    }

    // 4. 検証。宣言が無ければ、実行できた時点で成功とする。
    let after: readonly EvaluationResult[] = [];
    if (step.expect.length > 0) {
      let observation: Observation;
      try {
        observation = await runner.observe();
      } catch (error) {
        const reason = unresponsiveReason(error);
        if (reason === undefined) {
          throw error;
        }
        return fail(index, reason, before, results, events);
      }
      after = evaluate(step.expect, observation);
      events.push({ kind: "expectation-evaluated", index, phase: "after", results: after });
      if (!canSkip(after)) {
        // 観測できていない期待状態と、満たさない期待状態を理由の上で区別する。
        const reason = after.some((result) => result.outcome === "unevaluatable")
          ? "実行後の期待状態を評価できません"
          : "実行後も期待状態を満たしません";
        return fail(index, reason, after, results, events);
      }
    }
    results.push({ index, outcome: "executed", evaluated: after });
    events.push({ kind: "step-executed", index });
    lastIndex = index;

    // **pause 予約はステップの完了直後に評価する。** 最終ステップの完了と
    // 予約が重なったときも、この位置で見るため pause が優先される。優先順位が
    // 無いと、ステップが 1 件だけの run で completed に倒れ、記録と rerun_step
    // の両方が成立しない (ADR-0002)。
    if (input.shouldPause?.() === true) {
      events.push({ kind: "paused", atIndex: lastIndex });
      return { status: "paused", results, events };
    }
  }

  events.push({ kind: "run-completed" });
  return { status: "completed", results, events };
}

/** `run.start`。先頭から再生する。 */
export async function runSteps(options: RunOptions): Promise<RunOutcome> {
  return replay({
    ...options,
    fromIndex: 0,
    events: [{ kind: "run-started", irVersion: options.irVersion }],
    results: [],
  });
}

export interface ResumeOptions extends Omit<RunOptions, "shouldPause"> {
  /** 再開時点の IR 版。pause 中に draft が変わっていれば差し替わる。 */
  readonly currentIrVersion: string;
  readonly shouldPause?: (() => boolean) | undefined;
}

/**
 * 差し替えと再開の前置き。
 *
 * IR の版の差し替えは前提の再検証より前に行う。差し替えた後の Expectation で
 * 評価しないと、古い版の期待状態で判断することになる (ADR-0018)。
 */
function resumePrelude(options: ResumeOptions): ExecutionEvent[] {
  const events: ExecutionEvent[] = [];
  if (options.currentIrVersion !== options.irVersion) {
    events.push({
      kind: "ir-version-changed",
      from: options.irVersion,
      to: options.currentIrVersion,
    });
  }
  events.push({ kind: "resumed" });
  return events;
}

/**
 * 一時停止からの再開。
 *
 * 先頭から再生し、満たしているステップは冪等スキップで飛ばす。**過去の
 * StepResult は捨てる** — 全ステップを再生し直すため、すべて作り直される。
 * `run-started` は再開では出さない。1 つの run に 2 度現れると、イベント列から
 * run を再構成したときに別の run に見える。
 */
export async function resumeRun(options: ResumeOptions): Promise<RunOutcome> {
  return replay({
    ...options,
    irVersion: options.currentIrVersion,
    fromIndex: 0,
    events: resumePrelude(options),
    results: [],
  });
}

export interface RerunOptions extends ResumeOptions {
  /** ここから再実行する。 */
  readonly fromIndex: number;
  /**
   * 中断までに積んだ StepResult。`fromIndex` 以降は**無効化して捨てる**。
   * 残すと、再実行で結果が変わったステップに古い結果が残り、履歴が実際の
   * 実行と食い違う。
   */
  readonly previousResults: readonly StepResult[];
}

/** `rerun_step`。指定ステップ以降だけを再生し、手前の結果はそのまま残す。 */
export async function rerunStep(options: RerunOptions): Promise<RunOutcome> {
  return replay({
    ...options,
    irVersion: options.currentIrVersion,
    events: resumePrelude(options),
    results: options.previousResults.filter((result) => result.index < options.fromIndex).slice(),
  });
}

/**
 * イベント列だけから run を組み直す。
 *
 * 実行履歴の正本はイベント列である。ここで `RunOutcome` に戻せることが、
 * 「イベントを読めば run が分かる」ことの検査になる。
 */
export function reconstruct(events: readonly ExecutionEvent[]): {
  readonly status: TerminalRunStatus | undefined;
  readonly results: readonly StepResult[];
} {
  const results: StepResult[] = [];
  const evaluated = new Map<EvaluationPhase, readonly EvaluationResult[]>();
  let status: TerminalRunStatus | undefined;

  for (const event of events) {
    switch (event.kind) {
      case "step-started":
        evaluated.clear();
        break;
      case "expectation-evaluated":
        evaluated.set(event.phase, event.results);
        break;
      case "step-skipped":
        results.push({
          index: event.index,
          outcome: "skipped",
          evaluated: evaluated.get("before") ?? [],
        });
        break;
      case "step-executed":
        results.push({
          index: event.index,
          outcome: "executed",
          evaluated: evaluated.get("after") ?? [],
        });
        break;
      case "step-failed":
        // 失敗は「検証で落ちた」場合と「実行前に止まった」場合がある。後者は
        // after を持たないので before へ落とす。
        results.push({
          index: event.index,
          outcome: "failed",
          evaluated: evaluated.get("after") ?? evaluated.get("before") ?? [],
        });
        break;
      case "paused":
        status = "paused";
        break;
      case "run-completed":
        status = "completed";
        break;
      case "run-failed":
        status = "failed";
        break;
      default:
        break;
    }
  }
  return { status, results };
}
