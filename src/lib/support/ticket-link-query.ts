/**
 * Pure helpers for ticket-link paste / #id resolution (shared by TicketLinkPopover
 * and PackZendeskSection).
 */

export interface TicketLinkCandidate {
  id: number;
  subject: string | null;
  status: string;
  linkedToThis: boolean;
}

/** Parse `#4821` / `4821` — returns null when not a bare ticket id. */
export function parseTicketIdQuery(raw: string): number | null {
  const m = /^#?(\d{1,12})$/.exec(raw.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Resolve which ticket id to link for a paste/#id Enter path.
 * Prefer exact match among candidates; else single unlinked hit; else bare id.
 */
export function resolveTicketIdForLink(
  query: string,
  tickets: TicketLinkCandidate[],
): number | null {
  const parsed = parseTicketIdQuery(query);
  if (parsed == null) return null;
  const exact = tickets.find((t) => t.id === parsed && !t.linkedToThis);
  if (exact) return exact.id;
  const unlinked = tickets.filter((t) => !t.linkedToThis);
  if (unlinked.length === 1) return unlinked[0].id;
  // exact returned above when present; here it is always undefined → bare id.
  return parsed;
}
