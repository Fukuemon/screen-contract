import type {
  ConsoleMessage,
  ObservedElement,
  SemanticLocator,
  ViewportSize,
} from "@screen-contract/core-execution";
import type { ElementId } from "@screen-contract/domain";
import { ValidationError } from "../errors.js";
import type { AuthProfileStore } from "./auth-profiles.js";
import type { AllowedOrigins } from "./origins.js";
import type { RunSession, ViewportSnapshot } from "./run-session.js";
import type { StreamMode } from "./run-state.js";
import type { PickedElement, Viewport } from "./session.js";

/**
 * Web UI からの操作を 1 つの窓口へまとめる。
 *
 * **列挙外の origin を開かない** (ADR-0017)。**認証プロファイルの切り替えは
 * セッションを作り直す** — 開いたままの画面へ別人の状態を注入しても、既に
 * 描画されたものは前の人のままである (ADR-0022)。
 */

/** 認証プロファイルの一覧と、いま使っているもの。 */
export interface AuthProfilesView {
  readonly profiles: readonly string[];
  /** 匿名なら null。「まだ読めていない」と区別するため undefined を使わない。 */
  readonly active: string | null;
  /** 取り込みの世代。Baseline の識別に入る (ADR-0022)。 */
  readonly generation: number;
}

/**
 * live viewport の操作。
 *
 * **戻り値を `unknown` にしない。** interface 層 (api / web) が形を手で写すと、
 * ずれても型検査が鳴らず、項目が 1 つ欠けただけで画面が落ちる。
 */
export interface ViewportControl {
  /** run を起こす。開く先を渡せる。**列挙外の origin は弾く** (ADR-0017)。 */
  start(url?: string): Promise<ViewportSnapshot>;
  resume(): Promise<ViewportSnapshot>;
  /**
   * run を未開始へ戻す。
   *
   * **終端から戻る経路である。** run を走らせきると `paused` を離れ、操作モードと
   * 記録がどちらも使えなくなる (ADR-0002)。
   */
  stop(): ViewportSnapshot;
  setMode(mode: StreamMode): ViewportSnapshot;
  setRecording(recording: boolean): ViewportSnapshot;
  /** 記録した手順をすべて捨てる。要素の定義と構成番号は残す。 */
  clearSteps(): ViewportSnapshot;
  snapshot(): ViewportSnapshot;
  navigate(url: string): Promise<ViewportSnapshot>;
  setViewport(size: ViewportSize): Promise<ViewportSnapshot>;
  /** 座標を要素へ解決する。記録に残すのは Locator であり座標ではない。 */
  resolveAt(point: { readonly x: number; readonly y: number }): Promise<PickedElement | undefined>;
  /** 観測できる要素の一覧。枠と番号の描画に使う。 */
  observeElements(): Promise<readonly ObservedElement[]>;
  consoleMessages(): Promise<readonly ConsoleMessage[]>;
  /** 構成番号を付ける。リストの位置がそのまま番号になる (ADR-0005)。 */
  addBadge(locator: SemanticLocator): ViewportSnapshot;
  removeBadge(id: ElementId): ViewportSnapshot;
  moveBadge(id: ElementId, to: number): ViewportSnapshot;
  /** 実行してよい origin。UI はここから選ぶ。 */
  allowedOrigins(): readonly string[];
  /**
   * 実行してよい origin を足す。
   *
   * **列挙は残す。** UI から任意の URL を開けるようにしても、追加は明示的な
   * 操作として設定ファイルへ書き戻す (ADR-0017)。
   */
  addAllowedOrigin(origin: string): readonly string[];
  listAuthProfiles(): AuthProfilesView;
  saveAuthProfile(name: string): Promise<AuthProfilesView>;
  useAuthProfile(name: string | undefined): Promise<AuthProfilesView>;
  removeAuthProfile(name: string): AuthProfilesView;
}

export interface ViewportControlOptions {
  readonly run: RunSession;
  readonly viewport: Viewport;
  readonly allowedOrigins: AllowedOrigins;
  readonly authProfiles: AuthProfileStore;
  /** いま使う認証プロファイル。viewport がセッションを開くときに読む。 */
  readonly setActiveProfile: (name: string | undefined) => void;
}

export function createViewportControl(options: ViewportControlOptions): ViewportControl {
  /** いま使っているプロファイル。写しを返すために保持する。 */
  let active: string | undefined;

  function assertAllowed(url: string): void {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      throw new ValidationError("開く URL を解釈できません");
    }
    if (!options.allowedOrigins.has(origin)) {
      // 列挙という安全装置を UI から迂回させない。
      throw new ValidationError("実行してよい origin として列挙されていません");
    }
  }

  /**
   * 一覧の写し。
   *
   * `generation` は**いま使っているプロファイル**のものである。匿名なら 0。
   * 取り込んだ直後だけは、取り込んだ側の世代を出す — 匿名のまま保存したときに
   * 「保存できたのに世代 0」と読めてしまうため。
   */
  function profiles(generation?: number): AuthProfilesView {
    return {
      profiles: options.authProfiles.list(),
      active: active ?? null,
      generation:
        generation ?? (active === undefined ? 0 : options.authProfiles.generation(active)),
    };
  }

  async function navigate(url: string): Promise<ViewportSnapshot> {
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
     * **run の 1 ステップは entry への `open` のままにする。** 先に走らせてから
     * 移動することで、ADR-0002 の pause 意味論 (ステップ完了後に停止) を
     * 変えずに済む。
     */
    async start(url?: string): Promise<ViewportSnapshot> {
      // 開けない先だと分かっているなら、run を起こす前に断る。
      if (url !== undefined) {
        assertAllowed(url);
      }
      await options.run.start();
      return url === undefined ? options.run.snapshot() : navigate(url);
    },

    resume: () => options.run.resume(),
    stop: () => options.run.reset(),
    setMode: (mode) => options.run.setMode(mode),
    setRecording: (recording) => options.run.setRecording(recording),
    clearSteps: () => options.run.clearSteps(),
    snapshot: () => options.run.snapshot(),
    resolveAt: (point) => options.viewport.resolveAt(point),
    consoleMessages: () => options.viewport.consoleMessages(),
    addBadge: (locator) => options.run.addBadge(locator),
    removeBadge: (id) => options.run.removeBadge(id),
    moveBadge: (id, to) => options.run.moveBadge(id, to),
    allowedOrigins: () => options.allowedOrigins.list(),
    addAllowedOrigin: (origin) => options.allowedOrigins.add(origin),
    navigate,

    async observeElements(): Promise<readonly ObservedElement[]> {
      // 枠を取り直す前に、いま居る画面状態を run へ伝える。対象が自分で
      // 移動したときも、構成番号の帳簿がその画面のものへ切り替わる。
      const [url, elements] = await Promise.all([
        options.viewport.currentUrl(),
        options.viewport.observe(),
      ]);
      options.run.enterState(url);
      return elements;
    },

    async setViewport(size: ViewportSize): Promise<ViewportSnapshot> {
      await options.viewport.setSize(size);
      return options.run.snapshot();
    },

    listAuthProfiles: profiles,

    async saveAuthProfile(name: string): Promise<AuthProfilesView> {
      // いま開いている画面の状態を取り込む。人間が手でログインした直後に押す。
      const generation = options.authProfiles.save(
        name,
        await options.viewport.captureStorageState(),
      );
      return profiles(generation);
    },

    async useAuthProfile(name: string | undefined): Promise<AuthProfilesView> {
      if (name !== undefined) {
        // 境界で弾く。通すと不正な名前が「有効なプロファイル」として保持され、
        // 失敗が次にセッションを開くときまで遅れる。
        options.authProfiles.assertName(name);
      }
      active = name;
      options.setActiveProfile(name);
      await options.viewport.reset();
      // run も戻す。戻さないと、捨てたセッションへ入力を中継し続ける。
      options.run.reset();
      return profiles();
    },

    removeAuthProfile(name: string): AuthProfilesView {
      options.authProfiles.remove(name);
      if (active === name) {
        // 消したものを使い続けさせない。次にセッションを開くときまで失敗が遅れる。
        active = undefined;
        options.setActiveProfile(undefined);
      }
      return profiles();
    },
  };
}
