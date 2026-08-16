/**
 * Pure helpers for ticket-link paste / #id resolution (shared by TicketLinkPopover,
 * PackZendeskSection, and listTicketLinkCandidates).
 *
 * Carrier tracking (12-digit FedEx, UPS 1Z…, …) must NEVER resolve as a Zendesk
 * ticket id — seeding Claim Link / TicketLinkPopover with carton tracking would
 * otherwise call getTicket(fedexDigits) and miss searchTickets entirely.
 */

import { detectCarrier } from '@/lib/tracking-format';

export interface TicketLinkCandidate {
  id: number;
  subject: string | null;
  status: string;
  linkedToThis: boolean;
}

/** How {@link listTicketLinkCandidates} should resolve a link-search box query. */
type TicketLinkQueryKind =
  | { kind: 'recent' }
  | { kind: 'id'; ticketId: number }
  | { kind: 'search'; query: string };

/**
 * Choose recent / getTicket / searchTickets for a link-candidates query.
 *
 * | Query | Path |
 * | `#12345` | id (explicit) |
 * | Bare digits, Unknown carrier, ≤12 chars | id (typed ticket #) |
 * | Carrier-detected tracking or any other text | search |
 */
export function resolveTicketLinkQueryKind(raw: string): TicketLinkQueryKind {
  const query = raw.trim();
  if (!query) return { kind: 'recent' };

  const hashId = /^#(\d{1,12})$/.exec(query);
  if (hashId) {
    const ticketId = Number(hashId[1]);
    if (Number.isFinite(ticketId) && ticketId > 0) return { kind: 'id', ticketId };
  }

  const bareDigits = /^(\d{1,12})$/.exec(query);
  if (bareDigits) {
    // FedEx Express is commonly 12 digits — must search, not getTicket.
    if (detectCarrier(query) !== 'Unknown') {
      return { kind: 'search', query };
    }
    const ticketId = Number(bareDigits[1]);
    if (Number.isFinite(ticketId) && ticketId > 0) return { kind: 'id', ticketId };
  }

  return { kind: 'search', query };
}

/** Results-list eyebrow for TicketPicker — seeded carton tracking paints as Suggested. */
export function ticketLinkResultsEyebrow(ticketQuery: string, seededQuery: string): string {
  const q = ticketQuery.trim();
  if (!q) return 'Recent tickets';
  if (seededQuery.length > 0 && q === seededQuery) return 'Suggested from tracking';
  return 'Results';
}

/**
 * Parse `#4821` / short bare `4821` — returns null for carrier tracking and
 * free-text search queries.
 */
export function parseTicketIdQuery(raw: string): number | null {
  const resolved = resolveTicketLinkQueryKind(raw);
  return resolved.kind === 'id' ? resolved.ticketId : null;
}

/**
 * Resolve which ticket id to link for a paste/#id Enter path.
 * Prefer the exact match among candidates; else the bare id.
 *
 * **Never substitutes a different ticket.** This used to fall back to "the sole
 * unlinked candidate" when the parsed id matched nothing, which silently linked
 * ticket Y after the operator typed id X. Harmless-looking while every query was
 * hand-typed; actively dangerous once the box is SEEDED with a carrier tracking
 * number (`TicketLinkPopover initialQuery`) — a 12-digit FedEx number must not
 * parse as an id (see {@link resolveTicketLinkQueryKind}). The bare-id fallback
 * below stays: pasting an id the search cannot surface (e.g. one anchored
 * elsewhere, hidden by anchor mode) is legitimate.
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
