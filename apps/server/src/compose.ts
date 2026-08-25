import { createFsStore } from "@screen-contract/adapter-store";
import { createHttpApp, type AuthPolicy, type WebAssets } from "@screen-contract/api";
import { createUseCases } from "@screen-contract/app";
import type { StorePort, ViewportControl } from "@screen-contract/app";
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
  /**
   * ブラウザ実行基盤。**必須とする。**
   *
   * 省略を許すとここでも具象を作れてしまい、選択点が 2 箇所へ割れる
   * (ADR-0023 は「唯一の場所」と定める)。1 プロセスに 2 つの実装が立ち、
   * E2E で fake へ差し替えても片方にしか届かない (context/testing.md)。
   */
  readonly browser: BrowserPort;
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
  /** live viewport の run。 */
  readonly viewport?: ViewportControl | undefined;
}

export function compose(options: ComposeOptions) {
  const store = options.store ?? createFsStore({ root: options.stateDir });

  const useCases = createUseCases({ browser: options.browser, store });

  // **使わないものを組み立てない。** 組み立てた時点で「使っている」ように
  // 読めるが、`createApiApp` は `/runs` と同じ処理を二重に持つだけで誰も
  // 呼んでいない。JSON-RPC の入口を生やすときに、そこで組み立てる。
  return {
    http: createHttpApp({
      useCases,
      policy: options.policy ?? (() => undefined),
      stream: options.stream,
      web: options.web,
      viewport: options.viewport,
    }),
  };
}
