import type {
  ElementDef,
  ExecutionEvent,
  RecordedStep,
  ViewportSnapshot,
} from "@screen-contract/api";

/**
 * server の応答を写しへ変換する。
 *
 * **型は server 側 (app) が定める。** ここで写しを作り直すと、ずれても型検査が
 * 鳴らない。実際に、項目が 1 つ欠けただけで画面全体が落ちた。
 *
 * 型を共有してもなお実行時の検証が要る。**古い server プロセスが動いたまま
 * 新しい画面を読む**ことがあり、そのときの応答は現在の型と一致しない。落とす
 * のではなく既定値で補うのは、1 項目のずれで画面全体が使えなくなるのを避ける
 * ためである。
 */

/** 記録した手順。画面は連番を鍵に使うため、server が付けた id を保つ。 */
export type RecordedStepView = RecordedStep & { readonly id: string };
export type ElementDefView = ElementDef;
export type { ViewportSnapshot };

const STATUSES = new Set(["idle", "paused", "completed", "failed"]);

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** 構成番号の並び。server が採番した要素 ID をそのまま保つ。 */
function elementIds(value: unknown): readonly ElementDef["id"][] {
  return Array.isArray(value)
    ? value.filter((item): item is ElementDef["id"] => typeof item === "string")
    : [];
}

/**
 * 期待状態。**画面は `kind` しか読まない。**
 *
 * 中身まで検証しても表示は変わらないため、`kind` の有無だけを見て通す。
 */
function expectationsOf(value: unknown): RecordedStepView["expect"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is RecordedStepView["expect"][number] => typeof record(item)["kind"] === "string",
  );
}

function stepOf(value: unknown, index: number): RecordedStepView | undefined {
  const step = record(value);
  const action = record(step["action"]);
  const id = typeof step["id"] === "string" ? step["id"] : `step-${String(index)}`;
  const expect = expectationsOf(step["expect"]);
  const warning = typeof step["warning"] === "string" ? step["warning"] : undefined;
  if (action["kind"] === "click" && typeof action["ref"] === "string") {
    // `ref` は server が採番した要素 ID である。画面は文字列として扱うだけで、
    // 組み立てには使わない。
    return {
      id,
      action: { kind: "click", ref: action["ref"] as ElementDef["id"] },
      expect,
      warning,
    };
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
    id: element["id"] as ElementDef["id"],
    name: typeof element["name"] === "string" ? element["name"] : element["id"],
    type: typeof element["type"] === "string" ? element["type"] : locator["role"],
    locator: { role: locator["role"], name: locator["name"] },
  };
}

/** 実行イベント。画面は種類しか読まないため、`kind` の有無だけを見る。 */
function eventsOf(value: unknown): readonly ExecutionEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ExecutionEvent => typeof record(item)["kind"] === "string");
}

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
    events: eventsOf(raw["events"]),
    entryUrl: typeof raw["entryUrl"] === "string" ? raw["entryUrl"] : "",
    stateId: typeof raw["stateId"] === "string" ? raw["stateId"] : "",
    steps: Array.isArray(raw["steps"])
      ? raw["steps"].map(stepOf).filter((step): step is RecordedStepView => step !== undefined)
      : [],
    newElements: Array.isArray(raw["newElements"])
      ? raw["newElements"]
          .map(elementOf)
          .filter((element): element is ElementDefView => element !== undefined)
      : [],
    badges: elementIds(raw["badges"]),
    warnings: strings(raw["warnings"]),
  };
}
