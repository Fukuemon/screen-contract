import { serve, upgradeWebSocket, type WebSocketServerLike } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { RunState } from "@screen-contract/api";
import type { AuthProfileStore } from "@screen-contract/app";
import type { BrowserPort } from "@screen-contract/core-execution";
import { createRunSession, createViewportControl } from "@screen-contract/app";
import { createStreamEndpoint } from "./stream-endpoint.js";
import type { AllowedOrigins, Viewport } from "@screen-contract/app";
import type { AuthPolicy } from "@screen-contract/api";
import { compose } from "../compose.js";
import { createFsWebAssets } from "../serving/web-assets.js";
import { generateLocalToken } from "../startup/token.js";
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
  /**
   * Web UI のビルド成果物のディレクトリ。
   *
   * Web UI は Workflow Server が配信する静的ファイルである
   * (context/infrastructure.md)。渡さないと配信しない。
   */
  readonly webRoot?: string | undefined;
  /** 0 なら OS に割り当てさせる。 */
  readonly port?: number | undefined;
  readonly host?: LifecycleHost | undefined;
  /** run が最初に開く URL。プロダクト設定で列挙した origin の先頭を渡す。 */
  /** 最初に開く URL。列挙の先頭を渡す (ADR-0017)。 */
  readonly entryUrl?: string | undefined;
  /** 実行してよい origin の列挙。UI はここから選ぶ (ADR-0017)。 */
  readonly allowedOrigins?: AllowedOrigins | undefined;
  /** 認証プロファイルの保管。渡さないと認証まわりの endpoint を生やさない。 */
  readonly authProfiles?: AuthProfileStore | undefined;
  /** いま使う認証プロファイルを合成ルートへ伝える。 */
  readonly setActiveProfile?: ((name: string | undefined) => void) | undefined;
  /**
   * live viewport の映像源。
   *
   * 渡さないと viewport は「接続していません」のままになる。**映像の配信に
   * 中継条件は掛からない** (検査が要るのは逆方向の入力転送だけ)。
   */
  readonly viewport?: Viewport | undefined;
  /** ブラウザ実行基盤。**合成ルートが 1 つだけ作って渡す** (ADR-0023)。 */
  readonly browser: BrowserPort;
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

  // **中継条件は server が持つ run 状態で判定する** (ADR-0008)。client の自称は
  // 要求元の run しか渡せない。
  const viewportPort = options.viewport;
  const session =
    viewportPort === undefined
      ? undefined
      : createRunSession({
          // 空文字を渡さない。`new URL("")` が TypeError になり、原因の分から
          // ない 500 として返る。列挙が空なら起動時検査で中止している。
          entryUrl: options.entryUrl ?? viewportPort.entryUrl(),
          runner: () => viewportPort.runner(),
          observe: () => viewportPort.observe(),
          currentUrl: () => viewportPort.currentUrl(),
          warnings: () => viewportPort.authWarnings(),
        });
  const control =
    session === undefined ||
    viewportPort === undefined ||
    options.authProfiles === undefined ||
    options.allowedOrigins === undefined
      ? undefined
      : createViewportControl({
          run: session,
          viewport: viewportPort,
          allowedOrigins: options.allowedOrigins,
          authProfiles: options.authProfiles,
          setActiveProfile: options.setActiveProfile ?? (() => undefined),
        });
  const runState = { current: (): RunState | undefined => session?.relayState() };

  const stream = createStreamEndpoint({
    upgradeWebSocket,
    viewport: options.viewport,
    session,
    runState,
    token: () => policy?.token ?? "",
  });

  const app = compose({
    browser: options.browser,
    stateDir: options.stateDir,
    policy: () => policy,
    stream,
    viewport: control,
    // **トークンは配信する HTML へ埋め込む。** ブラウザは runtime.json を
    // 読めず、URL の query には載せられない (context/infrastructure.md)。
    web:
      options.webRoot === undefined
        ? undefined
        : createFsWebAssets({ root: options.webRoot, token }),
  }).http;

  // listen の完了を待つ。待たずに address() を読むと、ポートが決まる前の
  // null を掴んで接続先を書けない。
  const { server, port, address } = await new Promise<{
    server: ReturnType<typeof serve>;
    port: number;
    address: string;
  }>((resolve, reject) => {
    const started = serve(
      {
        fetch: app.fetch,
        hostname: LOOPBACK,
        port: options.port ?? 0,
        // `noServer: true` を要求される。自前で listen させると、HTTP と
        // WebSocket が別のポートを持つことになる。
        // `ws` の型は `options.noServer` を optional として持つが、
        // adapter 側は必須で要求する。値は `true` で渡している。
        websocket: {
          server: new WebSocketServer({ noServer: true }) as unknown as WebSocketServerLike,
        },
      },
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
