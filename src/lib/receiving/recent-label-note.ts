/**
 * Client-safe helpers for Unbox notes-composer **Recent**.
 * DB fetch lives in {@link ./recent-label-note-server} (route-only):
 * newest scanned carton that has a face note → the line that owns that face.
 */

/** Pick the face text an Unbox carton sticker actually shows for a line. */
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
  /** `receiving_line.face_noted_at` — when the FACE TEXT last changed. */
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

/** Resolve Recent from ranked candidates — freshest face first, already filtered to lines that have some face text (see the server module… */
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

/** Does a persisted line update make the Recent phrase on screen wrong? */
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
