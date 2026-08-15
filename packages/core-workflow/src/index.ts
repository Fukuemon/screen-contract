/** DSL を実行しやすい形へ正規化した内部表現。run 単位で version を固定する (ADR-0018)。 */
export interface WorkflowIr {
  readonly version: number;
}

/** DSL 修正候補の Port。MVP では実装しない (ADR-0019)。 */
export interface DslFixPort {
  suggestFix(input: unknown): Promise<string>;
}
