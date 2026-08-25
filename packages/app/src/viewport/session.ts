import {
  elementAt,
  resolve,
  type BoundingBox,
  type ObservedElement,
  type SemanticLocator,
} from "@screen-contract/core-element";
import type {
  AuthContext,
  BrowserPort,
  BrowserSession,
  ConsoleMessage,
  Observation,
  StepRunner,
  StorageState,
  StreamRelay,
} from "@screen-contract/core-execution";
import type { ExecutionStep } from "@screen-contract/core-workflow";
import { ConflictError, ValidationError } from "../errors.js";

/** 選択モードで指した要素。 */
export interface PickedElement {
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
  /**
   * セッションを開き直す。認証プロファイルの切り替えで使う。
   *
   * 購読者が居れば新しいセッションで張り直す。落としたままにすると、誰も
   * 開き直さないため映像が二度と来ない。
   */
  reset(): Promise<void>;
  /**
   * 座標を要素へ解決する。
   *
   * 座標は query にすぎない。記録に残すのは Locator であり、viewport を変えると
   * 座標は意味を失うが role+name は解決できる (ADR-0026)。
   */
  resolveAt(point: { readonly x: number; readonly y: number }): Promise<PickedElement | undefined>;
  observe(): Promise<readonly ObservedElement[]>;
  /** 対象ページのコンソール出力。 */
  consoleMessages(): Promise<readonly ConsoleMessage[]>;
  /**
   * 認証状態の注入で入らなかったもの。
   *
   * **黙って進まない。** 入ったつもりで未ログインの画面を撮ると、その差分が
   * 仕様の変更として記録される (ADR-0022)。
   */
  authWarnings(): readonly string[];
  currentUrl(): Promise<string>;
  /** 実行の相手。セッションが無ければ undefined。 */
  runner(): StepRunner | undefined;
}

export interface ViewportOptions {
  readonly browser: BrowserPort;
  /** 最初に開く URL。列挙した origin の先頭を渡す (ADR-0017)。 */
  readonly entryUrl: string;
  /**
   * いま誰として実行しているか。
   *
   * **保存の鍵と Baseline の識別に入る** (ADR-0022)。匿名を名乗ったまま
   * 認証状態を注入すると、認証済みの結果が匿名の Baseline へ混ざる。
   */
  readonly auth?: (() => AuthContext) | undefined;
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
  let relay: StreamRelay | undefined;
  let starting: Promise<void> | undefined;
  const listeners = new Set<(dataUri: string) => void>();

  async function start(): Promise<void> {
    // 注入は Port の中で行う。開いた後に入れても、既に描画された画面は
    // 未ログインのままである (ADR-0022)。
    const opened = await options.browser.createSession({
      auth: options.auth?.() ?? { kind: "anonymous" },
      storageState: await options.storageState?.(),
    });
    session = opened;
    await opened.perform({ kind: "open", url: options.entryUrl });
    relay = options.browser.connect(await opened.stream(), (dataUri) => {
      for (const listener of listeners) {
        listener(dataUri);
      }
    });
  }

  async function stop(): Promise<void> {
    relay?.close();
    relay = undefined;
    starting = undefined;
    const opened = session;
    session = undefined;
    await opened?.close().catch(() => undefined);
  }

  function required(): BrowserSession {
    const opened = session;
    if (opened === undefined) {
      // 黙って開かない。開くと run の開始が暗黙になる。**入力の誤りではない。**
      throw new ConflictError("セッションが開いていません");
    }
    return opened;
  }

  return {
    navigate: async (url) => required().perform({ kind: "open", url }),

    authWarnings(): readonly string[] {
      const report = session?.restoreReport();
      return report === undefined || report.reason === undefined ? [] : [report.reason];
    },

    setSize: async (size) => required().setViewport(size),
    captureStorageState: () => required().captureStorageState(),
    observe: () => required().observeElements(),
    consoleMessages: () => required().consoleMessages(),
    currentUrl: () => required().currentUrl(),
    async reset(): Promise<void> {
      const hadListeners = listeners.size > 0;
      await stop();
      if (hadListeners) {
        starting = start();
        await starting;
      }
    },

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
            throw new ValidationError(
              `viewport の run が扱えない action です: ${step.action.kind}`,
            );
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
        send: (payload) => relay?.send(payload),
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

/**
 * 実行してよい寸法か。
 *
 * **0 以下や桁外れを対象へ渡さない。** 渡すと実行基盤側で失敗し、原因が
 * 読めない。下限は responsive の最小分岐より小さい値、上限は現実的な画面幅。
 */
export function isValidViewport(size: {
  readonly width: number;
  readonly height: number;
}): boolean {
  const ok = (value: number): boolean => Number.isInteger(value) && value >= 200 && value <= 4096;
  return ok(size.width) && ok(size.height);
}
