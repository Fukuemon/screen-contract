import type { ElementDef, ObservedElement, SemanticLocator } from "@screen-contract/core-element";
import { resolveCoordinate } from "@screen-contract/core-element";
import { resumeRun, type RunOutcome, type StepRunner } from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";
import type { ElementId } from "@screen-contract/domain";

/**
 * 操作の記録。
 *
 * 記録は `paused` の run の枠内で行う。モード切替が一時停止中だけ有効である
 * 以上、記録を始めるには `paused` の run が要る (ADR-0026)。
 * **記録は正本を作らない。** 出力は draft であり、正本への反映は人間の承認を
 * 経る (ADR-0017)。
 */

/** 記録した 1 手。DSL の action 語彙に対応する。 */
export type RecordedAction =
  | { readonly kind: "click"; readonly ref: ElementId }
  | { readonly kind: "clickPoint"; readonly x: number; readonly y: number };

/** 操作の前後で観測した、Expectation の候補になりうる項目。 */
export interface RecordedObservation {
  readonly url: string;
  readonly title: string;
  /** 可視な要素の `ref`。 */
  readonly visibleRefs: readonly ElementId[];
}

export type RecordedExpectation =
  /** `path` は URL のパス部分だけを入れる。全体を入れると origin と query が混ざる。 */
  | { readonly kind: "url"; readonly path: string }
  | { readonly kind: "title"; readonly value: string }
  | { readonly kind: "element"; readonly ref: ElementId; readonly visible: boolean };

export interface RecordedStep {
  readonly action: RecordedAction;
  readonly expect: readonly RecordedExpectation[];
  /** 解決できなかったときに残す注意書き。記録は止めない。 */
  readonly warning?: string | undefined;
}

export interface RecordingDraft {
  /** 記録した steps。遷移元は run の到達状態から決まる。 */
  readonly steps: readonly RecordedStep[];
  /** 記録の途中で新しく起こした要素定義。 */
  readonly newElements: readonly ElementDef[];
  readonly fromState: string;
}

export interface RecordClickInput {
  /**
   * **入力を転送する前に**取得した box 付き要素一覧。
   *
   * 操作後の状態で解決すると、ページが自律的に変化していたときに「解決できない」
   * ではなく**間違った要素へ解決する**。前者は `clickPoint` と警告で気付けるが、
   * 後者は静かに壊れる (ADR-0026)。
   */
  readonly elements: readonly ObservedElement[];
  readonly known: readonly ElementDef[];
  readonly x: number;
  readonly y: number;
  readonly nextId: (locator: SemanticLocator) => ElementId;
}

export interface RecordedClick {
  readonly action: RecordedAction;
  readonly newElement?: ElementDef | undefined;
  readonly warning?: string | undefined;
}

/** 座標を要素へ解決してから記録する。解決できなければ座標のまま残す。 */
export function recordClick(input: RecordClickInput): RecordedClick {
  const resolution = resolveCoordinate(input);
  switch (resolution.kind) {
    case "existing":
      // 既存定義に一致すればその ref を使う。重複定義を作らない。
      return { action: { kind: "click", ref: resolution.ref } };
    case "new":
      return {
        action: { kind: "click", ref: resolution.element.id },
        newElement: resolution.element,
      };
    case "unresolved":
      // 記録の途中で止めない。止めると、解決できない 1 手のために記録全体を
      // 捨てることになる。
      return {
        action: { kind: "clickPoint", x: resolution.x, y: resolution.y },
        warning: resolution.warning,
      };
  }
}

/**
 * Expectation の候補を出す。
 *
 * **操作の前後で変化した項目だけに絞る。** 機械的に条件を起こすと無関係な
 * 要素まで期待状態に入り、壊れやすいステップが量産される (ADR-0026)。
 */
export function expectationCandidates(
  before: RecordedObservation,
  after: RecordedObservation,
): readonly RecordedExpectation[] {
  const candidates: RecordedExpectation[] = [];
  if (before.url !== after.url) {
    candidates.push({ kind: "url", path: after.url });
  }
  if (before.title !== after.title) {
    candidates.push({ kind: "title", value: after.title });
  }
  // Set 化してから回す。重複した ref があると同じ候補が 2 度出る。
  const wasVisible = new Set(before.visibleRefs);
  const isVisible = new Set(after.visibleRefs);
  for (const ref of isVisible) {
    if (!wasVisible.has(ref)) {
      candidates.push({ kind: "element", ref, visible: true });
    }
  }
  for (const ref of wasVisible) {
    if (!isVisible.has(ref)) {
      candidates.push({ kind: "element", ref, visible: false });
    }
  }
  return candidates;
}

/** 座標のクリックを実際にブラウザへ届ける手段。Stream Proxy が包む。 */
export type ForwardInput = (action: RecordedAction) => Promise<void>;

export type SelectExpectations = (
  candidates: readonly RecordedExpectation[],
) => readonly RecordedExpectation[];

export interface ClickInput {
  /**
   * **転送より前に**取得した box 付き要素一覧。
   *
   * 転送を session の内側で行うことで、順序を呼び出し側の約束にしない。
   */
  readonly elements: readonly ObservedElement[];
  readonly x: number;
  readonly y: number;
  readonly nextId: (locator: SemanticLocator) => ElementId;
}

export interface RecordingSession {
  /**
   * 1 手を記録する。**解決 → 転送 → 検証**の順を内側で守る。
   *
   * 転送を外へ出すと、操作後の状態で解決してしまう経路が呼び出し側の書き方
   * 次第で生まれる。そのときは「解決できない」ではなく**間違った要素へ解決**
   * するため、静かに壊れる (ADR-0026)。
   */
  click(
    input: ClickInput,
    forward: ForwardInput,
    observe: () => Promise<RecordedObservation>,
    selected?: SelectExpectations,
  ): Promise<RecordedStep>;
  finish(): RecordingDraft;
}

/** 記録の進行を持つ。到達状態は run の側から渡される。 */
export function startRecording(
  fromState: string,
  known: readonly ElementDef[] = [],
): RecordingSession {
  const steps: RecordedStep[] = [];
  const newElements: ElementDef[] = [];
  // 記録中に起こした定義も既知として扱う。扱わないと、同じ要素を 2 回押した
  // ときに同じ id の定義が 2 件 draft へ入る。
  const byId = new Map(known.map((element) => [element.id, element]));

  return {
    async click(input, forward, observe, selected): Promise<RecordedStep> {
      const before = await observe();
      const resolved = recordClick({ ...input, known: [...byId.values()] });
      if (resolved.newElement !== undefined && !byId.has(resolved.newElement.id)) {
        byId.set(resolved.newElement.id, resolved.newElement);
        newElements.push(resolved.newElement);
      }
      await forward(resolved.action);
      const after = await observe();

      const candidates = expectationCandidates(before, after);
      // 候補のうちどれを採るかは人間が決める。既定は全件で、選択は UI が渡す。
      const step: RecordedStep = {
        action: resolved.action,
        expect: selected === undefined ? candidates : selected(candidates),
        warning: resolved.warning,
      };
      steps.push(step);
      return step;
    },

    finish(): RecordingDraft {
      return { steps: [...steps], newElements: [...newElements], fromState };
    },
  };
}

/**
 * 記録を停止し、記録に使った run を終える。
 *
 * **`resume` して `run-completed` で終える。** 記録は draft を書く操作なので、
 * pause 中に draft が変わる。したがって再開時に IR の版が差し替わり
 * `ir-version-changed` が出る (ADR-0018)。差し替え後の前提再検証では `open` の
 * `url` が満たされたままなので巻き戻しは起きない。
 */
export interface StopRecordingInput {
  readonly session: RecordingSession;
  /** 記録前に固定した IR の版。 */
  readonly irVersion: string;
  /** 記録で draft を書いた後の IR の版。 */
  readonly currentIrVersion: string;
  readonly steps: readonly ExecutionStep[];
  readonly runner: StepRunner;
}

export interface StopRecordingOutcome {
  readonly draft: RecordingDraft;
  readonly run: RunOutcome;
}

export async function stopRecording(input: StopRecordingInput): Promise<StopRecordingOutcome> {
  const draft = input.session.finish();
  const run = await resumeRun({
    steps: input.steps,
    irVersion: input.irVersion,
    currentIrVersion: input.currentIrVersion,
    runner: input.runner,
  });
  return { draft, run };
}
