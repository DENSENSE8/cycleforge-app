/** FIND record events — the kinds a `/search` record's timeline carries, and their timeline rows. */

import type { TimelineItem, TimelineRef } from '@/lib/timeline/types';

/**
 * Stream faces.
 * `hop` MEANS ROUND TRIP (operator, 2026-09-12). It used to mean "every
 */
export const FIND_EVENT_KINDS = [
  'qty',
  'custody',
  'hop',
  'evidence',
  'exception',
  'bind',
  'carrier',
  'note',
] as const;

export type FindEventKind = (typeof FIND_EVENT_KINDS)[number];

export interface FindQtyLedger {
  ordered?: number;
  received?: number;
  packed?: number;
  shipped?: number;
}

export interface FindBind {
  sku?: string;
  serial?: string;
  tracking?: string;
}

export interface FindEvent {
  id: string;
  kind: FindEventKind;
  /** ISO-8601. */
  at: string;
  title: string;
  body?: string;
  /** Workplace name on a hop — caption only. */
  stationCaption?: string;
  /** Staff who wrote the hop. Omit when unknown — never invent a name. */
  actor?: string;
  qty?: FindQtyLedger;
  evidenceUrls?: readonly string[];
  bind?: FindBind;
  /** Exception resolution. FIND does not write this. */
  resolved?: boolean;
  /** Workplace deep-link. Click is handoff, never an inline write. */
  href?: string;
  /** Carrier sub-events nested under a shipment hop. */
  children?: readonly FindEvent[];
}

export function isFindEventKind(value: string): value is FindEventKind {
  return (FIND_EVENT_KINDS as readonly string[]).includes(value);
}

function byNewest(a: FindEvent, b: FindEvent): number {
  const delta = Date.parse(b.at) - Date.parse(a.at);
  if (delta !== 0) return delta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sortTree(events: readonly FindEvent[]): FindEvent[] {
  return events
    .map((event) =>
      event.children && event.children.length > 0
        ? { ...event, children: sortTree(event.children) }
        : event,
    )
    .sort(byNewest);
}

export function eventsNewestFirst(events: readonly FindEvent[]): FindEvent[] {
  return sortTree(events);
}

function qtyLine(qty: FindQtyLedger | undefined): string | null {
  if (!qty) return null;
  const parts: string[] = [];
  if (qty.ordered != null) parts.push(`Ordered ${qty.ordered}`);
  if (qty.received != null) parts.push(`Received ${qty.received}`);
  if (qty.packed != null) parts.push(`Packed ${qty.packed}`);
  if (qty.shipped != null) parts.push(`Shipped ${qty.shipped}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function bindRefs(bind: FindBind | undefined): TimelineRef[] {
  if (!bind) return [];
  const refs: TimelineRef[] = [];
  if (bind.serial) refs.push({ kind: 'serial', value: bind.serial });
  if (bind.tracking) refs.push({ kind: 'tracking', value: bind.tracking });
  if (bind.sku) refs.push({ kind: 'sku', value: bind.sku });
  return refs;
}

/**
 * FIND events → the house timeline rows (`TimelineSection`), the same grammar
 * the order record's timeline paints. Carrier sub-events become rows of their
 * own (each has its own instant); the result is newest-first.
 */
export function findEventsToTimelineItems(events: readonly FindEvent[]): TimelineItem[] {
  const flat: FindEvent[] = [];
  const walk = (list: readonly FindEvent[]) => {
    for (const event of list) {
      flat.push(event);
      if (event.children && event.children.length > 0) walk(event.children);
    }
  };
  walk(events);

  let mediaSeq = 0;
  return eventsNewestFirst(flat).map((event): TimelineItem => {
    const subtitle = [event.stationCaption, event.body, qtyLine(event.qty)]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' · ');
    const refs = bindRefs(event.bind);
    return {
      id: event.id,
      at: event.at,
      title: event.title,
      ...(subtitle ? { subtitle } : {}),
      ...(event.actor ? { actor: event.actor } : {}),
      ...(refs.length === 1 ? { ref: refs[0] } : refs.length > 1 ? { refs } : {}),
      ...(event.kind === 'exception'
        ? {
            badges: [
              event.resolved
                ? { label: 'Resolved', tone: 'success' as const }
                : { label: 'Open exception', tone: 'warning' as const },
            ],
          }
        : {}),
      ...(event.href ? { href: event.href } : {}),
      ...(event.evidenceUrls && event.evidenceUrls.length > 0
        ? {
            media: event.evidenceUrls.map((url) => ({
              photoId: -(++mediaSeq),
              thumbUrl: url,
              fullUrl: url,
              caption: event.title,
            })),
          }
        : {}),
    };
  });
}
