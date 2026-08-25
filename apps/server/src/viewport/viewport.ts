import { connectStream, type StreamClient } from "@screen-contract/adapter-browser";
import {
  elementAt,
  resolve,
  type BoundingBox,
  type ObservedElement,
  type SemanticLocator,
} from "@screen-contract/core-element";
import type {
  BrowserPort,
  BrowserSession,
  Observation,
  StepRunner,
  StorageState,
} from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";

/** 選択モードで指した要素。 */
interface PickedElement {
  readonly locator: SemanticLocator;
  readonly box: BoundingBox;
  /** 一意に解決できるか。できなければ記録に使えない。 */
  readonly unique: boolean;
  readonly matches: number;
}

export interface ViewportSubscription {
  send(payload: string): void;
  close(): Promise<void>;
}

export interface Viewport {
  /**
   * 映像を購読する。最初の購読でセッションを開き、最後の解除で閉じる。
   *
   * @param onFrame - 1 フレームぶんの data URI
   */
  subscribe(onFrame: (dataUri: string) => void): Promise<ViewportSubscription>;
  navigate(url: string): Promise<void>;
  setSize(size: { readonly width: number; readonly height: number }): Promise<void>;
  captureStorageState(): Promise<StorageState>;
  /** セッションを閉じる。認証プロファイルの切り替えで使う。 */
  reset(): Promise<void>;
  /**
   * 座標を要素へ解決する。
   *
   * 座標は query にすぎない。記録に残すのは Locator であり、viewport を変えると
   * 座標は意味を失うが role+name は解決できる (ADR-0026)。
   */
  resolveAt(point: { readonly x: number; readonly y: number }): Promise<PickedElement | undefined>;
  observe(): Promise<readonly ObservedElement[]>;
  currentUrl(): Promise<string>;
  /** 実行の相手。セッションが無ければ undefined。 */
  runner(): StepRunner | undefined;
}

export interface ViewportOptions {
  readonly browser: BrowserPort;
  /** 最初に開く URL。列挙した origin の先頭を渡す (ADR-0017)。 */
  readonly entryUrl: string;
  /** セッションを開く直前に注入する認証状態 (ADR-0022)。 */
  readonly storageState?: (() => Promise<StorageState | undefined>) | undefined;
}

/**
 * live viewport のセッション。
 *
 * agent-browser のポートを外部へ公開せず、配信を Stream Proxy へ中継する
 * (ADR-0008)。
 */
export function createViewport(options: ViewportOptions): Viewport {
  let session: BrowserSession | undefined;
  let client: StreamClient | undefined;
  let starting: Promise<void> | undefined;
  const listeners = new Set<(dataUri: string) => void>();

  async function start(): Promise<void> {
    const opened = await options.browser.createSession({ kind: "anonymous" });
    session = opened;
    const state = await options.storageState?.();
    if (state !== undefined) {
      // 開いた後に入れても、既に描画された画面は未ログインのままである。
      await opened.restoreStorageState(state);
    }
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
    await opened?.close().catch(() => undefined);
  }

  function required(): BrowserSession {
    const opened = session;
    if (opened === undefined) {
      // 黙って開かない。開くと run の開始が暗黙になる。
      throw new Error("セッションが開いていません");
    }
    return opened;
  }

  return {
    navigate: async (url) => required().perform({ kind: "open", url }),
    setSize: async (size) => required().setViewport(size),
    captureStorageState: () => required().captureStorageState(),
    observe: () => required().observeElements(),
    currentUrl: () => required().currentUrl(),
    reset: stop,

    async resolveAt(point): Promise<PickedElement | undefined> {
      const observed = await required().observeElements();
      const target = elementAt(observed, point.x, point.y);
      if (target === undefined) {
        return undefined;
      }
      const locator = { role: target.role, name: target.name };
      const resolution = resolve(observed, locator);
      return {
        locator,
        box: target.box,
        unique: resolution.kind === "resolved",
        matches: resolution.kind === "ambiguous" ? resolution.matches : 1,
      };
    },

    runner(): StepRunner | undefined {
      const opened = session;
      if (opened === undefined) {
        return undefined;
      }
      return {
        observe: async (): Promise<Observation> => ({
          url: new URL(await opened.currentUrl()).pathname,
          title: "",
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
      // 同時に繋いでも 1 セッションに収める。
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
