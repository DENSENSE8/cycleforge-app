/**
 * A helpdesk ticket's status (`support_tickets.status_cache`, Zendesk's
 * vocabulary) as every surface paints it — THE one map (owner 2026-09-30:
 * "status chips similar to pills for pending open and new for immediate
 * color recognition"). The support console's badges (`@/components/support/
 * zendesk/badges`), the Tasks board, the record rail and the phone all read
 * it. Dark pairs: every `*-50` ground, `*-700` ink and `*-200` ring/border
 * here is re-stepped under `html[data-color-scheme='dark']` in
 * `src/styles/globals.css`; the audited pill text is ≥ 4.5:1 in both themes.
 */

export const TICKET_STATUSES = ['new', 'open', 'pending', 'hold', 'solved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketStatusFace {
  label: string;
  /** Tinted ground + ink. */
  pill: string;
  /** Pill ring colour (pair with `ring-1`). */
  ring: string;
  /** Pill border colour (pair with a `border` width). */
  border: string;
  /** The saturated dot — a row's status mark. */
  dot: string;
}

const NEUTRAL: TicketStatusFace = {
  label: 'Closed',
  pill: 'bg-surface-sunken text-text-muted',
  ring: 'ring-border-soft',
  border: 'border-border-soft',
  dot: 'bg-border-emphasis',
};

export const TICKET_STATUS_FACE: Readonly<Record<TicketStatus, TicketStatusFace>> = {
  new: { label: 'New', pill: 'bg-sky-50 text-sky-700', ring: 'ring-sky-200', border: 'border-sky-200', dot: 'bg-sky-500' },
  open: { label: 'Open', pill: 'bg-rose-50 text-rose-700', ring: 'ring-rose-200', border: 'border-rose-200', dot: 'bg-rose-500' },
  pending: { label: 'Pending', pill: 'bg-amber-50 text-amber-700', ring: 'ring-amber-200', border: 'border-amber-200', dot: 'bg-amber-500' },
  hold: { label: 'On-hold', pill: 'bg-purple-50 text-purple-700', ring: 'ring-purple-200', border: 'border-purple-200', dot: 'bg-violet-500' },
  solved: { label: 'Solved', pill: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-200', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  closed: NEUTRAL,
};

/** A stored status → its key, matched case- and space-insensitively; null when outside the vocabulary. */
export function parseTicketStatus(raw: unknown): TicketStatus | null {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (TICKET_STATUSES as readonly string[]).includes(key) ? (key as TicketStatus) : null;
}

/** The face a stored status paints: its own, or neutral labelled as stored. Null when there is no status at all. */
export function ticketStatusFace(status: string | null | undefined): TicketStatusFace | null {
  const key = parseTicketStatus(status);
  if (key) return TICKET_STATUS_FACE[key];
  const stored = status?.trim();
  return stored ? { ...NEUTRAL, label: stored } : null;
}
