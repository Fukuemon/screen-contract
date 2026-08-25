export {
  parseScreenDocument,
  parseWorkflowDocument,
  type Action,
  type ActionKind,
  type ElementDefinition,
  type Expectation,
  type ScreenDocument,
  type ScreenState,
  type Step,
  type WorkflowDocument,
} from "./document.js";
export { WorkflowError, type WorkflowErrorCode } from "./errors.js";
export {
  flattenExecutionSteps,
  normalizeScreen,
  type ExecutionStep,
  type NormalizeInput,
  type ScreenIr,
  type StateView,
  type StepOrigin,
} from "./ir.js";

/** DSL 修正候補の Port。MVP では実装しない (ADR-0019)。 */
export interface DslFixPort {
  suggestFix(input: unknown): Promise<string>;
}
