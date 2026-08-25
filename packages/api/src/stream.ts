/**
 * Stream Proxy。
 *
 * Web UI は Workflow Server の単一エンドポイントにだけ接続し、server が
 * agent-browser のストリームを中継する。映像フレームの配信と、操作モード時の
 * 入力転送 (逆方向) を同じ経路で行う (ADR-0008)。
 */

export type StreamMode = "view" | "operate";

/**
 * server が保持している run の状態。
 *
 * **client から渡させない。** 渡させると、client が `paused: true` を自称する
 * だけで中継条件が全通し、ADR-0008 が塞いだはずの迂回がそのまま再現する。
 */
export interface RunState {
  readonly runId: string;
  readonly paused: boolean;
  readonly mode: StreamMode;
}

/** client が名乗った主張。信用しない値はここにだけ入る。 */
export interface RelayClaim {
  readonly requesterRunId: string;
}

/** 対象 run の状態を server 側から引く。合成ルートが注入する。 */
export interface RunStateSource {
  current(): RunState | undefined;
}

/**
 * 破棄の理由。ADR-0008 が定める 3 条件と 1 対 1 に対応する。
 *
 * **実行イベント列へ混ぜない。** 実行イベントは run 単位で発行順序が決定的
 * だが、破棄は Stream Proxy で起き、`foreign-run` では結びつける run が
 * 定まらない。api から core の語彙のイベントを起こす形は依存方向の規約とも
 * 擦れる。これは Stream Proxy 側の語彙である。
 */
export type DiscardReason = "not-paused" | "not-operate-mode" | "foreign-run" | "no-run";

export interface InputDiscarded {
  readonly kind: "input-discarded";
  readonly reason: DiscardReason;
  /** 要求元が名乗った run。`foreign-run` では対象 run と一致しない。 */
  readonly requesterRunId: string;
}

/**
 * 中継してよいかを判定する。
 *
 * **client 側の制御だけでは規則にならない。** 認証を通したクライアントは
 * Proxy へ直接送れるため、UI の制御は迂回できる (ADR-0008)。
 */
/**
 * 入力の種類。**payload を server が読んで決める。** client には名乗らせない。
 *
 * スクロールは要素選択の前提であり、画面の外にある要素へ届くために要る。
 * 操作モードを要求すると、選択モードで下端の要素を選べない。
 */
export type InputKind = "scroll" | "operation";

export function inputKindOf(payload: string): InputKind {
  try {
    const value: unknown = JSON.parse(payload);
    return typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>)["eventType"] === "mouseWheel"
      ? "scroll"
      : "operation";
  } catch {
    return "operation";
  }
}

export function discardReason(
  state: RunState | undefined,
  claim: RelayClaim,
  kind: InputKind = "operation",
): DiscardReason | undefined {
  if (state === undefined) {
    return "no-run";
  }
  // 要求元の確認を先に行う。他人の run への入力は、その run が paused かどうか
  // 以前に中継しない (他人の run の状態を漏らさない)。
  if (claim.requesterRunId !== state.runId) {
    return "foreign-run";
  }
  if (!state.paused) {
    return "not-paused";
  }
  if (kind === "operation" && state.mode !== "operate") {
    return "not-operate-mode";
  }
  return undefined;
}

/** 中継先。agent-browser の WebSocket を adapter が包んだもの。 */
export interface StreamSink {
  send(payload: string): void;
}

export interface StreamProxy {
  /** 映像フレームを Web UI へ流す。中継条件の検査は掛からない (方向が逆)。 */
  publishFrame(frame: string): void;
  /** 入力を対象セッションへ転送する。破棄したら理由を返す。 */
  forwardInput(claim: RelayClaim, payload: string): InputDiscarded | undefined;
  /** 直近の破棄。黙って捨てると UI の不具合と迂回の試みを区別できない。 */
  discarded(): readonly InputDiscarded[];
  /** 破棄の総数。直近だけを残すため、件数は別に数える。 */
  discardedCount(): number;
}

export interface StreamProxyDeps {
  /** ブラウザ側への入力転送。 */
  readonly upstream: StreamSink;
  /** Web UI 側への映像配信。 */
  readonly downstream: StreamSink;
  /** 中継条件の判定に使う、server 側の run 状態。 */
  readonly runState: RunStateSource;
}

/**
 * 破棄の記録の保持数。
 *
 * 破棄は「UI の不具合」か「迂回の試み」で起き、後者は意図的に大量発生させ
 * られる。上限が無いとメモリを伸ばし放題になる。
 */
const MAX_DISCARDED = 128;

export function createStreamProxy(deps: StreamProxyDeps): StreamProxy {
  const recent: InputDiscarded[] = [];
  let total = 0;

  return {
    publishFrame(frame: string): void {
      deps.downstream.send(frame);
    },

    forwardInput(claim: RelayClaim, payload: string): InputDiscarded | undefined {
      const reason = discardReason(deps.runState.current(), claim, inputKindOf(payload));
      if (reason !== undefined) {
        const event: InputDiscarded = {
          kind: "input-discarded",
          reason,
          requesterRunId: claim.requesterRunId,
        };
        total += 1;
        recent.push(event);
        if (recent.length > MAX_DISCARDED) {
          recent.shift();
        }
        return event;
      }
      deps.upstream.send(payload);
      return undefined;
    },

    discarded: () => [...recent],
    discardedCount: () => total,
  };
}
