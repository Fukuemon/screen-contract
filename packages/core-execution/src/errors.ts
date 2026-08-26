/**
 * 実行時エラーの機械可読コード。
 *
 * `auth/expired` は認証状態の失効を呼び出し側が判別できるようにする。
 * `browser/unresponsive` はセッションが応答しなくなったことを表す。
 *
 * **不応答を adapter が握りつぶさない。** セッションは部分的に壊れる。
 * Snapshot の取得は成功し続けるのにスクリーンショットの取得だけが恒久的に
 * 失敗する状態が実在し、生存確認では検出できない。**セッションの再作成は
 * ページ状態を失う操作**であり、adapter が黙って作り直すと、同一セッションでの
 * 再実行を前提とする検証が静かに壊れる。再作成の可否は run の意味を知っている
 * core/execution が決める (execution feature)。
 */
export type ExecutionErrorCode = "auth/expired" | "browser/unresponsive";

/**
 * 呼び出し側が機械的に分岐できる形の失敗。
 *
 * **構造で表す。** adapter は core の型だけを参照でき、実行時の値 (クラスや
 * 関数) を受け取れない (context/architecture.md)。共通の基底クラスを core に
 * 置くと adapter がそれを import することになり、境界を越える。adapter は
 * 自前の Error を投げ、core はこの形に合うかどうかで判定する。
 */
export interface ExecutionFailure {
  readonly code: ExecutionErrorCode;
  readonly message: string;
}

export const EXECUTION_ERROR_CODES = new Set<string>(["auth/expired", "browser/unresponsive"]);

/** 未知の失敗を握り潰さないため、コードが語彙にあるものだけを分岐対象とする。 */
export function isExecutionFailure(value: unknown): value is ExecutionFailure {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { code, message } = value as Record<string, unknown>;
  return typeof code === "string" && EXECUTION_ERROR_CODES.has(code) && typeof message === "string";
}
