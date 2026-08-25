export {
  EXECUTION_ERROR_CODES,
  isExecutionFailure,
  type ExecutionErrorCode,
  type ExecutionFailure,
} from "./errors.js";
export {
  allSatisfied,
  canSkip,
  evaluate,
  type EvaluationOutcome,
  type EvaluationResult,
  type Observation,
} from "./evaluate.js";
export {
  reconstruct,
  rerunStep,
  resumeRun,
  runSteps,
  type EvaluationPhase,
  type ExecutionEvent,
  type RerunOptions,
  type ResumeOptions,
  type RunOptions,
  type RunOutcome,
  type StepOutcome,
  type StepResult,
  type StepRunner,
  type TerminalRunStatus,
} from "./run.js";

import type { Snapshot } from "@screen-contract/domain";

/**
 * Windows が予約しているデバイス名。**拡張子を付けても予約されたまま**である
 * (`con.txt` も作れない)。
 */
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 10 }, (_, i) => `com${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${i}`),
]);

/**
 * パスの 1 セグメントとして、どのプラットフォームでも安全に使えるか。
 *
 * 識別子 (run / 認証プロファイル / 保存の鍵) はいずれもファイルパスの
 * セグメントになるため、**文字種の検査だけでは足りない**。
 *
 * - Windows は末尾のドットと空白を落とす。`a.` と `a` が同じファイルを指し、
 *   別の run の結果が衝突する
 * - Windows の予約デバイス名はファイルとして作れない。保存が実行時に失敗する
 *
 * core-execution に置くのは、`RunId` と `AuthProfileName` をここで定義しており、
 * `app` の `StoreKey` からも参照できる唯一の位置だからである
 * (`core` は `app` を参照できない)。
 */
export function isPortablePathSegment(segment: string): boolean {
  if (segment.length === 0) {
    return false;
  }
  if (/[. ]$/.test(segment)) {
    return false;
  }
  const base = segment.split(".")[0] ?? "";
  return !WINDOWS_RESERVED_NAMES.has(base.toLowerCase());
}

/**
 * 認証プロファイルの名前。
 *
 * 復号した Storage State を引く索引になるため、検証していない文字列を
 * そのまま流すと保存先のパス組み立てへ届く (context/infrastructure.md)。
 * 生成経路を parseAuthProfileName に限ることで、未検証の値を型で弾く。
 */
export type AuthProfileName = string & { readonly __brand: "AuthProfileName" };

const AUTH_PROFILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * 予約語。匿名実行を表す内部表現と衝突するため、プロファイル名に使わせない。
 * 予約しないと authContextKey が両者を同じ鍵へ潰し、匿名実行の結果が
 * 認証済みの Baseline を上書きする (ADR-0022)。
 */
const RESERVED_AUTH_PROFILE_NAMES = new Set(["anonymous"]);

export function parseAuthProfileName(raw: string): AuthProfileName {
  // 小文字だけを許す。macOS と Windows の既定ファイルシステムは大文字小文字を
  // 区別しないため、Admin と admin が同じ auth/<name>.enc を指してしまう。
  if (
    !AUTH_PROFILE_NAME.test(raw) ||
    RESERVED_AUTH_PROFILE_NAMES.has(raw) ||
    !isPortablePathSegment(raw)
  ) {
    throw new Error(
      "認証プロファイル名の規則に合いません (小文字英数と . _ - のみ、64 文字以内、予約語とプラットフォーム予約名を除く)",
    );
  }
  return raw as AuthProfileName;
}

/**
 * run を実行するときの認証コンテキスト。
 *
 * 省略可能な引数にしない。省略できると「認証なし」が既定になり、意図しない
 * プロファイルでの実行と Baseline の汚染を招く。認証しない場合も anonymous を
 * 明示する (ADR-0022)。
 */
export type AuthContext =
  | { readonly kind: "anonymous" }
  | { readonly kind: "profile"; readonly name: AuthProfileName };

/**
 * Baseline の識別子に使う正規化キー (ADR-0022 の `(screen, state, authProfile)`)。
 *
 * kind を前置きする。前置きしないと、匿名実行と名前が anonymous のプロファイルが
 * 同じ鍵になる。予約語での防御と合わせて二重に塞ぐ。
 *
 * 保存の鍵の一部にもなるため、パスの 1 セグメントとして使える文字だけを返す。
 */
export function authContextKey(auth: AuthContext): string {
  return auth.kind === "anonymous" ? "anon" : `profile.${auth.name}`;
}

/** run の識別子。保存の鍵に含めるため、プロファイル名と同じ規則で縛る。 */
export type RunId = string & { readonly __brand: "RunId" };

const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function parseRunId(raw: string): RunId {
  if (!RUN_ID.test(raw) || !isPortablePathSegment(raw)) {
    throw new Error(
      "run の識別子の規則に合いません (小文字英数と . _ - のみ、64 文字以内、プラットフォーム予約名を除く)",
    );
  }
  return raw as RunId;
}

/**
 * DSL の action。意味論 (実行・検証の仕方) は core/execution が定める。
 *
 * skeleton で実行系が通すのは `open` と `click` だけである。語彙の残りは
 * core/workflow が Schema として受け付け、正規化で未対応として弾く。
 */
export type BrowserAction =
  | { readonly kind: "open"; readonly url: string }
  | { readonly kind: "click"; readonly locator: SemanticLocator };

/**
 * Semantic Locator。要素の同一性は永続要素 ID が持ち、画面上の実要素は
 * これで見つける (element-mapping feature)。
 *
 * 実行基盤の一時的な要素参照は保存しない。撮影ごとに振り直されるため、
 * 版をまたいで持ち越せない。
 */
export interface SemanticLocator {
  readonly role: string;
  readonly name: string;
}

/** 画面上の位置。撮影時の viewport ピクセル座標。 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * box 付きの要素 1 件。座標から要素を解決する入力になる。
 *
 * Accessibility Snapshot の応答に box が含まれるとは限らないため、取得手段は
 * adapter に閉じる。core は入力値として受け取るだけで、取得手段を問わない
 * (element-mapping feature)。
 */
export interface ObservedElement {
  readonly role: string;
  readonly name: string;
  readonly box: BoundingBox;
}

/** スクリーンショットのバイナリ。注釈は core/artifact が別途重ねる。 */
export interface Screenshot {
  readonly bytes: Uint8Array;
}

/** ライブ映像ストリームのハンドル。描画は web-editor、転送は adapter の責務。 */
export interface StreamHandle {
  readonly endpoint: string;
}

/** ブラウザ実行基盤を差し替え可能にする Port。実装は adapter/browser (ADR-0013)。 */
export interface BrowserPort {
  /**
   * 認証コンテキストは必須とする。省略できると「認証なし」が既定になるため
   * (ADR-0022)。Storage State の復号と注入は adapter/browser の責務。
   */
  createSession(auth: AuthContext): Promise<BrowserSession>;
}

/**
 * セッションはページ状態と要素参照を保持する第一級の抽象である。
 * 一時停止中も生存させる (execution feature)。
 */
export interface BrowserSession {
  /** 型付きの action 実行。CLI の呼び出し形式と JSON のパースは adapter に閉じる。 */
  perform(action: BrowserAction): Promise<void>;
  snapshot(): Promise<Snapshot>;
  screenshot(): Promise<Screenshot>;
  /** 座標から要素を解決するための box 付き要素一覧。 */
  observeElements(): Promise<readonly ObservedElement[]>;
  currentUrl(): Promise<string>;
  stream(): Promise<StreamHandle>;
  /** 一時停止中もセッションを生かし続ける。 */
  keepalive(): Promise<void>;
  /**
   * 対象ページのコンソール出力。
   *
   * 形は実行基盤の都合であり、core は不透明な値として扱う (ADR-0013)。
   */
  consoleMessages(): Promise<readonly unknown[]>;
  /**
   * viewport の寸法を変える。
   *
   * **CSS ピクセルで指定する。** 対象アプリの responsive の分岐と対応させる
   * ためであり、実機の画素数ではない。
   */
  setViewport(size: ViewportSize): Promise<void>;
  /**
   * 認証状態 (Storage State) を取り出す。
   *
   * Baseline は (screen, state, authProfile) で識別される (ADR-0022)。
   * 取り出した状態は**暗号化して保存する** — 復号と注入は adapter の責務で
   * あり、core は不透明な値として扱う。
   */
  captureStorageState(): Promise<StorageState>;
  /** 認証状態を注入する。**注入してから対象を開く。** */
  restoreStorageState(state: StorageState): Promise<void>;
  close(): Promise<void>;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * ブラウザの認証状態。
 *
 * **core は中身を解釈しない。** Cookie と Web Storage の形は実行基盤の都合で
 * あり、core が知ると基盤を差し替えられなくなる (ADR-0013)。
 */
export interface StorageState {
  readonly cookies: readonly unknown[];
  readonly localStorage: Readonly<Record<string, unknown>>;
}
