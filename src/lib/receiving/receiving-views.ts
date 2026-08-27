/**
 * Single source of truth for the `view` axis on `/api/receiving-lines`.
 *
 * Both the API route handler (which branches its SQL `WHERE` on the view) and
 * the client table (which decides *which* view each display mode requests) MUST
 * import from here. Previously each side declared its own literal union; they
 * drifted — the server learned `activity`/`testing` while the client union
 * still capped out at `incoming`, so the client literally could not request the
 * view History needed. That drift is exactly what let "incoming orders" leak
 * into the History tab. Keep this list authoritative and let the compiler
 * enforce it on both ends.
 */

/**
 * Every server-supported value of `?view=`.
 *
 * - `all`      — the broad search/scan-resolution bucket; INCLUDES
 *                untouched-incoming EXPECTED rows. Used by the Receive
 *                workspace. (`recent` was removed in the Wave-2 dead-arm
 *                cleanup — zero consumers.)
 * - `received` — physically in the warehouse (MATCHED → DONE).
 * - `incoming` — Zoho POs issued but not yet touched (EXPECTED, 0 received).
 * - `incoming_removed` — the inverse of `incoming`: PO lines that HAVE left the
 *                Incoming list within the recency window, each carrying the
 *                signals the removal-reason registry resolves ("unboxed",
 *                "received upstream", …). Derived, not stored — there is no
 *                `removed_at` column and no lane table; the exits are read
 *                from the same evidence Incoming reads to exclude them.
 * - `activity` — Unbox-touched / unboxed work (not door-scan-only). The feed
 *                backing the History tab; lineless unmatched placeholders must
 *                also be opened or unboxed.
 * - `scanned`  — door-scanned and physically in, but NOT yet unboxed
 *                (received_at set, unboxed_at null, nothing received on the
 *                line). The triage "to-do" between the door scan and the unbox
 *                step. Disjoint from `activity` (which requires qty>0 / unboxed).
 * - `testing`  — lines with at least one recorded testing verdict.
 * - `needs-test` — units physically received and flagged `needs_test`, NOT yet
 *                tested (no terminal verdict). The testing TO-DO feed, ordered
 *                newest-received first so freshly-unboxed units surface at the
 *                top for real-time pickup. Distinct from `testing` (the
 *                already-tested log). Optional `?tester=` filters to a tech's
 *                own assigned units (assigned_tech_id).
 * - `testing_opened` — lines THIS staffer recently OPENED on Quality Control,
 *                newest-opened first. Per-staff, backed by
 *                receiving_line_testing_opens (upserted on open). Powers the
 *                Testing sidebar Recent rail. Isolated from Unbox `viewed`.
 * - `viewed`   — lines the requesting staff recently OPENED in the receiving
 *                workspace, newest-opened first. Per-staff, backed by
 *                receiving_line_views (upserted on open). Powers the unbox
 *                sidebar's "Viewed" pill.
 * - `unbox_opened` — cartons scanned on the Unbox surface (ops_events
 *                    UNBOX_SCAN_OPENED). Found + unfound, unboxed or not.
 *                    Powers the Unbox sidebar's "Unboxed" pill.
 */
export const RECEIVING_VIEWS = [
  'all',
  'received',
  'incoming',
  'incoming_removed',
  'activity',
  'scanned',
  'unbox_opened',
  'testing',
  'needs-test',
  'testing_opened',
  'viewed',
] as const;

export type ReceivingView = (typeof RECEIVING_VIEWS)[number];

const RECEIVING_VIEW_SET: ReadonlySet<string> = new Set(RECEIVING_VIEWS);

/** True when `value` is one of the known {@link RECEIVING_VIEWS}. */
export function isReceivingView(value: unknown): value is ReceivingView {
  return typeof value === 'string' && RECEIVING_VIEW_SET.has(value);
}

/**
 * Parse a raw `?view=` query value. Returns the matched {@link ReceivingView},
 * or `null` for anything unrecognized/absent (the server treats `null` as
 * org-wide default scoping).
 */
export function parseReceivingView(raw: string | null | undefined): ReceivingView | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return isReceivingView(normalized) ? normalized : null;
}
