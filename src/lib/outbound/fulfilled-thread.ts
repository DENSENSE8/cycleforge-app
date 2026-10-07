/**
 * ONE thread per fulfilled order (operator 2026-10-06,
 * `HANDOFF-fulfilled-drilldown.md` R6): the staff notes on any of the order's
 * lines (`order_notes`, @mentions as `@[Name](staff:ID)` tokens), the desk's
 * own events on the order (`ops_events`, entity `order` — assigned, alert
 * sent, watch set / fired), and every change of the carrier's status (from the
 * package record's carrier scans) — in one chronological list, oldest first.
 * Pure: the reads live in `./fulfilled-thread-read.ts`.
 */

import type { ShipmentRecordAction } from '@/lib/shipments/shipment-record-types';
import { carrierStatusLabel } from '@/lib/status/record-status';
import { formatMonthDayTimePST } from '@/utils/date';

/** The desk's verbs on an order, as `ops_events.event_type` (entity `order`, `entity_id` = `orders.id`). */
export const FULFILLED_DESK_EVENTS = {
  assigned: 'order.desk.assigned',
  alertSent: 'order.desk.alert_sent',
  watchSet: 'order.desk.watch_set',
  watchFired: 'order.desk.watch_fired',
} as const;
export type FulfilledDeskEvent = (typeof FULFILLED_DESK_EVENTS)[keyof typeof FULFILLED_DESK_EVENTS];
export const FULFILLED_DESK_EVENT_TYPES: readonly FulfilledDeskEvent[] = Object.values(FULFILLED_DESK_EVENTS);

/** One order is a handful of lines; a thread read naming more is not one order. */
export const FULFILLED_THREAD_MAX_LINES = 50;

export interface FulfilledThreadNote {
  id: string;
  orderRowId: number;
  /** Stored text, mention tokens intact. */
  text: string;
  authorName: string | null;
  at: string;
}

export interface FulfilledThreadEvent {
  id: string;
  orderRowId: number;
  type: FulfilledDeskEvent;
  actorName: string | null;
  at: string;
  payload: Readonly<Record<string, unknown>>;
}

/** `GET /api/fulfilled/thread` — the stored half of the thread. */
export interface FulfilledThreadRead {
  notes: FulfilledThreadNote[];
  events: FulfilledThreadEvent[];
}

export type FulfilledThreadItem =
  | { kind: 'note'; id: string; at: string; author: string | null; text: string }
  | { kind: 'event'; id: string; at: string; actor: string | null; label: string }
  | { kind: 'carrier'; id: string; at: string; label: string; detail: string | null };

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** One desk event as a sentence (`Assigned to Ana · due Oct 7, 5:00 PM`). */
export function fulfilledDeskEventLabel(type: FulfilledDeskEvent, payload: Readonly<Record<string, unknown>>): string {
  const who = text(payload.staffName) ?? 'a staffer';
  switch (type) {
    case FULFILLED_DESK_EVENTS.assigned: {
      const due = text(payload.dueAt);
      return `Assigned to ${who}${due ? ` · due ${formatMonthDayTimePST(due)}` : ''}`;
    }
    case FULFILLED_DESK_EVENTS.alertSent:
      return `Urgent ping to ${who}`;
    case FULFILLED_DESK_EVENTS.watchSet:
      return payload.on === false ? `${who} stopped watching` : `${who} is watching for carrier changes`;
    case FULFILLED_DESK_EVENTS.watchFired:
      return `Carrier changed to ${text(payload.status) ?? 'a new status'} — watchers alerted`;
  }
}

/**
 * The carrier half: each time the carrier's status CHANGES (a scan whose
 * normalized category differs from the one before it), not every scan.
 */
function carrierChanges(actions: readonly ShipmentRecordAction[]): FulfilledThreadItem[] {
  const scans = actions.filter((action) => action.source === 'carrier').sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const changes: FulfilledThreadItem[] = [];
  let previous: string | null = null;
  for (const scan of scans) {
    if (scan.kind === previous) continue;
    previous = scan.kind;
    const word = carrierStatusLabel(scan.kind) ?? scan.kind;
    changes.push({ kind: 'carrier', id: scan.id, at: scan.at, label: `Carrier: ${word}`, detail: [scan.label, scan.detail].filter(Boolean).join(' · ') || null });
  }
  return changes;
}

/** The order's one thread, oldest first: notes, desk events and carrier status changes interleaved by instant. */
export function fulfilledThreadItems(read: FulfilledThreadRead | null, carrierActions: readonly ShipmentRecordAction[]): FulfilledThreadItem[] {
  const items: FulfilledThreadItem[] = [
    ...(read?.notes ?? []).map((note): FulfilledThreadItem => ({ kind: 'note', id: `note:${note.id}`, at: note.at, author: note.authorName, text: note.text })),
    ...(read?.events ?? []).map(
      (event): FulfilledThreadItem => ({
        kind: 'event',
        id: `event:${event.id}`,
        at: event.at,
        actor: event.actorName,
        label: fulfilledDeskEventLabel(event.type, event.payload),
      }),
    ),
    ...carrierChanges(carrierActions),
  ];
  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}
