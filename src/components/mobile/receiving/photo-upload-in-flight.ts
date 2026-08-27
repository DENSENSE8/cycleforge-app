/**
 * Absolute queued+uploading count for a receiving carton (failed/done excluded).
 * Pure — desk peek placeholders and Ably taken notices share this law.
 */

export type InFlightUploadState = 'queued' | 'uploading' | 'done' | 'failed';

export type InFlightUploadEntry = {
  scope: { receivingId: number };
  state: InFlightUploadState;
};

export function countInFlightEntries(
  entries: readonly InFlightUploadEntry[],
  receivingId: number,
): number {
  const rid = Number(receivingId);
  if (!Number.isFinite(rid) || rid <= 0) return 0;
  let n = 0;
  for (const e of entries) {
    if (e.scope.receivingId !== rid) continue;
    if (e.state === 'queued' || e.state === 'uploading') n += 1;
  }
  return n;
}
