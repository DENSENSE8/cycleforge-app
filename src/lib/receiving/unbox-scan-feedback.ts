/**
 * The Unbox scan-feedback model — pure, so the header line, the history list
 * and the ticket pairing decision are testable without a browser.
 *
 * One entry per Unbox scan: the found / unfound verdict, the carton it opened
 * (once lookup-po returns), and — for an unfound carton — which Zendesk ticket
 * got linked to it. The live store is `unbox-scan-feedback-store.ts`.
 */

export type UnboxScanPhase = 'checking' | 'found' | 'unfound' | 'error';

/** A ticket as the pairing step needs it (subset of `TicketCandidate`). */
export interface UnboxTicketCandidate {
  readonly id: number;
  readonly subject: string | null;
  readonly status: string | null;
  readonly url: string | null;
  readonly linkedToThis: boolean;
}

export type UnboxTicketPairing =
  | { readonly state: 'searching' }
  | {
      readonly state: 'paired';
      readonly ticketId: number;
      readonly subject: string | null;
      readonly status: string | null;
      readonly url: string | null;
    }
  | { readonly state: 'choose'; readonly candidates: readonly UnboxTicketCandidate[] }
  | { readonly state: 'none' }
  | { readonly state: 'not_connected' }
  | { readonly state: 'error' };

export interface UnboxScanFeedback {
  readonly id: number;
  readonly tracking: string;
  /** The carton lookup-po opened for this scan; null until it returns. */
  readonly receivingId: number | null;
  readonly phase: UnboxScanPhase;
  /** Lines already on the carton (found via an opened carton). */
  readonly lineCount: number;
  /** Ticket pairing — only ever set on an unfound carton. */
  readonly ticket: UnboxTicketPairing | null;
  readonly at: number;
}

/** Newest-first history cap. */
export const UNBOX_FEEDBACK_LOG_CAP = 20;

// ── pairing decision ─────────────────────────────────────────────────────────

export type UnfoundPairingDecision =
  | { readonly kind: 'already'; readonly ticket: UnboxTicketCandidate }
  | { readonly kind: 'link'; readonly ticket: UnboxTicketCandidate }
  | { readonly kind: 'choose'; readonly candidates: readonly UnboxTicketCandidate[] }
  | { readonly kind: 'none' };

/**
 * What to do with the tickets that mention an unfound carton's tracking.
 * The candidates route (anchor mode) already hides tickets linked to another
 * item, so every candidate here is either free or `linkedToThis`.
 *  - one already linked to this carton → it is paired; never re-post;
 *  - exactly one free ticket → link it automatically;
 *  - several → the operator picks;
 *  - none → say so.
 */
export function decideUnfoundPairing(
  candidates: readonly UnboxTicketCandidate[],
): UnfoundPairingDecision {
  const linked = candidates.find((t) => t.linkedToThis);
  if (linked) return { kind: 'already', ticket: linked };
  if (candidates.length === 1) return { kind: 'link', ticket: candidates[0] };
  if (candidates.length > 1) return { kind: 'choose', candidates };
  return { kind: 'none' };
}

export function pairedFrom(ticket: UnboxTicketCandidate): UnboxTicketPairing {
  return {
    state: 'paired',
    ticketId: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    url: ticket.url,
  };
}

// ── the one sentence ─────────────────────────────────────────────────────────

/** The scanned tracking, whole — the operator matches it digit for digit against the label in hand. */
export function displayTracking(tracking: string): string {
  return tracking.replace(/\s+/g, '');
}

function ticketClause(ticket: UnboxTicketPairing): string {
  switch (ticket.state) {
    case 'searching':
      return 'searching tickets…';
    case 'paired':
      return `linked to #${ticket.ticketId}`;
    case 'choose':
      return `${ticket.candidates.length} tickets, pick one`;
    case 'none':
      return 'no ticket mentions it';
    case 'not_connected':
      return 'connect Zendesk';
    case 'error':
      return 'ticket search failed';
  }
}

/**
 * The top-left sentence for one scan. The FULL tracking number always sits
 * right after the verb (owner 2026-09-29: never a truncated tail), so when the
 * slot is too narrow the outcome clause is what the ellipsis eats, never the
 * number.
 */
export function unboxFeedbackLine(entry: UnboxScanFeedback): string {
  const tracking = displayTracking(entry.tracking);
  switch (entry.phase) {
    case 'checking':
      return `Checking ${tracking}…`;
    case 'found':
      return `Found ${tracking} — order on file`;
    case 'unfound':
      return `Unfound ${tracking} — ${entry.ticket ? ticketClause(entry.ticket) : 'no order matches'}`;
    case 'error':
      return `Couldn’t check ${tracking} — scan again`;
  }
}

/**
 * Glyph + tone key for an entry. Every ticket state wears the ticket glyph —
 * the line is then ABOUT the ticket — toned by outcome.
 */
export type UnboxFeedbackFace =
  | 'checking'
  | 'found'
  | 'unfound'
  | 'error'
  | 'ticket-searching'
  | 'ticket-linked'
  | 'ticket-open'
  | 'ticket-off'
  | 'ticket-error';

export function unboxFeedbackFace(entry: UnboxScanFeedback): UnboxFeedbackFace {
  if (entry.phase !== 'unfound' || !entry.ticket) return entry.phase;
  switch (entry.ticket.state) {
    case 'searching':
      return 'ticket-searching';
    case 'paired':
      return 'ticket-linked';
    case 'choose':
    case 'none':
      return 'ticket-open';
    case 'not_connected':
      return 'ticket-off';
    case 'error':
      return 'ticket-error';
  }
}

// ── log operations ───────────────────────────────────────────────────────────

/** Prepend a new scan, keeping the newest {@link UNBOX_FEEDBACK_LOG_CAP}. */
export function pushFeedback(
  log: readonly UnboxScanFeedback[],
  entry: UnboxScanFeedback,
): readonly UnboxScanFeedback[] {
  return [entry, ...log].slice(0, UNBOX_FEEDBACK_LOG_CAP);
}

export function patchFeedback(
  log: readonly UnboxScanFeedback[],
  id: number,
  patch: Partial<Omit<UnboxScanFeedback, 'id'>>,
): readonly UnboxScanFeedback[] {
  let hit = false;
  const next = log.map((entry) => {
    if (entry.id !== id) return entry;
    hit = true;
    return { ...entry, ...patch };
  });
  return hit ? next : log;
}

function sameTracking(a: string, b: string): boolean {
  return a.replace(/\s+/g, '').toUpperCase() === b.replace(/\s+/g, '').toUpperCase();
}

/**
 * The scan a carton belongs to: the newest entry already stamped with this
 * carton, else the newest unstamped entry for the same tracking.
 */
export function findFeedbackForCarton(
  log: readonly UnboxScanFeedback[],
  receivingId: number,
  tracking: string | null,
): UnboxScanFeedback | null {
  const stamped = log.find((entry) => entry.receivingId === receivingId);
  if (stamped) return stamped;
  if (!tracking) return null;
  return log.find((entry) => entry.receivingId == null && sameTracking(entry.tracking, tracking)) ?? null;
}

/** The newest entry for this tracking still waiting on its verdict. */
export function findCheckingFeedback(
  log: readonly UnboxScanFeedback[],
  tracking: string,
): UnboxScanFeedback | null {
  return log.find((entry) => entry.phase === 'checking' && sameTracking(entry.tracking, tracking)) ?? null;
}

/**
 * Found vs unfound for a carton a client rung resolved from rows it already
 * holds — the same rule the server probe applies: a PO / order on the carton,
 * or real lines on it, is found; anything else is an unfound carton.
 */
export function cartonScanVerdict(
  rows: ReadonlyArray<{
    id: number;
    receiving_id?: number | null;
    receiving_source?: string | null;
    zoho_purchaseorder_id?: string | null;
    zoho_purchaseorder_number?: string | null;
    source_order_id?: string | null;
  }>,
): { phase: 'found' | 'unfound'; receivingId: number | null; lineCount: number } {
  const lineCount = rows.filter((r) => r.id > 0).length;
  const hasOrder = rows.some(
    (r) => Boolean(r.zoho_purchaseorder_id || r.zoho_purchaseorder_number || r.source_order_id),
  );
  const unmatched = rows.every((r) => r.receiving_source === 'unmatched');
  return {
    phase: hasOrder || (lineCount > 0 && !unmatched) ? 'found' : 'unfound',
    receivingId: rows.find((r) => r.receiving_id != null)?.receiving_id ?? null,
    lineCount,
  };
}
