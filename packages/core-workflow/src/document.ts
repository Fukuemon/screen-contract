import { invalid } from "./errors.js";

/**
 * Screen / Workflow の 2 文書からなる DSL の型と検証。
 *
 * 検証は本リポジトリの `parseX` 規約に揃える。未検証の値を型で弾き、
 * 生成経路を parse に限る (`packages/app` の `parseStoreKey` と同じ考え方)。
 *
 * **語彙は一通り受け付ける。** 実行系が対応していない語彙は正規化で弾く。
 * Schema を段階的に広げると、語彙を足すたびに検証とテストを触ることになる。
 */

/** action の語彙 (workflow-dsl feature の MVP)。 */
export type ActionKind = "open" | "click" | "clickPoint" | "fill" | "hover" | "scroll";

export type Action =
  | { readonly kind: "open"; readonly url: string }
  | { readonly kind: "click"; readonly ref: string }
  | { readonly kind: "clickPoint"; readonly x: number; readonly y: number }
  /**
   * 入力欄を埋める。
   *
   * `value` と `secret` は**排他**である。両方書けると、どちらが使われるか
   * 読み手に決められない (workflow-dsl feature)。`secret` は値を DSL に持たず、
   * 実行時に名前で解決する。
   */
  | { readonly kind: "fill"; readonly ref: string; readonly value: string }
  | { readonly kind: "fill"; readonly ref: string; readonly secret: string }
  | { readonly kind: "hover"; readonly ref: string }
  | { readonly kind: "scroll"; readonly ref: string };

/** Expectation の宣言語彙 (workflow-dsl feature の MVP)。 */
export type Expectation =
  | { readonly kind: "url"; readonly path: string }
  | { readonly kind: "title"; readonly value: string }
  | { readonly kind: "element"; readonly ref: string; readonly visible: boolean }
  | { readonly kind: "count"; readonly ref: string; readonly value: number };

/** step は action を持つか、名前付き断片を展開する。 */
export type Step =
  | { readonly kind: "action"; readonly action: Action; readonly expect: readonly Expectation[] }
  | { readonly kind: "use"; readonly fragment: string };

export interface ElementDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly locator?:
    | { readonly role?: string | undefined; readonly name?: string | undefined }
    | undefined;
  /** 要素が初めて現れる状態。子孫状態へは継承される。 */
  readonly states: readonly string[];
  readonly hiddenIn: readonly string[];
  readonly optional: boolean;
  readonly childDoc?: string | undefined;
}

export interface ScreenState {
  readonly id: string;
  readonly from?: string | undefined;
  readonly steps: readonly Step[];
  readonly expect: readonly Expectation[];
  /** リストの位置がそのまま構成番号になる。要素定義は番号を持たない。 */
  readonly badges: readonly string[];
}

export interface ScreenDocument {
  readonly version: number;
  readonly id: string;
  readonly title: string;
  /** 到達手順。Workflow 文書を参照する。 */
  readonly entryWorkflow: string;
  readonly states: readonly ScreenState[];
  readonly fragments: ReadonlyMap<string, readonly Step[]>;
  readonly elements: readonly ElementDefinition[];
}

export interface WorkflowDocument {
  readonly version: number;
  readonly id: string;
  readonly steps: readonly Step[];
}

const SUPPORTED_VERSION = 1;

function record(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("オブジェクトではありません", at);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, at: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalid("空でない文字列ではありません", at);
  }
  return value;
}

function num(value: unknown, at: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid("数値ではありません", at);
  }
  return value;
}

function list(value: unknown, at: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalid("配列ではありません", at);
  }
  return value;
}

function version(value: unknown, at: string): number {
  const parsed = num(value, at);
  if (parsed !== SUPPORTED_VERSION) {
    throw invalid(`対応していない version です (対応は ${String(SUPPORTED_VERSION)})`, at);
  }
  return parsed;
}

function parseAction(value: unknown, at: string): Action {
  const raw = record(value, at);
  const keys = Object.keys(raw);
  if (keys.length !== 1) {
    throw invalid("action は 1 つの語彙だけを持ちます", at);
  }
  const kind = keys[0] as string;
  const body = raw[kind];
  switch (kind) {
    case "open":
      return { kind: "open", url: str(record(body, `${at}.open`)["url"], `${at}.open.url`) };
    case "click":
      return { kind: "click", ref: str(record(body, `${at}.click`)["ref"], `${at}.click.ref`) };
    case "clickPoint": {
      const point = record(body, `${at}.clickPoint`);
      return {
        kind: "clickPoint",
        x: num(point["x"], `${at}.clickPoint.x`),
        y: num(point["y"], `${at}.clickPoint.y`),
      };
    }
    case "fill": {
      const fill = record(body, `${at}.fill`);
      return {
        kind: "fill",
        ref: str(fill["ref"], `${at}.fill.ref`),
        value: str(fill["value"], `${at}.fill.value`),
      };
    }
    case "hover":
      return { kind: "hover", ref: str(record(body, `${at}.hover`)["ref"], `${at}.hover.ref`) };
    case "scroll":
      return { kind: "scroll", ref: str(record(body, `${at}.scroll`)["ref"], `${at}.scroll.ref`) };
    default:
      throw invalid(`未知の action です: ${kind}`, at);
  }
}

function parseExpectation(value: unknown, at: string): Expectation {
  const raw = record(value, at);
  const keys = Object.keys(raw);
  if (keys.length !== 1) {
    throw invalid("expect の要素は 1 つの語彙だけを持ちます", at);
  }
  const kind = keys[0] as string;
  const body = raw[kind];
  switch (kind) {
    case "url":
      return { kind: "url", path: str(record(body, `${at}.url`)["path"], `${at}.url.path`) };
    case "title":
      return {
        kind: "title",
        value: str(record(body, `${at}.title`)["value"], `${at}.title.value`),
      };
    case "element": {
      const element = record(body, `${at}.element`);
      const visible = element["visible"];
      if (typeof visible !== "boolean") {
        throw invalid("visible が真偽値ではありません", `${at}.element.visible`);
      }
      return { kind: "element", ref: str(element["ref"], `${at}.element.ref`), visible };
    }
    case "count": {
      const count = record(body, `${at}.count`);
      return {
        kind: "count",
        ref: str(count["ref"], `${at}.count.ref`),
        value: num(count["value"], `${at}.count.value`),
      };
    }
    default:
      throw invalid(`未知の Expectation です: ${kind}`, at);
  }
}

function parseStep(value: unknown, at: string): Step {
  const raw = record(value, at);
  if ("use" in raw) {
    return { kind: "use", fragment: str(raw["use"], `${at}.use`) };
  }
  if (!("action" in raw)) {
    throw invalid("step は action か use を持ちます", at);
  }
  const expectRaw = raw["expect"];
  const expect =
    expectRaw === undefined
      ? []
      : list(expectRaw, `${at}.expect`).map((item, i) =>
          parseExpectation(item, `${at}.expect[${String(i)}]`),
        );
  return { kind: "action", action: parseAction(raw["action"], `${at}.action`), expect };
}

function parseSteps(value: unknown, at: string): readonly Step[] {
  return list(value, at).map((item, i) => parseStep(item, `${at}[${String(i)}]`));
}

function parseElement(value: unknown, at: string): ElementDefinition {
  const raw = record(value, at);
  const locatorRaw = raw["locator"];
  const locator =
    locatorRaw === undefined
      ? undefined
      : (() => {
          const l = record(locatorRaw, `${at}.locator`);
          return {
            role: typeof l["role"] === "string" ? l["role"] : undefined,
            name: typeof l["name"] === "string" ? l["name"] : undefined,
          };
        })();
  const childDoc = raw["child_doc"];
  return {
    id: str(raw["id"], `${at}.id`),
    name: str(raw["name"], `${at}.name`),
    type: str(raw["type"], `${at}.type`),
    locator,
    states:
      raw["states"] === undefined
        ? []
        : list(raw["states"], `${at}.states`).map((s, i) => str(s, `${at}.states[${String(i)}]`)),
    hiddenIn:
      raw["hidden-in"] === undefined
        ? []
        : list(raw["hidden-in"], `${at}.hidden-in`).map((s, i) =>
            str(s, `${at}.hidden-in[${String(i)}]`),
          ),
    optional: raw["optional"] === true,
    childDoc: typeof childDoc === "string" ? childDoc : undefined,
  };
}

function parseState(value: unknown, at: string): ScreenState {
  const raw = record(value, at);
  const id = str(raw["id"], `${at}.id`);
  const from = raw["from"];
  if (id !== "default" && from === undefined) {
    // default 以外は from と steps を必ず持つ。持たないと状態木から孤立する。
    throw invalid("default 以外の状態は from を持ちます", `${at}.from`);
  }
  if (id === "default" && from !== undefined) {
    throw invalid("default は遷移元を持ちません", `${at}.from`);
  }
  return {
    id,
    from: from === undefined ? undefined : str(from, `${at}.from`),
    steps: raw["steps"] === undefined ? [] : parseSteps(raw["steps"], `${at}.steps`),
    expect:
      raw["expect"] === undefined
        ? []
        : list(raw["expect"], `${at}.expect`).map((e, i) =>
            parseExpectation(e, `${at}.expect[${String(i)}]`),
          ),
    badges:
      raw["badges"] === undefined
        ? []
        : list(raw["badges"], `${at}.badges`).map((b, i) => str(b, `${at}.badges[${String(i)}]`)),
  };
}

export function parseScreenDocument(value: unknown): ScreenDocument {
  const root = record(value, "screen 文書");
  const screen = record(root["screen"], "screen");
  const entry = record(screen["entry"], "screen.entry");
  const statesRaw = list(screen["states"], "screen.states");
  if (statesRaw.length === 0) {
    throw invalid("状態がありません", "screen.states");
  }
  const states = statesRaw.map((s, i) => parseState(s, `screen.states[${String(i)}]`));
  if (!states.some((s) => s.id === "default")) {
    throw invalid("default 状態がありません", "screen.states");
  }
  const fragmentsRaw = screen["fragments"];
  const fragments = new Map<string, readonly Step[]>();
  if (fragmentsRaw !== undefined) {
    for (const [name, steps] of Object.entries(record(fragmentsRaw, "screen.fragments"))) {
      fragments.set(name, parseSteps(steps, `screen.fragments.${name}`));
    }
  }
  return {
    version: version(root["version"], "version"),
    id: str(screen["id"], "screen.id"),
    title: str(screen["title"], "screen.title"),
    entryWorkflow: str(entry["workflow"], "screen.entry.workflow"),
    states,
    fragments,
    elements: list(screen["elements"], "screen.elements").map((e, i) =>
      parseElement(e, `screen.elements[${String(i)}]`),
    ),
  };
}

export function parseWorkflowDocument(value: unknown): WorkflowDocument {
  const root = record(value, "workflow 文書");
  const workflow = record(root["workflow"], "workflow");
  return {
    version: version(root["version"], "version"),
    id: str(workflow["id"], "workflow.id"),
    steps: parseSteps(workflow["steps"], "workflow.steps"),
  };
}
