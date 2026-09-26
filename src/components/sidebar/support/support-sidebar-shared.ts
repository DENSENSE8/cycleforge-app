/** Shared types + constants for the /support master-page sidebar. */

import {
  Bell,
  Check,
  Clock,
  Inbox,
  Layers,
  Lock,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
} from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { shippingOrdersHref } from '@/lib/shipping/orders-desk';

// ── Sidebar mode switcher ───────────────────────────────────────────────────

export type SupportMode =
  | 'tickets'
  | 'voicemail'
  | 'calls'
  | 'warranty'
  | 'issues'
  | 'orders';

/** - tickets → recent dock in sidebar + full queue workbench in the right pane (Orders/Unbox recipe); `?ticket=` opens Station focus. */

const DEFAULT_SUPPORT_MODE: SupportMode = 'tickets';

/** Live Support modes — includes default `tickets` (usually omitted from the URL). */
export const SUPPORT_MODES = [
  'tickets',
  'voicemail',
  'calls',
  'warranty',
  'issues',
  'orders',
] as const satisfies readonly SupportMode[];

export function parseSupportMode(raw: string | null | undefined): SupportMode {
  return raw === 'voicemail' ||
    raw === 'calls' ||
    raw === 'warranty' ||
    raw === 'issues' ||
    raw === 'orders'
    ? raw
    : 'tickets';
}

/**
 * Wire tokens `?mode=` may carry on `/support` (route-param hygiene / deep links).
 * Includes `tickets` — writers usually omit it, but `VoicemailDetail` and shared
 * links still write `?mode=tickets`. Do not round-trip {@link parseSupportMode}.
 */
export function parseSupportModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (SUPPORT_MODES as readonly string[]).includes(v) ? v : null;
}

/**
 * Deep link into Support › Inquiries — aliases the shared To-ship desk with
 * support context (ticket affordances on order focus).
 */
export function supportOrdersHref(orderPk: number): string {
  const id = Number(orderPk);
  if (!Number.isFinite(id) || id <= 0) {
    return shippingOrdersHref({ context: 'support' });
  }
  return shippingOrdersHref({ context: 'support', openOrderId: id });
}

/**
 * Deep link: open the order on Support › Inquiries and land on the New ticket
 * create form (order-anchored). Used by "Report an issue" on the order body.
 */
export function supportCreateTicketHref(orderPk: number): string {
  const id = Number(orderPk);
  if (!Number.isFinite(id) || id <= 0) {
    return shippingOrdersHref({ context: 'support', createTicket: true });
  }
  return shippingOrdersHref({
    context: 'support',
    openOrderId: id,
    createTicket: true,
  });
}

/** Escape hatch: full To-ship desk detail for the same order pk (no support context). */
export function dashboardOrderHref(orderPk: number): string {
  const id = Number(orderPk);
  if (!Number.isFinite(id) || id <= 0) return shippingOrdersHref();
  return shippingOrdersHref({ openOrderId: id });
}

/**
 * URL params owned by a specific mode. Cleared on a mode switch so the next
 * mode lands on a clean default state (sidebar-mode law #4).
 */

// ── Tickets mode — Zendesk status filter (workbench chrome tabs) ─────────────

/** Workbench status tabs for Support · Tickets (mirrors Orders `ustatus`). */
export type TicketStatusFilter = 'open' | 'pending' | 'hold' | 'solved' | 'all';

export const DEFAULT_TICKET_STATUS: TicketStatusFilter = 'open';

export const TICKET_STATUS_ITEMS: HorizontalSliderItem[] = [
  { id: 'open', label: 'Open', icon: Inbox },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'hold', label: 'Hold', icon: Lock },
  { id: 'solved', label: 'Solved', icon: Check },
  { id: 'all', label: 'All', icon: Layers },
];

/** Parse `?tstatus=` — default `open` (omit from URL when default). */
export function parseTicketStatus(raw: string | null | undefined): TicketStatusFilter {
  return raw === 'pending' || raw === 'hold' || raw === 'solved' || raw === 'all'
    ? raw
    : DEFAULT_TICKET_STATUS;
}

// ── Voicemail mode — follow-up status filter ────────────────────────────────

export type VoicemailStatusFilter = 'open' | 'snoozed' | 'done' | 'all';

export const VOICEMAIL_STATUS_ITEMS: HorizontalSliderItem[] = [
  { id: 'open', label: 'Open', icon: Bell },
  { id: 'snoozed', label: 'Snoozed', icon: Clock },
  { id: 'done', label: 'Done', icon: Check },
  { id: 'all', label: 'All', icon: Layers },
];

function parseVoicemailStatus(raw: string | null | undefined): VoicemailStatusFilter {
  return raw === 'snoozed' || raw === 'done' || raw === 'all' ? raw : 'open';
}

// ── Calls mode — direction filter ───────────────────────────────────────────

export type CallDirectionFilter = 'all' | 'inbound' | 'outbound' | 'missed';

export const CALL_DIRECTION_ITEMS: HorizontalSliderItem[] = [
  { id: 'all', label: 'All', icon: Phone },
  { id: 'inbound', label: 'In', icon: PhoneIncoming },
  { id: 'outbound', label: 'Out', icon: PhoneOutgoing },
  { id: 'missed', label: 'Missed', icon: PhoneMissed },
];

export function parseCallDirection(raw: string | null | undefined): CallDirectionFilter {
  return raw === 'inbound' || raw === 'outbound' || raw === 'missed' ? raw : 'all';
}
