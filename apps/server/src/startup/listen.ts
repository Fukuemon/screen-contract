import { serve } from "@hono/node-server";
import type { AuthPolicy } from "@screen-contract/api";
import { compose } from "../compose.js";
import { generateLocalToken } from "./token.js";
import {
  processLifecycleHost,
  startRuntimeFile,
  type LifecycleHost,
  type RuntimeLifecycle,
} from "./runtime-lifecycle.js";

/**
 * listen とプロセスへの結線。
 *
 * **待受アドレスは 127.0.0.1 に固定する。** ループバック以外へ bind しない
 * (ADR-0021 / context/infrastructure.md)。ポートは OS に割り当てさせるため、
 * トークンと接続先ファイルは listen の後に確定する。
 */

const LOOPBACK = "127.0.0.1";

export interface ListenOptions {
  readonly stateDir: string;
  /** 0 なら OS に割り当てさせる。 */
  readonly port?: number | undefined;
  readonly host?: LifecycleHost | undefined;
}

export interface RunningServer {
  readonly port: number;
  readonly token: string;
  /** 実際に bind したアドレス。ループバック限定であることを外から確かめられる。 */
  readonly address: string;
  close(): Promise<void>;
}

export async function listen(options: ListenOptions): Promise<RunningServer> {
  const token = generateLocalToken();
  // policy は関数で渡す。組み立ての時点ではポートが決まっておらず、値で渡すと
  // 未定のまま固定されてしまう。
  let policy: AuthPolicy | undefined;
  const app = compose({ stateDir: options.stateDir, policy: () => policy }).http;

  // listen の完了を待つ。待たずに address() を読むと、ポートが決まる前の
  // null を掴んで接続先を書けない。
  const { server, port, address } = await new Promise<{
    server: ReturnType<typeof serve>;
    port: number;
    address: string;
  }>((resolve, reject) => {
    const started = serve(
      { fetch: app.fetch, hostname: LOOPBACK, port: options.port ?? 0 },
      (info) => {
        started.off("error", reject);
        resolve({ server: started, port: info.port, address: info.address });
      },
    );
    // resolve 後は外す。残すと、運用中に起きた server の error を無効な
    // reject が黙って飲み込み、失敗を観測できなくなる。
    started.once("error", reject);
  });
  policy = { token, port };

  let lifecycle: RuntimeLifecycle;
  try {
    lifecycle = startRuntimeFile(
      options.stateDir,
      { address: LOOPBACK, port, token },
      options.host ?? processLifecycleHost,
    );
  } catch (error) {
    // 接続先を書けなければ、誰も繋げないまま待ち受け続けることになる。
    server.close();
    throw error;
  }

  return {
    port,
    token,
    address,
    close: () =>
      new Promise<void>((resolve, reject) => {
        lifecycle.stop();
        server.close((error) =>
          error === undefined || error === null ? resolve() : reject(error),
        );
      }),
  };
}
