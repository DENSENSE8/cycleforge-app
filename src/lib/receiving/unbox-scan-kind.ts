/** Unbox scan kind — is this scan WORK, or a LOOKUP of finished work? */

/** Append-only ops event recorded for a lookup scan. Never a `receiving_scans` write. */
export const RECEIVING_LOOKUP_SCAN_EVENT = 'RECEIVING_LOOKUP_SCAN';

export type UnboxScanKind = 'work' | 'lookup';

/** The only carton state the classification depends on (structural — callers pass a literal). */
interface CartonUnboxState {
  /** `receiving_unbox.unboxed_at` — the completion milestone. */
  unboxedAt: string | Date | null | undefined;
}

/** Classify an **Unbox-surface** scan. */
export function classifyUnboxScanKind(state: CartonUnboxState): UnboxScanKind {
  return state.unboxedAt != null ? 'lookup' : 'work';
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
