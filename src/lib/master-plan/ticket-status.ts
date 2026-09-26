/** TicketStatus / AgentLog contract — agentic-loop master plan (ALP-0.4). */

export const TICKET_STATUSES = ['pending', 'in-progress', 'deployed'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

/**
 * Strict parse — returns the status or null. Callers that render or mutate MUST
 * treat null as invalid (render an "invalid status" state / refuse the mutation),
 * never default to `pending`.
 */
export function parseTicketStatus(value: unknown): TicketStatus | null {
  return isTicketStatus(value) ? value : null;
}

/** Props contract for the `<TicketStatus />` MDX component. */
export interface TicketStatusProps {
  status: TicketStatus;
  /** Stable ticket identifier, e.g. `ALP-3.2` or `P1-TRACE-02`. */
  ticketId: string;
  /** Optional deep link to the ticket's plan doc. */
  href?: string;
  /** Set when status becomes `deployed` — the commit that shipped the fix. */
  resolutionCommit?: string;
}

/** Props contract for the `<AgentLog />` MDX component. */
export interface AgentLogProps {
  /** `cycle_forge_runs.run_uid` to link the plan to run history. */
  runUid: string;
  /** Forge pipeline stage the log refers to, e.g. `verify`. */
  stage?: string;
}

/** A `<TicketStatus />` tag found in the raw MDX, with its span for mutation. */
export interface ScannedTicket {
  ticketId: string;
  /** Parsed status, or null when the tag carries an out-of-enum value. */
  status: TicketStatus | null;
  /** The raw (unvalidated) status attribute as written in the MDX. */
  rawStatus: string;
  href?: string;
  resolutionCommit?: string;
  /** Character offsets of the whole tag in the source string. */
  start: number;
  end: number;
  /** The full raw tag text. */
  raw: string;
}

const TICKET_TAG_RE = /<TicketStatus\b([^>]*?)\/?>/g;
const ATTR_RE = /([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g;

function parseAttrs(attrSource: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of attrSource.matchAll(ATTR_RE)) attrs[m[1]] = m[2];
  return attrs;
}

/**
 * Scan a raw master-plan MDX string for every `<TicketStatus />` tag.
 * Pure + order-preserving; tags with invalid statuses are INCLUDED with
 * `status: null` so callers can surface (not hide) contract violations.
 */
export function scanTicketStatuses(mdx: string): ScannedTicket[] {
  const out: ScannedTicket[] = [];
  for (const m of mdx.matchAll(TICKET_TAG_RE)) {
    const attrs = parseAttrs(m[1] ?? '');
    const ticketId = attrs.ticketId ?? '';
    if (!ticketId) continue; // a TicketStatus without a ticketId is inert noise
    out.push({
      ticketId,
      status: parseTicketStatus(attrs.status),
      rawStatus: attrs.status ?? '',
      href: attrs.href || undefined,
      resolutionCommit: attrs.resolutionCommit || undefined,
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
  return out;
}

export interface SetTicketStatusResult {
  /** The updated MDX (unchanged reference-equal string when not found). */
  mdx: string;
  /** True when a tag with the ticketId was found and rewritten. */
  changed: boolean;
  previousStatus: TicketStatus | null;
}

/** Pure string transform: */
export function setTicketStatusInMdx(
  mdx: string,
  ticketId: string,
  status: TicketStatus,
  extras?: { resolutionCommit?: string },
): SetTicketStatusResult {
  const tickets = scanTicketStatuses(mdx);
  const hit = tickets.find((t) => t.ticketId === ticketId);
  if (!hit) return { mdx, changed: false, previousStatus: null };

  const attrs = parseAttrs(hit.raw.replace(/^<TicketStatus\b/, '').replace(/\/?>$/, ''));
  attrs.status = status;
  attrs.ticketId = ticketId;
  if (extras?.resolutionCommit) attrs.resolutionCommit = extras.resolutionCommit;
  // A ticket leaving `deployed` no longer has a resolution commit.
  if (status !== 'deployed' && !extras?.resolutionCommit) delete attrs.resolutionCommit;

  const ORDER = ['status', 'ticketId', 'href', 'resolutionCommit'];
  const keys = [...ORDER.filter((k) => k in attrs), ...Object.keys(attrs).filter((k) => !ORDER.includes(k))];
  const rebuilt = `<TicketStatus ${keys.map((k) => `${k}="${attrs[k]}"`).join(' ')} />`;

  return {
    mdx: mdx.slice(0, hit.start) + rebuilt + mdx.slice(hit.end),
    changed: rebuilt !== hit.raw,
    previousStatus: hit.status,
  };
}

/** Rollup used by the plan header + the ops-plans table integration. */
export interface TicketStatusRollup {
  total: number;
  pending: number;
  inProgress: number;
  deployed: number;
  /** Tags whose raw status is outside the locked enum. */
  invalid: number;
}

export function rollupTicketStatuses(tickets: readonly ScannedTicket[]): TicketStatusRollup {
  const rollup: TicketStatusRollup = { total: tickets.length, pending: 0, inProgress: 0, deployed: 0, invalid: 0 };
  for (const t of tickets) {
    if (t.status === 'pending') rollup.pending += 1;
    else if (t.status === 'in-progress') rollup.inProgress += 1;
    else if (t.status === 'deployed') rollup.deployed += 1;
    else rollup.invalid += 1;
  }
  return rollup;
}
