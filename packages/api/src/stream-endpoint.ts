import { tokensMatch } from "./auth.js";
import type { RelayClaim, StreamProxy } from "./stream.js";

/**
 * Stream Proxy の接続の受け口。
 *
 * **接続後の最初のフレームで認証する。** WebSocket は任意のヘッダを付けられず、
 * トークンを URL の query へ載せると履歴・`Referer`・アクセスログに残る
 * (context/infrastructure.md)。
 */

export type StreamFrame =
  | { readonly kind: "auth"; readonly token: string; readonly runId: string }
  | { readonly kind: "input"; readonly payload: string };

export type StreamRejection = "unauthenticated" | "bad-frame" | "already-authenticated";

export interface StreamConnection {
  /** 1 フレームを受ける。拒否したら理由を返す。 */
  receive(raw: string): StreamRejection | undefined;
  /** 認証を通ったか。通るまで入力を中継しない。 */
  authenticated(): boolean;
}

export interface StreamConnectionDeps {
  readonly token: string;
  readonly proxy: StreamProxy;
}

function parseFrame(raw: string): StreamFrame | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { kind, token, runId, payload } = value as Record<string, unknown>;
  if (kind === "auth" && typeof token === "string" && typeof runId === "string") {
    return { kind, token, runId };
  }
  if (kind === "input" && typeof payload === "string") {
    return { kind, payload };
  }
  return undefined;
}

export function createStreamConnection(deps: StreamConnectionDeps): StreamConnection {
  let claim: RelayClaim | undefined;

  return {
    receive(raw: string): StreamRejection | undefined {
      const frame = parseFrame(raw);
      if (frame === undefined) {
        return "bad-frame";
      }
      if (frame.kind === "auth") {
        if (claim !== undefined) {
          // 2 度目の認証を受けない。受けると、認証後に要求元の run を
          // 差し替えて他人の run へ入力を送れる。
          return "already-authenticated";
        }
        if (!tokensMatch(deps.token, frame.token)) {
          return "unauthenticated";
        }
        claim = { requesterRunId: frame.runId };
        return undefined;
      }
      if (claim === undefined) {
        // 認証前の入力は中継しない。最初のフレームは必ず auth である。
        return "unauthenticated";
      }
      // 中継の可否は Stream Proxy が server 側の run 状態で判定する (ADR-0008)。
      deps.proxy.forwardInput(claim, frame.payload);
      return undefined;
    },

    authenticated: () => claim !== undefined,
  };
}
