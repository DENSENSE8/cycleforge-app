/**
 * EPCIS 2.0 event projection — a READING of `inventory_events`, not a new store.
 *
 * Writes nothing, adds no columns, and invents no facts. Every field below
 * comes from a row that already exists; where a standard field has no Cycle
 * Forge fact behind it, the field is ABSENT rather than defaulted (EPCIS
 * tolerates an omitted optional field and does not tolerate a wrong one).
 *
 * ## Why `inventory_events` is the right spine
 *
 * The table already answers four of EPCIS's five dimensions directly:
 *
 *   what   ← `serial_unit_id` / `sku` (+ `receiving_id`, `receiving_line_id`)
 *   when   ← `occurred_at`
 *   where  ← `bin_id` / `prev_bin_id`, `station`
 *   why    ← `event_type` → CBV `bizStep` + `disposition`
 *
 * and the fifth (`how`, the sensor dimension) has no Cycle Forge fact at all,
 * so it is omitted entirely rather than stubbed.
 *
 * ## `eventTime` is the SERVER instant, always
 *
 * `occurred_at` is `TIMESTAMPTZ NOT NULL DEFAULT NOW()` — written by Postgres,
 * never by a device. That is deliberate and load-bearing here: an EPCIS feed
 * is precisely the artefact someone argues a dispute from, and a drifted
 * tablet clock yields a wrong-but-plausible time nobody can later detect. The
 * same rule already governs `photos.client_captured_at`. If a device-clock
 * column is ever added to this table, it belongs in a `cycleforge_` facet as
 * a claim, never in `eventTime`.
 *
 * `eventTimeZoneOffset` is REQUIRED by EPCIS 2.0 and is emitted as the
 * warehouse business zone's offset for that instant — resolved through
 * `@/utils/date`, never hand-computed.
 *
 * ## `bizLocation` is usually absent, and that is correct
 *
 * The `where` dimension wants a GLN. Almost no tenant has licensed one, and
 * this repo's `DEFAULT_GLN` is GS1's own documentation placeholder — see
 * `./gs1-keys.ts`. So `bizLocation` appears only when the tenant configured a
 * real GLN, and the bin is carried as an internal `readPoint` URI that is
 * unmistakably not a GS1 key.
 *
 * ## Pagination is keyset, not OFFSET
 *
 * This is a stream over a tenant's entire history. `OFFSET n` re-scans every
 * row before the window on every page, so deep paging is quadratic — a Neon
 * CU-hour incident waiting for the first partner who backfills. The cursor is
 * `(occurred_at, id)`, which matches the read's ORDER BY.
 */

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

/**
 * One `inventory_events` row, joined to just enough to build an EPC.
 *
 * `gtin` arrives via `serial_units.sku_catalog_id` ONLY. Joining `items` to
 * `sku_catalog` on the SKU *string* is a house hard law violation — the two
 * are independent numbering schemes and the strings collide
 * (`.claude/rules/source-of-truth.md` → SKU identity). A unit with no
 * `sku_catalog_id` therefore has no GTIN here, and gets an internal EPC.
 */
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
  /**
   * Cycle Forge's own facts, namespaced.
   *
   * OpenLineage's rule — a custom facet MUST carry a distinct project prefix
   * or it collides with the standard set — is the same discipline EPCIS wants
   * for extension fields, so the same `cycleforge_` prefix is used in both
   * places (see `./lineage-facets.ts`).
   */
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
    /**
     * Event types skipped because they have no honest CBV reading, with
     * counts. Never silently dropped — a consumer that sees `LISTED: 12` knows
     * exactly what it is not being told, which is the difference between a
     * gap and a lie.
     */
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

/**
 * The EPC list for one event — what the event is ABOUT.
 *
 * Preference order is identity-strength, not convenience: a real SGTIN beats
 * a class-level GTIN, which beats an internal handle. A row that resolves to
 * nothing at all yields an empty list and the event is still emitted, because
 * "something happened to a carton we can name internally" is true and useful.
 */
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
    // A stable, globally-unique event id. `client_event_id` is already UNIQUE
    // and already the idempotency key the bench mints per scan, so reusing it
    // means a partner replaying the feed dedupes on the same identity the
    // write path did. Falls back to the row id, namespaced.
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
