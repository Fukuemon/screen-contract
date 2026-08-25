import { homedir } from "node:os";
import { createAgentBrowserPort } from "@screen-contract/adapter-browser";
import { createFsStore } from "@screen-contract/adapter-store";
import { createAgentHandlers } from "@screen-contract/agent";
import { createApiApp, createHttpApp, type AuthPolicy, type WebAssets } from "@screen-contract/api";
import { createUseCases } from "@screen-contract/app";
import type { StorePort } from "@screen-contract/app";
import type { BrowserPort } from "@screen-contract/core-execution";
import type { MiddlewareHandler } from "hono";

/**
 * 合成ルートの入口。adapter の具象を選ぶ唯一の場所である (ADR-0023)。
 *
 * Port を差し替えられるのは、E2E で Browser Port を fake へ置き換えるため
 * (context/testing.md)。差し替えを引数にすることで、app と api と agent に
 * テスト専用の分岐が入らない。
 */
export interface ComposeOptions {
  readonly browser?: BrowserPort;
  readonly store?: StorePort;
  /**
   * 保存先のルート。**必須とする。** 省略を許すと、`ensureStateDir` の 4 つの
   * 検査 (絶対パス / realpath / リポジトリ配下でない / 0700) を通っていない
   * 置き場へ書ける。テストが素で呼べば利用者の実際の状態を触る。
   */
  readonly stateDir: string;
  /**
   * 待受ポートとトークン。**listen した後でなければ決まらない。**
   * ポートを OS に割り当てさせる以上、組み立ての時点では未定である。
   */
  readonly policy?: () => AuthPolicy | undefined;
  /** Stream Proxy の WebSocket を結線する middleware。合成ルートが選ぶ。 */
  readonly stream?: MiddlewareHandler | undefined;
  /** Web UI の配信。実体の読み込みは合成ルートが渡す。 */
  readonly web?: WebAssets | undefined;
}

export function compose(options: ComposeOptions) {
  const browser = options.browser ?? createAgentBrowserPort({ home: homedir() });
  const store = options.store ?? createFsStore({ root: options.stateDir });

  const useCases = createUseCases({ browser, store });

  return {
    api: createApiApp(useCases),
    agent: createAgentHandlers(useCases),
    http: createHttpApp({
      useCases,
      policy: options.policy ?? (() => undefined),
      stream: options.stream,
      web: options.web,
    }),
  };
}
