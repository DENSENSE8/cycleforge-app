/**
 * "Picked by" — the ONE resolver for who inventory-picked an order line
 * (`orders.id`) and took it to the packing station, and when (operator
 * 2026-10-06: pick scanning is NOT required at a station; any record of the
 * pick counts). Every surface that shows, filters or stages on the pick reads
 * it: the materialized `order_stage_facts.picked_by / picked_at /
 * picked_source / has_pick_scan` (written from {@link PICKED_BY_LATERAL}),
 * the shipped feeds' live lateral, `?pickedBy=` ({@link sqlOrderPickedById})
 * and the live "has been picked" probe ({@link sqlOrderIsPicked}).
 *
 * PRECEDENCE — the first source with a record wins; within a source the
 * latest record wins. Most direct evidence of the physical pick first:
 *   1. `inventory_event` — a PICKED / FORCE_PICK `inventory_events` row
 *      (`actor_staff_id`, `occurred_at`) on a unit still allocated to the
 *      order in a picked-or-later state (`order_unit_allocations`). Written
 *      by the unit scan and the desk serial pick; an un-pick returns the
 *      allocation to ALLOCATED, so it stops counting.
 *   2. `picking_session` — a COMPLETED, non-abandoned `picking_sessions` row
 *      (`picker_staff_id`, `ended_at`): the picker closed the walk and staged
 *      the totes for packing. An open session is a pick in progress, not a
 *      pick (its units count through 1 as they are scanned).
 *   3. `pick_scan` — a PICK_SCANNED / FNSKU_SCANNED `station_activity_logs`
 *      row attributed to the order (`sqlStationActivityMatchesOrder`: row id,
 *      external order id, or a sole-order shipment). Covers the Picker
 *      desk's SKU pull too: its bin decrement (`sku_stock_ledger` PICKED)
 *      hangs off this row via `ref_sal_id`.
 *   4. `serial_pull` — a `tech_serial_numbers` row taken for the order
 *      (`order_id` only, never the shipment dual-read: a serial on a
 *      shared carton is not this line's pick).
 *
 * NOT sources (measured on dev 2026-10-06, see the slice-4 report):
 * - the ORDER/PICK work assignment (`picker_id`, `WA_PICK_LATERAL`) — who was
 *   TOLD to pick, never evidence of the pick. It stays its own labelled fact
 *   ("Picker", `?pickerId=`); folding it in would mark assigned-but-unpicked
 *   orders Picked and feed `sku_staff_pairings` back from its own output.
 * - totes (`handling_units.paired_*`) — bound by the session, covered by 2.
 * - `SERIAL_ADDED` station logs without a live serial row — un-pick deletes
 *   the serial and its log together; the leftovers are legacy backfill rows.
 */
import { sqlStationActivityMatchesOrder } from '@/lib/orders/order-grain-sql';
import { ORDER_PICK_SCAN_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';

/** The pick sources, in precedence order (index = rank). */
export const PICKED_BY_SOURCES = ['inventory_event', 'picking_session', 'pick_scan', 'serial_pull'] as const;
export type PickedBySource = (typeof PICKED_BY_SOURCES)[number];

/** The resolver's output columns, as a row carries them (`order_stage_facts` or the lateral, plus `s_picked.name`). */
export interface PickedByRow {
  picked_by?: unknown;
  picked_by_name?: unknown;
  picked_source?: unknown;
}

/** Who picked, by id (colour) and name, and which source said so. */
export interface PickedBy {
  id: number | null;
  name: string | null;
  source: PickedBySource;
}

/**
 * A resolver row → its picker; null when no source has a record (not picked)
 * or the source is one the resolver never writes.
 */
export function pickedByFromRow(row: PickedByRow): PickedBy | null {
  const source = PICKED_BY_SOURCES.find((candidate) => candidate === row.picked_source);
  if (!source) return null;
  const id = Number(row.picked_by);
  const name = row.picked_by_name == null ? null : String(row.picked_by_name).trim() || null;
  return { id: Number.isInteger(id) && id > 0 ? id : null, name, source };
}

/** One source's record set for order alias `o`: who, when, latest-first, and the FROM … WHERE body. */
interface PickArm {
  by: string;
  at: string;
  latestFirst: string;
  body: string;
}

function pickArms(o: string): Record<PickedBySource, PickArm> {
  return {
    inventory_event: {
      by: 'pk_ie.actor_staff_id',
      at: 'pk_ie.occurred_at',
      latestFirst: 'pk_ie.occurred_at DESC NULLS LAST, pk_ie.id DESC',
      body: `FROM order_unit_allocations pk_oua
          JOIN inventory_events pk_ie
            ON pk_ie.serial_unit_id  = pk_oua.serial_unit_id
           AND pk_ie.organization_id = pk_oua.organization_id
           AND pk_ie.event_type IN ('PICKED', 'FORCE_PICK')
           AND pk_ie.occurred_at    >= pk_oua.allocated_at
         WHERE pk_oua.order_id        = ${o}.id
           AND pk_oua.organization_id = ${o}.organization_id
           AND pk_oua.state IN ('PICKED', 'PACKED', 'SHIPPED', 'RETURNED')`,
    },
    picking_session: {
      by: 'pk_ps.picker_staff_id',
      at: 'pk_ps.ended_at',
      latestFirst: 'pk_ps.ended_at DESC, pk_ps.id DESC',
      body: `FROM picking_sessions pk_ps
         WHERE pk_ps.order_id        = ${o}.id
           AND pk_ps.organization_id = ${o}.organization_id
           AND pk_ps.ended_at IS NOT NULL
           AND NOT pk_ps.abandoned`,
    },
    pick_scan: {
      by: 'pk_sal.staff_id',
      at: 'pk_sal.created_at',
      latestFirst: 'pk_sal.created_at DESC, pk_sal.id DESC',
      body: `FROM station_activity_logs pk_sal
         WHERE pk_sal.activity_type IN (${sqlInList(ORDER_PICK_SCAN_ACTIVITY_TYPES)})
           AND ${sqlStationActivityMatchesOrder('pk_sal', o)}`,
    },
    serial_pull: {
      by: 'pk_tsn.tested_by',
      at: 'pk_tsn.created_at',
      latestFirst: 'pk_tsn.created_at DESC, pk_tsn.id DESC',
      body: `FROM tech_serial_numbers pk_tsn
         WHERE pk_tsn.order_id        = ${o}.id
           AND pk_tsn.organization_id = ${o}.organization_id`,
    },
  };
}

/** The winning record for order alias `o` as a one-row subquery: `picked_by`, `picked_at`, `picked_source`. */
function sqlPickedByWinner(o: string): string {
  const arms = pickArms(o);
  const union = PICKED_BY_SOURCES.map((source, rank) => {
    const arm = arms[source];
    return `(SELECT ${rank} AS rank, '${source}'::text AS picked_source,
                ${arm.by} AS picked_by, ${arm.at} AS picked_at
           ${arm.body}
         ORDER BY ${arm.latestFirst}
         LIMIT 1)`;
  }).join('\n      UNION ALL\n      ');
  return `SELECT pk_arm.picked_by, pk_arm.picked_at, pk_arm.picked_source
      FROM (
      ${union}
      ) pk_arm
     ORDER BY pk_arm.rank
     LIMIT 1`;
}

/**
 * The resolver as a list-query join over order alias `o`: lateral `pick_fact`
 * (`picked_by`, `picked_at`, `picked_source`) plus the picker's staff row
 * `s_picked`. One evaluation per row, no per-row requests.
 */
export const PICKED_BY_LATERAL = `
  LEFT JOIN LATERAL (
    ${sqlPickedByWinner('o')}
  ) pick_fact ON true
  LEFT JOIN staff s_picked
    ON s_picked.id = pick_fact.picked_by
   AND s_picked.organization_id = o.organization_id`;

/** The columns a GROUP BY over {@link PICKED_BY_LATERAL} must list. */
export const PICKED_BY_GROUP_BY = 'pick_fact.picked_by, pick_fact.picked_at, pick_fact.picked_source, s_picked.name';

/** Over {@link PICKED_BY_LATERAL}: the order has been picked (any source has a record). */
export const PICKED_BY_IS_PICKED_SQL = '(pick_fact.picked_source IS NOT NULL)';

/** Who picked the order at `orderAlias`, as a scalar (`?pickedBy=` where no facts row is joined). */
export function sqlOrderPickedById(orderAlias = 'o'): string {
  return `(SELECT pk_win.picked_by FROM (${sqlPickedByWinner(orderAlias)}) pk_win)`;
}

/**
 * The order at `alias` has been picked: any source of the resolver has a
 * record — the same arms as {@link PICKED_BY_LATERAL}, as short-circuiting
 * EXISTS for predicates (the To-pick / Picked stage split, Up Next).
 */
export function sqlOrderIsPicked(alias = 'o'): string {
  const arms = pickArms(alias);
  return `(${PICKED_BY_SOURCES.map((source) => `EXISTS (SELECT 1 ${arms[source].body})`).join('\n    OR ')})`;
}
