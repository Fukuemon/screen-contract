import { connectStream, type StreamClient } from "@screen-contract/adapter-browser";
import type {
  BrowserPort,
  BrowserSession,
  Observation,
  StepRunner,
} from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";

/**
 * live viewport のセッション。
 *
 * Web UI が繋いだときにブラウザのセッションを開き、agent-browser の配信を
 * Stream Proxy へ流す。**agent-browser のポートを外部へ公開しない** — 繋ぐのは
 * Workflow Server だけである (ADR-0008)。
 *
 * 接続が全部切れたらセッションを閉じる。開きっぱなしにすると、画面を閉じた
 * あともブラウザが残る。
 */

export interface ViewportOptions {
  readonly browser: BrowserPort;
  /**
   * 最初に開く URL。
   *
   * **プロダクト設定で列挙した origin の先頭を使う。** 列挙外へ `open` しない
   * (ADR-0017)。列挙が空なら起動時に中止しているため、ここには必ず 1 件ある。
   */
  readonly entryUrl: string;
}

export interface ViewportSubscription {
  /** 入力を対象セッションへ転送する。中継の可否は core が判定済みである。 */
  send(payload: string): void;
  close(): Promise<void>;
}

export interface Viewport {
  subscribe(onFrame: (dataUri: string) => void): Promise<ViewportSubscription>;
  /**
   * 実行の相手。開いているセッションを包む。
   *
   * **セッションが無ければ undefined を返す。** 勝手に開くと、run の開始が
   * 暗黙になり「いつ run が始まったか」が画面から読めなくなる。
   */
  runner(): StepRunner | undefined;
}

export function createViewport(options: ViewportOptions): Viewport {
  let session: BrowserSession | undefined;
  let client: StreamClient | undefined;
  const listeners = new Set<(dataUri: string) => void>();
  let starting: Promise<void> | undefined;

  async function start(): Promise<void> {
    const opened = await options.browser.createSession({ kind: "anonymous" });
    session = opened;
    await opened.perform({ kind: "open", url: options.entryUrl });
    const handle = await opened.stream();
    client = connectStream({
      endpoint: handle.endpoint,
      onFrame: (dataUri) => {
        for (const listener of listeners) {
          listener(dataUri);
        }
      },
    });
  }

  async function stop(): Promise<void> {
    client?.close();
    client = undefined;
    starting = undefined;
    const opened = session;
    session = undefined;
    // close の失敗で呼び出し側を落とさない。既に死んでいることがある。
    await opened?.close().catch(() => undefined);
  }

  return {
    runner(): StepRunner | undefined {
      const opened = session;
      if (opened === undefined) {
        return undefined;
      }
      return {
        observe: async (): Promise<Observation> => ({
          url: new URL(await opened.currentUrl()).pathname,
          title: "",
          // 要素の可視判定は要素定義を知っている層が担う。entry の run は
          // `url` しか見ないため、ここでは空でよい。
          elements: new Map(),
          counts: new Map(),
        }),
        perform: async (step: ExecutionStep): Promise<void> => {
          if (step.action.kind !== "open") {
            throw new Error(`viewport の run が扱えない action です: ${step.action.kind}`);
          }
          await opened.perform({ kind: "open", url: step.action.url });
        },
      };
    },

    async subscribe(onFrame): Promise<ViewportSubscription> {
      listeners.add(onFrame);
      // 同時に繋いできても 1 セッションに収める。人数分開くとブラウザが増える。
      starting ??= start();
      try {
        await starting;
      } catch (error) {
        listeners.delete(onFrame);
        await stop();
        throw error;
      }
      return {
        send: (payload) => client?.send(payload),
        close: async () => {
          listeners.delete(onFrame);
          if (listeners.size === 0) {
            await stop();
          }
        },
      };
    },
  };
}
