/**
 * 失敗の分類。
 *
 * **名前ではなく構造で判定する。** クラス名の列挙にすると、`name` を上書きした
 * エラークラスを足すたびに分類から漏れる。逆に素の `Error` を列挙へ入れると、
 * server 側の状態異常まで「client の入力ミス」として返る。
 *
 * adapter と core は app を値として参照できない (context/architecture.md)。
 * 継承を要求せず、`kind` を持つかどうかで判定する。
 */

const VALIDATION = "validation";
const CONFLICT = "conflict";

/** 外部入力が規則に合わない。呼び出し側が直せる。 */
export class ValidationError extends Error {
  readonly failure = VALIDATION;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * 入力は正しいが、いまの状態では実行できない。
 *
 * 400 と混ぜない。混ぜると「入力を直せば通る」と読めてしまい、実際には
 * 接続や再開といった別の操作が要る。
 */
export class ConflictError extends Error {
  readonly failure = CONFLICT;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

function failureOf(error: unknown): unknown {
  return typeof error === "object" && error !== null
    ? (error as { failure?: unknown }).failure
    : undefined;
}

export function isValidationError(error: unknown): boolean {
  return failureOf(error) === VALIDATION;
}

export function isConflictError(error: unknown): boolean {
  return failureOf(error) === CONFLICT;
}
