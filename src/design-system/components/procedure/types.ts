/**
 * Procedure step vocabulary — what a station step IS, for any surface that
 * renders one.
 *
 * Extracted from the read-only `ProcedureChecklist` when {@link ProcedureStack}
 * replaced it as the Unbox work surface. The checklist itself was deleted with
 * its last consumer rather than kept "for other stations": a DS component with
 * zero call sites is what the knip ratchet exists to reject, and this file — the
 * shared vocabulary — is the part a future station would actually compose. The
 * checklist renderer is one `git show` away if one ever wants it back.
 *
 * ## `skipped` is a fourth state, and it is NOT `done`
 *
 * A skip records that a person looked at a step and decided to move past it. It
 * never claims the work happened. Completion stays derived from the carton's own
 * evidence — nothing is ticked by hand, so nothing can be ticked falsely — and a
 * waiver is the one thing that is derivable from nothing, so it is the one thing
 * stored. Any renderer that draws `skipped` with a check mark has erased the
 * distinction the state exists to carry, and that distinction is exactly what a
 * claim six weeks later turns on: "we photographed the packing material" versus
 * "we decided not to".
 */

export type ProcedureStepState = 'done' | 'active' | 'pending' | 'skipped';

export interface ProcedureStepRow {
  key: string;
  label: string;
  state: ProcedureStepState;
  /** Right-hand fact for this step — "3 photos", "2 of 5", a grade. */
  summary?: string;
  /** 1-based position in the procedure. Rendered on the active step's marker. */
  position: number;
  /**
   * Server-attested completion or waiver instant, pre-formatted for display.
   * Absent while pending — a step can hold partial evidence and still be
   * pending, and printing that evidence's time beside a pending row reads as a
   * completion.
   */
  at?: string;
  /** Populated only when `state === 'skipped'` — why the operator waived it. */
  skipReason?: string;
}
