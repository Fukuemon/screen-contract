import type { BrowserPort, BrowserSession } from "@screen-contract/core-execution";
import type { AuthContext } from "@screen-contract/domain";

/**
 * agent-browser を子プロセスとして駆動する。CLI の呼び出しは本 adapter に閉じる。
 *
 * 認証コンテキストの解決 (Storage State の復号とセッションへの注入) は本 adapter の
 * 責務である (ADR-0022)。復号した状態を core / app へ渡さない。
 */
export function createAgentBrowserPort(): BrowserPort {
  return {
    async createSession(_auth: AuthContext): Promise<BrowserSession> {
      throw new Error("not implemented");
    },
  };
}
