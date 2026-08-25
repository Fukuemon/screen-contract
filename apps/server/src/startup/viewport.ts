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
  /**
   * セッションを開いた直後に注入する認証状態。
   *
   * **開く前に注入する。** 開いた後に入れても、既に描画された画面は未ログイン
   * のままである (ADR-0022)。
   */
  readonly storageState?: (() => Promise<StorageState | undefined>) | undefined;
}

/** 選択モードで指した要素。 */
interface PickedElement {
  readonly locator: SemanticLocator;
  readonly box: BoundingBox;
  /** Locator が一意に解決できるか。できなければ記録に使えない。 */
  readonly unique: boolean;
  readonly matches: number;
}

export interface ViewportSubscription {
  /** 入力を対象セッションへ転送する。中継の可否は core が判定済みである。 */
  send(payload: string): void;
  close(): Promise<void>;
}

export interface Viewport {
  /** 対象を開き直す。列挙外の URL は呼び出し側が弾く (ADR-0017)。 */
  navigate(url: string): Promise<void>;
  /** viewport の寸法を変える。 */
  setSize(size: { readonly width: number; readonly height: number }): Promise<void>;
  /** いまの認証状態を取り出す。保存は呼び出し側が行う。 */
  captureStorageState(): Promise<StorageState>;
  /**
   * 座標を要素へ解決する。
   *
   * **座標は query にすぎない。** 記録に残すのは Semantic Locator (role+name)
   * であり、座標ではない。viewport を変えると座標は意味を失うが、role+name は
   * 解決できる (ADR-0026)。
   */
  resolveAt(point: { readonly x: number; readonly y: number }): Promise<PickedElement | undefined>;
  /** box 付き要素一覧。記録の解決に使う。 */
  observe(): Promise<readonly ObservedElement[]>;
  /** いま開いている URL。記録の Expectation 候補に使う。 */
  currentUrl(): Promise<string>;
  /** 開いているセッションを閉じる。認証プロファイルを切り替えるときに使う。 */
  reset(): Promise<void>;
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
    const state = await options.storageState?.();
    if (state !== undefined) {
      // **開く前に注入する。** 開いた後では既に描画された画面が未ログインのまま。
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
    // close の失敗で呼び出し側を落とさない。既に死んでいることがある。
    await opened?.close().catch(() => undefined);
  }

  function require(): BrowserSession {
    const opened = session;
    if (opened === undefined) {
      // 黙って開かない。開くと run の開始が暗黙になる。
      throw new Error("セッションが開いていません");
    }
    return opened;
  }

  return {
    navigate: async (url) => require().perform({ kind: "open", url }),

    observe: () => require().observeElements(),
    currentUrl: () => require().currentUrl(),

    async resolveAt(point): Promise<PickedElement | undefined> {
      const observed = await require().observeElements();
      const target = elementAt(observed, point.x, point.y);
      if (target === undefined) {
        return undefined;
      }
      const locator = { role: target.role, name: target.name };
      const resolution = resolve(observed, locator);
      return {
        locator,
        box: target.box,
        // 一意にならない Locator を「選べた」と見せない。実行時に別の要素へ
        // 当たる DSL ができる。
        unique: resolution.kind === "resolved",
        matches: resolution.kind === "ambiguous" ? resolution.matches : 1,
      };
    },

    setSize: async (size) => require().setViewport(size),
    captureStorageState: () => require().captureStorageState(),
    reset: stop,

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
