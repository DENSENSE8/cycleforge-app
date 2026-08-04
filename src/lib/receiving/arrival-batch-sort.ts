/**
 * Pure helpers for the Arrival batch-sort session bag.
 * Session React state lives in useArrivalBatchSortSession; these stay unit-testable.
 */

export interface ArrivalBatchEntry {
  tracking: string;
  receivingId: number;
  /** Display label (tracking or PO hint). */
  label: string;
  isReturn: boolean;
  isPriority: boolean;
  /** Existing manual lane, if any — wins over auto policy on commit. */
  priorityLane: string | null;
}

/**
 * Push a resolved carton into the batch. Dedupes by `receivingId` (keeps the
 * first entry). Returns the next array (same reference when unchanged).
 */
export function pushArrivalBatchEntry(
  batch: ArrivalBatchEntry[],
  entry: ArrivalBatchEntry,
): ArrivalBatchEntry[] {
  if (!Number.isFinite(entry.receivingId) || entry.receivingId <= 0) return batch;
  if (batch.some((b) => b.receivingId === entry.receivingId)) return batch;
  return [...batch, entry];
}

export function removeArrivalBatchEntry(
  batch: ArrivalBatchEntry[],
  receivingId: number,
): ArrivalBatchEntry[] {
  if (!batch.some((b) => b.receivingId === receivingId)) return batch;
  return batch.filter((b) => b.receivingId !== receivingId);
}
