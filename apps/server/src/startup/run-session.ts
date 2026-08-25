import type { RunState, StreamMode } from "@screen-contract/api";
import type { ExecutionEvent, StepRunner } from "@screen-contract/core-execution";
import { runSteps } from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";

/**
 * run の保持。
 *
 * **操作モードと記録は `paused` の run の枠内でしか使えない** (ADR-0002 /
 * ADR-0008 / ADR-0026)。したがって「接続」で run を 1 本起こし、pause 予約を
 * 付けて走らせる。1 ステップ (entry への `open`) を終えた時点で `paused` に
 * 入り、そこから操作と記録ができる。
 *
 * **pause の意味論は変えない。** 「実行中ステップの完了後に停止する」ままである。
 */

/**
 * run の写し。**HTTP の応答そのものである。**
 *
 * `ViewportControl` (api 側) は `unknown` を返す契約にしている。interface 層が
 * run の形を知ると、core の語彙が interface へ漏れるためである。
 */
interface RunSnapshot {
  readonly runId: string;
  readonly status: "idle" | "paused" | "completed" | "failed";
  readonly mode: StreamMode;
  readonly recording: boolean;
  readonly events: readonly ExecutionEvent[];
  readonly entryUrl: string;
}

export interface RunSessionOptions {
  readonly entryUrl: string;
  /** 実行の相手。viewport が開いたセッションを包んだもの。 */
  readonly runner: () => StepRunner | undefined;
}

export interface RunSession {
  /** run を起こす。1 ステップ実行して `paused` に入る。 */
  start(): Promise<RunSnapshot>;
  resume(): Promise<RunSnapshot>;
  setMode(mode: StreamMode): RunSnapshot;
  setRecording(recording: boolean): RunSnapshot;
  snapshot(): RunSnapshot;
  /** Stream Proxy の中継条件に使う。**client から渡させない。** */
  relayState(): RunState | undefined;
}

/** run の識別子。skeleton は 1 本しか動かさないため固定する。 */
const RUN_ID = "current";

export function createRunSession(options: RunSessionOptions): RunSession {
  let status: RunSnapshot["status"] = "idle";
  let mode: StreamMode = "view";
  let recording = false;
  let events: readonly ExecutionEvent[] = [];

  function snapshot(): RunSnapshot {
    return { runId: RUN_ID, status, mode, recording, events, entryUrl: options.entryUrl };
  }

  /** entry へ到達する 1 ステップ。ここから記録した steps が積み上がる。 */
  function entrySteps(): readonly ExecutionStep[] {
    return [
      {
        action: { kind: "open", url: options.entryUrl },
        expect: [{ kind: "url", path: new URL(options.entryUrl).pathname }],
        origin: { document: "workflow", documentId: "entry", index: 0 },
      },
    ];
  }

  async function run(pause: boolean): Promise<RunSnapshot> {
    const runner = options.runner();
    if (runner === undefined) {
      // viewport が開いていないと実行の相手がいない。黙って idle に留めない。
      throw new Error("実行するセッションがありません");
    }
    const outcome = await runSteps({
      steps: entrySteps(),
      irVersion: "entry",
      runner,
      // 予約は各ステップの完了直後に見られる (ADR-0002)。
      shouldPause: () => pause,
    });
    events = outcome.events;
    status = outcome.status;
    if (status !== "paused") {
      // 停止していない run で操作モードに留まらせない。
      mode = "view";
      recording = false;
    }
    return snapshot();
  }

  return {
    start: () => run(true),
    resume: () => run(false),

    setMode(next: StreamMode): RunSnapshot {
      // 判定の正本は core にある。ここは保持だけを行う。
      mode = status === "paused" ? next : "view";
      if (mode !== "operate") {
        recording = false;
      }
      return snapshot();
    },

    setRecording(next: RunSnapshot["recording"]): RunSnapshot {
      recording = status === "paused" && mode === "operate" ? next : false;
      return snapshot();
    },

    snapshot,

    relayState(): RunState | undefined {
      return status === "idle" ? undefined : { runId: RUN_ID, paused: status === "paused", mode };
    },
  };
}
