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

import type { ObservedElement, SemanticLocator, Snapshot } from "@screen-contract/domain";
import type { PageInput } from "./page-input.js";

// 同じ型を core ごとに持たない (context/architecture.md)。
export type { BoundingBox, ObservedElement, SemanticLocator } from "@screen-contract/domain";

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

export {
  parsePageInput,
  type InputModifiers,
  type KeyPhase,
  type PageInput,
  type PointerButton,
  type PointerPhase,
} from "./page-input.js";

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

/** スクリーンショットのバイナリ。注釈は core/artifact が別途重ねる。 */
export interface Screenshot {
  readonly bytes: Uint8Array;
}

/** ライブ映像ストリームのハンドル。描画は web-editor、転送は adapter の責務。 */
export interface StreamHandle {
  readonly endpoint: string;
}

/**
 * 配信への接続。
 *
 * **endpoint の形と protocol は adapter に閉じる。** 実行基盤のポートを外部へ
 * 公開せず、Stream Proxy が中継する (ADR-0008)。
 */
export interface StreamRelay {
  /** 対象ページへ入力を届ける。実行基盤の語彙への写像は adapter が担う。 */
  send(input: PageInput): void;
  close(): void;
}

/**
 * 対象ページのコンソール出力 1 件。
 *
 * **実行基盤の生の形をそのまま流さない。** 流すと CDP の語彙が interface 層まで
 * 漏れ、基盤を差し替えられなくなる (ADR-0013)。
 */
export interface ConsoleMessage {
  /** `log` / `warn` / `error` など。実行基盤の値をそのまま使う。 */
  readonly level: string;
  readonly text: string;
}

/**
 * セッションを開く要求。
 *
 * `auth` は**誰として実行しているか**であり、保存の鍵と Baseline の識別に使う
 * (ADR-0022)。`storageState` は**その中身**である。復号は保管側が担い、
 * 対象を開く前の注入を adapter が担う。
 */
export interface CreateSessionInput {
  readonly auth: AuthContext;
  readonly storageState?: StorageState | undefined;
}

/** ブラウザ実行基盤を差し替え可能にする Port。実装は adapter/browser (ADR-0013)。 */
export interface BrowserPort {
  /**
   * 認証コンテキストは必須とする。省略できると「認証なし」が既定になるため
   * (ADR-0022)。注入は adapter/browser の責務であり、**対象を開く前に行う**。
   */
  createSession(input: AuthContext | CreateSessionInput): Promise<BrowserSession>;
  /** 配信へ繋ぐ。1 フレームぶんの data URI を渡す。 */
  connect(handle: StreamHandle, onFrame: (dataUri: string) => void): StreamRelay;
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
  /** 対象ページのコンソール出力。 */
  consoleMessages(): Promise<readonly ConsoleMessage[]>;
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
  /**
   * 認証状態を注入する。**注入してから対象を開く。**
   *
   * 入れられなかった項目を返す。**黙って落とさない** — 入ったつもりで
   * 未ログインの画面を撮ると、その差分が仕様の変更として記録される。
   */
  restoreStorageState(state: StorageState): Promise<StorageRestoreReport>;
  /**
   * このセッションを開くときの注入で入らなかったもの。
   *
   * **利用者へ出すために持つ。** ログだけに残すと届かず、入ったつもりで
   * 未ログインの画面を撮ることになる。
   */
  restoreReport(): StorageRestoreReport;
  close(): Promise<void>;
}

/**
 * 認証状態の注入の結果。
 *
 * 実行基盤によっては入れられない領域がある。**入らなかったことを値で返す。**
 * 例外にすると cookie だけでも入る場合に全部が失敗し、ログを見るだけにすると
 * 利用者に届かない。
 */
export interface StorageRestoreReport {
  /** 入れられなかった Web Storage の鍵。**値は含めない。** */
  readonly skippedKeys: readonly string[];
  /** 入れられなかった理由。利用者へそのまま出せる 1 文にする。 */
  readonly reason?: string | undefined;
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
