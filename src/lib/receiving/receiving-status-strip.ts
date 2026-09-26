/**
 * The receiving record's status-strip vocabulary — one step / alert shape for
 * every receiving record (carton, incoming delivery), painted by
 * `ReceivingStatusStrip`. Builders live beside their record
 * (`carton-record-status.ts`); only steps that apply to the record are listed.
 */

/**
 * - `done`: stamped for the whole record.
 * - `partial`: stamped on some lines (`detail` carries `k/N`).
 * - `todo`: not yet — the record has not reached this step.
 * - `unrecorded`: the flow moved past this step without a stamp (unverified,
 *   not proof it never happened).
 */
export type ReceivingStepState = 'done' | 'partial' | 'todo' | 'unrecorded';

export interface ReceivingStatusStep {
  key: string;
  label: string;
  state: ReceivingStepState;
  /** Staff name(s) who did it. */
  who: string | null;
  /** Raw stamp (ISO / pg); the strip formats it in warehouse time. */
  at: string | null;
  /** Count / place / reason — `2/3`, `SHELF A-4`, `Unbox-only intake`. */
  detail: string | null;
}

export interface ReceivingStatusAlert {
  key: string;
  tone: 'danger' | 'warning';
  label: string;
}
