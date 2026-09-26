/** Media Library claims search — promote a ticket number carried by a claims deep link into the `ticketId` leaf filter (the same folder the… */

/** Digits-only ticket id from a search face (`9599`, `#9599`), or null. */
export function parsePhotoLibraryTicketSearch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.trim().replace(/^#/, '');
  return /^\d+$/.test(digits) ? digits : null;
}

