/** Notification vocabulary — the ONE code source of truth for which ops events are notifiable, how they collapse, and what permission it… */

import type { OpsEntityType } from '@/lib/ops-event-types';
import type { PermissionString } from '@/lib/auth/permissions';

/** Ops-event parents a SUBSCRIPTION may anchor on. */
export const NOTIFIABLE_ENTITY_TYPES = [
  'receiving',
  'receiving_line',
  'serial_unit',
  'order',
  'fba_shipment',
  'repair',
  'warranty_claim',
] as const;

export type NotifiableEntityType = (typeof NOTIFIABLE_ENTITY_TYPES)[number];

/** Entity types present in ops_events but intentionally not notifiable. */
export const NON_NOTIFIABLE_ENTITY_TYPES: readonly OpsEntityType[] = ['shipment', 'other'];

export function isNotifiableEntityType(v: unknown): v is NotifiableEntityType {
  return typeof v === 'string' && (NOTIFIABLE_ENTITY_TYPES as readonly string[]).includes(v);
}

/** Entity types an INBOX ROW may anchor on — a strict superset of the subscribable parents, pinned to `staff_inbox_items_entity_type_chk`. */
export const INBOX_ENTITY_TYPES = [...NOTIFIABLE_ENTITY_TYPES, 'support_ticket', 'task'] as const;

export type InboxEntityType = (typeof INBOX_ENTITY_TYPES)[number];

export function isInboxEntityType(v: unknown): v is InboxEntityType {
  return typeof v === 'string' && (INBOX_ENTITY_TYPES as readonly string[]).includes(v);
}

/** What an inbox row CALLS the record it points at. */
export const INBOX_ENTITY_NOUN: Readonly<Record<InboxEntityType, string>> = {
  receiving: 'Carton',
  receiving_line: 'Line',
  serial_unit: 'Unit',
  order: 'Order',
  fba_shipment: 'FBA shipment',
  repair: 'Repair',
  warranty_claim: 'Claim',
  support_ticket: 'Ticket',
  task: 'Task',
};

/** Read-gate per entity type. */
export const ENTITY_VIEW_PERMISSION: Record<InboxEntityType, PermissionString> = {
  receiving: 'receiving.view',
  receiving_line: 'receiving.view',
  serial_unit: 'tech.view',
  order: 'orders.view',
  fba_shipment: 'fba.view',
  repair: 'repair.view',
  warranty_claim: 'warranty.view',
  /** `work_orders.claim`, NOT `integrations.zendesk` — and the difference is the whole point of the row. */
  support_ticket: 'work_orders.claim',
  /** Same gate as `GET /api/tasks`, which already shows the task to its assignees. */
  task: 'work_orders.claim',
};

/** A notifiable event. */
interface NotifiableEvent {
  /** ops_events.event_type */
  key: string;
  entityType: NotifiableEntityType;
  label: string;
  /** Events sharing a family collapse together inside the debounce window. */
  family: string;
  collapseParent?: { entityType: NotifiableEntityType; payloadIdKey: string };
  /** Default severity 0–3; rule subs may filter with match_severity_min. */
  severity: number;
}

/**
 * Phase 1 vocabulary — the receiving/unbox spine, which is the slice the Home
 * Inbox ships against first. Adding an event is one row here; nothing else in
 * the pipeline changes.
 */
export const NOTIFIABLE_EVENTS = {
  'order.ship_by.overdue_unfulfilled': {
    key: 'order.ship_by.overdue_unfulfilled',
    entityType: 'order',
    label: 'Past ship-by · check order',
    family: 'ship-by',
    severity: 2,
  },
  'receiving.carton.delivered': {
    key: 'receiving.carton.delivered',
    entityType: 'receiving',
    label: 'Carton delivered',
    family: 'delivery',
    severity: 1,
  },
  'receiving.carton.arrived': {
    key: 'receiving.carton.arrived',
    entityType: 'receiving',
    label: 'Carton scanned in',
    family: 'delivery',
    severity: 0,
  },
  'receiving.carton.opened': {
    key: 'receiving.carton.opened',
    entityType: 'receiving',
    label: 'Carton opened',
    family: 'unbox',
    severity: 0,
  },
  'receiving.carton.received': {
    key: 'receiving.carton.received',
    entityType: 'receiving',
    label: 'Carton received',
    family: 'unbox',
    severity: 1,
  },
  'receiving.line.unboxed': {
    key: 'receiving.line.unboxed',
    entityType: 'receiving_line',
    label: 'Line unboxed',
    family: 'unbox',
    // Collapse on the carton: the whole point of the fatigue design.
    collapseParent: { entityType: 'receiving', payloadIdKey: 'receivingId' },
    severity: 0,
  },
  'receiving.line.exception': {
    key: 'receiving.line.exception',
    entityType: 'receiving_line',
    label: 'Receiving exception',
    family: 'exception',
    collapseParent: { entityType: 'receiving', payloadIdKey: 'receivingId' },
    severity: 2,
  },
} as const satisfies Record<string, NotifiableEvent>;

type NotifiableEventKey = keyof typeof NOTIFIABLE_EVENTS;

const NOTIFIABLE_EVENT_KEYS = Object.keys(NOTIFIABLE_EVENTS) as NotifiableEventKey[];

function isNotifiableEventKey(v: unknown): v is NotifiableEventKey {
  return typeof v === 'string' && Object.hasOwn(NOTIFIABLE_EVENTS, v);
}

/** Directly-addressed acts — deliberately a SEPARATE registry from `NOTIFIABLE_EVENTS`, not a row in it. */
const ASSIGNMENT_EVENTS = {
  'work_task.assigned': {
    key: 'work_task.assigned',
    label: 'Handed to you',
  },
  'order_note.mentioned': {
    key: 'order_note.mentioned',
    label: 'Mentioned you',
  },
} as const;

type AssignmentEventKey = keyof typeof ASSIGNMENT_EVENTS;

/** The event key a thrown task writes onto its inbox row. */
export const WORK_TASK_ASSIGNED: AssignmentEventKey = 'work_task.assigned';

/** The event key an order-note @mention writes onto its inbox row. */
export const ORDER_NOTE_MENTIONED: AssignmentEventKey = 'order_note.mentioned';

/** Label for any inbox row, from whichever registry owns its key. */
export function eventLabelFor(key: string): string {
  const assigned = (ASSIGNMENT_EVENTS as Record<string, { label: string }>)[key];
  if (assigned) return assigned.label;
  return notifiableEvent(key)?.label ?? key;
}

export function notifiableEvent(key: string): NotifiableEvent | null {
  return isNotifiableEventKey(key) ? NOTIFIABLE_EVENTS[key] : null;
}

/** Expand a subscriber-authored pattern into exact event keys. */
export function expandEventPattern(pattern: string): NotifiableEventKey[] {
  const raw = pattern.trim();
  if (!raw) return [];
  if (raw === '*') return [...NOTIFIABLE_EVENT_KEYS];
  if (raw.endsWith('.*')) {
    const prefix = raw.slice(0, -1); // keep the trailing dot
    return NOTIFIABLE_EVENT_KEYS.filter((k) => k.startsWith(prefix));
  }
  return isNotifiableEventKey(raw) ? [raw] : [];
}

export function expandEventPatterns(patterns: readonly string[]): NotifiableEventKey[] {
  const out = new Set<NotifiableEventKey>();
  for (const p of patterns) for (const k of expandEventPattern(p)) out.add(k);
  return [...out];
}

/** Collapse key — "which existing inbox row may absorb this event". */
export function buildCollapseKey(args: {
  eventKey: string;
  entityType: string;
  entityId: number;
  payload?: unknown;
}): string {
  const def = notifiableEvent(args.eventKey);
  const family = def?.family ?? 'event';
  const parent = def?.collapseParent;
  if (parent) {
    const parentId = readNumericPayloadField(args.payload, parent.payloadIdKey);
    if (parentId != null) return `${parent.entityType}:${parentId}:${family}`;
  }
  return `${args.entityType}:${args.entityId}:${family}`;
}

/** Dedup key — "have I already delivered THIS event to THIS staffer". */
export function buildDedupKey(args: { clientEventId: string | null; opsEventId: number }): string {
  return args.clientEventId ? `ce:${args.clientEventId}` : `oe:${args.opsEventId}`;
}

function readNumericPayloadField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as Record<string, unknown>)[key];
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
