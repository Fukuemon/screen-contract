import type { Snapshot } from "@screen-contract/domain";

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
  if (!AUTH_PROFILE_NAME.test(raw) || RESERVED_AUTH_PROFILE_NAMES.has(raw)) {
    throw new Error(
      "認証プロファイル名の規則に合いません (小文字英数と . _ - のみ、64 文字以内、予約語を除く)",
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
  if (!RUN_ID.test(raw)) {
    throw new Error("run の識別子の規則に合いません (小文字英数と . _ - のみ、64 文字以内)");
  }
  return raw as RunId;
}

/** ブラウザ実行基盤を差し替え可能にする Port。実装は adapter/browser (ADR-0013)。 */
export interface BrowserPort {
  /**
   * 認証コンテキストは必須とする。省略できると「認証なし」が既定になるため
   * (ADR-0022)。Storage State の復号と注入は adapter/browser の責務。
   */
  createSession(auth: AuthContext): Promise<BrowserSession>;
}

export interface BrowserSession {
  snapshot(): Promise<Snapshot>;
  close(): Promise<void>;
}

/** 実行時エラーの機械可読コード。認証状態の失効を呼び出し側が判別できるようにする。 */
export type ExecutionErrorCode = "auth/expired";
