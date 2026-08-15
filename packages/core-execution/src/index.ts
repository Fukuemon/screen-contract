import type { AuthContext, Snapshot } from "@screen-contract/domain";

/** ブラウザ実行基盤を差し替え可能にする Port。実装は adapter/browser (ADR-0013)。 */
export interface BrowserPort {
  /**
   * 認証コンテキストは必須とする。省略できると「認証なし」が既定になるため
   * (ADR-0022)。Storage State の復号と注入は adapter/browser の責務。
   */
  createSession(auth: AuthContext): Promise<BrowserSession>;
}

export interface BrowserSession {
  snapshot(): Promise<Snapshot>;
  close(): Promise<void>;
}

/** 実行時エラーの機械可読コード。認証状態の失効を呼び出し側が判別できるようにする。 */
export type ExecutionErrorCode = "auth/expired";
