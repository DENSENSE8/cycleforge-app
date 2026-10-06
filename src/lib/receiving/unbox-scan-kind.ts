/** Unbox scan kind — is this scan WORK, or a LOOKUP of finished work? */

/** Append-only ops event recorded for a lookup scan. Never a `receiving_scans` write. */
export const RECEIVING_LOOKUP_SCAN_EVENT = 'RECEIVING_LOOKUP_SCAN';

export type UnboxScanKind = 'work' | 'lookup';

/** The only carton state the classification depends on (structural — callers pass a literal). */
interface CartonUnboxState {
  /** `receiving_unbox.unboxed_at` — the completion milestone. */
  unboxedAt: string | Date | null | undefined;
  /**
   * A line still expects units that have not been received — e.g. the second
   * box of a purchase order that shipped in several boxes onto one carton.
   * Its unbox work is not done, so a scan is work even after `unboxed_at`.
   */
  unitsOutstanding?: boolean;
}

/** Classify an **Unbox-surface** scan. */
export function classifyUnboxScanKind(state: CartonUnboxState): UnboxScanKind {
  return state.unboxedAt != null && !state.unitsOutstanding ? 'lookup' : 'work';
}

/**
 * The `unboxed_at` a client scan rung may act on from a CACHED row — null while
 * that line still expects units, so the scan opens as work and the server's
 * touch-scan verdict (which reads every line of the carton) has the last word.
 */
export function cachedLookupUnboxedAt(row: {
  unboxed_at?: string | null;
  quantity_expected?: number | null;
  quantity_received?: number | null;
  workflow_status?: string | null;
} | null | undefined): string | null {
  if (!row?.unboxed_at) return null;
  const outstanding =
    row.workflow_status !== 'DONE' && Number(row.quantity_expected ?? 0) > Number(row.quantity_received ?? 0);
  return outstanding ? null : row.unboxed_at;
}

/**
 * Surface-aware entry point. Only the Unbox bench distinguishes lookup from
 * work; every other intake surface keeps today's semantics unchanged.
 */
export function classifyScanKind(
  intakeSurface: 'unbox' | 'triage',
  state: CartonUnboxState,
): UnboxScanKind {
  if (intakeSurface !== 'unbox') return 'work';
  return classifyUnboxScanKind(state);
}

/** Client-event id for a lookup scan's ops event. */
export function lookupScanClientEventId(args: {
  organizationId: string;
  receivingId: number;
  occurredAtIso: string;
}): string {
  return `unbox-lookup-scan:${args.organizationId}:${args.receivingId}:${args.occurredAtIso}`;
}
