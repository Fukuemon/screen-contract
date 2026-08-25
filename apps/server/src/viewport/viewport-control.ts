import type { ViewportControl } from "@screen-contract/api";
import type { AuthProfileStore } from "@screen-contract/adapter-store";
import type { AllowedOrigins } from "./allowed-origins.js";
import type { RunSession } from "./run-session.js";
import type { Viewport } from "./viewport.js";

/**
 * Web UI からの操作を 1 つの窓口へまとめる。
 *
 * **列挙外の origin を開かない** (ADR-0017)。**認証プロファイルの切り替えは
 * セッションを作り直す** — 開いたままの画面へ別人の状態を注入しても、既に
 * 描画されたものは前の人のままである (ADR-0022)。
 */

export interface ViewportControlOptions {
  readonly run: RunSession;
  readonly viewport: Viewport;
  readonly allowedOrigins: AllowedOrigins;
  readonly authProfiles: AuthProfileStore;
  /** いま使う認証プロファイル。viewport がセッションを開くときに読む。 */
  readonly setActiveProfile: (name: string | undefined) => void;
}

export function createViewportControl(options: ViewportControlOptions): ViewportControl {
  function assertAllowed(url: string): void {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      throw new Error("開く URL を解釈できません");
    }
    if (!options.allowedOrigins.has(origin)) {
      // 列挙という安全装置を UI から迂回させない。
      throw new Error("実行してよい origin として列挙されていません");
    }
  }

  return {
    start: () => options.run.start(),
    resume: () => options.run.resume(),
    setMode: (mode) => options.run.setMode(mode),
    setRecording: (recording) => options.run.setRecording(recording),
    snapshot: () => options.run.snapshot(),
    resolveAt: (point) => options.viewport.resolveAt(point),
    observeElements: () => options.viewport.observe(),
    consoleMessages: () => options.viewport.consoleMessages(),
    allowedOrigins: () => options.allowedOrigins.list(),
    addAllowedOrigin: (origin) => options.allowedOrigins.add(origin),

    async navigate(url: string): Promise<unknown> {
      assertAllowed(url);
      await options.viewport.navigate(url);
      return options.run.snapshot();
    },

    async setViewport(size): Promise<unknown> {
      await options.viewport.setSize(size);
      return options.run.snapshot();
    },

    listAuthProfiles: () => options.authProfiles.list(),

    async saveAuthProfile(name: string): Promise<unknown> {
      // いま開いている画面の状態を取り込む。人間が手でログインした直後に押す。
      options.authProfiles.save(name, await options.viewport.captureStorageState());
      return { profiles: options.authProfiles.list() };
    },

    async useAuthProfile(name: string | undefined): Promise<unknown> {
      options.setActiveProfile(name);
      // **セッションを作り直す。** 開いたままの画面へ注入しても、既に描画された
      // ものは前の状態のままである。
      await options.viewport.reset();
      return { active: name ?? null };
    },

    removeAuthProfile(name: string): unknown {
      options.authProfiles.remove(name);
      return { profiles: options.authProfiles.list() };
    },
  };
}
