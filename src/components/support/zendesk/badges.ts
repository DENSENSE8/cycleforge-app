/**
 * Zendesk-specific status/priority badge maps. The generic
 * design-system StatusBadge only covers a couple of these, so the console
 * uses its own complete map. Status faces are the ONE ticket status map
 * (`@/design-system/tokens/ticket-status`) the Tasks board and phone read too.
 */

import { TICKET_STATUSES, TICKET_STATUS_FACE, parseTicketStatus, type TicketStatusFace } from '@/design-system/tokens/ticket-status';

interface BadgeStyle {
  label: string;
  className: string;
}

const badgeClass = (face: TicketStatusFace) => `${face.pill} ring-1 ${face.ring}`;

const NEUTRAL = badgeClass(TICKET_STATUS_FACE.closed);

const PRIORITY_BADGE: Record<string, BadgeStyle> = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  high: { label: 'High', className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  normal: { label: 'Normal', className: 'bg-surface-canvas text-text-muted ring-1 ring-border-soft' },
  low: { label: 'Low', className: 'bg-surface-canvas text-text-soft ring-1 ring-border-soft' },
};

export function statusBadge(status?: string | null): BadgeStyle {
  const key = parseTicketStatus(status);
  return key ? { label: TICKET_STATUS_FACE[key].label, className: badgeClass(TICKET_STATUS_FACE[key]) } : { label: status || '—', className: NEUTRAL };
}

/** Returns null for normal/low/unset so the UI can hide low-signal priorities. */
export function priorityBadge(priority?: string | null): BadgeStyle | null {
  const key = String(priority ?? '').toLowerCase();
  return PRIORITY_BADGE[key] ?? null;
}

/** Zendesk status → the one-row-anatomy status dot (the saturated sibling of the badge). */
export function statusDot(status?: string | null): string {
  const key = parseTicketStatus(status);
  return key ? TICKET_STATUS_FACE[key].dot : 'bg-border-emphasis';
}

export const STATUS_OPTIONS: { value: string; label: string }[] = TICKET_STATUSES.map((value) => ({
  value,
  label: TICKET_STATUS_FACE[value].label,
}));

export const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];
