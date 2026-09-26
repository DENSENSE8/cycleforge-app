/** Read-only aggregator for the First-Trace audit view (P1-TRACE-03). */

import 'server-only';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { readInventorySpine, type InventoryEventRecord } from './inventory-spine';
// Type-only: erased at build, so the client adapter never enters this module's graph.
import type { InventoryTimelineRow } from '@/lib/timeline/inventory-events';
import {
  findShippedOrderForSerialUnit,
  normalizeSerial,
} from '@/lib/neon/serial-units-queries';
import { findShippedOrderByTsnSerial } from '@/lib/neon/tsn-shipped-order';

/** The resolved unit identity shown at the head of the trace. */
export interface TraceUnit {
  id: number | null;
  serial_number: string;
  normalized_serial: string;
  unit_uid: string | null;
  sku: string | null;
  product_title: string | null;
  current_status: string | null;
  current_location: string | null;
  condition_grade: string | null;
  origin_source: string | null;
  received_at: string | null;
  received_by_name: string | null;
}

/** The originating sales order, when the unit was shipped (powers the returns leg). */
export interface TraceOrder {
  order_id: string | null;
  product_title: string | null;
  tracking_number: string | null;
  allocation_state: string;
  allocated_at: string | null;
  /** How the link was resolved — v2 allocation, or the legacy tech-serial ship. */
  via: 'allocation' | 'tsn';
}

/** One trace event — a structural subset of the spine record, shaped so the client can feed it straight through `inventoryEventsToTimeline`… */
export interface TraceEvent {
  id: number;
  occurred_at: string;
  event_type: string;
  actor_staff_id: number | null;
  actor_name: string | null;
  station: string | null;
  serial_number: string | null;
  sku: string | null;
  bin_barcode: string | null;
  bin_name: string | null;
  prev_status: string | null;
  next_status: string | null;
  notes: string | null;
  payload: Record<string, unknown>;
}

export interface TraceResult {
  found: boolean;
  unit: TraceUnit | null;
  order: TraceOrder | null;
  events: TraceEvent[];
}

/** Compile-time proof of the contract in {@link TraceEvent}'s docblock. */
type MissingFromTrace = Exclude<keyof InventoryTimelineRow, keyof TraceEvent>;
const traceCarriesEveryAdapterField: [MissingFromTrace] extends [never]
  ? true
  : ['TraceEvent drops fields inventoryEventsToTimeline reads:', MissingFromTrace] = true;
void traceCarriesEveryAdapterField;

function toTraceEvent(r: InventoryEventRecord): TraceEvent {
  return {
    id: r.id,
    occurred_at: r.occurred_at,
    event_type: r.event_type,
    actor_staff_id: r.actor_staff_id,
    actor_name: r.actor_name,
    station: r.station,
    serial_number: r.serial_number,
    sku: r.sku,
    bin_barcode: r.bin_barcode,
    bin_name: r.bin_name,
    prev_status: r.prev_status,
    next_status: r.next_status,
    notes: r.notes,
    payload: r.payload ?? {},
  };
}

/** Resolve a serial / unit_uid to its full lifecycle trace, org-scoped. */
export async function getSerialTrace(
  rawInput: string,
  orgId: OrgId,
): Promise<TraceResult> {
  const raw = String(rawInput || '').trim();
  if (!raw) return { found: false, unit: null, order: null, events: [] };

  // Phase 3: origin_source from the reconstruction view (semantic label).
  const SELECT_COLS = `su.id, su.serial_number, su.normalized_serial, su.sku,
              su.unit_uid, su.current_status::text AS current_status,
              su.current_location, su.condition_grade::text AS condition_grade,
              vo.origin_source, su.received_at, su.received_by`;
  const SELECT_FROM = `FROM serial_units su JOIN v_serial_unit_origins vo ON vo.serial_unit_id = su.id`;

  // Resolve in order: numeric id → normalized serial → minted unit_uid. Each is
  // an indexed, org-scoped lookup — a serial never resolves another tenant's
  // unit (normalized_serial / unit_uid are string keys that collide across orgs).
  let row: Record<string, any> | null = null;
  if (/^\d+$/.test(raw)) {
    const r = await tenantQuery(
      orgId,
      `SELECT ${SELECT_COLS} ${SELECT_FROM} WHERE su.id = $1 AND su.organization_id = $2 LIMIT 1`,
      [Number(raw), orgId],
    );
    row = r.rows[0] ?? null;
  }
  if (!row) {
    const r = await tenantQuery(
      orgId,
      `SELECT ${SELECT_COLS} ${SELECT_FROM} WHERE su.normalized_serial = UPPER(TRIM($1)) AND su.organization_id = $2 LIMIT 1`,
      [raw, orgId],
    );
    row = r.rows[0] ?? null;
  }
  if (!row) {
    const r = await tenantQuery(
      orgId,
      `SELECT ${SELECT_COLS} ${SELECT_FROM} WHERE su.unit_uid = $1 AND su.organization_id = $2 LIMIT 1`,
      [raw, orgId],
    );
    row = r.rows[0] ?? null;
  }

  // No serial_units row. The serial may still be a legacy/tech-only ship (lives
  // in tech_serial_numbers, never registered as a unit). Resolve the shipped
  // order so the trace can still show the shipping leg, anchored on the serial.
  if (!row) {
    const matched = await findShippedOrderByTsnSerial(normalizeSerial(raw), undefined, orgId);
    if (!matched) return { found: false, unit: null, order: null, events: [] };
    return {
      found: true,
      unit: {
        id: null,
        serial_number: matched.serial_number ?? raw.toUpperCase(),
        normalized_serial: normalizeSerial(raw),
        unit_uid: null,
        sku: matched.sku,
        product_title: matched.product_title,
        current_status: 'SHIPPED',
        current_location: null,
        condition_grade: null,
        origin_source: 'tsn',
        received_at: null,
        received_by_name: null,
      },
      order: {
        order_id: matched.order_id,
        product_title: matched.product_title,
        tracking_number: matched.tracking_number,
        allocation_state: matched.allocation_state,
        allocated_at: matched.allocated_at,
        via: 'tsn',
      },
      events: [],
    };
  }

  const unitId = Number(row.id);

  // Full unit lifecycle from the shared spine — every station's event for THIS unit, oldest-first (origin → ship → return), org-scoped.
  const [spine, titleRow, receiverRow, shippedOrder] = await Promise.all([
    readInventorySpine({ serialUnitIds: [unitId], order: 'asc' }, orgId),
    row.sku
      ? tenantQuery<{ product_title: string | null }>(
          orgId,
          `SELECT COALESCE(sc.product_title, ss.product_title) AS product_title
             FROM sku_stock ss
             LEFT JOIN sku_catalog sc ON sc.sku = ss.sku AND sc.organization_id = ss.organization_id
            WHERE ss.sku = $1 AND ss.organization_id = $2 LIMIT 1`,
          [row.sku, orgId],
        )
          .then((r) => r.rows[0]?.product_title ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    row.received_by != null
      ? tenantQuery<{ name: string | null }>(
          orgId,
          `SELECT name FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [row.received_by, orgId],
        )
          .then((r) => r.rows[0]?.name ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    // Prefer the inventory-v2 allocation link; fall back to the legacy tech ship.
    findShippedOrderForSerialUnit(unitId, undefined, orgId)
      .then(async (m) =>
        m
          ? { matched: m, via: 'allocation' as const }
          : {
              matched: await findShippedOrderByTsnSerial(row.normalized_serial, undefined, orgId),
              via: 'tsn' as const,
            },
      )
      .catch(() => ({ matched: null, via: 'allocation' as const })),
  ]);

  const order: TraceOrder | null = shippedOrder.matched
    ? {
        order_id: shippedOrder.matched.order_id,
        product_title: shippedOrder.matched.product_title,
        tracking_number: shippedOrder.matched.tracking_number,
        allocation_state: shippedOrder.matched.allocation_state,
        allocated_at: shippedOrder.matched.allocated_at,
        via: shippedOrder.via,
      }
    : null;

  return {
    found: true,
    unit: {
      id: unitId,
      serial_number: row.serial_number,
      normalized_serial: row.normalized_serial,
      unit_uid: row.unit_uid,
      sku: row.sku,
      product_title: titleRow,
      current_status: row.current_status,
      current_location: row.current_location,
      condition_grade: row.condition_grade,
      origin_source: row.origin_source,
      received_at: row.received_at,
      received_by_name: receiverRow,
    },
    order,
    events: spine.map(toTraceEvent),
  };
}
