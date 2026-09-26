/** EPCIS 2.0 event projection — a READING of `inventory_events`, not a new store. */

import type { InventoryEventType } from '@/lib/inventory/events';
import { formatApiInstant, WAREHOUSE_TIME_ZONE } from '@/utils/date';
import {
  cbvUri,
  cbvBizTransactionUri,
  type CbvUriForm,
  type EpcisAction,
  type EpcisEventType,
} from './epcis-vocabulary';
import {
  cbvForEventType,
  epcisActionForEventType,
  epcisEventTypeForInventoryEvent,
} from './lifecycle-cbv-map';
import {
  glnIdentifier,
  gtinIdentifier,
  internalIdentifier,
  sgtinIdentifier,
  type Gs1OrgIdentity,
} from './gs1-keys';

/** One `inventory_events` row, joined to just enough to build an EPC. */
export interface EpcisSourceRow {
  id: number;
  occurred_at: Date | string;
  event_type: string;
  station: string | null;
  actor_staff_id: number | null;
  receiving_id: number | null;
  receiving_line_id: number | null;
  serial_unit_id: number | null;
  sku: string | null;
  bin_id: number | null;
  prev_bin_id: number | null;
  prev_status: string | null;
  next_status: string | null;
  client_event_id: string | null;
  /** `serial_units.serial_number`, when the event names a unit. */
  serial_number: string | null;
  /** `sku_catalog.gtin`, reached ONLY through `serial_units.sku_catalog_id`. */
  gtin: string | null;
  /** `receiving_carton.zoho_purchaseorder_number`, for the `why` dimension. */
  po_number: string | null;
}

/** A projected EPCIS event. JSON-shaped; field names are the standard's. */
export interface EpcisEvent {
  eventID: string;
  type: EpcisEventType;
  eventTime: string;
  eventTimeZoneOffset: string;
  action: EpcisAction;
  bizStep?: string;
  disposition?: string;
  epcList: string[];
  readPoint?: { id: string };
  bizLocation?: { id: string };
  bizTransactionList?: Array<{ type: string; bizTransaction: string }>;
  /** Cycle Forge's own facts, namespaced. */
  cycleforge_event?: {
    inventoryEventId: number;
    eventType: string;
    station: string | null;
    actorStaffId: number | null;
    prevStatus: string | null;
    nextStatus: string | null;
  };
}

export interface EpcisProjectionResult {
  events: EpcisEvent[];
  /** Opaque keyset cursor for the next page, or `null` at the end. */
  nextCursor: string | null;
  /** Facts a consumer needs to interpret what it just got. */
  meta: {
    cbvUriForm: CbvUriForm;
    /** True when the tenant has a real GLN, so `bizLocation` is populated. */
    hasBizLocation: boolean;
    /** Event types skipped because they have no honest CBV reading, with counts. */
    skipped: Record<string, number>;
  };
}

/** Keyset cursor: the last row's `(occurred_at, id)`. */
export interface EpcisCursor {
  occurredAt: string;
  id: number;
}

export function encodeEpcisCursor(c: EpcisCursor): string {
  return Buffer.from(`${c.occurredAt}|${c.id}`, 'utf8').toString('base64url');
}

/** `null` on anything malformed — a bad cursor restarts the feed, never throws. */
export function decodeEpcisCursor(raw: string | null | undefined): EpcisCursor | null {
  if (!raw) return null;
  try {
    const [occurredAt, idRaw] = Buffer.from(raw, 'base64url')
      .toString('utf8')
      .split('|');
    const id = Number(idRaw);
    if (!occurredAt || !Number.isFinite(id)) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

/** The read surface — injected so this module is testable with no Postgres. */
export interface EpcisProjectionDeps {
  fetchEvents: (args: {
    orgId: string;
    since: string | null;
    cursor: EpcisCursor | null;
    limit: number;
  }) => Promise<EpcisSourceRow[]>;
}

export const EPCIS_PAGE_DEFAULT = 200;
export const EPCIS_PAGE_MAX = 1000;

/** UTC offset of the warehouse business zone at a given instant, as `±HH:MM`. */
function warehouseOffsetAt(instant: Date): string {
  // Intl is the only correct way to do this — the offset is -07:00 or -08:00
  // depending on the date, and hardcoding either is wrong half the year.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WAREHOUSE_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return '+00:00';
  return `${m[1]}${m[2]}:${m[3]}`;
}

/** The EPC list for one event — what the event is ABOUT. */
export function epcListFor(row: EpcisSourceRow): string[] {
  const out: string[] = [];

  const sgtin = sgtinIdentifier(row.gtin, row.serial_number);
  if (sgtin) {
    out.push(sgtin.uri);
  } else if (row.serial_unit_id != null) {
    out.push(internalIdentifier('unit', row.serial_unit_id).uri);
  }

  // Class-level identity rides alongside instance identity — a consumer
  // filtering by product model needs it even when the SGTIN is present.
  const gtin = gtinIdentifier(row.gtin);
  if (gtin && !sgtin) out.push(gtin.uri);

  if (row.serial_unit_id == null) {
    // A carton- or line-scoped event with no unit. These are real: an arrival
    // scan happens before any unit exists.
    if (row.receiving_line_id != null) {
      out.push(internalIdentifier('line', row.receiving_line_id).uri);
    } else if (row.receiving_id != null) {
      out.push(internalIdentifier('carton', row.receiving_id).uri);
    }
  }

  return out;
}

/**
 * Project one source row into an EPCIS event.
 *
 * Returns `null` when the event type has no honest CBV reading — the caller
 * counts those into `meta.skipped` rather than dropping them silently.
 */
export function projectEvent(
  row: EpcisSourceRow,
  opts: { identity: Gs1OrgIdentity; form: CbvUriForm },
): EpcisEvent | null {
  const mapping = cbvForEventType(row.event_type as InventoryEventType);
  if (!mapping) return null;

  const instant = row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at);

  const event: EpcisEvent = {
    // A stable, globally-unique event id.
    eventID: row.client_event_id
      ? `urn:uuid:${row.client_event_id}`
      : internalIdentifier('unit', `event-${row.id}`).uri,
    type: epcisEventTypeForInventoryEvent(),
    eventTime: formatApiInstant(instant),
    eventTimeZoneOffset: warehouseOffsetAt(instant),
    action: epcisActionForEventType(row.event_type as InventoryEventType),
    bizStep: cbvUri('bizStep', mapping.bizStep, opts.form),
    epcList: epcListFor(row),
  };

  if (mapping.disposition) {
    event.disposition = cbvUri('disposition', mapping.disposition, opts.form);
  }

  // `readPoint` is where the read happened — the bin, or failing that the
  // station. Both are internal URIs: neither is a GLN and neither pretends to
  // be one.
  if (row.bin_id != null) {
    event.readPoint = { id: internalIdentifier('location', row.bin_id).uri };
  } else if (row.station) {
    event.readPoint = { id: internalIdentifier('location', `station:${row.station}`).uri };
  }

  // `bizLocation` is the business site, and only a real GLN can name it.
  const gln = glnIdentifier(opts.identity);
  if (gln) event.bizLocation = { id: gln.uri };

  // The `why` dimension. GS1's guidance is explicit that a business
  // transaction rides on the event that already exists rather than a bare
  // TransactionEvent — a PO reference on the ObjectEvent is what partners read.
  if (row.po_number) {
    event.bizTransactionList = [
      {
        type: cbvBizTransactionUri('po', opts.form),
        bizTransaction: internalIdentifier('order', row.po_number).uri,
      },
    ];
  }

  event.cycleforge_event = {
    inventoryEventId: row.id,
    eventType: row.event_type,
    station: row.station,
    actorStaffId: row.actor_staff_id,
    prevStatus: row.prev_status,
    nextStatus: row.next_status,
  };

  return event;
}

/**
 * Project a page of events.
 *
 * Pure over its `deps` — no import of the DB, so the unit test runs with a
 * captured fake and zero Postgres.
 */
export async function projectEpcisPage(
  args: {
    orgId: string;
    identity: Gs1OrgIdentity;
    since?: string | null;
    cursor?: EpcisCursor | null;
    limit?: number;
  },
  deps: EpcisProjectionDeps,
): Promise<EpcisProjectionResult> {
  const limit = Math.min(Math.max(args.limit ?? EPCIS_PAGE_DEFAULT, 1), EPCIS_PAGE_MAX);
  const form: CbvUriForm = args.identity.cbvUriForm ?? 'urn';

  // Fetch one extra to know whether another page exists without a COUNT.
  const rows = await deps.fetchEvents({
    orgId: args.orgId,
    since: args.since ?? null,
    cursor: args.cursor ?? null,
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const events: EpcisEvent[] = [];
  const skipped: Record<string, number> = {};

  for (const row of page) {
    const projected = projectEvent(row, { identity: args.identity, form });
    if (projected) {
      events.push(projected);
    } else {
      skipped[row.event_type] = (skipped[row.event_type] ?? 0) + 1;
    }
  }

  // The cursor advances past every row READ, including skipped ones — pointing
  // it at the last EMITTED event would replay the skipped tail forever.
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeEpcisCursor({
          occurredAt:
            last.occurred_at instanceof Date
              ? last.occurred_at.toISOString()
              : String(last.occurred_at),
          id: last.id,
        })
      : null;

  return {
    events,
    nextCursor,
    meta: {
      cbvUriForm: form,
      hasBizLocation: glnIdentifier(args.identity) !== null,
      skipped,
    },
  };
}
