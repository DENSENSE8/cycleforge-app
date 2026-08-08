/**
 * Notification vocabulary — the ONE code source of truth for which ops events
 * are notifiable, how they collapse, and what permission it takes to see one.
 *
 * WHY THIS LIVES ONLY IN CODE:
 * The enqueue trigger (`fn_enqueue_notification_outbox`, migration 2026-07-28d)
 * is deliberately dumb — it copies EVERY `ops_events` row into
 * `notification_outbox`. The alternative (a DB-side "notifiable" flag or event
 * list) forks the vocabulary into DDL, where it drifts the moment someone adds
 * an event key — and the drift is silent: the notification simply never fires.
 * Here, the worker filters, so there is one list and one place to change it.
 *
 * Entity vocabulary is the PARENT-BACKED SUBSET of `OPS_EVENT_ENTITY_TYPES`
 * (src/lib/ops-events.ts) — the values that have a real parent table to hang
 * delete-integrity on. `event-vocabulary.test.ts` pins this against that SoT so
 * the two can never drift, and against the DB CHECK the migration installs.
 */

import type { OpsEntityType } from '@/lib/ops-event-types';
import type { PermissionString } from '@/lib/auth/permissions';

/**
 * Entity types a subscription / inbox item may anchor on.
 *
 * Deliberate gaps vs `OPS_EVENT_ENTITY_TYPES` (documented, not accidental —
 * polymorphic-tables.md rule 5 requires naming the skip):
 *   • 'shipment' — ops_events emits it, but this schema has no `shipments`
 *     parent table (`shipment_links` is a link table). No delete trigger is
 *     possible, so it cannot join the CHECK.
 *   • 'other'    — has no parent by definition.
 */
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

/**
 * Read-gate per entity type. A staffer must never be told about a record they
 * cannot open. Applied TWICE by design: the worker uses it as a cheap
 * write-time prefilter, and `GET /api/inbox` re-applies it as the authoritative
 * gate — otherwise a permission revoked AFTER delivery would leave the row
 * visible forever (the leak GitHub avoids by filtering at render).
 */
export const ENTITY_VIEW_PERMISSION: Record<NotifiableEntityType, PermissionString> = {
  receiving: 'receiving.view',
  receiving_line: 'receiving.view',
  serial_unit: 'tech.view',
  order: 'orders.view',
  fba_shipment: 'fba.view',
  repair: 'repair.view',
  warranty_claim: 'warranty.view',
};

/**
 * A notifiable event.
 *
 * `collapseParent` is the fatigue lever. When set, the collapse key is built
 * from the PARENT entity rather than the event's own entity — so a 200-line PO
 * receive folds into ONE inbox row per watcher instead of 200. The parent id is
 * carried on the ops_event payload under `collapseParentIdKey`; when it is
 * absent the event collapses on its own entity (correct but chattier).
 */
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

/**
 * Directly-addressed acts — deliberately a SEPARATE registry from
 * `NOTIFIABLE_EVENTS`, not a row in it.
 *
 * Everything in `NOTIFIABLE_EVENTS` is a domain event that flows
 * ops_events → outbox → worker, where recipients are DERIVED from
 * `staff_subscriptions`. Its shape encodes that: one `entityType` per key, and
 * `expandEventPattern` advertises every key as subscribable by a rule.
 *
 * An assignment is the opposite on both counts. The recipient is explicit — a
 * colleague chose them — so it never goes through the outbox, and it is not
 * subscribable: you cannot follow "tasks thrown at other people". It also
 * attaches to ANY notifiable entity type, so it has no single `entityType` to
 * declare. Adding it to NOTIFIABLE_EVENTS would mean writing a nominal entity
 * type that nothing reads (the worker uses the ROW's type, never the def's) and
 * advertising a rule subscription that can never fire.
 *
 * Two registries, two genuinely different jobs — but ONE label resolution
 * point, `eventLabelFor`, so the read path never has to know which it is.
 */
const ASSIGNMENT_EVENTS = {
  'work_task.assigned': {
    key: 'work_task.assigned',
    label: 'Handed to you',
  },
} as const;

type AssignmentEventKey = keyof typeof ASSIGNMENT_EVENTS;

/** The event key a thrown task writes onto its inbox row. */
export const WORK_TASK_ASSIGNED: AssignmentEventKey = 'work_task.assigned';

/**
 * Label for any inbox row, from whichever registry owns its key.
 *
 * Resolved at READ time — never a stored string, which would go stale the
 * moment a label is reworded. Falls back to the raw key so an unknown event
 * degrades to something identifiable rather than blank.
 */
export function eventLabelFor(key: string): string {
  const assigned = (ASSIGNMENT_EVENTS as Record<string, { label: string }>)[key];
  if (assigned) return assigned.label;
  return notifiableEvent(key)?.label ?? key;
}

export function notifiableEvent(key: string): NotifiableEvent | null {
  return isNotifiableEventKey(key) ? NOTIFIABLE_EVENTS[key] : null;
}

/**
 * Expand a subscriber-authored pattern into exact event keys.
 *
 * Rules are STORED expanded (exact string arrays) so the fan-out join is a
 * plain GIN membership test rather than a per-row LIKE — the same choice
 * PagerDuty and Datadog make for event routing. The cost is that a rule created
 * as `receiving.*` does not automatically pick up an event key added later;
 * `event-vocabulary.test.ts` pins the vocabulary so that drift is a visible
 * test failure, and re-expansion is a data migration at that point.
 */
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

/**
 * Collapse key — "which existing inbox row may absorb this event".
 *
 * Keyed on the collapse PARENT when the event declares one, so line-level churn
 * rolls up to the carton. Not to be confused with `dedupKey` (idempotency);
 * see `buildDedupKey`.
 */
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

/**
 * Dedup key — "have I already delivered THIS event to THIS staffer".
 *
 * Prefers the source event's `client_event_id` (the house idempotency thread,
 * backend-patterns.md) so a client retry that produced one ops_event cannot
 * produce two inbox rows. Falls back to the ops_event id, which is unique per
 * org by construction — `ops_events.client_event_id` is nullable, so a
 * client-id-only key would collide to NULL for every server-originated event.
 */
export function buildDedupKey(args: { clientEventId: string | null; opsEventId: number }): string {
  return args.clientEventId ? `ce:${args.clientEventId}` : `oe:${args.opsEventId}`;
}

function readNumericPayloadField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as Record<string, unknown>)[key];
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

