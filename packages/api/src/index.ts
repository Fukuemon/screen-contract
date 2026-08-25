/**
 * interface 層 (web) が使う型の窓口。
 *
 * web は core / domain へ直接依存できない (context/architecture.md)。実行
 * イベントのように表示へ要る型は、api が型として中継する。
 */
export type {
  ApprovalRequest,
  ApprovalResult,
  ExecutionEvent,
  RecordedStep,
} from "@screen-contract/app";

export {
  createHttpApp,
  type HttpAppOptions,
  type ViewportControl,
  type WebAssets,
} from "./http.js";
export {
  createStreamConnection,
  type StreamConnection,
  type StreamConnectionDeps,
  type StreamFrame,
  type StreamRejection,
} from "./stream-endpoint.js";
export {
  isAllowedHost,
  isAllowedOrigin,
  rejectRequest,
  tokensMatch,
  type AuthInput,
  type AuthPolicy,
  type AuthRejection,
  type OriginPolicy,
} from "./auth.js";
export {
  createStreamProxy,
  discardReason,
  type DiscardReason,
  type InputDiscarded,
  type RelayClaim,
  type RunState,
  type RunStateSource,
  type StreamMode,
  type StreamProxy,
  type StreamProxyDeps,
  type StreamSink,
} from "./stream.js";

import { parseStartRunInput, type UseCases } from "@screen-contract/app";

/**
 * HTTP 層が公開する操作。
 *
 * use case を戻り値へ出さない。出すと認可の掛け所が無くなり、この値を得た
 * 任意のコードが use case へ直接届く (ADR-0021 は認可を interface 層に閉じると定める)。
 */
export interface ApiApp {
  /** 受け取るのは検証前の外部入力である。型を信用しない。 */
  startRun(raw: unknown): Promise<void>;
}

/** listen しない。プロセスにするのは合成ルート (ADR-0023)。 */
export function createApiApp(useCases: UseCases): ApiApp {
  return {
    async startRun(raw: unknown): Promise<void> {
      // 認可はここに入る。ローカルトークンの検証と Origin 検査を通してから
      // use case を呼ぶ (ADR-0021 / context/infrastructure.md)。
      // framework は Hono に確定しており (ADR-0024)、認可はそのミドルウェアとして
      // 実装する。**未確定だから保留しているのではない。**

      // 外部入力は必ず parseStartRunInput を通す。branded type は実行時の
      // 保証を持たないため、型アサーションで持ち上げると未検証の文字列が
      // 保存先のパス組み立てまで届く。
      await useCases.startRun(parseStartRunInput(raw));
    },
  };
}
