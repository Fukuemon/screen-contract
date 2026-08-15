/** Baseline は (screen, state, authProfile) で識別する (ADR-0022)。 */
export interface DiffReport {
  readonly changed: boolean;
}
