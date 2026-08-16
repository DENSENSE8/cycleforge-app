/**
 * Client-safe helpers for Unbox notes-composer **Recent**.
 * DB fetch lives in {@link ./recent-label-note-server} (route-only):
 * newest scanned carton that has a face note → label_note / notes.
 */

/**
 * Pick the face text from a line row: printed `label_note` first, else `notes`.
 */
export function pickLabelFaceNote(opts: {
  labelNote?: string | null;
  notes?: string | null;
}): string | null {
  const label = (opts.labelNote || '').trim();
  if (label) return label;
  const notes = (opts.notes || '').trim();
  return notes || null;
}

/** React Query key — under `receiving` so feed invalidation refreshes Recent. */
export function recentLabelNoteQueryKey(excludeLineId: number | null | undefined) {
  return ['receiving', 'recent-label-note', excludeLineId ?? null] as const;
}
