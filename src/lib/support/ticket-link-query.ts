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
 * Prefer the exact match among candidates; else the bare id.
 *
 * **Never substitutes a different ticket.** This used to fall back to "the sole
 * unlinked candidate" when the parsed id matched nothing, which silently linked
 * ticket Y after the operator typed id X. Harmless-looking while every query was
 * hand-typed; actively dangerous once the box is SEEDED with a carrier tracking
 * number (`TicketLinkPopover initialQuery`) — a 12-digit FedEx number parses as
 * an id, so a one-result tracking search turned Enter into "link that unrelated
 * ticket". The bare-id fallback below stays: pasting an id the search cannot
 * surface (e.g. one anchored elsewhere, hidden by anchor mode) is legitimate.
 */
export function resolveTicketIdForLink(
  query: string,
  tickets: TicketLinkCandidate[],
): number | null {
  const parsed = parseTicketIdQuery(query);
  if (parsed == null) return null;
  const exact = tickets.find((t) => t.id === parsed && !t.linkedToThis);
  return exact ? exact.id : parsed;
}
