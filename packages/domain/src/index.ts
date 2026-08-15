/** 画面要素の同一性を追跡する識別子。表示用の構成番号とは独立する (ADR-0012)。 */
export type ElementId = string & { readonly __brand: "ElementId" };

/** ブラウザから観測した画面の構造。生データの解釈は core/element が担う。 */
export interface Snapshot {
  readonly capturedAt: string;
}

/**
 * 認証プロファイルの名前。
 *
 * 復号した Storage State を引く索引になるため、検証していない文字列を
 * そのまま流すと保存先のパス組み立てへ届く (context/infrastructure.md)。
 * 生成経路を parseAuthProfileName に限ることで、未検証の値を型で弾く。
 */
export type AuthProfileName = string & { readonly __brand: "AuthProfileName" };

const AUTH_PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function parseAuthProfileName(raw: string): AuthProfileName {
  if (!AUTH_PROFILE_NAME.test(raw)) {
    throw new Error(`認証プロファイル名として使えない文字列です: ${JSON.stringify(raw)}`);
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

/** Baseline は (screen, state, authProfile) で識別する (ADR-0022)。 */
export function authContextKey(auth: AuthContext): string {
  return auth.kind === "anonymous" ? "anonymous" : auth.name;
}
