/** The receiving record's status-strip vocabulary — one step / alert shape for every receiving record (carton, incoming delivery), painted… */

/** - `done`: stamped for the whole record. */
export type ReceivingStepState = 'done' | 'partial' | 'todo' | 'unrecorded';

export interface ReceivingStatusStep {
  key: string;
  label: string;
  state: ReceivingStepState;
  /** Staff name(s) who did it. */
  who: string | null;
  /** Raw stamp (ISO / pg); the strip formats it in warehouse time. */
  at: string | null;
  /** `at` is a calendar day (a PO date) — paint no time. */
  dateOnly?: boolean;
  /** Count / place / reason — `2/3`, `SHELF A-4`, `Unbox-only intake`. */
  detail: string | null;
}

export interface ReceivingStatusAlert {
  key: string;
  tone: 'danger' | 'warning';
  label: string;
}
