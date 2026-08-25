import type { ExecutionErrorCode } from "@screen-contract/core-execution";

/**
 * adapter が投げる失敗。
 *
 * core の型だけを参照する境界のため、基底クラスを core から受け取れない
 * (context/architecture.md)。コードを持つ形を adapter 側で用意し、core は
 * `isExecutionFailure` で構造を見て分岐する。
 */
export class AgentBrowserError extends Error {
  constructor(
    readonly code: ExecutionErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "AgentBrowserError";
  }
}
