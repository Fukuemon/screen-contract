/**
 * DSL の検証と正規化が返す機械可読なコード。
 *
 * **「重いので止まった」ではなく「規則に反している」として返す。**
 * エージェントも利用者も draft を自由に書けるため、不正な参照は必ず入る前提で
 * 扱う。自己修正できる形にするため、どこがどう規則に反しているかを返す
 * (workflow-dsl feature)。
 */
export type WorkflowErrorCode =
  | "schema/invalid"
  | "ref/unresolved"
  | "ref/cyclic"
  | "ref/too-deep"
  | "ref/too-many-steps"
  | "state/orphan"
  | "badges/invalid"
  | "element/duplicate-id"
  | "action/unimplemented"
  | "expect/unimplemented";

export class WorkflowError extends Error {
  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
    /** どの宣言が原因かを指す。DSL の該当箇所へ逆引きするために使う。 */
    readonly at?: string,
  ) {
    super(at === undefined ? message : `${message} (${at})`);
    this.name = "WorkflowError";
  }
}

export function invalid(message: string, at?: string): WorkflowError {
  return new WorkflowError("schema/invalid", message, at);
}
