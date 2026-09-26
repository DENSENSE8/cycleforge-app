/** Procedure step vocabulary — what a station step IS, for any surface that renders one. */

export type ProcedureStepState = 'done' | 'active' | 'pending' | 'skipped';

export interface ProcedureStepRow {
  key: string;
  label: string;
  state: ProcedureStepState;
  /** Right-hand fact for this step — "3 photos", "2 of 5", a grade. */
  summary?: string;
  /** 1-based position in the procedure. Rendered on the active step's marker. */
  position: number;
  /** Server-attested completion or waiver instant, pre-formatted for display. */
  at?: string;
  /** Populated only when `state === 'skipped'` — why the operator waived it. */
  skipReason?: string;
}
