import { serve, upgradeWebSocket, type WebSocketServerLike } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createStreamConnection, createStreamProxy, type RunState } from "@screen-contract/api";
import type { Viewport, ViewportSubscription } from "./viewport.js";
import type { AuthPolicy } from "@screen-contract/api";
import { compose } from "../compose.js";
import { createFsWebAssets } from "./web-assets.js";
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
  /** 中継条件の判定に使う run の状態。渡さないと入力はすべて破棄される。 */
  readonly runState?: (() => RunState | undefined) | undefined;
  /**
   * live viewport の映像源。
   *
   * 渡さないと viewport は「接続していません」のままになる。**映像の配信に
   * 中継条件は掛からない** (検査が要るのは逆方向の入力転送だけ)。
   */
  readonly viewport?: Viewport | undefined;
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

  /**
   * Stream Proxy の結線。
   *
   * **中継条件は server 側の run 状態で判定する** (ADR-0008)。skeleton では
   * run を保持する層がまだ無いため、常に「run が無い」を返す。結果として
   * 入力はすべて `no-run` として破棄され、**素通しにはならない**。
   */
  const runState = { current: (): RunState | undefined => options.runState?.() };

  const stream = upgradeWebSocket((c) => {
    void c;
    let connection: ReturnType<typeof createStreamConnection> | undefined;
    let subscription: ViewportSubscription | undefined;
    // **接続ごとに持つ。** 共有すると、1 本目が認証を通しただけで 2 本目にも
    // 映像が流れる。
    let resolveAuthenticated = (): void => undefined;
    const authenticated = new Promise<void>((resolve) => {
      resolveAuthenticated = resolve;
    });
    return {
      onOpen: (_event, ws) => {
        const proxy = createStreamProxy({
          // 上流 (ブラウザ) への転送。viewport を繋いでいなければ捨てる。
          upstream: { send: (payload) => subscription?.send(payload) },
          downstream: { send: (payload) => ws.send(payload) },
          runState,
        });
        connection = createStreamConnection({ token: policy?.token ?? "", proxy });

        // **認証を通す前に映像を流さない。** 流すと、トークンを持たない接続へ
        // 対象アプリの画面が届く。
        void (async () => {
          await authenticated;
          try {
            subscription = await options.viewport?.subscribe((dataUri) => {
              proxy.publishFrame(dataUri);
            });
          } catch {
            ws.close(1011, "viewport unavailable");
          }
        })();
      },
      onMessage: (event, ws) => {
        const raw = typeof event.data === "string" ? event.data : "";
        // **最初のフレームで認証する。** 通らなければ接続を閉じる。
        if (connection === undefined || connection.receive(raw) !== undefined) {
          ws.close(1008, "rejected");
          return;
        }
        if (connection.authenticated()) {
          resolveAuthenticated();
        }
      },
      onClose: () => {
        void subscription?.close();
        subscription = undefined;
      },
    };
  });

  const app = compose({
    stateDir: options.stateDir,
    policy: () => policy,
    stream,
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
