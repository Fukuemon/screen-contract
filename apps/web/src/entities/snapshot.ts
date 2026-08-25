/** run の状態。**server が正本**で、画面はこの写しだけを持つ。 */
export interface ViewportSnapshot {
  readonly runId: string;
  readonly status: "idle" | "paused" | "completed" | "failed";
  readonly mode: "view" | "operate";
  readonly recording: boolean;
  readonly entryUrl: string;
  /** 構成番号が属する画面状態。**番号は画面ごとに別である** (ADR-0005)。 */
  readonly stateUrl: string;
  readonly steps: readonly RecordedStepView[];
  readonly newElements: readonly ElementDefView[];
  /** 構成番号順の要素 ID。位置がそのまま番号になる (ADR-0005)。 */
  readonly badges: readonly string[];
}

export interface RecordedStepView {
  readonly id: string;
  readonly action:
    | { readonly kind: "click"; readonly ref: string }
    | { readonly kind: "clickPoint"; readonly x: number; readonly y: number };
  readonly expect: readonly { readonly kind: string }[];
  readonly warning?: string | undefined;
}

export interface ElementDefView {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly locator: { readonly role: string; readonly name: string };
}

const STATUSES = new Set(["idle", "paused", "completed", "failed"]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function stepOf(value: unknown, index: number): RecordedStepView | undefined {
  const step = record(value);
  const action = record(step["action"]);
  const id = typeof step["id"] === "string" ? step["id"] : `step-${String(index)}`;
  const expect = Array.isArray(step["expect"])
    ? step["expect"].map((item) => {
        const kind = record(item)["kind"];
        return { kind: typeof kind === "string" ? kind : "" };
      })
    : [];
  const warning = typeof step["warning"] === "string" ? step["warning"] : undefined;
  if (action["kind"] === "click" && typeof action["ref"] === "string") {
    return { id, action: { kind: "click", ref: action["ref"] }, expect, warning };
  }
  if (
    action["kind"] === "clickPoint" &&
    typeof action["x"] === "number" &&
    typeof action["y"] === "number"
  ) {
    return { id, action: { kind: "clickPoint", x: action["x"], y: action["y"] }, expect, warning };
  }
  return undefined;
}

function elementOf(value: unknown): ElementDefView | undefined {
  const element = record(value);
  const locator = record(element["locator"]);
  if (
    typeof element["id"] !== "string" ||
    typeof locator["role"] !== "string" ||
    typeof locator["name"] !== "string"
  ) {
    return undefined;
  }
  return {
    id: element["id"],
    name: typeof element["name"] === "string" ? element["name"] : element["id"],
    type: typeof element["type"] === "string" ? element["type"] : locator["role"],
    locator: { role: locator["role"], name: locator["name"] },
  };
}

/**
 * server の応答を写しへ変換する。
 *
 * **形を信用しない。** 応答の型は server 側で定義され、ここは手で写している。
 * ずれても型検査は鳴らないため、境界で補う。補わないと、項目が 1 つ欠けた
 * だけで画面全体が落ちる (server を入れ替えた直後に実際に起きた)。
 */
export function parseSnapshot(value: unknown): ViewportSnapshot {
  const raw = record(value);
  const status = raw["status"];
  const mode = raw["mode"];
  return {
    runId: typeof raw["runId"] === "string" ? raw["runId"] : "current",
    status:
      typeof status === "string" && STATUSES.has(status)
        ? (status as ViewportSnapshot["status"])
        : "idle",
    mode: mode === "operate" ? "operate" : "view",
    recording: raw["recording"] === true,
    entryUrl: typeof raw["entryUrl"] === "string" ? raw["entryUrl"] : "",
    stateUrl: typeof raw["stateUrl"] === "string" ? raw["stateUrl"] : "",
    steps: Array.isArray(raw["steps"])
      ? raw["steps"].map(stepOf).filter((step): step is RecordedStepView => step !== undefined)
      : [],
    newElements: Array.isArray(raw["newElements"])
      ? raw["newElements"]
          .map(elementOf)
          .filter((element): element is ElementDefView => element !== undefined)
      : [],
    badges: strings(raw["badges"]),
  };
}
