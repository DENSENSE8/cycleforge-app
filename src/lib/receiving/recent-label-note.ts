/**
 * Client-safe helpers for Unbox notes-composer **Recent**.
 * DB fetch lives in {@link ./recent-label-note-server} (route-only):
 * newest scanned carton that has a face note → the line that owns that face.
 */

/**
 * Pick the face text an Unbox carton sticker actually shows for a line.
 *
 * PRECEDENCE — `notes` first, `label_note` only as fallback. This looks
 * backwards next to the column comments, so here is why it is not:
 *
 * On Unbox the carton sticker center is the DOCK DRAFT. `liveCartonPayload`
 * (useUnboxLineController) spreads `{...defaultPayload, notes: itemNote}`, so
 * both the preview and Print · Receive print `receiving_line.notes`; carton
 * print then STAMPS `label_note := itemNote`. `label_note` is therefore either
 * equal to `notes` (printed) or older than it — never newer for this face.
 *
 * `label_note` was backfilled from `notes` by
 * `2026-07-31b_receiving_lines_label_note.sql`, so preferring it made Recent
 * paint the pre-split sentence on every carton the operator re-noted in the
 * dock and received WITHOUT printing. That is the "wrong Recent phrase" bug:
 * the sticker said `untested.....`, the backfilled `label_note` still said the
 * long sentence, and Recent echoed the sentence.
 *
 * `label_note` still wins when `notes` is blank — a face written only through
 * LabelEditPopover / As Listed is the sole face that line has.
 */
export function pickLabelFaceNote(opts: {
  labelNote?: string | null;
  notes?: string | null;
}): string | null {
  const notes = (opts.notes || '').trim();
  if (notes) return notes;
  const label = (opts.labelNote || '').trim();
  return label || null;
}

/** One `receiving_line` joined to the scan that brought its carton in. */
export type RecentFaceCandidate = {
  lineId: number;
  labelNote: string | null;
  notes: string | null;
  /** Carton this line belongs to — the grouping key for multi-line cartons. */
  receivingId: number | null;
  /** Scan time of that carton (the Recent walk axis). */
  appliedAt: string | null;
  trackingNumber: string | null;
  /** `receiving_line.updated_at` — which line on the carton was touched last. */
  lineUpdatedAt: string | null;
  /**
   * `receiving_line.face_noted_at` — when the FACE TEXT last changed.
   *
   * The honest recency clock, and the reason it is not `lineUpdatedAt`: that
   * one bumps on every condition / serial / qty patch, so ranking on it floats
   * an ancient sentence back up the moment someone grades an old carton. Null
   * on rows written before 2026-08-19 (never backfilled — see the migration).
   */
  faceNotedAt?: string | null;
};

export type RecentFaceRow = {
  note: string;
  lineId: number;
  appliedAt: string | null;
  trackingNumber: string | null;
  receivingId: number | null;
};

/**
 * When this candidate's face was written, as far as we can honestly tell:
 * the face clock, else the line's last touch for a row that predates it.
 */
function faceTime(row: RecentFaceCandidate): number {
  const stamped = row.faceNotedAt ? Date.parse(row.faceNotedAt) : NaN;
  if (Number.isFinite(stamped)) return stamped;
  return row.lineUpdatedAt ? Date.parse(row.lineUpdatedAt) : NaN;
}

/** Newest first; nulls last; `lineId` DESC breaks a tie. */
function fresherLine(a: RecentFaceCandidate, b: RecentFaceCandidate): boolean {
  const at = faceTime(a);
  const bt = faceTime(b);
  const aOk = Number.isFinite(at);
  const bOk = Number.isFinite(bt);
  if (aOk && bOk && at !== bt) return at > bt;
  if (aOk !== bOk) return aOk;
  return a.lineId > b.lineId;
}

/**
 * Resolve Recent from ranked candidates — freshest face first, already filtered
 * to lines that have some face text (see the server module for the ranking).
 *
 * Two-level pick, because a carton is not a line:
 *   1. CARTON — the one carrying the freshest face.
 *   2. LINE   — within that carton, the freshest face again ({@link faceTime}),
 *      i.e. the one the operator actually just labeled.
 *
 * Step 2 is the multi-line fix: ordering by "has a label_note" picked whichever
 * sibling SKU still carried the backfilled sentence instead of the line the
 * operator actually worked. Scan identity (`appliedAt` / `trackingNumber`) stays
 * the carton's newest scan, not the winning line's row.
 */
export function pickRecentFaceRow(
  rows: readonly RecentFaceCandidate[],
): RecentFaceRow | null {
  const noted = rows.filter((r) => pickLabelFaceNote(r) !== null);
  const head = noted[0];
  if (!head) return null;

  const sameCarton = (r: RecentFaceCandidate) =>
    head.receivingId == null
      ? r.lineId === head.lineId
      : r.receivingId === head.receivingId;

  let winner = head;
  for (const row of noted) {
    if (sameCarton(row) && fresherLine(row, winner)) winner = row;
  }
  // Scan facts come from the carton's newest scan row (rows are scan-ordered),
  // which may be a sibling line with no face note of its own.
  const scanRow = rows.find(sameCarton) ?? head;

  const note = pickLabelFaceNote(winner);
  if (!note) return null;
  return {
    note,
    lineId: winner.lineId,
    appliedAt: scanRow.appliedAt,
    trackingNumber: scanRow.trackingNumber,
    receivingId: winner.receivingId,
  };
}

/** Query-key root — invalidate this to drop every cached Recent answer. */
export const RECENT_LABEL_NOTE_QUERY_ROOT = ['receiving', 'recent-label-note'] as const;

/** React Query key — under `receiving` so feed invalidation refreshes Recent. */
export function recentLabelNoteQueryKey(excludeLineId: number | null | undefined) {
  return [...RECENT_LABEL_NOTE_QUERY_ROOT, excludeLineId ?? null] as const;
}

/**
 * Does a persisted line update make the Recent phrase on screen wrong?
 *
 * Closes the save→fetch race. The dock's note write is fire-and-forget
 * (`core.patch` → PATCH /api/receiving-lines), so opening the next carton can
 * fetch Recent BEFORE the previous carton's note lands — the walk then answers
 * with an older carton and keeps that answer for as long as the composer stays
 * mounted. `receiving-line-updated` carries the PERSISTED row once the write
 * resolves, which is the moment to drop the stale answer.
 *
 * Kept narrow so an unbox session's steady patch traffic (condition, verdict,
 * serial — every one of which broadcasts the full row) does not refetch on
 * every keystroke's worth of work:
 *   - no face text on the update → nothing Recent could show
 *   - the update IS the open line → excluded from Recent by construction
 *   - the persisted face already equals what Recent shows → nothing new
 */
export function shouldRefreshRecentFace(opts: {
  /** `id` from the `receiving-line-updated` detail. */
  updatedLineId: number | null | undefined;
  updatedLabelNote?: string | null;
  updatedNotes?: string | null;
  /** Line open in the composer — the one Recent excludes. */
  openLineId: number | null;
  /** Phrase Recent is currently showing (`''` when it has none). */
  shownPhrase: string;
}): boolean {
  const face = pickLabelFaceNote({
    labelNote: opts.updatedLabelNote,
    notes: opts.updatedNotes,
  });
  if (!face) return false;
  if (
    opts.updatedLineId != null &&
    opts.openLineId != null &&
    opts.updatedLineId === opts.openLineId
  ) {
    return false;
  }
  return face !== opts.shownPhrase.trim();
}
