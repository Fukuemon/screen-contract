import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AuthContext,
  BrowserPort,
  BrowserSession,
  StorageState,
  StreamRelay,
} from "@screen-contract/core-execution";
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
export { AgentBrowserError } from "./error.js";
export {
  connectStream,
  toAgentBrowserInput,
  type ConnectStreamOptions,
  type StreamClient,
} from "./stream.js";
import { connectStream } from "./stream.js";

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
  /**
   * 認証コンテキストから Storage State を引く。
   *
   * **復号した状態を core / app へ渡さないための口である** (ADR-0022)。復号は
   * 保管側 (adapter/store) が担うが、adapter 同士は直接依存できないため、合成
   * ルートが関数として渡す。渡さないと匿名でしか開けない。
   */
  readonly resolveStorageState?:
    | ((auth: AuthContext) => Promise<StorageState | undefined>)
    | undefined;
}

/** セッション名の連番。同じ名前を使い回さないために持つ。 */
let sequence = 0;

export function createAgentBrowserPort(options: AgentBrowserOptions): BrowserPort {
  const cliPath = resolveCliPath();
  const chrome = resolveChromeInstall(options.home);

  return {
    async createSession(auth: AuthContext): Promise<BrowserSession> {
      // **復号した状態を core / app へ渡さない** (ADR-0022)。解決も注入も
      // adapter の中で完結させる。
      const storageState = await options.resolveStorageState?.(auth);
      if (auth.kind !== "anonymous" && storageState === undefined) {
        // 匿名以外は Storage State が要る。中身を伴わないまま「認証済みのつもり」
        // で実行させない (ADR-0022)。
        throw new Error("認証プロファイルの Storage State を解決できません");
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
          //
          // **作るたびに違う名前にする。** 同じ名前だと、閉じた直後に開き直す
          // ときに前のセッションの後始末と競合する (認証プロファイルの切り替え
          // で実際に起きた)。
          session: `sc-${auth.kind}-${String(process.pid)}-${String((sequence += 1))}`,
          namespace: options.namespace,
        },
        join(discardDir, "discard.png"),
      );
      // **対象を開く前に注入する** (ADR-0022)。開いた後に入れても、既に描画
      // された画面は未ログインのままである。
      const restored =
        storageState === undefined
          ? { skippedKeys: [] }
          : await session.restoreStorageState(storageState);
      // 配信の relay はセッションに属する。閉じ忘れを防ぐため `close()` で
      // 一緒に閉じる。
      let relay: StreamRelay | undefined;
      return {
        ...session,
        // 注入で入らなかったものを覚えておく。呼び出し側が黙って進まないため。
        restoreReport: () => restored,
        async connect(onFrame: (dataUri: string) => void): Promise<StreamRelay> {
          const opened = connectStream({ endpoint: await session.streamEndpoint(), onFrame });
          relay = opened;
          return opened;
        },
        async close(): Promise<void> {
          try {
            relay?.close();
            await session.close();
          } finally {
            rmSync(discardDir, { recursive: true, force: true });
          }
        },
      };
    },
  };
}
