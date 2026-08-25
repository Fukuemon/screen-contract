/**
 * Stream Proxy。
 *
 * Web UI は Workflow Server の単一エンドポイントにだけ接続し、server が
 * agent-browser のストリームを中継する。映像フレームの配信と、操作モード時の
 * 入力転送 (逆方向) を同じ経路で行う (ADR-0008)。
 */

// 語彙の正本は app にある。run を保持している側が定め、Stream Proxy は読むだけ。
export type { RunState, StreamMode } from "@screen-contract/app";
import type { RunState } from "@screen-contract/app";
import { parsePageInput, type PageInput } from "@screen-contract/app";

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
export type DiscardReason =
  | "not-paused"
  | "not-operate-mode"
  | "foreign-run"
  | "no-run"
  /** 中継してよい語彙に無い。実行基盤へ任意の JSON を送らせない。 */
  | "bad-input";

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

export function inputKindOf(input: PageInput): InputKind {
  return input.kind === "scroll" ? "scroll" : "operation";
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

/**
 * 上流 (対象ブラウザ) への入力。実行基盤の配信を adapter が包んだもの。
 *
 * **映像と型を分ける。** 1 つの `send` にすると、方向の違う 2 つの値が同じ口を
 * 通り、片方の語彙をもう片方へ渡しても型検査が鳴らない。
 */
export interface InputSink {
  send(input: PageInput): void;
}

/** 下流 (Web UI) への映像。1 フレームぶんの data URI。 */
export interface FrameSink {
  send(frame: string): void;
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
  readonly upstream: InputSink;
  /** Web UI 側への映像配信。 */
  readonly downstream: FrameSink;
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
      function discard(reason: DiscardReason): InputDiscarded {
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

      // **語彙の検査を先に行う。** 中継条件を満たしていても、列挙に無い形は
      // 送らない。組み直したものだけを上流へ渡す。
      const input = parsePageInput(payload);
      if (input === undefined) {
        return discard("bad-input");
      }
      const reason = discardReason(deps.runState.current(), claim, inputKindOf(input));
      if (reason !== undefined) {
        return discard(reason);
      }
      deps.upstream.send(input);
      return undefined;
    },

    discarded: () => [...recent],
    discardedCount: () => total,
  };
}
