/** Map workplace timeline *data* onto FIND stream events. */

import { photoStageLabel, stageFromPhotoType, type PhotoEvidenceStage } from '@/lib/photos/stages';
import type { ReceivingPhotoRow } from '@/hooks/useReceivingPhotos';
import { cartonEventTitle } from '@/components/receiving/inspector/carton-inspector-model';
import type { CartonInspectorEvent, CartonInspectorTotals } from '@/components/receiving/inspector/carton-inspector-model';
import type {
  CarrierEvent,
  InventoryTimelineRow,
  OrderAuditRow,
  StationActivityRow,
  ThreadMessageTimelineRow,
  UnitTimelinePhotoRow,
} from '@/lib/timeline';
import type { UnitTimelinePhotoRowSource } from '@/lib/timeline/unit-photos-events';
import type {
  EntitySignalTimelineRow,
  OrderNoteTimelineRow,
  OrderTimelinePayload,
} from '@/lib/queries/order-timeline-query';
import type { TimelineEventRow, UnitPhotoRow } from '@/components/inventory/types';
import { inventoryEventTitle } from '@/lib/timeline/inventory-events';
import { stationActivityTitle } from '@/lib/timeline/station-activity-events';
import { orderAuditTitle } from '@/lib/timeline/order-events';
import {
  type FindBind,
  type FindEvent,
  type FindQtyLedger,
} from '@/lib/search/find-dossier-model';

const EXCEPTION_TYPES = new Set([
  'TEST_FAIL',
  'HELD',
  'SCRAPPED',
  'RETURNED',
  'RELEASED_HOLD',
]);
const NOTE_TYPES = new Set(['NOTE', 'NOTE_ADDED']);

const PHOTO_SOURCE_STAGE: Record<UnitTimelinePhotoRowSource, PhotoEvidenceStage> = {
  arrival: 'arrival_package',
  unbox_carton: 'unbox_carton',
  unbox_item: 'unbox_item',
  testing: 'testing',
  packing: 'packing',
};

const PHOTO_SOURCE_ORDER: UnitTimelinePhotoRowSource[] = [
  'arrival',
  'unbox_carton',
  'unbox_item',
  'testing',
  'packing',
];

function prettyType(value: string): string {
  const s = value.replace(/[._-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Event';
}

function isoAt(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  return raw;
}

function bindOf(parts: FindBind): FindBind | undefined {
  const sku = String(parts.sku ?? '').trim() || undefined;
  const serial = String(parts.serial ?? '').trim() || undefined;
  const tracking = String(parts.tracking ?? '').trim() || undefined;
  if (!sku && !serial && !tracking) return undefined;
  return { sku, serial, tracking };
}

function qtyLedgerEvent(
  id: string,
  at: string | null | undefined,
  qty: FindQtyLedger,
): FindEvent | null {
  const stamp = isoAt(at);
  if (!stamp) return null;
  const has =
    qty.ordered != null || qty.received != null || qty.packed != null || qty.shipped != null;
  if (!has) return null;
  return { id, kind: 'qty', at: stamp, title: 'Qty', qty };
}

export function findEventsFromInventory(
  rows: ReadonlyArray<
    Pick<
      InventoryTimelineRow,
      'id' | 'occurred_at' | 'event_type' | 'notes' | 'serial_number' | 'sku' | 'prev_status' | 'next_status' | 'bin_name' | 'bin_barcode' | 'actor_name'
    > & { station?: string | null }
  >,
): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.occurred_at);
    if (!at) continue;
    const type = String(row.event_type ?? '').trim();
    const note = String(row.notes ?? '').trim();
    const kind = NOTE_TYPES.has(type) ? 'note' : EXCEPTION_TYPES.has(type) ? 'exception' : 'custody';
    const trail =
      row.prev_status && row.next_status && row.prev_status !== row.next_status
        ? `${row.prev_status} → ${row.next_status}`
        : row.next_status
          ? `→ ${row.next_status}`
          : null;
    const bin = String(row.bin_name ?? row.bin_barcode ?? '').trim();
    const title = kind === 'note' && note ? note : inventoryEventTitle(type) || 'Hop';
    const bodyParts = kind === 'note' ? [] : [note || null, trail, bin || null];
    const actor = String(row.actor_name ?? '').trim() || undefined;
    events.push({
      id: `inv:${row.id}`,
      kind,
      at,
      title,
      body: bodyParts.filter(Boolean).join(' · ') || undefined,
      stationCaption: String(row.station ?? '').trim() || undefined,
      actor,
      bind: bindOf({ sku: row.sku ?? undefined, serial: row.serial_number ?? undefined }),
      resolved: kind === 'exception' ? type === 'RELEASED_HOLD' : undefined,
    });
  }
  return events;
}

export function findEventsFromTimelineRows(rows: readonly TimelineEventRow[]): FindEvent[] {
  return findEventsFromInventory(
    rows.map((row) => ({
      id: row.id,
      occurred_at: row.occurred_at,
      event_type: row.event_type,
      notes: row.notes,
      serial_number: null,
      sku: null,
      prev_status: row.prev_status,
      next_status: row.next_status,
      bin_name: row.bin_name,
      bin_barcode: null,
      station: row.station,
      actor_name: row.actor_name,
    })),
  );
}

/** Conversation messages → `note` faces. */
const THREAD_NOTE_NOUN: Record<string, string> = {
  internal: 'Note',
  public: 'Reply',
};
const THREAD_PREVIEW_MAX = 140;

export function findEventsFromThreadMessages(
  rows: readonly ThreadMessageTimelineRow[],
): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.createdAt);
    if (!at) continue;
    const flat = String(row.body ?? '').replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    const body =
      flat.length > THREAD_PREVIEW_MAX ? `${flat.slice(0, THREAD_PREVIEW_MAX - 1)}…` : flat;
    events.push({
      id: `thread:${row.id}`,
      kind: 'note',
      at,
      title: THREAD_NOTE_NOUN[String(row.visibility ?? '').trim()] ?? THREAD_NOTE_NOUN.internal,
      body,
      actor: String(row.authorName ?? '').trim() || undefined,
    });
  }
  return events;
}

/** `order_notes` rows → `note` faces. */
export function findEventsFromOrderNotes(
  rows: readonly OrderNoteTimelineRow[],
): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.createdAt);
    if (!at) continue;
    const body = String(row.noteText ?? '').replace(/\s+/g, ' ').trim();
    if (!body) continue;
    events.push({
      id: `ordernote:${row.id}`,
      kind: 'note',
      at,
      title: 'Note',
      body,
      actor: String(row.authorName ?? '').trim() || undefined,
    });
  }
  return events;
}

/** `entity_signals` → `exception` faces. */
export function findEventsFromSignals(
  rows: readonly EntitySignalTimelineRow[],
): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.occurredAt);
    if (!at) continue;
    const reason = String(row.reasonCode ?? '').trim();
    const kindLabel = String(row.signalKind ?? '').trim();
    const title = reason ? prettyType(reason) : kindLabel ? prettyType(kindLabel) : 'Signal';
    const note = String(row.notes ?? '').replace(/\s+/g, ' ').trim();
    // `severity` is DELIBERATELY not painted.
    events.push({
      id: `signal:${row.id}`,
      kind: 'exception',
      at,
      title,
      body: note || undefined,
    });
  }
  return events;
}

function bindFromStationRow(row: StationActivityRow): FindBind | undefined {
  const type = String(row.activity_type ?? '').trim();
  const serial = String(row.serial_number ?? '').trim();
  const scan = String(row.scan_ref ?? '').trim();
  const skuFromMeta = String(row.metadata?.source_sku_code ?? '').trim();
  if (type === 'SERIAL_ADDED') return bindOf({ serial: serial || undefined, sku: skuFromMeta || undefined });
  if (type === 'FNSKU_SCANNED') return bindOf({ sku: scan || skuFromMeta || undefined });
  if (
    type === 'TRACKING_SCANNED' ||
    type === 'SHIP_CONFIRM' ||
    type === 'PACK_SHIPPED' ||
    type === 'LABEL_PRINTED'
  ) {
    return bindOf({ tracking: scan || undefined, serial: serial || undefined });
  }
  return bindOf({
    serial: serial || undefined,
    tracking: !serial && scan ? scan : undefined,
    sku: skuFromMeta || undefined,
  });
}

function findHopTitle(row: StationActivityRow): string {
  const type = String(row.activity_type ?? '').trim();
  const method = String(row.metadata?.source_method ?? '').trim().toUpperCase();
  if (type === 'TRACKING_SCANNED' || type === 'FNSKU_SCANNED') return 'Picked';
  if (type === 'SERIAL_ADDED' && method === 'SKU_PULL') return 'Picked';
  return stationActivityTitle(type);
}

export function findEventsFromStationActivity(rows: readonly StationActivityRow[]): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.created_at);
    if (!at) continue;
    const actor = String(row.actor_name ?? '').trim() || undefined;
    events.push({
      id: `sal:${row.id}`,
      kind: 'custody',
      at,
      title: findHopTitle(row),
      stationCaption: String(row.station ?? '').trim() || undefined,
      actor,
      bind: bindFromStationRow(row),
    });
  }
  return events;
}

export function findEventsFromOrderAudit(rows: readonly OrderAuditRow[]): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.created_at);
    if (!at) continue;
    const action = String(row.action ?? '').trim();
    const after = row.after_data ?? {};
    const tracking =
      String((after as { shipping_tracking_number?: unknown }).shipping_tracking_number ?? '').trim() ||
      String((row.metadata as { trackingNumber?: unknown } | null)?.trackingNumber ?? '').trim();
    const kind = action === 'orders.tracking.added' ? 'bind' : 'custody';
    const actor = String(row.actor_name ?? '').trim() || undefined;
    events.push({
      id: `audit:${row.id}`,
      kind,
      at,
      title: orderAuditTitle(action),
      actor,
      bind: bindOf({ tracking: tracking || undefined }),
    });
  }
  return events;
}

function findEventsFromCarrier(rows: readonly CarrierEvent[], tracking?: string | null): FindEvent[] {
  const children: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.event_occurred_at);
    if (!at) continue;
    const loc = [row.event_city, row.event_state].filter(Boolean).join(', ');
    children.push({
      id: `carrier:${row.id}`,
      kind: 'custody',
      at,
      title:
        String(row.external_status_description ?? '').trim() ||
        String(row.external_status_label ?? '').trim() ||
        prettyType(row.normalized_status_category),
      body: [loc || null, row.exception_description].filter(Boolean).join(' · ') || undefined,
    });
  }
  if (children.length === 0) return [];
  const newest = [...children].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]?.at;
  return [
    {
      id: 'carrier-shipment',
      kind: 'carrier',
      at: newest,
      title: 'Shipment',
      bind: bindOf({ tracking: tracking ?? undefined }),
      children,
    },
  ];
}

function findEventsFromUnitTimelinePhotos(rows: readonly UnitTimelinePhotoRow[]): FindEvent[] {
  const bySource = new Map<UnitTimelinePhotoRowSource, UnitTimelinePhotoRow[]>();
  for (const row of rows) {
    const list = bySource.get(row.source);
    if (list) list.push(row);
    else bySource.set(row.source, [row]);
  }
  const events: FindEvent[] = [];
  for (const source of PHOTO_SOURCE_ORDER) {
    const list = bySource.get(source);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
    const at = isoAt(sorted[0]?.at);
    if (!at) continue;
    const stage = photoStageLabel(PHOTO_SOURCE_STAGE[source]);
    events.push({
      id: `evidence:${source}`,
      kind: 'evidence',
      at,
      title: `${stage} photos`,
      body: `${list.length} photo${list.length === 1 ? '' : 's'}`,
      evidenceUrls: sorted.map((row) => row.fullUrl || row.thumbUrl).filter(Boolean),
      bind: bindOf({ sku: sorted[0]?.sku ?? undefined, serial: sorted[0]?.serial ?? undefined }),
    });
  }
  return events;
}

export function findEventsFromUnitPhotos(rows: readonly UnitPhotoRow[]): FindEvent[] {
  const urls = rows.map((row) => String(row.url ?? '').trim()).filter(Boolean);
  if (urls.length === 0) return [];
  const newest = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const at = isoAt(newest?.created_at);
  if (!at) return [];
  return [
    {
      id: 'evidence:unit',
      kind: 'evidence',
      at,
      title: 'Photos',
      body: `${urls.length} photo${urls.length === 1 ? '' : 's'}`,
      evidenceUrls: urls,
    },
  ];
}

/** Carton photos (`GET /api/receiving-photos`, the house carton read) grouped by evidence stage — one evidence event per stage at the… */
export function findEventsFromReceivingPhotos(rows: readonly ReceivingPhotoRow[]): FindEvent[] {
  const byStage = new Map<PhotoEvidenceStage | 'unclassified', ReceivingPhotoRow[]>();
  for (const row of rows) {
    const url = String(row.photoUrl ?? '').trim();
    if (!url) continue;
    const stage =
      stageFromPhotoType(row.receivingLineId ? 'RECEIVING_LINE' : 'RECEIVING', row.photoType ?? row.caption) ??
      'unclassified';
    const list = byStage.get(stage);
    if (list) list.push(row);
    else byStage.set(stage, [row]);
  }
  const events: FindEvent[] = [];
  const order: Array<PhotoEvidenceStage | 'unclassified'> = [...PHOTO_SOURCE_ORDER.map((s) => PHOTO_SOURCE_STAGE[s]), 'unclassified'];
  for (const stage of order) {
    const list = byStage.get(stage);
    if (!list || list.length === 0) continue;
    const stamp = (row: ReceivingPhotoRow) => row.clientCapturedAt || row.createdAt || '';
    const sorted = [...list].sort((a, b) => stamp(b).localeCompare(stamp(a)));
    const at = isoAt(stamp(sorted[0]));
    if (!at) continue;
    events.push({
      id: `evidence:carton:${stage}`,
      kind: 'evidence',
      at,
      title: stage === 'unclassified' ? 'Photos' : `${photoStageLabel(stage)} photos`,
      body: `${list.length} photo${list.length === 1 ? '' : 's'}`,
      evidenceUrls: sorted.map((row) => String(row.photoUrl ?? '').trim()).filter(Boolean),
    });
  }
  return events;
}

function findEventsFromCartonEvents(rows: readonly CartonInspectorEvent[]): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.occurred_at);
    if (!at) continue;
    const type = String(row.event_type ?? '').trim();
    const kind = NOTE_TYPES.has(type) ? 'note' : EXCEPTION_TYPES.has(type) ? 'exception' : 'custody';
    events.push({
      id: `carton:${row.id}`,
      kind,
      at,
      title: cartonEventTitle(row),
      stationCaption: String(row.station ?? '').trim() || undefined,
      bind: bindOf({ sku: row.sku ?? undefined, serial: row.serial_number ?? undefined }),
    });
  }
  return events;
}

export function findEventsFromPackLedger(rows: readonly StationActivityRow[]): FindEvent[] {
  return findEventsFromStationActivity(rows).map((event) =>
    event.title === 'Pack scan' ? { ...event, title: 'Packed' } : event,
  );
}

export function findEventsFromPickSessions(
  rows: ReadonlyArray<{ id: number; ended_at: string | null; actor_name: string | null }>,
): FindEvent[] {
  const events: FindEvent[] = [];
  for (const row of rows) {
    const at = isoAt(row.ended_at);
    if (!at) continue;
    const actor = String(row.actor_name ?? '').trim() || undefined;
    events.push({
      id: `pick:${row.id}`,
      kind: 'custody',
      at,
      title: 'Picked',
      actor,
    });
  }
  return events;
}

/**
 * The operator's definition of a HOP (2026-09-12):
 * The operator's definition of a HOP (2026-09-12): the unit SHIPPED and came
 */
function roundTripReturnIds(
  rows: ReadonlyArray<Pick<InventoryTimelineRow, 'id' | 'occurred_at' | 'event_type'>>,
): Set<string> {
  const chronological = [...rows]
    .map((row) => ({ row, ms: Date.parse(String(row.occurred_at ?? '')) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);
  const ids = new Set<string>();
  let shipped = false;
  for (const { row } of chronological) {
    const type = String(row.event_type ?? '').trim();
    if (type === 'SHIPPED') shipped = true;
    else if (type === 'RETURNED' && shipped) ids.add(`inv:${row.id}`);
  }
  return ids;
}

export function presentOrderFindEvents(
  payload: OrderTimelinePayload,
  extras: {
    quantity?: string | null;
    isShipped?: boolean;
    createdAt?: string | null;
    tracking?: string | null;
    packedAt?: string | null;
    packedByName?: string | null;
  },
): FindEvent[] {
  const qtyNumber = extras.quantity != null && extras.quantity !== '' ? Number(extras.quantity) : NaN;
  const qty = qtyLedgerEvent('qty:order', extras.createdAt, {
    ordered: Number.isFinite(qtyNumber) ? qtyNumber : undefined,
    shipped: extras.isShipped ? (Number.isFinite(qtyNumber) ? qtyNumber : 1) : undefined,
  });
  const hasInventoryPicked = payload.lifecycle.some(
    (row) => String(row.event_type ?? '').trim() === 'PICKED',
  );
  const hasInventoryPacked = payload.lifecycle.some(
    (row) => String(row.event_type ?? '').trim() === 'PACKED',
  );
  const hasAuditPacked = payload.events.some(
    (row) => String(row.action ?? '').trim() === 'PACK_COMPLETED',
  );
  const packHops =
    hasAuditPacked || hasInventoryPacked
      ? []
      : findEventsFromPackLedger(payload.packEvents ?? []);
  const packedAt = isoAt(extras.packedAt);
  const packedByName = String(extras.packedByName ?? '').trim();
  const packedFallback =
    packHops.length === 0 && !hasAuditPacked && !hasInventoryPacked && packedAt && packedByName
      ? ([
          {
            id: 'pack:order',
            kind: 'custody' as const,
            at: packedAt,
            title: 'Packed',
            actor: packedByName,
          },
        ] satisfies FindEvent[])
      : [];
  // A RETURNED that closes a ship→return loop is the operator's HOP, not a generic exception.
  const roundTrips = roundTripReturnIds(payload.lifecycle);
  const lifecycle = findEventsFromInventory(payload.lifecycle).map((event) =>
    roundTrips.has(event.id)
      ? { ...event, kind: 'hop' as const, title: 'Round trip', resolved: undefined }
      : event,
  );
  return [
    ...(qty ? [qty] : []),
    ...lifecycle,
    ...(hasInventoryPicked ? [] : findEventsFromPickSessions(payload.pickSessions ?? [])),
    ...findEventsFromStationActivity(payload.stationEvents),
    ...packHops,
    ...packedFallback,
    ...findEventsFromOrderAudit(payload.events),
    ...findEventsFromUnitTimelinePhotos(payload.unitPhotos),
    ...findEventsFromCarrier(payload.carrierEvents, extras.tracking),
    ...findEventsFromThreadMessages(payload.threadMessages ?? []),
    ...findEventsFromOrderNotes(payload.orderNotes ?? []),
    ...findEventsFromSignals(payload.signals ?? []),
  ];
}

export function presentCartonFindEvents(input: {
  events: readonly CartonInspectorEvent[];
  totals: CartonInspectorTotals | null | undefined;
  photos?: readonly ReceivingPhotoRow[];
  createdAt?: string | null;
  tracking?: string | null;
  linkedOrderId?: string | null;
}): FindEvent[] {
  const qty = qtyLedgerEvent('qty:carton', input.createdAt, {
    ordered: input.totals?.expected,
    received: input.totals?.received,
  });
  const bindAt = isoAt(input.createdAt);
  const bind =
    bindAt && (input.linkedOrderId || input.tracking)
      ? ([
          {
            id: 'bind:carton',
            kind: 'bind' as const,
            at: bindAt,
            title: 'Linked',
            bind: bindOf({ tracking: input.tracking ?? undefined }),
            body: input.linkedOrderId ? `Order ${input.linkedOrderId}` : undefined,
          },
        ] satisfies FindEvent[])
      : [];
  return [
    ...(qty ? [qty] : []),
    ...findEventsFromCartonEvents(input.events),
    ...findEventsFromReceivingPhotos(input.photos ?? []),
    ...bind,
  ];
}
