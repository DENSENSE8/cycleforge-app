/**
 * The pick list — a query over live unit allocations, not a new entity.
 *
 * `order_unit_allocations` already answers "which physical unit is promised to
 * which order line". A pick list is that set, joined to the unit's shelf
 * location and to the sku's owning picker, ordered so a human can walk it.
 *
 * Line-grained on purpose: a 2-line order is two rows in two different racks,
 * and the old shipping-feed fallback (`/api/orders?excludePacked=true`) could
 * not express that — it was order-grained and only saw orders that already had
 * a label.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { NON_PICKABLE_BIN_ROLES, SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { selectPickListGroups } from './pick-list-groups';
import type {
  PickListBlocker,
  PickListResult,
  PickListScope,
  PickListSourceRow,
} from './pick-list-groups';

// Single import surface for consumers: the shapes and the pure fold live in
// the db-free leaf module, the query lives here.
export { parsePickListScope, selectPickListGroups } from './pick-list-groups';
export type {
  PickListBlocker,
  PickListGroup,
  PickListResult,
  PickListRow,
  PickListScope,
  PickListShortfallRow,
  PickListSourceRow,
} from './pick-list-groups';

/**
 * Every live allocation for the org, with counts for all three scopes in the
 * same statement.
 *
 * Two shape decisions worth knowing:
 *
 * 1. `FROM counts LEFT JOIN live ON TRUE` — the counts CTE always yields
 *    exactly one row, so the endpoint still returns the three scope counts
 *    when there is not a single allocation yet. That single all-NULL row is
 *    dropped in TS. (`counts.unallocated` is NOT here: it comes from
 *    {@link PICK_LIST_SHORTFALL_SQL}, which is the one place that defines what
 *    "unallocated" means.)
 * 2. ORDER BY location, then sku — a pick list must walk the racks in shelf
 *    order (S-shape routing: one pass down the aisle). Ordering by order
 *    number or deadline would send the picker back and forth across the
 *    warehouse for every order. Deadline pressure is surfaced per row
 *    (`deadlineAt`) instead of reordering the walk. NULLS LAST keeps
 *    unlocated units (nothing to walk to) off the front of the list.
 * 3. LIMIT 2000 is a safety valve, not paging: the whole live allocation set
 *    IS the pick list, and scope filtering happens in TS, so the cap must sit
 *    above any plausible open-allocation count rather than per scope.
 */
const PICK_LIST_SQL = `
  WITH live AS (
    SELECT
      a.id::text                AS allocation_id,
      o.id                      AS order_id,
      o.order_id                AS order_number,
      su.sku                    AS sku,
      o.product_title           AS product_title,
      su.id                     AS serial_unit_id,
      su.serial_number          AS serial_number,
      su.condition_grade::text  AS grade,
      -- to_json on a timestamptz emits ISO-8601 with offset; avoids inventing
      -- a to_char format for a field the contract types as an ISO string.
      to_json(wa_deadline.deadline_at) #>> '{}' AS deadline_at,
      -- Card facts. The phone pick row paints the same item card as the
      -- to-ship row (operator 2026-09-15), so it needs the same four values:
      -- catalog photo, item number, amount and quantity.
      sc.image_url              AS catalog_image_url,
      o.item_number             AS item_number,
      o.sale_amount             AS sale_amount,
      o.currency                AS currency,
      o.quantity                AS quantity,
      -- EXACT location (operator 2026-09-15): current_location is written
      -- inconsistently across writers — putaway stores bin.NAME (a display
      -- title), mark-received/pick-scan store the numeric id. Resolve both
      -- shapes back to the location row and take its BARCODE: the flat code
      -- the bin label's DataMatrix encodes, i.e. the exact scannable spot.
      loc.barcode               AS location_barcode,
      su.current_location       AS location,
      p.staff_id                AS owner_staff_id,
      s.name                    AS owner_staff_name
    FROM order_unit_allocations a
    JOIN orders o
      ON o.id = a.order_id
     AND o.organization_id = a.organization_id
    JOIN serial_units su
      ON su.id = a.serial_unit_id
     AND su.organization_id = a.organization_id
    LEFT JOIN sku_staff_pairings p
      ON p.organization_id = a.organization_id
     AND p.sku = su.sku
    LEFT JOIN staff s ON s.id = p.staff_id
    LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
    LEFT JOIN locations loc
      ON loc.organization_id = a.organization_id
     AND (loc.id::text = su.current_location OR loc.name = su.current_location)
    LEFT JOIN LATERAL (
      SELECT wa.deadline_at
      FROM work_assignments wa
      WHERE wa.entity_type = 'ORDER'
        AND wa.entity_id   = o.id
        AND wa.work_type   = 'TEST'
        AND wa.organization_id = o.organization_id
      ORDER BY
        CASE wa.status
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'ASSIGNED'    THEN 2
          WHEN 'OPEN'        THEN 3
          WHEN 'DONE'        THEN 4
          ELSE 5
        END,
        wa.updated_at DESC,
        wa.id DESC
      LIMIT 1
    ) wa_deadline ON TRUE
    WHERE a.state = 'ALLOCATED'
      AND a.organization_id = $1
  ),
  counts AS (
    SELECT
      COUNT(l.allocation_id) FILTER (WHERE l.owner_staff_id = $2)::int    AS mine_count,
      COUNT(l.allocation_id)::int                                          AS all_count,
      COUNT(l.allocation_id) FILTER (WHERE l.owner_staff_id IS NULL)::int AS unpaired_count
    FROM live l
  )
  SELECT
    l.allocation_id,
    l.order_id,
    l.order_number,
    l.sku,
    l.product_title,
    l.serial_unit_id,
    l.serial_number,
    l.grade,
    l.location,
    l.location_barcode,
    l.catalog_image_url,
    l.item_number,
    l.sale_amount,
    l.currency,
    l.quantity,
    l.owner_staff_id,
    l.owner_staff_name,
    c.mine_count,
    c.all_count,
    c.unpaired_count
  FROM counts c
  LEFT JOIN live l ON TRUE
  ORDER BY l.location ASC NULLS LAST, l.sku ASC NULLS LAST, l.serial_unit_id ASC
  LIMIT 2000
`;

/**
 * The other half of the pick list: order lines with NO live allocation.
 *
 * Operator 2026-09-15 — *"it must display a picklist loading for org1 from the
 * orders"*. Before this query `/m/pick` read allocations only, so for org 1 it
 * painted 3 rows over 73 open lines and folded the missing 70 into one
 * sentence. A picker could not see which order was short or why.
 *
 * The demand predicate is COPIED FROM the allocator's `selectDemand`
 * (src/lib/allocation/auto-allocate.ts) on purpose — same two "already gone"
 * gates, same `state <> 'RELEASED'` reopen rule. If the two ever disagree the
 * phone accuses the allocator of work it never had.
 *
 * `blocker` answers "what would make this line pickable", using the SAME
 * expressions the allocator uses so the phone can never accuse it of work it
 * never had:
 *
 * - SKU is `COALESCE(sku_catalog.sku, orders.sku)` — `selectDemand`'s own
 *   expression. NULL means the channel's external item number never became
 *   product identity, so allocation cannot even look for stock. That is
 *   `no_catalog_link`: the import blocker, named on the floor instead of dying
 *   silently in a chore queue.
 * - Supply is `selectSupply`'s predicate (stocked · binned · pickable bin ·
 *   uncommitted). A line with a SKU and matching supply is
 *   `ready_to_allocate` — the sweep will fill it, so the band's CTA is a real
 *   verb rather than a shrug. Without supply it is `no_stock`, a genuine
 *   shortfall no button can fix.
 *
 * ORDER BY deadline, not location: there is no location. Deadline pressure is
 * the only ordering that helps someone deciding which shortfall to chase.
 * `COUNT(*) OVER ()` keeps the tally exact even when LIMIT truncates the band.
 */
const PICK_LIST_SHORTFALL_SQL = `
  SELECT
    o.id                      AS order_id,
    o.order_id                AS order_number,
    COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(o.sku), '')) AS sku,
    o.product_title           AS product_title,
    o.item_number             AS item_number,
    sc.image_url              AS catalog_image_url,
    o.sale_amount             AS sale_amount,
    o.currency                AS currency,
    o.quantity                AS quantity,
    to_json(wa_deadline.deadline_at) #>> '{}' AS deadline_at,
    CASE
      WHEN COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(o.sku), '')) IS NULL
        THEN 'no_catalog_link'
      WHEN EXISTS (
        SELECT 1
        FROM serial_units su
        LEFT JOIN locations loc ON loc.name = su.current_location
        WHERE su.organization_id = o.organization_id
          AND su.sku = COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(o.sku), ''))
          AND su.current_status = 'STOCKED'::serial_status_enum
          AND su.current_location IS NOT NULL
          AND (loc.id IS NULL OR loc.locked_for_count = false)
          AND (loc.id IS NULL OR COALESCE(loc.bin_role, 'RESERVE') NOT IN ${NON_PICKABLE_BIN_ROLES})
          AND NOT EXISTS (
            SELECT 1
            FROM order_unit_allocations oua
            WHERE oua.serial_unit_id = su.id
              AND oua.organization_id = su.organization_id
              AND oua.state <> ALL (ARRAY['RELEASED', 'RETURNED'])
          )
      ) THEN 'ready_to_allocate'
      ELSE 'no_stock'
    END                       AS blocker,
    COUNT(*) OVER ()::int     AS unallocated_count
  FROM orders o
  LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  LEFT JOIN LATERAL (
    SELECT wa.deadline_at
    FROM work_assignments wa
    WHERE wa.entity_type = 'ORDER'
      AND wa.entity_id   = o.id
      AND wa.work_type   = 'TEST'
      AND wa.organization_id = o.organization_id
    ORDER BY
      CASE wa.status
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'ASSIGNED'    THEN 2
        WHEN 'OPEN'        THEN 3
        WHEN 'DONE'        THEN 4
        ELSE 5
      END,
      wa.updated_at DESC,
      wa.id DESC
    LIMIT 1
  ) wa_deadline ON TRUE
  WHERE o.organization_id = $1
    AND COALESCE(o.status, '') <> 'shipped'
    AND NOT ${SHIPPED_BY_CARRIER_SQL}
    AND NOT EXISTS (
      SELECT 1
      FROM order_unit_allocations a2
      WHERE a2.order_id = o.id
        AND a2.organization_id = o.organization_id
        AND a2.state <> 'RELEASED'
    )
  ORDER BY wa_deadline.deadline_at ASC NULLS LAST, o.id DESC
  LIMIT 500
`;

interface PickListShortfallDbRow {
  order_id: number;
  order_number: string | null;
  sku: string | null;
  product_title: string | null;
  item_number: string | null;
  catalog_image_url: string | null;
  sale_amount: string | number | null;
  currency: string | null;
  quantity: string | null;
  deadline_at: string | null;
  blocker: string;
  unallocated_count: number;
}

interface PickListDbRow {
  allocation_id: string | null;
  order_id: number | null;
  order_number: string | null;
  sku: string | null;
  product_title: string | null;
  serial_unit_id: number | null;
  serial_number: string | null;
  grade: string | null;
  deadline_at: string | null;
  location: string | null;
  location_barcode: string | null;
  catalog_image_url: string | null;
  item_number: string | null;
  sale_amount: string | number | null;
  currency: string | null;
  quantity: string | null;
  owner_staff_id: number | null;
  owner_staff_name: string | null;
  mine_count: number;
  all_count: number;
  unpaired_count: number;
}

/**
 * `blocker` crosses the wire as text, so it is narrowed once here rather than
 * cast. An unrecognised value is treated as `no_stock`: the conservative
 * answer, because it promises the operator nothing.
 */
function narrowBlocker(raw: string): PickListBlocker {
  if (raw === 'no_catalog_link' || raw === 'ready_to_allocate') return raw;
  return 'no_stock';
}

export async function fetchPickList(args: {
  orgId: OrgId;
  staffId: number | null;
  scope: PickListScope;
}): Promise<PickListResult> {
  // Two statements, one round-trip wave: the allocations a picker can walk and
  // the order lines they cannot. Independent reads, so they run together —
  // serialising them would double the phone's time-to-first-row for no reason.
  const [allocated, shortfall] = await Promise.all([
    tenantQuery<PickListDbRow>(args.orgId, PICK_LIST_SQL, [args.orgId, args.staffId]),
    tenantQuery<PickListShortfallDbRow>(args.orgId, PICK_LIST_SHORTFALL_SQL, [args.orgId]),
  ]);
  const rows = allocated.rows;

  const counts = {
    mine: rows[0]?.mine_count ?? 0,
    all: rows[0]?.all_count ?? 0,
    unpaired: rows[0]?.unpaired_count ?? 0,
    // Exact even when LIMIT truncates the band — `COUNT(*) OVER ()`.
    unallocated: shortfall.rows[0]?.unallocated_count ?? 0,
  };

  const sourceRows: PickListSourceRow[] = [];
  for (const r of rows) {
    // The counts-only row from `LEFT JOIN live ON TRUE` when nothing is
    // allocated yet: it carries counts but no allocation.
    if (r.allocation_id == null || r.order_id == null || r.serial_unit_id == null) continue;
    sourceRows.push({
      allocationId: r.allocation_id,
      orderId: r.order_id,
      orderNumber: r.order_number ?? String(r.order_id),
      sku: r.sku,
      productTitle: r.product_title,
      serialUnitId: r.serial_unit_id,
      serialNumber: r.serial_number ?? '',
      grade: r.grade,
      deadlineAt: r.deadline_at ?? null,
      location: r.location,
      locationBarcode: r.location_barcode ?? null,
      imageUrl: String(r.catalog_image_url || '').trim() || null,
      itemNumber: r.item_number,
      saleAmount: r.sale_amount == null ? null : String(r.sale_amount),
      currency: r.currency,
      qty: Number(String(r.quantity ?? '').trim()) > 0
        ? Math.floor(Number(String(r.quantity ?? '').trim()))
        : null,
      ownerStaffId: r.owner_staff_id,
      ownerStaffName: r.owner_staff_name,
    });
  }

  return {
    scope: args.scope,
    staffId: args.staffId,
    counts,
    groups: selectPickListGroups(sourceRows, { scope: args.scope, staffId: args.staffId }),
    shortfall: shortfall.rows.map((r) => ({
      orderId: r.order_id,
      orderNumber: r.order_number ?? String(r.order_id),
      sku: r.sku,
      productTitle: r.product_title,
      itemNumber: r.item_number,
      imageUrl: String(r.catalog_image_url || '').trim() || null,
      saleAmount: r.sale_amount == null ? null : String(r.sale_amount),
      currency: r.currency,
      qty: Number(String(r.quantity ?? '').trim()) > 0
        ? Math.floor(Number(String(r.quantity ?? '').trim()))
        : null,
      deadlineAt: r.deadline_at ?? null,
      blocker: narrowBlocker(r.blocker),
    })),
  };
}
