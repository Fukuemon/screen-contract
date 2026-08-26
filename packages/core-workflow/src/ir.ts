import type {
  Action,
  ElementDefinition,
  Expectation,
  ScreenDocument,
  ScreenState,
  Step,
  WorkflowDocument,
} from "./document.js";
import { WorkflowError } from "./errors.js";

/**
 * Workflow IR。検証・参照解決・継承展開を終えた正規化モデル。
 *
 * 版は Schema のバージョンとは別物で、**正規化した IR の内容から決まる値**と
 * する。編集していなければ同じ値になり、1 文字でも変われば別の値になる
 * ([adr/0018](../../../adr/0018-ir-version-pinning.md))。
 */

/** 展開の停止性を守るための上限。循環していなくても多段の展開で件数は急増する。 */
const MAX_FRAGMENT_DEPTH = 8;
const MAX_STEPS = 256;

/** 実行系が対応している語彙。skeleton は open と click だけを通す。 */
const SUPPORTED_ACTIONS = new Set(["open", "click"]);
const SUPPORTED_EXPECTATIONS = new Set(["url", "element"]);

/** ステップの由来。実行イベントや差分を DSL の該当箇所へ逆引きするために持つ。 */
export interface StepOrigin {
  readonly document: "workflow" | "screen";
  readonly documentId: string;
  /** Screen 文書なら遷移先の状態 id。Workflow 文書なら undefined。 */
  readonly stateId?: string | undefined;
  readonly index: number;
}

export interface ExecutionStep {
  readonly action: Action;
  readonly expect: readonly Expectation[];
  readonly origin: StepOrigin;
}

/** 状態ごとに、その状態へ現れる要素と badges を確定させたビュー。 */
export interface StateView {
  readonly id: string;
  readonly from?: string | undefined;
  readonly elementIds: readonly string[];
  readonly badges: readonly string[];
  readonly expect: readonly Expectation[];
}

export interface ScreenIr {
  readonly version: string;
  readonly screenId: string;
  readonly title: string;
  readonly entryWorkflow: string;
  readonly states: readonly StateView[];
  readonly elements: readonly ElementDefinition[];
}

export interface NormalizeInput {
  readonly screen: ScreenDocument;
  readonly workflows: ReadonlyMap<string, WorkflowDocument>;
}

/** 断片を展開して action の列にする。循環と深さと件数を先に検査する。 */
function expand(
  steps: readonly Step[],
  fragments: ReadonlyMap<string, readonly Step[]>,
  seen: readonly string[],
  at: string,
): readonly { readonly step: Extract<Step, { kind: "action" }>; readonly index: number }[] {
  if (seen.length > MAX_FRAGMENT_DEPTH) {
    throw new WorkflowError("ref/too-deep", "断片の入れ子が深すぎます", at);
  }
  const out: { step: Extract<Step, { kind: "action" }>; index: number }[] = [];
  steps.forEach((step, index) => {
    if (step.kind === "action") {
      out.push({ step, index });
      return;
    }
    const fragment = fragments.get(step.fragment);
    if (fragment === undefined) {
      throw new WorkflowError("ref/unresolved", `断片が見つかりません: ${step.fragment}`, at);
    }
    if (seen.includes(step.fragment)) {
      // 自己参照と相互参照は展開前に検出する。展開してから気付くと終わらない。
      throw new WorkflowError("ref/cyclic", `断片が循環しています: ${step.fragment}`, at);
    }
    out.push(
      ...expand(fragment, fragments, [...seen, step.fragment], `${at}.use(${step.fragment})`),
    );
  });
  if (out.length > MAX_STEPS) {
    throw new WorkflowError("ref/too-many-steps", "展開後のステップ数が多すぎます", at);
  }
  return out;
}

/** 状態を default から辿る。循環と孤立をここで検出する。 */
function pathToState(screen: ScreenDocument, target: string): readonly ScreenState[] {
  const byId = new Map(screen.states.map((s) => [s.id, s]));
  const path: ScreenState[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = target;
  while (cursor !== undefined) {
    if (visited.has(cursor)) {
      throw new WorkflowError(
        "ref/cyclic",
        `状態の遷移元が循環しています: ${cursor}`,
        "screen.states",
      );
    }
    visited.add(cursor);
    const state = byId.get(cursor);
    if (state === undefined) {
      throw new WorkflowError("ref/unresolved", `状態が見つかりません: ${cursor}`, "screen.states");
    }
    path.unshift(state);
    cursor = state.from;
  }
  if (path[0]?.id !== "default") {
    throw new WorkflowError(
      "state/orphan",
      `default から辿れない状態です: ${target}`,
      "screen.states",
    );
  }
  return path;
}

/** その状態に現れる要素を継承規則から確定させる。 */
function elementsInState(screen: ScreenDocument, path: readonly ScreenState[]): readonly string[] {
  const ancestors = new Set(path.map((s) => s.id));
  const ids: string[] = [];
  for (const element of screen.elements) {
    // states が空の要素は default から現れる。子孫状態へは自動で引き継がれる。
    const appears = element.states.length === 0 || element.states.some((s) => ancestors.has(s));
    const hidden = element.hiddenIn.some((s) => ancestors.has(s));
    if (appears && !hidden) {
      ids.push(element.id);
    }
  }
  return ids;
}

function assertSupported(step: ExecutionStep): void {
  if (!SUPPORTED_ACTIONS.has(step.action.kind)) {
    // 黙って無視しない。書いたステップが実行されないまま skipped として
    // 記録されうる (workflow-dsl feature)。
    throw new WorkflowError(
      "action/unimplemented",
      `実行系がまだ対応していない action です: ${step.action.kind}`,
      `${step.origin.documentId}[${String(step.origin.index)}]`,
    );
  }
  for (const expectation of step.expect) {
    if (!SUPPORTED_EXPECTATIONS.has(expectation.kind)) {
      throw new WorkflowError(
        "expect/unimplemented",
        `実行系がまだ対応していない Expectation です: ${expectation.kind}`,
        `${step.origin.documentId}[${String(step.origin.index)}]`,
      );
    }
  }
}

function checkReferences(screen: ScreenDocument): void {
  const ids = new Set<string>();
  for (const element of screen.elements) {
    if (ids.has(element.id)) {
      throw new WorkflowError(
        "element/duplicate-id",
        `要素 ID が重複しています: ${element.id}`,
        "screen.elements",
      );
    }
    ids.add(element.id);
  }
  const stateIds = new Set(screen.states.map((s) => s.id));
  for (const element of screen.elements) {
    for (const stateId of [...element.states, ...element.hiddenIn]) {
      if (!stateIds.has(stateId)) {
        throw new WorkflowError(
          "ref/unresolved",
          `状態が見つかりません: ${stateId}`,
          `screen.elements.${element.id}`,
        );
      }
    }
  }
  for (const state of screen.states) {
    for (const badge of state.badges) {
      const element = screen.elements.find((e) => e.id === badge);
      if (element === undefined) {
        throw new WorkflowError(
          "ref/unresolved",
          `badges の要素が見つかりません: ${badge}`,
          `screen.states.${state.id}.badges`,
        );
      }
      // optional と child_doc はバッジを付けない。載せると番号が飛ぶ。
      if (element.optional || element.childDoc !== undefined) {
        throw new WorkflowError(
          "badges/invalid",
          `badges に載せられない要素です: ${badge}`,
          `screen.states.${state.id}.badges`,
        );
      }
    }
    if (new Set(state.badges).size !== state.badges.length) {
      throw new WorkflowError(
        "badges/invalid",
        "badges に重複があります",
        `screen.states.${state.id}.badges`,
      );
    }
  }
}

/**
 * 版を内容から決める。
 *
 * **core は Node の組み込みに依存しない** (全 core が `types: []` の tsconfig を
 * 使う)。暗号学的ハッシュを使わず、FNV-1a を 2 レーン回して 128 bit の値にする。
 * ここで必要なのは秘匿性ではなく「編集していなければ同じ値、1 文字でも変われば
 * 別の値」という同一性であり、衝突の確率が実用上無視できれば足りる
 * ([adr/0018](../../../adr/0018-ir-version-pinning.md))。
 */
function contentVersion(text: string): string {
  let a = 0xcbf2_9ce4_8422_2325n;
  let b = 0x9dc5_bb50_1e94_9d1bn;
  const mask = 0xffff_ffff_ffff_ffffn;
  for (let i = 0; i < text.length; i += 1) {
    const code = BigInt(text.charCodeAt(i));
    a = ((a ^ code) * 0x0000_0100_0000_01b3n) & mask;
    b = ((b ^ (code + BigInt(i))) * 0x0000_0000_0100_0193n) & mask;
  }
  return `${a.toString(16).padStart(16, "0")}${b.toString(16).padStart(16, "0")}`;
}

/**
 * 版の計算に使う正規形。
 *
 * `JSON.stringify` はキーの挿入順をそのまま出す。同じ内容でも順序が違えば別の
 * 文字列になり、編集していないのに版が変わる。キーを並べ替えて安定させる。
 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function normalizeScreen(input: NormalizeInput): ScreenIr {
  checkReferences(input.screen);
  const workflow = input.workflows.get(input.screen.entryWorkflow);
  if (workflow === undefined) {
    throw new WorkflowError(
      "ref/unresolved",
      `entry の Workflow が見つかりません: ${input.screen.entryWorkflow}`,
      "screen.entry.workflow",
    );
  }
  const states = input.screen.states.map((state) => ({
    id: state.id,
    from: state.from,
    elementIds: elementsInState(input.screen, pathToState(input.screen, state.id)),
    badges: state.badges,
    expect: state.expect,
  }));
  const ir = {
    screenId: input.screen.id,
    title: input.screen.title,
    entryWorkflow: input.screen.entryWorkflow,
    states,
    elements: input.screen.elements,
  };
  // 版は内容から決まる値。編集していなければ同じ値になる。
  return { version: contentVersion(canonicalize(ir)), ...ir };
}

/**
 * 対象の画面状態に至るステップ列の平坦化ビュー。
 *
 * `entry → default → … → 対象状態` の順に並べる。core/execution は YAML を
 * 直接読まず、このビューだけを入力に取る。
 */
export function flattenExecutionSteps(
  input: NormalizeInput,
  targetState: string,
): readonly ExecutionStep[] {
  const workflow = input.workflows.get(input.screen.entryWorkflow);
  if (workflow === undefined) {
    throw new WorkflowError(
      "ref/unresolved",
      `entry の Workflow が見つかりません: ${input.screen.entryWorkflow}`,
      "screen.entry.workflow",
    );
  }
  const steps: ExecutionStep[] = [];
  for (const { step, index } of expand(workflow.steps, new Map(), [], `workflow.${workflow.id}`)) {
    steps.push({
      action: step.action,
      expect: step.expect,
      origin: { document: "workflow", documentId: workflow.id, index },
    });
  }
  for (const state of pathToState(input.screen, targetState)) {
    for (const { step, index } of expand(
      state.steps,
      input.screen.fragments,
      [],
      `screen.states.${state.id}.steps`,
    )) {
      steps.push({
        action: step.action,
        expect: step.expect,
        origin: { document: "screen", documentId: input.screen.id, stateId: state.id, index },
      });
    }
  }
  if (steps.length > MAX_STEPS) {
    throw new WorkflowError("ref/too-many-steps", "実行ステップ数が多すぎます", "screen.states");
  }
  for (const step of steps) {
    assertSupported(step);
  }
  return steps;
}
