/**
 * Media Library claims search — promote a typed Zendesk ticket number into the
 * `ticketId` leaf filter (same folder NAS archive uses).
 */

/** Digits-only ticket id from a search face (`9599`, `#9599`), or null. */
export function parsePhotoLibraryTicketSearch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.trim().replace(/^#/, '');
  return /^\d+$/.test(digits) ? digits : null;
}

/**
 * Search box face for the library chrome: poFinder / free-text, else the active
 * claims ticket leaf so Sync-to-NAS context stays visible in the field.
 */
export function photoLibrarySearchFace(input: {
  poFinder?: string | null;
  q?: string | null;
  ticketId?: string | null;
  sourceScope?: string | null;
}): string {
  if (input.poFinder?.trim()) return input.poFinder.trim();
  if (input.q?.trim()) return input.q.trim();
  if (input.sourceScope === 'claims' && input.ticketId?.trim()) {
    return input.ticketId.trim().replace(/^#/, '');
  }
  return '';
}
