import { createStreamConnection, createStreamProxy, type RunState } from "@screen-contract/api";
import type { RunSession, Viewport, ViewportSubscription } from "@screen-contract/app";
import type { MiddlewareHandler } from "hono";
import type { UpgradeWebSocket } from "hono/ws";

/**
 * Stream Proxy の結線。
 *
 * **中継条件は server が持つ run 状態で判定する** (ADR-0008)。client の自称は
 * 要求元の run しか渡せない。
 *
 * **認証を通す前に映像を流さない。** 流すと、トークンを持たない接続へ対象アプリ
 * の画面が届く。
 */
export interface StreamEndpointOptions {
  readonly upgradeWebSocket: UpgradeWebSocket;
  readonly viewport: Viewport | undefined;
  readonly session: RunSession | undefined;
  readonly runState: { current(): RunState | undefined };
  /** listen したあとに決まるトークン。組み立て時点では未定である。 */
  readonly token: () => string;
}

export function createStreamEndpoint(options: StreamEndpointOptions): MiddlewareHandler {
  const { runState, session } = options;
  return options.upgradeWebSocket(() => {
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
          /**
           * 上流 (ブラウザ) への転送。
           *
           * **順序 (解決 → 転送 → 検証) は app が持つ** (ADR-0026)。ここは
           * 転送の手段を渡すだけにする。合成ルートに置くと、記録の規則が
           * 依存検査の効かない場所に入り、単体テストも当たらない (ADR-0023)。
           */
          upstream: {
            send: (input) => {
              if (session === undefined) {
                subscription?.send(input);
                return;
              }
              void session
                .handleInput(input, () => subscription?.send(input))
                .catch(() => {
                  // **黙って捨てない。** 捨てると「操作は効いたのに手順が
                  // 記録されていない」が無音で起きる。中身は出さない。
                  console.error("[viewport] 操作の記録に失敗しました");
                });
            },
          },
          downstream: { send: (payload) => ws.send(payload) },
          runState,
        });
        connection = createStreamConnection({ token: options.token(), proxy });

        // **認証を通す前に映像を流さない。** 流すと、トークンを持たない接続へ
        // 対象アプリの画面が届く。
        void (async () => {
          await authenticated;
          try {
            subscription = await options.viewport?.subscribe((dataUri) => {
              proxy.publishFrame(dataUri);
            });
          } catch (error) {
            // **黙って閉じない。** 原因が server 側にも残らないと、ブラウザが
            // 起動しないのか認証状態が読めないのか分からない。中身は出さない。
            console.error("[viewport] 映像を購読できません", (error as Error).name);
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
}
