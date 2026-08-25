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

  async function navigate(url: string): Promise<unknown> {
    assertAllowed(url);
    await options.viewport.navigate(url);
    // 構成番号は画面ごとに別である (ADR-0005)。移った先の帳簿へ切り替える。
    options.run.enterState(url);
    return options.run.snapshot();
  }

  return {
    /**
     * run を起こす。
     *
     * 開く先を渡せる。渡さないと列挙の先頭 (entry) を開く。**run の 1 ステップは
     * entry への `open` のままにする** — 先に走らせてから移動することで、
     * ADR-0002 の pause 意味論 (ステップ完了後に停止) を変えずに済む。
     */
    async start(url?: string): Promise<unknown> {
      // 開けない先だと分かっているなら、run を起こす前に断る。
      if (url !== undefined) {
        assertAllowed(url);
      }
      await options.run.start();
      return url === undefined ? options.run.snapshot() : navigate(url);
    },

    resume: () => options.run.resume(),

    /**
     * run を未開始へ戻す。
     *
     * **終端 (`completed` / `failed`) から戻る経路をここが持つ。** 持たないと、
     * 一度 run を走らせきった時点で操作モードへ二度と入れなくなる。
     */
    stop: () => options.run.reset(),

    setMode: (mode) => options.run.setMode(mode),
    setRecording: (recording) => options.run.setRecording(recording),
    snapshot: () => options.run.snapshot(),
    resolveAt: (point) => options.viewport.resolveAt(point),
    async observeElements(): Promise<readonly unknown[]> {
      // 枠を取り直す前に、いま居る画面状態を run へ伝える。対象が自分で
      // 移動したときも、構成番号の帳簿がその画面のものへ切り替わる。
      const [url, elements] = await Promise.all([
        options.viewport.currentUrl(),
        options.viewport.observe(),
      ]);
      options.run.enterState(url);
      return elements;
    },

    consoleMessages: () => options.viewport.consoleMessages(),
    addBadge: (locator) => options.run.addBadge(locator),
    removeBadge: (id) => options.run.removeBadge(id),
    moveBadge: (id, to) => options.run.moveBadge(id, to),
    allowedOrigins: () => options.allowedOrigins.list(),
    addAllowedOrigin: (origin) => options.allowedOrigins.add(origin),

    navigate,

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
      if (name !== undefined) {
        // 境界で弾く。通すと不正な名前が「有効なプロファイル」として保持され、
        // 失敗が次にセッションを開くときまで遅れる。
        options.authProfiles.assertName(name);
      }
      options.setActiveProfile(name);
      await options.viewport.reset();
      // run も戻す。戻さないと、捨てたセッションへ入力を中継し続ける。
      options.run.reset();
      return { active: name ?? null };
    },

    removeAuthProfile(name: string): unknown {
      options.authProfiles.remove(name);
      return { profiles: options.authProfiles.list() };
    },
  };
}
