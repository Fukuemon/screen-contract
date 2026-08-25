import { AgentBrowserError } from "./error.js";

/**
 * agent-browser のライブ映像ストリームへ繋ぐ。
 *
 * **ポートを外部へ公開しない。** 繋ぐのは Workflow Server だけで、Web UI は
 * server の単一エンドポイントへ繋ぐ (ADR-0008)。
 */

/** 配信されるフレーム。JPEG を base64 で載せた JSON が来る (実測)。 */
interface FramePayload {
  readonly type: string;
  readonly data?: unknown;
}

export interface StreamClient {
  /** 入力を転送する。中継してよいかの判定は core が済ませている。 */
  send(payload: string): void;
  close(): void;
}

export interface ConnectStreamOptions {
  readonly endpoint: string;
  /** 1 フレーム。`<img>` へそのまま入れられる data URI で渡す。 */
  onFrame(dataUri: string): void;
  onClose?: (() => void) | undefined;
}

export function connectStream(options: ConnectStreamOptions): StreamClient {
  const socket = new WebSocket(options.endpoint);

  socket.addEventListener("message", (event) => {
    const { data } = event as { data: unknown };
    if (typeof data !== "string") {
      // バイナリのフレームは来ない (実測)。来ても解釈せず捨てる。
      return;
    }
    let payload: FramePayload;
    try {
      payload = JSON.parse(data) as FramePayload;
    } catch {
      return;
    }
    // status / tabs も同じ経路で来る。フレームだけを取り出す。
    if (payload.type === "frame" && typeof payload.data === "string") {
      options.onFrame(`data:image/jpeg;base64,${payload.data}`);
    }
  });

  socket.addEventListener("close", () => options.onClose?.());
  socket.addEventListener("error", () => options.onClose?.());

  return {
    send(payload: string): void {
      if (socket.readyState !== WebSocket.OPEN) {
        throw new AgentBrowserError("browser/unresponsive", "配信への接続が開いていません");
      }
      socket.send(payload);
    },
    close: () => socket.close(),
  };
}
