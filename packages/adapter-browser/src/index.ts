import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthContext, BrowserPort, BrowserSession } from "@screen-contract/core-execution";
import { resolveCliPath } from "./cli.js";
import { resolveChromeInstall } from "./chrome.js";
import { createSession } from "./session.js";

export { isChromeAvailable, resolveChromeInstall, type ChromeInstall } from "./chrome.js";
export {
  parseCliResponse,
  resolveCliPath,
  runCli,
  type CliOptions,
  type CliResponse,
} from "./cli.js";
export { readObservedElements } from "./session.js";
export { AgentBrowserError } from "./error.js";

/**
 * agent-browser を子プロセスとして駆動する。CLI の呼び出しは本 adapter に閉じる。
 *
 * 認証コンテキストの解決 (Storage State の復号とセッションへの注入) は本 adapter の
 * 責務である ([adr/0022](../../../adr/0022-auth-state-storage.md))。復号した状態を
 * core / app へ渡さない。
 */
export interface AgentBrowserOptions {
  /** 利用者のホーム。ブラウザ本体の置き場を解決するために使う。 */
  readonly home: string;
  /** state と socket を隔離する名前。テストが利用者の状態を触らないようにする。 */
  readonly namespace?: string | undefined;
}

export function createAgentBrowserPort(options: AgentBrowserOptions): BrowserPort {
  const cliPath = resolveCliPath();
  const chrome = resolveChromeInstall(options.home);

  return {
    async createSession(auth: AuthContext): Promise<BrowserSession> {
      if (auth.kind !== "anonymous") {
        // 匿名以外は Storage State の復号が要る。復号を伴わないまま
        // 「認証済みのつもり」で実行させない。
        throw new Error("認証プロファイルを使う実行はまだ実装していません");
      }
      // セッションごとに使い捨ての置き場を作る。要素一覧の取得は注釈
      // スクリーンショットを伴うが、その画像は保存せず捨てる。成果物の
      // 注釈画像と紛らわしく、差分検知の対象を誤らせるためである。
      const discardDir = mkdtempSync(join(tmpdir(), "screen-contract-discard-"));
      const session = createSession(
        {
          cliPath,
          executablePath: chrome.executablePath,
          // セッション名は adapter 内で完結する識別子である。Baseline の鍵とは
          // 別物なので、core の正規化関数を持ち込まない。
          session: `sc-${auth.kind}-${String(process.pid)}`,
          namespace: options.namespace,
        },
        join(discardDir, "discard.png"),
      );
      return {
        ...session,
        async close(): Promise<void> {
          try {
            await session.close();
          } finally {
            rmSync(discardDir, { recursive: true, force: true });
          }
        },
      };
    },
  };
}
