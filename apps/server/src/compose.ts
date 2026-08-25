import { homedir } from "node:os";
import { createAgentBrowserPort } from "@screen-contract/adapter-browser";
import { createFsStore } from "@screen-contract/adapter-store";
import { createAgentHandlers } from "@screen-contract/agent";
import { createApiApp } from "@screen-contract/api";
import { createUseCases } from "@screen-contract/app";
import type { StorePort } from "@screen-contract/app";
import type { BrowserPort } from "@screen-contract/core-execution";

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
}

export function compose(options: ComposeOptions = {}) {
  const browser = options.browser ?? createAgentBrowserPort({ home: homedir() });
  const store = options.store ?? createFsStore();

  const useCases = createUseCases({ browser, store });

  return {
    api: createApiApp(useCases),
    agent: createAgentHandlers(useCases),
  };
}
