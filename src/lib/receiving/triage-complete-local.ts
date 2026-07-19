/**
 * Client-tracked triage-complete hint — bridges the gap until `triage_complete`
 * is threaded onto every feed row. Used by TriagePanel Save-for-unbox; the
 * workspace stepper that formerly read this flag was removed.
 */

const TRIAGE_COMPLETE_KEY = (receivingId: number) => `receiving-triage-complete:${receivingId}`;

export function hasTriageBeenCompleted(receivingId: number | null | undefined): boolean {
  if (typeof window === 'undefined' || receivingId == null) return false;
  try {
    return !!window.localStorage.getItem(TRIAGE_COMPLETE_KEY(receivingId));
  } catch {
    return false;
  }
}

/** Called by the Save-for-unbox action on a successful `POST /triage/complete`. */
export function markTriageCompleted(receivingId: number | null | undefined): void {
  if (typeof window === 'undefined' || receivingId == null) return;
  try {
    window.localStorage.setItem(TRIAGE_COMPLETE_KEY(receivingId), String(Date.now()));
  } catch {
    /* private-mode / quota — non-fatal */
  }
  window.dispatchEvent(
    new CustomEvent('receiving-triage-completed', { detail: { receiving_id: receivingId } }),
  );
}
