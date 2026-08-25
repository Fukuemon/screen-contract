import type { PageInput, InputModifiers } from "@screen-contract/core-execution";
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
  send(input: PageInput): void;
  close(): void;
}

/** CDP の修飾キーはビットフラグ (Alt=1, Ctrl=2, Meta=4, Shift=8)。 */
function cdpModifiers(modifiers: InputModifiers): number {
  return (
    (modifiers.alt ? 1 : 0) |
    (modifiers.ctrl ? 2 : 0) |
    (modifiers.meta ? 4 : 0) |
    (modifiers.shift ? 8 : 0)
  );
}

const POINTER_EVENTS = { down: "mousePressed", up: "mouseReleased", move: "mouseMoved" } as const;
const KEY_EVENTS = { down: "keyDown", up: "keyUp", text: "char" } as const;

/**
 * 中立の入力を実行基盤の語彙へ写す。
 *
 * **この写像を adapter の外へ出さない。** 出すと CDP の語彙が interface 層まで
 * 漏れ、基盤を差し替えられなくなる (ADR-0013)。
 */
export function toAgentBrowserInput(input: PageInput): string {
  const modifiers = cdpModifiers(input.modifiers);
  if (input.kind === "scroll") {
    return JSON.stringify({
      type: "input_mouse",
      eventType: "mouseWheel",
      x: input.x,
      y: input.y,
      button: "none",
      clickCount: 0,
      modifiers,
      deltaX: input.dx,
      deltaY: input.dy,
    });
  }
  if (input.kind === "key") {
    return JSON.stringify({
      type: "input_keyboard",
      eventType: KEY_EVENTS[input.phase],
      ...(input.key === undefined ? {} : { key: input.key }),
      ...(input.text === undefined ? {} : { text: input.text }),
      modifiers,
    });
  }
  return JSON.stringify({
    type: "input_mouse",
    eventType: POINTER_EVENTS[input.phase],
    x: input.x,
    y: input.y,
    button: input.button,
    // 押下だけが「何回目のクリックか」を持つ。離す側に入れると二重に数える。
    clickCount: input.phase === "down" ? 1 : 0,
    modifiers,
  });
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
    send(input: PageInput): void {
      if (socket.readyState !== WebSocket.OPEN) {
        throw new AgentBrowserError("browser/unresponsive", "配信への接続が開いていません");
      }
      socket.send(toAgentBrowserInput(input));
    },
    close: () => socket.close(),
  };
}
