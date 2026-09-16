/**
 * FIND case-file view-model — timeline kinds, outline, dossier.
 *
 * Adapters (Phase 1+) map entity APIs onto this shape. The frame paints one
 * chrome tree; `entityType` is content, not a layout switch. Tracking is a
 * carrier hop / bind on an order, never a `?sel=` type.
 *
 * Callers: FIND dossier adapters (`SearchOrderDossier` and peers) and unit tests.
 */

import type { SearchHitEntityType } from '@/lib/search/search-hit';
import type {
  SearchDossierFact,
  SearchDossierFinding,
  SearchDossierHandoff,
} from '@/lib/search/search-dossier-model';

/**
 * Stream faces. Station names are custody captions, not kinds.
 *
 * `status` was declared here through Phase 3 and never had a producer. It
 * could not earn one either: the status PIN is already the hero band, and a
 * status transition is carried on the stream by the custody row that caused
 * it (`findEventsFromInventory` renders `prev_status → next_status` in the
 * body). A second status face would have duplicated the pin above it and the
 * row beside it. A kind that can never render is a lie in the outline catalog
 * and in the contract test, so it is gone rather than stubbed.
 *
 * `hop` MEANS ROUND TRIP (operator, 2026-09-12). It used to mean "every
 * custody scan" — picked, packed, shipped, scanned-out — which is the
 * backbone of the document and is now `custody`. The operator's definition is
 * narrower and is the only one staff use the word for: the unit SHIPPED and
 * came back under the SAME order id. Two names for one word was the real
 * defect; `countRoundTrips` (src/lib/timeline/journey.ts:144) had already
 * encoded the operator's meaning while this catalog encoded the other.
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

export interface FindOutlineEntry {
  kind: FindEventKind;
  count: number;
}

export interface FindDossier {
  entityType: SearchHitEntityType;
  id: number;
  title: string;
  status: string;
  facts: SearchDossierFact[];
  outline: FindOutlineEntry[];
  events: FindEvent[];
  findings: SearchDossierFinding[];
  handoffs: SearchDossierHandoff[];
}

export function isFindEventKind(value: string): value is FindEventKind {
  return (FIND_EVENT_KINDS as readonly string[]).includes(value);
}

/** Outline chip labels — investigation kinds, not station names. */
export const FIND_OUTLINE_LABEL: Record<FindEventKind, string> = {
  qty: 'Qty',
  custody: 'Custody',
  hop: 'Hops',
  evidence: 'Evidence',
  exception: 'Exceptions',
  bind: 'Binds',
  carrier: 'Carrier',
  note: 'Notes',
};

/**
 * Kinds that never get a left-nav chip (operator, 2026-09-12).
 *
 * The outline is a filter, not a table of contents, and every kind still
 * SCROLLS in Overview — dropping a chip hides a control, never a fact.
 *
 *   `qty`     — the ledger is an order-level FACT and now paints in the centre
 *               facts band beside Order id and Tracking. A standalone "Qty"
 *               tab for a single row was the noisiest chip on the rail.
 *   `custody` — picked / packed / shipped / scanned-out is most of the stream
 *               on a healthy order, so a chip that selects "nearly everything"
 *               is indistinguishable from Overview. `hop` is the chip that
 *               earns its place, because it appears only when a unit actually
 *               came back.
 *
 * Zero-count kinds are already absent from `outline`, so `hop` self-gates on
 * top of this: no round trip, no Hops chip.
 */
export const FIND_OUTLINE_CHIPLESS_KINDS: readonly FindEventKind[] = ['qty', 'custody'];


/**
 * Phase-1 outline from adapter counts (no fake hops). Zero counts omitted.
 * Callers: FIND dossiers until the chronology APIs land in Phase 2.
 */
export function adapterOutline(counts: Partial<Record<FindEventKind, number>>): FindOutlineEntry[] {
  const outline: FindOutlineEntry[] = [];
  for (const kind of FIND_EVENT_KINDS) {
    const count = counts[kind] ?? 0;
    if (count > 0) outline.push({ kind, count });
  }
  return outline;
}

function walkEvents(events: readonly FindEvent[], visit: (event: FindEvent) => void): void {
  for (const event of events) {
    visit(event);
    if (event.children && event.children.length > 0) walkEvents(event.children, visit);
  }
}

/** Kind counts from the stream. Zero counts are omitted. Catalog order. */
export function outlineFromEvents(events: readonly FindEvent[]): FindOutlineEntry[] {
  const counts = new Map<FindEventKind, number>();
  walkEvents(events, (event) => {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  });
  const outline: FindOutlineEntry[] = [];
  for (const kind of FIND_EVENT_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count > 0) outline.push({ kind, count });
  }
  return outline;
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

/**
 * Overview (`kind` omitted) returns the full newest-first stream.
 * A kind filter keeps matching rows only; nested hops under a carrier are
 * lifted so outline counts stay truthful.
 */
export function filterEventsByKind(
  events: readonly FindEvent[],
  kind: FindEventKind | null,
): FindEvent[] {
  const sorted = eventsNewestFirst(events);
  if (kind == null) return sorted;
  const out: FindEvent[] = [];
  for (const event of sorted) {
    const childHits =
      event.children && event.children.length > 0
        ? filterEventsByKind(event.children, kind)
        : [];
    if (event.kind === kind) {
      out.push(
        childHits.length > 0 ? { ...event, children: childHits } : { ...event, children: undefined },
      );
    } else {
      out.push(...childHits);
    }
  }
  return out;
}

export type FindDossierDraft = Omit<FindDossier, 'outline' | 'events'> & {
  events: readonly FindEvent[];
};

/** Sort the stream newest-first and derive the outline. Adapters call this. */
export function presentFindDossier(draft: FindDossierDraft): FindDossier {
  const events = eventsNewestFirst(draft.events);
  return {
    ...draft,
    events,
    outline: outlineFromEvents(events),
  };
}
