/**
 * Identification kernel — job-agnostic result + JobFace.
 *
 * Pure types. No `@/lib/db`. Writers stay on the job APIs (scan-out POST is
 * the scan_out writer). This module names the face the operator sees after a
 * scan or a list-claim.
 */

export const IDENTIFICATION_JOBS = ['scan_out', 'pick'] as const;
export type HouseIdentificationJob = (typeof IDENTIFICATION_JOBS)[number];
/** House ids plus published tenant method ids. Unknown id is not a job. */
export type IdentificationJob = string;

export type IdentificationSource = 'scan' | 'claim';

export type JobFaceState = 'ready' | 'blocked' | 'done' | 'ambiguous' | 'miss' | 'error';

export type IdentificationEntityKind = 'order';

export interface IdentificationEntity {
  kind: IdentificationEntityKind;
  /** `orders.id` when known; otherwise marketplace `order_id` or the claimed key. */
  id: string;
}

/**
 * What the operator may write from this face.
 * `null` — this face must not write (cancelled / miss / error / ambiguous).
 */
export type JobFaceMutate = 'SHIP_CONFIRM' | 'PICK_CONFIRM' | null;

export interface JobFace {
  state: JobFaceState;
  title: string;
  message: string | null;
  mutate: JobFaceMutate;
}

export interface IdentificationResult {
  organizationId: string;
  clientEventId: string;
  job: IdentificationJob;
  source: IdentificationSource;
  entity: IdentificationEntity;
  face: JobFace;
}
