/**
 * Unbox scan kind — is this scan WORK, or a LOOKUP of finished work?
 *
 * The operator problem this exists for: an Unbox scan is a write. Scanning a
 * carton that was unboxed weeks ago to "see what happened to it" used to be
 * indistinguishable from doing the work, because `receiving_scans` carries
 * exactly ONE row per (tracking_number, receiving_id) — a unique index, not an
 * append-only log — and the upsert overwrote `scanned_at` / `scanned_by`. So a
 * lookup did not inflate the log; it **overwrote the original worker's
 * attribution on that carton**. That is the defect this classification closes.
 *
 * The rule, deliberately narrow:
 *
 *   | carton state                        | kind     | why |
 *   |-------------------------------------|----------|-----|
 *   | never opened                        | `work`   | first open IS the work |
 *   | opened, not yet unboxed             | `work`   | resuming / re-focusing mid-unbox |
 *   | unboxed (`unboxed_at` set)          | `lookup` | the work is done; this is inspection |
 *
 * "Opened but not unboxed" stays WORK on purpose. `opened_at` is stamped by the
 * mere act of opening the carton, so keying on it would misclassify an operator
 * re-scanning the box they are actively unboxing. `unboxed_at` is the
 * completion milestone (COALESCE-once on the `receiving_unbox` street table,
 * written by `acknowledge-unbox` / `serial-attach` / `returned-serial-link`),
 * which is what "already received and unboxed" actually means.
 *
 * Pure + dependency-free (no pool) so client bundles, the routes, and DB-free
 * unit tests can all read it — the bundle-altitude rule in
 * `.claude/rules/build-gotchas.md`. The server half lives in
 * `unbox-lookup-scan.ts`.
 */

/** Append-only ops event recorded for a lookup scan. Never a `receiving_scans` write. */
export const RECEIVING_LOOKUP_SCAN_EVENT = 'RECEIVING_LOOKUP_SCAN';

export type UnboxScanKind = 'work' | 'lookup';

/** The only carton state the classification depends on (structural — callers pass a literal). */
interface CartonUnboxState {
  /** `receiving_unbox.unboxed_at` — the completion milestone. */
  unboxedAt: string | Date | null | undefined;
}

/**
 * Classify an **Unbox-surface** scan. Triage (door) scans are always `work` —
 * a door scan records arrival and has no "already done" state to protect; pass
 * `intakeSurface` through {@link classifyScanKind} rather than calling this
 * directly from a shared path.
 */
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

/**
 * Client-event id for a lookup scan's ops event.
 *
 * Unlike the work events (`receiving-scan:<scanId>` /
 * `unbox-scan-opened:<org>:<recv>:<scanId>`), which are keyed on the STABLE
 * scan-row id and are therefore idempotent across re-scans, a lookup is a
 * genuine occurrence: two lookups a week apart are two facts. The caller
 * supplies the occurrence instant so the id is unique per lookup while staying
 * deterministic for a retry of the SAME request (idempotency still holds where
 * it should — a double-fired request carries one instant).
 */
export function lookupScanClientEventId(args: {
  organizationId: string;
  receivingId: number;
  occurredAtIso: string;
}): string {
  return `unbox-lookup-scan:${args.organizationId}:${args.receivingId}:${args.occurredAtIso}`;
}
